import { Injectable } from '@angular/core';
import type { PhrasingContent, Root, RootContent } from 'mdast';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';

import type {
  RichBlockNode,
  RichInlineNode,
} from './rich-message.models';

import remarkMath from 'remark-math';
import type { RichMessageRenderState } from './rich-message.models';
import { findUnclosedMathStart } from './rich-message-math-stream.utils';

@Injectable({ providedIn: 'root' })
export class RichMessageParserService {
  private readonly processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath);

  parse(
    markdown: string,
    renderState: RichMessageRenderState = 'complete',
  ): readonly RichBlockNode[] {
    if (markdown.length === 0) {
      return [];
    }

    if (renderState !== 'streaming') {
      // Branche où le stream n'est plus en cours :
      return this.parseCompleteContent(markdown, renderState);
    }

    const incompleteMathStart = findUnclosedMathStart(markdown);

    if (incompleteMathStart === null) {
      return this.parseCompleteContent(markdown, renderState);
    }

    const completePart = markdown.slice(0, incompleteMathStart);
    const incompletePart = markdown.slice(incompleteMathStart);
    const blocks = [...this.parseCompleteContent(completePart, renderState)];

    // Une formule inline ouverte à la fin d'un paragraphe reste dans
    // ce paragraphe pour éviter de déplacer inutilement le texte précédent.
    const previousBlock = blocks.at(-1);

    if (
      incompletePart.startsWith('$') &&
      !incompletePart.startsWith('$$') &&
      previousBlock?.type === 'paragraph'
    ) {
      blocks[blocks.length - 1] = {
        type: 'paragraph',
        children: [
          ...previousBlock.children,
          { type: 'text', text: incompletePart },
        ],
      };

      return blocks;
    }

    blocks.push({
      type: 'paragraph',
      children: [{ type: 'text', text: incompletePart }],
    });

    return blocks;
  }

  private parseCompleteContent(
    markdown: string,
    renderState: RichMessageRenderState,
  ): readonly RichBlockNode[] {
    if (markdown.length === 0) {
      return [];
    }

    try {
      const root: Root = this.processor.parse(markdown);
      const referenceLinks = this.collectReferenceLinks(root);

      return root.children.flatMap((node) =>
        this.toBlock(node, markdown, referenceLinks, renderState),
      );
    } catch {
      return [{
        type: 'paragraph',
        children: [{ type: 'text', text: markdown }],
      }];
    }
  }

  private collectReferenceLinks(root: Root): ReadonlyMap<string, string> {
    const links = new Map<string, string>();

    for (const node of root.children) {
      if (node.type === 'definition') {
        links.set(this.normalizeIdentifier(node.identifier), node.url);
      }
    }

    return links;
  }

  private toBlock(
    node: RootContent,
    markdown: string,
    referenceLinks: ReadonlyMap<string, string>,
    renderState: RichMessageRenderState,
  ): RichBlockNode[] {
    switch (node.type) {
      case 'paragraph':
        return [{
          type: 'paragraph',
          children: this.toInlineNodes(node.children, markdown, referenceLinks),
        }];

      case 'heading':
        if (node.depth === 1 || node.depth === 2 || node.depth === 3) {
          return [{
            type: 'heading',
            level: node.depth,
            children: this.toInlineNodes(node.children, markdown, referenceLinks),
          }];
        }

        // Le contrat M8-01 ne prévoit que les titres de niveaux 1 à 3.
        return [{
          type: 'paragraph',
          children: this.toInlineNodes(node.children, markdown, referenceLinks),
        }];

      case 'list':
        if (
          (node.ordered && node.start !== 1) ||
          node.children.some((item) =>
            item.children.some((child) => child.type === 'list')
          )
        ) {
          return [this.asPlainTextBlock(node, markdown)];
        }

        return [{
          type: 'list',
          ordered: node.ordered === true,
          items: node.children.map((item) =>
            this.toInlineFromBlocks(
              item.children,
              markdown,
              referenceLinks,
            ),
          ),
        }];

      case 'blockquote':
        return [{
          type: 'blockquote',
          children: this.toInlineFromBlocks(
            node.children,
            markdown,
            referenceLinks,
          ),
        }];

      case 'table': {
        const [headerRow, ...dataRows] = node.children;

        if (headerRow === undefined) {
          return [this.asPlainTextBlock(node, markdown)];
        }

        return [{
          type: 'table',
          headers: headerRow.children.map((cell) =>
            this.toCellText(cell.children, markdown, referenceLinks),
          ),
          rows: dataRows.map((row) =>
            row.children.map((cell) =>
              this.toCellText(cell.children, markdown, referenceLinks),
            ),
          ),
        }];
      }
      case 'math':
        return [{
          type: 'math-block',
          source: node.value,
        }];

      case 'code': {
        const fencedCode = this.getFencedCodeStatus(node, markdown);

        if (fencedCode === null) {
          // Le périmètre M8-09 concerne les blocs délimités.
          return [this.asPlainTextBlock(node, markdown)];
        }

        return [{
          type: 'code-block',
          language: node.lang ?? null,
          code: node.value,
          isProvisional:
            renderState === 'streaming' && !fencedCode.isClosed,
        }];
      }



      case 'definition':
        // Une définition de lien est utilisée par les références, pas affichée.
        return [];


      default:
        // Code, tableaux, maths et autres formats attendent leurs tâches dédiées.
        return [this.asPlainTextBlock(node, markdown)];
    }
  }
  private toCellText(
    nodes: readonly PhrasingContent[],
    markdown: string,
    referenceLinks: ReadonlyMap<string, string>,
  ): string {
    return this.toInlineNodes(nodes, markdown, referenceLinks)
      .map((node) => this.inlineNodeToText(node))
      .join('');
  }

  private getFencedCodeStatus(
    node: Extract<RootContent, { type: 'code' }>,
    markdown: string,
  ): { readonly isClosed: boolean } | null {
    const source = this.sourceOf(node, markdown);
    const lines = source.split(/\r?\n/);
    const openingFence = /^ {0,3}(`{3,}|~{3,})/.exec(lines[0] ?? '');

    if (openingFence === null) {
      return null;
    }

    const fence = openingFence[1];
    const marker = fence[0];
    const closingFence = new RegExp(
      `^ {0,3}${marker}{${fence.length},}[ \\t]*$`,
    );

    return {
      isClosed: lines.slice(1).some((line) => closingFence.test(line)),
    };
  }

  private inlineNodeToText(node: RichInlineNode): string {
    switch (node.type) {
      case 'text':
        return node.text;

      case 'link':
        return node.label.map((child) => this.inlineNodeToText(child)).join('');

      case 'math':
        return node.source;

      case 'citation-reference':
        return `[${node.id}]`;

      case 'strong':
      case 'emphasis':
      case 'inline-code':
        return node.children
          .map((child) => this.inlineNodeToText(child))
          .join('');
    }
  }

  private toInlineFromBlocks(
    nodes: readonly RootContent[],
    markdown: string,
    referenceLinks: ReadonlyMap<string, string>,
  ): RichInlineNode[] {
    const result: RichInlineNode[] = [];

    for (const node of nodes) {
      if (result.length > 0) {
        result.push({ type: 'text', text: '\n' });
      }

      if (node.type === 'paragraph' || node.type === 'heading') {
        result.push(
          ...this.toInlineNodes(node.children, markdown, referenceLinks),
        );
      } else if (node.type === 'math') {
        result.push({
          type: 'math',
          display: 'block',
          source: node.value,
        });
      } else {
        result.push({
          type: 'text',
          text: this.sourceOf(node, markdown),
        });
      }
    }

    return result;
  }

  private toInlineNodes(
    nodes: readonly PhrasingContent[],
    markdown: string,
    referenceLinks: ReadonlyMap<string, string>,
  ): RichInlineNode[] {
    return nodes.flatMap((node): RichInlineNode[] => {
      switch (node.type) {
        case 'text':
          return [{ type: 'text', text: node.value }];

        case 'strong':
          return [{
            type: 'strong',
            children: this.toInlineNodes(
              node.children,
              markdown,
              referenceLinks,
            ),
          }];

        case 'emphasis':
          return [{
            type: 'emphasis',
            children: this.toInlineNodes(
              node.children,
              markdown,
              referenceLinks,
            ),
          }];

        case 'link':
          return [{
            type: 'link',
            href: node.url,
            label: this.toInlineNodes(
              node.children,
              markdown,
              referenceLinks,
            ),
          }];

        case 'linkReference': {
          const href = referenceLinks.get(
            this.normalizeIdentifier(node.identifier),
          );

          return href === undefined
            ? [{ type: 'text', text: this.sourceOf(node, markdown) }]
            : [{
              type: 'link',
              href,
              label: this.toInlineNodes(
                node.children,
                markdown,
                referenceLinks,
              ),
            }];
        }
        case 'inlineMath':
          return [{
            type: 'math',
            display: 'inline',
            source: node.value,
          }];

        case 'break':
          return [{ type: 'text', text: '\n' }];

        case 'html':
          return [{ type: 'text', text: node.value }];

        default:
          // Un format inline non encore pris en charge reste visible.
          return [{ type: 'text', text: this.sourceOf(node, markdown) }];
      }
    });
  }

  private asPlainTextBlock(
    node: RootContent,
    markdown: string,
  ): RichBlockNode {
    return {
      type: 'paragraph',
      children: [{
        type: 'text',
        text: this.sourceOf(node, markdown),
      }],
    };
  }

  private sourceOf(
    node: RootContent | PhrasingContent,
    markdown: string,
  ): string {
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;

    if (start === undefined || end === undefined) {
      return '';
    }

    return markdown.slice(start, end);
  }

  private normalizeIdentifier(identifier: string): string {
    return identifier.toLowerCase().replace(/\s+/g, ' ').trim();
  }
}

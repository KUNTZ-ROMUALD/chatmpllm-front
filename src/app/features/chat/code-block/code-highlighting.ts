import type { RootContent } from 'hast';
import clike from 'refractor/clike';
import cpp from 'refractor/cpp';
import css from 'refractor/css';
import java from 'refractor/java';
import javascript from 'refractor/javascript';
import markup from 'refractor/markup';
import python from 'refractor/python';
import sql from 'refractor/sql';
import typescript from 'refractor/typescript';
import { refractor } from 'refractor/core';

export interface CodeSegment {
  readonly text: string;
  readonly className: string;
}

const MAX_HIGHLIGHTED_CHARACTERS = 20_000;

// Certaines grammaires étendent des grammaires plus générales.
// L'ordre d'enregistrement est donc intentionnel.
for (const language of [
  clike,
  markup,
  css,
  javascript,
  typescript,
  python,
  java,
  sql,
  cpp,
]) {
  refractor.register(language);
}

const LANGUAGE_ALIASES: Readonly<Record<string, string>> = {
  js: 'javascript',
  javascript: 'javascript',
  ts: 'typescript',
  typescript: 'typescript',
  py: 'python',
  python: 'python',
  java: 'java',
  sql: 'sql',
  html: 'markup',
  xml: 'markup',
  markup: 'markup',
  css: 'css',
  cpp: 'cpp',
  'c++': 'cpp',
};

export function highlightCode(
  code: string,
  language: string | null,
  isProvisional: boolean,
): readonly CodeSegment[] {
  const normalizedLanguage =
    language === null
      ? null
      : LANGUAGE_ALIASES[language.trim().toLowerCase()];

  if (
    isProvisional ||
    normalizedLanguage === undefined ||
    normalizedLanguage === null ||
    code.length > MAX_HIGHLIGHTED_CHARACTERS
  ) {
    return [{ text: code, className: '' }];
  }

  try {
    const result = refractor.highlight(code, normalizedLanguage);
    const segments: CodeSegment[] = [];

    for (const node of result.children) {
      appendSegments(node, [], segments);
    }

    return segments.length > 0
      ? segments
      : [{ text: code, className: '' }];
  } catch {
    return [{ text: code, className: '' }];
  }
}

function appendSegments(
  node: RootContent,
  inheritedClasses: readonly string[],
  segments: CodeSegment[],
): void {
  if (node.type === 'text') {
    if (node.value.length > 0) {
      segments.push({
        text: node.value,
        className: inheritedClasses.join(' '),
      });
    }

    return;
  }

  if (node.type !== 'element') {
    return;
  }

  const property = node.properties['className'];
  const tokenClasses = Array.isArray(property)
    ? property
      .filter((value): value is string => typeof value === 'string')
      .filter((value) => /^[a-z][a-z\d-]*$/i.test(value))
      .map((value) => `token--${value}`)
    : [];

  const classes = [...inheritedClasses, ...tokenClasses];

  for (const child of node.children) {
    appendSegments(child, classes, segments);
  }
}

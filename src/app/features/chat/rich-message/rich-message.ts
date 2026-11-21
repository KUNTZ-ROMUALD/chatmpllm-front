import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';

import type { RichMessageRenderState } from '../rich-message.models';
import { RichMessageParserService } from '../rich-message-parser.service';
import { MathExpression } from '../math-expression/math-expression';
import { CodeBlock } from '../code-block/code-block';

@Component({
  selector: 'app-rich-message',
  imports: [NgTemplateOutlet,MathExpression,CodeBlock],
  templateUrl: './rich-message.html',
  styleUrl: './rich-message.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RichMessage {
  private readonly parser = inject(RichMessageParserService);

  readonly content = input.required<string>();
  readonly renderState = input<RichMessageRenderState>('complete');

  readonly blocks = computed(() =>
    this.parser.parse(this.content(), this.renderState()),
  );

  safeHref(href: string): string | null {
    const value = href.trim();

    if (
      value.length === 0 ||
      // Empêche notamment les obfuscations du protocole par espaces,
      // caractères de contrôle, séparateurs invisibles ou antislashs.
      /[\s\\\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f]/u.test(value) ||
      value.startsWith('//')
    ) {
      return null;
    }

    if (/^https?:\/\//i.test(value)) {
      try {
        const url = new URL(value);

        if (
          (url.protocol === 'http:' || url.protocol === 'https:') &&
          url.hostname.length > 0
        ) {
          return value;
        }
      } catch {
        return null;
      }

      return null;
    }

    if (/^mailto:/i.test(value)) {
      const address = value.slice('mailto:'.length);

      return address.length > 0 && !address.includes(':')
        ? value
        : null;
    }

    // Pas de schéma implicite ou exotique : javascript:, data:, blob:, etc.
    // Les chemins relatifs et les ancres restent autorisés.
    if (!value.includes(':')) {
      return value;
    }

    return null;
  }
}

export type RichMessageRole = 'user' | 'assistant';

export type RichMessageRenderState =
  | 'streaming'
  | 'complete'
  | 'interrupted';

export interface RichMessageMetadata {
  providerName?: string;
  modelName?: string;
}

export interface RichMessageInput {
  readonly id: string;
  readonly role: RichMessageRole;

  /** Texte brut reçu du chat ou assemblé à partir des tokens SSE. */
  readonly content: string;

  readonly renderState: RichMessageRenderState;
  readonly isPersisted: boolean;
  readonly metadata?: RichMessageMetadata;
}

export interface RichRendererOptions {
  readonly enableMarkdown: boolean;
  readonly enableTables: boolean;
  readonly enableMath: boolean;
  readonly enableCodeCopy: boolean;

  /** Le HTML fourni dans le contenu des messages n'est jamais interprété. */
  readonly allowRawHtml: false;
}

export type RichInlineNode =
  | { readonly type: 'text'; readonly text: string }
  | {
  readonly type: 'strong' | 'emphasis' | 'inline-code';
  readonly children: readonly RichInlineNode[];
}
  | {
  readonly type: 'link';
  readonly label: readonly RichInlineNode[];
  readonly href: string;
}
  | {
  readonly type: 'math';
  readonly display: 'inline' | 'block';
  readonly source: string;
}
  | {
  readonly type: 'citation-reference';
  readonly id: string;
};

export type RichBlockNode =
  | {
  readonly type: 'paragraph';
  readonly children: readonly RichInlineNode[];
}

  | {
  readonly type: 'heading';
  readonly level: 1 | 2 | 3;
  readonly children: readonly RichInlineNode[];
}
  | {
  readonly type: 'list';
  readonly ordered: boolean;
  readonly items: readonly (readonly RichInlineNode[])[];
}
  | {
  readonly type: 'blockquote';
  readonly children: readonly RichInlineNode[];
}
  | {
  readonly type: 'code-block';
  readonly language: string | null;
  readonly code: string;
  readonly isProvisional: boolean;
}
  | {
  readonly type: 'math-block';
  readonly source: string;
}
  | {
  readonly type: 'table';
  readonly headers: readonly string[];
  readonly rows: readonly (readonly string[])[];
}
  | {
  readonly type: 'citation-list';
  readonly citations: readonly {
    id: string;
    label: string;
    href: string | null;
  }[];
};

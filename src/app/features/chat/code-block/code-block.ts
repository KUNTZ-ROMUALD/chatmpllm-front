import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';

import { highlightCode } from './code-highlighting';

type CopyStatus = 'idle' | 'success' | 'error';

@Component({
  selector: 'app-code-block',
  templateUrl: './code-block.html',
  styleUrl: './code-block.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CodeBlock {
  private readonly destroyRef = inject(DestroyRef);

  private feedbackTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private copyRequestId = 0;
  private isDestroyed = false;

  readonly code = input.required<string>();
  readonly language = input<string | null>(null);
  readonly isProvisional = input(false);

  readonly copyStatus = signal<CopyStatus>('idle');

  readonly languageLabel = computed(() => {
    const label = this.language()?.trim();
    return label && label.length > 0 ? label : null;
  });

  readonly segments = computed(() =>
    highlightCode(
      this.code(),
      this.language(),
      this.isProvisional(),
    ),
  );

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.isDestroyed = true;
      this.clearFeedbackTimeout();
    });
  }

  async copyCode(): Promise<void> {
    const codeToCopy = this.code();
    const requestId = ++this.copyRequestId;

    this.clearFeedbackTimeout();
    this.copyStatus.set('idle');

    try {
      if (
        typeof navigator === 'undefined' ||
        typeof navigator.clipboard?.writeText !== 'function'
      ) {
        throw new Error('Presse-papiers indisponible');
      }

      await navigator.clipboard.writeText(codeToCopy);

      if (this.canShowCopyResult(requestId, codeToCopy)) {
        this.showTemporaryStatus('success');
      }
    } catch {
      if (this.canShowCopyResult(requestId, codeToCopy)) {
        this.showTemporaryStatus('error');
      }
    }
  }

  private canShowCopyResult(
    requestId: number,
    copiedCode: string,
  ): boolean {
    return (
      !this.isDestroyed &&
      requestId === this.copyRequestId &&
      copiedCode === this.code()
    );
  }

  private showTemporaryStatus(status: CopyStatus): void {
    this.copyStatus.set(status);

    this.feedbackTimeoutId = setTimeout(() => {
      this.feedbackTimeoutId = null;

      if (!this.isDestroyed) {
        this.copyStatus.set('idle');
      }
    }, 2_000);
  }

  private clearFeedbackTimeout(): void {
    if (this.feedbackTimeoutId !== null) {
      clearTimeout(this.feedbackTimeoutId);
      this.feedbackTimeoutId = null;
    }
  }
}

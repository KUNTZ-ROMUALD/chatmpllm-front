import { Injectable, OnDestroy, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ChatStreamBufferService implements OnDestroy {
  private readonly contentState = signal('');
  private pendingText = '';
  private scheduledFrameId: number | null = null;
  private scheduledTimeoutId: ReturnType<typeof setTimeout> | null = null;

  readonly content = this.contentState.asReadonly();

  append(fragment: string): void {
    if (fragment.length === 0) {
      return;
    }

    this.pendingText += fragment;
    this.scheduleFlush();
  }

  /**
   * Publie immédiatement les fragments encore en attente.
   */
  flush(): void {
    this.cancelScheduledFlush();
    this.flushPendingText();
  }

  /**
   * Publie le dernier fragment et retourne le contenu complet.
   */
  finalize(): string {
    this.flush();
    return this.contentState();
  }

  reset(): void {
    this.cancelScheduledFlush();
    this.pendingText = '';
    this.contentState.set('');
  }

  ngOnDestroy(): void {
    this.finalize();
  }

  private scheduleFlush(): void {
    if (
      this.scheduledFrameId !== null ||
      this.scheduledTimeoutId !== null
    ) {
      return;
    }

    if (typeof globalThis.requestAnimationFrame === 'function') {
      this.scheduledFrameId = globalThis.requestAnimationFrame(() => {
        this.scheduledFrameId = null;
        this.flushPendingText();
      });
      return;
    }

    this.scheduledTimeoutId = globalThis.setTimeout(() => {
      this.scheduledTimeoutId = null;
      this.flushPendingText();
    }, 16);
  }

  private flushPendingText(): void {
    if (this.pendingText.length === 0) {
      return;
    }

    const textToAppend = this.pendingText;
    this.pendingText = '';

    this.contentState.update((currentText) => currentText + textToAppend);
  }

  private cancelScheduledFlush(): void {
    if (
      this.scheduledFrameId !== null &&
      typeof globalThis.cancelAnimationFrame === 'function'
    ) {
      globalThis.cancelAnimationFrame(this.scheduledFrameId);
      this.scheduledFrameId = null;
    }

    if (this.scheduledTimeoutId !== null) {
      globalThis.clearTimeout(this.scheduledTimeoutId);
      this.scheduledTimeoutId = null;
    }
  }
}

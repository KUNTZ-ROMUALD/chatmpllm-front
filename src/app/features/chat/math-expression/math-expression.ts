import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  input,
  viewChild,
} from '@angular/core';
import * as katex from 'katex';

@Component({
  selector: 'app-math-expression',
  templateUrl: './math-expression.html',
  styleUrl: './math-expression.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.math-expression--block]': 'displayMode()',
  },
})
export class MathExpression {
  readonly source = input.required<string>();
  readonly displayMode = input(false);

  private readonly renderTarget =
    viewChild<ElementRef<HTMLElement>>('renderTarget');

  private readonly renderExpression = effect(() => {
    const target = this.renderTarget()?.nativeElement;
    const source = this.source();
    const displayMode = this.displayMode();

    if (target === undefined) {
      return;
    }

    try {
      // KaTeX construit son propre rendu ; le LaTeX du LLM n'est jamais
      // transmis à [innerHTML] ni déclaré « trusted ».
      katex.render(source, target, {
        displayMode,
        throwOnError: true,
        trust: false,
        strict: 'ignore',
        maxExpand: 1000,
      });
    } catch {
      target.textContent = displayMode
        ? `$$${source}$$`
        : `$${source}$`;
    }
  });
}

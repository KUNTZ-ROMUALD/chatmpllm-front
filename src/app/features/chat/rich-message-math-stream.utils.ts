/**
 * Retourne la position d'une formule ouverte non refermée.
 *
 * Cette fonction ne remplace pas remark-math : elle protège uniquement
 * l'extrémité encore incomplète d'un message en cours de streaming.
 */
export function findUnclosedMathStart(markdown: string): number | null {
  let openMath: { start: number; delimiter: '$' | '$$' } | null = null;
  let inlineCodeDelimiterLength = 0;
  let fencedCode: { marker: '`' | '~'; length: number } | null = null;
  let lineStart = 0;

  for (let index = 0; index < markdown.length;) {
    if (index === lineStart) {
      const lineEnd = markdown.indexOf('\n', index);
      const end = lineEnd === -1 ? markdown.length : lineEnd;
      const line = markdown.slice(index, end);
      const fence = /^ {0,3}(`{3,}|~{3,})/.exec(line);

      if (openMath === null && fence !== null) {
        const marker = fence[1][0] as '`' | '~';
        const length = fence[1].length;

        if (fencedCode === null) {
          fencedCode = { marker, length };
        } else if (
          marker === fencedCode.marker &&
          length >= fencedCode.length &&
          /^ {0,3}(`+|~+)[ \t]*$/.test(line)
        ) {
          fencedCode = null;
        }

        index = lineEnd === -1 ? markdown.length : lineEnd + 1;
        lineStart = index;
        continue;
      }
    }

    const character = markdown[index];

    if (character === '\n') {
      lineStart = index + 1;
      index++;
      continue;
    }

    if (fencedCode !== null) {
      index++;
      continue;
    }

    if (character === '\\') {
      index += Math.min(2, markdown.length - index);
      continue;
    }

    if (openMath === null && character === '`') {
      let runLength = 1;
      while (markdown[index + runLength] === '`') {
        runLength++;
      }

      if (inlineCodeDelimiterLength === 0) {
        inlineCodeDelimiterLength = runLength;
      } else if (inlineCodeDelimiterLength === runLength) {
        inlineCodeDelimiterLength = 0;
      }

      index += runLength;
      continue;
    }

    if (inlineCodeDelimiterLength > 0 || character !== '$') {
      index++;
      continue;
    }

    const delimiter: '$' | '$$' =
      markdown[index + 1] === '$' ? '$$' : '$';

    if (openMath !== null) {
      if (delimiter === openMath.delimiter) {
        openMath = null;
      }

      index += delimiter.length;
      continue;
    }

    const nextCharacter = markdown[index + delimiter.length];

    // Un dollar suivi d'un espace n'ouvre pas une formule inline.
    // Un délimiteur en toute fin de stream reste provisoirement ouvert.
    if (
      delimiter === '$' &&
      nextCharacter !== undefined &&
      /\s/.test(nextCharacter)
    ) {
      index++;
      continue;
    }

    openMath = { start: index, delimiter };
    index += delimiter.length;
  }

  return openMath?.start ?? null;
}

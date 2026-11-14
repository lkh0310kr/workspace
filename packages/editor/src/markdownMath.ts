import { tags } from '@lezer/highlight'
import type { MarkdownConfig } from '@lezer/markdown'

function isEscaped(text: string, from: number): boolean {
  let slashes = 0
  for (let index = from - 1; index >= 0 && text[index] === '\\'; index--) slashes++
  return slashes % 2 === 1
}

function findClose(text: string, start: number, delimiter: '$' | '\\)', end: number): number {
  for (let index = start; index < end; index++) {
    if (text[index] === '`' || text[index] === '\n') return -1
    if (delimiter === '$' && text[index + 1] === '$') {
      index++
      continue
    }
    if (text.startsWith(delimiter, index) && !isEscaped(text, index)) return index
  }
  return -1
}

export const markdownMathExtension: MarkdownConfig = {
  defineNodes: [
    { name: 'InlineMath', style: tags.special(tags.content) },
    { name: 'MathMark', style: tags.processingInstruction },
    { name: 'MathContent', style: tags.content }
  ],
  parseInline: [
    {
      name: 'InlineMath',
      before: 'Escape',
      parse(cx, next, pos) {
        if (cx.hasOpenLink) return -1
        const localPos = pos - cx.offset
        const localEnd = cx.end - cx.offset
        const isDollar =
          next === 36 &&
          cx.char(pos + 1) !== 36 &&
          cx.char(pos - 1) !== 36 &&
          !isEscaped(cx.text, localPos)
        const isParen = next === 92 && cx.char(pos + 1) === 40
        if (!isDollar && !isParen) return -1
        if (isParen && isEscaped(cx.text, localPos)) return -1

        const markerLength = isDollar ? 1 : 2
        const closeLocal = isDollar
          ? findClose(cx.text, localPos + markerLength, '$', localEnd)
          : findClose(cx.text, localPos + markerLength, '\\)', localEnd)
        const close = closeLocal + cx.offset
        if (closeLocal <= localPos + markerLength) return -1
        const contentStart = pos + markerLength
        const contentEnd = close
        if (
          /\s/.test(cx.slice(contentStart, contentStart + 1)) ||
          /\s/.test(cx.slice(contentEnd - 1, contentEnd))
        )
          return -1
        const closeLength = isDollar ? 1 : 2
        const end = close + closeLength
        return cx.addElement(
          cx.elt('InlineMath', pos, end, [
            cx.elt('MathMark', pos, contentStart),
            cx.elt('MathContent', contentStart, contentEnd),
            cx.elt('MathMark', close, end)
          ])
        )
      }
    }
  ]
}

import { cellWidth, truncate } from '../hooks/format'

// A text renderer for what `ui.drawn()` returns, to look at a row at a given
// width. The kit paints nothing, so this lays the tree out the way a terminal
// would, close enough to see a stamp that crowds its body or runs past the edge:
//
// - Box: a column stacks its children; a row (the default) sets them side by
//   side, a child with a `width` at that width, one with `flexGrow` taking what
//   is left, any other at its natural width. `marginLeft` and `marginRight` count.
// - Text wraps at spaces, or is cut with `…` for `wrap: 'truncate-end'`.
//
// Style (color, dim) is not drawn: assert on props for that. A line wider than
// the room is kept whole, so `overflow` can find it.

export type Tree =
  string | { type?: string; props?: Record<string, unknown>; children?: Tree[] }

type Element = Exclude<Tree, string>

const number = (node: Element, name: string) => {
  const value = node.props?.[name]

  return typeof value === 'number' ? value : 0
}

const inline = (node: Tree): string =>
  typeof node === 'string' ? node : (node.children ?? []).map(inline).join('')

// Cuts a word wider than the line into pieces that fit it.
function pieces(word: string, width: number): string[] {
  const parts: string[] = []
  let part = ''
  for (const char of word) {
    if (part !== '' && cellWidth(part + char) > width) {
      parts.push(part)
      part = ''
    }
    part += char
  }

  return [...parts, part]
}

function wrap(text: string, width: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(' ')) {
    for (const part of cellWidth(word) > width ? pieces(word, width) : [word]) {
      const next = line === '' ? part : `${line} ${part}`
      if (line === '' || cellWidth(next) <= width) {
        line = next
      } else {
        lines.push(line)
        line = part
      }
    }
  }

  return [...lines, line]
}

const padEnd = (text: string, width: number) =>
  text + ' '.repeat(Math.max(0, width - cellWidth(text)))

/** The lines a tree takes in `width` cells. */
export function layout(node: Tree, width: number): string[] {
  if (typeof node === 'string') return wrap(node, width)

  if (node.type === 'Text') {
    const text = inline(node)
    const wrapMode = node.props?.wrap

    return typeof wrapMode === 'string' && wrapMode.startsWith('truncate')
      ? [truncate(text, width)]
      : wrap(text, width)
  }

  const children = node.children ?? []
  if (node.props?.flexDirection === 'column') {
    return children.flatMap(child => layout(child, width))
  }

  // A row: fixed and natural children first, then the growing one takes the rest.
  const margins = (child: Tree) =>
    typeof child === 'string'
      ? 0
      : number(child, 'marginLeft') + number(child, 'marginRight')
  const widths = children.map(child => {
    if (typeof child === 'string') return cellWidth(child)
    if (number(child, 'width') > 0) return number(child, 'width')
    if (number(child, 'flexGrow') > 0) return -1

    return Math.max(0, ...layout(child, Infinity).map(cellWidth))
  })
  const used = widths.reduce(
    (sum, one, at) => sum + Math.max(0, one) + margins(children[at] ?? ''),
    0,
  )
  const blocks = children.map((child, at) => {
    const room =
      widths[at] === -1 ? Math.max(0, width - used) : (widths[at] ?? 0)
    const lines = layout(child, room).map(line => padEnd(line, room))
    const left = typeof child === 'string' ? 0 : number(child, 'marginLeft')
    const right = typeof child === 'string' ? 0 : number(child, 'marginRight')

    return lines.map(line => ' '.repeat(left) + line + ' '.repeat(right))
  })

  const height = Math.max(1, ...blocks.map(block => block.length))

  return Array.from({ length: height }, (_, row) =>
    blocks
      .map(block => block[row] ?? ' '.repeat(cellWidth(block[0] ?? '')))
      .join(''),
  ).map(line => line.trimEnd())
}

/** The lines wider than `width`. */
export function overflow(lines: readonly string[], width: number): string[] {
  return lines.filter(line => cellWidth(line) > width)
}

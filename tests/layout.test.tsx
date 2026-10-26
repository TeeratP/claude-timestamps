import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, RenderSurface } from 'claude-code'

import {
  EVERY_SURFACE,
  MINUTE,
  NOW,
  PROPS,
  TRANSCRIPT,
  begin,
  boot,
  mountRow,
  start,
  transcript,
} from './fakes'
import type { Drawing, RowComponent } from './fakes'
import { layout, overflow } from './render'
import type { Tree } from './render'

// A body long enough to wrap in every width tried here.
const BODY = `engine ${'word '.repeat(40)}end`
const START = 'engine'

// Local times, so the stamps read the same in every zone.
const TWO_DAYS_AGO = new Date(2026, 9, 24, 8, 12).getTime()
const YEAR_AGO = new Date(2025, 8, 21, 9, 12).getTime()

// Rows of every component at ages that read differently: now, minutes, days and a
// year, and one the mod never saw appended, which reads with a tilde.
const HISTORY = transcript([
  { uuid: 'u-1', at: TWO_DAYS_AGO, type: 'user' },
  { uuid: 'a-1', at: NOW - 3 * MINUTE, type: 'assistant' },
  {
    uuid: 'c-1',
    at: YEAR_AGO,
    type: 'assistant',
    content: [{ type: 'tool_use', id: 'toolu_1', name: 'Bash', input: {} }],
  },
  {
    uuid: 'r-1',
    at: NOW - 30 * MINUTE,
    type: 'user',
    content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'ok' }],
  },
  { uuid: 'cmd-1', at: NOW, type: 'user' },
])

const ROWS = [
  ['UserMessage', 'u-1'],
  ['AssistantMessage', 'a-1'],
  ['ToolUse', 'toolu_1'],
  ['ToolResult', 'toolu_1'],
  ['ToolGroup', 'group-1'],
  ['CommandOutput', 'cmd-1'],
  ['AssistantMessage', 'never-appended'],
] as const satisfies readonly (readonly [RowComponent, string])[]

type Drawn = { lines: string[]; tree: Exclude<Tree, string> }

// Every row in `columns` cells, laid out.
async function drawAll(
  $: Engine,
  columns: number,
  surface: RenderSurface,
): Promise<Drawn[]> {
  const drawn: Drawn[] = []
  for (const [component, id] of ROWS) {
    const ui = await mountRow($, component, id, {
      surface,
      columns,
      props: component === 'ToolGroup' ? PROPS.ToolGroup : undefined,
    })
    const tree = (await ui.drawn()) as Exclude<Tree, string>
    drawn.push({ tree, lines: layout(tree, columns) })
    await ui.unmount()
  }

  return drawn
}

// A resumed session, with the unknown row drawn once so that its guess is made.
async function ready($: Engine, on: On, drawing?: Drawing) {
  const { clock } = boot(on, {
    files: { [TRANSCRIPT]: HISTORY },
    row: BODY,
    drawing,
  })
  await start($)
  await begin($, 'resume')
  await clock.settle()
  const guess = await mountRow($, 'AssistantMessage', 'never-appended')
  await clock.settle()
  await guess.unmount()
}

// The column the body starts at in a drawn row: where the engine's own text begins.
const bodyColumn = (lines: readonly string[]) =>
  lines.find(line => line.includes(START))?.indexOf(START) ?? -1

const child = (tree: Exclude<Tree, string>, at: number) => {
  const one = tree.children?.[at]

  return typeof one === 'string' ? undefined : one
}

// The stamp column of a drawn row, wherever it stands: the child with a width.
const columnOf = (tree: Exclude<Tree, string>) =>
  [child(tree, 0), child(tree, 1)].find(one => one?.props?.width !== undefined)

// The words of the stamp in a drawn row.
const stampText = (tree: Exclude<Tree, string>) => {
  const text = child(columnOf(tree) ?? tree, 0)

  return (text?.children ?? []).join('')
}

// How wide the stamp column of a drawn row is.
const widthOf = (tree: Exclude<Tree, string>) => columnOf(tree)?.props?.width

const BOTH = { options: { show: 'both' } } as const

// The stamp column of each row in ROWS, with the age on: the format's own width, or a
// row's own, for a date it carries and the room allows.
const BOTH_WIDTHS = [
  [120, [21, 17, 21, 17, 21, 17, 17]],
  [80, [17, 17, 17, 17, 17, 17, 17]],
  [70, [17, 17, 17, 17, 17, 17, 17]],
] as const

for (const surface of EVERY_SURFACE) {
  for (const [columns, widths] of BOTH_WIDTHS) {
    test(
      `left at ${columns} columns on the ${surface}: each body starts a cell after its stamp column and nothing overflows`,
      BOTH,
      async ($, on) => {
        await ready($, on)

        const rows = await drawAll($, columns, surface)

        expect(rows.map(row => widthOf(row.tree))).toEqual(widths)
        for (const { lines, tree } of rows) {
          const width = Number(widthOf(tree))
          expect(overflow(lines, columns)).toEqual([])
          // The stamp column, a cell between, then the body.
          expect(bodyColumn(lines)).toBe(width + 1)
          // Wrapped body lines hang under the first, after the stamp column.
          expect(lines.length).toBeGreaterThan(2)
          for (const line of lines.slice(1)) {
            expect(line.slice(0, width + 1).trim()).toBe('')
            expect(line.slice(width + 1).length).toBeGreaterThan(0)
          }
        }
      },
    )
  }

  test(`left with the default format takes a column as wide as its stamp, at 120 and 80 columns on the ${surface}`, async ($, on) => {
    await ready($, on)

    for (const columns of [120, 80]) {
      const rows = await drawAll($, columns, surface)
      // `~09:12` is the widest a stamp reads on its own: 6 cells, the body at 7.
      // A row with a date, `Oct 24 08:12`, takes 12, the body at 13.
      expect(rows.map(row => widthOf(row.tree))).toEqual([
        12, 6, 12, 6, 12, 6, 6,
      ])
      for (const { lines } of rows) {
        expect(overflow(lines, columns)).toEqual([])
      }
      expect(rows.map(row => bodyColumn(row.lines))).toEqual([
        13, 7, 13, 7, 13, 7, 7,
      ])
    }
  })
}

test('the stamps read their own form, and a row without a date shares the narrow column', async ($, on) => {
  await ready($, on)

  const rows = await drawAll($, 120, 'terminal')

  expect(rows.map(row => stampText(row.tree))).toEqual([
    'Oct 24 08:12',
    '09:09',
    'Sep 21 09:12',
    '08:42',
    'Sep 21 09:12',
    '09:12',
    '~09:12',
  ])
  expect(rows.map(row => bodyColumn(row.lines))).toEqual([
    13, 7, 13, 7, 13, 7, 7,
  ])
})

for (const surface of EVERY_SURFACE) {
  for (const columns of [69, 50, 30]) {
    test(
      `above at ${columns} columns on the ${surface}: a dim line over the row, cut to fit`,
      BOTH,
      async ($, on) => {
        await ready($, on)

        const rows = await drawAll($, columns, surface)

        for (const { lines, tree } of rows) {
          expect(overflow(lines, columns)).toEqual([])
          // The stamp on a line of its own, the engine's row under it, from the left edge.
          expect(lines[0]?.includes(START)).toBe(false)
          expect(lines[1]?.startsWith(START)).toBe(true)
          expect(child(tree, 0)?.props).toMatchObject({
            dimColor: true,
            wrap: 'truncate-end',
          })
        }
      },
    )
  }
}

test(
  'on mobile the stamp goes above the row at any width',
  BOTH,
  async ($, on) => {
    await ready($, on)

    for (const columns of [120, 40]) {
      const rows = await drawAll($, columns, 'mobile')
      for (const { lines } of rows) {
        expect(overflow(lines, columns)).toEqual([])
        expect(lines[1]?.startsWith(START)).toBe(true)
      }
    }
  },
)

test('above keeps the date and the age while they fit', BOTH, async ($, on) => {
  await ready($, on)

  const rows = await drawAll($, 50, 'terminal')

  expect(rows.map(row => row.lines[0])).toEqual([
    'Oct 24 08:12 · 2d ago',
    '09:09 · 3m ago',
    'Sep 21 09:12 · 1y ago',
    '08:42 · 30m ago',
    'Sep 21 09:12 · 1y ago',
    '09:12 · now',
    '~09:12 · now',
  ])
})

test(
  'above drops the date first, then the age, then cuts the clock',
  BOTH,
  async ($, on) => {
    await ready($, on)

    // Fits the clock and the age, not the date.
    const noDate = await drawAll($, 15, 'terminal')
    expect(noDate[0]?.lines[0]).toBe('08:12 · 2d ago')
    // Fits the clock only.
    const clock = await drawAll($, 12, 'terminal')
    expect(clock[0]?.lines[0]).toBe('08:12')
    // Not even that.
    const cut = await drawAll($, 4, 'terminal')
    expect(cut[0]?.lines[0]).toBe('08:…')
    for (const columns of [15, 12, 4]) {
      for (const { lines } of await drawAll($, columns, 'terminal')) {
        expect(overflow(lines, columns)).toEqual([])
      }
    }
  },
)

for (const [columns, widths] of [
  ...BOTH_WIDTHS.slice(0, 2),
  [50, [12, 12, 12, 12, 12, 12, 12]],
] as const) {
  test(
    `right at ${columns} columns: the body first, the stamp column after it, as wide as its stamp`,
    { options: { show: 'both', placement: 'right' } },
    async ($, on) => {
      await ready($, on)

      const rows = await drawAll($, columns, 'terminal')

      expect(rows.map(row => child(row.tree, 1)?.props?.width)).toEqual(widths)
      for (const { lines } of rows) {
        expect(overflow(lines, columns)).toEqual([])
        expect(bodyColumn(lines)).toBe(0)
      }
    },
  )
}

test(
  'a left column on a narrow screen is held to a quarter of it and never overflows',
  { options: { show: 'both', placement: 'left' } },
  async ($, on) => {
    await ready($, on)

    for (const columns of [40, 30, 20]) {
      const rows = await drawAll($, columns, 'terminal')
      for (const { lines } of rows) {
        expect(overflow(lines, columns)).toEqual([])
        expect(bodyColumn(lines)).toBe(Math.floor(columns / 4) + 1)
      }
    }
    // Under 5 cells a column says nothing: the stamp goes above.
    const tiny = await drawAll($, 16, 'terminal')
    for (const { lines } of tiny) expect(lines[1]?.startsWith(START)).toBe(true)
  },
)

for (const placement of ['auto', 'left', 'right', 'above'] as const) {
  test(
    `a long format never overflows at 30, 50, 80 or 120 columns, placed ${placement}`,
    { options: { show: 'both', style: 'iso', placement } },
    async ($, on) => {
      await ready($, on)

      for (const columns of [30, 50, 80, 120]) {
        for (const surface of EVERY_SURFACE) {
          for (const { lines } of await drawAll($, columns, surface)) {
            expect(overflow(lines, columns)).toEqual([])
          }
        }
      }
    },
  )
}

// The engine's own drawing of a row as `next(e)` can hand it back, and the blank
// rows it starts with: the stamp has to skip as many to sit on the first line of text.
const DRAWINGS = [
  ['a top margin of 1', { marginTop: 1 }, 1],
  ['a top padding of 1', { paddingTop: 1 }, 1],
  ['a margin and a padding of 1 each', { marginTop: 1, paddingTop: 1 }, 2],
  ['a top margin of 0', { marginTop: 0 }, 0],
  ['no top margin or padding', {}, 0],
] as const

for (const [name, drawing, top] of DRAWINGS) {
  for (const surface of EVERY_SURFACE) {
    test(
      `left: the stamp is on the first row of text when the engine draws ${name}, on the ${surface}`,
      { options: { placement: 'left' } },
      async ($, on) => {
        await ready($, on, drawing)

        for (const columns of [30, 80, 120]) {
          for (const { lines, tree } of await drawAll($, columns, surface)) {
            const stamp = stampText(tree)
            expect(overflow(lines, columns)).toEqual([])
            // The blank rows, then the first row of text.
            expect(lines.findIndex(line => line.includes(START))).toBe(top)
            expect(lines.slice(0, top)).toEqual(Array(top).fill(''))
            // The stamp on that row and no other, at the left edge.
            expect(lines[top]?.startsWith(stamp)).toBe(true)
            expect(lines.filter(line => line.includes(stamp))).toHaveLength(1)
            // The body a cell after the stamp column, mirrored margin and all.
            expect(bodyColumn(lines)).toBe(Number(widthOf(tree)) + 1)
            expect(columnOf(tree)?.props?.marginTop ?? 0).toBe(top)
          }
        }
      },
    )
  }
}

for (const [name, drawing, top] of [DRAWINGS[0], DRAWINGS[4]]) {
  test(
    `right: the stamp is on the first row of text when the engine draws ${name}`,
    { options: { placement: 'right' } },
    async ($, on) => {
      await ready($, on, drawing)

      for (const columns of [80, 120]) {
        for (const { lines, tree } of await drawAll($, columns, 'terminal')) {
          const stamp = stampText(tree)
          expect(overflow(lines, columns)).toEqual([])
          expect(lines.findIndex(line => line.includes(START))).toBe(top)
          expect(lines[top]?.endsWith(stamp)).toBe(true)
          expect(lines.filter(line => line.includes(stamp))).toHaveLength(1)
          expect(columnOf(tree)?.props?.marginTop ?? 0).toBe(top)
        }
      }
    },
  )
}

test('above puts the stamp over a drawing that starts with a blank row, whole', async ($, on) => {
  await ready($, on, { marginTop: 1 })

  for (const { lines, tree } of await drawAll($, 50, 'terminal')) {
    expect(overflow(lines, 50)).toEqual([])
    expect(child(tree, 0)?.props).toMatchObject({ wrap: 'truncate-end' })
    expect(lines.findIndex(line => line.includes(START))).toBe(2)
  }
})

// Rows the engine draws behind its opaque node, `{ type: 'engine', ref }`: a hook
// cannot read their margin, so the stamp skips the rows measured for the component
// in Claude Code 2.1.310, in ROWS order.
const MEASURED = [1, 1, 1, 0, 1, 0, 1]

test('behind the engine node the stamp skips the rows measured for each component, on the terminal', async ($, on) => {
  await ready($, on, 'engine')

  for (const columns of [80, 120]) {
    const rows = await drawAll($, columns, 'terminal')

    expect(rows.map(row => columnOf(row.tree)?.props?.marginTop ?? 0)).toEqual(
      MEASURED,
    )
    for (const { lines } of rows) expect(overflow(lines, columns)).toEqual([])
  }
})

test('behind the engine node the stamp is not moved on the desktop, which was not measured', async ($, on) => {
  await ready($, on, 'engine')

  const rows = await drawAll($, 120, 'desktop')

  expect(rows.map(row => columnOf(row.tree)?.props?.marginTop)).toEqual(
    rows.map(() => undefined),
  )
})

test('the layout check puts a top margin and padding above a Box', () => {
  const tree = {
    type: 'Box',
    props: { flexDirection: 'row' },
    children: [
      { type: 'Box', props: { width: 5, marginTop: 1 }, children: ['x'] },
      {
        type: 'Box',
        props: { flexGrow: 1, paddingTop: 2 },
        children: ['body'],
      },
    ],
  } satisfies Tree

  expect(layout(tree, 20)).toEqual(['', 'x', '     body'])
})

test('the layout check finds a line that runs past the edge', () => {
  const tree = {
    type: 'Box',
    props: { flexDirection: 'row' },
    children: [
      { type: 'Box', props: { width: 30, flexShrink: 0 }, children: ['x'] },
      { type: 'Box', props: { flexGrow: 1 }, children: ['body'] },
    ],
  } satisfies Tree

  expect(overflow(layout(tree, 20), 20)).toHaveLength(1)
  expect(overflow(layout(tree, 40), 40)).toEqual([])
})

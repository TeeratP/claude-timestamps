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
import type { RowComponent } from './fakes'
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
async function ready($: Engine, on: On) {
  const { clock } = boot(on, { files: { [TRANSCRIPT]: HISTORY }, row: BODY })
  await start($)
  await begin($, 'resume')
  await clock.settle()
  const guess = await mountRow($, 'AssistantMessage', 'never-appended')
  await clock.settle()
  await guess.unmount()
}

// The column the body starts at in a drawn row: where the engine's own text begins.
const bodyColumn = (lines: readonly string[]) => lines[0]?.indexOf(START) ?? -1

const child = (tree: Exclude<Tree, string>, at: number) => {
  const one = tree.children?.[at]

  return typeof one === 'string' ? undefined : one
}

// The words of the stamp in a drawn row, wherever it stands.
const stampText = (tree: Exclude<Tree, string>) => {
  const column = child(tree, 0)
  const text = column?.props?.width === undefined ? column : child(column, 0)

  return (text?.children ?? []).join('')
}

const BOTH = { options: { show: 'both' } } as const

for (const surface of EVERY_SURFACE) {
  for (const [columns, width] of [
    [120, 22],
    [80, 20],
    [70, 17],
  ] as const) {
    test(
      `left at ${columns} columns on the ${surface}: every body starts at one column and nothing overflows`,
      BOTH,
      async ($, on) => {
        await ready($, on)

        const rows = await drawAll($, columns, surface)

        for (const { lines } of rows) {
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
        // One width for every row, whatever its stamp reads.
        const widths = rows.map(row => child(row.tree, 0)?.props?.width)
        expect(widths).toEqual(rows.map(() => width))
      },
    )
  }

  test(`left with the default format takes a narrower column, at 120 and 80 columns on the ${surface}`, async ($, on) => {
    await ready($, on)

    for (const columns of [120, 80]) {
      const rows = await drawAll($, columns, surface)
      for (const { lines } of rows) {
        expect(overflow(lines, columns)).toEqual([])
        // `~`, `Oct 24 ` and `08:12`: the longest stamp the format can make.
        expect(bodyColumn(lines)).toBe(13 + 1)
      }
    }
  })
}

test('the stamps read their own form but take the same column', async ($, on) => {
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
  expect(new Set(rows.map(row => bodyColumn(row.lines)))).toEqual(new Set([14]))
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

for (const columns of [120, 80, 50]) {
  test(
    `right at ${columns} columns: the body first, the stamp column after it, one column for every row`,
    { options: { show: 'both', placement: 'right' } },
    async ($, on) => {
      await ready($, on)

      const rows = await drawAll($, columns, 'terminal')

      const width = Math.min(22, Math.floor(columns / 4))
      for (const { lines, tree } of rows) {
        expect(overflow(lines, columns)).toEqual([])
        expect(bodyColumn(lines)).toBe(0)
        expect(child(tree, 1)?.props?.width).toBe(width)
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

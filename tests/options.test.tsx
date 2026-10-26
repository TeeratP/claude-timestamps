import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import {
  EVERY_SURFACE,
  HOUR,
  MINUTE,
  NOW,
  TRANSCRIPT,
  begin,
  boot,
  mountRow,
  stampOf,
  start,
  styleOf,
  transcript,
} from './fakes'
import type { RowComponent } from './fakes'

// A resumed session whose rows are stamped as the transcript says.
async function resumed(
  $: Engine,
  on: On,
  rows: Parameters<typeof transcript>[0],
) {
  const { clock } = boot(on, { files: { [TRANSCRIPT]: transcript(rows) } })
  await start($)
  await begin($, 'resume')
  await clock.settle()
}

async function stampedAt(
  $: Engine,
  id: string,
  surface: (typeof EVERY_SURFACE)[number] = 'terminal',
) {
  const ui = await mountRow($, 'UserMessage', id, { surface })
  const stamp = await stampOf(ui)
  await ui.unmount()

  return stamp
}

const AT = (hour: number, minute = 0) =>
  new Date(2026, 9, 26, hour, minute, 7).getTime()

const STYLES = [
  ['time', '09:12'],
  ['time+seconds', '09:12:07'],
  ['12h', '9:12 AM'],
  ['12h+seconds', '9:12:07 AM'],
  ['date+time', 'Oct 26 09:12'],
  ['iso', '2026-10-26T09:12:07'],
] as const

for (const [style, expected] of STYLES) {
  for (const surface of EVERY_SURFACE) {
    test(
      `the ${style} style reads ${expected}, on the ${surface}`,
      { options: { style } },
      async ($, on) => {
        await resumed($, on, [{ uuid: 'u-1', at: AT(9, 12) }])

        expect(await stampedAt($, 'u-1', surface)).toBe(expected)
      },
    )
  }
}

test(
  'the custom style reads the pattern',
  {
    options: {
      style: 'custom',
      pattern: 'ddd DD MMM, h:mm a',
      placement: 'above',
    },
  },
  async ($, on) => {
    await resumed($, on, [{ uuid: 'u-1', at: AT(21, 5) }])

    expect(await stampedAt($, 'u-1')).toBe('Mon 26 Oct, 9:05 PM')
  },
)

test(
  'a pattern wider than the column is cut to it',
  { options: { style: 'custom', pattern: 'ddd, DD MMM YYYY h:mm a' } },
  async ($, on) => {
    await resumed($, on, [{ uuid: 'u-1', at: AT(21, 5) }])

    // 24 cells to read, 22 to give: the column is capped.
    expect(await stampedAt($, 'u-1')).toBe('Mon, 26 Oct 2026 9:05…')
  },
)

test(
  'a custom style with an empty pattern reads the default one',
  { options: { style: 'custom', pattern: '' } },
  async ($, on) => {
    await resumed($, on, [{ uuid: 'u-1', at: AT(21, 5) }])

    expect(await stampedAt($, 'u-1')).toBe('21:05')
  },
)

test(
  'a value that is not one of the choices is the default',
  { options: { style: 'roman', show: 'ago', color: 'rainbow' } },
  async ($, on) => {
    await resumed($, on, [{ uuid: 'u-1', at: AT(9, 12) }])
    const ui = await mountRow($, 'UserMessage', 'u-1')

    expect(await stampOf(ui)).toBe('09:12')
    expect(await styleOf(ui)).toMatchObject({ dimColor: true })
    await ui.unmount()
  },
)

// Rows 13 hours, 11 hours, 3 days and 8 days before the 09:12 of the 26th.
const DATED = [
  { uuid: 'u-13h', at: NOW - 13 * HOUR },
  { uuid: 'u-11h', at: NOW - 11 * HOUR },
  { uuid: 'u-3d', at: NOW - 3 * 24 * HOUR },
  { uuid: 'u-8d', at: NOW - 8 * 24 * HOUR },
  { uuid: 'u-now', at: NOW },
] as const

async function dates($: Engine) {
  const out: Record<string, boolean> = {}
  for (const { uuid } of DATED) {
    out[uuid] = /[A-Z][a-z]{2} \d\d /.test((await stampedAt($, uuid)) ?? '')
  }

  return out
}

test('the date shows on a row from another day by default', async ($, on) => {
  await resumed($, on, DATED)

  // 11 hours before 09:12 is 22:12 the day before.
  expect(await dates($)).toEqual({
    'u-13h': true,
    'u-11h': true,
    'u-3d': true,
    'u-8d': true,
    'u-now': false,
  })
})

test(
  'the date shows on a row older than 12 hours',
  { options: { showDate: '12h' } },
  async ($, on) => {
    await resumed($, on, DATED)

    expect(await dates($)).toEqual({
      'u-13h': true,
      'u-11h': false,
      'u-3d': true,
      'u-8d': true,
      'u-now': false,
    })
  },
)

test(
  'the date shows on a row older than 24 hours',
  { options: { showDate: '24h' } },
  async ($, on) => {
    await resumed($, on, DATED)

    expect(await dates($)).toEqual({
      'u-13h': false,
      'u-11h': false,
      'u-3d': true,
      'u-8d': true,
      'u-now': false,
    })
  },
)

test(
  'the date shows on a row older than 7 days',
  { options: { showDate: '7d' } },
  async ($, on) => {
    await resumed($, on, DATED)

    expect(await dates($)).toEqual({
      'u-13h': false,
      'u-11h': false,
      'u-3d': false,
      'u-8d': true,
      'u-now': false,
    })
  },
)

test(
  'the date shows on every row',
  { options: { showDate: 'always' } },
  async ($, on) => {
    await resumed($, on, DATED)

    expect(Object.values(await dates($))).toEqual([
      true,
      true,
      true,
      true,
      true,
    ])
  },
)

test(
  'the date shows on none',
  { options: { showDate: 'never' } },
  async ($, on) => {
    await resumed($, on, DATED)

    expect(Object.values(await dates($))).toEqual([
      false,
      false,
      false,
      false,
      false,
    ])
  },
)

test(
  'the date setting leaves the styles that carry a date, and a custom pattern, alone',
  { options: { style: 'date+time', showDate: 'never' } },
  async ($, on) => {
    await resumed($, on, DATED)

    expect(await stampedAt($, 'u-now')).toBe('Oct 26 09:12')
  },
)

const FIVE_AGO = [{ uuid: 'u-1', at: NOW - 5 * MINUTE }] as const

for (const [show, expected] of [
  ['time', '09:07'],
  ['age', '5m ago'],
  ['both', '09:07 · 5m ago'],
] as const) {
  test(
    `show ${show} reads ${expected}`,
    { options: { show } },
    async ($, on) => {
      await resumed($, on, FIVE_AGO)

      expect(await stampedAt($, 'u-1')).toBe(expected)
    },
  )
}

const EVERY_ROW = [
  'UserMessage',
  'AssistantMessage',
  'ToolUse',
  'ToolResult',
  'ToolGroup',
  'CommandOutput',
] as const satisfies readonly RowComponent[]

async function stamped($: Engine) {
  const found: RowComponent[] = []
  for (const component of EVERY_ROW) {
    const ui = await mountRow($, component, 'toolu_1')
    if ((await stampOf(ui)) !== undefined) found.push(component)
    await ui.unmount()
  }

  return found
}

for (const [rows, expected] of [
  ['all', EVERY_ROW],
  ['conversation', ['UserMessage', 'AssistantMessage']],
  ['prompts', ['UserMessage']],
  ['no-tools', ['UserMessage', 'AssistantMessage', 'CommandOutput']],
] as const) {
  test(
    `rows ${rows} stamps ${expected.join(', ')}`,
    { options: { rows } },
    async ($, on) => {
      await resumed($, on, [
        { uuid: 'toolu_1', at: NOW },
        {
          uuid: 'r-1',
          at: NOW,
          content: [
            { type: 'tool_result', tool_use_id: 'toolu_1', content: 'ok' },
          ],
        },
      ])

      expect(await stamped($)).toEqual(expected)
    },
  )
}

test(
  'a row that is not stamped is drawn as the engine draws it',
  { options: { rows: 'prompts' } },
  async ($, on) => {
    await resumed($, on, [{ uuid: 'a-1', at: NOW }])
    const ui = await mountRow($, 'AssistantMessage', 'a-1')

    expect(await ui.drawn()).toMatchObject({
      type: 'Text',
      children: ['engine row'],
    })
    await ui.unmount()
  },
)

const HOURS = [
  { uuid: 'night-3', at: AT(3) },
  { uuid: 'morning-9', at: AT(9) },
  { uuid: 'afternoon-15', at: AT(15) },
  { uuid: 'evening-20', at: AT(20) },
  { uuid: 'night-23', at: AT(23) },
] as const

async function styles($: Engine) {
  const out: Record<string, unknown> = {}
  for (const { uuid } of HOURS) {
    const ui = await mountRow($, 'UserMessage', uuid)
    out[uuid] = await styleOf(ui)
    await ui.unmount()
  }

  return out
}

test("dim colours the stamp with the theme's dim", async ($, on) => {
  await resumed($, on, HOURS)

  for (const style of Object.values(await styles($))) {
    expect(style).toEqual({ dimColor: true, wrap: 'truncate-end' })
  }
})

test(
  "subtle colours the stamp with the theme's subtle colour",
  { options: { color: 'subtle' } },
  async ($, on) => {
    await resumed($, on, HOURS)

    for (const style of Object.values(await styles($))) {
      expect(style).toEqual({ color: 'subtle', wrap: 'truncate-end' })
    }
  },
)

test(
  'time-of-day colours the stamp by its hour, in four bands, dimmed',
  { options: { color: 'time-of-day' } },
  async ($, on) => {
    await resumed($, on, HOURS)

    expect(await styles($)).toEqual({
      'night-3': { color: 'merged', dimColor: true, wrap: 'truncate-end' },
      'morning-9': { color: 'warning', dimColor: true, wrap: 'truncate-end' },
      'afternoon-15': {
        color: 'success',
        dimColor: true,
        wrap: 'truncate-end',
      },
      'evening-20': { color: 'claude', dimColor: true, wrap: 'truncate-end' },
      'night-23': { color: 'merged', dimColor: true, wrap: 'truncate-end' },
    })
  },
)

test(
  'time-of-day takes the day bands the setting names',
  { options: { color: 'time-of-day', dayBands: '10,16,20,23' } },
  async ($, on) => {
    await resumed($, on, HOURS)

    const colors = Object.values(await styles($)).map(
      style => (style as { color: string }).color,
    )
    expect(colors).toEqual(['merged', 'merged', 'warning', 'claude', 'merged'])
  },
)

test(
  'time-of-day takes two bands, day and night',
  { options: { color: 'time-of-day', dayBands: '7,19' } },
  async ($, on) => {
    await resumed($, on, HOURS)

    const colors = Object.values(await styles($)).map(
      style => (style as { color: string }).color,
    )
    expect(colors).toEqual(['merged', 'warning', 'warning', 'merged', 'merged'])
  },
)

test(
  'day bands that do not rise are the default ones',
  { options: { color: 'time-of-day', dayBands: '22,18,12,6' } },
  async ($, on) => {
    await resumed($, on, HOURS)

    const colors = Object.values(await styles($)).map(
      style => (style as { color: string }).color,
    )
    expect(colors).toEqual(['merged', 'warning', 'success', 'claude', 'merged'])
  },
)

test(
  'fixed colours the stamp with the colour named',
  { options: { color: 'fixed', fixedColor: '#ff8800' } },
  async ($, on) => {
    await resumed($, on, HOURS)

    for (const style of Object.values(await styles($))) {
      expect(style).toEqual({ color: '#ff8800', wrap: 'truncate-end' })
    }
  },
)

test(
  'fixed takes a theme key or a colour name',
  { options: { color: 'fixed', fixedColor: 'cyan' } },
  async ($, on) => {
    await resumed($, on, HOURS)

    expect((await styles($))['night-3']).toMatchObject({ color: 'cyan' })
  },
)

test(
  'fixed with a colour that is not one is the inactive key',
  { options: { color: 'fixed', fixedColor: 'not a colour' } },
  async ($, on) => {
    await resumed($, on, HOURS)

    expect((await styles($))['night-3']).toMatchObject({ color: 'inactive' })
  },
)

test(
  'off leaves the stamp plain',
  { options: { color: 'off' } },
  async ($, on) => {
    await resumed($, on, HOURS)

    for (const style of Object.values(await styles($))) {
      expect(style).toEqual({ wrap: 'truncate-end' })
    }
  },
)

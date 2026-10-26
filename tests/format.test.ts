import { expect, test } from 'claude-code/testing'
import type { RenderElement } from 'claude-code'

import type { TimestampsConfig } from '../types'
import {
  DEFAULT_CONFIG,
  ageText,
  bandColor,
  bandVariants,
  cellWidth,
  clockLabels,
  fitLabel,
  formatPattern,
  isBandShown,
  isDateDue,
  isStamped,
  labelVariants,
  labelWidth,
  parseDayBands,
  patternWidth,
  placeStamp,
  readConfig,
  stampWidth,
  textProps,
  topRows,
  truncate,
} from '../hooks/format'
import { tickFor } from '../hooks/ticks'
import { parseTranscript } from '../hooks/times'
import { DAY, HOUR, MINUTE, NOW, transcript } from './fakes'

// Local time, so the tests read the same in every zone.
const AT = new Date(2026, 9, 5, 14, 7, 9).getTime()
const config = (change: Partial<TimestampsConfig> = {}): TimestampsConfig => ({
  ...DEFAULT_CONFIG,
  ...change,
})

test('a pattern fills in every token', () => {
  expect(formatPattern('YYYY MM MMM DD ddd', AT)).toBe('2026 10 Oct 05 Mon')
  expect(formatPattern('HH H hh h mm ss a', AT)).toBe('14 14 02 2 07 09 PM')
  expect(formatPattern('[HH:mm]', AT)).toBe('[14:07]')
})

test('the twelve-hour clock reads 12 at midnight and noon', () => {
  const midnight = new Date(2026, 9, 5, 0, 5, 0).getTime()
  const noon = new Date(2026, 9, 5, 12, 0, 0).getTime()

  expect(formatPattern('h:mm a', midnight)).toBe('12:05 AM')
  expect(formatPattern('h:mm a', noon)).toBe('12:00 PM')
  expect(formatPattern('H', midnight)).toBe('0')
})

test('each style reads its own way', () => {
  const read = (style: TimestampsConfig['style']) =>
    clockLabels(config({ style, showDate: 'never' }), AT, AT)[0]

  expect(read('time')).toBe('14:07')
  expect(read('time+seconds')).toBe('14:07:09')
  expect(read('12h')).toBe('2:07 PM')
  expect(read('12h+seconds')).toBe('2:07:09 PM')
  expect(read('date+time')).toBe('Oct 05 14:07')
  expect(read('iso')).toBe('2026-10-05T14:07:09')
  expect(
    clockLabels(config({ style: 'custom', pattern: 'ddd HH:mm' }), AT, AT),
  ).toEqual(['Mon 14:07'])
})

test('the styles that carry a date fall back to the time alone', () => {
  expect(clockLabels(config({ style: 'date+time' }), AT, AT)).toEqual([
    'Oct 05 14:07',
    '14:07',
  ])
  expect(clockLabels(config({ style: 'iso' }), AT, AT)).toEqual([
    '2026-10-05T14:07:09',
    '14:07:09',
  ])
})

test('the date is added by the show-date setting, for the time styles only', () => {
  const yesterday = AT - DAY

  expect(clockLabels(config(), yesterday, AT)).toEqual([
    'Oct 04 14:07',
    '14:07',
  ])
  expect(clockLabels(config(), AT, AT)).toEqual(['14:07'])
  expect(
    clockLabels(config({ style: '12h', showDate: 'always' }), AT, AT),
  ).toEqual(['Oct 05 2:07 PM', '2:07 PM'])
  expect(clockLabels(config({ showDate: 'never' }), yesterday, AT)).toEqual([
    '14:07',
  ])
})

test('each show-date setting has its own edge', () => {
  const late = new Date(2026, 9, 5, 23, 59, 0).getTime()
  const early = new Date(2026, 9, 6, 0, 1, 0).getTime()

  expect(isDateDue('other-day', late, early)).toBe(true)
  expect(isDateDue('other-day', late, late + 30_000)).toBe(false)
  expect(isDateDue('12h', AT, AT + 12 * HOUR)).toBe(false)
  expect(isDateDue('12h', AT, AT + 12 * HOUR + 1)).toBe(true)
  expect(isDateDue('24h', AT, AT + DAY)).toBe(false)
  expect(isDateDue('24h', AT, AT + DAY + 1)).toBe(true)
  expect(isDateDue('7d', AT, AT + 7 * DAY)).toBe(false)
  expect(isDateDue('7d', AT, AT + 7 * DAY + 1)).toBe(true)
  expect(isDateDue('always', AT, AT)).toBe(true)
  expect(isDateDue('never', AT, AT + 400 * DAY)).toBe(false)
})

test('an age reads in the largest unit that fits', () => {
  expect(ageText(0)).toBe('now')
  expect(ageText(MINUTE - 1)).toBe('now')
  expect(ageText(MINUTE)).toBe('1m ago')
  expect(ageText(HOUR - 1)).toBe('59m ago')
  expect(ageText(HOUR)).toBe('1h ago')
  expect(ageText(DAY - 1)).toBe('23h ago')
  expect(ageText(DAY)).toBe('1d ago')
  expect(ageText(364 * DAY)).toBe('364d ago')
  expect(ageText(365 * DAY)).toBe('1y ago')
  expect(ageText(2000 * 365 * DAY)).toBe('99y ago')
  // A clock that ran backwards is not a negative age.
  expect(ageText(-5 * MINUTE)).toBe('now')
})

test('a row reads the tick that moves about as often as its age text', () => {
  expect(tickFor(0)).toBe('min')
  expect(tickFor(HOUR - 1)).toBe('min')
  expect(tickFor(HOUR)).toBe('hour')
  expect(tickFor(DAY - 1)).toBe('hour')
  expect(tickFor(DAY)).toBe('day')
})

test('a stamp has every form, longest first: the date drops first, then the age', () => {
  const old = AT - 2 * DAY
  const forms = (change: Partial<TimestampsConfig>, at: number, now: number) =>
    labelVariants(config(change), at, now, { isApprox: false, isStatic: false })

  expect(forms({ show: 'both' }, old, AT)).toEqual([
    'Oct 03 14:07 · 2d ago',
    '14:07 · 2d ago',
    '14:07',
  ])
  expect(forms({ show: 'both' }, AT, AT + 5 * MINUTE)).toEqual([
    '14:07 · 5m ago',
    '14:07',
  ])
  expect(forms({ show: 'time' }, old, AT)).toEqual(['Oct 03 14:07', '14:07'])
  expect(forms({ show: 'age' }, old, AT)).toEqual(['2d ago'])
})

test('an approximate time leads with a tilde', () => {
  const forms = labelVariants(config({ show: 'both' }), AT, AT + MINUTE, {
    isApprox: true,
    isStatic: false,
  })

  expect(forms).toEqual(['~14:07 · 1m ago', '~14:07'])
})

test('a static screen shows the clock alone, whatever is set to show', () => {
  for (const show of ['time', 'age', 'both'] as const) {
    expect(
      labelVariants(config({ show }), AT, AT + HOUR, {
        isApprox: false,
        isStatic: true,
      }),
    ).toEqual(['14:07'])
  }
})

test('a label is cut to fit, never past the room', () => {
  const forms = ['Oct 03 14:07 · 2d ago', '14:07 · 2d ago', '14:07']

  expect(fitLabel(forms, 40)).toBe('Oct 03 14:07 · 2d ago')
  expect(fitLabel(forms, 20)).toBe('14:07 · 2d ago')
  expect(fitLabel(forms, 14)).toBe('14:07 · 2d ago')
  expect(fitLabel(forms, 13)).toBe('14:07')
  expect(fitLabel(forms, 4)).toBe('14:…')
  expect(fitLabel(forms, 3)).toBe('14…')
  expect(fitLabel(forms, 0)).toBe('')
  expect(cellWidth(fitLabel(forms, 3))).toBeLessThanOrEqual(3)
})

test('the width of a stamp is that of the longest the format makes, less a date a row adds for itself', () => {
  // `~` and `HH:mm`. A date due for one row widens that row's column, not every row's.
  expect(labelWidth(config(), false)).toBe(6)
  expect(labelWidth(config({ showDate: 'never' }), false)).toBe(6)
  for (const showDate of ['12h', '24h', '7d'] as const) {
    expect(labelWidth(config({ showDate }), false)).toBe(6)
  }
  // On every row, the date is part of the stamp: `Oct 05 ` too.
  expect(labelWidth(config({ showDate: 'always' }), false)).toBe(13)
  // Then ` · ` and `364d ago`.
  expect(labelWidth(config({ show: 'both' }), false)).toBe(17)
  expect(labelWidth(config({ show: 'age' }), false)).toBe(9)
  expect(labelWidth(config({ show: 'both' }), true)).toBe(6)
  expect(labelWidth(config({ style: 'iso' }), false)).toBe(20)
  expect(
    labelWidth(config({ style: 'custom', pattern: 'ddd h:mm a' }), false),
  ).toBe(13)
})

test('the stamp column is capped at 22 cells and a quarter of the columns', () => {
  const wide = config({ show: 'both', showDate: 'always' })

  expect(stampWidth(wide, 200, false)).toBe(22)
  expect(stampWidth(wide, 120, false)).toBe(22)
  expect(stampWidth(wide, 80, false)).toBe(20)
  expect(stampWidth(wide, 70, false)).toBe(17)
  expect(stampWidth(wide, 30, false)).toBe(7)
  // A short format needs less than the cap, and is not stretched to it.
  expect(stampWidth(config(), 200, false)).toBe(6)
  expect(stampWidth(config(), 120, false)).toBe(6)
  expect(stampWidth(config(), 40, false)).toBe(6)
  expect(stampWidth(config(), 20, false)).toBe(5)
})

test('auto puts the stamp left from 70 columns and above below that and on mobile', () => {
  const place = (
    change: Partial<TimestampsConfig>,
    surface: string,
    columns: number | undefined,
  ) => placeStamp(config(change), surface, columns, false)

  expect(place({}, 'terminal', 120)).toEqual({
    side: 'left',
    width: 6,
    room: 22,
  })
  expect(place({}, 'terminal', 70)).toEqual({
    side: 'left',
    width: 6,
    room: 17,
  })
  expect(place({}, 'terminal', 69)).toEqual({ side: 'above' })
  expect(place({}, 'terminal', 30)).toEqual({ side: 'above' })
  expect(place({}, 'desktop', 120)).toEqual({
    side: 'left',
    width: 6,
    room: 22,
  })
  expect(place({}, 'mobile', 120)).toEqual({ side: 'above' })
  expect(place({}, 'terminal', undefined)).toEqual({ side: 'above' })
})

test('left, right and above are taken as set, unless a column would be too narrow to read', () => {
  const place = (placement: TimestampsConfig['placement'], columns: number) =>
    placeStamp(config({ placement, show: 'both' }), 'terminal', columns, false)

  expect(place('left', 50)).toEqual({ side: 'left', width: 12, room: 12 })
  expect(place('right', 50)).toEqual({ side: 'right', width: 12, room: 12 })
  expect(place('above', 200)).toEqual({ side: 'above' })
  expect(place('left', 20)).toEqual({ side: 'left', width: 5, room: 5 })
  expect(place('left', 19)).toEqual({ side: 'above' })
  expect(place('right', 8)).toEqual({ side: 'above' })
})

const box = (props: Record<string, string | number | boolean>) =>
  ({ type: 'Box', props }) satisfies RenderElement

test('the rows above a drawing are its top margin and top padding', () => {
  const top = (root: RenderElement) => topRows(root, 'ToolResult', 'terminal')

  expect(top(box({ marginTop: 1 }))).toBe(1)
  expect(top(box({ paddingTop: 1 }))).toBe(1)
  expect(top(box({ marginTop: 1, paddingTop: 2 }))).toBe(3)
  expect(top(box({ marginTop: 0 }))).toBe(0)
  expect(top(box({}))).toBe(0)
  expect(top({ type: 'Box' })).toBe(0)
  // The shorthands count unless the side is set, as in Ink.
  expect(top(box({ marginY: 1 }))).toBe(1)
  expect(top(box({ margin: 2 }))).toBe(2)
  expect(top(box({ padding: 1, paddingY: 3 }))).toBe(3)
  expect(top(box({ margin: 2, marginTop: 1 }))).toBe(1)
  // Only whole rows count: a step name has no size here, and the sides below do not count.
  expect(top(box({ marginTop: 'sm' }))).toBe(0)
  expect(top(box({ marginBottom: 1, paddingBottom: 1 }))).toBe(0)
  expect(top({ type: 'Text', children: ['x'] })).toBe(0)
})

test('behind the engine node, which hides its margin, the rows are those measured for the component', () => {
  const engine = { type: 'engine', ref: 1 } satisfies RenderElement
  const top = (
    component: Parameters<typeof topRows>[1],
    surface = 'terminal',
  ) => topRows(engine, component, surface)

  // Messages and tool calls start with a blank row; results and command output do not.
  expect(top('UserMessage')).toBe(1)
  expect(top('AssistantMessage')).toBe(1)
  expect(top('ToolUse')).toBe(1)
  expect(top('ToolGroup')).toBe(1)
  expect(top('ToolResult')).toBe(0)
  expect(top('CommandOutput')).toBe(0)
  // Measured on the terminal only.
  expect(top('UserMessage', 'desktop')).toBe(0)
  expect(top('UserMessage', 'mobile')).toBe(0)
  // A tree that shows its margin is read, whatever the component.
  expect(topRows(box({ marginTop: 0 }), 'UserMessage', 'terminal')).toBe(0)
  expect(topRows(box({ marginTop: 1 }), 'ToolResult', 'desktop')).toBe(1)
})

test('the rows setting picks the components that are stamped', () => {
  const every = [
    'UserMessage',
    'AssistantMessage',
    'ToolUse',
    'ToolResult',
    'ToolGroup',
    'CommandOutput',
  ] as const
  const stamped = (rows: TimestampsConfig['rows']) =>
    every.filter(component => isStamped(rows, component))

  expect(stamped('all')).toEqual(every)
  expect(stamped('conversation')).toEqual(['UserMessage', 'AssistantMessage'])
  expect(stamped('prompts')).toEqual(['UserMessage'])
  expect(stamped('no-tools')).toEqual([
    'UserMessage',
    'AssistantMessage',
    'CommandOutput',
  ])
})

test('the time-of-day colour follows four bands or two', () => {
  const four = [6, 12, 18, 22]
  const colors = [0, 5, 6, 11, 12, 17, 18, 21, 22, 23].map(hour =>
    bandColor(four, hour),
  )

  expect(colors).toEqual([
    'merged',
    'merged',
    'warning',
    'warning',
    'success',
    'success',
    'claude',
    'claude',
    'merged',
    'merged',
  ])
  expect([5, 6, 17, 18].map(hour => bandColor([6, 18], hour))).toEqual([
    'merged',
    'warning',
    'warning',
    'merged',
  ])
})

test('the colour setting picks the text props, each time-of-day colour dimmed', () => {
  const at = new Date(2026, 9, 5, 15, 0, 0).getTime()
  const props = (change: Partial<TimestampsConfig>) =>
    textProps(config(change), at)

  expect(props({ color: 'dim' })).toEqual({ dimColor: true })
  expect(props({ color: 'subtle' })).toEqual({ color: 'subtle' })
  expect(props({ color: 'time-of-day' })).toEqual({
    color: 'success',
    dimColor: true,
  })
  expect(props({ color: 'fixed', fixedColor: '#ff8800' })).toEqual({
    color: '#ff8800',
  })
  expect(props({ color: 'off' })).toEqual({})
})

test('the day bands are two or four rising hours', () => {
  expect(parseDayBands('6,12,18,22')).toEqual([6, 12, 18, 22])
  expect(parseDayBands(' 7 , 19 ')).toEqual([7, 19])
  expect(parseDayBands('6,12,18')).toBeUndefined()
  expect(parseDayBands('6,12,12,22')).toBeUndefined()
  expect(parseDayBands('22,18,12,6')).toBeUndefined()
  expect(parseDayBands('6,12,18,24')).toBeUndefined()
  expect(parseDayBands('a,b')).toBeUndefined()
  expect(parseDayBands(undefined)).toBeUndefined()
})

test('the settings default to a clock time, left, no ago and no band', () => {
  expect(readConfig({})).toEqual({
    style: 'time',
    pattern: 'HH:mm',
    showDate: 'other-day',
    show: 'time',
    rows: 'all',
    placement: 'auto',
    color: 'dim',
    fixedColor: 'inactive',
    dayBands: [6, 12, 18, 22],
    band: 'off',
  })
})

test('a setting outside its choices counts as unset', () => {
  const read = readConfig({
    style: 'roman',
    pattern: '   ',
    showDate: 'sometimes',
    show: 'ago',
    rows: 'none',
    placement: 'middle',
    color: 'rainbow',
    fixedColor: 'not a colour!',
    dayBands: '1,2,3',
    band: 'maybe',
  })

  expect(read).toEqual(DEFAULT_CONFIG)
  expect(
    readConfig({ fixedColor: ' #00ff88 ', dayBands: '7,19', show: 'both' }),
  ).toMatchObject({ fixedColor: '#00ff88', dayBands: [7, 19], show: 'both' })
})

test('the band shows by its setting', () => {
  expect(isBandShown('off', true)).toBe(false)
  expect(isBandShown('auto', true)).toBe(true)
  expect(isBandShown('auto', false)).toBe(false)
  expect(isBandShown('on', false)).toBe(true)
})

test('the band says both parts, then drops the age, then you', () => {
  const both = config({ show: 'both' })
  const last = { you: NOW, claude: NOW + 2 * MINUTE }
  const now = NOW + 5 * MINUTE

  expect(bandVariants(both, last, now)).toEqual([
    'you 09:12 · 5m ago   claude 09:14 · 3m ago',
    'you 09:12   claude 09:14',
    'claude 09:14 · 3m ago',
    'claude 09:14',
  ])
  expect(bandVariants(config(), last, now)).toEqual([
    'you 09:12   claude 09:14',
    'claude 09:14',
  ])
  expect(bandVariants(both, { you: NOW, claude: 0 }, now)).toEqual([
    'you 09:12 · 5m ago',
    'you 09:12',
  ])
  expect(bandVariants(both, { you: 0, claude: 0 }, now)).toEqual([])
})

test('a pattern reports the most cells it can take', () => {
  expect(patternWidth('HH:mm')).toBe(5)
  expect(patternWidth('ddd, MMM DD YYYY h:mm:ss a')).toBe(28)
  expect(patternWidth('')).toBe(0)
})

test('text widths count wide characters twice and cut with an ellipsis', () => {
  expect(cellWidth('abc')).toBe(3)
  expect(cellWidth('日本')).toBe(4)
  expect(truncate('abcdef', 4)).toBe('abc…')
  expect(truncate('abc', 4)).toBe('abc')
  expect(truncate('日本語', 5)).toBe('日本…')
  expect(truncate('abc', 0)).toBe('')
})

test('a transcript gives each row its time, and each tool call its start and end', () => {
  const text = transcript([
    { uuid: 'u1', at: 1000, type: 'user' },
    {
      uuid: 'a1',
      at: 2000,
      type: 'assistant',
      content: [{ type: 'tool_use', id: 'toolu_1', name: 'Bash', input: {} }],
    },
    {
      uuid: 'u2',
      at: 3000,
      type: 'user',
      content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'ok' }],
    },
    { uuid: 'u3', at: 4000, type: 'user', isMeta: true },
    { uuid: 'a2', at: 5000, type: 'assistant' },
  ])

  expect(parseTranscript(text)).toEqual({
    table: {
      u1: 1000,
      a1: 2000,
      toolu_1: 2000,
      u2: 3000,
      'toolu_1:end': 3000,
      u3: 4000,
      a2: 5000,
    },
    // The latest prompt is the person's own: not a tool result, not a reminder.
    you: 1000,
    claude: 5000,
  })
})

test('a transcript row that is cut short or has no time is skipped, the rest are read', () => {
  const text = [
    transcript([{ uuid: 'u1', at: 1000 }]),
    '{"type":"user","uuid":"cut","timesta',
    '',
    'not json',
    '{"type":"user","uuid":"no-time"}',
    '{"type":"user","uuid":"bad-time","timestamp":"soon"}',
    '[1,2]',
    transcript([{ uuid: 'u2', at: 2000 }]),
  ].join('\n')

  expect(parseTranscript(text).table).toEqual({ u1: 1000, u2: 2000 })
})

test('the first time a transcript gives an id stands', () => {
  const text = transcript([
    { uuid: 'same', at: 1000 },
    { uuid: 'same', at: 2000 },
  ])

  expect(parseTranscript(text).table).toEqual({ same: 1000 })
})

import type { PluginOptions } from 'claude-code'

import type {
  TimestampsBand,
  TimestampsColorMode,
  TimestampsComponent,
  TimestampsConfig,
  TimestampsLast,
  TimestampsPlacement,
  TimestampsRows,
  TimestampsShow,
  TimestampsPlace,
  TimestampsShowDate,
  TimestampsStyle,
  TimestampsTextStyle,
} from '../types'
import { S } from './strings'

export const MINUTE_MS = 60_000
export const HOUR_MS = 3_600_000
export const DAY_MS = 86_400_000

// From this many columns `auto` puts the stamp in a column beside the row.
export const SIDE_FROM = 70
// A stamp column is at most this wide, and at most a quarter of the columns.
export const MAX_COLUMN = 22
// Narrower than a `HH:mm`, a column cannot say anything: the stamp goes above instead.
export const MIN_COLUMN = 5
// How much of a row the debug log quotes.
const PREVIEW_CELLS = 40

const STYLES: readonly TimestampsStyle[] = [
  'time',
  'time+seconds',
  '12h',
  '12h+seconds',
  'date+time',
  'iso',
  'custom',
]
const SHOW_DATES: readonly TimestampsShowDate[] = [
  'other-day',
  '12h',
  '24h',
  '7d',
  'always',
  'never',
]
const SHOWS: readonly TimestampsShow[] = ['time', 'age', 'both']
const ROWS: readonly TimestampsRows[] = [
  'all',
  'conversation',
  'prompts',
  'no-tools',
]
const PLACEMENTS: readonly TimestampsPlacement[] = [
  'auto',
  'left',
  'right',
  'above',
]
const COLORS: readonly TimestampsColorMode[] = [
  'dim',
  'subtle',
  'time-of-day',
  'fixed',
  'off',
]
const BANDS: readonly TimestampsBand[] = ['off', 'auto', 'on']

export const DEFAULT_CONFIG: TimestampsConfig = {
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
}

const pick = <T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T => allowed.find(one => one === value) ?? fallback

/** Two or four rising start hours (0 to 23) from `6,12,18,22`; undefined for anything else. */
export function parseDayBands(text: unknown): number[] | undefined {
  if (typeof text !== 'string') return undefined

  const parts = text.split(',').map(part => part.trim())
  if (parts.length !== 2 && parts.length !== 4) return undefined
  if (!parts.every(part => /^\d{1,2}$/.test(part))) return undefined

  const hours = parts.map(Number)
  const isRising = hours.every(
    (hour, at) => hour < 24 && hour > (hours[at - 1] ?? -1),
  )

  return isRising ? hours : undefined
}

const COLOR_NAME = /^(#[0-9a-fA-F]{6}|[A-Za-z][A-Za-z0-9]*)$/

/** The settings as `/config` holds them; a value that is not one of the choices counts as unset. */
export function readConfig(options: PluginOptions): TimestampsConfig {
  const { pattern, fixedColor, dayBands } = options

  return {
    style: pick(options.style, STYLES, DEFAULT_CONFIG.style),
    pattern:
      typeof pattern === 'string' && pattern.trim() !== ''
        ? pattern
        : DEFAULT_CONFIG.pattern,
    showDate: pick(options.showDate, SHOW_DATES, DEFAULT_CONFIG.showDate),
    show: pick(options.show, SHOWS, DEFAULT_CONFIG.show),
    rows: pick(options.rows, ROWS, DEFAULT_CONFIG.rows),
    placement: pick(options.placement, PLACEMENTS, DEFAULT_CONFIG.placement),
    color: pick(options.color, COLORS, DEFAULT_CONFIG.color),
    fixedColor:
      typeof fixedColor === 'string' && COLOR_NAME.test(fixedColor.trim())
        ? fixedColor.trim()
        : DEFAULT_CONFIG.fixedColor,
    dayBands: parseDayBands(dayBands) ?? DEFAULT_CONFIG.dayBands,
    band: pick(options.band, BANDS, DEFAULT_CONFIG.band),
  }
}

const WIDE: readonly (readonly [number, number])[] = [
  [0x1100, 0x115f],
  [0x2e80, 0x303e],
  [0x3041, 0x33ff],
  [0x3400, 0x4dbf],
  [0x4e00, 0xa4cf],
  [0xac00, 0xd7a3],
  [0xf900, 0xfaff],
  [0xfe30, 0xfe6f],
  [0xff00, 0xff60],
  [0xffe0, 0xffe6],
  [0x1f300, 0x1f64f],
  [0x1f680, 0x1f6ff],
  [0x1f900, 0x1f9ff],
  [0x20000, 0x3fffd],
]

function charWidth(cp: number): 0 | 1 | 2 {
  const isMark =
    (cp >= 0x300 && cp <= 0x36f) ||
    (cp >= 0x200b && cp <= 0x200f) ||
    (cp >= 0xfe00 && cp <= 0xfe0f) ||
    cp === 0x0e31 ||
    (cp >= 0x0e34 && cp <= 0x0e3a) ||
    (cp >= 0x0e47 && cp <= 0x0e4e)
  if (isMark) return 0

  return WIDE.some(([from, to]) => cp >= from && cp <= to) ? 2 : 1
}

/** Terminal cells a string takes: CJK and emoji two, combining marks none. */
export function cellWidth(text: string): number {
  let width = 0
  for (const char of text) width += charWidth(char.codePointAt(0) ?? 0)

  return width
}

/** Cuts a string to at most `width` cells, ending in an ellipsis when cut. */
export function truncate(text: string, width: number): string {
  if (width <= 0) return ''
  if (cellWidth(text) <= width) return text

  let out = ''
  let used = 0
  for (const char of text) {
    const next = charWidth(char.codePointAt(0) ?? 0)
    if (used + next > width - 1) break
    out += char
    used += next
  }

  return out + '…'
}

/** The first words of a row, on one line, for the debug log. */
export function previewOf(text: string): string {
  return truncate(text.replace(/\s+/g, ' ').trim(), PREVIEW_CELLS)
}

const TOKEN = /YYYY|MMM|MM|DD|ddd|HH|hh|mm|ss|H|h|a/g
// The most cells each token can take.
const TOKEN_WIDTH: Readonly<Record<string, number>> = {
  YYYY: 4,
  MMM: 3,
  MM: 2,
  DD: 2,
  ddd: 3,
  HH: 2,
  hh: 2,
  mm: 2,
  ss: 2,
  H: 2,
  h: 2,
  a: 2,
}

const pad = (n: number) => String(n).padStart(2, '0')

/** `pattern` with its tokens (YYYY MM MMM DD ddd HH H hh h mm ss a) filled in from `at`, in local time. */
export function formatPattern(pattern: string, at: number): string {
  const date = new Date(at)
  const hour = date.getHours()
  const twelve = hour % 12 === 0 ? 12 : hour % 12

  return pattern.replace(TOKEN, token => {
    switch (token) {
      case 'YYYY':
        return String(date.getFullYear())
      case 'MM':
        return pad(date.getMonth() + 1)
      case 'MMM':
        return S.months[date.getMonth()] ?? ''
      case 'DD':
        return pad(date.getDate())
      case 'ddd':
        return S.weekdays[date.getDay()] ?? ''
      case 'HH':
        return pad(hour)
      case 'H':
        return String(hour)
      case 'hh':
        return pad(twelve)
      case 'h':
        return String(twelve)
      case 'mm':
        return pad(date.getMinutes())
      case 'ss':
        return pad(date.getSeconds())
      default:
        return hour < 12 ? S.am : S.pm
    }
  })
}

/** The most cells `pattern` can take, whatever the time. */
export function patternWidth(pattern: string): number {
  return cellWidth(
    pattern.replace(TOKEN, token => 'x'.repeat(TOKEN_WIDTH[token] ?? 0)),
  )
}

const PATTERN: Readonly<Record<Exclude<TimestampsStyle, 'custom'>, string>> = {
  time: 'HH:mm',
  'time+seconds': 'HH:mm:ss',
  '12h': 'h:mm a',
  '12h+seconds': 'h:mm:ss a',
  'date+time': 'MMM DD HH:mm',
  iso: 'YYYY-MM-DDTHH:mm:ss',
}
// What the two styles that carry a date fall back to when the date does not fit.
const WITHOUT_DATE = { 'date+time': 'HH:mm', iso: 'HH:mm:ss' } as const
const DATE = 'MMM DD'

function isSameDay(a: number, b: number): boolean {
  const first = new Date(a)
  const second = new Date(b)

  return (
    first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate()
  )
}

/** Whether a row from `at` carries the date, for the styles that add it by this setting. */
export function isDateDue(
  showDate: TimestampsShowDate,
  at: number,
  now: number,
): boolean {
  switch (showDate) {
    case 'never':
      return false
    case 'always':
      return true
    case 'other-day':
      return !isSameDay(at, now)
    case '12h':
      return now - at > 12 * HOUR_MS
    case '24h':
      return now - at > DAY_MS
    default:
      return now - at > 7 * DAY_MS
  }
}

/** The clock for `at`, longest first: with the date where it applies, then without. */
export function clockLabels(
  config: TimestampsConfig,
  at: number,
  now: number,
): string[] {
  const { style } = config
  if (style === 'custom') return [formatPattern(config.pattern, at)]
  if (style === 'date+time' || style === 'iso') {
    return [
      formatPattern(PATTERN[style], at),
      formatPattern(WITHOUT_DATE[style], at),
    ]
  }

  const bare = formatPattern(PATTERN[style], at)

  return isDateDue(config.showDate, at, now)
    ? [`${formatPattern(DATE, at)} ${bare}`, bare]
    : [bare]
}

/** A short relative age: `now`, `5m ago`, `3h ago`, `13d ago`, `2y ago`. */
export function ageText(ms: number): string {
  const minutes = Math.floor(Math.max(0, ms) / MINUTE_MS)
  if (minutes < 1) return S.age.now
  if (minutes < 60) return S.age.minutes(minutes)

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return S.age.hours(hours)

  const days = Math.floor(hours / 24)
  if (days < 365) return S.age.days(days)

  return S.age.years(Math.min(99, Math.floor(days / 365)))
}

/**
 * Every form of a stamp, longest first, so a narrow room takes the first that
 * fits: the date drops first, then the age. On a static screen (`isStatic`) a
 * row cannot tick, so it shows the clock alone.
 */
export function labelVariants(
  config: TimestampsConfig,
  at: number,
  now: number,
  options: { isApprox: boolean; isStatic: boolean },
): string[] {
  const mark = options.isApprox ? S.approx : ''
  const show = options.isStatic ? 'time' : config.show
  const age = ageText(now - at)
  if (show === 'age') return [mark + age]

  const clocks = clockLabels(config, at, now)
  if (show === 'time') return clocks.map(clock => mark + clock)

  const bare = clocks.at(-1) ?? ''

  return [
    ...clocks.map(clock => `${mark}${clock}${S.separator}${age}`),
    mark + bare,
  ]
}

/** The first of `variants` that fits `room` cells, or the shortest cut to fit. */
export function fitLabel(variants: readonly string[], room: number): string {
  const fits = variants.find(one => cellWidth(one) <= room)

  return fits ?? truncate(variants.at(-1) ?? '', room)
}

function clockWidth(config: TimestampsConfig): number {
  const { style } = config
  if (style === 'custom') return patternWidth(config.pattern)
  if (style === 'date+time' || style === 'iso') {
    return patternWidth(PATTERN[style])
  }

  const date = config.showDate === 'never' ? 0 : patternWidth(DATE) + 1

  return date + patternWidth(PATTERN[style])
}

const ageWidth = () =>
  Math.max(
    ...[
      S.age.now,
      S.age.minutes(59),
      S.age.hours(23),
      S.age.days(364),
      S.age.years(99),
    ].map(cellWidth),
  )

/** The most cells any stamp of this format can take, whatever the row. */
export function labelWidth(
  config: TimestampsConfig,
  isStatic: boolean,
): number {
  const show = isStatic ? 'time' : config.show
  const mark = cellWidth(S.approx)
  if (show === 'age') return mark + ageWidth()

  const clock = mark + clockWidth(config)

  return show === 'time' ? clock : clock + cellWidth(S.separator) + ageWidth()
}

/**
 * The width of the stamp column: that of the longest stamp the format can
 * make, so every row's body starts at the same cell, but never more than 22
 * cells or a quarter of the columns.
 */
export function stampWidth(
  config: TimestampsConfig,
  columns: number,
  isStatic: boolean,
): number {
  const cap = Math.min(MAX_COLUMN, Math.floor(columns / 4))

  return Math.min(labelWidth(config, isStatic), cap)
}

/**
 * Where the stamp goes. `auto` is the left column from 70 columns and a line
 * above below that and on mobile; `left` and `right` fall back to a line above
 * when the column would be too narrow to read, or the width is not known.
 */
export function placeStamp(
  config: TimestampsConfig,
  surface: string,
  columns: number | undefined,
  isStatic: boolean,
): TimestampsPlace {
  if (columns === undefined) return { side: 'above' }

  const side =
    config.placement === 'auto'
      ? surface !== 'mobile' && columns >= SIDE_FROM
        ? 'left'
        : 'above'
      : config.placement
  if (side === 'above') return { side }

  const width = stampWidth(config, columns, isStatic)

  return width >= MIN_COLUMN ? { side, width } : { side: 'above' }
}

/** Whether the rows of a component carry a stamp under the `rows` setting. */
export function isStamped(
  rows: TimestampsRows,
  component: TimestampsComponent,
): boolean {
  switch (rows) {
    case 'all':
      return true
    case 'conversation':
      return component === 'UserMessage' || component === 'AssistantMessage'
    case 'prompts':
      return component === 'UserMessage'
    default:
      return (
        component !== 'ToolUse' &&
        component !== 'ToolResult' &&
        component !== 'ToolGroup'
      )
  }
}

/** The theme key for the hour: four bands (morning, afternoon, evening, night) or two (day, night). */
export function bandColor(bands: readonly number[], hour: number): string {
  if (bands.length === 2) {
    const [from = 6, to = 18] = bands

    return hour >= from && hour < to ? 'warning' : 'merged'
  }

  const [morning = 6, afternoon = 12, evening = 18, night = 22] = bands
  if (hour >= night || hour < morning) return 'merged'
  if (hour >= evening) return 'claude'

  return hour >= afternoon ? 'success' : 'warning'
}

/** The `Text` props that colour a stamp for the time `at`. */
export function textProps(
  config: TimestampsConfig,
  at: number,
): TimestampsTextStyle {
  switch (config.color) {
    case 'dim':
      return { dimColor: true }
    case 'subtle':
      return { color: 'subtle' }
    case 'time-of-day':
      return {
        color: bandColor(config.dayBands, new Date(at).getHours()),
        dimColor: true,
      }
    case 'fixed':
      return { color: config.fixedColor }
    default:
      return {}
  }
}

/** Whether the last-activity band shows: `auto` where rows cannot update, on the terminal's main screen. */
export function isBandShown(band: TimestampsBand, isStatic: boolean): boolean {
  return band === 'on' || (band === 'auto' && isStatic)
}

/** The band's text in every form, longest first: both parts, then Claude's alone. */
export function bandVariants(
  config: TimestampsConfig,
  last: TimestampsLast,
  now: number,
): string[] {
  const forms = (at: number) =>
    at > 0
      ? labelVariants(config, at, now, { isApprox: false, isStatic: false })
      : []
  const you = forms(last.you)
  const claude = forms(last.claude)
  const part = (who: string, list: readonly string[], step: number) =>
    S.bandPart(who, list[Math.min(step, list.length - 1)] ?? '')
  const steps = Math.max(you.length, claude.length)
  const both = Array.from({ length: steps }, (_, step) =>
    [
      you.length > 0 ? part(S.bandYou, you, step) : '',
      claude.length > 0 ? part(S.bandClaude, claude, step) : '',
    ]
      .filter(text => text !== '')
      .join(S.bandGap),
  )
  const alone = claude.map((_, step) => part(S.bandClaude, claude, step))

  return [...both, ...alone]
}

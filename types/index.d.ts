/** How the clock reads. */
export type TimestampsStyle =
  | 'time'
  | 'time+seconds'
  | '12h'
  | '12h+seconds'
  | 'date+time'
  | 'iso'
  | 'custom'
/** When the 24-hour and 12-hour styles add the date. */
export type TimestampsShowDate =
  'other-day' | '12h' | '24h' | '7d' | 'always' | 'never'
/** What a stamp holds. */
export type TimestampsShow = 'both' | 'time' | 'age'
/** Which rows get a stamp. */
export type TimestampsRows = 'all' | 'conversation' | 'prompts' | 'no-tools'
export type TimestampsPlacement = 'auto' | 'left' | 'right' | 'above'
export type TimestampsColorMode =
  'dim' | 'subtle' | 'time-of-day' | 'fixed' | 'off'
export type TimestampsBand = 'auto' | 'on' | 'off'
/** The transcript rows that carry a stamp, by the render component that draws them. */
export type TimestampsComponent =
  | 'UserMessage'
  | 'AssistantMessage'
  | 'ToolUse'
  | 'ToolResult'
  | 'ToolGroup'
  | 'CommandOutput'
/** The /config settings, read once per load. */
export type TimestampsConfig = {
  style: TimestampsStyle
  pattern: string
  showDate: TimestampsShowDate
  show: TimestampsShow
  rows: TimestampsRows
  placement: TimestampsPlacement
  color: TimestampsColorMode
  fixedColor: string
  /** Two (day, night) or four (morning, afternoon, evening, night) start hours. */
  dayBands: number[]
  band: TimestampsBand
}
/** Where a stamp goes: a column of `width` cells before the body or after it (up to `room` for a row with a date), or a line above. */
export type TimestampsPlace =
  { side: 'above' } | { side: 'left' | 'right'; width: number; room: number }
/** The `Text` props that colour a stamp. */
export type TimestampsTextStyle = { color?: string; dimColor?: boolean }
/** One row's time. `at` is 0 while unknown; `isApprox`: first seen drawn, not recorded when it happened. */
export type TimestampsStamp = { at: number; isApprox: boolean }
/** When the person last prompted and Claude last replied (0: not yet). */
export type TimestampsLast = { you: number; claude: number }
/** The tick a row reads for its age: by the minute, the hour or the day. */
export type TimestampsTick = 'min' | 'hour' | 'day'

declare module 'claude-code' {
  interface PluginState {
    timestamps: {
      times: StateFamily<Shaped<TimestampsStamp>>
      tickMin: number
      tickHour: number
      tickDay: number
      last: Shaped<TimestampsLast>
      isLoading: boolean
      sessionId: string
    }
  }
}

import { atom, memberOf, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { TimestampsLast, TimestampsStamp, TimestampsTick } from '../types'

// The scan that lists what a module reads and writes only accepts an atom
// written in the file that reads it, so the atoms stay here and every other
// file goes through these accessors. Bump a shape tag whenever its value's
// type changes.

// One member per row, by id: a row's uuid, a tool call's id, or that id with `:end`.
const times = atom(
  { plugin: 'timestamps', key: 'times' } as const,
  { at: 0, isApprox: false } as TimestampsStamp,
  { shape: 'times-1' },
)
// The minute, hour and day the one timer last saw: a row reads the one matching its age.
const tickMin = atom({ plugin: 'timestamps', key: 'tickMin' } as const, 0)
const tickHour = atom({ plugin: 'timestamps', key: 'tickHour' } as const, 0)
const tickDay = atom({ plugin: 'timestamps', key: 'tickDay' } as const, 0)
// What the last-activity band shows.
const last = atom(
  { plugin: 'timestamps', key: 'last' } as const,
  { you: 0, claude: 0 } as TimestampsLast,
  { shape: 'last-1' },
)
// True while a resumed session's times are being read, so no row is stamped early.
const isLoading = atom(
  { plugin: 'timestamps', key: 'isLoading' } as const,
  false,
)
// The session the times are kept for ('' until a session starts).
const sessionId = atom({ plugin: 'timestamps', key: 'sessionId' } as const, '')

export function readStamp(
  $: EngineInterface,
  id: string,
): Promise<TimestampsStamp> {
  return read($, memberOf(times, { requestId: id }))
}

export function updateStamp(
  $: EngineInterface,
  id: string,
  change: (value: TimestampsStamp) => TimestampsStamp,
): Promise<TimestampsStamp> {
  return update($, memberOf(times, { requestId: id }), change)
}

export function readTick(
  $: EngineInterface,
  which: TimestampsTick,
): Promise<number> {
  if (which === 'min') return read($, tickMin)

  return which === 'hour' ? read($, tickHour) : read($, tickDay)
}

export function updateTick(
  $: EngineInterface,
  which: TimestampsTick,
  change: (value: number) => number,
): Promise<number> {
  if (which === 'min') return update($, tickMin, change)

  return which === 'hour'
    ? update($, tickHour, change)
    : update($, tickDay, change)
}

export function readLast($: EngineInterface): Promise<TimestampsLast> {
  return read($, last)
}

export function updateLast(
  $: EngineInterface,
  change: (value: TimestampsLast) => TimestampsLast,
): Promise<TimestampsLast> {
  return update($, last, change)
}

export function readLoading($: EngineInterface): Promise<boolean> {
  return read($, isLoading)
}

export function updateLoading(
  $: EngineInterface,
  change: (value: boolean) => boolean,
): Promise<boolean> {
  return update($, isLoading, change)
}

export function readSessionId($: EngineInterface): Promise<string> {
  return read($, sessionId)
}

export function updateSessionId(
  $: EngineInterface,
  change: (value: string) => string,
): Promise<string> {
  return update($, sessionId, change)
}

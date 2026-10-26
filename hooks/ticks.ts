import type { EngineInterface, Timer } from 'claude-code'

import type { TimestampsTick } from '../types'
import { readTick, updateTick } from './atoms'
import { DAY_MS, HOUR_MS, MINUTE_MS } from './format'
import { inBackground } from './times'

// One timer writes the three ticks; a tick moves only when its minute, hour or day does.
export const TICK_MS = 15_000

const BUCKET_MS: Readonly<Record<TimestampsTick, number>> = {
  min: MINUTE_MS,
  hour: HOUR_MS,
  day: DAY_MS,
}

/** The tick a row of this age reads: the one that moves about as often as its age text changes. */
export function tickFor(ageMs: number): TimestampsTick {
  if (ageMs < HOUR_MS) return 'min'

  return ageMs < DAY_MS ? 'hour' : 'day'
}

/** Moves each tick whose bucket the clock has crossed; a row that read it is drawn again. */
export async function advanceTicks($: EngineInterface): Promise<void> {
  const now = await $.clock.now()

  for (const which of ['min', 'hour', 'day'] as const) {
    const bucket = Math.floor(now / BUCKET_MS[which])
    if ((await readTick($, which)) !== bucket) {
      await updateTick($, which, () => bucket)
    }
  }
}

let timer: Timer | undefined

/** Starts the one timer (again, if a session start repeats), and moves the ticks to now. */
export function startTicks($: EngineInterface): void {
  timer?.cancel()
  timer = $.clock.every(TICK_MS, () => inBackground($, advanceTicks($)))
  inBackground($, advanceTicks($))
}

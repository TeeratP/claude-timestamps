import type { EngineInterface, RenderElement, RenderInput } from 'claude-code'

import type { TimestampsComponent, TimestampsConfig } from '../types'
import { readLoading, readStamp, readTick } from './atoms'
import {
  cellWidth,
  fitLabel,
  isStamped,
  labelVariants,
  placeStamp,
  previewOf,
  textProps,
  topRows,
} from './format'
import { S } from './strings'
import { tickFor } from './ticks'
import { endKey, noteSeen } from './times'

type RowInput = RenderInput<TimestampsComponent>

// Drawn rows already logged for the live check, as `component:requestId`.
const logged = new Set<string>()
const LOGGED_CAP = 5000

// A drawn row's first words: its text, or the tool it is for.
function wordsOf(e: RowInput): string {
  switch (e.component) {
    case 'UserMessage':
    case 'AssistantMessage':
    case 'CommandOutput':
      return e.props.text
    case 'ToolGroup':
      return e.props.calls.map(call => call.tool).join(' ')
    default:
      return e.props.tool
  }
}

// Logs each drawn row's component and requestId once, to pair with the appended uuids.
function logDrawn($: EngineInterface, e: RowInput): void {
  const key = `${e.component}:${e.requestId}`
  if (logged.has(key)) return

  if (logged.size >= LOGGED_CAP) logged.clear()
  logged.add(key)
  $.ui.log(S.debugRender(e.component, e.requestId, previewOf(wordsOf(e))), {
    to: 'debug',
  })
}

// The id a row's time is held under: its requestId, a result's `:end`, a group's first call.
function timeId(e: RowInput): string {
  switch (e.component) {
    case 'ToolResult':
      return endKey(e.requestId)
    case 'ToolGroup':
      return (
        e.props.calls.find(call => call.tool_use_id !== undefined)
          ?.tool_use_id ?? e.requestId
      )
    default:
      return e.requestId
  }
}

/**
 * Wraps a transcript row in its stamp: the engine's own row `inner` stays whole,
 * beside a fixed-width column of the stamp or under a line of it. A row whose
 * time is not known yet is drawn as it was, and drawn again once it is.
 */
export async function stampRow(
  $: EngineInterface,
  e: RowInput,
  inner: RenderElement,
  config: TimestampsConfig,
): Promise<RenderElement> {
  logDrawn($, e)
  if (!isStamped(config.rows, e.component)) return inner
  // Rows of a resumed session wait for the times read from its transcript.
  if (await readLoading($)) return inner

  const id = timeId(e)
  const stamp = await readStamp($, id)
  if (stamp.at === 0) {
    noteSeen($, id)

    return inner
  }

  // The terminal's main screen prints rows once, so an age drawn there would stand still.
  const isStatic =
    e.surface === 'terminal' && e.viewport?.isFullscreen === false
  const now = await $.clock.now()
  // Reading the tick that matches the age draws the row again when it moves; off screen, none.
  if (!isStatic && config.show !== 'time' && e.props.onScreen !== null) {
    await readTick($, tickFor(now - stamp.at))
  }

  const variants = labelVariants(config, stamp.at, now, {
    isApprox: stamp.isApprox,
    isStatic,
  })
  const columns = e.viewport?.columns
  const place = placeStamp(config, e.surface, columns, isStatic)
  const style = textProps(config, stamp.at)
  const { Box, Text } = $.ui.resolve(e)

  if (place.side === 'above') {
    const label = fitLabel(variants, columns ?? Infinity)

    return (
      <Box flexDirection="column">
        <Text {...style} wrap="truncate-end">
          {label}
        </Text>
        {inner}
      </Box>
    )
  }

  // The column holds the format's widest stamp; a row with a date takes more, up to the room.
  const label = fitLabel(variants, place.room)
  const width = Math.max(place.width, cellWidth(label))
  // The engine's drawing may start with blank rows; the stamp skips them to sit on the text.
  const top = topRows(inner, e.component, e.surface)
  const skip = top > 0 ? { marginTop: top } : {}
  const column =
    place.side === 'left' ? (
      <Box width={width} flexShrink={0} marginRight={1} {...skip}>
        <Text {...style} wrap="truncate-end">
          {label}
        </Text>
      </Box>
    ) : (
      <Box width={width} flexShrink={0} marginLeft={1} {...skip}>
        <Text {...style} wrap="truncate-end">
          {label}
        </Text>
      </Box>
    )
  const body = (
    <Box flexDirection="column" flexGrow={1} flexShrink={1}>
      {inner}
    </Box>
  )

  return (
    <Box flexDirection="row">
      {place.side === 'left' ? column : body}
      {place.side === 'left' ? body : column}
    </Box>
  )
}

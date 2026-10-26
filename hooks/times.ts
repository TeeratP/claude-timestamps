import type {
  Args,
  EngineInterface,
  Frozen,
  Next,
  SessionAppendInput,
} from 'claude-code'

import {
  readSessionId,
  readStamp,
  updateLast,
  updateLoading,
  updateSessionId,
  updateStamp,
} from './atoms'
import { previewOf } from './format'
import { S } from './strings'

// What a session keeps in `$.store`, as `times:<sessionId>`: row id to time.
const STORE_PREFIX = 'times:'
// A store is capped at 4 MiB in all, so each session keeps its newest rows and only a few sessions are kept.
const MAX_SAVED_ROWS = 4000
const MAX_SAVED_SESSIONS = 5
// `$.fs.read` rejects a file over this.
export const MAX_TRANSCRIPT_BYTES = 4 * 1024 * 1024
// A resume writes this many rows' times at once.
const WRITE_BATCH = 50
const MAX_LOADED_ROWS = 5000
const FLUSH_MS = 2000

// Rows the screen can show; the engine's other rows (reminders, listings) are not stamped.
const STAMPED_DOORS: ReadonlySet<string> = new Set([
  'prompt',
  'command',
  'response',
  'tool-result',
  'tool-message',
  'delivery',
])

type Table = Record<string, number>
type Block = { type: string; [field: string]: unknown }

/** The id a tool result row is stamped under; the call's own row has the bare id. */
export const endKey = (toolUseId: string) => `${toolUseId}:end`

/** Runs work no hook waits on; a failure goes to the debug log, not nowhere. */
export function inBackground($: EngineInterface, work: Promise<unknown>): void {
  work.catch((error: unknown) =>
    $.ui.log(S.failed('background work', errorMessage(error)), { to: 'debug' }),
  )
}

export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isBlock = (value: unknown): value is Block =>
  isRecord(value) && typeof value.type === 'string'

const blocksOf = (content: unknown): Block[] =>
  Array.isArray(content) ? content.filter(isBlock) : []

function toolUseIds(blocks: readonly Block[]): string[] {
  return blocks.flatMap(block =>
    block.type === 'tool_use' && typeof block.id === 'string' ? [block.id] : [],
  )
}

function toolResultIds(blocks: readonly Block[]): string[] {
  return blocks.flatMap(block =>
    block.type === 'tool_result' && typeof block.tool_use_id === 'string'
      ? [block.tool_use_id]
      : [],
  )
}

// Times recorded since the last save, kept to be merged into the store.
let unsaved: Table = {}
let isSaveQueued = false

/**
 * Notes a row's true time. An exact time already held stays unless `isOverride`
 * (a tool call's start replaces the time its row was appended at).
 */
async function record(
  $: EngineInterface,
  id: string,
  at: number,
  isOverride: boolean,
): Promise<void> {
  const held = await readStamp($, id)
  if (held.at > 0 && !held.isApprox && !isOverride) return

  await updateStamp($, id, current =>
    current.at > 0 && !current.isApprox && !isOverride
      ? current
      : { at, isApprox: false },
  )
  unsaved[id] = at
  queueSave($)
}

function queueSave($: EngineInterface): void {
  if (isSaveQueued) return

  isSaveQueued = true
  $.clock.after(FLUSH_MS, () => inBackground($, save($)))
}

function newest(table: Table, limit: number): Table {
  const entries = Object.entries(table)
  if (entries.length <= limit) return table

  return Object.fromEntries(entries.sort((a, b) => b[1] - a[1]).slice(0, limit))
}

function toTable(saved: unknown): Table {
  if (!isRecord(saved)) return {}

  return Object.fromEntries(
    Object.entries(saved).filter(
      (entry): entry is [string, number] => typeof entry[1] === 'number',
    ),
  )
}

async function readSaved($: EngineInterface, session: string): Promise<Table> {
  return toTable(await $.store.get(STORE_PREFIX + session))
}

// Merges what was recorded since the last save into the session's table, and forgets the oldest sessions.
async function save($: EngineInterface): Promise<void> {
  isSaveQueued = false
  const session = await readSessionId($)
  // Before the session is known the times wait for the next save.
  if (session === '') return

  const delta = unsaved
  unsaved = {}
  if (Object.keys(delta).length === 0) return

  const merged = { ...(await readSaved($, session)), ...delta }
  await $.store.set(STORE_PREFIX + session, newest(merged, MAX_SAVED_ROWS))

  const sessions = (await $.store.keys()).filter(
    key => key.startsWith(STORE_PREFIX) && key !== STORE_PREFIX + session,
  )
  for (const key of sessions.slice(
    0,
    Math.max(0, sessions.length - (MAX_SAVED_SESSIONS - 1)),
  )) {
    await $.store.delete(key)
  }
}

// A row's first words: its first text, else the name of the tool it calls.
function wordsOf(blocks: readonly Block[]): string {
  for (const block of blocks) {
    if (block.type === 'text' && typeof block.text === 'string') {
      return block.text
    }
    if (block.type === 'tool_use' && typeof block.name === 'string') {
      return block.name
    }
  }

  return ''
}

function isThinkingOnly(blocks: readonly Block[]): boolean {
  return (
    blocks.length > 0 &&
    blocks.every(
      block => block.type === 'thinking' || block.type === 'redacted_thinking',
    )
  )
}

/**
 * Notes the time of a row as the conversation keeps it: under its uuid, under
 * the ids of the tool calls it makes, and (for a result) under the call's `:end`.
 * Logs the uuid, for the live check against a drawn row's requestId.
 */
export async function noteAppend(
  $: EngineInterface,
  e: SessionAppendInput,
): Promise<void> {
  const blocks = blocksOf(e.message.content)
  const uses = toolUseIds(blocks)
  $.ui.log(
    S.debugAppend(
      e.uuid,
      e.door,
      e.message.type,
      uses,
      previewOf(wordsOf(blocks)),
    ),
    { to: 'debug' },
  )
  if (!STAMPED_DOORS.has(e.door) || isThinkingOnly(blocks)) return

  const at = await $.clock.now()
  await record($, e.uuid, at, false)
  for (const id of uses) await record($, id, at, false)
  for (const id of toolResultIds(blocks)) {
    await record($, endKey(id), at, false)
  }

  if (e.agentId !== undefined) return
  if (e.door === 'prompt' && e.message.type === 'user') {
    await updateLast($, last => ({ ...last, you: at }))
  } else if (e.door === 'response' && e.message.type === 'assistant') {
    await updateLast($, last => ({ ...last, claude: at }))
  }
}

/**
 * Notes when a tool call starts (the time its row shows) and ends (its
 * result's). Never alters the call.
 */
export async function watchToolCall(
  $: EngineInterface,
  e: Frozen<Args<'tool.call'>>,
  next: Next<'tool.call'>,
) {
  await record($, e.tool_use_id, await $.clock.now(), true)
  const ran = await next(e)
  await record($, endKey(e.tool_use_id), await $.clock.now(), true)

  return ran
}

// Rows already scheduled to be marked, so a redraw does not schedule them twice.
const marking = new Set<string>()

/**
 * Called while a row draws with no time held: records when it was first seen,
 * a moment later (a draw may not write), as an approximate time.
 */
export function noteSeen($: EngineInterface, id: string): void {
  if (marking.has(id)) return

  marking.add(id)
  $.clock.after(0, () => inBackground($, markSeen($, id)))
}

async function markSeen($: EngineInterface, id: string): Promise<void> {
  marking.delete(id)
  if ((await readStamp($, id)).at > 0) return

  const now = await $.clock.now()
  await updateStamp($, id, current =>
    current.at > 0 ? current : { at: now, isApprox: true },
  )
}

/** What a transcript file says: each row's time, and the latest prompt and reply. */
export type Parsed = { table: Table; you: number; claude: number }

const EMPTY_PARSED: Parsed = { table: {}, you: 0, claude: 0 }

/** Reads the times out of a transcript's JSONL: by row uuid, and by tool call id and `:end`. */
export function parseTranscript(text: string): Parsed {
  const table: Table = {}
  let you = 0
  let claude = 0

  for (const line of text.split('\n')) {
    if (line.trim() === '') continue

    let row: unknown
    try {
      row = JSON.parse(line)
    } catch {
      // A line cut short (a file being written) is not a row; the rest still are.
      continue
    }
    if (!isRecord(row) || typeof row.timestamp !== 'string') continue

    const at = Date.parse(row.timestamp)
    if (Number.isNaN(at)) continue

    if (typeof row.uuid === 'string') table[row.uuid] ??= at

    const blocks = blocksOf(isRecord(row.message) ? row.message.content : null)
    for (const id of toolUseIds(blocks)) table[id] ??= at
    const results = toolResultIds(blocks)
    for (const id of results) table[endKey(id)] ??= at

    if (row.type === 'assistant') claude = Math.max(claude, at)
    if (row.type === 'user' && row.isMeta !== true && results.length === 0) {
      you = Math.max(you, at)
    }
  }

  return { table, you, claude }
}

async function readTranscript(
  $: EngineInterface,
  path: string,
): Promise<Parsed> {
  if (path === '') return EMPTY_PARSED

  try {
    const { size } = await $.fs.stat(path)
    if (size > MAX_TRANSCRIPT_BYTES) {
      $.ui.log(S.failed('resume', S.transcriptTooLarge(path, size)), {
        to: 'debug',
      })

      return EMPTY_PARSED
    }

    return parseTranscript(await $.fs.read(path))
  } catch (error) {
    $.ui.log(S.failed(S.transcriptUnreadable(path), errorMessage(error)), {
      to: 'debug',
    })

    return EMPTY_PARSED
  }
}

// Writes a time unless a true one is already held (a row recorded live, or a compaction's second pass).
async function keep($: EngineInterface, id: string, at: number): Promise<void> {
  const held = await readStamp($, id)
  if (held.at > 0 && !held.isApprox) return

  await updateStamp($, id, () => ({ at, isApprox: false }))
}

async function writeTable($: EngineInterface, table: Table): Promise<void> {
  const rows = Object.entries(newest(table, MAX_LOADED_ROWS))
  for (let from = 0; from < rows.length; from += WRITE_BATCH) {
    await Promise.all(
      rows.slice(from, from + WRITE_BATCH).map(([id, at]) => keep($, id, at)),
    )
  }
}

/** What `classic.SessionStart` carries that the restore reads. */
export type SessionStart = {
  session_id: string
  transcript_path: string
  source: string
}

/**
 * Starts keeping times for the session. A resumed, forked or compacted one has
 * rows drawn from its transcript, so they stay unstamped until the times saved
 * for the session and the transcript's own are read, a moment later.
 */
export async function startSession(
  $: EngineInterface,
  e: SessionStart,
): Promise<void> {
  const isReplay =
    e.source === 'resume' || e.source === 'fork' || e.source === 'compact'
  await updateSessionId($, () => e.session_id)
  if (isReplay) await updateLoading($, () => true)

  $.clock.after(0, () => inBackground($, restore($, e, isReplay)))
}

async function restore(
  $: EngineInterface,
  e: SessionStart,
  isReplay: boolean,
): Promise<void> {
  try {
    const saved = await readSaved($, e.session_id)
    const parsed = isReplay
      ? await readTranscript($, e.transcript_path)
      : EMPTY_PARSED
    // What this mod recorded when it happened outranks the transcript's own stamp.
    const table = { ...parsed.table, ...saved }

    await writeTable($, table)
    if (parsed.you > 0 || parsed.claude > 0) {
      await updateLast($, last => ({
        you: Math.max(last.you, parsed.you),
        claude: Math.max(last.claude, parsed.claude),
      }))
    }

    // The transcript's times are saved too, so a later resume can do without a file grown past 4 MiB.
    for (const [id, at] of Object.entries(parsed.table)) {
      if (!(id in saved)) unsaved[id] = at
    }
    if (Object.keys(unsaved).length > 0) queueSave($)
  } finally {
    if (isReplay) await updateLoading($, () => false)
  }
}

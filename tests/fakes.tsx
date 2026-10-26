import type { On, RenderPropsOf, RenderSurface } from 'claude-code'
import { mock } from 'claude-code/testing'
import type { Engine, Mounted } from 'claude-code/testing'

// Local time, so a stamp reads 09:12 whatever zone the tests run in.
export const NOW = new Date(2026, 9, 26, 9, 12, 0).getTime()
export const MINUTE = 60_000
export const HOUR = 3_600_000
export const DAY = 86_400_000
export const SESSION = 'session-1'
export const TRANSCRIPT = '/t/session-1.jsonl'

/** What the engine's own drawing of every row says in these tests. */
export const ENGINE_ROW = 'engine row'

export const EVERY_SURFACE = ['terminal', 'desktop'] as const

export type Files = Record<string, string>

/** The engine beneath the plugin: a clock, a store, files, and the calls a session makes. */
export function boot(
  on: On,
  options: {
    files?: Files
    store?: Record<string, unknown>
    row?: string
    // How long a tool call takes.
    toolMs?: number
  } = {},
) {
  const clock = mock.clock(on, { now: NOW })
  // Kept as JSON text, as the engine keeps it, so a test can read what was saved.
  const saved = new Map(
    Object.entries(options.store ?? {}).map(([key, value]) => [
      key,
      JSON.stringify(value),
    ]),
  )
  const rows = mock.session(on)
  const files = options.files ?? {}
  const logs: string[] = []
  const reads: string[] = []
  const toolIds: string[] = []
  // How many times the engine's own drawing of a row was asked for: one per draw.
  const draws = { count: 0 }

  on('store.get', (_, e) => {
    const text = saved.get(e.key)

    return { value: text === undefined ? undefined : JSON.parse(text) }
  })
  on('store.set', (_, e) => {
    saved.set(e.key, JSON.stringify(e.value))

    return { value: undefined }
  })
  on('store.delete', (_, e) => {
    saved.delete(e.key)

    return { value: undefined }
  })
  on('store.keys', () => ({ value: [...saved.keys()] }))
  on('ui.log', (_, e) => {
    logs.push(e.text)

    return { value: undefined }
  })
  on('fs.stat', (_, e) => {
    const text = files[e.path]
    if (text === undefined) return { deny: `ENOENT: ${e.path}` }

    return {
      value: {
        kind: 'file' as const,
        size: text.length,
        mtimeMs: 0,
        isLink: false,
      },
    }
  })
  on('fs.read', (_, e) => {
    reads.push(e.path)
    const text = files[e.path]

    return text === undefined ? { deny: `ENOENT: ${e.path}` } : { value: text }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('classic.SessionStart', () => ({}))
  on('tool.call', async (_, e) => {
    toolIds.push(e.tool_use_id)
    if (options.toolMs !== undefined) await clock.sleep(options.toolMs)

    return { result: {} }
  })
  // The engine's own drawing of a row, which the plugin wraps.
  on('ui.render', ($, e) => {
    draws.count += 1
    const { Text } = $.ui.resolve(e)

    return <Text>{options.row ?? ENGINE_ROW}</Text>
  })

  /** What the store holds under a key, parsed. */
  const stored = (key: string): unknown => {
    const text = saved.get(key)

    return text === undefined ? undefined : JSON.parse(text)
  }

  return { clock, rows, files, logs, reads, toolIds, draws, saved, stored }
}

export async function start($: Engine) {
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
}

type Start = Parameters<Engine['classic']['SessionStart']>[0]

/** A session starting: a fresh one, or a resume, fork or compact that reads the transcript. */
export function begin(
  $: Engine,
  source: Start['source'] = 'startup',
  session = SESSION,
) {
  return $.classic.SessionStart({
    source,
    session_id: session,
    transcript_path: TRANSCRIPT,
  })
}

type Append = Parameters<Engine['session']['append']>[0]

/** A prompt the person typed, as the conversation appends it. */
export const prompt = (uuid: string, text = 'hello'): Append => ({
  message: { type: 'user', role: 'user', content: [{ type: 'text', text }] },
  door: 'prompt',
  origin: { kind: 'composer' },
  uuid,
})

/** One block of Claude's response. */
export const reply = (
  uuid: string,
  content: Append['message']['content'] = [{ type: 'text', text: 'hi' }],
): Append => ({
  message: { type: 'assistant', role: 'assistant', content },
  door: 'response',
  origin: { kind: 'model', model: 'm' },
  uuid,
})

/** A tool call block of Claude's response. */
export const call = (uuid: string, toolUseId: string): Append =>
  reply(uuid, [{ type: 'tool_use', id: toolUseId, name: 'Bash', input: {} }])

/** A tool's result row. */
export const result = (uuid: string, toolUseId: string): Append => ({
  message: {
    type: 'user',
    role: 'user',
    content: [{ type: 'tool_result', tool_use_id: toolUseId, content: 'ok' }],
  },
  door: 'tool-result',
  origin: { kind: 'tool', tool: 'Bash' },
  uuid,
})

export const VIEWPORT = { columns: 120, rows: 40, isFullscreen: true } as const

/** The props of each row component, as the engine hands them to `ui.render`. */
export const PROPS = {
  UserMessage: {
    text: 'hello',
    origin: { kind: 'composer' },
    isExpanded: false,
  },
  AssistantMessage: { text: 'hi', isFirstOfReply: true },
  ToolUse: {
    tool_use_id: 'toolu_1',
    tool: 'Bash',
    input: {},
    isRunning: false,
    isErrored: false,
    isInterrupted: false,
  },
  ToolResult: {
    tool_use_id: 'toolu_1',
    tool: 'Bash',
    output: {},
    isErrored: false,
  },
  ToolGroup: {
    calls: [
      {
        tool_use_id: 'toolu_1',
        tool: 'Read',
        input: {},
        isRunning: false,
        isErrored: false,
        isInterrupted: false,
      },
    ],
    isActive: false,
    isExpanded: false,
  },
  CommandOutput: {
    command: 'cost',
    args: '',
    text: 'ok',
    isErrored: false,
  },
} satisfies {
  [C in keyof RenderPropsOf]?: RenderPropsOf[C]
}

export type RowComponent = keyof typeof PROPS

export const BAND_PROPS = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 10,
  bodyColumns: 80,
  scroll: { offset: 0, bodyRows: 10 },
  view: {},
} as const

type MountOptions<C extends RowComponent> = {
  surface?: RenderSurface
  columns?: number
  // False: the terminal's main screen, where printed rows stand still.
  isFullscreen?: boolean
  props?: Partial<RenderPropsOf[C]>
}

/** Mounts one row component as the engine draws it, through the plugin. */
export function mountRow<C extends RowComponent>(
  $: Engine,
  component: C,
  requestId: string,
  options: MountOptions<C> = {},
) {
  return $.ui.mount({
    plugin: 'timestamps',
    surface: options.surface ?? 'terminal',
    component,
    requestId,
    props: { ...PROPS[component], ...options.props } as RenderPropsOf[C],
    viewport: {
      columns: options.columns ?? VIEWPORT.columns,
      rows: VIEWPORT.rows,
      isFullscreen: options.isFullscreen ?? true,
    },
  })
}

/** Mounts the band above the prompt. */
export function mountBand(
  $: Engine,
  options: {
    surface?: RenderSurface
    isFullscreen?: boolean
    props?: Partial<RenderPropsOf['AbovePrompt']>
  } = {},
) {
  return $.ui.mount({
    plugin: 'timestamps',
    surface: options.surface ?? 'terminal',
    component: 'AbovePrompt',
    props: { ...BAND_PROPS, ...options.props },
    viewport: {
      columns: VIEWPORT.columns,
      rows: VIEWPORT.rows,
      isFullscreen: options.isFullscreen ?? false,
    },
  })
}

/** The text of the stamp in a mounted drawing: the one `Text` that is cut, not wrapped. */
export async function stampOf(
  ui: Pick<Mounted, 'findAll'>,
): Promise<string | undefined> {
  const texts = await ui.findAll({ type: 'Text' })

  return texts.find(one => one.props.wrap === 'truncate-end')?.text
}

/** The props of that stamp `Text`, to look at its colour. */
export async function styleOf(ui: Pick<Mounted, 'findAll'>) {
  const texts = await ui.findAll({ type: 'Text' })

  return texts.find(one => one.props.wrap === 'truncate-end')?.props
}

type TranscriptRow = {
  uuid: string
  at: number
  type?: 'user' | 'assistant'
  content?: unknown
  isMeta?: true
}

/** A transcript file: one JSON row per line, stamped as the engine stamps them. */
export const transcript = (rows: readonly TranscriptRow[]) =>
  rows
    .map(row =>
      JSON.stringify({
        type: row.type ?? 'user',
        uuid: row.uuid,
        timestamp: new Date(row.at).toISOString(),
        isMeta: row.isMeta,
        message: {
          role: row.type ?? 'user',
          content: row.content ?? [{ type: 'text', text: 'x' }],
        },
      }),
    )
    .join('\n')

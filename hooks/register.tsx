import type { Register } from 'claude-code'

import { renderBand } from './band'
import { readConfig } from './format'
import { stampRow } from './stamp'
import { startTicks } from './ticks'
import { noteAppend, startSession, watchToolCall } from './times'

export const register: Register = (on, options) => {
  const config = readConfig(options)

  on('session.start', ($, e, next) => {
    startTicks($)

    return next(e)
  }).catch(($, e, next) => next(e))

  // The session's id and, on a resume, fork or compact, the transcript to read the times from.
  on('classic.SessionStart', async ($, e, next) => {
    await startSession($, e)

    return next(e)
  }).catch(($, e, next) => next(e))

  // Every row the conversation keeps is timed as it is appended, before it is drawn.
  on('session.append', async ($, e, next) => {
    await noteAppend($, e)

    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', ($, e, next) => watchToolCall($, e, next)).catch(
    ($, e, next) => next(e),
  )

  on('ui.render', { component: 'UserMessage' }, async ($, e, next) =>
    stampRow($, e, await next(e), config),
  ).catch(($, e, next) => next(e))
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) =>
    stampRow($, e, await next(e), config),
  ).catch(($, e, next) => next(e))
  on('ui.render', { component: 'ToolUse' }, async ($, e, next) =>
    stampRow($, e, await next(e), config),
  ).catch(($, e, next) => next(e))
  on('ui.render', { component: 'ToolResult' }, async ($, e, next) =>
    stampRow($, e, await next(e), config),
  ).catch(($, e, next) => next(e))
  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) =>
    stampRow($, e, await next(e), config),
  ).catch(($, e, next) => next(e))
  on('ui.render', { component: 'CommandOutput' }, async ($, e, next) =>
    stampRow($, e, await next(e), config),
  ).catch(($, e, next) => next(e))

  on(
    'ui.render',
    { component: 'AbovePrompt' },
    async ($, e, next) => (await renderBand($, e, config)) ?? next(e),
  ).catch(($, e, next) => next(e))
}

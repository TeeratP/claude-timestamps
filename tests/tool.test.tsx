import { expect, test } from 'claude-code/testing'
import type { Plugin } from 'claude-code/testing'

import {
  EVERY_SURFACE,
  MINUTE,
  boot,
  call,
  mountRow,
  result,
  stampOf,
  start,
} from './fakes'

for (const surface of EVERY_SURFACE) {
  test(`a tool call is stamped when it starts and its result when it ends, on the ${surface}`, async ($, on) => {
    const { clock, toolIds } = boot(on, { toolMs: 3 * MINUTE })
    await start($)

    await clock.advance(2 * MINUTE)
    const running = $.tool.call({ tool: 'Bash', command: 'ls' })
    await clock.settle()
    const id = toolIds[0] ?? ''
    await clock.advance(3 * MINUTE)
    await running

    const use = await mountRow($, 'ToolUse', id, { surface })
    const done = await mountRow($, 'ToolResult', id, { surface })

    expect(id).not.toBe('')
    expect(await stampOf(use)).toBe('09:14')
    expect(await stampOf(done)).toBe('09:17')
    await use.unmount()
    await done.unmount()
  })
}

test('the row appended for a call that already started keeps the start time', async ($, on) => {
  const { clock, toolIds } = boot(on, { toolMs: MINUTE })
  await start($)
  const running = $.tool.call({ tool: 'Bash', command: 'ls' })
  await clock.settle()
  const id = toolIds[0] ?? ''
  await clock.advance(MINUTE)
  await running

  // The call block and its result are appended after the call, as a late hook would.
  await clock.advance(5 * MINUTE)
  await $.session.append(call('c-1', id))
  await $.session.append(result('r-1', id))
  const use = await mountRow($, 'ToolUse', id)
  const done = await mountRow($, 'ToolResult', id)

  expect(await stampOf(use)).toBe('09:12')
  expect(await stampOf(done)).toBe('09:13')
  await use.unmount()
  await done.unmount()
})

// A plugin above this one holds the call (a permission wait) after noting its id.
const GATE: Plugin = {
  name: 'gate',
  tier: 'prepend',
  register: on => {
    on('tool.call', async ($, e, next) => {
      $.ui.log(`gated ${e.tool_use_id}`, { to: 'debug' })
      await $.clock.sleep(2 * 60_000)

      return next(e)
    })
  },
}

test(
  'a call block appended before the call starts is replaced by the start time',
  { plugins: [GATE] },
  async ($, on) => {
    const { clock, logs } = boot(on)
    await start($)

    const running = $.tool.call({ tool: 'Bash', command: 'ls' })
    await clock.settle()
    const id = logs.find(line => line.startsWith('gated '))?.slice(6) ?? ''
    expect(id).not.toBe('')
    await $.session.append(call('c-1', id))
    const before = await mountRow($, 'ToolUse', id)
    expect(await stampOf(before)).toBe('09:12')

    await clock.advance(2 * MINUTE)
    await running
    await before.redraw()

    expect(await stampOf(before)).toBe('09:14')
    await before.unmount()
  },
)

test('a tool group is stamped with the start of its first call', async ($, on) => {
  const { clock, toolIds } = boot(on, { toolMs: MINUTE })
  await start($)
  const first = $.tool.call({ tool: 'Read', file_path: '/a' })
  await clock.settle()
  await clock.advance(MINUTE)
  await first
  const second = $.tool.call({ tool: 'Read', file_path: '/b' })
  await clock.settle()
  await clock.advance(MINUTE)
  await second

  const [one = '', two = ''] = toolIds
  const group = (calls: readonly string[]) =>
    calls.map(id => ({
      tool_use_id: id,
      tool: 'Read',
      input: {},
      isRunning: false,
      isErrored: false,
      isInterrupted: false,
    }))
  const ui = await mountRow($, 'ToolGroup', 'group-1', {
    props: { calls: group([one, two]) },
  })

  expect(await stampOf(ui)).toBe('09:12')
  await ui.unmount()
})

test('a tool group whose calls carry no id is stamped from when it was first drawn', async ($, on) => {
  const { clock } = boot(on)
  await start($)
  const ui = await mountRow($, 'ToolGroup', 'group-2', {
    props: {
      calls: [
        {
          tool: 'Read',
          input: {},
          isRunning: false,
          isErrored: false,
          isInterrupted: false,
        },
      ],
    },
  })
  expect(await stampOf(ui)).toBeUndefined()

  await clock.settle()
  expect(await stampOf(ui)).toBe('~09:12')
  await ui.unmount()
})

test("a subagent call is stamped like the main loop's", async ($, on) => {
  const { toolIds } = boot(on)
  await start($)

  await $.tool.call({ tool: 'Bash', command: 'ls', agentId: 'agent-1' })
  const ui = await mountRow($, 'ToolUse', toolIds[0] ?? '')

  expect(await stampOf(ui)).toBe('09:12')
  await ui.unmount()
})

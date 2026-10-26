import type { EngineInterface, RenderElement, RenderInput } from 'claude-code'

import type { TimestampsConfig } from '../types'
import { readLast, readTick } from './atoms'
import { bandVariants, fitLabel, isBandShown, textProps } from './format'

/**
 * The line above the prompt with the time of the last prompt and the last
 * reply. Undefined when it has nothing to say (or a survey holds the band), so
 * the engine's own drawing stands.
 */
export async function renderBand(
  $: EngineInterface,
  e: RenderInput<'AbovePrompt'>,
  config: TimestampsConfig,
): Promise<RenderElement | undefined> {
  if (e.props.hasSurvey) return undefined

  const isStatic =
    e.surface === 'terminal' && e.viewport?.isFullscreen === false
  if (!isBandShown(config.band, isStatic)) return undefined

  const last = await readLast($)
  if (last.you === 0 && last.claude === 0) return undefined

  const now = await $.clock.now()
  // The minute tick draws the band again, so its ages keep up.
  if (config.show !== 'time') await readTick($, 'min')

  const label = fitLabel(bandVariants(config, last, now), e.props.bodyColumns)
  const { Box, Text } = $.ui.resolve(e)

  return (
    <Box>
      <Text
        {...textProps(config, Math.max(last.you, last.claude), false)}
        wrap="truncate-end"
      >
        {label}
      </Text>
    </Box>
  )
}

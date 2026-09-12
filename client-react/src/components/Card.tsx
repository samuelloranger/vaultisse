import { styled, Text, View } from 'tamagui'

/**
 * The `.pb-card` motif from the old stylesheet: a surface on the page ground,
 * hairline border, 14px radius, border darkening on hover.
 *
 * `styled(View)` rather than Tamagui's own `Card`: `Card` brings a size scale
 * and press behaviour this app never uses, and the visual identity here is
 * three properties.
 */
export const Card = styled(View, {
  name: 'Card',
  backgroundColor: '$surface',
  borderWidth: 1,
  borderColor: '$borderColor',
  borderRadius: '$card',
  padding: '$4',
  // Tamagui applies `hoverStyle` through a `:hover` rule, so it simply never
  // matches on touch. That makes it safe as *emphasis* — it must never be the
  // only way to discover an action.
  hoverStyle: { borderColor: '$borderColorStrong' },

  variants: {
    /** The `.pb-spine` nod to a book spine on a shelf. */
    spine: {
      left: { borderLeftWidth: 3, borderLeftColor: '$accent' },
      top: { borderTopWidth: 3, borderTopColor: '$accent' },
    },
    flush: {
      true: { padding: 0 },
    },
  } as const,
})

/** `.pb-eyebrow`: the small mono all-caps label above a section title. */
export const Eyebrow = styled(Text, {
  name: 'Eyebrow',
  fontFamily: '$mono',
  fontSize: 11,
  fontWeight: '500',
  letterSpacing: 1.1,
  textTransform: 'uppercase',
  color: '$secondary',
})

/** `.pb-display`: the serif face, for titles only. */
export const DisplayText = styled(Text, {
  name: 'DisplayText',
  fontFamily: '$heading',
  color: '$color',
})

/** Secondary copy — counts, captions, "3 of 12". */
export const MutedText = styled(Text, {
  name: 'MutedText',
  fontFamily: '$body',
  color: '$colorMuted',
  fontSize: 14,
})

// Heading fonts the couple can pick instead of the theme's own. All ship with the app.
export const DISPLAY_FONTS = {
  playfair: 'Playfair Display',
  garamond: 'EB Garamond',
  fraunces: 'Fraunces',
  lora: 'Lora',
} as const

export type DisplayFont = keyof typeof DISPLAY_FONTS

export function displayFamily(font: string | undefined, fallback: string) {
  const name = DISPLAY_FONTS[font as DisplayFont]
  return name ? `'${name}', Georgia, serif` : fallback
}

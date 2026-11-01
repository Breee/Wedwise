import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { publicContentQuery } from '@/lib/queries'
import type { Theme } from '@/lib/types'

const COLOR_VARS: Record<keyof Theme['colors'], string[]> = {
  background: ['--background'],
  foreground: ['--foreground', '--card-foreground', '--popover-foreground'],
  card: ['--card', '--popover'],
  primary: ['--primary'],
  primaryForeground: ['--primary-foreground'],
  secondary: ['--secondary'],
  secondaryForeground: ['--secondary-foreground'],
  muted: ['--muted'],
  mutedForeground: ['--muted-foreground'],
  accent: ['--accent'],
  accentForeground: ['--accent-foreground'],
  border: ['--border', '--input'],
  ring: ['--ring'],
  gold: ['--gold'],
  sage: ['--sage'],
  blush: ['--blush'],
}

const FONT_LINK_ID = 'theme-fonts'

export function applyTheme(theme: Theme) {
  const root = document.documentElement
  for (const [key, vars] of Object.entries(COLOR_VARS) as [keyof Theme['colors'], string[]][]) {
    for (const v of vars) root.style.setProperty(v, theme.colors[key])
  }
  root.style.setProperty('--font-display-family', theme.fonts.display)
  root.style.setProperty('--font-script-family', theme.fonts.script)
  root.style.setProperty('--font-body-family', theme.fonts.body)
  root.dataset.decoration = theme.decoration
  root.dataset.theme = theme.name

  let link = document.getElementById(FONT_LINK_ID) as HTMLLinkElement | null
  if (!link) {
    link = document.createElement('link')
    link.id = FONT_LINK_ID
    link.rel = 'stylesheet'
    document.head.appendChild(link)
  }
  if (link.href !== theme.fonts.googleFonts) link.href = theme.fonts.googleFonts
}

export function ThemeApplier() {
  const { data } = useQuery(publicContentQuery)
  useEffect(() => {
    if (data?.theme) applyTheme(data.theme)
  }, [data?.theme])
  return null
}

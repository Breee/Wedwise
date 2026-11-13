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

const CACHE_KEY = 'wedwise:theme-vars'

export function applyTheme(theme: Theme) {
  const root = document.documentElement
  const vars: Record<string, string> = {}
  for (const [key, list] of Object.entries(COLOR_VARS) as [keyof Theme['colors'], string[]][]) {
    for (const v of list) vars[v] = theme.colors[key]
  }
  vars['--font-display-family'] = theme.fonts.display
  vars['--font-script-family'] = theme.fonts.script
  vars['--font-body-family'] = theme.fonts.body
  for (const [v, value] of Object.entries(vars)) root.style.setProperty(v, value)
  root.dataset.decoration = theme.decoration
  root.dataset.theme = theme.name
  // Read by the inline bootstrap script in index.html to avoid a flash of the default palette.
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ vars, decoration: theme.decoration, theme: theme.name }))
  } catch {
    /* storage unavailable */
  }

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
  useEffect(() => {
    if (!data) return
    const names = data.event.couple.map((c) => c.name).filter(Boolean)
    document.title = names.length === 2 ? `${names[0]} & ${names[1]}` : data.event.title || document.title
  }, [data])
  return null
}

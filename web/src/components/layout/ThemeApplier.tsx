import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { publicContentQuery } from '@/lib/queries'
import { displayFamily } from '@/lib/fonts'
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


const CACHE_KEY = 'wedwise:theme-vars'

export function applyTheme(theme: Theme, font?: string) {
  const root = document.documentElement
  const vars: Record<string, string> = {}
  for (const [key, list] of Object.entries(COLOR_VARS) as [keyof Theme['colors'], string[]][]) {
    for (const v of list) vars[v] = theme.colors[key]
  }
  vars['--font-display-family'] = displayFamily(font, theme.fonts.display)
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
}

// Draws the logo in the theme colours so the tab icon follows the chosen style.
function applyFavicon(theme: Theme) {
  const image = new Image()
  image.onload = () => {
    const size = 64
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(image, 4, 4, size - 8, size - 8)
    ctx.globalCompositeOperation = 'source-in'
    ctx.fillStyle = theme.colors.primaryForeground
    ctx.fillRect(0, 0, size, size)
    ctx.globalCompositeOperation = 'destination-over'
    ctx.fillStyle = theme.colors.primary
    ctx.beginPath()
    ctx.roundRect(0, 0, size, size, 14)
    ctx.fill()
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (link) link.href = canvas.toDataURL('image/png')
  }
  image.src = '/logo.png'
}

export function ThemeApplier() {
  const { data } = useQuery(publicContentQuery)
  useEffect(() => {
    if (!data?.theme) return
    applyTheme(data.theme, data.content.displayFont)
    applyFavicon(data.theme)
  }, [data?.theme, data?.content.displayFont])
  useEffect(() => {
    if (!data) return
    const names = data.event.couple.map((c) => c.name).filter(Boolean)
    document.title = names.length === 2 ? `${names[0]} & ${names[1]}` : data.event.title || document.title
  }, [data])
  return null
}

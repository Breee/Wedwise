import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

const SECTIONS = [
  { id: 'ablauf', label: 'Ablauf' },
  { id: 'ort', label: 'Ort' },
  { id: 'anreise', label: 'Anreise' },
  { id: 'unterkunft', label: 'Unterkunft' },
  { id: 'faq', label: 'FAQ' },
]

export function SectionNav() {
  const [present, setPresent] = useState<string[]>([])
  const [active, setActive] = useState<string | null>(null)

  useEffect(() => {
    const elements = SECTIONS.map((s) => document.getElementById(s.id)).filter((el) => el !== null)
    setPresent(elements.map((el) => el.id))
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(entry.target.id)
        }
      },
      { rootMargin: '-45% 0px -50% 0px' },
    )
    elements.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  if (present.length < 2) return null

  return (
    <nav
      aria-label="Abschnitte"
      className="sticky top-16 z-30 border-b border-border/60 bg-background/85 backdrop-blur-md"
    >
      <ul className="mx-auto flex max-w-5xl justify-start gap-1 overflow-x-auto px-3 [scrollbar-width:none] sm:justify-center">
        {SECTIONS.filter((s) => present.includes(s.id)).map((s) => (
          <li key={s.id} className="shrink-0">
            <a
              href={`#${s.id}`}
              aria-current={active === s.id ? 'true' : undefined}
              className={cn(
                'inline-flex h-11 items-center border-b-2 border-transparent px-3 text-sm text-muted-foreground transition-colors hover:text-primary',
                active === s.id && 'border-primary font-medium text-primary',
              )}
            >
              {s.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}

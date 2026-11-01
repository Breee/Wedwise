import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { publicContentQuery } from '@/lib/queries'
import { formatDate } from '@/lib/format'

const KEY = 'wedwise:intro-seen'

export function InviteIntro() {
  const reduced = useReducedMotion()
  const { data } = useQuery(publicContentQuery)
  const [open, setOpen] = useState(() => !reduced && sessionStorage.getItem(KEY) !== '1')

  useEffect(() => {
    if (!open) sessionStorage.setItem(KEY, '1')
  }, [open])

  const names = data?.event.couple.map((c) => c.name).filter(Boolean) ?? []
  const title = names.length ? names.join(' & ') : (data?.event.title ?? '')
  const date = data ? formatDate(data.event.date) : ''

  return (
    <AnimatePresence>
      {open && data && (
        <motion.button
          type="button"
          aria-label="Weiter zur Einladung"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-50 flex cursor-pointer flex-col items-center justify-center bg-background px-6 text-center"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.9, ease: 'easeInOut' } }}
        >
          <motion.div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(ellipse at 50% 40%, color-mix(in oklab, var(--secondary) 55%, transparent), transparent 65%)',
            }}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1.1 }}
            transition={{ duration: 4, ease: 'easeOut' }}
          />
          <motion.p
            className="relative text-xs font-medium text-primary uppercase"
            initial={{ opacity: 0, letterSpacing: '0.1em' }}
            animate={{ opacity: 1, letterSpacing: '0.45em' }}
            transition={{ duration: 1.6, ease: [0.22, 1, 0.36, 1], delay: 0.3 }}
          >
            Ihr seid eingeladen
          </motion.p>
          <motion.div
            className="relative my-7 h-px w-24 bg-gold"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 1.2, ease: 'easeInOut', delay: 0.9 }}
          />
          <motion.h1
            className="relative font-display text-5xl leading-tight font-medium text-foreground md:text-7xl"
            initial={{ opacity: 0, y: 24, filter: 'blur(14px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ duration: 1.8, ease: [0.22, 1, 0.36, 1], delay: 1.3 }}
          >
            {title}
          </motion.h1>
          <motion.p
            className="relative mt-6 font-display text-xl text-muted-foreground md:text-2xl"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.2, ease: 'easeOut', delay: 2.4 }}
          >
            {date}
          </motion.p>
          <motion.span
            className="absolute bottom-8 text-xs tracking-[0.3em] text-muted-foreground/70 uppercase"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 3.2, duration: 0.8 }}
          >
            Tippen, um fortzufahren
          </motion.span>
        </motion.button>
      )}
    </AnimatePresence>
  )
}

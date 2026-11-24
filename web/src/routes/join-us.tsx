import { useEffect, useState } from 'react'
import { t } from '@/lib/i18n'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery } from '@tanstack/react-query'
import { motion, useAnimationControls } from 'motion/react'
import { ApiError, api } from '@/lib/api'
import { publicContentQuery } from '@/lib/queries'
import { DuskScene, type SceneVariant } from '@/components/rsvp/DuskIntro'

const LENGTH = 6
const SCENES: SceneVariant[] = ['dusk', 'forest', 'night']
const EASE = [0.22, 1, 0.36, 1] as const

export const Route = createFileRoute('/join-us')({
  validateSearch: (s: Record<string, unknown>): { code?: string } => (typeof s.code === 'string' ? { code: s.code } : {}),
  component: JoinPage,
})

const clean = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, LENGTH)

function JoinPage() {
  const navigate = useNavigate()
  const given = Route.useSearch().code
  const { data } = useQuery(publicContentQuery)
  const deco = data?.theme?.decoration as SceneVariant | undefined
  const [code, setCode] = useState(() => clean(given ?? ''))
  const [focused, setFocused] = useState(false)
  const row = useAnimationControls()

  const open = useMutation({
    mutationFn: (value: string) => api.post<{ link: string }>('/rsvp/code', { code: value }),
    // The light fills the screen before the invitation takes over.
    onSuccess: ({ link }) => setTimeout(() => navigate({ to: '/rsvp/$link', params: { link }, replace: true }), 1500),
    onError: () => {
      setCode('')
      row.start({ x: [0, -12, 12, -8, 8, 0], transition: { duration: 0.45 } })
    },
  })

  const submit = open.mutate
  useEffect(() => {
    if (code.length === LENGTH) submit(code)
  }, [code, submit])

  const opened = open.isSuccess
  const busy = open.isPending || opened
  return (
    <div className="fixed inset-0 overflow-hidden bg-[#121c17] text-[#f4efe2]">
      <DuskScene variant={deco && SCENES.includes(deco) ? deco : 'night'} />
      <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/55 to-black/80" />
      <div className="relative mx-auto max-w-xl px-6 pt-[14svh] text-center [text-shadow:0_1px_3px_rgba(0,0,0,0.9),0_2px_22px_rgba(0,0,0,0.75)]">
        <motion.p
          className="text-sm font-medium text-[#ecdcb0] uppercase"
          initial={{ opacity: 0, letterSpacing: '0.1em' }}
          animate={{ opacity: 1, letterSpacing: '0.45em' }}
          transition={{ duration: 1.6, ease: EASE }}
        >
          {t('Ihr seid eingeladen')}
        </motion.p>
        <motion.h1
          className="mt-5 font-display text-4xl leading-tight sm:text-5xl"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.1, delay: 0.3, ease: EASE }}
        >
          {t('Euer Code')}
        </motion.h1>

        <motion.div
          className="relative mx-auto mt-8 w-fit"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 0.7 }}
        >
          <motion.div className="flex gap-2 sm:gap-3" animate={row} aria-hidden>
            {Array.from({ length: LENGTH }, (_, i) => (
              <Slot key={i} char={code[i]} active={focused && !busy && i === code.length} lit={opened} index={i} />
            ))}
          </motion.div>
          <input
            value={code}
            onChange={(e) => {
              if (busy) return
              open.reset()
              setCode(clean(e.target.value))
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            readOnly={busy}
            aria-label={t('Euer Code')}
            aria-describedby="join-hint"
            autoFocus
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
            maxLength={LENGTH}
            className="absolute inset-0 size-full cursor-pointer opacity-0"
          />
        </motion.div>

        <p id="join-hint" className="mt-6 h-12 text-base" role="status">
          {open.isError
            ? open.error instanceof ApiError && open.error.status === 429
              ? t('Zu viele Versuche. Bitte wartet einen Moment.')
              : t('Dieser Code passt nicht.')
            : !opened && t('Ihr findet ihn auf eurer Einladung.')}
        </p>
      </div>

      {opened && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute top-[38svh] left-1/2 size-24 -translate-x-1/2 rounded-full bg-[radial-gradient(circle,#fff6cf_0%,#f7e9a8_35%,rgba(247,233,168,0)_70%)]"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 40, opacity: [0, 1, 1] }}
          transition={{ duration: 1.3, delay: 0.5, ease: 'easeIn' }}
        />
      )}
    </div>
  )
}

// One character of the code. A typed character lands like a firefly settling.
function Slot({ char, active, lit, index }: { char?: string; active: boolean; lit: boolean; index: number }) {
  return (
    <motion.span
      className={`relative flex h-14 w-11 items-center justify-center rounded-lg border bg-black/35 backdrop-blur-sm sm:h-16 sm:w-13 ${
        char || active ? 'border-[#f7e9a8]' : 'border-[#d9c9a3]/45'
      }`}
      animate={
        lit
          ? { y: [0, -10, 0], boxShadow: '0 0 28px 6px rgba(247,233,168,0.85)' }
          : { y: 0, boxShadow: char ? '0 0 16px 2px rgba(247,233,168,0.45)' : '0 0 0 0 rgba(247,233,168,0)' }
      }
      transition={lit ? { duration: 0.5, delay: index * 0.07 } : { duration: 0.3 }}
    >
      {char ? (
        <motion.span
          key={char}
          className="font-display text-3xl text-[#fff6cf]"
          initial={{ opacity: 0, scale: 2.2, filter: 'blur(8px)' }}
          animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
          transition={{ type: 'spring', stiffness: 420, damping: 22 }}
        >
          {char}
        </motion.span>
      ) : (
        active && <span className="h-7 w-px animate-pulse bg-[#f7e9a8]" />
      )}
    </motion.span>
  )
}

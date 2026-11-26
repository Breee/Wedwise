import { useEffect, useState } from 'react'
import { t } from '@/lib/i18n'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery } from '@tanstack/react-query'
import { motion, useAnimationControls } from 'motion/react'
import { ApiError, api } from '@/lib/api'
import { inviteLinkQuery, publicContentQuery } from '@/lib/queries'
import { greeting } from '@/lib/format'
import { Invitation } from '@/components/rsvp/Invitation'
import { Opening, Stage } from '@/components/rsvp/Opening'

const LENGTH = 6
const EASE = [0.22, 1, 0.36, 1] as const

export const Route = createFileRoute('/join-us')({
  validateSearch: (s: Record<string, unknown>): { code?: string } => (typeof s.code === 'string' ? { code: s.code } : {}),
  component: JoinPage,
})

const clean = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, LENGTH)

// A tab that already opened a code shows the invitation straight away after a
// reload, without playing the opening again.
const openedKey = (code: string) => `wedwise.opened.${code}`
function openedBefore(code: string) {
  try {
    return sessionStorage.getItem(openedKey(code)) !== null
  } catch {
    return false
  }
}

function JoinPage() {
  const navigate = useNavigate()
  const { code: given } = Route.useSearch()
  const { data } = useQuery(publicContentQuery)
  const [code, setCode] = useState(() => clean(given ?? ''))
  const [focused, setFocused] = useState(false)
  // A link that carries the code needs no typing.
  const [typing, setTyping] = useState(() => code.length < LENGTH)
  const [resume, setResume] = useState(() => !typing && openedBefore(code))
  const [shown, setShown] = useState(false)
  const [lit, setLit] = useState(false)
  const row = useAnimationControls()

  const open = useMutation({
    mutationFn: (value: string) => api.post<{ link: string }>('/rsvp/code', { code: value }),
    onError: () => {
      setResume(false)
      setTyping(true)
      setCode('')
      row.start({ x: [0, -12, 12, -8, 8, 0], transition: { duration: 0.45 } })
    },
  })

  const submit = open.mutate
  useEffect(() => {
    if (code.length === LENGTH) submit(code)
  }, [code, submit])

  const busy = open.isPending || open.isSuccess
  const link = open.data?.link
  const invited = useQuery({ ...inviteLinkQuery(link ?? ''), enabled: !!link }).data
  const dear = invited ? greeting(invited.guests, invited.salutation) : ''

  useEffect(() => {
    if (resume && link) setShown(true)
  }, [resume, link])

  // The code goes into the address. A reload plays the opening again, unless
  // the guest has reached the reply form: then it comes straight back there.
  useEffect(() => {
    if (!shown) return
    if (given !== code) navigate({ to: '/join-us', search: { code }, replace: true })
    const reply = document.getElementById('antwort')
    if (!reply) return
    const seen = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return
        try {
          sessionStorage.setItem(openedKey(code), '1')
        } catch {
          // Without storage a reload plays the opening again.
        }
        seen.disconnect()
      },
      { threshold: 0.5 },
    )
    seen.observe(reply)
    return () => seen.disconnect()
  }, [shown, code, given, navigate])

  if (shown && link && invited) return <Invitation link={link} lit={lit} />
  if (resume) return <div className="fixed inset-0 bg-[#121c17]" />

  return (
    <Stage scene={data?.theme?.decoration} className="fixed inset-0">
      {link && invited ? (
        <Opening
          dear={dear}
          headline={!dear ? t('Es ist endlich so weit') : invited.guests.length === 1 ? t('wir haben etwas für dich') : t('wir haben etwas für euch')}
          names={data?.event.couple?.map((c) => c.name).join(' & ') || data?.event.title}
          date={data?.event.date}
          venue={data?.content.location?.name}
          writing={data?.content.inviteWriting || 'letters'}
          onDone={(written) => {
            setLit(written)
            setShown(true)
          }}
        />
      ) : (
        typing && (
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

            <motion.div className="mt-8" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1, delay: 0.7 }}>
              <div className="relative mx-auto w-fit">
                <motion.div className="flex gap-2 sm:gap-3" animate={row} aria-hidden>
                  {Array.from({ length: LENGTH }, (_, i) => (
                    <Slot key={i} char={code[i]} active={focused && !busy && i === code.length} lit={open.isSuccess} index={i} />
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
                  className="absolute inset-0 z-50 size-full cursor-pointer opacity-0"
                />
              </div>
            </motion.div>

            <p id="join-hint" className="mt-6 h-12 text-base" role="status">
              {open.isError
                ? open.error instanceof ApiError && open.error.status === 429
                  ? t('Zu viele Versuche. Bitte wartet einen Moment.')
                  : t('Dieser Code passt nicht.')
                : t('Ihr findet ihn auf eurer Einladung.')}
            </p>
          </div>
        )
      )}
    </Stage>
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

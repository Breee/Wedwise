import { useEffect, useState } from 'react'
import { t } from '@/lib/i18n'
import { Share, Smartphone } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
}

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

export function InstallApp() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(isStandalone)

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setPrompt(e as InstallPromptEvent)
    }
    const onInstalled = () => setInstalled(true)
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (installed || (!prompt && !isIos())) return null

  return (
    <div className="mx-auto max-w-md space-y-2 rounded-lg border bg-secondary/40 p-4 text-left">
      <p className="flex items-center gap-2 font-medium">
        <Smartphone className="size-4 text-primary" /> {t('Als App aufs Handy')}
      </p>
      <p className="text-sm text-muted-foreground">
        {t('So habt ihr alle Infos immer dabei und könnt eure Antwort jederzeit ändern – ganz ohne Link.')}
      </p>
      {prompt ? (
        <Button type="button" variant="outline" onClick={() => prompt.prompt().then(() => setPrompt(null))}>
          {t('App installieren')}
        </Button>
      ) : (
        <p className="text-sm">
          {t('Tippt in Safari auf')} <Share className="inline size-4 align-[-2px]" /> <span className="font-medium">{t('Teilen')}</span> {t('und dann auf')}{' '}
          <span className="font-medium">{t('„Zum Home-Bildschirm“')}</span>.
        </p>
      )}
    </div>
  )
}

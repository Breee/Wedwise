import { useEffect, useState } from 'react'
import { t } from '@/lib/i18n'
import { Download, Share } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || ('standalone' in navigator && navigator.standalone === true)
}

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

export function InstallApp() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(isStandalone)
  const [help, setHelp] = useState(false)

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

  if (installed) return null

  const install = () => {
    if (prompt) {
      void prompt.prompt()
      setPrompt(null)
    } else {
      setHelp(true)
    }
  }

  return (
    <>
      <Button onClick={install} className="w-full">
        <Download className="size-4" /> {t('App installieren')}
      </Button>
      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('App installieren')}</DialogTitle>
            <DialogDescription>
              {t('So habt ihr alle Infos immer dabei und könnt eure Antwort jederzeit ändern – ganz ohne Link.')}
            </DialogDescription>
          </DialogHeader>
          {isIos() ? (
            <p className="text-sm">
              {t('Tippt in Safari auf')} <Share className="inline size-4 align-[-2px]" /> <strong>{t('Teilen')}</strong>{' '}
              {t('und dann auf')} <strong>{t('„Zum Home-Bildschirm“')}</strong>.
            </p>
          ) : window.isSecureContext ? (
            <p className="text-sm">
              {t('Öffnet das Browser-Menü')} <strong>⋮</strong> {t('und tippt auf')}{' '}
              <strong>{t('„App installieren“ oder „Zum Startbildschirm hinzufügen“')}</strong>.
            </p>
          ) : (
            <p className="text-sm">
              {t('Die Installation klappt nur über die sichere Adresse der Seite (https://). Öffnet die Seite über den Link aus eurer Einladung.')}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

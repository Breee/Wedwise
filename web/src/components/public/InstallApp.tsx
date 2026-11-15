import { useEffect, useState, useSyncExternalStore } from 'react'
import { t } from '@/lib/i18n'
import { installOffer, onInstallOffer, takeInstallOffer } from '@/lib/install'
import { Download, Share } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || ('standalone' in navigator && navigator.standalone === true)
}

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

export function InstallApp() {
  const offered = useSyncExternalStore(onInstallOffer, installOffer)
  const [installed, setInstalled] = useState(isStandalone)
  const [help, setHelp] = useState(false)

  useEffect(() => {
    const onInstalled = () => setInstalled(true)
    window.addEventListener('appinstalled', onInstalled)
    return () => window.removeEventListener('appinstalled', onInstalled)
  }, [])

  if (installed) return null

  const install = () => {
    if (offered) {
      void takeInstallOffer()?.prompt()
    } else {
      setHelp(true)
    }
  }

  return (
    <>
      <Button onClick={install} variant="outline" size="sm">
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

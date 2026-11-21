import { t } from '@/lib/i18n'
import { copyText } from '@/lib/clipboard'
import { Button } from '@/components/ui/button'

// Shown after a passkey attempt failed. Browsers built into apps cannot reach
// the device's passkeys, and nothing tells the page that beforehand.
export function PasskeyHelp({ className }: { className?: string }) {
  return (
    <div className={`space-y-3 rounded-lg border bg-muted/50 p-4 text-sm ${className ?? ''}`} role="note">
      <p>{t('Habt ihr die Seite aus einer App wie WhatsApp geöffnet? Dort geht ein Passkey nicht. Öffnet die Seite in eurem Browser.')}</p>
      <Button type="button" size="sm" variant="outline" className="w-full" onClick={() => copyText(location.href, t('Kopiert.'))}>
        {t('Link kopieren')}
      </Button>
    </div>
  )
}

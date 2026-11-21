import { t } from '@/lib/i18n'
import { copyText } from '@/lib/clipboard'
import { inAppBrowser } from '@/lib/webauthn'
import { Button } from '@/components/ui/button'

// Shown where a passkey would be offered, when the page runs inside an app's
// built-in browser and so cannot use one.
export function OpenInBrowser({ className }: { className?: string }) {
  if (!inAppBrowser()) return null
  return (
    <div className={`space-y-3 rounded-lg border bg-muted/50 p-4 text-sm ${className ?? ''}`} role="note">
      <p>
        {t('Öffnet diese Seite in Safari, um euch ohne Passwort mit Face ID oder Touch ID anzumelden. Hier in der App geht das nicht.')}
      </p>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="w-full"
        onClick={() => copyText(location.href, t('Kopiert. Jetzt in Safari einfügen.'))}
      >
        {t('Link kopieren')}
      </Button>
    </div>
  )
}

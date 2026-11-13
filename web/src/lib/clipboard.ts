import { toast } from 'sonner'
import { api } from '@/lib/api'
import { t } from '@/lib/i18n'

// navigator.clipboard only exists on HTTPS or localhost, so plain HTTP needs the textarea fallback.
async function write(text: string): Promise<boolean> {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // fall through
    }
  }
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.appendChild(area)
  area.select()
  area.setSelectionRange(0, text.length)
  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }
  area.remove()
  return ok
}

export async function copyText(text: string, success: string) {
  if (await write(text)) toast.success(success)
  else toast.error(t('Kopieren hat nicht geklappt. Bitte markiert den Text und kopiert ihn von Hand.'))
}

// Copied links give access to guest data, so each copy goes into the audit log.
export function reportLinkCopy(kind: 'invite-link' | 'response', id: number) {
  api.post('/audit-log/events', { action: 'link.copy', kind, id }).catch(() => {})
}

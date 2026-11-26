import { useState, type CSSProperties } from 'react'
import { RotateCcw } from 'lucide-react'
import { t } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { Opening, Stage, type Writing } from '@/components/rsvp/Opening'

// The opening of an invitation in a phone-sized frame, with the settings as
// they are in the editor, saved or not.
export function OpeningPreview({ scene, font, names, date, venue, writing }: { scene?: string; font: string; names: string; date?: string; venue?: string; writing: Writing }) {
  const [round, setRound] = useState(0)
  const frame = { '--stage-s': '100cqh', '--stage-l': '100cqh', '--font-display': font } as CSSProperties
  return (
    <div className="grid justify-items-center gap-3">
      <Stage scene={scene} className="relative aspect-[9/16] w-[22.5rem] max-w-full rounded-[2rem] border-4 border-foreground/80 shadow-lg" style={frame}>
        <Opening key={`${round} ${scene} ${font} ${names} ${writing}`} headline={t('Es ist endlich so weit')} names={names} date={date} venue={venue} writing={writing} />
      </Stage>
      <Button type="button" variant="outline" size="sm" onClick={() => setRound((n) => n + 1)}>
        <RotateCcw /> {t('Nochmal abspielen')}
      </Button>
    </div>
  )
}

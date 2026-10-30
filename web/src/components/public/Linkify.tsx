import { Fragment } from 'react'

const URL_RE = /(https?:\/\/[^\s)]+)/g

function linkLabel(url: string): string {
  if (/google\.[a-z.]+\/maps|maps\.app\.goo\.gl|openstreetmap/.test(url)) return 'Auf der Karte ansehen ↗'
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

export function Linkify({ text }: { text: string }) {
  const parts = text.split(URL_RE)
  return (
    <>
      {parts.map((part, i) =>
        URL_RE.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noreferrer"
            className="text-primary underline decoration-primary/30 underline-offset-4 hover:decoration-primary"
          >
            {linkLabel(part)}
          </a>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  )
}

export function Paragraphs({ text, className }: { text: string; className?: string }) {
  return (
    <>
      {text
        .split(/\n{2,}|\n/)
        .filter((p) => p.trim() !== '')
        .map((p, i) => (
          <p key={i} className={className}>
            <Linkify text={p} />
          </p>
        ))}
    </>
  )
}

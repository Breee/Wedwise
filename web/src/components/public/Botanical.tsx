const CORNERS = [
  'top-0 left-0',
  'top-0 right-0 -scale-x-100',
  'bottom-0 left-0 -scale-y-100',
  'right-0 bottom-0 -scale-100',
] as const

/** Botanical corner sprigs; only rendered when the active theme uses the botanical decoration. */
export function BotanicalCorners({ size = 'lg' }: { size?: 'sm' | 'lg' }) {
  const dim = size === 'lg' ? 'w-40 sm:w-56 md:w-72' : 'w-28 sm:w-36'
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 hidden [[data-decoration=botanical]_&]:block">
      {CORNERS.map((pos) => (
        <img
          key={pos}
          src="/decor/corner.png"
          alt=""
          className={`absolute ${pos} ${dim} opacity-80 select-none`}
          draggable={false}
        />
      ))}
    </div>
  )
}

export function BotanicalDivider({ className = '' }: { className?: string }) {
  return (
    <img
      aria-hidden
      src="/decor/divider.png"
      alt=""
      className={`mx-auto hidden h-12 w-auto opacity-80 select-none md:h-14 [[data-decoration=botanical]_&]:block ${className}`}
      draggable={false}
    />
  )
}

const LEAF_PATH =
  'M12 2C7 6 4 10.5 4 15a8 8 0 0 0 16 0c0-4.5-3-9-8-13Zm0 3.2c3.3 3 5.6 6.4 5.6 9.8a5.6 5.6 0 0 1-11.2 0c0-3.4 2.3-6.8 5.6-9.8ZM11.4 9v10h1.2V9h-1.2Z'

type Leaf = { left: number; delay: number; duration: number; size: number; drift: number; opacity: number }

function seeded(n: number) {
  const x = Math.sin(n * 9301 + 49297) * 233280
  return x - Math.floor(x)
}

const LEAVES: Leaf[] = Array.from({ length: 14 }, (_, i) => ({
  left: seeded(i + 1) * 100,
  delay: -seeded(i + 20) * 18,
  duration: 14 + seeded(i + 40) * 10,
  size: 10 + seeded(i + 60) * 10,
  drift: (seeded(i + 80) - 0.5) * 160,
  opacity: 0.25 + seeded(i + 100) * 0.3,
}))

export function FallingLeaves() {
  return (
    <div aria-hidden className="wed-leaves pointer-events-none absolute inset-0 overflow-hidden">
      {LEAVES.map((l, i) => (
        <span
          key={i}
          className="wed-leaf"
          style={
            {
              left: `${l.left}%`,
              width: l.size,
              height: l.size,
              opacity: l.opacity,
              '--leaf-delay': `${l.delay}s`,
              '--leaf-duration': `${l.duration}s`,
              '--leaf-drift': `${l.drift}px`,
            } as React.CSSProperties
          }
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d={LEAF_PATH} />
          </svg>
        </span>
      ))}
    </div>
  )
}

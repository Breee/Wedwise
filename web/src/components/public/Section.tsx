import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function Section({
  id,
  eyebrow,
  title,
  children,
  className,
}: {
  id?: string
  eyebrow?: string
  title: string
  children: ReactNode
  className?: string
}) {
  return (
    <motion.section
      id={id}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      className={cn('px-6 py-20', className)}
    >
      <div className="mx-auto max-w-5xl">
      <div className="mb-10 text-center">
        {eyebrow && <p className="text-xs font-medium tracking-[0.3em] text-primary uppercase">{eyebrow}</p>}
        <h2 className="mt-2 text-4xl md:text-5xl">{title}</h2>
        <div className="mx-auto mt-4 h-px w-16 bg-gold" />
      </div>
      {children}
      </div>
    </motion.section>
  )
}

import { useMemo } from "react";
import { motion, useReducedMotion } from "motion/react";

const EASE = [0.22, 1, 0.36, 1] as const;

type Firefly = {
  x: number;
  y: number;
  size: number;
  delay: number;
  duration: number;
  dx: number;
  dy: number;
  blink: number;
};

function makeFireflies(n: number): Firefly[] {
  let seed = 1337;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  return Array.from({ length: n }, () => ({
    x: 3 + rnd() * 94,
    y: 35 + rnd() * 60,
    size: 3 + rnd() * 3,
    delay: rnd() * 8,
    duration: 18 + rnd() * 14,
    dx: (rnd() - 0.5) * 120,
    dy: (rnd() - 0.5) * 80,
    blink: 2.5 + rnd() * 3.5,
  }));
}

const REVEAL_S = 5.5;

/** Through the forest to the Waldsee: layered 2.5D reveal, then mist and fireflies. */
export type SceneVariant = "dusk" | "forest" | "night";

const IMAGES: Record<SceneVariant, { wide: string; tall: string }> = {
  dusk: { wide: "/decor/lake.jpg", tall: "/decor/lake-portrait.jpg" },
  forest: {
    wide: "/forest/lake-desktop.webp",
    tall: "/forest/lake-mobile.webp",
  },
  night: {
    wide: "/decor/lake-night.jpg",
    tall: "/decor/lake-night-portrait.jpg",
  },
};

export function DuskScene({ variant = "dusk" }: { variant?: SceneVariant }) {
  const flies = useMemo(
    () => makeFireflies(variant === "night" ? 34 : 26),
    [variant],
  );
  const reduced = useReducedMotion();
  const animated = variant === "forest" && !reduced;
  const d = animated ? REVEAL_S : 0;
  const img = IMAGES[variant];
  const layer = (base: object, extra?: object) => ({ ...base, ...extra });
  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden bg-[#121c17]">
      <motion.picture
        className="absolute inset-0 block"
        initial={
          animated
            ? { scale: 1.25, filter: "brightness(0.55) blur(3px)" }
            : { opacity: 0 }
        }
        animate={
          animated
            ? { scale: 1, filter: "brightness(1) blur(0px)" }
            : { opacity: 1 }
        }
        transition={
          animated
            ? { duration: d * 0.65, delay: d * 0.12, ease: [0.22, 1, 0.36, 1] }
            : { duration: 1.5 }
        }
      >
        <source media="(max-aspect-ratio: 4/5)" srcSet={img.tall} />
        <img
          src={img.wide}
          alt=""
          className="size-full object-cover object-[50%_60%]"
          draggable={false}
        />
      </motion.picture>
      {/* mist */}
      {animated && (
        <motion.img
          src="/forest/mist.webp"
          alt=""
          className="absolute inset-x-[-15%] w-[130%] max-w-none"
          style={{ top: "52%", height: "30%", opacity: 0.55 }}
          initial={{ x: "0%" }}
          animate={animated ? { x: ["0%", "3%", "0%"] } : { x: "0%" }}
          transition={{
            duration: 40,
            repeat: Infinity,
            ease: "easeInOut",
            delay: d * 0.6,
          }}
          draggable={false}
        />
      )}
      {/* midground foliage */}
      {animated &&
        [
          { src: "/forest/foliage-mid-left.webp", side: "left", out: "-45%" },
          { src: "/forest/foliage-mid-right.webp", side: "right", out: "45%" },
        ].map((f) => (
          <motion.img
            key={f.src}
            src={f.src}
            alt=""
            className="absolute top-0 h-full w-auto max-w-none"
            style={layer(
              { [f.side]: "-6%" },
              {
                opacity: 0.9,
                maskImage: `linear-gradient(to ${f.side === "left" ? "right" : "left"}, black 55%, transparent 100%)`,
                WebkitMaskImage: `linear-gradient(to ${f.side === "left" ? "right" : "left"}, black 55%, transparent 100%)`,
              },
            )}
            initial={{ x: "0%", scale: 1.1 }}
            animate={{ x: f.out, scale: 1.2 }}
            transition={{
              duration: d * 0.7,
              delay: d * 0.15,
              ease: [0.4, 0, 0.2, 1],
            }}
            draggable={false}
          />
        ))}
      {/* foreground foliage */}
      {animated &&
        [
          {
            src: "/forest/foliage-left.webp",
            side: "left",
            out: "-80%",
            rot: -4,
          },
          {
            src: "/forest/foliage-right.webp",
            side: "right",
            out: "80%",
            rot: 4,
          },
        ].map((f) => (
          <motion.img
            key={f.src}
            src={f.src}
            alt=""
            className="absolute top-0 h-full w-auto max-w-none"
            style={layer(
              { [f.side]: "-10%" },
              {
                maskImage: `linear-gradient(to ${f.side === "left" ? "right" : "left"}, black 60%, transparent 100%)`,
                WebkitMaskImage: `linear-gradient(to ${f.side === "left" ? "right" : "left"}, black 60%, transparent 100%)`,
              },
            )}
            initial={{ x: "0%", scale: 1.2, rotate: 0 }}
            animate={{ x: f.out, scale: 1.35, rotate: f.rot }}
            transition={{
              duration: d * 0.75,
              delay: d * 0.1,
              ease: [0.4, 0, 0.2, 1],
            }}
            draggable={false}
          />
        ))}
      {/* dusk tint + readability vignette behind the title */}
      <div
        className="absolute inset-0"
        style={{
          background:
            variant === "night"
              ? "radial-gradient(ellipse 70% 45% at 50% 30%, rgba(8,12,24,0.5), transparent 70%), linear-gradient(to bottom, rgba(8,12,24,0.35) 0%, rgba(8,12,24,0.1) 45%, rgba(8,12,24,0.05) 65%, rgba(8,12,24,0.3) 100%)"
              : "radial-gradient(ellipse 70% 45% at 50% 32%, rgba(14,24,20,0.55), transparent 70%), linear-gradient(to bottom, rgba(18,30,26,0.55) 0%, rgba(18,30,26,0.25) 40%, rgba(18,30,26,0.05) 60%, rgba(18,30,26,0.4) 100%)",
        }}
      />
      {/* fireflies */}
      <motion.div
        className="absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: d * 0.6, duration: 2 }}
      >
        {flies.map((f, i) => (
          <motion.span
            key={i}
            className="absolute rounded-full"
            style={{
              left: `${f.x}%`,
              top: `${f.y}%`,
              width: f.size,
              height: f.size,
            }}
            animate={{
              x: [0, f.dx * 0.4, f.dx, f.dx * 0.6, 0],
              y: [0, f.dy * 0.6, f.dy, f.dy * 0.3, 0],
            }}
            transition={{
              duration: f.duration,
              delay: f.delay,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          >
            <motion.span
              className="block size-full rounded-full"
              style={{
                background: "#f7e9a8",
                boxShadow:
                  "0 0 10px 4px rgba(247,233,168,0.7), 0 0 26px 10px rgba(247,233,168,0.25)",
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 1, 0.2, 0.9, 0] }}
              transition={{
                duration: f.blink,
                delay: f.delay,
                repeat: Infinity,
                repeatDelay: f.blink * 0.5,
                ease: "easeInOut",
              }}
            />
          </motion.span>
        ))}
      </motion.div>
    </div>
  );
}

export function DuskTitle({
  title,
  date,
  delay = 0,
}: {
  title: string;
  date: string;
  delay?: number;
}) {
  return (
    <div
      className="relative flex flex-col items-center"
      style={{
        marginTop: "-38vh",
        textShadow: "0 2px 6px rgba(0,0,0,0.6), 0 4px 32px rgba(0,0,0,0.6)",
      }}
    >
      <motion.p
        className="text-xs font-medium text-[#d9c9a3] uppercase"
        initial={{ opacity: 0, letterSpacing: "0.1em" }}
        animate={{ opacity: 1, letterSpacing: "0.45em" }}
        transition={{ duration: 1.6, ease: EASE, delay: 0.3 + delay }}
      >
        Ihr seid eingeladen
      </motion.p>
      <div className="mt-6 overflow-hidden pb-1">
        <motion.h1
          className="font-display text-5xl leading-tight font-medium text-[#f4efe2] md:text-7xl"
          style={{ textShadow: "0 2px 24px rgba(0,0,0,0.35)" }}
          initial={{ opacity: 0, y: "105%", filter: "blur(10px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 1.8, ease: EASE, delay: 1.2 + delay }}
        >
          {title}
        </motion.h1>
      </div>
      <motion.div
        className="my-3 h-px w-[min(80vw,28rem)]"
        style={{
          background:
            "linear-gradient(to right, transparent, #d9c9a3, transparent)",
        }}
        initial={{ scaleX: 0, opacity: 0 }}
        animate={{ scaleX: 1, opacity: 1 }}
        transition={{ duration: 1.6, ease: "easeInOut", delay: 0.8 + delay }}
      />
      <motion.p
        className="font-display text-xl text-[#d9c9a3]/90 md:text-2xl"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.2, ease: "easeOut", delay: 2.4 + delay }}
      >
        {date}
      </motion.p>
    </div>
  );
}

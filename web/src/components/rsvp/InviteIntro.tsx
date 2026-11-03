import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { publicContentQuery } from "@/lib/queries";
import { formatDate } from "@/lib/format";
import { BotanicalCorners } from "@/components/public/Botanical";
import { DuskScene, DuskTitle } from "@/components/rsvp/DuskIntro";

const EASE = [0.22, 1, 0.36, 1] as const;

type Speck = {
  x: number;
  y: number;
  size: number;
  delay: number;
  duration: number;
  drift: number;
};

function makeSpecks(n: number): Speck[] {
  let seed = 42;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  return Array.from({ length: n }, () => ({
    x: 5 + rnd() * 90,
    y: 15 + rnd() * 75,
    size: 2 + rnd() * 3,
    delay: rnd() * 6,
    duration: 9 + rnd() * 8,
    drift: (rnd() - 0.5) * 60,
  }));
}

export function InviteIntro() {
  const reduced = useReducedMotion();
  const { data } = useQuery(publicContentQuery);
  const [open, setOpen] = useState(() => !reduced);
  const specks = useMemo(() => makeSpecks(12), []);

  const names = data?.event.couple.map((c) => c.name).filter(Boolean) ?? [];
  const title = names.length ? names.join(" & ") : (data?.event.title ?? "");
  const date = data ? formatDate(data.event.date) : "";
  const fancy = data?.theme?.decoration === "botanical";
  const deco = data?.theme?.decoration;
  const dusk = deco === "dusk" || deco === "forest" || deco === "night";
  const animated = deco === "forest";

  return (
    <AnimatePresence>
      {open && data && (
        <motion.button
          type="button"
          aria-label="Weiter zur Einladung"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-50 flex cursor-pointer flex-col items-center justify-center overflow-hidden bg-background px-6 text-center"
          initial={{ opacity: 1 }}
          exit={{
            opacity: 0,
            transition: { duration: 0.9, ease: "easeInOut" },
          }}
        >
          {dusk ? (
            <>
              <DuskScene variant={deco as 'dusk' | 'forest' | 'night'} />
              <DuskTitle title={title} date={date} delay={animated ? 3.3 : 0} />
              <span className="absolute top-[max(1rem,env(safe-area-inset-top))] right-4 rounded-full bg-black/25 px-4 py-2.5 text-xs tracking-[0.2em] text-[#d9c9a3]/80 uppercase backdrop-blur-sm">
                Überspringen
              </span>
              <motion.span
                className="absolute bottom-8 rounded-full bg-black/25 px-4 py-1 text-xs tracking-[0.3em] text-[#d9c9a3]/90 uppercase backdrop-blur-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 1, 0.5, 1] }}
                transition={{
                  delay: animated ? 5.5 : 3.4,
                  duration: 3,
                  repeat: Infinity,
                  repeatDelay: 0.5,
                }}
              >
                Tippen, um fortzufahren
              </motion.span>
            </>
          ) : (
            <>
              {fancy ? (
                <>
                  {/* Sunlight through the canopy: luminance map, slowly drifting */}
                  <motion.div
                    aria-hidden
                    className="absolute -inset-[12%]"
                    style={{
                      backgroundImage: "url(/decor/canopy.webp)",
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                      mixBlendMode: "soft-light",
                    }}
                    initial={{ opacity: 0, x: 0, y: 0, scale: 1 }}
                    animate={{
                      opacity: 0.9,
                      x: ["0%", "3%", "-2%", "0%"],
                      y: ["0%", "-2%", "2%", "0%"],
                      scale: [1, 1.06, 1.02, 1],
                    }}
                    transition={{
                      opacity: { duration: 3, ease: "easeOut" },
                      default: {
                        duration: 40,
                        ease: "easeInOut",
                        repeat: Infinity,
                      },
                    }}
                  />
                  <BotanicalCorners />
                  {/* Pollen in the evening light */}
                  <div aria-hidden className="absolute inset-0">
                    {specks.map((s, i) => (
                      <motion.span
                        key={i}
                        className="absolute rounded-full bg-gold"
                        style={{
                          left: `${s.x}%`,
                          top: `${s.y}%`,
                          width: s.size,
                          height: s.size,
                          boxShadow:
                            "0 0 10px 2px color-mix(in oklab, var(--gold) 55%, transparent)",
                        }}
                        initial={{ opacity: 0 }}
                        animate={{
                          opacity: [0, 0.85, 0.3, 0.9, 0],
                          y: [0, -40, -90, -140, -190],
                          x: [
                            0,
                            s.drift * 0.4,
                            s.drift * 0.2,
                            s.drift * 0.8,
                            s.drift,
                          ],
                        }}
                        transition={{
                          duration: s.duration,
                          delay: s.delay,
                          ease: "linear",
                          repeat: Infinity,
                        }}
                      />
                    ))}
                  </div>
                </>
              ) : (
                <motion.div
                  className="absolute inset-0"
                  style={{
                    background:
                      "radial-gradient(ellipse at 50% 40%, color-mix(in oklab, var(--secondary) 55%, transparent), transparent 65%)",
                  }}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1.1 }}
                  transition={{ duration: 4, ease: "easeOut" }}
                />
              )}

              <motion.p
                className="relative text-xs font-medium text-primary uppercase"
                initial={{ opacity: 0, letterSpacing: "0.1em" }}
                animate={{ opacity: 1, letterSpacing: "0.45em" }}
                transition={{ duration: 1.6, ease: EASE, delay: 0.3 }}
              >
                Ihr seid eingeladen
              </motion.p>

              {fancy ? (
                /* Names rising above the horizon, with a faint reflection below */
                <div className="relative mt-8 flex flex-col items-center">
                  <div className="overflow-hidden pb-1">
                    <motion.h1
                      className="font-display text-5xl leading-tight font-medium text-foreground md:text-7xl"
                      initial={{ opacity: 0, y: "105%", filter: "blur(10px)" }}
                      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                      transition={{ duration: 1.8, ease: EASE, delay: 1.4 }}
                    >
                      {title}
                    </motion.h1>
                  </div>
                  <motion.div
                    aria-hidden
                    className="relative my-3 h-px w-[min(80vw,28rem)] bg-gold"
                    initial={{ scaleX: 0, opacity: 0 }}
                    animate={{ scaleX: 1, opacity: 1 }}
                    transition={{
                      duration: 1.6,
                      ease: "easeInOut",
                      delay: 0.8,
                    }}
                  />
                  <div
                    aria-hidden
                    className="h-[1.2em] overflow-hidden text-5xl md:text-7xl"
                  >
                    <motion.div
                      className="font-display leading-tight font-medium text-foreground"
                      style={{
                        transform: "scaleY(-1)",
                        maskImage:
                          "linear-gradient(to top, rgba(0,0,0,0.18), transparent 80%)",
                        WebkitMaskImage:
                          "linear-gradient(to top, rgba(0,0,0,0.18), transparent 80%)",
                        filter: "blur(2px)",
                      }}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 2, delay: 2.2 }}
                    >
                      <motion.span
                        className="block"
                        animate={{ skewX: [0, 1.5, -1.2, 0], x: [0, 2, -2, 0] }}
                        transition={{
                          duration: 7,
                          repeat: Infinity,
                          ease: "easeInOut",
                        }}
                      >
                        {title}
                      </motion.span>
                    </motion.div>
                  </div>
                </div>
              ) : (
                <>
                  <motion.div
                    className="relative my-7 h-px w-24 bg-gold"
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{
                      duration: 1.2,
                      ease: "easeInOut",
                      delay: 0.9,
                    }}
                  />
                  <motion.h1
                    className="relative font-display text-5xl leading-tight font-medium text-foreground md:text-7xl"
                    initial={{ opacity: 0, y: 24, filter: "blur(14px)" }}
                    animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                    transition={{ duration: 1.8, ease: EASE, delay: 1.3 }}
                  >
                    {title}
                  </motion.h1>
                </>
              )}

              <motion.p
                className="relative mt-4 font-display text-xl text-muted-foreground md:text-2xl"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 1.2, ease: "easeOut", delay: 2.5 }}
              >
                {date}
              </motion.p>

              <motion.span
                className="absolute bottom-8 rounded-full bg-background/70 px-4 py-1 text-xs tracking-[0.3em] text-muted-foreground/80 uppercase backdrop-blur-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 1, 0.5, 1] }}
                transition={{
                  delay: 3.4,
                  duration: 3,
                  repeat: Infinity,
                  repeatDelay: 0.5,
                }}
              >
                Tippen, um fortzufahren
              </motion.span>
            </>
          )}
        </motion.button>
      )}
    </AnimatePresence>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The hero object.
 *
 * It is the product drawn literally: several supplier quotes floating in space,
 * collapsing into the one price you actually pay. Decoration that explains the
 * thing it decorates earns its place; a stock photograph would not.
 *
 * Built from CSS 3D transforms rather than an image or a WebGL canvas — it is a
 * few KB, it inherits the theme, it stays sharp at any density, and it costs no
 * network request (which matters: supplier image CDNs are already the least
 * reliable thing on the page).
 *
 * Pointer movement tilts the whole scene. Under `prefers-reduced-motion` the
 * float and the tilt both stop, leaving a still composition.
 */

interface Layer {
  /** Depth in px. Higher is nearer the viewer. */
  z: number;
  x: number;
  y: number;
  rotate: number;
  opacity: number;
}

/**
 * The layers behind the winner are deliberately blank — no supplier names, no
 * losing prices. They read as "the other quotes we checked" without putting a
 * competitor's number in front of the customer, which is the same rule the
 * results list follows.
 */
const LAYERS: Layer[] = [
  { z: -120, x: -46, y: -58, rotate: -7, opacity: 0.34 },
  { z: -60, x: 34, y: -26, rotate: 5, opacity: 0.48 },
  { z: 0, x: -18, y: 12, rotate: -3, opacity: 0.62 },
];

export function PriceStack() {
  const sceneRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const onChange = () => setReduced(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (reduced) return;

    // Tilt tracks the pointer across the whole viewport rather than only over
    // the object, so the scene feels lit from wherever the cursor is.
    function onPointerMove(event: PointerEvent) {
      const x = (event.clientX / window.innerWidth - 0.5) * 2;
      const y = (event.clientY / window.innerHeight - 0.5) * 2;
      setTilt({ x: y * -6, y: x * 9 });
    }

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    return () => window.removeEventListener("pointermove", onPointerMove);
  }, [reduced]);

  return (
    <div
      ref={sceneRef}
      className="relative mx-auto flex h-[380px] w-full max-w-[440px] items-center justify-center sm:h-[440px]"
      style={{ perspective: "1400px" }}
      aria-hidden="true"
    >
      <div
        className="relative h-[200px] w-[280px]"
        style={{
          transformStyle: "preserve-3d",
          transform: `rotateX(${8 + tilt.x}deg) rotateY(${-14 + tilt.y}deg)`,
          transition: "transform 600ms cubic-bezier(0.16, 1, 0.3, 1)",
          animation: reduced ? undefined : "float-y 7s ease-in-out infinite",
        }}
      >
        {LAYERS.map((layer, index) => (
          <div
            key={index}
            className="absolute inset-0 flex flex-col justify-between rounded-[18px] p-5 backdrop-blur-sm"
            style={{
              transform: `translate3d(${layer.x}px, ${layer.y}px, ${layer.z}px) rotate(${layer.rotate}deg)`,
              opacity: layer.opacity,
              background:
                "color-mix(in oklab, var(--color-surface) 72%, transparent)",
              border: "1px solid var(--color-border-strong)",
              boxShadow: "var(--elev-2)",
            }}
          >
            <span className="h-1.5 w-16 rounded-full bg-[var(--color-ink-faint)] opacity-40" />
            <span className="h-2.5 w-24 rounded-full bg-[var(--color-ink-faint)] opacity-30" />
          </div>
        ))}

        {/* The winner. Solid, forward in Z, aurora-lit — the only element in the
            composition with full contrast, so the eye lands here first. */}
        <div
          className="absolute inset-0 flex flex-col justify-between rounded-[18px] p-5"
          style={{
            transform: "translate3d(28px, 58px, 90px)",
            background:
              "linear-gradient(150deg, color-mix(in oklab, var(--aurora-1) 92%, #000 8%) 0%, color-mix(in oklab, var(--aurora-2) 88%, #000 12%) 58%, color-mix(in oklab, var(--aurora-3) 70%, #000 30%) 130%)",
            boxShadow:
              "var(--elev-4), 0 24px 60px -20px color-mix(in oklab, var(--aurora-2) 70%, transparent)",
          }}
        >
          <div className="flex items-center justify-between">
            <span className="text-[0.6875rem] font-medium tracking-wide text-white/70">
              Best price
            </span>
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-[0.625rem] font-semibold text-white">
              save €36
            </span>
          </div>
          <div>
            <div className="tabular text-[2rem] font-semibold leading-none text-white">
              €584
            </div>
            <div className="mt-1.5 text-[0.6875rem] text-white/70">
              3 nights · all in · split 3 ways
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

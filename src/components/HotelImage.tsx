"use client";

import { useState } from "react";

/**
 * Hotel photography with a fallback.
 *
 * Supplier image CDNs 404 and rate-limit constantly, and Amadeus returns no
 * photography at all. Without this a dead URL renders the browser's broken
 * image icon in the middle of a results list. next/image is avoided on purpose:
 * it would need every supplier CDN allow-listed up front, and an unknown host
 * fails the whole route.
 */
export function HotelImage({
  src,
  className,
  alt = "",
}: {
  src?: string | null;
  className?: string;
  alt?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        className={`grid place-items-center bg-[var(--color-surface-sunken)] ${className ?? ""}`}
        aria-hidden="true"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.25"
          className="h-7 w-7 text-[var(--color-ink-faint)]"
        >
          <path d="M3 21V8l9-5 9 5v13" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M9 21v-6h6v6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={className}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

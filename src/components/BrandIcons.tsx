/**
 * Provider marks, inlined.
 *
 * Google and Apple both require their own logo on a sign-in button, and both
 * forbid recolouring it. Inlining the SVG keeps them exact, themeable where
 * allowed, and free of a network request that could fail and leave an
 * unlabelled button.
 */

export function GoogleMark({ className = "h-[18px] w-[18px]" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.34A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.41 5.41 0 0 1 0-3.44V4.94H.96a9 9 0 0 0 0 8.12l3.01-2.34Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.94l3.01 2.34C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

export function AppleMark({ className = "h-[18px] w-[18px]" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.05 12.66c.02 2.6 2.28 3.47 2.31 3.48-.02.06-.36 1.24-1.2 2.45-.72 1.05-1.47 2.1-2.66 2.12-1.16.02-1.54-.69-2.87-.69-1.33 0-1.75.67-2.85.71-1.14.04-2.01-1.12-2.74-2.17-1.5-2.17-2.64-6.13-1.1-8.81.76-1.33 2.13-2.17 3.61-2.19 1.12-.02 2.18.75 2.87.75.68 0 1.97-.93 3.32-.79.57.02 2.16.21 3.18 1.56-.08.05-1.9 1.11-1.87 3.31M14.9 3.9c.61-.74 1.02-1.77.91-2.79-.9.04-1.98.6-2.61 1.33-.57.65-1.06 1.7-.93 2.7 1 .08 2.02-.51 2.63-1.24" />
    </svg>
  );
}

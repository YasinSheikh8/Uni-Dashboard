/** The app mark, drawn for Next's ImageResponse (PNG icons for the PWA). */
export function IconArt({ size, padded = false }: { size: number; padded?: boolean }) {
  const inner = padded ? size * 0.62 : size * 0.78;
  return (
    <div style={{ width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center", background: padded ? "#ab9ff2" : "#0c0d10" }}>
      <div style={{ width: inner, height: inner, borderRadius: padded ? 0 : inner * 0.24, background: "#ab9ff2", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg viewBox="0 0 24 24" width={inner * 0.62} height={inner * 0.62} fill="none" stroke="#16122c" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6.5 5.5L12 12.5l5.5-7M12 12.5V19" />
        </svg>
      </div>
    </div>
  );
}

// Struo's mark (spec 066, chosen by the founder: « Assise »): three courses of bricks, offset, that
// draw an S — a company built course after course, in order. The orange courses are the brand; the
// middle one follows the surface (ink on light, paper on dark).
export function BrandMark({ size = 28, onDark = false, tile = false }: { size?: number; onDark?: boolean; tile?: boolean }) {
  const middle = onDark || tile ? '#f3f2e9' : '#152219';
  const orange = onDark || tile ? '#ed5a32' : '#cf4519';
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" aria-hidden="true" focusable="false" style={{ display: 'block', flex: 'none' }}>
      {tile ? <rect width="56" height="56" rx="12" fill="#152219" /> : null}
      <rect x={tile ? 11 : 4} y={tile ? 12 : 6} width={tile ? 22 : 30} height={tile ? 9 : 12} rx="1.6" fill={orange} />
      <rect x={tile ? 23 : 20} y={tile ? 23.5 : 22} width={tile ? 22 : 30} height={tile ? 9 : 12} rx="1.6" fill={middle} />
      <rect x={tile ? 11 : 4} y={tile ? 35 : 38} width={tile ? 22 : 30} height={tile ? 9 : 12} rx="1.6" fill={orange} />
    </svg>
  );
}

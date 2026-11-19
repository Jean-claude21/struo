/** Original flat illustration: a site worker with an orange helmet and vest, waving. */
export function Mascot({ size = 180 }: { size?: number }) {
  return (
    <svg className="mascot" width={size} height={size} viewBox="0 0 200 200" role="img" aria-hidden="true">
      <rect x="0" y="150" width="200" height="50" fill="#f6efe6" />
      <rect x="120" y="70" width="70" height="80" fill="#e9e4dc" stroke="#2b2b2b" strokeWidth="2" />
      <rect x="132" y="84" width="16" height="16" fill="#cfd8e3" stroke="#2b2b2b" strokeWidth="2" />
      <rect x="160" y="84" width="16" height="16" fill="#cfd8e3" stroke="#2b2b2b" strokeWidth="2" />
      <rect x="132" y="112" width="16" height="16" fill="#cfd8e3" stroke="#2b2b2b" strokeWidth="2" />
      <rect x="20" y="132" width="30" height="18" fill="#d9663b" stroke="#2b2b2b" strokeWidth="2" />
      <rect x="35" y="116" width="30" height="16" fill="#d9663b" stroke="#2b2b2b" strokeWidth="2" />
      <circle cx="86" cy="62" r="22" fill="#8a5a3c" stroke="#2b2b2b" strokeWidth="2" />
      <path d="M62 58 Q86 26 110 58 Z" fill="#e8590c" stroke="#2b2b2b" strokeWidth="2" />
      <rect x="58" y="56" width="56" height="7" rx="3" fill="#e8590c" stroke="#2b2b2b" strokeWidth="2" />
      <path d="M78 70 Q86 77 94 70" stroke="#2b2b2b" strokeWidth="2" fill="none" />
      <circle cx="79" cy="63" r="2" fill="#2b2b2b" />
      <circle cx="93" cy="63" r="2" fill="#2b2b2b" />
      <path d="M62 150 L66 96 Q86 86 106 96 L110 150 Z" fill="#e8590c" stroke="#2b2b2b" strokeWidth="2" />
      <rect x="66" y="112" width="40" height="5" fill="#d9d9d9" />
      <path d="M106 100 L128 74" stroke="#8a5a3c" strokeWidth="9" strokeLinecap="round" />
      <path d="M66 100 L54 132" stroke="#8a5a3c" strokeWidth="9" strokeLinecap="round" />
    </svg>
  );
}

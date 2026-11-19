// An amount in words for invoices (spec 036): « Arrêtée la présente facture à la somme de … ».
// Formatting only: the amount itself comes from the server.

const UNITS_FR = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize'];
const TENS_FR: Record<number, string> = { 20: 'vingt', 30: 'trente', 40: 'quarante', 50: 'cinquante', 60: 'soixante' };

function belowHundredFr(n: number): string {
  if (n <= 16) return UNITS_FR[n]!;
  if (n < 20) return `dix-${UNITS_FR[n - 10]}`;
  if (n < 70) {
    const tens = Math.floor(n / 10) * 10; const unit = n % 10;
    return unit === 0 ? TENS_FR[tens]! : unit === 1 ? `${TENS_FR[tens]} et un` : `${TENS_FR[tens]}-${UNITS_FR[unit]}`;
  }
  if (n < 80) return n === 71 ? 'soixante et onze' : `soixante-${belowHundredFr(n - 60)}`;
  if (n === 80) return 'quatre-vingts';
  return `quatre-vingt-${belowHundredFr(n - 80)}`;
}

function belowThousandFr(n: number, final: boolean): string {
  const hundreds = Math.floor(n / 100); const rest = n % 100;
  const head = hundreds === 0 ? '' : hundreds === 1 ? 'cent' : `${UNITS_FR[hundreds]} cent${rest === 0 && final ? 's' : ''}`;
  const tail = rest === 0 ? '' : belowHundredFr(rest);
  const words = [head, tail].filter(Boolean).join(' ');
  // « quatre-vingts » loses its s when something follows (« quatre-vingt mille »).
  return final ? words : words.replace(/quatre-vingts$/u, 'quatre-vingt');
}

export function numberToWordsFr(value: number): string {
  let n = Math.floor(Math.abs(value));
  if (n === 0) return 'zéro';
  const parts: string[] = [];
  const scales: [number, string, string][] = [[1_000_000_000, 'milliard', 'milliards'], [1_000_000, 'million', 'millions']];
  for (const [size, one, many] of scales) {
    const count = Math.floor(n / size);
    if (count) { parts.push(`${belowThousandFr(count, true)} ${count > 1 ? many : one}`); n %= size; }
  }
  const thousands = Math.floor(n / 1000);
  if (thousands) { parts.push(thousands === 1 ? 'mille' : `${belowThousandFr(thousands, false)} mille`); n %= 1000; }
  if (n) parts.push(belowThousandFr(n, true));
  return parts.join(' ');
}

const ONES_EN = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS_EN = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
function belowThousandEn(n: number): string {
  const hundreds = Math.floor(n / 100); const rest = n % 100;
  const tail = rest < 20 ? (rest ? ONES_EN[rest]! : '') : `${TENS_EN[Math.floor(rest / 10)]}${rest % 10 ? `-${ONES_EN[rest % 10]}` : ''}`;
  return [hundreds ? `${ONES_EN[hundreds]} hundred` : '', tail].filter(Boolean).join(' and ');
}
export function numberToWordsEn(value: number): string {
  let n = Math.floor(Math.abs(value));
  if (n === 0) return 'zero';
  const parts: string[] = [];
  for (const [size, name] of [[1_000_000_000, 'billion'], [1_000_000, 'million'], [1000, 'thousand']] as const) {
    const count = Math.floor(n / size);
    if (count) { parts.push(`${belowThousandEn(count)} ${name}`); n %= size; }
  }
  if (n) parts.push(belowThousandEn(n));
  return parts.join(' ');
}

const CURRENCY: Record<string, [string, string]> = {
  XOF: ['francs CFA', 'CFA francs'], XAF: ['francs CFA', 'CFA francs'], EUR: ['euros', 'euros'], GHS: ['cedis', 'cedis'], GNF: ['francs guinéens', 'Guinean francs'],
  USD: ['dollars', 'dollars'],
};

/** « un million cinq cent mille francs CFA » for 1 500 000 XOF; currencies with cents write them out. */
export function amountInWords(minor: number, currency: string, locale: 'fr' | 'en'): string {
  const decimals = ['XOF', 'XAF', 'GNF'].includes(currency) ? 0 : 2;
  const units = Math.floor(minor / 10 ** decimals);
  const cents = decimals ? minor % 100 : 0;
  const [fr, en] = CURRENCY[currency] ?? [currency, currency];
  if (locale === 'en') return `${numberToWordsEn(units)} ${en}${cents ? ` and ${numberToWordsEn(cents)} cents` : ''}`;
  return `${numberToWordsFr(units)} ${fr}${cents ? ` et ${numberToWordsFr(cents)} centimes` : ''}`;
}

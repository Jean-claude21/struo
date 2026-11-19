/** ISO 4217 decimals of a currency (XOF: 0, EUR: 2). */
export function currencyDecimals(code: string): number {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency: code }).resolvedOptions().maximumFractionDigits ?? 0;
  } catch {
    return 0;
  }
}

/** Minor units from a decimal amount typed by a person (« 1 250 000 », « 1250,50 »). */
export function toMinor(input: string | number, currencyCode: string): number | null {
  const text = String(input).replace(/[\s  ]/gu, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/u.test(text)) return null;
  const decimals = currencyDecimals(currencyCode);
  const [whole, fraction = ''] = text.split('.');
  if (fraction.length > decimals) return null;
  return Number(whole) * 10 ** decimals + Number(fraction.padEnd(decimals, '0') || 0);
}

/** A decimal amount from minor units (for display and for providers that want units). */
export const fromMinor = (minor: number, currencyCode: string) => minor / 10 ** currencyDecimals(currencyCode);

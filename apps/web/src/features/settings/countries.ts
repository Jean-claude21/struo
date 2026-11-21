// Country → currency, VAT (%) and the usual defaults (spec 044, shared by spec 045). These are presets
// a company can edit, not rules: Struo is international and opening a country is configuration.
// Names come from the browser's Intl.DisplayNames in the reader's language, never from a hard-coded list.
export const COUNTRIES: Record<string, { currency: string; vat: number }> = {
  DZ: { currency: 'DZD', vat: 19 }, DE: { currency: 'EUR', vat: 19 }, BE: { currency: 'EUR', vat: 21 },
  BJ: { currency: 'XOF', vat: 18 }, BF: { currency: 'XOF', vat: 18 }, CM: { currency: 'XAF', vat: 19.25 },
  CA: { currency: 'CAD', vat: 5 }, CD: { currency: 'CDF', vat: 16 }, CG: { currency: 'XAF', vat: 18 },
  CI: { currency: 'XOF', vat: 18 }, ES: { currency: 'EUR', vat: 21 }, US: { currency: 'USD', vat: 0 },
  FR: { currency: 'EUR', vat: 20 }, GA: { currency: 'XAF', vat: 18 }, GH: { currency: 'GHS', vat: 15 },
  GN: { currency: 'GNF', vat: 18 }, IT: { currency: 'EUR', vat: 22 }, KE: { currency: 'KES', vat: 16 },
  LU: { currency: 'EUR', vat: 17 }, MG: { currency: 'MGA', vat: 20 }, ML: { currency: 'XOF', vat: 18 },
  MA: { currency: 'MAD', vat: 20 }, NE: { currency: 'XOF', vat: 19 }, NG: { currency: 'NGN', vat: 7.5 },
  PT: { currency: 'EUR', vat: 23 }, GB: { currency: 'GBP', vat: 20 }, RW: { currency: 'RWF', vat: 18 },
  SN: { currency: 'XOF', vat: 18 }, CH: { currency: 'CHF', vat: 8.1 }, TD: { currency: 'XAF', vat: 18 },
  TG: { currency: 'XOF', vat: 18 }, TN: { currency: 'TND', vat: 19 },
};

/** The cookie that remembers the country a visitor picked on the public pages. */
export const COUNTRY_COOKIE = 'struo_country';
/** When nothing tells us the visitor's country. */
export const DEFAULT_COUNTRY = 'FR';

export const isCountry = (value: unknown): value is string => typeof value === 'string' && value in COUNTRIES;

export function countryName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** Countries sorted by their name in the reader's language. */
export function sortedCountries(locale: string): { code: string; name: string; currency: string; vat: number }[] {
  return Object.entries(COUNTRIES)
    .map(([code, item]) => ({ code, name: countryName(code, locale), ...item }))
    .sort((a, b) => a.name.localeCompare(b.name, locale));
}

/** The region part of a language tag list (« fr-FR,fr;q=0.9 » → FR), when it is a known country. */
export function countryFromLanguages(header: string | null | undefined): string | null {
  for (const part of (header ?? '').split(',')) {
    const region = part.split(';')[0]?.trim().split('-')[1]?.toUpperCase();
    if (isCountry(region)) return region;
  }
  return null;
}

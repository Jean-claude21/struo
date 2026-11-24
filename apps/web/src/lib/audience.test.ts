import { describe, expect, it } from 'vitest';
import { campaignUrl, referrerOrigin } from './audience.ts';

describe('audience (spec 075)', () => {
  it('keeps only the other site of origin, never its path, and nothing for Struo itself', () => {
    expect(referrerOrigin('https://www.google.com/search?q=logiciel+btp', 'https://struo.kete.digital/')).toBe('https://www.google.com');
    expect(referrerOrigin('https://struo.kete.digital/demo', 'https://struo.kete.digital/')).toBe('');
    expect(referrerOrigin('', 'https://struo.kete.digital/')).toBe('');
  });
  it('keeps the campaign parameters alone', () => {
    expect(campaignUrl('/', '?utm_source=whatsapp&utm_campaign=lancement&email=a@b.c&token=x')).toBe('/?utm_source=whatsapp&utm_campaign=lancement');
    expect(campaignUrl('/demo', '?next=/app')).toBe('/demo');
  });
});

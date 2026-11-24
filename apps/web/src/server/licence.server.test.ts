import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { pulseSignatureValid } from './licence.server.ts';

const body = JSON.stringify({ event: 'license.issued', license: { key: 'ABCD-1234' }, customer: { email: 'gerant@example.com' } });
const sign = (raw: string, secret: string) => `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;

describe('store Pulse signature (spec 069)', () => {
  it('accepts the body signed with the Pulse secret, and a rotated secret', () => {
    expect(pulseSignatureValid(body, sign(body, 'whsec_a'), ['whsec_a'])).toBe(true);
    expect(pulseSignatureValid(body, sign(body, 'whsec_new'), ['whsec_old', 'whsec_new'])).toBe(true);
  });
  it('refuses a wrong secret, a changed body, a missing or malformed header', () => {
    expect(pulseSignatureValid(body, sign(body, 'whsec_b'), ['whsec_a'])).toBe(false);
    expect(pulseSignatureValid(`${body} `, sign(body, 'whsec_a'), ['whsec_a'])).toBe(false);
    expect(pulseSignatureValid(body, null, ['whsec_a'])).toBe(false);
    expect(pulseSignatureValid(body, 'sha256=xyz', ['whsec_a'])).toBe(false);
  });
});

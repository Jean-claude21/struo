import { PERMISSIONS, ROLES } from '@struo/core/permissions';
import { describe, expect, it } from 'vitest';
import { en } from '@/i18n/en.ts';
import { fr } from '@/i18n/fr.ts';
import { CAPABILITIES, capabilitiesFor, catalog, inputSchema } from './capabilities.server.ts';

describe('the capability registry (spec 034)', () => {
  it('names every capability once, as a valid tool name, with a known permission and level', () => {
    const names = CAPABILITIES.map((capability) => capability.name);
    expect(new Set(names).size).toBe(names.length);
    for (const capability of CAPABILITIES) {
      expect(capability.name).toMatch(/^[a-z][a-z0-9_]{1,62}$/u);
      if (capability.permission) expect(Object.keys(PERMISSIONS)).toContain(capability.permission);
      expect([1, 2, 3, 4]).toContain(capability.autonomy);
      expect(capability.description.length).toBeGreaterThan(20);
      expect(inputSchema(capability)).toMatchObject({ type: 'object' });
    }
  });

  it('never lets a level that reads write, and asks a draft summary for what commits', () => {
    for (const capability of CAPABILITIES.filter((item) => item.autonomy >= 3)) expect(capability.summary, capability.name).toBeTypeOf('function');
    for (const capability of CAPABILITIES.filter((item) => item.autonomy === 1 && item.permission)) {
      expect(capability.permission!.endsWith('.read') || ['portal.manage'].includes(capability.permission!), capability.name).toBe(true);
    }
  });

  it('documents every capability and group in French and English', () => {
    for (const capability of CAPABILITIES) {
      expect(fr.caps[capability.name as keyof typeof fr.caps], capability.name).toBeTruthy();
      expect(en.caps[capability.name as keyof typeof en.caps], capability.name).toBeTruthy();
      expect(fr.capsd[capability.name as keyof typeof fr.capsd], capability.name).toBeTruthy();
      expect(en.capsd[capability.name as keyof typeof en.capsd], capability.name).toBeTruthy();
      expect(fr.capg[capability.group], capability.group).toBeTruthy();
    }
  });

  it('offers each role only what it may do: a site lead cannot touch money, an accountant cannot review reports', () => {
    const lead = capabilitiesFor('site_lead').map((item) => item.name);
    expect(lead).toContain('report_incident');
    expect(lead).not.toContain('create_invoice');
    expect(lead).not.toContain('finance_summary');
    const accountant = capabilitiesFor('accountant').map((item) => item.name);
    expect(accountant).toContain('record_payment');
    expect(accountant).not.toContain('review_report');
    expect(capabilitiesFor('owner').length).toBe(CAPABILITIES.length);
    const doc = catalog().find((item) => item.name === 'record_payment')!;
    expect(doc.roles).toEqual(ROLES.filter((role) => (PERMISSIONS['finance.write'] as readonly string[]).includes(role)));
    expect(doc.inputs.find((input) => input.name === 'amountMinor')).toMatchObject({ required: true });
  });
});

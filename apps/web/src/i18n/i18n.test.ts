import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { en } from './en.ts';
import { fr } from './fr.ts';
import { translate } from './index.tsx';

const leaves = (node: unknown, prefix = ''): string[] =>
  typeof node === 'string'
    ? [prefix]
    : Object.entries(node as Record<string, unknown>).flatMap(([key, value]) => leaves(value, prefix ? `${prefix}.${key}` : key));

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/gu)].map((match) => match[1]).sort();

describe('i18n (constitution VII)', () => {
  it('French and English have exactly the same keys', () => {
    expect(leaves(en).sort()).toEqual(leaves(fr).sort());
  });

  it('every message keeps the same placeholders in both languages', () => {
    for (const key of leaves(fr)) {
      expect(placeholders(translate('en', key)), key).toEqual(placeholders(translate('fr', key)));
    }
  });

  it('no message is empty', () => {
    for (const key of leaves(fr)) {
      expect(translate('fr', key).trim(), key).not.toBe('');
      expect(translate('en', key).trim(), key).not.toBe('');
    }
  });

  it('every key used in the code exists', () => {
    const root = path.resolve(import.meta.dirname, '..');
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.(tsx?|ts)$/u.test(name) && !name.endsWith('.gen.ts') && !full.includes(`${path.sep}i18n${path.sep}`)) files.push(full);
      }
    };
    walk(root);
    const known = new Set(leaves(fr));
    const missing: string[] = [];
    for (const file of files) {
      for (const match of readFileSync(file, 'utf8').matchAll(/\bt\('([a-zA-Z]+\.[a-zA-Z0-9_.]+)'/gu)) {
        if (!known.has(match[1]!)) missing.push(`${path.basename(file)}: ${match[1]}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('never shows a message with a {placeholder} called without its values', () => {
    const root = path.resolve(import.meta.dirname, '..');
    const files: string[] = [];
    const walk = (dir: string) => { for (const name of readdirSync(dir)) { const full = path.join(dir, name); if (statSync(full).isDirectory()) { if (name !== 'i18n') walk(full); } else if (/\.tsx?$/u.test(name)) files.push(full); } };
    walk(root);
    const value = (key: string) => key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], fr);
    const holes: string[] = [];
    for (const file of files) {
      for (const match of readFileSync(file, 'utf8').matchAll(/\bt\('([a-zA-Z0-9_.]+)'\)/gu)) {
        const text = value(match[1]!);
        if (typeof text === 'string' && /\{[a-zA-Z]+\}/u.test(text)) holes.push(`${path.relative(root, file)}: ${match[1]}`);
      }
    }
    expect(holes).toEqual([]);
  });
});


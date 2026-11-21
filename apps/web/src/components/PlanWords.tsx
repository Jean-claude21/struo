// Spec 055: the words of a plan as buyers read them — edited in the console (both languages), else
// the catalogue's default. A bullet is one line; **bold** is the only formatting, so it always
// displays cleanly.
import type { ReactNode } from 'react';
import { translate, type Locale } from '@/i18n/index.tsx';

export interface PlanText { code: string; name: string; nameEn?: string | null; tagline?: string | null; taglineEn?: string | null; bullets?: string | null; bulletsEn?: string | null; highlight?: boolean }

const known = (locale: Locale, key: string) => { const text = translate(locale, key); return text === key ? null : text; };
export const lines = (text: string | null | undefined) => (text ?? '').split(/\r?\n/u).map((line) => line.replace(/^\s*[-*•]\s*/u, '').trim()).filter(Boolean);

export function planWords(plan: PlanText, locale: Locale) {
  const en = locale === 'en';
  const name = (en ? plan.nameEn : null) || plan.name;
  const tagline = (en ? plan.taglineEn || plan.tagline : plan.tagline) || known(locale, `lp.offer.${plan.code}For`) || '';
  const own = lines(en ? plan.bulletsEn || plan.bullets : plan.bullets);
  const bullets = own.length ? own : (known(locale, `lp.offer.plan_${plan.code}`)?.split('|') ?? []);
  return { name, tagline, bullets, highlight: plan.highlight ?? plan.code === 'pro' };
}

/** One line with **bold** parts. */
export function Rich({ text }: { text: string }): ReactNode {
  const parts = text.split(/\*\*(.+?)\*\*/gu);
  return <>{parts.map((part, index) => (index % 2 ? <b key={index}>{part}</b> : part))}</>;
}

// The client report's prose (spec 050): written by the assistant from the facts when one is
// configured, else by a plain template from the same facts. The office always reads it before it
// is sent (unless the company chose to send the weekly report without a reading).
import type { ReportFacts, ReportSection, ReportSections } from '@struo/core';
import { translate, type Locale } from '@/i18n/index.tsx';
import { reportError } from './monitor.server.ts';
import type { Runtime } from './runtime.server.ts';

const longDate = (locale: Locale, value: string) =>
  new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'fr-FR', { day: 'numeric', month: 'long' }).format(new Date(`${value}T12:00:00`));

/** The sections written from the facts without any assistant: short, factual, never wrong. */
export function templateSections(locale: Locale, facts: ReportFacts): Required<Record<ReportSection, string>> {
  const t = (key: string, values?: Record<string, string | number>) => translate(locale, key, values);
  const summary = [
    facts.reportsCount ? t('reportDraft.tplReports', { n: facts.reportsCount }) : t('reportDraft.tplNoReport'),
    t('reportDraft.tplProgress', { pct: facts.project.progressPct }),
    ...(facts.reached.length ? [t('reportDraft.tplReached', { names: facts.reached.map((item) => item.name).join(', ') })] : []),
  ].join(' ');
  const done = facts.notes.length
    ? facts.notes.map((note) => `${longDate(locale, note.date)}${note.phase ? ` · ${note.phase}` : ''} : ${note.text.replace(/\s+/gu, ' ').trim()}`).join('\n')
    : t('reportDraft.tplNoNote');
  const next = facts.upcoming.length
    ? facts.upcoming.map((item) => t('reportDraft.tplNext', { name: item.name, date: longDate(locale, item.plannedOn) })).join('\n')
    : '';
  const ask = facts.asks.length
    ? `${t('reportDraft.tplAsk')} ${facts.asks.map((item) => (item.kind === 'change' ? t('reportDraft.tplAskChange', { label: item.label }) : t('reportDraft.tplAskMilestone', { label: item.label }))).join(' ; ')}.`
    : '';
  return { summary, done, next, ask };
}

/** All four sections, by the assistant when it is there (falling back to the template on any failure). */
export async function draftSections(rt: Runtime, locale: Locale, facts: ReportFacts): Promise<{ sections: ReportSections; ai: boolean }> {
  const template = templateSections(locale, facts);
  if (!rt.drafter.configured) return { sections: template, ai: false };
  try {
    const written = await rt.drafter.reportSections({ locale, facts });
    return { sections: { ...template, ...written, ask: facts.asks.length ? (written.ask ?? template.ask) : '' }, ai: true };
  } catch (error) {
    reportError(error, { where: 'ai:report-sections' });
    return { sections: template, ai: false };
  }
}

/** One section rewritten on the office's instruction (the assistant is required). */
export async function rewriteSection(rt: Runtime, locale: Locale, facts: ReportFacts, section: ReportSection, instruction: string, current: string | null): Promise<string> {
  const written = await rt.drafter.reportSections({ locale, facts, section, instruction, current });
  return written[section] ?? current ?? '';
}

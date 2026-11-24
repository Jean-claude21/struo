// The client report (specs 049–050) in the company's own look: its logo, colour and font (the same
// look as its invoices). Prose sections written by the office (or drafted by the assistant and
// validated), figures from the records. Shown as a preview in the office, printed to PDF, and opened
// by the client.
import type { ClientReport } from '@struo/core';
import { formatMoney } from './ui.tsx';
import { useI18n } from '@/i18n/index.tsx';

const paragraphs = (text: string | null | undefined) => (text ?? '').split(/\n+/u).map((line) => line.trim()).filter(Boolean);

export function ClientReportView({ report, orgId, photoUrl }: { report: ClientReport; orgId: string; photoUrl: (id: string) => string }) {
  const { t, locale } = useI18n();
  const accent = report.company.accentColor ?? '#b9461e';
  const date = (value: string) => new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${value}T12:00:00`));
  const logo = report.company.logoKey ? `/api/files/logo/${orgId}?v=${encodeURIComponent(report.company.logoKey.slice(-12))}` : null;
  const font = report.company.font === 'serif' ? 'Georgia, "Times New Roman", serif' : 'var(--font)';
  const sections = report.sections ?? {};
  const prose = (key: 'summary' | 'done' | 'next' | 'ask') => paragraphs(sections[key]);
  const asks = report.asks ?? [];
  return (
    <article className="client-report" style={{ ['--cr-accent' as string]: accent, fontFamily: font }}>
      <header className="cr-head">
        {logo ? <img src={logo} alt={report.company.name} className="cr-logo" /> : <b className="cr-company">{report.company.name}</b>}
        <div className="cr-meta">
          <span>{t('clientReport.kicker', { from: date(report.period.from), to: date(report.period.to) })}</span>
          {report.project.clientName ? <span>{t('clientReport.for', { name: report.project.clientName })}</span> : null}
        </div>
      </header>
      <h1 className="cr-title">{report.project.name}</h1>
      <p className="cr-sub">{[report.project.code, report.project.location].filter(Boolean).join(' · ')}</p>
      {report.intro ? <p className="cr-text">{report.intro}</p> : null}

      {prose('summary').length ? <section className="cr-lead">{prose('summary').map((line) => <p key={line} className="cr-text">{line}</p>)}</section> : null}

      <section className="cr-progress">
        <div className="cr-big"><b>{report.project.progressPct} %</b><span>{t('clientReport.progress')}</span></div>
        <div className="cr-big"><b>{report.reportsCount}</b><span>{t('clientReport.reports')}</span></div>
        {report.project.endDate ? <div className="cr-big"><b>{date(report.project.endDate)}</b><span>{t('clientReport.end')}</span></div> : null}
      </section>

      {prose('done').length ? (
        <section><h2>{t('reportDraft.sections.done')}</h2>
          <div className="cr-prose">{prose('done').map((line) => <p key={line}>{line}</p>)}</div>
        </section>
      ) : null}

      {report.phases?.length ? (
        <section><h2>{t('clientReport.phases')}</h2>
          <ul className="cr-phases">{report.phases.map((phase) => (
            <li key={phase.name}><span>{phase.name}</span><i><em style={{ width: `${phase.progressPct}%` }} /></i><b>{phase.progressPct} %</b></li>
          ))}</ul>
        </section>
      ) : null}

      {report.photos.length ? (
        <section><h2>{t('clientReport.photos')}</h2>
          <div className="cr-photos">{report.photos.map((photo) => (
            <figure key={photo.id}><img src={photoUrl(photo.id)} alt={photo.phase ?? ''} loading="lazy" /><figcaption>{[photo.phase, date(photo.takenAt)].filter(Boolean).join(' · ')}</figcaption></figure>
          ))}</div>
        </section>
      ) : null}

      {prose('next').length || report.reached?.length || report.upcoming?.length ? (
        <section><h2>{t('reportDraft.sections.next')}</h2>
          {prose('next').length ? <div className="cr-prose">{prose('next').map((line) => <p key={line}>{line}</p>)}</div> : null}
          {report.reached?.length || report.upcoming?.length ? (
            <div className="cr-two">
              {report.reached?.length ? <div><h3>{t('clientReport.reached')}</h3><ul>{report.reached.map((item) => <li key={item.name}>{item.name} · {date(item.actualOn)}</li>)}</ul></div> : null}
              {report.upcoming?.length ? <div><h3>{t('clientReport.planned')}</h3><ul>{report.upcoming.map((item) => <li key={item.name}>{item.name} · {date(item.plannedOn)}</li>)}</ul></div> : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {prose('ask').length || asks.length ? (
        <section className="cr-ask"><h2>{t('reportDraft.sections.ask')}</h2>
          {prose('ask').map((line) => <p key={line} className="cr-text">{line}</p>)}
          {asks.length ? <ul>{asks.map((item) => <li key={`${item.kind}${item.label}`}>{item.kind === 'change' ? t('reportDraft.tplAskChange', { label: item.label }) : t('reportDraft.tplAskMilestone', { label: item.label })}</li>)}</ul> : null}
        </section>
      ) : null}

      {report.changes?.length ? (
        <section><h2>{t('clientReport.changes')}</h2>
          <ul className="cr-changes">{report.changes.map((change) => (
            <li key={change.number}><span>{t('changes.number')} {change.number} · {change.title}</span><span>{formatMoney(locale, change.amountMinor, report.currency)} · {t(`changes.statuses.${change.status as 'accepted'}`)}</span></li>
          ))}</ul>
        </section>
      ) : null}

      {report.note ? <section className="cr-note"><h2>{t('reportDraft.noteTitle')}</h2>{paragraphs(report.note).map((line) => <p key={line} className="cr-text">{line}</p>)}</section> : null}

      <footer className="cr-foot">{[report.company.name, report.company.address, report.company.phone, report.company.email].filter(Boolean).join(' · ')}</footer>
    </article>
  );
}

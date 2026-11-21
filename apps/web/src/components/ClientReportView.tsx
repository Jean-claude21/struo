// The client report (spec 049) in the company's own look: its logo, colour and font (the same look
// as its invoices). Shown as a preview in the office, printed to PDF, and opened by the client.
import type { ClientReport } from '@struo/core';
import { formatMoney } from './ui.tsx';
import { useI18n } from '@/i18n/index.tsx';

export function ClientReportView({ report, orgId, photoUrl }: { report: ClientReport; orgId: string; photoUrl: (id: string) => string }) {
  const { t, locale } = useI18n();
  const accent = report.company.accentColor ?? '#b9461e';
  const date = (value: string) => new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${value}T12:00:00`));
  const logo = report.company.logoKey ? `/api/files/logo/${orgId}?v=${encodeURIComponent(report.company.logoKey.slice(-12))}` : null;
  const font = report.company.font === 'serif' ? 'Georgia, "Times New Roman", serif' : 'var(--font)';
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
      {report.note ? <p className="cr-text cr-note">{report.note}</p> : null}

      <section className="cr-progress">
        <div className="cr-big"><b>{report.project.progressPct} %</b><span>{t('clientReport.progress')}</span></div>
        <div className="cr-big"><b>{report.reportsCount}</b><span>{t('clientReport.reports')}</span></div>
        {report.project.endDate ? <div className="cr-big"><b>{date(report.project.endDate)}</b><span>{t('clientReport.end')}</span></div> : null}
      </section>

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

      {report.reached?.length || report.upcoming?.length ? (
        <section className="cr-two">
          {report.reached?.length ? <div><h2>{t('clientReport.reached')}</h2><ul>{report.reached.map((item) => <li key={item.name}>{item.name} · {date(item.actualOn)}</li>)}</ul></div> : null}
          {report.upcoming?.length ? <div><h2>{t('clientReport.upcoming')}</h2><ul>{report.upcoming.map((item) => <li key={item.name}>{item.name} · {date(item.plannedOn)}</li>)}</ul></div> : null}
        </section>
      ) : null}

      {report.changes?.length ? (
        <section><h2>{t('clientReport.changes')}</h2>
          <ul className="cr-changes">{report.changes.map((change) => (
            <li key={change.number}><span>{t('changes.number')} {change.number} · {change.title}</span><span>{formatMoney(locale, change.amountMinor, report.currency)} · {t(`changes.statuses.${change.status as 'accepted'}`)}</span></li>
          ))}</ul>
        </section>
      ) : null}

      <footer className="cr-foot">{[report.company.name, report.company.address, report.company.phone, report.company.email].filter(Boolean).join(' · ')}</footer>
    </article>
  );
}

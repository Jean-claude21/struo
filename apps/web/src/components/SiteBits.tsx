// Small pieces shared by the site pages (list, detail).
import { daysUntil } from './kit.tsx';
import { DateText } from './ui.tsx';
import { useI18n } from '@/i18n/index.tsx';

/** « Ends in 60 days », « 12 days late », or the end date of a finished site. */
export function EndHint({ row }: { row: { status: string; endDate: string | null; progressPct: number } }) {
  const { t } = useI18n();
  if (!row.endDate) return null;
  if (row.status === 'done') return <span className="faint xsmall nowrap"><DateText value={row.endDate} /></span>;
  const left = daysUntil(row.endDate) ?? 0;
  if (left < 0 && row.progressPct < 100) return <span className="xsmall nowrap" style={{ color: 'var(--bad)', fontWeight: 600 }}>{t('cards.late', { n: -left })}</span>;
  return <span className="faint xsmall nowrap">{t('cards.endsIn', { n: left })}</span>;
}

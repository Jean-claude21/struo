import { can } from '@struo/core/permissions';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ExpenseDialog } from '@/components/forms.tsx';
import { Badge, DateText, Empty, ErrorText, Money, useAction } from '@/components/ui.tsx';
import { getExpenses, removeExpense } from '@/features/office/server.ts';
import { useI18n } from '@/i18n/index.tsx';

export const Route = createFileRoute('/app/expenses')({
  loader: () => getExpenses(),
  component: Expenses,
});

function Expenses() {
  const { t } = useI18n();
  const data = Route.useLoaderData();
  const { run, error } = useAction();
  const canWrite = can(data.role, 'expenses.write');
  const currency = data.currency;
  return (
    <div className="stack">
      <div className="topbar">
        <h1>{t('expenses.title')}</h1>
        {canWrite && data.projects.length ? <ExpenseDialog projects={data.projects} currency={currency} /> : null}
      </div>
      <section className="card table-wrap">
        <h2>{t('expenses.bySegment')}</h2>
        {data.bySegment.length ? (
          <table>
            <thead>
              <tr>
                <th>{t('expenses.segment')}</th>
                <th>{t('projects.title')}</th>
                <th className="right">{t('expenses.invoiced')}</th>
                <th className="right">{t('expenses.spent')}</th>
                <th className="right">{t('expenses.margin')}</th>
                <th className="right">%</th>
              </tr>
            </thead>
            <tbody>
              {data.bySegment.map((segment) => (
                <tr key={segment.segment}>
                  <td>
                    <strong>{segment.segment}</strong>
                  </td>
                  <td>{segment.projects}</td>
                  <td className="right">
                    <Money minor={segment.invoicedMinor} currency={currency} />
                  </td>
                  <td className="right">
                    <Money minor={segment.spentMinor} currency={currency} />
                  </td>
                  <td className="right">
                    <Money minor={segment.marginMinor} currency={currency} />
                  </td>
                  <td className="right">
                    {segment.marginPct === null ? '—' : <Badge tone={segment.marginPct < 0 ? 'bad' : segment.marginPct < 10 ? 'warn' : 'ok'}>{segment.marginPct} %</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty />
        )}
      </section>
      <section className="card table-wrap">
        <h2>{t('expenses.byProject')}</h2>
        <p className="muted small">{t('expenses.cpiHelp')}</p>
        {data.byProject.length ? (
          <table>
            <thead>
              <tr>
                <th>{t('app.project')}</th>
                <th>{t('projects.type')}</th>
                <th className="right">{t('projects.budget')}</th>
                <th className="right">{t('expenses.invoiced')}</th>
                <th className="right">{t('expenses.spent')}</th>
                <th className="right">{t('expenses.margin')}</th>
                <th className="right">{t('expenses.cpi')}</th>
              </tr>
            </thead>
            <tbody>
              {data.byProject.map((row) => (
                <tr key={row.projectId}>
                  <td>
                    <Link to="/app/projects/$projectId" params={{ projectId: row.projectId }}>
                      <strong>{row.code}</strong> {row.name}
                    </Link>
                  </td>
                  <td>{row.typeName ?? '—'}</td>
                  <td className="right">
                    <Money minor={row.budgetMinor} currency={currency} />
                  </td>
                  <td className="right">
                    <Money minor={row.invoicedMinor} currency={currency} />
                  </td>
                  <td className="right">
                    <Money minor={row.spentMinor} currency={currency} />
                  </td>
                  <td className="right">
                    <Money minor={row.marginMinor} currency={currency} /> {row.marginPct !== null ? <span className="muted small">({row.marginPct} %)</span> : null}
                  </td>
                  <td className="right">{row.cpi === null ? '—' : <Badge tone={row.cpi < 1 ? 'bad' : 'ok'}>{row.cpi.toFixed(2)}</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty />
        )}
      </section>
      <section className="card table-wrap">
        <h2>{t('expenses.title')}</h2>
        {data.expenses.length ? (
          <table>
            <thead>
              <tr>
                <th>{t('app.date')}</th>
                <th>{t('app.project')}</th>
                <th>{t('expenses.category')}</th>
                <th>{t('expenses.label')}</th>
                <th>{t('expenses.supplier')}</th>
                <th className="right">{t('app.amount')}</th>
                {canWrite ? <th /> : null}
              </tr>
            </thead>
            <tbody>
              {data.expenses.map((expense) => (
                <tr key={expense.id}>
                  <td>
                    <DateText value={expense.spentOn} />
                  </td>
                  <td>{expense.projectCode}</td>
                  <td>{t(`expenses.categories.${expense.category as 'other'}`)}</td>
                  <td>{expense.label}</td>
                  <td>{expense.supplier ?? '—'}</td>
                  <td className="right">
                    <Money minor={expense.amountMinor} currency={expense.currencyCode} />
                  </td>
                  {canWrite ? (
                    <td className="right">
                      <button
                        type="button"
                        className="btn ghost small"
                        onClick={() => {
                          if (window.confirm(t('app.remove'))) void run(() => removeExpense({ data: { id: expense.id } }));
                        }}
                      >
                        {t('app.remove')}
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty text={t('expenses.noExpenses')} />
        )}
        <ErrorText error={error} />
      </section>
    </div>
  );
}

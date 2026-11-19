import { createFileRoute, redirect } from '@tanstack/react-router';
import { PublicHeader } from '@/components/PublicHeader.tsx';
import { Badge, DateText, ErrorText, useAction } from '@/components/ui.tsx';
import { getConsole, setCompanyPlan } from '@/features/settings/server.ts';
import { getShell } from '@/features/shell/server.ts';
import { useI18n } from '@/i18n/index.tsx';

export const Route = createFileRoute('/console')({
  loader: async () => {
    const { viewer } = await getShell();
    if (!viewer?.platformAdmin) throw redirect({ to: '/app' });
    return getConsole();
  },
  component: Console,
});

function Console() {
  const { t } = useI18n();
  const data = Route.useLoaderData();
  const { run, error } = useAction();
  return (
    <div className="public" style={{ maxWidth: 1200 }}>
      <PublicHeader signedIn />
      <h1>{t('console.title')}</h1>
      <section className="card table-wrap">
        <h2>
          {t('console.companies')} ({data.companies.length})
        </h2>
        <table>
          <thead>
            <tr>
              <th>{t('app.name')}</th>
              <th>{t('console.created')}</th>
              <th>{t('console.plan')}</th>
              <th>{t('console.users')}</th>
              <th>{t('console.projects')}</th>
              <th>{t('console.reports30')}</th>
            </tr>
          </thead>
          <tbody>
            {data.companies.map((company) => (
              <tr key={company.orgId}>
                <td>
                  <strong>{company.name}</strong> <span className="muted small">{company.countryCode}</span>
                </td>
                <td>
                  <DateText value={company.createdAt} />
                </td>
                <td>
                  <select
                    defaultValue={company.planCode}
                    aria-label={t('console.setPlan')}
                    onChange={(event) => void run(() => setCompanyPlan({ data: { orgId: company.orgId, planCode: event.target.value } }))}
                  >
                    {data.plans.map((plan) => (
                      <option key={plan.code} value={plan.code}>
                        {plan.name}
                      </option>
                    ))}
                    <option value="trial">trial</option>
                  </select>
                </td>
                <td>{company.users}</td>
                <td>{company.projects}</td>
                <td>
                  <Badge tone={company.reportsLast30Days > 0 ? 'ok' : 'warn'}>{company.reportsLast30Days}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <ErrorText error={error} />
      </section>
    </div>
  );
}

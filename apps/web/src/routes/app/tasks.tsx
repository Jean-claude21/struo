// Tasks across every site (spec 046): what everyone has to do, and by when.
import { createFileRoute } from '@tanstack/react-router';
import { PageHeader } from '@/components/kit.tsx';
import { TaskBoard } from '@/components/Work.tsx';
import { getTasks } from '@/features/office/server.ts';
import { useI18n } from '@/i18n/index.tsx';

export const Route = createFileRoute('/app/tasks')({
  loader: () => getTasks({ data: {} }),
  component: Tasks,
});

function Tasks() {
  const { t } = useI18n();
  const data = Route.useLoaderData();
  return (
    <div className="stack">
      <PageHeader title={t('tasks.pageTitle')} text={t('tasks.pageText')} />
      <TaskBoard tasks={data.tasks} members={data.members} projects={data.projects} role={data.role} userId={data.userId} />
    </div>
  );
}

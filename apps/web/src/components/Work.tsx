// Spec 046: the work a team shares on a site. TaskBoard lists tasks (one site, or every site), creates
// them and moves them forward in one click; NotesThread is the team's internal thread on a site,
// never shown to the client; DocumentVersions lists the previous files of a document.
import { can, type Role } from '@struo/core/permissions';
import { Link, useRouter } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import { CalendarClock, Check, Circle, CircleDot, Download, History, ListChecks, MessagesSquare, Trash2 } from 'lucide-react';
import { Avatar, EmptyState, Panel, Seg, useRelative, useToast } from './kit.tsx';
import { DateText } from './ui.tsx';
import { createTask, getDocumentVersions, postNote, removeTask, updateTask } from '@/features/office/server.ts';
import { useI18n } from '@/i18n/index.tsx';

type Status = 'todo' | 'doing' | 'done';
type Priority = 'low' | 'normal' | 'urgent';
export type Task = {
  id: string; projectId: string; projectCode: string; projectName: string; title: string; note: string | null;
  assigneeId: string | null; assigneeName: string | null; dueOn: string | null; priority: Priority; status: Status; late: boolean;
};
type Member = { userId: string; name: string; role: string };
type Project = { id: string; code: string; name: string };

const NEXT: Record<Status, Status> = { todo: 'doing', doing: 'done', done: 'todo' };
const ICON = { todo: Circle, doing: CircleDot, done: Check } as const;

export function TaskBoard({ tasks, members, projects, projectId, role, userId }: {
  tasks: Task[]; members: Member[]; projects?: Project[]; projectId?: string; role: Role; userId: string;
}) {
  const { t, errorText } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const writer = can(role, 'projects.write');
  const [filter, setFilter] = useState<'open' | 'mine' | 'done'>('open');
  const [busy, setBusy] = useState(false);
  const shown = tasks.filter((task) => (filter === 'done' ? task.status === 'done' : task.status !== 'done') && (filter !== 'mine' || task.assigneeId === userId));
  const run = async (work: () => Promise<unknown>, done?: string) => {
    try { await work(); if (done) toast({ text: done }); await router.invalidate(); return true; }
    catch (caught) { toast({ text: errorText(caught), kind: 'err' }); return false; }
  };
  const add = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const value = (name: string) => String(new FormData(form).get(name) ?? '').trim();
    setBusy(true);
    const ok = await run(() => createTask({ data: {
      projectId: projectId ?? value('projectId'), title: value('title'), assigneeId: value('assigneeId') || null,
      dueOn: value('dueOn') || null, priority: value('priority') || 'normal',
    } }), t('tasks.created'));
    setBusy(false);
    if (ok) form.reset();
  };
  const mayMove = (task: Task) => writer || task.assigneeId === userId;
  return (
    <Panel title={t('tasks.title')} sub={t('tasks.sub')} flush
      actions={<Seg label={t('tasks.filter')} value={filter} onChange={setFilter} items={[
        { value: 'open', label: t('tasks.open', { n: tasks.filter((task) => task.status !== 'done').length }) },
        { value: 'mine', label: t('tasks.mine') },
        { value: 'done', label: t('tasks.done') },
      ]} />}>
      {writer ? (
        <form className="task-add" onSubmit={(event) => void add(event)}>
          <input name="title" required maxLength={200} placeholder={t('tasks.placeholder')} aria-label={t('tasks.titleLabel')} />
          {projectId ? null : (
            <select name="projectId" required aria-label={t('tasks.site')} defaultValue="">
              <option value="" disabled>{t('tasks.site')}</option>
              {(projects ?? []).map((project) => <option key={project.id} value={project.id}>{project.code} · {project.name}</option>)}
            </select>
          )}
          <select name="assigneeId" aria-label={t('tasks.assignee')} defaultValue="">
            <option value="">{t('tasks.nobody')}</option>
            {members.map((member) => <option key={member.userId} value={member.userId}>{member.name}</option>)}
          </select>
          <input name="dueOn" type="date" aria-label={t('tasks.due')} />
          <select name="priority" aria-label={t('tasks.priority')} defaultValue="normal">
            {(['low', 'normal', 'urgent'] as const).map((value) => <option key={value} value={value}>{t(`tasks.priorities.${value}`)}</option>)}
          </select>
          <button type="submit" className="btn small" disabled={busy}>{t('tasks.add')}</button>
        </form>
      ) : null}
      {shown.length ? (
        <ul className="task-list">
          {shown.map((task) => {
            const Icon = ICON[task.status];
            return (
              <li key={task.id} className={`task ${task.status} ${task.priority}`}>
                <button type="button" className="task-check" disabled={!mayMove(task)} aria-label={t('tasks.move', { status: t(`tasks.statuses.${NEXT[task.status]}`) })}
                  title={t(`tasks.statuses.${task.status}`)} onClick={() => void run(() => updateTask({ data: { id: task.id, patch: { status: NEXT[task.status] } } }))}>
                  <Icon size={16} />
                </button>
                <div className="task-main">
                  <span className="task-title">{task.title}</span>
                  <span className="task-meta">
                    {projectId ? null : <Link to="/app/projects/$projectId" params={{ projectId: task.projectId }}>{task.projectCode}</Link>}
                    <span className={`task-status ${task.status}`}>{t(`tasks.statuses.${task.status}`)}</span>
                    {task.priority === 'urgent' ? <span className="task-urgent">{t('tasks.priorities.urgent')}</span> : null}
                    {task.dueOn ? <span className={task.late ? 'task-late' : undefined}><CalendarClock size={12} /><DateText value={task.dueOn} /></span> : null}
                  </span>
                </div>
                <span className="task-who">{task.assigneeName ? <><Avatar name={task.assigneeName} /><span className="hide-m">{task.assigneeName}</span></> : <span className="faint small">{t('tasks.nobody')}</span>}</span>
                {writer ? (
                  <button type="button" className="icon-btn" aria-label={t('tasks.remove')} onClick={() => void run(() => removeTask({ data: { id: task.id } }), t('tasks.removed'))}><Trash2 size={15} /></button>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <div style={{ padding: '1rem' }}>
          <EmptyState icon={ListChecks} title={filter === 'done' ? t('tasks.noneDone') : t('tasks.none')} text={writer && filter !== 'done' ? t('tasks.noneHint') : undefined} />
        </div>
      )}
    </Panel>
  );
}

export function NotesThread({ projectId, notes }: { projectId: string; notes: { id: string; authorName: string; body: string; createdAt: string }[] }) {
  const { t, errorText } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const ago = useRelative();
  const [busy, setBusy] = useState(false);
  const send = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const body = String(new FormData(form).get('body') ?? '').trim();
    if (!body) return;
    setBusy(true);
    try { await postNote({ data: { projectId, body } }); form.reset(); await router.invalidate(); }
    catch (caught) { toast({ text: errorText(caught), kind: 'err' }); }
    setBusy(false);
  };
  return (
    <Panel title={t('notes.title')} sub={t('notes.sub')}>
      <form className="note-add" onSubmit={(event) => void send(event)}>
        <textarea name="body" rows={2} maxLength={4000} required placeholder={t('notes.placeholder')} aria-label={t('notes.placeholder')} />
        <button type="submit" className="btn small" disabled={busy}>{t('notes.send')}</button>
      </form>
      {notes.length ? (
        <ol className="note-list">
          {notes.map((note) => (
            <li key={note.id}>
              <Avatar name={note.authorName} />
              <div><span className="small"><b>{note.authorName}</b> · <span className="muted">{ago(note.createdAt)}</span></span><p>{note.body}</p></div>
            </li>
          ))}
        </ol>
      ) : <EmptyState icon={MessagesSquare} title={t('notes.none')} text={t('notes.noneHint')} />}
    </Panel>
  );
}

/** The previous files of a document, newest first, opened on demand. */
export function DocumentVersions({ documentId }: { documentId: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<Awaited<ReturnType<typeof getDocumentVersions>> | null>(null);
  const toggle = async () => {
    setOpen(!open);
    if (!versions) setVersions(await getDocumentVersions({ data: { id: documentId } }).catch(() => []));
  };
  return (
    <span className="doc-versions">
      <button type="button" className="btn ghost small" aria-expanded={open} onClick={() => void toggle()}><History size={14} />{t('docVersions.button')}</button>
      {open ? (
        <span className="doc-versions-list" role="list">
          {versions === null ? <span className="muted small">…</span> : versions.length ? versions.map((version) => (
            <a key={version.id} role="listitem" className="small" href={`/api/files/document/${documentId}?version=${version.id}`} target="_blank" rel="noreferrer">
              <Download size={13} />{t('docVersions.replaced')} <DateText value={version.replacedAt} time />{version.replacedByName ? ` · ${version.replacedByName}` : ''}
            </a>
          )) : <span className="muted small">{t('docVersions.none')}</span>}
        </span>
      ) : null}
    </span>
  );
}

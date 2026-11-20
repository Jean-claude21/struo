import { can } from '@struo/core/permissions';
import { createFileRoute, Link, useRouter } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { ClipboardCheck, FileSignature, HardHat, ImageOff, Inbox, MapPin, Mic, PackageCheck, TriangleAlert } from 'lucide-react';
import { Avatar, Drawer, EmptyState, MenuItem, MenuSep, Modal, PageHeader, Panel, Progress, Seg, StatusChip, useRelative, useToast, type Shape } from '@/components/kit.tsx';
import { DateText } from '@/components/ui.tsx';
import { Board } from '@/components/views/Board.tsx';
import { getFieldDesk, reviewReport, updateIncident } from '@/features/office/server.ts';
import { useI18n, type MessageKey } from '@/i18n/index.tsx';

export const Route = createFileRoute('/app/field')({
  validateSearch: (search: Record<string, unknown>): { report?: string; tab?: string } => ({
    ...(typeof search.report === 'string' ? { report: search.report } : {}),
    ...(typeof search.tab === 'string' ? { tab: search.tab } : {}),
  }),
  loader: () => getFieldDesk(),
  component: FieldDesk,
});

type Data = Awaited<ReturnType<typeof getFieldDesk>>;
type Report = Data['reports'][number];
type Incident = Data['incidents'][number];
type Tab = 'inbox' | 'incidents' | 'checklists' | 'deliveries' | 'signatures';
const PRIORITY_COLOR: Record<string, string> = { critical: 'var(--bad)', important: 'var(--warn)', info: 'var(--info)' };
const ISTATUS_SHAPE: Record<string, Shape> = { open: 'todo', in_progress: 'progress', resolved: 'done' };

function FieldDesk() {
  const { t } = useI18n();
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  const router = useRouter();
  const toast = useToast();
  const ago = useRelative();
  const canReview = can(data.role, 'field.review');
  const pending = data.reports.filter((report) => report.status === 'submitted');
  const [collapsedCols, setCollapsedCols] = useState<string[]>([]);
  const [tab, setTab] = useState<Tab>((search.tab as Tab | undefined) ?? 'inbox');
  const [showAll, setShowAll] = useState(Boolean(search.report));
  const list = showAll ? data.reports : pending;
  const [selectedId, setSelectedId] = useState<string | null>(search.report ?? list[0]?.id ?? null);
  const selected = data.reports.find((report) => report.id === selectedId) ?? null;
  const [photo, setPhoto] = useState(0);
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState('');
  const [openIncident, setOpenIncident] = useState<Incident | null>(null);

  useEffect(() => { setPhoto(0); }, [selectedId]);
  useEffect(() => { if (!selected && list[0]) setSelectedId(list[0].id); }, [list, selected]);

  const review = async (report: Report, decision: 'validated' | 'rejected', reviewNote?: string) => {
    const index = list.findIndex((item) => item.id === report.id);
    try {
      await reviewReport({ data: { id: report.id, decision, note: reviewNote } });
      toast({ text: t(decision === 'validated' ? 'desk.validated' : 'desk.rejected') });
      const next = list[index + 1] ?? list[index - 1];
      setSelectedId(next && next.id !== report.id ? next.id : null);
      await router.invalidate();
    } catch {
      toast({ text: t('errors.generic'), kind: 'err' });
    }
  };

  useEffect(() => {
    if (tab !== 'inbox') return;
    const handler = (event: KeyboardEvent) => {
      if (/input|textarea|select/iu.test((event.target as HTMLElement).tagName) || document.querySelector('.modal, .drawer, .palette')) return;
      const index = list.findIndex((item) => item.id === selectedId);
      if (event.key === 'j' || event.key === 'ArrowDown') { event.preventDefault(); setSelectedId(list[Math.min(list.length - 1, index + 1)]?.id ?? selectedId); }
      if (event.key === 'k' || event.key === 'ArrowUp') { event.preventDefault(); setSelectedId(list[Math.max(0, index - 1)]?.id ?? selectedId); }
      if ((event.key === 'v' || event.key === 'V') && selected && selected.status === 'submitted' && canReview) { event.preventDefault(); void review(selected, 'validated'); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  const saveIncident = async (incident: Incident, patch: Record<string, unknown>, text = t('desk.saved')) => {
    try { await updateIncident({ data: { id: incident.id, patch } }); toast({ text }); await router.invalidate(); }
    catch { toast({ text: t('errors.generic'), kind: 'err' }); }
  };
  const openIncidents = data.incidents.filter((incident) => incident.status !== 'resolved');
  const currentIncident = openIncident ? data.incidents.find((incident) => incident.id === openIncident.id) ?? null : null;

  const tabs = useMemo(() => [
    { value: 'inbox' as const, label: `${t('desk.inbox')} · ${pending.length}`, icon: Inbox },
    { value: 'incidents' as const, label: `${t('desk.incidents')} · ${openIncidents.length}`, icon: TriangleAlert },
    { value: 'checklists' as const, label: t('desk.checklists'), icon: ClipboardCheck },
    { value: 'deliveries' as const, label: t('desk.deliveries'), icon: PackageCheck },
    { value: 'signatures' as const, label: t('desk.signatures'), icon: FileSignature },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [pending.length, openIncidents.length]);

  return (
    <div className="stack loose">
      <PageHeader title={t('field.title')} text={t('desk.subtitle')}>
        <a href="/field" className="btn secondary"><HardHat size={16} />{t('shell.openField')}</a>
      </PageHeader>
      <Seg label={t('field.title')} value={tab} onChange={setTab} items={tabs} />

      {tab === 'inbox' ? (
        <div className="grid-main" style={{ gridTemplateColumns: 'minmax(280px, 380px) minmax(0, 1fr)' }}>
          <Panel title={showAll ? t('desk.allReports') : t('desk.inbox')} flush
            actions={<button type="button" className="btn ghost small" onClick={() => setShowAll(!showAll)}>{showAll ? t('desk.inbox') : t('desk.allReports')}</button>}>
            {list.length ? (
              <div role="listbox" aria-label={t('desk.inbox')} style={{ maxHeight: '68vh', overflowY: 'auto' }}>
                {list.map((report) => (
                  <button key={report.id} type="button" role="option" aria-selected={report.id === selectedId} onClick={() => setSelectedId(report.id)}
                    className="row nowrap" style={{ width: '100%', textAlign: 'left', font: 'inherit', color: 'inherit', border: 0, borderBottom: '1px solid var(--divider)', padding: '.7rem .9rem',
                      background: report.id === selectedId ? 'var(--brand-soft)' : 'transparent', cursor: 'pointer', alignItems: 'flex-start', gap: '.65rem' }}>
                    <span style={{ width: 52, height: 52, borderRadius: 8, overflow: 'hidden', flexShrink: 0, background: 'var(--surface-2)', display: 'grid', placeItems: 'center' }}>
                      {report.photos[0] ? <img src={`/api/files/photo/${report.photos[0].id}`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" /> : <HardHat size={20} style={{ color: 'var(--ink-faint)' }} />}
                    </span>
                    <span className="grow" style={{ minWidth: 0 }}>
                      <span className="row nowrap" style={{ gap: '.4rem' }}><b className="trunc">{report.projectCode}</b><span className="faint xsmall">{ago(report.takenAt)}</span><span className="sp" />
                        {report.status !== 'submitted' ? <StatusChip shape={report.status === 'validated' ? 'done' : 'late'} label="" /> : null}</span>
                      <span className="small trunc" style={{ display: 'block', color: 'var(--ink-2)' }}>{report.note ?? report.transcript ?? report.phaseName ?? '—'}</span>
                      <span className="xsmall faint">{report.authorName}{report.progressPct !== null && report.phaseName ? ` · ${report.phaseName} ${report.progressPct} %` : ''}</span>
                    </span>
                  </button>
                ))}
              </div>
            ) : <EmptyState icon={ClipboardCheck} title={t('desk.nothingToReview')} />}
          </Panel>
          {selected ? (
            <Panel title={`${selected.projectCode} · ${selected.projectName}`} sub={<DateText value={selected.takenAt} time />}
              actions={<StatusChip shape={selected.status === 'validated' ? 'done' : selected.status === 'rejected' ? 'late' : 'review'} label={t(`field.${selected.status}` as MessageKey)} />}>
              <div className="stack loose">
                {selected.photos.length ? (
                  <div className="stack" style={{ gap: '.5rem' }}>
                    <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', background: 'var(--sunken)' }}>
                      <img src={`/api/files/photo/${selected.photos[photo]?.id}`} alt="" style={{ width: '100%', maxHeight: '46vh', objectFit: 'contain', display: 'block' }} />
                      <span className="badge" style={{ position: 'absolute', left: 10, bottom: 10, background: 'rgba(0,0,0,.6)', color: '#fff' }}>
                        <MapPin size={12} />{selected.latitude !== null ? `${selected.latitude.toFixed(4)}, ${selected.longitude?.toFixed(4)}` : '—'} · <DateText value={selected.photos[photo]?.takenAt} time />
                      </span>
                    </div>
                    {selected.photos.length > 1 ? (
                      <div className="row tight">{selected.photos.map((item, index) => (
                        <button key={item.id} type="button" onClick={() => setPhoto(index)} style={{ border: index === photo ? '2px solid var(--brand)' : '1px solid var(--line)', padding: 0, borderRadius: 6, overflow: 'hidden', width: 64, height: 48, cursor: 'pointer' }}>
                          <img src={`/api/files/photo/${item.id}`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        </button>
                      ))}</div>
                    ) : null}
                  </div>
                ) : <div className="row muted small"><ImageOff size={16} />{t('desk.noPhoto')}</div>}
                {selected.phaseName && selected.progressPct !== null ? (
                  <div className="card stack" style={{ gap: '.4rem' }}>
                    <b>{t('desk.proposes', { phase: selected.phaseName, from: selected.status === 'submitted' ? selected.phaseProgressPct ?? 0 : selected.progressPct, to: selected.progressPct })}</b>
                    <Progress value={selected.progressPct} />
                  </div>
                ) : null}
                {selected.note ? <p style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: '1rem' }}>{selected.note}</p> : null}
                {selected.hasAudio ? (
                  <div className="stack" style={{ gap: '.4rem' }}>
                    <span className="row tight muted small"><Mic size={14} />{t(`field.transcriptStatus.${(selected.transcriptStatus ?? 'none') as 'none'}`)}</span>
                    <audio controls preload="none" src={`/api/files/audio/${selected.id}`} style={{ width: '100%' }} />
                    {selected.transcript ? <blockquote style={{ margin: 0, padding: '.6rem .9rem', border: '1px solid var(--line)', background: 'var(--sunken)', borderRadius: 6 }}>{selected.transcript}</blockquote> : null}
                  </div>
                ) : null}
                <div className="row small muted"><Avatar name={selected.authorName} />{t('field.by', { name: selected.authorName })}
                  {selected.latitude !== null ? <a href={`https://www.openstreetmap.org/?mlat=${selected.latitude}&mlon=${selected.longitude}#map=17/${selected.latitude}/${selected.longitude}`} target="_blank" rel="noreferrer">{t('field.gps')}</a> : null}
                </div>
                {canReview && selected.status === 'submitted' ? (
                  <>
                    <div className="pair">
                      <button type="button" className="btn secondary" onClick={() => { setNote(''); setAsking(true); }}>{t('desk.askPrecision')}</button>
                      <button type="button" className="btn" onClick={() => void review(selected, 'validated')}>{t('field.validate')}</button>
                    </div>
                    <span className="faint xsmall hide-m">{t('desk.validateHint')}</span>
                  </>
                ) : null}
              </div>
            </Panel>
          ) : <Panel><EmptyState icon={Inbox} title={t('desk.selectReport')} /></Panel>}
        </div>
      ) : null}

      {tab === 'incidents' ? (
        <Board
          rows={data.incidents}
          columns={(['open', 'in_progress', 'resolved'] as const).map((status) => ({ key: status, label: t(`desk.istatus.${status}`), icon: <StatusChip shape={ISTATUS_SHAPE[status]!} label="" /> }))}
          columnOf={(incident) => incident.status}
          rowId={(incident) => incident.id}
          collapsed={collapsedCols}
          onCollapsedChange={setCollapsedCols}
          canDrag={() => canReview}
          onOpen={(incident) => setOpenIncident(incident)}
          cardMenu={(incident, close) => (
            <>
              <MenuItem onSelect={() => { close(); setOpenIncident(incident); }}>{t('desk.openIncident')}</MenuItem>
              {canReview ? (['open', 'in_progress', 'resolved'] as const).filter((status) => status !== incident.status).map((status) => (
                <MenuItem key={status} onSelect={() => { close(); void saveIncident(incident, { status }); }}>{t('views.setStatus', { status: t(`desk.istatus.${status}`) })}</MenuItem>
              )) : null}
              <MenuSep />
              <MenuItem onSelect={() => { close(); window.location.href = `/app/projects/${incident.projectId}`; }}>{t('plan.openSite')}</MenuItem>
            </>
          )}
          onMove={(incident, to) => saveIncident(incident, { status: to })}
          renderCard={(incident) => (
            <>
              <div className="row nowrap" style={{ gap: '.4rem' }}>
                <span className="dot" style={{ ['--c' as string]: PRIORITY_COLOR[incident.priority] }} />
                <span className="xsmall" style={{ fontWeight: 600, color: PRIORITY_COLOR[incident.priority] }}>{t(`field.priorities.${incident.priority as 'info'}`)}</span>
                <span className="k-key">{incident.projectCode}</span><span className="sp" /><span className="faint xsmall">{ago(incident.createdAt)}</span>
              </div>
              <div className="k-title">{t(`field.kinds.${incident.kind as 'other'}`)}</div>
              <div className="small" style={{ color: 'var(--ink-2)' }}>{incident.description}</div>
              <div className="k-meta">
                {incident.assigneeName ? <span className="row tight"><Avatar name={incident.assigneeName} />{incident.assigneeName.split(' ')[0]}</span> : null}
                {incident.dueOn ? <span><DateText value={incident.dueOn} /></span> : null}
                {incident.impactDays ? <span className="badge warn">+{incident.impactDays} j</span> : null}
              </div>
            </>
          )}
        />
      ) : null}

      {tab === 'checklists' ? (
        <Panel title={t('desk.checklists')} flush>
          {data.checklists.length ? (
            <div className="table-wrap"><table>
              <thead><tr><th>{t('app.date')}</th><th>{t('app.project')}</th><th>{t('desk.checklists')}</th><th>{t('app.status')}</th><th>{t('desk.assignee')}</th></tr></thead>
              <tbody>{data.checklists.map((run) => (
                <tr key={run.id}>
                  <td><DateText value={run.doneAt} time /></td><td><b>{run.projectCode}</b></td><td>{run.name}</td>
                  <td>{run.completed ? <StatusChip shape="done" label={t('desk.completed')} /> : <StatusChip shape="late" label={t('desk.incomplete', { done: run.doneCount, total: run.totalCount })} />}</td>
                  <td>{run.authorName}</td>
                </tr>
              ))}</tbody>
            </table></div>
          ) : <EmptyState icon={ClipboardCheck} title={t('desk.noChecklists')} />}
        </Panel>
      ) : null}

      {tab === 'deliveries' ? (
        <Panel title={t('desk.deliveries')} flush>
          {data.deliveries.length ? (
            <div className="table-wrap"><table>
              <thead><tr><th>{t('app.date')}</th><th>{t('app.project')}</th><th>{t('expenses.supplier')}</th><th>{t('desk.deliveries')}</th><th className="right">Qté</th><th>{t('app.status')}</th><th /></tr></thead>
              <tbody>{data.deliveries.map((delivery) => (
                <tr key={delivery.id}>
                  <td><DateText value={delivery.deliveredOn} /></td><td><b>{delivery.projectCode}</b></td><td>{delivery.supplier ?? '—'}</td><td>{delivery.item}</td>
                  <td className="right num">{delivery.quantity ?? '—'} {delivery.unit ?? ''}</td>
                  <td><StatusChip shape={delivery.verdict === 'conform' ? 'done' : 'late'} label={t(delivery.verdict === 'conform' ? 'desk.conform' : 'desk.reserve')} /></td>
                  <td>{delivery.hasPhoto ? <a href={`/api/files/delivery/${delivery.id}`} target="_blank" rel="noreferrer">{t('app.open')}</a> : null}</td>
                </tr>
              ))}</tbody>
            </table></div>
          ) : <EmptyState icon={PackageCheck} title={t('desk.noDeliveries')} />}
        </Panel>
      ) : null}

      {tab === 'signatures' ? (
        data.signatures.length ? (
          <div className="grid-3">
            {data.signatures.map((signature) => (
              <div key={signature.id} className="card stack" style={{ gap: '.5rem' }}>
                <div className="row nowrap"><b className="trunc grow">{signature.title}</b><span className="k-key">{signature.projectCode}</span></div>
                <img src={`/api/files/signature/${signature.id}`} alt={t('desk.signedBy', { name: signature.signerName })} style={{ width: '100%', height: 110, objectFit: 'contain', background: '#fff', border: '1px solid var(--line)', borderRadius: 8 }} />
                <div className="small">{t('desk.signedBy', { name: signature.signerName })}{signature.signerRole ? ` · ${signature.signerRole}` : ''}</div>
                <div className="row tight">
                  <StatusChip shape={signature.verdict === 'conform' ? 'done' : 'late'} label={t(signature.verdict === 'conform' ? 'desk.conform' : 'desk.reserve')} />
                  <span className="faint xsmall">{t(signature.via === 'portal' ? 'desk.viaPortal' : signature.via === 'office' ? 'desk.viaOffice' : 'desk.viaField')} · {ago(signature.signedAt)}</span>
                </div>
                {signature.reserveNote ? <p className="small" style={{ margin: 0 }}>{signature.reserveNote}</p> : null}
              </div>
            ))}
          </div>
        ) : <Panel><EmptyState icon={FileSignature} title={t('desk.noSignatures')} /></Panel>
      ) : null}

      <Modal open={asking} onClose={() => setAsking(false)} title={t('desk.askPrecision')}
        footer={(<><button type="button" className="btn secondary" onClick={() => setAsking(false)}>{t('app.cancel')}</button>
          <button type="button" className="btn" disabled={!note.trim()} onClick={() => { setAsking(false); if (selected) void review(selected, 'rejected', note.trim()); }}>{t('desk.askPrecision')}</button></>)}>
        <label className="field">{t('desk.precisionNote')}<textarea value={note} onChange={(event) => setNote(event.target.value)} data-autofocus maxLength={1000} /></label>
      </Modal>

      <Drawer open={Boolean(currentIncident)} onClose={() => setOpenIncident(null)}
        title={currentIncident ? `${t(`field.kinds.${currentIncident.kind as 'other'}`)} · ${currentIncident.projectCode}` : ''}
        footer={currentIncident && canReview ? (
          currentIncident.status === 'resolved'
            ? <button type="button" className="btn secondary" onClick={() => void saveIncident(currentIncident, { status: 'open' })}>{t('desk.reopen')}</button>
            : (
              <>
                {currentIncident.status === 'open' ? <button type="button" className="btn secondary" onClick={() => void saveIncident(currentIncident, { status: 'in_progress' })}>{t('desk.startHandling')}</button> : null}
                <button type="button" className="btn" onClick={() => void saveIncident(currentIncident, { status: 'resolved' })}>{t('desk.markResolved')}</button>
              </>
            )
        ) : undefined}>
        {currentIncident ? (
          <div className="stack loose">
            <div className="row">
              <StatusChip shape={ISTATUS_SHAPE[currentIncident.status]!} label={t(`desk.istatus.${currentIncident.status as 'open'}`)} />
              <span className="badge" style={{ color: PRIORITY_COLOR[currentIncident.priority] }}>{t(`field.priorities.${currentIncident.priority as 'info'}`)}</span>
            </div>
            <p style={{ margin: 0, fontSize: '1rem' }}>{currentIncident.description}</p>
            <span className="muted small">{t('desk.reportedBy', { name: currentIncident.authorName, when: ago(currentIncident.createdAt) })} · <Link to="/app/projects/$projectId" params={{ projectId: currentIncident.projectId }}>{currentIncident.projectName}</Link></span>
            {canReview ? (
              <>
                <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0, gap: '.4rem' }}>
                  <legend className="small" style={{ fontWeight: 600, marginBottom: '.4rem' }}>{t('desk.decision')}</legend>
                  {(['redo', 'control', 'accept', 'wait', 'other'] as const).map((decision) => (
                    <label key={decision} className="check"><input type="radio" name="decision" checked={currentIncident.decision === decision}
                      onChange={() => void saveIncident(currentIncident, { decision })} />{t(`desk.decisions.${decision}`)}</label>
                  ))}
                </fieldset>
                <div className="form-grid">
                  <label className="field">{t('desk.assignee')}
                    <select value={currentIncident.assigneeId ?? ''} onChange={(event) => void saveIncident(currentIncident, { assigneeId: event.target.value || null })}>
                      <option value="">—</option>
                      {data.members.map((member) => <option key={member.userId} value={member.userId}>{member.name}</option>)}
                    </select>
                  </label>
                  <label className="field">{t('desk.dueOn')}<input type="date" defaultValue={currentIncident.dueOn ?? ''} onChange={(event) => void saveIncident(currentIncident, { dueOn: event.target.value || null })} /></label>
                  <label className="field">{t('desk.impact')}<input type="number" min={0} max={365} defaultValue={currentIncident.impactDays ?? ''}
                    onBlur={(event) => void saveIncident(currentIncident, { impactDays: event.target.value === '' ? null : Number(event.target.value) })} /></label>
                </div>
                <label className="field">{t('desk.action')}<textarea defaultValue={currentIncident.action ?? ''} rows={3}
                  onBlur={(event) => { if (event.target.value !== (currentIncident.action ?? '')) void saveIncident(currentIncident, { action: event.target.value || null }); }} /></label>
                {currentIncident.status !== 'open' ? (
                  <label className="field">{t('desk.resolution')}<textarea defaultValue={currentIncident.resolutionNote ?? ''} rows={2}
                    onBlur={(event) => { if (event.target.value !== (currentIncident.resolutionNote ?? '')) void saveIncident(currentIncident, { resolutionNote: event.target.value || null }); }} /></label>
                ) : null}
              </>
            ) : null}
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}

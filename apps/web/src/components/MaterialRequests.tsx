// Spec 052: material asked for from the field. The office orders it, marks it delivered or cancels
// it with a word the site lead reads in the field app.
import type { MaterialRequestRow } from '@struo/core';
import { Check, PackageCheck, Truck, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Panel, useToast } from './kit.tsx';
import { getMaterialRequests, updateMaterialRequest } from '@/features/office/server.ts';
import { useI18n } from '@/i18n/index.tsx';

export function MaterialRequests({ projectId, canHandle, showSite = false }: { projectId?: string; canHandle: boolean; showSite?: boolean }) {
  const { t, locale, errorText } = useI18n();
  const toast = useToast();
  const [rows, setRows] = useState<MaterialRequestRow[] | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const load = () => getMaterialRequests({ data: { projectId, open: showSite } }).then(setRows);
  useEffect(() => { void load(); }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps
  const day = (value: string) => new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'fr-FR', { day: 'numeric', month: 'short' }).format(new Date(`${value}T12:00:00`));
  const move = async (id: string, status: 'ordered' | 'delivered' | 'cancelled', officeNote: string | null = null) => {
    try { await updateMaterialRequest({ data: { id, status, officeNote } }); toast({ text: t(`material.done.${status}`) }); setCancelling(null); setNote(''); await load(); }
    catch (caught) { toast({ text: errorText(caught), kind: 'err' }); }
  };
  if (!rows) return null;
  if (showSite && !rows.length) return null;
  const open = rows.filter((row) => row.status === 'open').length;
  return (
    <Panel title={t('material.title')} sub={open ? t('material.open', { n: open }) : t('material.sub')} flush>
      {rows.length ? (
        <ul className="claims">{rows.map((row) => (
          <li key={row.id} className={row.status === 'open' ? 'pending' : ''}>
            <div className="row nowrap">
              <span className="grow trunc">{showSite ? <><b>{row.projectCode}</b> · </> : null}<b>{row.item}</b>{row.quantity ? ` · ${row.quantity}` : ''}</span>
              <span className={`badge ${row.status === 'delivered' ? 'ok' : row.status === 'ordered' ? 'info' : row.status === 'open' ? 'warn' : ''}`}>{t(`material.statuses.${row.status}`)}</span>
            </div>
            <div className="row small muted" style={{ flexWrap: 'wrap', gap: '.2rem .8rem' }}>
              {row.neededOn ? <span>{t('material.forDate', { date: day(row.neededOn) })}</span> : null}
              {row.requesterName ? <span>{t('material.by', { name: row.requesterName })}</span> : null}
              {row.handlerName ? <span>{t('material.handled', { name: row.handlerName })}</span> : null}
            </div>
            {row.note ? <p className="small" style={{ margin: 0 }}>« {row.note} »</p> : null}
            {row.officeNote ? <p className="small muted" style={{ margin: 0 }}>{t('material.officeNote', { note: row.officeNote })}</p> : null}
            {canHandle && (row.status === 'open' || row.status === 'ordered') ? (
              cancelling === row.id ? (
                <form className="row nowrap" onSubmit={(event) => { event.preventDefault(); void move(row.id, 'cancelled', note || null); }}>
                  <input value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} placeholder={t('material.cancelPlaceholder')} aria-label={t('material.cancel')} style={{ flex: 1, minWidth: 0 }} />
                  <button type="submit" className="btn danger small">{t('material.cancel')}</button>
                  <button type="button" className="btn ghost small" onClick={() => setCancelling(null)}>{t('app.cancel')}</button>
                </form>
              ) : (
                <div className="row">
                  {row.status === 'open' ? <button type="button" className="btn small" onClick={() => void move(row.id, 'ordered')}><Truck size={15} />{t('material.markOrdered')}</button> : null}
                  <button type="button" className={`btn small ${row.status === 'open' ? 'secondary' : ''}`} onClick={() => void move(row.id, 'delivered')}><PackageCheck size={15} />{t('material.markDelivered')}</button>
                  <button type="button" className="btn ghost small" onClick={() => setCancelling(row.id)}><X size={15} />{t('material.cancel')}</button>
                </div>
              )
            ) : row.status === 'delivered' ? <span className="small ok-text row tight"><Check size={14} />{t('material.deliveredHint')}</span> : null}
          </li>
        ))}</ul>
      ) : <p className="muted small" style={{ padding: '1rem', margin: 0 }}>{t('material.none')}</p>}
    </Panel>
  );
}

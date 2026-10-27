'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, ChevronRight, Download, ExternalLink, File as FileIcon, FileText, Folder, FolderPlus, Image as ImageIcon, Pencil, Trash2, Upload, X } from 'lucide-react';
import { SaveOffline, useOnline, useSavedFiles } from './pwa';
import { MAX_FILE_BYTES, acceptAttribute, children, extensionOf, fileTypes, formatSize, precheckFile, trail, type StorageItem } from '@/lib/storage-model';

async function json(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Error(data.error || 'Something went wrong.');
  return data;
}
type Queued = { key: string; file: File; state: 'ready' | 'uploading' | 'saving' | 'done' | 'error'; progress: number; error: string };
// fetch() cannot report upload progress, so uploads use XMLHttpRequest.
function send(file: File, subject: string, parentId: string | null, holder: { current: XMLHttpRequest | null }, onProgress: (fraction: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const x = new XMLHttpRequest(); holder.current = x;
    x.open('POST', '/api/storage');
    x.upload.onprogress = e => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    x.onload = () => { let d: { error?: string } = {}; try { d = JSON.parse(x.responseText); } catch { /* non-JSON error page */ } if (x.status >= 200 && x.status < 300) resolve(); else reject(Error(d.error || 'Upload failed.')); };
    x.onerror = () => reject(Error('Network error. Check your connection.'));
    x.onabort = () => reject(Error('cancelled'));
    const form = new FormData(); form.set('subject', subject); if (parentId) form.set('parentId', parentId); form.set('file', file);
    x.send(form);
  });
}
function sendSigned(file: File, url: string, holder: { current: XMLHttpRequest | null }, onProgress: (fraction: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const x = new XMLHttpRequest(); holder.current = x;
    x.open('PUT', url); x.setRequestHeader('x-upsert', 'false');
    x.upload.onprogress = e => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    x.onload = () => { let d: { message?: string } = {}; try { d = JSON.parse(x.responseText); } catch { /* non-JSON storage error */ } if (x.status >= 200 && x.status < 300) resolve(); else reject(Error(d.message || 'PDF upload failed. Check Supabase Storage settings.')); };
    x.onerror = () => reject(Error('Network error. Check your connection.'));
    x.onabort = () => reject(Error('cancelled'));
    const form = new FormData(); form.set('cacheControl', '3600'); form.append('', file);
    x.send(form);
  });
}
const base = (subject: string) => '/subjects/' + subject + '/storage';
const icon = (item: StorageItem) => {
  if (item.kind === 'folder') return <Folder size={20} />;
  const ext = extensionOf(item.name);
  return ext === 'pdf' ? <FileText size={20} /> : ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext) ? <ImageIcon size={20} /> : <FileIcon size={20} />;
};

export default function Storage({ subject, subjectName, folderId, admin }: { subject: string; subjectName: string; folderId?: string; admin: boolean }) {
  const [items, setItems] = useState<StorageItem[]>([]), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [message, setMessage] = useState('');
  const [creating, setCreating] = useState(false), [folderName, setFolderName] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null), [renameValue, setRenameValue] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const files = useSavedFiles(), online = useOnline();
  const [queue, setQueue] = useState<Queued[]>([]), [uploading, setUploading] = useState(false), [finishedBytes, setFinishedBytes] = useState(0);
  const queueRef = useRef<Queued[]>([]); queueRef.current = queue;
  const xhr = useRef<XMLHttpRequest | null>(null), stopped = useRef(false);
  const api = '/api/storage?subject=' + encodeURIComponent(subject);
  const parentId = folderId || null;

  const load = useCallback(async () => { setItems(await json(await fetch(api, { cache: 'no-store' }))); }, [api]);
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    fetch(api, { cache: 'no-store' }).then(json).then(d => { if (active) setItems(d); }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [api]);
  useEffect(() => { setCreating(false); setRenaming(null); setMessage(''); }, [folderId]);

  const path = trail(items, parentId), missing = !loading && !error && path === null;
  const rows = children(items, parentId);
  const run = async (fn: () => Promise<string | void>) => {
    setBusy(true); setError(''); setMessage('');
    try { const done = await fn(); await load(); if (done) setMessage(done); }
    catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong.'); }
    finally { setBusy(false); }
  };

  const createFolder = () => run(async () => {
    await json(await fetch('/api/storage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'folder', subject, parentId, name: folderName }) }));
    setCreating(false); setFolderName(''); return 'Folder created.';
  });
  const addFiles = (files: File[]) => {
    setError(''); setMessage('');
    setQueue(current => [...current, ...files.map(file => { const problem = precheckFile(file.name, file.size); return { key: Math.random().toString(36).slice(2) + Date.now().toString(36), file, state: problem ? 'error' : 'ready', progress: 0, error: problem } as Queued; })]);
    if (input.current) input.current.value = '';
  };
  const patch = (key: string, changes: Partial<Queued>) => setQueue(c => c.map(q => q.key === key ? { ...q, ...changes } : q));
  const startUpload = async () => {
    const todo = queueRef.current.filter(q => q.state === 'ready');
    if (!todo.length) return;
    stopped.current = false; setUploading(true); setBusy(true); setError(''); setMessage(''); setFinishedBytes(0);
    let ok = 0, failed = 0;
    for (const q of todo) {
      if (stopped.current) break;
      if (!queueRef.current.some(x => x.key === q.key)) continue; // removed while waiting
      patch(q.key, { state: 'uploading', progress: 0 });
      try {
        const progress = (f: number) => patch(q.key, { progress: f, state: f >= 1 ? 'saving' : 'uploading' });
        if (extensionOf(q.file.name) === 'pdf' && q.file.size > MAX_FILE_BYTES) {
          const prepared = await json(await fetch('/api/storage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'prepare-upload', subject, parentId, name: q.file.name, size: q.file.size }) }));
          if (prepared.direct) {
            await sendSigned(q.file, prepared.signedUrl, xhr, progress);
            await json(await fetch('/api/storage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'complete-upload', subject, parentId, id: prepared.id, name: q.file.name, size: q.file.size }) }));
          } else {
            await send(q.file, subject, parentId, xhr, progress);
          }
        } else {
          await send(q.file, subject, parentId, xhr, progress);
        }
        ok++; patch(q.key, { state: 'done', progress: 1 }); setFinishedBytes(n => n + q.file.size);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Upload failed.';
        if (msg === 'cancelled') patch(q.key, { state: 'ready', progress: 0 });
        else { failed++; patch(q.key, { state: 'error', error: msg, progress: 0 }); setFinishedBytes(n => n + q.file.size); }
      }
    }
    xhr.current = null;
    setQueue(c => c.filter(q => q.state !== 'done')); // keep failed + untouched files so they can be retried or removed
    setUploading(false); setBusy(false);
    try { await load(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not refresh the list.'); }
    if (ok) setMessage(ok === 1 ? 'File uploaded. It is available to readers.' : `${ok} files uploaded. They are available to readers.`);
    if (failed) setError(`${failed} ${failed === 1 ? 'file' : 'files'} could not be uploaded. Remove ${failed === 1 ? 'it' : 'them'} or try again.`);
  };
  const stopUpload = () => { stopped.current = true; xhr.current?.abort(); };
  const removeQueued = (key: string) => setQueue(c => c.filter(q => q.key !== key));
  useEffect(() => () => { stopped.current = true; xhr.current?.abort(); }, []); // leaving the page cancels the active upload
  useEffect(() => {
    if (!uploading) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [uploading]);
  const waiting = queue.filter(q => q.state === 'ready'), active = queue.find(q => q.state === 'uploading' || q.state === 'saving');
  const pending = queue.filter(q => q.state !== 'error' && q.state !== 'done');
  const remainingBytes = pending.reduce((n, q) => n + q.file.size, 0);
  const overall = uploading ? Math.min(100, Math.round(((finishedBytes + (active ? active.file.size * Math.min(active.progress, 1) : 0)) / Math.max(1, finishedBytes + remainingBytes)) * 100)) : 0;

  const rename = (item: StorageItem) => run(async () => {
    await json(await fetch('/api/storage', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subject, id: item.id, name: renameValue }) }));
    setRenaming(null); return 'Renamed.';
  });
  const remove = (item: StorageItem) => {
    const inside = item.kind === 'folder' ? ' Everything inside it will be deleted too.' : '';
    if (!window.confirm(`Delete “${item.name}”?${inside} This cannot be undone.`)) return;
    void run(async () => { await json(await fetch(api + '&id=' + encodeURIComponent(item.id), { method: 'DELETE' })); return item.kind === 'folder' ? 'Folder deleted.' : 'File deleted.'; });
  };

  // The exact URL we open is the one we save, so the service worker can serve it with no network.
  const filePaths = (item: StorageItem) => { const inline = !!fileTypes[extensionOf(item.name)]?.inline, plain = api + '&id=' + item.id, view = plain + '&view=1'; return { inline, plain, view, key: inline ? view : plain }; };
  const parent = path && path.length ? path[path.length - 1].parentId : null;
  const back = path && path.length ? (parent ? base(subject) + '/' + parent : base(subject)) : '/subjects/' + subject;
  const backLabel = path && path.length ? (parent ? 'Back' : 'Back to Storage') : 'Back to ' + subject;

  return <>
    <Link href={back} className="text-button"><ArrowLeft size={16} />{backLabel}</Link>
    <div className="eyebrow">{subject} / STORAGE</div>
    <div className="page-heading"><div><h1>{path && path.length ? path[path.length - 1].name : 'Storage'}<span className="heading-dot">.</span></h1><p className="muted">Folders, PDFs and files for {subjectName}.</p></div>
      {admin && !missing && <div className="actions">
        <input ref={input} type="file" multiple accept={acceptAttribute} aria-label="Choose files to upload" hidden disabled={busy} onChange={e => { const files = Array.from(e.target.files || []); if (files.length) addFiles(files); }} />
        <button className="secondary" disabled={busy} onClick={() => { setCreating(true); setError(''); }}><FolderPlus size={16} />New folder</button>
        <button className="secondary" disabled={busy} onClick={() => input.current?.click()}><Upload size={16} />{busy ? 'Working…' : 'Upload files'}</button>
      </div>}
    </div>

    <nav className="storage-crumbs" aria-label="Folder path">
      <Link href={base(subject)}>Storage</Link>
      {(path || []).map((f, i) => <span key={f.id}><ChevronRight size={14} />{i === path!.length - 1 ? <strong aria-current="page">{f.name}</strong> : <Link href={base(subject) + '/' + f.id}>{f.name}</Link>}</span>)}
    </nav>

    {!admin && <p className="resource-hint muted">Anyone can view and download. <Link className="text-button inline" href="/admin">Sign in to manage files</Link></p>}
    {admin && <p className="resource-hint muted">PDF, images, Office files, text, CSV or ZIP · PDFs up to 50 MB; other files up to 4 MB · Visible to all readers</p>}

    {error && <div className="banner error" role="alert"><span>{error}</span><button className="text-button" onClick={() => { setError(''); setLoading(true); load().catch(e => setError(e.message)).finally(() => setLoading(false)); }}>Retry</button></div>}
    {files.error && <div className="banner error" role="alert"><span>{files.error}</span></div>}
    {!online && <p className="resource-hint muted">You are offline. Only files saved on this device can be opened.</p>}
    {message && <p role="status" className="resource-message">{message}</p>}

    {admin && queue.length > 0 && <section className="upload-panel" aria-label="Files ready to upload">
      <div className="upload-head">
        <div><strong>{uploading ? 'Uploading…' : 'Ready to upload'}</strong><span>{pending.length} {pending.length === 1 ? 'file' : 'files'} · {formatSize(remainingBytes + (uploading ? finishedBytes : 0))} to {path && path.length ? path[path.length - 1].name : 'Storage'}</span></div>
        {uploading ? <span className="upload-percent">{overall}%</span> : null}
      </div>
      {uploading && <div className="progress-track" role="progressbar" aria-label="Overall upload progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={overall}><div className="progress-fill" style={{ width: overall + '%' }} /></div>}
      <ul className="upload-list">
        {queue.map(q => <li key={q.key} className={'upload-row ' + q.state}>
          <span className="upload-icon">{q.state === 'done' ? <Check size={16} /> : <FileIcon size={16} />}</span>
          <div className="upload-info">
            <strong title={q.file.name}>{q.file.name}</strong>
            <span>{formatSize(q.file.size)}{q.state === 'error' ? <em className="upload-error"> · {q.error}</em> : q.state === 'saving' ? ' · Saving…' : q.state === 'done' ? ' · Uploaded' : q.state === 'uploading' ? ` · ${Math.round(q.progress * 100)}%` : ''}</span>
            {(q.state === 'uploading' || q.state === 'saving') && <div className="progress-track small" role="progressbar" aria-label={'Upload progress for ' + q.file.name} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(q.progress * 100)}><div className="progress-fill" style={{ width: q.progress * 100 + '%' }} /></div>}
          </div>
          <button className="icon-button" aria-label={'Remove ' + q.file.name + ' from the upload list'} disabled={q.state === 'uploading' || q.state === 'saving'} onClick={() => removeQueued(q.key)}><X size={16} /></button>
        </li>)}
      </ul>
      <div className="upload-actions">
        {uploading ? <button className="secondary" onClick={stopUpload}>Stop upload</button> : <>
          <button className="secondary" onClick={() => setQueue([])}>Clear all</button>
          <button className="secondary" onClick={() => input.current?.click()}><Upload size={16} />Add more</button>
          <button className="primary" disabled={!waiting.length} onClick={() => void startUpload()}>Upload {waiting.length} {waiting.length === 1 ? 'file' : 'files'}</button>
        </>}
      </div>
    </section>}

    {creating && admin && <form className="storage-form" onSubmit={e => { e.preventDefault(); void createFolder(); }}>
      <Folder size={18} /><input autoFocus aria-label="Folder name" placeholder="Folder name" value={folderName} maxLength={80} onChange={e => setFolderName(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') setCreating(false); }} />
      <button className="secondary" type="button" disabled={busy} onClick={() => setCreating(false)}>Cancel</button><button className="primary" disabled={busy || !folderName.trim()}>Create</button>
    </form>}

    {loading ? <p className="muted">Loading storage…</p> : missing ? <div className="empty">This folder does not exist or was deleted.<Link className="secondary" href={base(subject)}>Back to Storage</Link></div> :
      <div className="lesson-list">
        {rows.map(item => <div className="lesson-row" key={item.id}>
          <span className="file-icon">{icon(item)}</span>
          {renaming === item.id
            ? <form className="storage-rename" onSubmit={e => { e.preventDefault(); void rename(item); }}><input autoFocus aria-label={'New name for ' + item.name} value={renameValue} maxLength={140} onChange={e => setRenameValue(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') setRenaming(null); }} /><button className="primary" disabled={busy || !renameValue.trim()}>Save</button><button type="button" className="secondary" onClick={() => setRenaming(null)}>Cancel</button></form>
            : item.kind === 'folder'
              ? <Link className="storage-name" href={base(subject) + '/' + item.id}><strong>{item.name}</strong><span>Folder · {items.filter(i => i.parentId === item.id).length} items</span></Link>
              : <div><strong>{item.name}</strong><span>{formatSize(item.size)} · {new Date(item.createdAt).toLocaleDateString()}</span></div>}
          {renaming !== item.id && item.kind === 'file' && (() => { const f = filePaths(item), ready = online || files.isSaved(f.key); return <>
            {ready ? <>
              {f.inline && <a className="secondary" href={f.view} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} />Open</a>}
              {(online || !f.inline) && <a className="secondary" href={f.plain} download={item.name}><Download size={16} />Download</a>}
            </> : <span className="muted offline-note">Needs internet</span>}
            {item.size <= MAX_FILE_BYTES || files.isSaved(f.key)
              ? <SaveOffline path={f.key} name={item.name} files={files} disabled={!online} />
              : <span className="muted offline-note">Too large for offline</span>}
          </>; })()}
          {renaming !== item.id && item.kind === 'folder' && <Link className="secondary" href={base(subject) + '/' + item.id}>Open<ChevronRight size={16} /></Link>}
          {admin && renaming !== item.id && <>
            <button className="icon-button" disabled={busy} aria-label={'Rename ' + item.name} onClick={() => { setRenaming(item.id); setRenameValue(item.kind === 'file' ? item.name.replace(/\.[^.]+$/, '') : item.name); }}><Pencil size={17} /></button>
            <button className="icon-button" disabled={busy} aria-label={'Delete ' + item.name} onClick={() => remove(item)}><Trash2 size={17} /></button>
          </>}
        </div>)}
        {!rows.length && !error && <div className="empty"><Folder size={30} /><h3>{parentId ? 'This folder is empty' : 'Nothing here yet'}</h3><p>{admin ? 'Create a folder or upload files to get started.' : 'Files will appear here when they are added.'}</p></div>}
      </div>}
  </>;
}

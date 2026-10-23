'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ChevronRight, Download, ExternalLink, File as FileIcon, FileText, Folder, FolderPlus, Image as ImageIcon, Pencil, Trash2, Upload } from 'lucide-react';
import { MAX_FILE_BYTES, acceptAttribute, children, extensionOf, fileTypes, formatSize, trail, type StorageItem } from '@/lib/storage-model';

async function json(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Error(data.error || 'Something went wrong.');
  return data;
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
  const upload = (files: File[]) => run(async () => {
    const failed: string[] = []; let ok = 0;
    for (const file of files) {
      try {
        if (file.size > MAX_FILE_BYTES) throw Error('larger than 4 MB');
        const form = new FormData(); form.set('subject', subject); if (parentId) form.set('parentId', parentId); form.set('file', file);
        await json(await fetch('/api/storage', { method: 'POST', body: form })); ok++;
      } catch (e) { failed.push(`${file.name}: ${e instanceof Error ? e.message : 'failed'}`); }
    }
    if (input.current) input.current.value = '';
    if (failed.length) throw Error((ok ? `${ok} uploaded. ` : '') + 'Could not upload ' + failed.join(' · '));
    return ok === 1 ? 'File uploaded. It is available to readers.' : `${ok} files uploaded. They are available to readers.`;
  });
  const rename = (item: StorageItem) => run(async () => {
    await json(await fetch('/api/storage', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subject, id: item.id, name: renameValue }) }));
    setRenaming(null); return 'Renamed.';
  });
  const remove = (item: StorageItem) => {
    const inside = item.kind === 'folder' ? ' Everything inside it will be deleted too.' : '';
    if (!window.confirm(`Delete “${item.name}”?${inside} This cannot be undone.`)) return;
    void run(async () => { await json(await fetch(api + '&id=' + encodeURIComponent(item.id), { method: 'DELETE' })); return item.kind === 'folder' ? 'Folder deleted.' : 'File deleted.'; });
  };

  const parent = path && path.length ? path[path.length - 1].parentId : null;
  const back = path && path.length ? (parent ? base(subject) + '/' + parent : base(subject)) : '/subjects/' + subject;
  const backLabel = path && path.length ? (parent ? 'Back' : 'Back to Storage') : 'Back to ' + subject;

  return <>
    <Link href={back} className="text-button"><ArrowLeft size={16} />{backLabel}</Link>
    <div className="eyebrow">{subject} / STORAGE</div>
    <div className="page-heading"><div><h1>{path && path.length ? path[path.length - 1].name : 'Storage'}<span className="heading-dot">.</span></h1><p className="muted">Folders, PDFs and files for {subjectName}.</p></div>
      {admin && !missing && <div className="actions">
        <input ref={input} type="file" multiple accept={acceptAttribute} aria-label="Choose files to upload" hidden disabled={busy} onChange={e => { const files = Array.from(e.target.files || []); if (files.length) void upload(files); }} />
        <button className="secondary" disabled={busy} onClick={() => { setCreating(true); setError(''); }}><FolderPlus size={16} />New folder</button>
        <button className="secondary" disabled={busy} onClick={() => input.current?.click()}><Upload size={16} />{busy ? 'Working…' : 'Upload files'}</button>
      </div>}
    </div>

    <nav className="storage-crumbs" aria-label="Folder path">
      <Link href={base(subject)}>Storage</Link>
      {(path || []).map((f, i) => <span key={f.id}><ChevronRight size={14} />{i === path!.length - 1 ? <strong aria-current="page">{f.name}</strong> : <Link href={base(subject) + '/' + f.id}>{f.name}</Link>}</span>)}
    </nav>

    {!admin && <p className="resource-hint muted">Anyone can view and download. <Link className="text-button inline" href="/admin">Sign in to manage files</Link></p>}
    {admin && <p className="resource-hint muted">PDF, images, Office files, text, CSV or ZIP · Up to 4 MB each · Visible to all readers</p>}

    {error && <div className="banner error" role="alert"><span>{error}</span><button className="text-button" onClick={() => { setError(''); setLoading(true); load().catch(e => setError(e.message)).finally(() => setLoading(false)); }}>Retry</button></div>}
    {message && <p role="status" className="resource-message">{message}</p>}

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
          {renaming !== item.id && item.kind === 'file' && <>
            {fileTypes[extensionOf(item.name)]?.inline && <a className="secondary" href={api + '&id=' + item.id + '&view=1'} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} />Open</a>}
            <a className="secondary" href={api + '&id=' + item.id} download={item.name}><Download size={16} />Download</a>
          </>}
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

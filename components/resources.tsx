'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Download, FileText, Trash2, Upload } from 'lucide-react';
import { SaveOffline, useOnline, useSavedFiles } from './pwa';
import { MAX_PDF_BYTES, type Resource } from '@/lib/resources-model';

export default function Resources({ subject, admin }: { subject: string; admin: boolean }) {
  const [items, setItems] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const files = useSavedFiles();
  const online = useOnline();
  const url = '/api/resources?subject=' + encodeURIComponent(subject);

  async function json(response: Response) {
    const data = await response.json();
    if (!response.ok) throw Error(data.error || 'Unable to save the resource.');
    return data;
  }

  async function load() {
    setItems(await json(await fetch(url)));
  }

  function uploadSigned(file: File, signedUrl: string) {
    return new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', signedUrl);
      xhr.setRequestHeader('x-upsert', 'false');
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
          return;
        }
        let message = '';
        try {
          const response = JSON.parse(xhr.responseText);
          if (typeof response.message === 'string') message = response.message;
        } catch { /* use the generic upload error */ }
        reject(Error(message || 'PDF upload failed. Check Supabase Storage settings and try again.'));
      };
      xhr.onerror = () => reject(Error('Network error while uploading the PDF.'));
      xhr.onabort = () => reject(Error('PDF upload was cancelled.'));
      const form = new FormData();
      form.set('cacheControl', '3600');
      form.append('', file);
      xhr.send(form);
    });
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    setItems([]);
    setError('');
    setMessage('');
    fetch(url)
      .then(json)
      .then(data => { if (active) setItems(data); })
      .catch(e => { if (active) setError(e.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [url]);

  async function upload(file: File) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (!file.name.toLowerCase().endsWith('.pdf')) throw Error('Choose a PDF file.');
      if (file.size > MAX_PDF_BYTES) throw Error('PDFs must be 50 MB or smaller.');
      const prepared = await json(await fetch('/api/resources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'prepare-upload', subject, name: file.name, size: file.size }),
      }));
      if (prepared.direct) {
        await uploadSigned(file, prepared.signedUrl);
        await json(await fetch('/api/resources', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'complete-upload', subject, key: prepared.key, size: file.size }),
        }));
      } else {
        const data = new FormData();
        data.set('subject', subject);
        data.set('file', file);
        await json(await fetch('/api/resources', { method: 'POST', body: data }));
      }
      await load();
      setMessage('PDF uploaded. It is available to readers.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  async function remove(item: Resource) {
    if (!window.confirm(`Delete “${item.name}”? This cannot be undone.`)) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await json(await fetch(url + '&key=' + encodeURIComponent(item.key), { method: 'DELETE' }));
      await load();
      setMessage('PDF deleted.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="resources-section" aria-labelledby="resources-title">
      <div className="section-heading">
        <div>
          <h2 id="resources-title">Resources &amp; PDFs</h2>
          <p className="muted resource-hint">Lecture slides, reference material, and past papers.</p>
        </div>
        {admin ? <>
          <input
            ref={input}
            type="file"
            accept="application/pdf,.pdf"
            aria-label="Choose PDF resource"
            hidden
            disabled={busy}
            onChange={e => { const file = e.target.files?.[0]; if (file) void upload(file); }}
          />
          <button className="secondary" disabled={busy} onClick={() => input.current?.click()}>
            <Upload size={16} />{busy ? 'Working…' : 'Upload PDF'}
          </button>
        </> : <Link className="text-button" href="/admin">Sign in to upload</Link>}
      </div>
      <p className="resource-hint muted">PDF files · Up to 50 MB each · Uploads are visible to all readers</p>
      {error && <div className="banner error" role="alert">
        <span>{error}</span>
        <button className="text-button" onClick={() => {
          setError('');
          setLoading(true);
          load().catch(e => setError(e.message)).finally(() => setLoading(false));
        }}>Retry</button>
      </div>}
      {files.error && <div className="banner error" role="alert"><span>{files.error}</span></div>}
      {message && <p role="status" className="resource-message">{message}</p>}
      {loading ? <p className="muted">Loading resources…</p> : (
        <div className="lesson-list">
          {items.map(item => {
            const resourceUrl = url + '&key=' + encodeURIComponent(item.key);
            return <div className="lesson-row" key={item.key}>
              <span className="file-icon"><FileText size={20} /></span>
              <div>
                <strong>{item.name}</strong>
                <span>{(item.size / 1024 / 1024).toFixed(2)} MB · {new Date(item.createdAt).toLocaleDateString()}</span>
              </div>
              {online || files.isSaved(resourceUrl)
                ? <a className="secondary" href={resourceUrl} download><Download size={16} />Download</a>
                : <span className="muted offline-note">Needs internet</span>}
              {item.size <= 4 * 1024 * 1024 || files.isSaved(resourceUrl)
                ? <SaveOffline path={resourceUrl} name={item.name} files={files} disabled={!online} />
                : <span className="muted offline-note">Too large for offline</span>}
              {admin && <button className="icon-button" disabled={busy} aria-label={'Delete resource ' + item.name} onClick={() => void remove(item)}><Trash2 size={17} /></button>}
            </div>;
          })}
          {!items.length && !error && <div className="empty">
            No PDFs yet. {admin ? 'Upload your first resource for ' + subject + '.' : 'Resources will appear here when added.'}
          </div>}
        </div>
      )}
    </section>
  );
}

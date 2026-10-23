'use client';
import { useEffect, useState } from 'react';
import { Bell, Check, CloudDownload, RefreshCw, Smartphone, WifiOff, X } from 'lucide-react';
import { alertsSupported, cacheSupported, enableAlerts, fileKey, isStandalone, removeSavedFile, saveFile, savedFileKeys, type Pending } from '@/lib/offline';
import { describeDiff } from '@/lib/sync-model';

type InstallEvent = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> };
const remembered = (key: string) => { try { return localStorage.getItem(key) === '1'; } catch { return false; } };
const remember = (key: string) => { try { localStorage.setItem(key, '1'); } catch { /* private mode */ } };

export function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  return online;
}

// Bottom-of-screen cards: update prompt, offline notice, notification opt-in, install.
export function PwaBar({ offline, pending, savedAt, updating, onUpdate, onLater }: { offline: boolean; pending: Pending | null; savedAt: string | null; updating: boolean; onUpdate: () => void; onLater: () => void }) {
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);
  const [installHidden, setInstallHidden] = useState(true), [alertsHidden, setAlertsHidden] = useState(true), [standalone, setStandalone] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('unsupported');
  useEffect(() => {
    setStandalone(isStandalone()); setInstallHidden(remembered('rz-install-hidden')); setAlertsHidden(remembered('rz-alerts-hidden'));
    setPermission(alertsSupported() ? Notification.permission : 'unsupported');
    const capture = (e: Event) => { e.preventDefault(); setInstallEvent(e as InstallEvent); };
    const installed = () => setInstallEvent(null);
    window.addEventListener('beforeinstallprompt', capture); window.addEventListener('appinstalled', installed);
    return () => { window.removeEventListener('beforeinstallprompt', capture); window.removeEventListener('appinstalled', installed); };
  }, []);

  const showAlerts = !pending && standalone && permission === 'default' && !alertsHidden && !offline;
  const showInstall = !pending && !showAlerts && !standalone && !!installEvent && !installHidden;
  return <div className="pwa-bar" aria-live="polite">
    {offline && <div className="pwa-pill"><WifiOff size={15} />Offline · showing notes saved {savedAt ? new Date(savedAt).toLocaleDateString() : 'on this device'}</div>}
    {pending && <section className="pwa-card" role="status" aria-label="Notes update available">
      <RefreshCw size={20} className={updating ? 'spin' : ''} />
      <div><strong>Notes update available</strong><span>{describeDiff(pending.diff)}. Update now, or keep your current notes.</span></div>
      <div className="pwa-actions"><button className="secondary" disabled={updating} onClick={onLater}>Later</button><button className="primary" disabled={updating} onClick={onUpdate}>{updating ? 'Updating…' : 'Update now'}</button></div>
    </section>}
    {showAlerts && <section className="pwa-card" aria-label="Update alerts">
      <Bell size={20} /><div><strong>Get notified about new notes</strong><span>We will ask before updating anything.</span></div>
      <div className="pwa-actions"><button className="secondary" onClick={() => { remember('rz-alerts-hidden'); setAlertsHidden(true); }}>Not now</button><button className="primary" onClick={async () => { const result = await enableAlerts(); setPermission(result); if (result === 'denied') remember('rz-alerts-hidden'); }}>Turn on</button></div>
    </section>}
    {showInstall && <section className="pwa-card" aria-label="Install app">
      <Smartphone size={20} /><div><strong>Install UNINotes</strong><span>Open it from your home screen and read notes offline.</span></div>
      <div className="pwa-actions"><button className="icon-button" aria-label="Hide install suggestion" onClick={() => { remember('rz-install-hidden'); setInstallHidden(true); }}><X size={16} /></button><button className="primary" onClick={async () => { await installEvent!.prompt(); const choice = await installEvent!.userChoice; setInstallEvent(null); if (choice.outcome !== 'accepted') { remember('rz-install-hidden'); setInstallHidden(true); } }}>Install</button></div>
    </section>}
  </div>;
}

// Tracks which files are saved on this device and saves/removes them on request.
export function useSavedFiles() {
  const [saved, setSaved] = useState<Set<string>>(new Set()), [busy, setBusy] = useState<string | null>(null), [error, setError] = useState('');
  useEffect(() => { let active = true; void savedFileKeys().then(keys => { if (active) setSaved(keys); }); return () => { active = false; }; }, []);
  const isSaved = (path: string) => saved.has(fileKey(path));
  const save = async (path: string) => {
    const connection = (navigator as { connection?: { type?: string; saveData?: boolean } }).connection;
    if ((connection?.type === 'cellular' || connection?.saveData) && !window.confirm('You are using mobile data. Save this file on your phone anyway?')) return;
    setBusy(path); setError('');
    try { await saveFile(path); setSaved(s => new Set(s).add(fileKey(path))); } catch (e) { setError(e instanceof Error ? e.message : 'Could not save this file.'); } finally { setBusy(null); }
  };
  const remove = async (path: string) => {
    setBusy(path); setError('');
    try { await removeSavedFile(path); setSaved(s => { const next = new Set(s); next.delete(fileKey(path)); return next; }); } catch { setError('Could not remove the saved file.'); } finally { setBusy(null); }
  };
  return { isSaved, busy, error, save, remove, supported: cacheSupported() };
}

export function SaveOffline({ path, name, files, disabled }: { path: string; name: string; files: ReturnType<typeof useSavedFiles>; disabled?: boolean }) {
  if (!files.supported) return null;
  const working = files.busy === path;
  return files.isSaved(path)
    ? <><span className="saved-badge"><Check size={14} />Saved offline</span><button className="icon-button" disabled={working} aria-label={'Remove saved copy of ' + name} title="Remove from this device" onClick={() => void files.remove(path)}><X size={16} /></button></>
    : <button className="secondary" disabled={disabled || working || files.busy !== null} aria-label={'Save ' + name + ' for offline use'} onClick={() => void files.save(path)}><CloudDownload size={16} />{working ? 'Saving…' : 'Save offline'}</button>;
}

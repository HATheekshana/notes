'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ChevronDown, ChevronUp, Pencil, Plus, Save, Settings2, Trash2, Undo2, X } from 'lucide-react';
import { ICON_NAMES, PALETTE, addCourse, addSemester, addSubject, allSubjects, moveCourse, moveSemester, moveSubject, removeCourse, removeSemester, removeSubject, renameCourse, renameSemester, subjectsInCourse, subjectsInSemester, suggestCode, suggestSemesterName, updateSubject, validateCurriculum, type Course, type Curriculum, type Semester, type SubjectDef } from '@/lib/curriculum-model';
import { iconFor } from './subject-icons';

type Usage = Record<string, { notes: number; files: number }>;
type Form = { mode: 'course' } | { mode: 'subject'; semesterId: string; editId?: string } | null;
const blankSubject = { id: '', name: '', description: '', icon: 'BookOpen', color: PALETTE[0] as string };

const usageText = (u?: { notes: number; files: number }) => u && (u.notes || u.files) ? [u.notes && `${u.notes} ${u.notes === 1 ? 'note' : 'notes'}`, u.files && `${u.files} ${u.files === 1 ? 'file/folder' : 'files/folders'}`].filter(Boolean).join(' · ') : '';
const message = (e: unknown) => e instanceof Error ? e.message : 'Something went wrong.';

export default function CurriculumEditor({ curriculum, admin, onSaved }: { curriculum: Curriculum; admin: boolean; onSaved: (c: Curriculum) => void }) {
  const [draft, setDraft] = useState<Curriculum>(curriculum), [usage, setUsage] = useState<Usage | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [conflict, setConflict] = useState(false);
  const [form, setForm] = useState<Form>(null), [fields, setFields] = useState(blankSubject), [codeTouched, setCodeTouched] = useState(false), [formError, setFormError] = useState('');
  const [courseName, setCourseName] = useState(''), [courseCode, setCourseCode] = useState('');

  const dirty = useMemo(() => JSON.stringify(draft.courses) !== JSON.stringify(curriculum.courses), [draft, curriculum]);
  useEffect(() => { setDraft(curriculum); }, [curriculum]); // after a save or reload
  const loadUsage = useCallback(async () => { if (!admin) return; try { const r = await fetch('/api/curriculum?usage=1', { cache: 'no-store' }); if (r.ok) setUsage(await r.json()); } catch { /* hints only */ } }, [admin]);
  useEffect(() => { void loadUsage(); }, [loadUsage, curriculum.version]);
  useEffect(() => { if (!dirty) return; const warn = (e: BeforeUnloadEvent) => e.preventDefault(); window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn); }, [dirty]);

  const apply = (fn: () => Curriculum) => { try { setDraft(fn()); setError(''); setNotice(''); } catch (e) { setError(message(e)); } };
  const takenSubjectIds = allSubjects(draft).map(s => s.id);
  const locked = (ids: string[]) => ids.some(id => usage?.[id] && (usage[id].notes || usage[id].files));
  const lockedReason = (ids: string[]) => { const used = ids.filter(id => usage?.[id] && (usage[id].notes || usage[id].files)); return used.length ? `${used.join(', ')} still ${used.length === 1 ? 'has' : 'have'} content. Delete or move it first.` : ''; };

  const save = async () => {
    setBusy(true); setError(''); setNotice(''); setConflict(false);
    try {
      validateCurriculum(draft.courses);
      const response = await fetch('/api/curriculum', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version: curriculum.version, courses: draft.courses }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { if (response.status === 409) setConflict(true); throw Error(data.error || 'Could not save.'); }
      onSaved(data); setNotice('Saved. Everyone now sees the new structure.');
    } catch (e) { setError(message(e)); } finally { setBusy(false); }
  };
  const reloadLatest = async () => { try { const r = await fetch('/api/curriculum', { cache: 'no-store' }), data = await r.json(); if (!r.ok) throw Error(data.error); onSaved(data); setConflict(false); setError(''); setNotice('Loaded the latest version.'); } catch (e) { setError(message(e)); } };

  const openSubjectForm = (semesterId: string, edit?: SubjectDef) => { setForm({ mode: 'subject', semesterId, editId: edit?.id }); setFields(edit ? { id: edit.id, name: edit.name, description: edit.description, icon: edit.icon, color: edit.color } : blankSubject); setCodeTouched(!!edit); setFormError(''); };
  const submitSubject = () => {
    if (form?.mode !== 'subject') return;
    try {
      const next = form.editId ? updateSubject(draft, form.editId, { name: fields.name, description: fields.description, icon: fields.icon, color: fields.color }) : addSubject(draft, form.semesterId, { ...fields });
      validateCurriculum(next.courses); // check first, so an invalid edit is never applied
      setDraft(next); setForm(null); setFormError(''); setNotice('');
    } catch (e) { setFormError(message(e)); }
  };
  const submitCourse = () => { try { setDraft(addCourse(draft, courseCode, courseName.trim())); setForm(null); setCourseName(''); setCourseCode(''); setFormError(''); } catch (e) { setFormError(message(e)); } };

  const move = (arrow: 'up' | 'down') => (arrow === 'up' ? -1 : 1) as -1 | 1;
  const Arrows = ({ onMove, label }: { onMove: (d: -1 | 1) => void; label: string }) => <>
    <button className="icon-button" aria-label={'Move ' + label + ' up'} onClick={() => onMove(move('up'))}><ChevronUp size={16} /></button>
    <button className="icon-button" aria-label={'Move ' + label + ' down'} onClick={() => onMove(move('down'))}><ChevronDown size={16} /></button>
  </>;

  const subjectForm = form?.mode === 'subject' ? <form className="cur-form" onSubmit={e => { e.preventDefault(); submitSubject(); }}>
    <div className="cur-form-row">
      {!form.editId && <label>Code<input value={fields.id} maxLength={12} placeholder="e.g. DBMS" onChange={e => { setCodeTouched(true); setFields({ ...fields, id: e.target.value.toUpperCase() }); }} /></label>}
      <label className="grow">Subject name<input autoFocus value={fields.name} maxLength={80} placeholder="e.g. Database Management Systems" onChange={e => setFields({ ...fields, name: e.target.value, ...(!form.editId && !codeTouched ? { id: suggestCode(e.target.value, takenSubjectIds, 12) } : {}) })} /></label>
    </div>
    <label>Short description (optional)<input value={fields.description} maxLength={100} onChange={e => setFields({ ...fields, description: e.target.value })} /></label>
    <fieldset className="cur-pick"><legend>Icon</legend>{ICON_NAMES.map(n => { const I = iconFor(n); return <button type="button" key={n} aria-label={n} aria-pressed={fields.icon === n} className={fields.icon === n ? 'on' : ''} onClick={() => setFields({ ...fields, icon: n })}><I size={18} /></button>; })}</fieldset>
    <fieldset className="cur-pick"><legend>Colour</legend>{PALETTE.map(c => <button type="button" key={c} aria-label={'Colour ' + c} aria-pressed={fields.color === c} className={'swatch ' + (fields.color === c ? 'on' : '')} style={{ background: c }} onClick={() => setFields({ ...fields, color: c })} />)}</fieldset>
    {formError && <p className="cur-error" role="alert">{formError}</p>}
    <div className="cur-form-actions"><button type="button" className="secondary" onClick={() => setForm(null)}>Cancel</button><button className="primary" disabled={!fields.name.trim() || (!form.editId && !fields.id.trim())}>{form.editId ? 'Update subject' : 'Add subject'}</button></div>
  </form> : null;

  const courseForm = form?.mode === 'course' ? <form className="cur-form" onSubmit={e => { e.preventDefault(); submitCourse(); }}>
    <div className="cur-form-row">
      <label className="grow">Course name<input autoFocus value={courseName} maxLength={60} placeholder="e.g. Information Systems" onChange={e => { setCourseName(e.target.value); if (!codeTouched) setCourseCode(suggestCode(e.target.value, draft.courses.map(c => c.id), 8)); }} /></label>
      <label>Code<input value={courseCode} maxLength={8} placeholder="e.g. IS" onChange={e => { setCodeTouched(true); setCourseCode(e.target.value.toUpperCase()); }} /></label>
    </div>
    {formError && <p className="cur-error" role="alert">{formError}</p>}
    <div className="cur-form-actions"><button type="button" className="secondary" onClick={() => setForm(null)}>Cancel</button><button className="primary" disabled={!courseName.trim() || !courseCode.trim()}>Add course</button></div>
  </form> : null;

  const semesterBlock = (course: Course, sem: Semester) => <div className="cur-semester" key={sem.id}>
    <div className="cur-row">
      <input aria-label={'Semester name in ' + course.name} value={sem.name} maxLength={60} onChange={e => apply(() => renameSemester(draft, sem.id, e.target.value))} />
      <Arrows label={sem.name} onMove={d => apply(() => moveSemester(draft, course.id, sem.id, d))} />
      <button className="icon-button" aria-label={'Delete semester ' + sem.name} disabled={locked(subjectsInSemester(sem))} title={lockedReason(subjectsInSemester(sem)) || 'Delete this semester'}
        onClick={() => { if (!sem.subjects.length || window.confirm(`Remove “${sem.name}” and its ${sem.subjects.length} subject${sem.subjects.length === 1 ? '' : 's'}?`)) apply(() => removeSemester(draft, sem.id)); }}><Trash2 size={16} /></button>
    </div>
    <ul className="cur-subjects">
      {sem.subjects.map(s => { const I = iconFor(s.icon), hint = usageText(usage?.[s.id]); return <li key={s.id}>
        <span className="cur-swatch" style={{ background: s.color }}><I size={17} /></span>
        <div><strong>{s.name}</strong><span>{s.id}{hint ? ' · ' + hint : usage ? ' · empty' : ''}</span></div>
        <button className="icon-button" aria-label={'Edit ' + s.name} onClick={() => openSubjectForm(sem.id, s)}><Pencil size={16} /></button>
        <Arrows label={s.name} onMove={d => apply(() => moveSubject(draft, sem.id, s.id, d))} />
        <button className="icon-button" aria-label={'Delete subject ' + s.name} disabled={locked([s.id])} title={lockedReason([s.id]) || 'Delete this subject'} onClick={() => apply(() => removeSubject(draft, s.id))}><Trash2 size={16} /></button>
      </li>; })}
      {!sem.subjects.length && <li className="cur-none">No subjects yet.</li>}
    </ul>
    {form?.mode === 'subject' && form.semesterId === sem.id ? subjectForm : <button className="secondary cur-add" onClick={() => openSubjectForm(sem.id)}><Plus size={16} />Add subject</button>}
  </div>;

  return <>
    <Link href="/admin" className="text-button"><ArrowLeft size={16} />Back to Manage notes</Link>
    <div className="eyebrow">AUTHOR WORKSPACE</div>
    <div className="page-heading"><div><h1>Courses &amp; subjects<span className="heading-dot">.</span></h1><p className="muted">Add courses, semesters and subjects. Changes reach everyone after you save.</p></div>
      {admin && <div className="actions"><button className="secondary" disabled={!dirty || busy} onClick={() => { setDraft(curriculum); setError(''); setNotice(''); setForm(null); }}><Undo2 size={16} />Discard</button><button className="primary" disabled={!dirty || busy} onClick={() => void save()}><Save size={16} />{busy ? 'Saving…' : 'Save changes'}</button></div>}
    </div>
    {!admin ? <div className="login-card"><span className="large-icon"><Settings2 /></span><h2>Administrator access</h2><p className="muted">Sign in to manage courses, semesters and subjects.</p><Link className="primary" href="/admin">Sign in</Link></div> : <>
      {error && <div className="banner error" role="alert"><span>{error}</span>{conflict && <button className="text-button" onClick={() => void reloadLatest()}>Load latest</button>}<button aria-label="Dismiss error" onClick={() => setError('')}><X size={16} /></button></div>}
      {notice && <div className="banner success" role="status"><span>{notice}</span></div>}
      {dirty && <p className="cur-dirty" role="status">You have unsaved changes. Nothing changes for readers until you press Save.</p>}
      {!draft.courses.length && <div className="empty"><h3>No courses yet</h3><p>Start by adding a course such as Computer Science or Information Systems.</p></div>}
      {draft.courses.map(course => <section className="cur-course" key={course.id} aria-label={course.name}>
        <div className="cur-row cur-course-head">
          <input aria-label="Course name" value={course.name} maxLength={60} onChange={e => apply(() => renameCourse(draft, course.id, e.target.value))} /><span className="cur-code">{course.id}</span>
          <Arrows label={course.name} onMove={d => apply(() => moveCourse(draft, course.id, d))} />
          <button className="icon-button" aria-label={'Delete course ' + course.name} disabled={locked(subjectsInCourse(course))} title={lockedReason(subjectsInCourse(course)) || 'Delete this course'}
            onClick={() => { const n = subjectsInCourse(course).length; if ((!course.semesters.length && !n) || window.confirm(`Remove “${course.name}”, its ${course.semesters.length} semester${course.semesters.length === 1 ? '' : 's'} and ${n} subject${n === 1 ? '' : 's'}?`)) apply(() => removeCourse(draft, course.id)); }}><Trash2 size={16} /></button>
        </div>
        {course.semesters.map(sem => semesterBlock(course, sem))}
        <button className="secondary cur-add" onClick={() => apply(() => addSemester(draft, course.id, suggestSemesterName(course)))}><Plus size={16} />Add semester</button>
      </section>)}
      {form?.mode === 'course' ? courseForm : <button className="secondary cur-add" onClick={() => { setForm({ mode: 'course' }); setCourseName(''); setCourseCode(''); setCodeTouched(false); setFormError(''); }}><Plus size={16} />Add course</button>}
    </>}
  </>;
}

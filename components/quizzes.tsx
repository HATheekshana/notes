'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, ChevronRight, Clock, FileQuestion, Trash2, Upload, X } from 'lucide-react';
import type { PublicQuiz, QuizResult, QuizSummary } from '@/lib/quizzes-model';

async function request(url: string, options?: RequestInit) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Error(data.error || 'Something went wrong.');
  return data;
}

export default function Quizzes({ subject, subjectName, admin }: { subject: string; subjectName: string; admin: boolean }) {
  const [items, setItems] = useState<QuizSummary[]>([]);
  const [quiz, setQuiz] = useState<PublicQuiz | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<QuizResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const url = '/api/quizzes?subject=' + encodeURIComponent(subject);

  async function load() {
    setItems(await request(url));
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    request(url).then(data => { if (active) setItems(data); })
      .catch(e => { if (active) setError(e.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [url]);

  async function upload(file: File) {
    const title = uploadTitle.trim();
    if (!title) {
      setError('Enter a title for the quiz.');
      return;
    }
    setBusy(true); setError(''); setMessage('');
    try {
      const form = new FormData();
      form.set('subject', subject);
      form.set('file', file);
      form.set('title', title);
      await request('/api/quizzes', { method: 'POST', body: form });
      await load();
      setMessage('Quiz imported. It is available to readers.');
      setPendingFile(null);
      setUploadTitle('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not import the quiz.');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  async function openQuiz(item: QuizSummary) {
    setBusy(true); setError(''); setResult(null); setAnswers({});
    try { setQuiz(await request(url + '&id=' + encodeURIComponent(item.id))); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not open the quiz.'); }
    finally { setBusy(false); }
  }

  async function submit() {
    if (!quiz) return;
    setBusy(true); setError('');
    try {
      setResult(await request('/api/quizzes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'submit', subject, id: quiz.id, answers }),
      }));
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not submit the quiz.'); }
    finally { setBusy(false); }
  }

  async function remove(item: QuizSummary) {
    if (!window.confirm(`Delete “${item.title}”? This cannot be undone.`)) return;
    setBusy(true); setError('');
    try { await request(url + '&id=' + encodeURIComponent(item.id), { method: 'DELETE' }); await load(); setMessage('Quiz deleted.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not delete the quiz.'); }
    finally { setBusy(false); }
  }

  return <section className="quiz-section">
    <Link href={'/subjects/' + subject} className="text-button"><ArrowLeft size={16} />Back to {subject}</Link>
    <div className="eyebrow">{subject} / QUESTION PAPERS</div>
    <div className="page-heading">
      <div><h1>{quiz ? quiz.title : 'Question papers'}<span className="heading-dot">.</span></h1>
        <p className="muted">{quiz ? `${quiz.questions.length} questions · ${quiz.minutes} minutes` : `Past-paper quizzes for ${subjectName}.`}</p></div>
      {admin && !quiz && <>
        <input ref={input} type="file" accept=".txt,text/plain" hidden disabled={busy} onChange={e => {
          const file = e.target.files?.[0];
          if (file) { setPendingFile(file); setUploadTitle(file.name.replace(/\.txt$/i, '')); setError(''); }
          if (input.current) input.current.value = '';
        }} />
        <button className="primary" disabled={busy} onClick={() => input.current?.click()}><Upload size={16} />Add quiz TXT</button>
      </>}
      {quiz && <button className="secondary" disabled={busy} onClick={() => { setQuiz(null); setResult(null); setAnswers({}); }}>All quizzes</button>}
    </div>

    {admin && !quiz && pendingFile && <form className="quiz-upload-form" onSubmit={e => { e.preventDefault(); void upload(pendingFile); }}>
      <label>Quiz title<input autoFocus value={uploadTitle} maxLength={160} onChange={e => setUploadTitle(e.target.value)} placeholder="Past Paper 2026" /></label>
      <span className="quiz-upload-file">{pendingFile.name}</span>
      <button className="secondary" type="button" disabled={busy} onClick={() => { setPendingFile(null); setUploadTitle(''); }}>Cancel</button>
      <button className="primary" disabled={busy || !uploadTitle.trim()}>{busy ? 'Importing…' : 'Import quiz'}</button>
    </form>}

    {error && <div className="banner error" role="alert">{error}<button className="icon-button" aria-label="Dismiss error" onClick={() => setError('')}><X size={16} /></button></div>}
    {message && <p role="status" className="resource-message">{message}</p>}

    {!quiz && <>
      <div className="quiz-format-note">
        <strong>TXT format</strong>
        <p>Use TITLE, YEAR and TIME headers, then each QUESTION, A-F choices, ANSWER, and INFO explanation. Separate questions with ---.</p>
      </div>
      {loading ? <p className="muted">Loading question papers…</p> : <div className="lesson-list">
        {items.map(item => <div className="lesson-row quiz-row" key={item.id}>
          <span className="file-icon"><FileQuestion size={20} /></span>
          <div><strong>{item.title}</strong><span>{item.year || 'Past paper'} · {item.questionCount} questions · {item.minutes} min</span></div>
          <button className="secondary" disabled={busy} onClick={() => void openQuiz(item)}>Start quiz<ChevronRight size={16} /></button>
          {admin && <button className="icon-button" disabled={busy} aria-label={'Delete quiz ' + item.title} onClick={() => void remove(item)}><Trash2 size={17} /></button>}
        </div>)}
        {!items.length && !error && <div className="empty"><FileQuestion size={30} /><h3>No question papers yet</h3><p>{admin ? 'Add your first TXT quiz above.' : 'Question papers will appear here when added.'}</p></div>}
      </div>}
    </>}

    {quiz && !result && <form className="quiz-paper" onSubmit={e => { e.preventDefault(); void submit(); }}>
      <div className="quiz-paper-meta"><span><Clock size={16} />{quiz.minutes} minutes</span><span>{Object.keys(answers).length} / {quiz.questions.length} answered</span></div>
      {quiz.questions.map((question, index) => <fieldset className="quiz-question" key={question.id}>
        <legend><span>{index + 1}</span>{question.prompt}</legend>
        <div className="quiz-options">
          {question.options.map(option => <label key={option.key} className={answers[question.id] === option.key ? 'selected' : ''}>
            <input type="radio" name={question.id} value={option.key} checked={answers[question.id] === option.key} onChange={() => setAnswers(current => ({ ...current, [question.id]: option.key }))} />
            <strong>{option.key}</strong><span>{option.text}</span>
          </label>)}
        </div>
      </fieldset>)}
      <button className="primary quiz-submit" disabled={busy || Object.keys(answers).length !== quiz.questions.length}>Submit answers</button>
    </form>}

    {quiz && result && <section className="quiz-results" aria-live="polite">
      <div className={'quiz-score ' + (result.score >= 50 ? 'passed' : '')}><div><span>Your score</span><strong>{result.score}%</strong></div><p>{result.correct} correct out of {result.total}</p></div>
      <h2>Review your answers</h2>
      {result.answers.map((answer, index) => <div className={'quiz-review ' + (answer.isCorrect ? 'correct' : 'wrong')} key={answer.id}>
        <span className="result-icon">{answer.isCorrect ? <Check size={18} /> : <X size={18} />}</span>
        <div><strong>{index + 1}. {answer.prompt}</strong>
          <p>Your answer: <b>{answer.selected || 'Not answered'}</b> · Correct answer: <b>{answer.correct}</b></p>
          <span>{answer.info}</span>
        </div>
      </div>)}
      <button className="secondary" onClick={() => { setResult(null); setAnswers({}); }}>Retry quiz</button>
    </section>}
  </section>;
}

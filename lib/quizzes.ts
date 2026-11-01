import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { dirname } from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { cloudConfigured, cloudRequired, supabaseRequest } from './supabase-repository.ts';
import { publicQuiz, QuizInputError, type Quiz, type QuizSummary } from './quizzes-model.ts';

const summary = (quiz: Quiz): QuizSummary => ({
  id: quiz.id, subject: quiz.subject, title: quiz.title, year: quiz.year, minutes: quiz.minutes,
  questionCount: quiz.questions.length, createdAt: quiz.createdAt,
});

interface Row { id: string; subject: string; title: string; data: Quiz | string; created_at: string; }
const fromRow = (row: Row): Quiz => {
  const data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
  return { ...data, id: row.id, subject: row.subject, title: row.title, createdAt: row.created_at };
};

function localFile() {
  return resolve(process.env.DATABASE_PATH || resolve('data/renxzero.sqlite'), '..', 'quizzes.json');
}

async function localQuizzes(): Promise<Quiz[]> {
  if (cloudRequired()) throw Error('Quizzes are not configured.');
  try { return JSON.parse(await readFile(localFile(), 'utf8')) as Quiz[]; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

async function saveLocal(quizzes: Quiz[]) {
  await mkdir(dirname(localFile()), { recursive: true });
  await writeFile(localFile(), JSON.stringify(quizzes, null, 2), { flag: 'w' });
}

export async function listQuizzes(subject?: string): Promise<QuizSummary[]> {
  let quizzes: Quiz[];
  if (cloudConfigured()) {
    const filter = subject ? `&subject=eq.${encodeURIComponent(subject)}` : '';
    const rows: Row[] = await supabaseRequest(`quizzes?select=id,subject,title,data,created_at&order=created_at.desc${filter}`);
    quizzes = rows.map(fromRow);
  } else quizzes = await localQuizzes();
  if (subject) quizzes = quizzes.filter(quiz => quiz.subject === subject);
  return quizzes.map(summary).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getQuiz(id: string, subject?: string): Promise<Quiz | undefined> {
  let quiz: Quiz | undefined;
  if (cloudConfigured()) {
    const filter = subject ? `&subject=eq.${encodeURIComponent(subject)}` : '';
    const rows: Row[] = await supabaseRequest(`quizzes?select=id,subject,title,data,created_at&id=eq.${encodeURIComponent(id)}${filter}`);
    quiz = rows[0] ? fromRow(rows[0]) : undefined;
  } else quiz = (await localQuizzes()).find(item => item.id === id && (!subject || item.subject === subject));
  return quiz;
}

export async function addQuiz(quiz: Omit<Quiz, 'id' | 'createdAt'>): Promise<QuizSummary> {
  const item: Quiz = { ...quiz, id: randomUUID(), createdAt: new Date().toISOString() };
  if (cloudConfigured()) {
    await supabaseRequest('quizzes', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ id: item.id, subject: item.subject, title: item.title, data: item }),
    });
  } else {
    const quizzes = await localQuizzes();
    quizzes.push(item);
    await saveLocal(quizzes);
  }
  return summary(item);
}

export async function removeQuiz(id: string, subject: string): Promise<void> {
  if (cloudConfigured()) {
    await supabaseRequest(`quizzes?id=eq.${encodeURIComponent(id)}&subject=eq.${encodeURIComponent(subject)}`, { method: 'DELETE' });
  } else {
    const quizzes = await localQuizzes();
    const next = quizzes.filter(quiz => !(quiz.id === id && quiz.subject === subject));
    if (next.length === quizzes.length) throw new QuizInputError('Quiz not found.');
    await saveLocal(next);
  }
}

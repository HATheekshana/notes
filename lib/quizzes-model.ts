export const MAX_QUIZ_BYTES = 4 * 1024 * 1024;

export interface QuizOption {
  key: string;
  text: string;
}

export interface QuizQuestion {
  id: string;
  prompt: string;
  options: QuizOption[];
  answer: string;
  info: string;
}

export interface Quiz {
  id: string;
  subject: string;
  title: string;
  year: string;
  minutes: number;
  questions: QuizQuestion[];
  createdAt: string;
}

export interface PublicQuiz extends Omit<Quiz, 'questions'> {
  questions: Array<Omit<QuizQuestion, 'answer' | 'info'> & { multipleAnswers: boolean }>;
}

export interface QuizSummary {
  id: string;
  subject: string;
  title: string;
  year: string;
  minutes: number;
  questionCount: number;
  createdAt: string;
}

export interface QuizResult {
  score: number;
  correct: number;
  total: number;
  answers: Array<{
    id: string;
    prompt: string;
    selected: string | null;
    correct: string;
    info: string;
    isCorrect: boolean;
  }>;
}

export class QuizInputError extends Error {}

const clean = (value: string) => value.replace(/\r/g, '').trim();

function splitBlocks(text: string) {
  const normalized = clean(text).replace(/^\uFEFF/, '');
  const blocks = normalized.split(/\n\s*(?:-{3,}|={3,}|QUESTION\s+\d+\s*:)\s*\n/i)
    .map(block => block.trim())
    .filter(Boolean);
  if (blocks.length > 1) return blocks;
  const repeated = normalized.split(/(?=^QUESTION\s+\d+\s*:)/im).map(block => block.trim()).filter(Boolean);
  return repeated.length > 1 ? repeated : [normalized];
}

export function parseQuizFile(text: string, subject: string): Omit<Quiz, 'id' | 'createdAt'> {
  const source = clean(text).replace(/^\uFEFF/, '');
  if (!source) throw new QuizInputError('The quiz file is empty.');
  let title = '';
  let year = '';
  let minutes = 30;
  const header = source.match(/^(?:TITLE|QUIZ)\s*:\s*(.+)$/im);
  if (header) title = header[1].trim();
  const yearMatch = source.match(/^YEAR\s*:\s*(.+)$/im);
  if (yearMatch) year = yearMatch[1].trim();
  const timeMatch = source.match(/^(?:TIME(?:\s+MINUTES)?|MINUTES)\s*:\s*(\d+)$/im);
  if (timeMatch) minutes = Number(timeMatch[1]);
  if (title && title.length > 160) throw new QuizInputError('The TITLE header must be under 160 characters.');
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 600) throw new QuizInputError('TIME must be between 1 and 600 minutes.');

  let questionText = source.replace(/^((?:TITLE|QUIZ|YEAR|TIME(?:\s+MINUTES)?|MINUTES)\s*:.*)\n?/gim, '').trim();
  const blocks = splitBlocks(questionText);
  if (!blocks.length || blocks.length > 250) throw new QuizInputError('A quiz must contain between 1 and 250 questions.');

  const questions: QuizQuestion[] = [];
  for (let index = 0; index < blocks.length; index++) {
    let block = blocks[index];
    block = block.replace(/^QUESTION\s+\d+\s*:\s*/im, '').trim();
    let prompt = '';
    let body = block;
    const optionStart = block.search(/^A\s*[).:]/im);
    if (optionStart >= 0) {
      prompt = block.slice(0, optionStart).replace(/^QUESTION\s+\d+\s*[:.)-]?\s*/i, '').trim();
      body = optionStart >= 0 ? block.slice(optionStart) : block;
    } else {
      throw new QuizInputError(`Question ${index + 1} must have a question line.`);
    }

    const options: QuizOption[] = [];
    for (const line of body.split('\n')) {
      const match = /^([A-F])\s*[).:]\s*(.+)$/.exec(line.trim());
      if (match) options.push({ key: match[1].toUpperCase(), text: match[2].trim() });
    }
    if (options.length < 2 || options.length > 6) throw new QuizInputError(`Question ${index + 1} must have between 2 and 6 choices A-F.`);
    const unique = new Set(options.map(option => option.key));
    if (unique.size !== options.length) throw new QuizInputError(`Question ${index + 1} has duplicate choices.`);

    const answerMatch = block.match(/^ANSWERS?\s*:\s*([A-F](?:\s*[,/&+]\s*[A-F])*)(?:\s*\([^)]*\))?\s*$/im);
    const answer = answerMatch?.[1].toUpperCase().split(/\s*[,/&+]\s*/).map(key => key.trim()).filter(Boolean).sort().join(',');
    const answerKeys = answer ? answer.split(',') : [];
    if (!answer || answerKeys.some(key => !options.some(option => option.key === key)) || new Set(answerKeys).size !== answerKeys.length) {
      throw new QuizInputError(`Question ${index + 1} needs a valid "ANSWER: A-F" or "ANSWERS: A, C" line.`);
    }
    const infoMatch = block.match(/^INFO(?:RMATION)?\s*:\s*(.+)$/ims);
    const info = infoMatch ? infoMatch[1].split(/\n(?=(?:A|ANSWER|INFO)\s*[).:])/i)[0].trim() : '';
    if (!info) throw new QuizInputError(`Question ${index + 1} needs an "INFO: ..." explanation.`);

    questions.push({ id: `q${index + 1}`, prompt, options, answer, info });
  }
  return { subject, title, year, minutes, questions };
}

export function publicQuiz(quiz: Quiz): PublicQuiz {
  return {
    id: quiz.id, subject: quiz.subject, title: quiz.title, year: quiz.year, minutes: quiz.minutes, createdAt: quiz.createdAt,
    questions: quiz.questions.map(({ id, prompt, options, answer }) => ({ id, prompt, options, multipleAnswers: answer.includes(',') })),
  };
}

export function scoreQuiz(quiz: Quiz, answers: Record<string, string | string[]>): QuizResult {
  let correct = 0;
  const results = quiz.questions.map(question => {
    const raw = answers[question.id];
    const selectedKeys = Array.isArray(raw) ? raw.map(key => key.toUpperCase()) : typeof raw === 'string' ? [raw.toUpperCase()] : [];
    const selected = selectedKeys.length ? selectedKeys.sort().join(',') : null;
    const isCorrect = selected === question.answer;
    if (isCorrect) correct++;
    return { id: question.id, prompt: question.prompt, selected, correct: question.answer, info: question.info, isCorrect };
  });
  const total = quiz.questions.length;
  return { score: total ? Math.round(correct / total * 100) : 0, correct, total, answers: results };
}

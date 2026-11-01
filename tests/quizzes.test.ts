import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseQuizFile, scoreQuiz, type Quiz } from '../lib/quizzes-model.ts';

test('quiz TXT files are parsed and scored with explanations', () => {
  const parsed = parseQuizFile(`
TITLE: Algorithms 2025
YEAR: 2025
TIME: 45

QUESTION 1:
What does Big-O describe?
A) Exact runtime
B) Upper bound
C) Memory only
D) Compiler output
ANSWER: B
INFO: Big-O describes an asymptotic upper bound.
---
QUESTION 2:
Which structure uses FIFO?
A) Stack
B) Queue
ANSWER: B
INFO: A queue processes items first in, first out.
`, 'FOA');
  assert.equal(parsed.title, 'Algorithms 2025');
  assert.equal(parsed.questions.length, 2);
  const quiz: Quiz = { ...parsed, id: 'quiz-1', createdAt: '2026-01-01' };
  const result = scoreQuiz(quiz, { q1: 'A', q2: 'B' });
  assert.equal(result.correct, 1);
  assert.equal(result.score, 50);
  assert.equal(result.answers[0].correct, 'B');
  assert.match(result.answers[0].info, /upper bound/);
});

test('invalid quiz TXT files and missing explanations are rejected', () => {
  assert.throws(() => parseQuizFile('TITLE: Test\nQUESTION 1: Example\nA) One\nB) Two\nANSWER: A', 'FOA'), /INFO/);
});

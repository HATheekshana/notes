import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as lucide from 'lucide-react';
import { subjectIcons } from '../components/subject-icons.ts';
import { InputError } from '../lib/errors.ts';
import { DEFAULT_COURSES, ICON_NAMES, LIMITS, addCourse, addSemester, addSubject, allSemesters, allSubjects, defaultCurriculum, moveCourse, moveSemester, moveSubject, newSemesterId, parseCurriculum, pickSemesterId, removeCourse, removeSemester, removeSubject, removedSubjectIds, renameCourse, renameSemester, subjectIdsOf, suggestCode, suggestSemesterName, termOf, updateSubject, validateCurriculum, type Curriculum, type SubjectDef } from '../lib/curriculum-model.ts';

const subj = (id: string, over: Partial<SubjectDef> = {}): SubjectDef => ({ id, name: 'Subject ' + id, description: '', icon: 'Code', color: '#7367eb', ...over });
const base = (): Curriculum => ({ version: 3, courses: structuredClone(DEFAULT_COURSES) });

test('the built-in default keeps the original five subjects and is itself valid', () => {
  assert.deepEqual(subjectIdsOf(defaultCurriculum), ['FOA', 'OS', 'IWT', 'DBMS', 'OOP']);
  assert.deepEqual(validateCurriculum(DEFAULT_COURSES), DEFAULT_COURSES);
  assert.equal(termOf(defaultCurriculum, 'DBMS')!.semester.name, 'Year 1 · Semester 2');
});

test('the SQL seed matches the built-in default (no drift between code and database)', () => {
  const sql = readFileSync(new URL('../supabase/curriculum.sql', import.meta.url), 'utf8');
  const seed = /\$json\$([\s\S]*?)\$json\$/.exec(sql);
  assert.ok(seed, 'seed JSON present between $json$ markers');
  assert.deepEqual(JSON.parse(seed![1]), DEFAULT_COURSES);
});

test('every icon in the picker exists in the icon map the UI uses', () => {
  for (const name of ICON_NAMES) assert.ok((lucide as Record<string, unknown>)[name], name + ' exists in lucide-react');
});

test('the icon picker and the icon component map list exactly the same icons', () => {
  assert.deepEqual(Object.keys(subjectIcons).sort(), [...ICON_NAMES].sort());
});

test('validation normalises values and gives clear messages', () => {
  const ok = validateCurriculum([{ id: ' is ', name: '  Information   Systems ', semesters: [{ id: 'SEM-ABC123', name: 'Year 2 · Semester 1', subjects: [{ id: 'ds-1', name: ' Data  Structures ', description: undefined, icon: 'Code', color: '#ABCDEF' }] }] }]);
  assert.deepEqual([ok[0].id, ok[0].name, ok[0].semesters[0].id, ok[0].semesters[0].subjects[0].id, ok[0].semesters[0].subjects[0].name, ok[0].semesters[0].subjects[0].color, ok[0].semesters[0].subjects[0].description], ['IS', 'Information Systems', 'sem-abc123', 'DS-1', 'Data Structures', '#abcdef', '']);
  const bad = (c: unknown, re: RegExp) => assert.throws(() => validateCurriculum(c), (e: Error) => e instanceof InputError && re.test(e.message));
  bad('x', /Invalid curriculum/);
  bad([{ id: '1X', name: 'A', semesters: [] }], /Course code/);
  bad([{ id: 'CS', name: '', semesters: [] }], /Course name is required/);
  bad([{ id: 'CS', name: 'A', semesters: [] }, { id: 'cs', name: 'B', semesters: [] }], /used twice/);
  bad([{ id: 'CS', name: 'Same', semesters: [] }, { id: 'IS', name: 'same', semesters: [] }], /two courses named/);
  const withSubject = (s: object) => [{ id: 'CS', name: 'A', semesters: [{ id: 'sem-1', name: 'S', subjects: [s] }] }];
  bad(withSubject({ ...subj('x'), id: 'a/b' }), /Subject code/);
  bad(withSubject({ ...subj('OK1'), icon: 'Nope' }), /icon/);
  bad(withSubject({ ...subj('OK1'), color: 'red' }), /colour/);
  bad(withSubject({ ...subj('OK1'), name: 'n'.repeat(81) }), /80 characters/);
  bad(withSubject({ ...subj('OK1'), description: 'd'.repeat(101) }), /100 characters/);
  bad([{ id: 'CS', name: 'A', semesters: [{ id: 'sem-1', name: 'S', subjects: [subj('AB'), subj('ab', { name: 'Other' })] }] }], /already used/);
  bad([{ id: 'CS', name: 'A', semesters: [{ id: 'sem-1', name: 'S', subjects: [subj('AB')] }] }, { id: 'IS', name: 'B', semesters: [{ id: 'sem-2', name: 'S', subjects: [subj('AB', { name: 'Other' })] }] }], /unique across all courses \(for example IS-AB\)/);
  bad([{ id: 'CS', name: 'A', semesters: [{ id: 'sem-1', name: 'S', subjects: [] }, { id: 'sem-2', name: 's', subjects: [] }] }], /already has a semester named/);
  bad([{ id: 'CS', name: 'A', semesters: [{ id: 'sem-1', name: 'S', subjects: [] }, { id: 'sem-1', name: 'T', subjects: [] }] }], /appears twice/);
});

test('limits are enforced', () => {
  const many = (n: number) => Array.from({ length: n }, (_, i) => ({ id: 'C' + String.fromCharCode(65 + (i % 26)) + Math.floor(i / 26), name: 'Course ' + i, semesters: [] }));
  assert.equal(validateCurriculum(many(LIMITS.courses)).length, LIMITS.courses);
  assert.throws(() => validateCurriculum(many(LIMITS.courses + 1)), /up to 10 courses/);
  const subjects = Array.from({ length: LIMITS.subjectsPerSemester + 1 }, (_, i) => subj('S' + String(i).padStart(2, '0')));
  assert.throws(() => validateCurriculum([{ id: 'CS', name: 'A', semesters: [{ id: 'sem-1', name: 'S', subjects }] }]), /up to 20 subjects/);
});

test('parseCurriculum never throws and rejects bad data', () => {
  assert.deepEqual(parseCurriculum({ version: 2, courses: DEFAULT_COURSES })!.version, 2);
  for (const junk of [null, 'x', {}, { version: 'a', courses: [] }, { version: 1, courses: [{ id: 'bad' }] }]) assert.equal(parseCurriculum(junk), null);
});

test('adding a course, semester and subject (the admin workflow) works and validates immediately', () => {
  let c = base();
  c = addCourse(c, 'is', 'Information Systems');
  c = addSemester(c, 'IS', 'Year 2 · Semester 1', 'sem-is21');
  c = addSubject(c, 'sem-is21', subj('ISDB', { name: 'Database Design' }));
  assert.deepEqual(termOf(c, 'ISDB')!.course.id, 'IS');
  assert.equal(allSemesters(c).length, 2);
  assert.throws(() => addCourse(c, 'IS', 'Another'), /used twice/);
  assert.throws(() => addSubject(c, 'sem-is21', subj('DBMS')), /already used/, 'a code used by CS cannot be reused in IS');
  assert.throws(() => addSubject(c, 'sem-is21', subj('X')), /Subject code/);
  assert.equal(c.courses.length, 2, 'original not mutated by failed adds');
});

test('rename, move, update and remove helpers are immutable and keep subject codes fixed', () => {
  const c0 = base(); const c1 = renameCourse(c0, 'CS', 'Computing');
  assert.equal(c0.courses[0].name, 'Computer Science'); assert.equal(c1.courses[0].name, 'Computing');
  const c2 = updateSubject(c1, 'FOA', { name: 'Algorithms', color: '#111111', id: 'HACK' } as never);
  assert.equal(allSubjects(c2).find(s => s.id === 'FOA')!.name, 'Algorithms');
  assert.ok(!subjectIdsOf(c2).includes('HACK'), 'the code is never changed by an update');
  const c3 = moveSubject(c2, 'y1s2', 'FOA', 1); assert.deepEqual(subjectIdsOf(c3).slice(0, 2), ['OS', 'FOA']);
  assert.deepEqual(subjectIdsOf(moveSubject(c3, 'y1s2', 'OOP', 1)), subjectIdsOf(c3), 'moving the last item down does nothing');
  let c4 = addCourse(c3, 'IS', 'Information Systems'); c4 = moveCourse(c4, 'IS', -1); assert.deepEqual(c4.courses.map(x => x.id), ['IS', 'CS']);
  c4 = addSemester(c4, 'CS', 'Year 2 · Semester 1', 'sem-b'); c4 = moveSemester(c4, 'CS', 'sem-b', -1); assert.deepEqual(c4.courses[1].semesters.map(s => s.id), ['sem-b', 'y1s2']);
  c4 = renameSemester(c4, 'sem-b', 'Second year'); assert.equal(c4.courses[1].semesters[0].name, 'Second year');
  assert.deepEqual(removedSubjectIds(c0.courses, removeSemester(c0, 'y1s2').courses), ['FOA', 'OS', 'IWT', 'DBMS', 'OOP']);
  assert.deepEqual(removedSubjectIds(c0.courses, removeSubject(c0, 'OS').courses), ['OS']);
  assert.equal(removedSubjectIds(c0.courses, removeCourse(c0, 'CS').courses).length, 5);
  assert.deepEqual(removedSubjectIds(c0.courses, moveSubject(c0, 'y1s2', 'OS', 1).courses), [], 'reordering removes nothing');
});

test('semester picking: the viewed subject wins, then the saved choice, then the first non-empty semester', () => {
  let c = base(); c = addCourse(c, 'IS', 'Information Systems'); c = addSemester(c, 'IS', 'Year 1 · Semester 1', 'sem-empty'); c = addSemester(c, 'IS', 'Year 2 · Semester 1', 'sem-is'); c = addSubject(c, 'sem-is', subj('ISDB'));
  assert.equal(pickSemesterId(c), 'y1s2', 'first with subjects');
  assert.equal(pickSemesterId(c, undefined, 'sem-is'), 'sem-is', 'saved choice');
  assert.equal(pickSemesterId(c, 'ISDB', 'y1s2'), 'sem-is', 'the subject being viewed wins');
  assert.equal(pickSemesterId(c, undefined, 'deleted-id'), 'y1s2', 'stale saved choice ignored');
  assert.equal(pickSemesterId({ version: 1, courses: [] }), '', 'empty curriculum');
});

test('suggestions: codes from names, avoiding duplicates; next semester name', () => {
  assert.equal(suggestCode('Information Systems', [], 8), 'IS');
  assert.equal(suggestCode('Database Management Systems', [], 12), 'DMS');
  assert.equal(suggestCode('Algorithms', [], 12), 'ALGO');
  assert.equal(suggestCode('Information Systems', ['IS'], 8), 'IS2');
  assert.equal(suggestCode('Information Systems', ['IS', 'IS2'], 8), 'IS3');
  assert.equal(suggestCode('X', [], 8), 'XX');
  const course = { id: 'CS', name: 'CS', semesters: [] as { id: string; name: string; subjects: [] }[] };
  assert.equal(suggestSemesterName(course), 'Year 1 · Semester 1');
  course.semesters.push({ id: 'a', name: 'a', subjects: [] }); assert.equal(suggestSemesterName(course), 'Year 1 · Semester 2');
  course.semesters.push({ id: 'b', name: 'b', subjects: [] }); assert.equal(suggestSemesterName(course), 'Year 2 · Semester 1');
  assert.match(newSemesterId(), /^sem-[a-z0-9]{6}$/); assert.equal(newSemesterId(() => 0), 'sem-000000');
});

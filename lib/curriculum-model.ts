// The structure of the study space: Course -> Semester -> Subject. Managed by the administrator in the app.
// Pure functions only (no I/O) so the server, the editor screen and the tests all share the same rules.
import { InputError } from './errors.ts';

export type SubjectDef = { id: string; name: string; description: string; icon: string; color: string };
export type Semester = { id: string; name: string; subjects: SubjectDef[] };
export type Course = { id: string; name: string; semesters: Semester[] };
export type Curriculum = { version: number; courses: Course[] };
export type FlatSubject = SubjectDef & { courseId: string; courseName: string; semesterId: string; semesterName: string };

export const LIMITS = { courses: 10, semestersPerCourse: 12, subjectsPerSemester: 20, subjects: 150 };
// These names must exist in components/subject-icons.ts (a test checks this).
export const ICON_NAMES = ['Braces', 'Cpu', 'Globe', 'Database', 'Boxes', 'BookOpen', 'Calculator', 'Network', 'ShieldCheck', 'Code', 'Server', 'BarChart3', 'Briefcase', 'Layers', 'FlaskConical', 'Palette', 'Terminal', 'Workflow', 'Lightbulb', 'Languages', 'Atom', 'Smartphone', 'Cloud', 'Bot', 'Brain', 'Users'] as const;
export const PALETTE = ['#7367eb', '#269e8a', '#d48a32', '#3a8edb', '#cd6499', '#d6564f', '#5aa13c', '#8a6bd1', '#2f9bb3', '#a8873a'] as const;

export const courseIdPattern = /^[A-Z][A-Z0-9]{1,7}$/;
export const subjectIdPattern = /^[A-Z0-9][A-Z0-9_-]{1,11}$/;
export const semesterIdPattern = /^[a-z0-9][a-z0-9-]{2,23}$/;
const control = /[\u0000-\u001f\u007f]/;

// The subjects that existed before this feature. Seeded as Computer Science -> Year 1 · Semester 2 so existing notes and files stay linked.
export const DEFAULT_COURSES: Course[] = [{
  id: 'CS', name: 'Computer Science', semesters: [{
    id: 'y1s2', name: 'Year 1 · Semester 2', subjects: [
      { id: 'FOA', name: 'Fundamentals of Algorithms', description: 'Think clearly. Solve efficiently.', icon: 'Braces', color: '#7367eb' },
      { id: 'OS', name: 'Operating Systems', description: 'Understand what runs underneath.', icon: 'Cpu', color: '#269e8a' },
      { id: 'IWT', name: 'Internet & Web Technologies', description: 'Build for a connected world.', icon: 'Globe', color: '#d48a32' },
      { id: 'DBMS', name: 'Database Management Systems', description: 'Give your data a structure.', icon: 'Database', color: '#3a8edb' },
      { id: 'OOP', name: 'Object-Oriented Programming', description: 'Model ideas through objects.', icon: 'Boxes', color: '#cd6499' },
    ],
  }],
}];
// version 0 = "built in, never saved". Used until the administrator saves a curriculum.
export const defaultCurriculum: Curriculum = { version: 0, courses: DEFAULT_COURSES };

const clean = (v: unknown, label: string, max: number, min = 1): string => {
  if (typeof v !== 'string') throw new InputError(`${label} is required.`);
  const s = v.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (s.length < min) throw new InputError(`${label} is required.`);
  if (s.length > max) throw new InputError(`${label} must be ${max} characters or fewer.`);
  if (control.test(s)) throw new InputError(`${label} contains invalid characters.`);
  return s;
};
const upperId = (v: unknown, label: string, pattern: RegExp, hint: string): string => {
  const s = typeof v === 'string' ? v.trim().toUpperCase() : '';
  if (!pattern.test(s)) throw new InputError(`${label} ${hint}`);
  return s;
};

// Validates and normalises a whole curriculum. Throws InputError with a message safe to show.
export function validateCurriculum(input: unknown): Course[] {
  if (!Array.isArray(input)) throw new InputError('Invalid curriculum.');
  if (input.length > LIMITS.courses) throw new InputError(`You can have up to ${LIMITS.courses} courses.`);
  const courseIds = new Set<string>(), semesterIds = new Set<string>(), subjectIds = new Set<string>(), courseNames = new Set<string>();
  let total = 0;
  const courses = input.map((c: any): Course => {
    if (!c || typeof c !== 'object') throw new InputError('Invalid course.');
    const id = upperId(c.id, 'Course code', courseIdPattern, 'must be 2–8 letters or digits and start with a letter (for example CS or IS).');
    const name = clean(c.name, 'Course name', 60);
    if (courseIds.has(id)) throw new InputError(`The course code ${id} is used twice.`);
    if (courseNames.has(name.toLowerCase())) throw new InputError(`There are two courses named “${name}”.`);
    courseIds.add(id); courseNames.add(name.toLowerCase());
    if (!Array.isArray(c.semesters)) throw new InputError('Invalid course.');
    if (c.semesters.length > LIMITS.semestersPerCourse) throw new InputError(`${name} can have up to ${LIMITS.semestersPerCourse} semesters.`);
    const semesterNames = new Set<string>();
    const semesters = c.semesters.map((s: any): Semester => {
      if (!s || typeof s !== 'object') throw new InputError('Invalid semester.');
      const sid = typeof s.id === 'string' ? s.id.trim().toLowerCase() : '';
      if (!semesterIdPattern.test(sid)) throw new InputError('Invalid semester.');
      const sname = clean(s.name, 'Semester name', 60);
      if (semesterIds.has(sid)) throw new InputError('A semester appears twice.');
      if (semesterNames.has(sname.toLowerCase())) throw new InputError(`${name} already has a semester named “${sname}”.`);
      semesterIds.add(sid); semesterNames.add(sname.toLowerCase());
      if (!Array.isArray(s.subjects)) throw new InputError('Invalid semester.');
      if (s.subjects.length > LIMITS.subjectsPerSemester) throw new InputError(`${sname} can have up to ${LIMITS.subjectsPerSemester} subjects.`);
      const subjectNames = new Set<string>();
      const subjects = s.subjects.map((x: any): SubjectDef => {
        if (!x || typeof x !== 'object') throw new InputError('Invalid subject.');
        const xid = upperId(x.id, 'Subject code', subjectIdPattern, 'must be 2–12 letters, digits, - or _ (for example DBMS).');
        const xname = clean(x.name, 'Subject name', 80);
        const description = x.description === undefined || x.description === null || x.description === '' ? '' : clean(x.description, 'Description', 100, 0);
        const icon = ICON_NAMES.includes(x.icon) ? x.icon : null;
        if (!icon) throw new InputError('Choose an icon for each subject.');
        const color = typeof x.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(x.color) ? x.color.toLowerCase() : null;
        if (!color) throw new InputError('Choose a colour for each subject.');
        if (subjectIds.has(xid)) throw new InputError(`The subject code ${xid} is already used. Codes must be unique across all courses (for example ${id}-${xid}).`);
        if (subjectNames.has(xname.toLowerCase())) throw new InputError(`${sname} already has a subject named “${xname}”.`);
        subjectIds.add(xid); subjectNames.add(xname.toLowerCase()); total++;
        return { id: xid, name: xname, description, icon, color };
      });
      return { id: sid, name: sname, subjects };
    });
    return { id, name, semesters };
  });
  if (total > LIMITS.subjects) throw new InputError(`You can have up to ${LIMITS.subjects} subjects in total.`);
  return courses;
}

// For data read back from a cache or the network: never throws.
export function parseCurriculum(raw: unknown): Curriculum | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { version?: unknown; courses?: unknown };
  if (typeof r.version !== 'number') return null;
  try { return { version: r.version, courses: validateCurriculum(r.courses) }; } catch { return null; }
}

// ---- reading helpers ------------------------------------------------------------------------
export function allSubjects(c: Curriculum): FlatSubject[] {
  return c.courses.flatMap(course => course.semesters.flatMap(sem => sem.subjects.map(s => ({ ...s, courseId: course.id, courseName: course.name, semesterId: sem.id, semesterName: sem.name }))));
}
export const subjectIdsOf = (c: Curriculum) => allSubjects(c).map(s => s.id);
export const allSemesters = (c: Curriculum) => c.courses.flatMap(course => course.semesters.map(semester => ({ course, semester })));
export function termOf(c: Curriculum, subjectId: string) {
  for (const course of c.courses) for (const semester of course.semesters) if (semester.subjects.some(s => s.id === subjectId)) return { course, semester };
  return null;
}
export function removedSubjectIds(before: Course[], after: Course[]): string[] {
  const now = new Set(allSubjects({ version: 0, courses: after }).map(s => s.id));
  return allSubjects({ version: 0, courses: before }).map(s => s.id).filter(id => !now.has(id));
}
// Which semester the sidebar/overview should show: the subject being viewed, else the saved choice, else the first with subjects.
export function pickSemesterId(c: Curriculum, activeSubjectId?: string, saved?: string): string {
  const all = allSemesters(c);
  const fromSubject = activeSubjectId ? termOf(c, activeSubjectId)?.semester.id : undefined;
  if (fromSubject) return fromSubject;
  if (saved && all.some(t => t.semester.id === saved)) return saved;
  return (all.find(t => t.semester.subjects.length) || all[0])?.semester.id || '';
}

// ---- suggestions -----------------------------------------------------------------------------
export function suggestCode(name: string, taken: string[], max: number, min = 2): string {
  const words = name.toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').split(' ').filter(w => w && !['OF', 'AND', 'THE', 'TO', 'IN', 'FOR'].includes(w));
  let base = words.length > 1 ? words.map(w => w[0]).join('') : (words[0] || '').slice(0, 4);
  base = base.slice(0, max);
  while (base.length < min) base += 'X';
  const used = new Set(taken.map(t => t.toUpperCase()));
  if (!used.has(base)) return base;
  for (let n = 2; n < 100; n++) { const suffix = String(n), candidate = base.slice(0, max - suffix.length) + suffix; if (!used.has(candidate)) return candidate; }
  return base;
}
export function suggestSemesterName(course: Course): string {
  const n = course.semesters.length;
  return `Year ${Math.floor(n / 2) + 1} · Semester ${(n % 2) + 1}`;
}
export const newSemesterId = (random: () => number = Math.random) => 'sem-' + Math.floor(random() * 36 ** 6).toString(36).padStart(6, '0');

// ---- editing (immutable; used by the editor screen and the tests) ---------------------------
const edit = (c: Curriculum, courses: Course[]): Curriculum => ({ ...c, courses });
const mapCourse = (c: Curriculum, id: string, fn: (course: Course) => Course) => edit(c, c.courses.map(x => x.id === id ? fn(x) : x));
const mapSemester = (c: Curriculum, id: string, fn: (s: Semester) => Semester) => edit(c, c.courses.map(course => ({ ...course, semesters: course.semesters.map(s => s.id === id ? fn(s) : s) })));
function moveIn<T extends { id: string }>(list: T[], id: string, direction: -1 | 1): T[] {
  const i = list.findIndex(x => x.id === id), j = i + direction;
  if (i < 0 || j < 0 || j >= list.length) return list;
  const copy = [...list]; [copy[i], copy[j]] = [copy[j], copy[i]]; return copy;
}
const checked = (c: Curriculum) => { validateCurriculum(c.courses); return c; };

export const addCourse = (c: Curriculum, id: string, name: string) => checked(edit(c, [...c.courses, { id: id.trim().toUpperCase(), name, semesters: [] }]));
export const renameCourse = (c: Curriculum, id: string, name: string) => mapCourse(c, id, x => ({ ...x, name }));
export const removeCourse = (c: Curriculum, id: string) => edit(c, c.courses.filter(x => x.id !== id));
export const moveCourse = (c: Curriculum, id: string, d: -1 | 1) => edit(c, moveIn(c.courses, id, d));

export const addSemester = (c: Curriculum, courseId: string, name: string, id = newSemesterId()) => checked(mapCourse(c, courseId, x => ({ ...x, semesters: [...x.semesters, { id, name, subjects: [] }] })));
export const renameSemester = (c: Curriculum, id: string, name: string) => mapSemester(c, id, s => ({ ...s, name }));
export const removeSemester = (c: Curriculum, id: string) => edit(c, c.courses.map(course => ({ ...course, semesters: course.semesters.filter(s => s.id !== id) })));
export const moveSemester = (c: Curriculum, courseId: string, id: string, d: -1 | 1) => mapCourse(c, courseId, x => ({ ...x, semesters: moveIn(x.semesters, id, d) }));

export const addSubject = (c: Curriculum, semesterId: string, subject: SubjectDef) => checked(mapSemester(c, semesterId, s => ({ ...s, subjects: [...s.subjects, { ...subject, id: subject.id.trim().toUpperCase() }] })));
// The code (id) never changes: notes and files are linked to it.
export const updateSubject = (c: Curriculum, id: string, patch: Partial<Omit<SubjectDef, 'id'>>) => edit(c, c.courses.map(course => ({ ...course, semesters: course.semesters.map(s => ({ ...s, subjects: s.subjects.map(x => x.id === id ? { ...x, ...patch, id: x.id } : x) })) })));
export const removeSubject = (c: Curriculum, id: string) => edit(c, c.courses.map(course => ({ ...course, semesters: course.semesters.map(s => ({ ...s, subjects: s.subjects.filter(x => x.id !== id) })) })));
export const moveSubject = (c: Curriculum, semesterId: string, id: string, d: -1 | 1) => mapSemester(c, semesterId, s => ({ ...s, subjects: moveIn(s.subjects, id, d) }));

// Which subjects would be removed if this course/semester/subject were deleted
export const subjectsInCourse = (course: Course) => course.semesters.flatMap(s => s.subjects.map(x => x.id));
export const subjectsInSemester = (s: Semester) => s.subjects.map(x => x.id);

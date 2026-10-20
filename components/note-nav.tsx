import Link from 'next/link';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { Note } from '@/lib/model';

export default function NoteNav({ notes, id, position }: { notes: Note[]; id: string; position: 'top' | 'bottom' }) {
  const i = notes.findIndex(n => n.id === id);
  const prev = i > 0 ? notes[i - 1] : undefined;
  const next = i >= 0 && i < notes.length - 1 ? notes[i + 1] : undefined;
  if (!prev && !next) return null;
  return (
    <nav className={'note-nav ' + position} aria-label="Lesson navigation">
      {prev ? (
        <Link href={'/notes/' + prev.id} className="note-nav-link prev" rel="prev" title={prev.title}>
          <ArrowLeft size={16} />
          <span><small>Previous</small><strong>{prev.title}</strong></span>
        </Link>
      ) : <span />}
      {next ? (
        <Link href={'/notes/' + next.id} className="note-nav-link next" rel="next" title={next.title}>
          <span><small>Next</small><strong>{next.title}</strong></span>
          <ArrowRight size={16} />
        </Link>
      ) : <span />}
    </nav>
  );
}
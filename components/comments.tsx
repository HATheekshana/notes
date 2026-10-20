'use client';
import Giscus from '@giscus/react';

export default function Comments({ noteId, dark }: { noteId: string; dark: boolean }) {
  return (
    <section className="comments" style={{ marginTop: 32 }}>
      <h2>Discussion</h2>
      <Giscus
        key={noteId}
        repo="HATheekshana/notes"
        repoId="R_kgDOUzQAvQ"
        category="Notes"
        categoryId="DIC_kwDOUzQAvc4DJH2Y"
        mapping="specific"
        term={'note-' + noteId}
        reactionsEnabled="1"
        inputPosition="top"
        theme={dark ? 'dark' : 'light'}
        lang="en"
        loading="lazy"
      />
    </section>
  );
}
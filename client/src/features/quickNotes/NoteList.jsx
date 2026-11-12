import { NoteCard } from './NoteCard.jsx';

function NoteGrid({ notes, ...cardProps }) {
  return (
    <div className="columns-1 gap-4 md:columns-2 2xl:columns-3">
      {notes.map((note) => (
        <div key={note.id} className="mb-4 break-inside-avoid">
          <NoteCard note={note} {...cardProps} />
        </div>
      ))}
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <h2 className="text-muted mb-3 text-[11px] font-semibold uppercase tracking-[0.14em]">
      {children}
    </h2>
  );
}

// Pinned notes first under their own heading, then the rest (newest first).
export function NoteList({ notes, workspaceId, onTagClick, hideProjectId }) {
  const pinned = notes.filter((note) => note.pinned);
  const others = notes.filter((note) => !note.pinned);
  const cardProps = { workspaceId, onTagClick, hideProjectId };

  if (pinned.length === 0) return <NoteGrid notes={others} {...cardProps} />;
  return (
    <div className="space-y-6">
      <section>
        <SectionLabel>Pinned</SectionLabel>
        <NoteGrid notes={pinned} {...cardProps} />
      </section>
      {others.length > 0 && (
        <section>
          <SectionLabel>Others</SectionLabel>
          <NoteGrid notes={others} {...cardProps} />
        </section>
      )}
    </div>
  );
}

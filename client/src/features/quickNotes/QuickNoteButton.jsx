import { NotebookPen } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useMatch } from 'react-router-dom';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { NoteComposer } from './NoteComposer.jsx';

function isTyping(target) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

// The quick-capture dialog. On a project page the note starts linked to that project.
export function QuickNoteDialog({ workspaceId, open, onClose }) {
  const [savedCount, setSavedCount] = useState(0);
  const projectMatch = useMatch('/w/:workspaceId/projects/:projectId/*');
  const projectId = projectMatch?.params.projectId;

  function close() {
    setSavedCount(0);
    onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Quick note"
      description={
        savedCount > 0
          ? `Saved ${savedCount === 1 ? 'it' : `${savedCount} notes`}. Write another, or close when you're done.`
          : 'Catch the thought now. Add to-dos, link a project or #tags if you like.'
      }
      wide
    >
      <NoteComposer
        key={projectId ?? 'none'}
        workspaceId={workspaceId}
        defaultProjectIds={projectId ? [projectId] : []}
        autoFocus
        onDone={() => setSavedCount((count) => count + 1)}
        onCancel={close}
      />
      <p className="text-muted mt-3 text-xs">
        <Link
          to={`/w/${workspaceId}/notes`}
          onClick={close}
          className="text-ink underline underline-offset-4"
        >
          See all quick notes
        </Link>
      </p>
    </Dialog>
  );
}

// Top-bar button (and Alt + N) that captures a thought from any page.
export function QuickNoteButton({ workspaceId }) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(event) {
      if (event.altKey && !event.ctrlKey && !event.metaKey && event.code === 'KeyN') {
        if (isTyping(event.target) && !event.target.closest?.('dialog')) return;
        event.preventDefault();
        setIsOpen(true);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label="Quick note"
        title="Quick note (Alt + N)"
        className="bg-subtle hover:bg-line/60 grid h-10 w-10 shrink-0 place-items-center rounded-full"
      >
        <NotebookPen className="h-4 w-4" aria-hidden="true" />
      </button>
      <QuickNoteDialog workspaceId={workspaceId} open={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}

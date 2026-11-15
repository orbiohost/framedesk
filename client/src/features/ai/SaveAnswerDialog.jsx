import { Lock, Users } from 'lucide-react';
import { useState } from 'react';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Dialog, DialogActions } from '../../components/ui/Dialog.jsx';
import { SegmentedControl } from '../../components/ui/SegmentedControl.jsx';
import { TextField } from '../../components/ui/TextField.jsx';
import { ProjectPicker } from '../quickNotes/ProjectPicker.jsx';
import { useSaveAnswerAsNote } from './hooks.js';

const VISIBILITY_OPTIONS = [
  { value: 'private', label: 'Only me', icon: Lock },
  { value: 'workspace', label: 'Team', icon: Users },
];

function shortTitle(text) {
  const clean = (text ?? '').replace(/\s+/g, ' ').trim();
  return clean.length > 120 ? `${clean.slice(0, 117).trimEnd()}…` : clean;
}

// "Save to notes" for one answer: a title (the question, by default), the
// projects it belongs to (the one the question was about, by default) and who
// can read it. The note links back to this chat.
export function SaveAnswerDialog({ workspaceId, threadId, message, question, onClose, onSaved }) {
  const [title, setTitle] = useState(() => shortTitle(question?.text));
  const [projectIds, setProjectIds] = useState(() =>
    question?.project ? [question.project.id] : [],
  );
  const [visibility, setVisibility] = useState('private');
  const save = useSaveAnswerAsNote(workspaceId);

  function submit(event) {
    event.preventDefault();
    save.mutate(
      { threadId, messageId: message.id, title: title.trim() || undefined, projectIds, visibility },
      { onSuccess: (note) => onSaved?.(note) },
    );
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Save answer to notes"
      description="Find it later in Quick notes (and the project’s Notes tab), or add it to a new question with #."
    >
      <form onSubmit={submit} className="space-y-4">
        {save.error && <Alert tone="error">{save.error.message}</Alert>}
        <TextField
          id="ai-note-title"
          label="Title"
          value={title}
          maxLength={160}
          onChange={(event) => setTitle(event.target.value)}
          autoFocus
        />
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Projects</p>
          <ProjectPicker workspaceId={workspaceId} value={projectIds} onChange={setProjectIds} />
        </div>
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Who can read it</p>
          <SegmentedControl
            label="Who can read it"
            options={VISIBILITY_OPTIONS}
            value={visibility}
            onChange={setVisibility}
          />
        </div>
        <DialogActions>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={save.isPending}>
            Save note
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

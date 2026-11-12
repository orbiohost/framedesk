import { useState } from 'react';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Dialog, DialogActions } from '../../components/ui/Dialog.jsx';
import { TextField } from '../../components/ui/TextField.jsx';
import { useSaveFolder } from './hooks.js';

// mode "create": new folder inside `parent` (or at the top level); mode "rename": rename `folder`.
function FolderForm({ workspaceId, projectId, mode, folder, parent, onDone }) {
  const save = useSaveFolder(workspaceId);
  const [name, setName] = useState(mode === 'rename' ? folder.name : '');

  function submit(event) {
    event.preventDefault();
    const input =
      mode === 'rename'
        ? { id: folder.id, name }
        : { projectId, parentId: parent?.id ?? null, name };
    save.mutate(input, { onSuccess: onDone });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {save.error && <Alert tone="error">{save.error.message}</Alert>}
      <TextField
        id="folder-name"
        label="Folder name"
        placeholder="e.g. Day 2 - Haldi"
        value={name}
        onChange={(event) => setName(event.target.value)}
        autoFocus
      />
      <DialogActions>
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={save.isPending} disabled={!name.trim()}>
          {mode === 'rename' ? 'Rename' : 'Create folder'}
        </Button>
      </DialogActions>
    </form>
  );
}

export function FolderDialog({ workspaceId, projectId, state, onClose }) {
  const title =
    state?.mode === 'rename'
      ? 'Rename folder'
      : state?.parent
        ? `New folder in ${state.parent.name}`
        : 'New folder';
  return (
    <Dialog open={Boolean(state)} onClose={onClose} title={title}>
      {state && (
        <FolderForm workspaceId={workspaceId} projectId={projectId} {...state} onDone={onClose} />
      )}
    </Dialog>
  );
}

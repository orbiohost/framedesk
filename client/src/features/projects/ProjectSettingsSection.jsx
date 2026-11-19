import { ArrowDown, ArrowUp, Folder, NotebookPen, Plus, RotateCcw, X } from 'lucide-react';
import { useState } from 'react';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Skeleton } from '../../components/ui/Skeleton.jsx';
import { SettingsRow, SettingsSection } from '../account/SettingsSection.jsx';
import { canManage } from '../workspaces/roles.js';
import { useProjectSettings, useSaveProjectSettings } from './projectSettingsHooks.js';
import { TaskTemplateEditor } from './TaskTemplateEditor.jsx';

function sameList(a, b) {
  return a.length === b.length && a.every((name, index) => name === b[index]);
}

const ICON_BUTTON =
  'text-muted hover:bg-subtle hover:text-ink grid h-8 w-8 place-items-center rounded-lg transition-colors disabled:pointer-events-none disabled:opacity-30';

// The list being edited. `saved` is what the server holds now; the parent
// remounts this (key) after a save, so the draft starts from the saved list.
function FolderListEditor({ workspaceId, settings, editable }) {
  const [draft, setDraft] = useState(settings.folders);
  const [newName, setNewName] = useState('');
  const [localError, setLocalError] = useState(null);
  const save = useSaveProjectSettings(workspaceId);
  const dirty = !sameList(draft, settings.folders);
  const full = draft.length >= settings.maxFolders;
  const matchesBuiltIn = sameList(draft, settings.builtIn);

  function add(event) {
    event.preventDefault();
    const name = newName.trim();
    if (!name) return;
    const taken = [...draft, ...settings.alwaysIncluded].some(
      (existing) => existing.toLowerCase() === name.toLowerCase(),
    );
    if (taken) return setLocalError(`"${name}" is already in the list`);
    if (/[/\\]/.test(name)) return setLocalError('Folder names cannot contain / or \\');
    setDraft([...draft, name]);
    setNewName('');
    setLocalError(null);
  }

  function move(index, by) {
    const next = [...draft];
    [next[index], next[index + by]] = [next[index + by], next[index]];
    setDraft(next);
  }

  return (
    <div className="space-y-3">
      <ul className="border-line/70 divide-line/60 divide-y overflow-hidden rounded-2xl border">
        {settings.alwaysIncluded.map((name) => (
          <li key={name} className="bg-accent/10 flex items-center gap-3 px-3.5 py-2.5">
            <NotebookPen className="text-accent h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{name}</span>
              <span className="text-muted block text-xs">
                Always added — the AI turns its notes into the project brief
              </span>
            </span>
          </li>
        ))}
        {draft.map((name, index) => (
          <li key={name} className="flex items-center gap-2 px-3.5 py-1.5">
            <Folder className="text-muted h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-sm">{name}</span>
            {editable && (
              <span className="flex items-center">
                <button
                  type="button"
                  className={ICON_BUTTON}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                  aria-label={`Move ${name} up`}
                >
                  <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={ICON_BUTTON}
                  disabled={index === draft.length - 1}
                  onClick={() => move(index, 1)}
                  aria-label={`Move ${name} down`}
                >
                  <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={`${ICON_BUTTON} hover:text-danger`}
                  onClick={() => setDraft(draft.filter((item) => item !== name))}
                  aria-label={`Remove ${name}`}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </span>
            )}
          </li>
        ))}
        {draft.length === 0 && (
          <li className="text-muted px-3.5 py-3 text-sm">
            No other folders — new projects start with {settings.alwaysIncluded.join(', ')} only.
          </li>
        )}
      </ul>

      {editable && (
        <>
          <form onSubmit={add} className="flex gap-2">
            <input
              value={newName}
              onChange={(event) => {
                setNewName(event.target.value);
                setLocalError(null);
              }}
              maxLength={120}
              disabled={full}
              placeholder={
                full ? `Up to ${settings.maxFolders} folders` : 'Add a folder, e.g. Raw Data'
              }
              aria-label="New folder name"
              className="border-line bg-surface focus:ring-accent/40 h-9 min-w-0 flex-1 rounded-full border px-4 text-sm outline-none focus:ring-2"
            />
            <Button type="submit" variant="secondary" size="sm" className="h-9" disabled={full}>
              <Plus className="h-4 w-4" aria-hidden="true" /> Add
            </Button>
          </form>
          {(localError || save.error) && (
            <Alert tone="error">{localError ?? save.error.message}</Alert>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              disabled={!dirty}
              loading={save.isPending}
              onClick={() => save.mutate(draft)}
            >
              Save folders
            </Button>
            {dirty && (
              <Button size="sm" variant="ghost" onClick={() => setDraft(settings.folders)}>
                Cancel
              </Button>
            )}
            {!matchesBuiltIn && (
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto"
                onClick={() => setDraft(settings.builtIn)}
                title={settings.builtIn.join(', ')}
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Use the standard set
              </Button>
            )}
            {save.isSuccess && !dirty && <span className="text-success text-xs">Saved</span>}
          </div>
        </>
      )}
    </div>
  );
}

// Profile → Projects: which folders every new project in this workspace gets.
export function ProjectSettingsSection({ workspace }) {
  const { data: settings, isPending, isError, error } = useProjectSettings(workspace.id);
  const editable = canManage(workspace);
  return (
    <SettingsSection
      title="Project settings"
      description={`For new projects in ${workspace.name}. Projects that already exist keep their folders.`}
    >
      <SettingsRow
        label="Default folders"
        description={
          editable
            ? 'Every new project is created with these folders, in this order. Add, remove or reorder them.'
            : 'Every new project is created with these folders. Owners, admins and managers can change them.'
        }
      >
        {isPending && <Skeleton className="h-48 w-full rounded-2xl" />}
        {isError && <Alert tone="error">{error.message}</Alert>}
        {settings && (
          <FolderListEditor
            key={settings.folders.join('\n')}
            workspaceId={workspace.id}
            settings={settings}
            editable={editable}
          />
        )}
      </SettingsRow>
      <SettingsRow
        label="Task lists"
        description={
          editable
            ? 'The tasks a new project starts with, by type. Each one is dated back from the project due date (leave the days empty for no date).'
            : 'The tasks a new project starts with, by type. Owners, admins and managers can change them.'
        }
      >
        <TaskTemplateEditor workspaceId={workspace.id} editable={editable} />
      </SettingsRow>
    </SettingsSection>
  );
}

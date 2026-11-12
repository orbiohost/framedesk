import { Lock, Users } from 'lucide-react';
import { useState } from 'react';
import { Alert } from '../../components/ui/Alert.jsx';
import { Avatar } from '../../components/ui/Avatar.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Dialog, DialogActions } from '../../components/ui/Dialog.jsx';
import { Skeleton } from '../../components/ui/Skeleton.jsx';
import { cn } from '../../lib/cn.js';
import { useMembers } from '../members/hooks.js';
import { useSetFolderAccess } from './hooks.js';

const ROLE_LABELS = {
  owner: 'Owner',
  admin: 'Admin',
  manager: 'Manager',
  editor: 'Editor',
  viewer: 'Viewer',
};
// Owners and admins can open every folder, whatever its list says.
const ALWAYS_IN = ['owner', 'admin'];

const MODES = [
  {
    value: 'team',
    icon: Users,
    title: 'Everyone on the team',
    body: 'Anyone who can see this workspace’s files can open this folder.',
  },
  {
    value: 'restricted',
    icon: Lock,
    title: 'Only specific people',
    body: 'Hidden from everyone else, along with its subfolders and files.',
  },
];

function ModeCard({ mode, checked, onChange }) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-2xl border p-3.5 transition-colors',
        checked ? 'border-accent/60 bg-accent/10' : 'border-line hover:bg-subtle/60',
      )}
    >
      <input
        type="radio"
        name="folder-access"
        value={mode.value}
        checked={checked}
        onChange={() => onChange(mode.value)}
        className="accent-accent mt-1 h-4 w-4 shrink-0"
      />
      <span className="min-w-0">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <mode.icon className="h-4 w-4" aria-hidden="true" />
          {mode.title}
        </span>
        <span className="text-muted mt-0.5 block text-sm">{mode.body}</span>
      </span>
    </label>
  );
}

function PersonRow({ member, checked, locked, onToggle }) {
  return (
    <li>
      <label
        className={cn(
          'flex min-h-12 items-center gap-3 rounded-xl px-2 py-1.5',
          locked ? 'opacity-80' : 'hover:bg-subtle/60 cursor-pointer',
        )}
      >
        <input
          type="checkbox"
          checked={checked}
          disabled={locked}
          onChange={() => onToggle(member.userId)}
          className="accent-accent h-4 w-4 shrink-0"
        />
        <Avatar name={member.name} src={member.avatarUrl} size="sm" className="ring-0" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{member.name}</span>
          <span className="text-muted block truncate text-xs">{member.email}</span>
        </span>
        <span className="text-muted shrink-0 text-xs">
          {locked ? `${ROLE_LABELS[member.role]} · always` : ROLE_LABELS[member.role]}
        </span>
      </label>
    </li>
  );
}

function AccessForm({ workspaceId, folder, onDone }) {
  const members = useMembers(workspaceId);
  const save = useSetFolderAccess(workspaceId);
  const [access, setAccess] = useState(folder.access);
  const [userIds, setUserIds] = useState(() => new Set(folder.allowedUserIds));
  // Clients are guests of the workspace, not people who browse its files.
  const team = (members.data ?? []).filter((member) => member.role in ROLE_LABELS);
  const inherited = folder.locked && folder.access !== 'restricted';

  function toggle(userId) {
    setUserIds((current) => {
      const next = new Set(current);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  function submit(event) {
    event.preventDefault();
    // Owners and admins are let in by the server; only list the others.
    const chosen = team
      .filter((member) => !ALWAYS_IN.includes(member.role) && userIds.has(member.userId))
      .map((member) => member.userId);
    save.mutate(
      { id: folder.id, access, userIds: access === 'restricted' ? chosen : [] },
      { onSuccess: onDone },
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {save.error && <Alert tone="error">{save.error.message}</Alert>}
      {inherited && (
        <Alert tone="info">
          This folder sits inside a restricted folder, so it is already limited to the people
          allowed there. A list set here narrows it further.
        </Alert>
      )}
      <fieldset className="space-y-2">
        <legend className="sr-only">Who can open this folder</legend>
        {MODES.map((mode) => (
          <ModeCard
            key={mode.value}
            mode={mode}
            checked={access === mode.value}
            onChange={setAccess}
          />
        ))}
      </fieldset>

      {access === 'restricted' && (
        <div>
          <p className="text-muted mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em]">
            People with access
          </p>
          {members.isPending && <Skeleton className="h-24 w-full" />}
          {members.isError && <Alert tone="error">{members.error.message}</Alert>}
          <ul className="border-line/80 max-h-64 overflow-y-auto rounded-2xl border p-1.5">
            {team.map((member) => {
              const locked = ALWAYS_IN.includes(member.role);
              return (
                <PersonRow
                  key={member.userId}
                  member={member}
                  locked={locked}
                  checked={locked || userIds.has(member.userId)}
                  onToggle={toggle}
                />
              );
            })}
          </ul>
          <p className="text-muted mt-2 text-xs">
            You stay on the list yourself, so you can’t lock yourself out.
          </p>
        </div>
      )}

      <DialogActions>
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={save.isPending}>
          Save access
        </Button>
      </DialogActions>
    </form>
  );
}

// Who may open a folder. `folder` null keeps the dialog closed.
export function FolderAccessDialog({ workspaceId, folder, onClose }) {
  return (
    <Dialog
      open={Boolean(folder)}
      onClose={onClose}
      title={folder ? `Who can open "${folder.name}"` : 'Folder access'}
    >
      {folder && (
        <AccessForm key={folder.id} workspaceId={workspaceId} folder={folder} onDone={onClose} />
      )}
    </Dialog>
  );
}

import { Check } from 'lucide-react';
import { chipClassName } from '../../components/ui/ChoiceChips.jsx';
import { cn } from '../../lib/cn.js';

// Which workspaces an AI connection may read: all of them (including ones
// joined later), or a hand-picked few.
// value: { allWorkspaces: boolean, workspaceIds: string[] }
export function WorkspaceAccessPicker({ workspaces, value, onChange }) {
  const { allWorkspaces, workspaceIds } = value;

  function toggle(id) {
    const next = workspaceIds.includes(id)
      ? workspaceIds.filter((item) => item !== id)
      : [...workspaceIds, id];
    onChange({ allWorkspaces: false, workspaceIds: next });
  }

  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label="Workspace access" className="flex flex-wrap gap-1.5">
        <button
          type="button"
          role="radio"
          aria-checked={allWorkspaces}
          onClick={() => onChange({ allWorkspaces: true, workspaceIds: [] })}
          className={chipClassName(allWorkspaces)}
        >
          All my workspaces
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={!allWorkspaces}
          onClick={() =>
            onChange({
              allWorkspaces: false,
              workspaceIds: workspaceIds.length > 0 ? workspaceIds : workspaces.map((w) => w.id),
            })
          }
          className={chipClassName(!allWorkspaces)}
        >
          Only some
        </button>
      </div>

      {!allWorkspaces && (
        <ul className="border-line/70 divide-line/70 divide-y rounded-2xl border">
          {workspaces.map((workspace) => {
            const checked = workspaceIds.includes(workspace.id);
            return (
              <li key={workspace.id}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={checked}
                  onClick={() => toggle(workspace.id)}
                  className="hover:bg-subtle/60 flex w-full items-center gap-3 px-3.5 py-2.5 text-left first:rounded-t-2xl last:rounded-b-2xl"
                >
                  <span
                    className={cn(
                      'grid h-5 w-5 shrink-0 place-items-center rounded-md border',
                      checked ? 'border-accent bg-accent text-accent-ink' : 'border-line',
                    )}
                  >
                    {checked && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {workspace.name}
                  </span>
                  <span className="text-muted text-xs capitalize">{workspace.role}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

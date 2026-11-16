import { Check, ChevronsUpDown, Plus } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../../lib/cn.js';
import { useDismiss } from '../../lib/useDismiss.js';
import { useWorkspaces } from './hooks.js';

export function WorkspaceSwitcher({ current, compact = false }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);
  const { data: workspaces = [] } = useWorkspaces();
  const close = useCallback(() => setIsOpen(false), []);
  useDismiss(containerRef, isOpen, close);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="true"
        title={compact ? current.name : undefined}
        className={cn(
          'border-line/70 bg-surface/90 shadow-soft hover:bg-surface hover:border-line flex w-full items-center border text-left transition-all',
          compact ? 'justify-center rounded-full p-1.5' : 'gap-2.5 rounded-2xl p-2',
        )}
      >
        <span className="pill-active font-display grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm">
          {current.name.charAt(0).toUpperCase()}
        </span>
        {!compact && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold">{current.name}</span>
              <span className="text-muted block text-[11px] capitalize">{current.role}</span>
            </span>
            <ChevronsUpDown className="text-muted h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          </>
        )}
      </button>

      {isOpen && (
        <div
          className={cn(
            'border-line/70 bg-surface/95 shadow-lift animate-[fade-in_120ms_ease-out] absolute top-full z-20 mt-2 rounded-2xl border p-1.5 backdrop-blur-md',
            compact ? 'left-0 w-60' : 'inset-x-0',
          )}
        >
          <ul>
            {workspaces.map((workspace) => (
              <li key={workspace.id}>
                <Link
                  to={`/w/${workspace.id}`}
                  onClick={close}
                  className={cn(
                    'hover:bg-subtle flex items-center justify-between rounded-xl px-2.5 py-2 text-sm transition-colors',
                    workspace.id === current.id && 'font-medium',
                  )}
                >
                  <span className="truncate">{workspace.name}</span>
                  {workspace.id === current.id && (
                    <Check className="text-accent h-4 w-4 shrink-0" aria-hidden="true" />
                  )}
                </Link>
              </li>
            ))}
          </ul>
          <div className="border-line mt-1 border-t pt-1">
            <Link
              to="/app/new-workspace"
              onClick={close}
              className="text-muted hover:bg-subtle hover:text-ink flex items-center gap-2 rounded-xl px-2.5 py-2 text-sm transition-colors"
            >
              <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
              New workspace
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

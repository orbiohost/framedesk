import { Check, ChevronDown, Plus, Settings2, Users } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../../lib/cn.js';
import { useDismiss } from '../../lib/useDismiss.js';
import { AgentBadge } from './AgentBadge.jsx';

// The chat header's title on a new chat: which assistant to talk to.
// agents: from useAiAgents; value: agent id or null (FrameDesk AI).
export function AgentPicker({ workspaceId, agents = [], value, onChange, subtitle, onNavigate }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);
  const current = agents.find((agent) => agent.id === value) ?? null;
  const studio = `/w/${workspaceId}/ai/studio`;

  function choose(id) {
    onChange(id);
    close();
  }

  const row =
    'flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm transition-colors hover:bg-subtle';

  return (
    <div ref={ref} className="relative min-w-0 flex-1">
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="hover:bg-subtle/70 -ml-1 flex max-w-full items-center gap-2 rounded-xl py-1 pl-1 pr-2 text-left transition-colors"
      >
        <AgentBadge agent={current} />
        <span className="min-w-0">
          <span className="flex items-center gap-1 text-sm font-semibold leading-tight">
            <span className="truncate">{current?.name ?? 'FrameDesk AI'}</span>
            <ChevronDown
              className={cn(
                'text-muted h-3.5 w-3.5 shrink-0 transition-transform',
                open && 'rotate-180',
              )}
              aria-hidden="true"
            />
          </span>
          <span className="text-muted block truncate text-[11px] leading-tight">
            {subtitle ?? current?.description ?? 'Knows your videos, images and docs'}
          </span>
        </span>
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Choose an assistant"
          className="border-line/70 bg-surface shadow-lift absolute left-0 top-full z-40 mt-1.5 w-[min(19rem,calc(100vw-2rem))] animate-[fade-in_120ms_ease-out] rounded-2xl border p-1.5"
        >
          <p className="text-muted px-2.5 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-[0.12em]">
            Talk to
          </p>
          <div className="scrollbar-thin max-h-72 overflow-y-auto">
            <button
              type="button"
              role="option"
              aria-selected={!current}
              onClick={() => choose(null)}
              className={row}
            >
              <AgentBadge agent={null} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">FrameDesk AI</span>
                <span className="text-muted block truncate text-xs">The default assistant</span>
              </span>
              {!current && <Check className="text-accent h-4 w-4 shrink-0" aria-hidden="true" />}
            </button>
            {agents.map((agent) => (
              <button
                key={agent.id}
                type="button"
                role="option"
                aria-selected={agent.id === value}
                onClick={() => choose(agent.id)}
                className={row}
              >
                <AgentBadge agent={agent} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate font-medium">{agent.name}</span>
                    {agent.visibility === 'workspace' && (
                      <Users
                        className="text-muted h-3 w-3 shrink-0"
                        aria-label="Shared with the team"
                      />
                    )}
                  </span>
                  {agent.description && (
                    <span className="text-muted block truncate text-xs">{agent.description}</span>
                  )}
                </span>
                {agent.id === value && (
                  <Check className="text-accent h-4 w-4 shrink-0" aria-hidden="true" />
                )}
              </button>
            ))}
          </div>
          <div className="border-line mt-1 space-y-0.5 border-t pt-1">
            <Link
              to={`${studio}?new=agent`}
              onClick={() => {
                close();
                onNavigate?.();
              }}
              className={cn(row, 'text-ink/85')}
            >
              <span className="bg-subtle grid h-6 w-6 shrink-0 place-items-center rounded-full">
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
              Create your own assistant
            </Link>
            <Link
              to={studio}
              onClick={() => {
                close();
                onNavigate?.();
              }}
              className={cn(row, 'text-muted')}
            >
              <span className="grid h-6 w-6 shrink-0 place-items-center">
                <Settings2 className="h-4 w-4" aria-hidden="true" />
              </span>
              Assistants, skills &amp; memory
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

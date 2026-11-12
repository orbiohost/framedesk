import { FolderKanban } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Skeleton } from '../../components/ui/Skeleton.jsx';
import { cn } from '../../lib/cn.js';
import { formatDueLabel, isOverdue } from '../../lib/dates.js';
import { useProjects } from '../projects/hooks.js';
import { ProjectStatusBadge } from '../projects/ProjectStatusBadge.jsx';
import { Widget } from './Widget.jsx';

const OPEN_PROJECT_STATUSES = ['draft', 'active', 'pending', 'review'];

function byDueDate(a, b) {
  return new Date(a.dueDate ?? 8.64e15) - new Date(b.dueDate ?? 8.64e15);
}

// Open projects with task progress, the nearest deadline first.
export function ProjectsWidget({ workspace, className }) {
  const { data: projects, isPending } = useProjects(workspace.id);
  const open = (projects ?? [])
    .filter((project) => OPEN_PROJECT_STATUSES.includes(project.status))
    .sort(byDueDate);
  const base = `/w/${workspace.id}`;

  return (
    <Widget
      icon={FolderKanban}
      title="Projects"
      className={className}
      actions={
        <Link
          to={`${base}/projects`}
          className="bg-subtle hover:bg-line/70 rounded-full px-3 py-1.5 text-xs font-medium"
        >
          All
        </Link>
      }
    >
      {isPending && <Skeleton className="h-32" />}
      {!isPending && open.length === 0 && (
        <p className="text-muted py-6 text-center text-sm">No open projects right now.</p>
      )}
      <ul className="space-y-2">
        {open.map((project) => {
          const { done, total } = project.tasks;
          const percent = total ? Math.round((done / total) * 100) : 0;
          const late = project.dueDate && isOverdue(project.dueDate);
          return (
            <li key={project.id}>
              <Link
                to={`${base}/projects/${project.id}`}
                className="hover:bg-subtle/70 block rounded-2xl px-2 py-2.5"
              >
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {project.title}
                  </span>
                  <ProjectStatusBadge status={project.status} />
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <div
                    className="bg-subtle h-1.5 flex-1 overflow-hidden rounded-full"
                    role="meter"
                    aria-label={`${project.title} progress`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={percent}
                  >
                    <div
                      className="bg-accent h-full rounded-full"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  <span className="text-muted w-10 shrink-0 text-right text-xs tabular-nums">
                    {percent}%
                  </span>
                </div>
                <p className={cn('mt-1 text-xs', late ? 'text-danger font-medium' : 'text-muted')}>
                  {project.client?.name ?? 'Internal'}
                  {project.dueDate &&
                    ` · ${late ? 'overdue' : 'due'} ${formatDueLabel(project.dueDate)}`}
                  {total > 0 && ` · ${done}/${total} tasks`}
                </p>
              </Link>
            </li>
          );
        })}
      </ul>
    </Widget>
  );
}

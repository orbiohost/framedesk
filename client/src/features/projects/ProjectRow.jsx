import { Link } from 'react-router-dom';
import { cn } from '../../lib/cn.js';
import { formatDueLabel, isOverdue } from '../../lib/dates.js';
import { isProjectOpen, projectTypeLabel } from './projectMeta.js';
import { ProjectStatusBadge } from './ProjectStatusBadge.jsx';
import { TaskProgress } from './TaskProgress.jsx';

function DueDate({ project }) {
  if (!project.dueDate) return <span className="text-muted">No due date</span>;
  const overdue = isProjectOpen(project) && isOverdue(project.dueDate);
  return (
    <span className={cn(overdue ? 'text-danger font-medium' : 'text-ink')}>
      {overdue ? 'Overdue · ' : 'Due '}
      {formatDueLabel(project.dueDate)}
    </span>
  );
}

export function ProjectRow({ project, workspaceId, hideClient = false }) {
  return (
    <li>
      <Link
        to={`/w/${workspaceId}/projects/${project.id}`}
        className="hover:bg-subtle/60 grid gap-2 px-4 py-3.5 transition-colors sm:grid-cols-[minmax(0,1fr)_9rem_8rem_9rem] sm:items-center sm:gap-4"
      >
        <div className="min-w-0">
          <p className="truncate font-medium">{project.title}</p>
          <p className="text-muted truncate text-sm">
            {hideClient ? projectTypeLabel(project.type) : (project.client?.name ?? 'Internal')}
            {!hideClient && ` · ${projectTypeLabel(project.type)}`}
          </p>
        </div>
        <div>
          <ProjectStatusBadge status={project.status} />
        </div>
        <div className="text-sm">
          <DueDate project={project} />
        </div>
        <TaskProgress done={project.tasks.done} total={project.tasks.total} />
      </Link>
    </li>
  );
}

export function ProjectRows({ projects, workspaceId, hideClient }) {
  return (
    <ul className="border-line/60 bg-surface shadow-soft divide-line/70 divide-y overflow-hidden rounded-3xl border">
      {projects.map((project) => (
        <ProjectRow
          key={project.id}
          project={project}
          workspaceId={workspaceId}
          hideClient={hideClient}
        />
      ))}
    </ul>
  );
}

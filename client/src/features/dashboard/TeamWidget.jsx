import { Users } from 'lucide-react';
import { Avatar } from '../../components/ui/Avatar.jsx';
import { Skeleton } from '../../components/ui/Skeleton.jsx';
import { useMembers } from '../members/hooks.js';
import { Widget } from './Widget.jsx';

// Who is on the workspace and how much each person has open.
export function TeamWidget({ workspace, tasks, className }) {
  const { data: members, isPending } = useMembers(workspace.id);
  const openByPerson = new Map();
  for (const task of tasks ?? []) {
    if (task.status === 'done' || !task.assignee) continue;
    openByPerson.set(task.assignee.id, (openByPerson.get(task.assignee.id) ?? 0) + 1);
  }

  return (
    <Widget
      icon={Users}
      title="Team"
      className={className}
      actions={
        members?.length > 0 && (
          <span className="bg-subtle rounded-full px-3 py-1.5 text-xs font-medium tabular-nums">
            {members.length}
          </span>
        )
      }
    >
      {isPending && <Skeleton className="h-32" />}
      <ul className="space-y-1">
        {members?.map((member) => {
          const open = openByPerson.get(member.userId) ?? 0;
          return (
            <li key={member.userId} className="flex items-center gap-3 rounded-2xl px-2 py-2">
              <Avatar name={member.name} src={member.avatarUrl} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{member.name}</p>
                <p className="text-muted truncate text-xs capitalize">{member.role}</p>
              </div>
              <span
                className="bg-lavender text-ink shrink-0 rounded-full px-2.5 py-1 text-xs font-medium tabular-nums"
                title={`${open} open ${open === 1 ? 'task' : 'tasks'}`}
              >
                {open} open
              </span>
            </li>
          );
        })}
      </ul>
    </Widget>
  );
}

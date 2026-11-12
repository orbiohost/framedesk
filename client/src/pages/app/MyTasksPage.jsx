import { useOutletContext } from 'react-router-dom';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { useCurrentUser } from '../../features/auth/hooks.js';
import { TasksPanel } from '../../features/tasks/TasksPanel.jsx';

export function MyTasksPage() {
  const { workspace } = useOutletContext();
  const { data: user } = useCurrentUser();

  return (
    <>
      <PageHeader
        title="My tasks"
        description="Everything assigned to you, across every project."
      />
      <TasksPanel
        workspace={workspace}
        query={{ assignee: 'me' }}
        newTaskDefaults={{ assigneeId: user.id }}
        showProject
        emptyText="Tasks assigned to you in any project show up here. You can also add personal to-dos that don't belong to a project."
      />
    </>
  );
}

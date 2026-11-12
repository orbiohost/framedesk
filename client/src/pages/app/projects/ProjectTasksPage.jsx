import { useOutletContext } from 'react-router-dom';
import { TasksPanel } from '../../../features/tasks/TasksPanel.jsx';

export function ProjectTasksPage() {
  const { workspace, project } = useOutletContext();
  return (
    <TasksPanel
      workspace={workspace}
      query={{ projectId: project.id }}
      newTaskDefaults={{ projectId: project.id }}
      emptyText="Break the project into steps: pull selects, rough cut, client review, final export. Drag cards across the board as work moves along."
    />
  );
}

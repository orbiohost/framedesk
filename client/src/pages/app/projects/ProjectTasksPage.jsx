import { ListPlus } from 'lucide-react';
import { useOutletContext } from 'react-router-dom';
import { Alert } from '../../../components/ui/Alert.jsx';
import { Button } from '../../../components/ui/Button.jsx';
import { useApplyTaskTemplate } from '../../../features/projects/hooks.js';
import { projectTypeLabel } from '../../../features/projects/projectMeta.js';
import { useTaskTemplates } from '../../../features/projects/projectSettingsHooks.js';
import { TasksPanel } from '../../../features/tasks/TasksPanel.jsx';

// Adds the project type's task list (Project settings → Task lists) in one go.
function AddTaskListButton({ workspaceId, project, variant }) {
  const { data } = useTaskTemplates(workspaceId);
  const apply = useApplyTaskTemplate(workspaceId);
  const count = data?.templates[project.type]?.steps.length ?? 0;
  if (count === 0) return null;
  return (
    <>
      <Button
        variant={variant}
        loading={apply.isPending}
        onClick={() => apply.mutate(project.id)}
        title={`Adds ${count} task${count === 1 ? '' : 's'}${
          project.dueDate ? ', dated back from the due date' : ''
        }`}
      >
        <ListPlus className="h-4 w-4" aria-hidden="true" /> Add {projectTypeLabel(project.type)}{' '}
        task list
      </Button>
      {apply.error && <Alert tone="error">{apply.error.message}</Alert>}
    </>
  );
}

export function ProjectTasksPage() {
  const { workspace, project } = useOutletContext();
  return (
    <TasksPanel
      workspace={workspace}
      query={{ projectId: project.id }}
      newTaskDefaults={{ projectId: project.id }}
      extraAction={
        <AddTaskListButton workspaceId={workspace.id} project={project} variant="secondary" />
      }
      emptyText="Break the project into steps: pull selects, rough cut, client review, final export. Drag cards across the board as work moves along."
    />
  );
}

import { useOutletContext } from 'react-router-dom';
import { FileManager } from '../../../features/files/FileManager.jsx';
import { LinkedFilesSection } from '../../../features/files/LinkedFilesSection.jsx';
import { canEdit } from '../../../features/workspaces/roles.js';

export function ProjectFilesPage() {
  const { workspace, project } = useOutletContext();
  return (
    <>
      <FileManager workspace={workspace} project={project} />
      <LinkedFilesSection workspace={workspace} project={project} canEdit={canEdit(workspace)} />
    </>
  );
}

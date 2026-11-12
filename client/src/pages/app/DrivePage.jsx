import { useOutletContext } from 'react-router-dom';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { FileManager } from '../../features/files/FileManager.jsx';

// The workspace Drive: a file manager of its own for files that belong to no
// single project (contracts, brand kits, templates). Same uploads, trash and
// storage quota as project files.
export function DrivePage() {
  const { workspace } = useOutletContext();
  return (
    <>
      <PageHeader
        title="Drive"
        description="Workspace files that aren't tied to a project. Everyone on the team can find them here."
      />
      <FileManager workspace={workspace} fill />
    </>
  );
}

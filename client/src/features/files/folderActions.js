import { FolderOpen, FolderPlus, Pencil, Trash2, LockKeyhole } from 'lucide-react';

// The "⋯" menu for a folder, shared by the sidebar, the subfolder tiles and
// the open folder's toolbar. onAction(action, folder): "subfolder" | "rename" |
// "access" | "delete". canManage adds "Manage access" (who may open the folder).
// onOpen is left out where the folder is already open.
// Viewers get no menu: "Open" alone is what a click on the folder does anyway.
export function folderMenuItems({ folder, canEdit, canManage = false, onOpen, onAction }) {
  if (!canEdit) return [];
  const items = [];
  if (onOpen) {
    items.push({ key: 'open', label: 'Open', icon: FolderOpen, onSelect: () => onOpen(folder.id) });
  }
  items.push(
    {
      key: 'subfolder',
      label: 'New subfolder',
      icon: FolderPlus,
      onSelect: () => onAction('subfolder', folder),
    },
    { key: 'rename', label: 'Rename', icon: Pencil, onSelect: () => onAction('rename', folder) },
  );
  if (canManage) {
    items.push({
      key: 'access',
      label: 'Manage access',
      icon: LockKeyhole,
      onSelect: () => onAction('access', folder),
    });
  }
  items.push({
    key: 'delete',
    label: 'Delete folder',
    icon: Trash2,
    danger: true,
    divider: true,
    onSelect: () => onAction('delete', folder),
  });
  return items;
}

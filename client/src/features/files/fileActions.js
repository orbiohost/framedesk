import {
  Captions,
  Download,
  Eye,
  FolderInput,
  Link2,
  Pencil,
  RotateCcw,
  Share2,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { openAi } from '../ai/aiBridge.js';

// The actions offered for one file, shared by the list's row buttons and the
// grid's card menu. `title` is the full label for icon-only buttons.
// canTranscribe: the server has speech-to-text (adds Transcribe to video/audio).
// linked: the file is shown under a project it is only linked to, so it can be
//   opened and its links changed, but not renamed, moved or trashed from there.
export function fileActionItems({ file, inTrash, canEdit, canTranscribe = false, linked = false }) {
  if (inTrash) {
    if (!canEdit) return [];
    return [
      { action: 'restore', label: 'Restore', title: `Restore ${file.name}`, icon: RotateCcw },
      {
        action: 'delete',
        label: 'Delete forever',
        title: `Delete ${file.name} forever`,
        icon: X,
        danger: true,
      },
    ];
  }
  const items = [];
  if (file.previewable) {
    items.push({ action: 'open', label: 'Preview', title: `Preview ${file.name}`, icon: Eye });
  }
  const isMedia = file.category === 'video' || file.category === 'audio';
  if (canTranscribe && isMedia && file.previewable) {
    const label = canEdit ? 'Transcribe' : 'View transcript';
    items.push({ action: 'transcribe', label, title: `${label}: ${file.name}`, icon: Captions });
  }
  items.push({
    action: 'download',
    label: 'Download',
    title: `Download ${file.name}`,
    icon: Download,
  });
  if (canEdit) {
    items.push({
      action: 'link',
      label: 'Link to projects',
      title: `Link ${file.name} to projects`,
      icon: Link2,
    });
  }
  // Under a project it is only linked to, a file is shared from where it lives.
  if (canEdit && !linked) {
    items.push({
      action: 'share',
      label: 'Share link',
      title: `Share a link to ${file.name}`,
      icon: Share2,
    });
  }
  if (canEdit && !linked) {
    items.push(
      {
        action: 'rename',
        label: 'Rename, tags & note',
        title: `Edit the details of ${file.name}`,
        icon: Pencil,
      },
      { action: 'move', label: 'Move', title: `Move ${file.name}`, icon: FolderInput },
      {
        action: 'trash',
        label: 'Move to Trash',
        title: `Move ${file.name} to Trash`,
        icon: Trash2,
        danger: true,
      },
    );
  }
  return items;
}

// The same actions shaped for ActionMenu, with a line above the destructive ones.
// askAi: the AI assistant is on, so "Ask AI about this file" follows the first item.
export function fileMenuItems({
  file,
  inTrash,
  canEdit,
  canTranscribe,
  linked,
  onAction,
  askAi = false,
}) {
  const items = fileActionItems({ file, inTrash, canEdit, canTranscribe, linked }).map(
    (item, index, all) => ({
      key: item.action,
      label: item.label,
      icon: item.icon,
      danger: item.danger,
      divider: item.danger && index > 0 && !all[index - 1].danger,
      onSelect: () => onAction(item.action, file),
    }),
  );
  if (askAi && !inTrash && items.length > 0) {
    items.splice(1, 0, {
      key: 'ask-ai',
      label: 'Ask AI about this file',
      icon: Sparkles,
      onSelect: () => openAi({ file: { id: file.id, name: file.name, category: file.category } }),
    });
  }
  return items;
}

// Keyboard shortcuts on a focused file: Enter opens, F2 renames, Delete trashes.
export function handleFileShortcut(event, { file, inTrash, canEdit, onAction }) {
  if (inTrash) return;
  if (event.key === 'Enter') {
    event.preventDefault();
    onAction('open', file);
  }
  if (!canEdit) return;
  if (event.key === 'F2') {
    event.preventDefault();
    onAction('rename', file);
  }
  if (event.key === 'Delete') {
    event.preventDefault();
    onAction('trash', file);
  }
}

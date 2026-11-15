import { Captions, ChevronLeft, ChevronRight, Download, Loader2, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Dialog, DialogActions } from '../../components/ui/Dialog.jsx';
import { SelectField } from '../../components/ui/SelectField.jsx';
import { TextAreaField } from '../../components/ui/TextAreaField.jsx';
import { TextField } from '../../components/ui/TextField.jsx';
import { cn } from '../../lib/cn.js';
import { formatDate } from '../../lib/dates.js';
import { formatBytes } from '../../lib/format.js';
import { PlayableMedia } from '../media/PlayableMedia.jsx';
import { ProjectPicker } from '../quickNotes/ProjectPicker.jsx';
import { isTranscribable, useTranscriptionEnabled } from '../transcripts/hooks.js';
import { TranscriptPanel } from '../transcripts/TranscriptPanel.jsx';
import { FILE_STATUS_OPTIONS, folderTree } from './fileMeta.js';
import { fetchFileUrl, peekFileUrl, useUpdateFile } from './hooks.js';
import { fileTint } from './FileThumbnail.jsx';
import { FileTypeIcon } from './FileTypeIcon.jsx';
import { FileContentView } from './viewers/FileContentView.jsx';
import { isPlayable } from './viewers/formats.js';

function nameWithoutExtension(file) {
  const suffix = `.${file.extension}`;
  return file.name.endsWith(suffix) ? file.name.slice(0, -suffix.length) : file.name;
}

// "v2, Client Review ,v2" -> ["v2", "client review"]: trimmed, lower-cased, no repeats.
export function parseTags(text) {
  const tags = text
    .split(',')
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set(tags)];
}

const MAX_TAGS = 20;
const MAX_TAG_LENGTH = 40;
const MAX_NOTE_LENGTH = 2000;
export const MAX_LINKED_PROJECTS = 10;

export function tagProblem(tags) {
  if (tags.length > MAX_TAGS) return `Use at most ${MAX_TAGS} tags`;
  if (tags.some((tag) => tag.length > MAX_TAG_LENGTH))
    return `Keep each tag under ${MAX_TAG_LENGTH} characters`;
  return undefined;
}

// The "Linked projects" field: chips plus a searchable picker. The project the
// file already lives in is never offered.
export function LinkedProjectsField({ workspaceId, ownProjectId, value, onChange, hint }) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">Linked projects</p>
      <ProjectPicker
        workspaceId={workspaceId}
        value={value}
        onChange={onChange}
        max={MAX_LINKED_PROJECTS}
        exclude={ownProjectId ? [ownProjectId] : []}
      />
      <p className="text-muted text-sm">
        {hint ?? "The file shows up in each project's Files tab, and stays where it is."}
      </p>
    </div>
  );
}

function FileDetailsForm({ workspaceId, file, onDone }) {
  const update = useUpdateFile(workspaceId);
  const [name, setName] = useState(nameWithoutExtension(file));
  const [status, setStatus] = useState(file.status);
  const [tagText, setTagText] = useState(file.tags.join(', '));
  const [note, setNote] = useState(file.note ?? '');
  const [linkedProjectIds, setLinkedProjectIds] = useState(file.linkedProjectIds ?? []);
  const tags = parseTags(tagText);
  const tagError = tagProblem(tags);

  function submit(event) {
    event.preventDefault();
    if (tagError) return;
    update.mutate(
      { id: file.id, name, status, tags, linkedProjectIds, note },
      { onSuccess: onDone },
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {update.error && <Alert tone="error">{update.error.message}</Alert>}
      <TextField
        id="file-name"
        label="Name"
        hint={`The .${file.extension} extension stays as it is. Only the name people see changes.`}
        value={name}
        onChange={(event) => setName(event.target.value)}
        autoFocus
      />
      <SelectField
        id="file-status"
        label="Status"
        options={FILE_STATUS_OPTIONS}
        value={status}
        onChange={(event) => setStatus(event.target.value)}
      />
      <TextField
        id="file-tags"
        label="Tags"
        placeholder="e.g. v2, client review, 4k"
        hint="Separate tags with commas. Search in a folder finds them."
        error={tagError}
        value={tagText}
        onChange={(event) => setTagText(event.target.value)}
      />
      <LinkedProjectsField
        workspaceId={workspaceId}
        ownProjectId={file.projectId}
        value={linkedProjectIds}
        onChange={setLinkedProjectIds}
      />
      <TextAreaField
        id="file-note"
        dictationWorkspaceId={workspaceId}
        label="Note"
        rows={3}
        maxLength={MAX_NOTE_LENGTH}
        placeholder="What this file is, what to fix, where it came from..."
        hint="Everyone who can open this folder sees the note."
        value={note}
        onChange={(event) => setNote(event.target.value)}
      />
      <DialogActions>
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={update.isPending} disabled={!name.trim()}>
          Save
        </Button>
      </DialogActions>
    </form>
  );
}

export function FileDetailsDialog({ workspaceId, file, onClose }) {
  return (
    <Dialog open={Boolean(file)} onClose={onClose} title="File details">
      {file && <FileDetailsForm workspaceId={workspaceId} file={file} onDone={onClose} />}
    </Dialog>
  );
}

function LinkProjectsForm({ workspaceId, file, onDone }) {
  const update = useUpdateFile(workspaceId);
  const [linkedProjectIds, setLinkedProjectIds] = useState(file.linkedProjectIds ?? []);
  const unchanged =
    linkedProjectIds.length === (file.linkedProjectIds ?? []).length &&
    linkedProjectIds.every((id) => file.linkedProjectIds.includes(id));

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        update.mutate({ id: file.id, linkedProjectIds }, { onSuccess: onDone });
      }}
      className="space-y-4"
    >
      {update.error && <Alert tone="error">{update.error.message}</Alert>}
      <LinkedProjectsField
        workspaceId={workspaceId}
        ownProjectId={file.projectId}
        value={linkedProjectIds}
        onChange={setLinkedProjectIds}
      />
      <DialogActions>
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={update.isPending} disabled={unchanged}>
          Save links
        </Button>
      </DialogActions>
    </form>
  );
}

export function LinkProjectsDialog({ workspaceId, file, onClose }) {
  return (
    <Dialog
      open={Boolean(file)}
      onClose={onClose}
      title="Link to projects"
      description={file?.name}
    >
      {file && <LinkProjectsForm workspaceId={workspaceId} file={file} onDone={onClose} />}
    </Dialog>
  );
}

function MoveForm({ workspaceId, file, folders, onDone }) {
  const update = useUpdateFile(workspaceId);
  const [folderId, setFolderId] = useState(file.folderId);
  const options = folderTree(folders).map((folder) => ({
    value: folder.id,
    label: `${'  '.repeat(folder.depth)}${folder.name}`,
  }));

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        update.mutate({ id: file.id, folderId }, { onSuccess: onDone });
      }}
      className="space-y-4"
    >
      {update.error && <Alert tone="error">{update.error.message}</Alert>}
      <SelectField
        id="move-folder"
        label="Folder"
        options={options}
        value={folderId}
        onChange={(event) => setFolderId(event.target.value)}
      />
      <DialogActions>
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={update.isPending} disabled={folderId === file.folderId}>
          Move
        </Button>
      </DialogActions>
    </form>
  );
}

export function MoveFileDialog({ workspaceId, file, folders, onClose }) {
  return (
    <Dialog
      open={Boolean(file)}
      onClose={onClose}
      title={file ? `Move "${file.name}"` : 'Move file'}
    >
      {file && (
        <MoveForm workspaceId={workspaceId} file={file} folders={folders} onDone={onClose} />
      )}
    </Dialog>
  );
}

function MediaPreview({ workspaceId, file, url }) {
  const refreshUrl = useCallback(
    (options) => fetchFileUrl(workspaceId, file.id, 'inline', options),
    [workspaceId, file.id],
  );
  const download = useCallback(async () => {
    window.location.assign(await fetchFileUrl(workspaceId, file.id, 'attachment'));
  }, [workspaceId, file.id]);

  if (isPlayable(file)) {
    const isVideo = file.mime.startsWith('video/');
    return (
      <div
        className={cn(
          'w-full',
          // The player sizes itself to the video's own shape within the stage.
          !isVideo && 'max-w-xl',
        )}
      >
        <PlayableMedia file={file} url={url} refreshUrl={refreshUrl} onDownload={download} fill />
      </div>
    );
  }
  return <FileContentView file={file} url={url} />;
}

function PreviewBody({ workspaceId, file }) {
  // A link warmed on hover (or from an earlier open) renders on the first frame.
  const [state, setState] = useState(() => ({
    url: peekFileUrl(workspaceId, file.id, 'inline'),
    error: null,
  }));

  useEffect(() => {
    if (state.url) return undefined;
    let isCurrent = true;
    fetchFileUrl(workspaceId, file.id, 'inline')
      .then((url) => isCurrent && setState({ url, error: null }))
      .catch((error) => isCurrent && setState({ url: null, error: error.message }));
    return () => {
      isCurrent = false;
    };
  }, [workspaceId, file.id, state.url]);

  if (state.error) {
    return (
      <div className="bg-surface text-ink w-full max-w-md rounded-2xl p-4">
        <Alert tone="error">{state.error}</Alert>
      </div>
    );
  }
  if (!state.url) {
    return (
      <div className="grid aspect-video w-full max-w-[min(100%,calc((100dvh-9rem)*16/9))] place-items-center rounded-2xl bg-white/5">
        <Loader2 className="h-8 w-8 animate-spin text-white/60" aria-hidden="true" />
      </div>
    );
  }
  return <MediaPreview workspaceId={workspaceId} file={file} url={state.url} />;
}

function ViewerButton({ label, onClick, children, className }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/10 text-white ring-1 ring-white/10 backdrop-blur transition-colors',
        'hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-0',
        className,
      )}
    >
      {children}
    </button>
  );
}

/**
 * A full-screen, dark viewer for one file: video, audio, images (HEIC, TIFF,
 * PSD and RAW converted in the browser), PDFs, text files and fonts.
 * files: the previewable files on screen, for previous/next (optional).
 * onNavigate(file): show another file. onDownload(file): download the original.
 * canEdit: may start transcripts (everyone who can view can read them).
 * openTranscript: open with the transcript panel showing (the menu's Transcribe).
 */
export function PreviewDialog({
  workspaceId,
  file,
  files = [],
  canEdit = false,
  openTranscript = false,
  onNavigate,
  onDownload,
  onClose,
}) {
  const dialogRef = useRef(null);
  const transcription = useTranscriptionEnabled(workspaceId);
  const [showTranscript, setShowTranscript] = useState(false);
  // Opened from the menu's Transcribe: show the panel straight away.
  const openRequest = openTranscript ? file?.id : null;
  const [seenRequest, setSeenRequest] = useState(null);
  if (openRequest !== seenRequest) {
    setSeenRequest(openRequest);
    if (openRequest) setShowTranscript(true);
  }
  const canTranscribe = transcription && isTranscribable(file);
  const getMedia = useCallback(() => dialogRef.current?.querySelector('video, audio'), []);
  const open = Boolean(file);
  const index = file ? files.findIndex((candidate) => candidate.id === file.id) : -1;
  const prev = index > 0 ? files[index - 1] : null;
  const next = index >= 0 && index < files.length - 1 ? files[index + 1] : null;
  const isMedia = file ? isPlayable(file) : false;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Arrow keys page through images and documents. Players keep the arrows for seeking.
  useEffect(() => {
    if (!open || isMedia || !onNavigate) return undefined;
    function onKeyDown(event) {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      // Typing in a field (the font viewer's sample text) keeps its arrows.
      if (event.target.closest?.('input, textarea, [contenteditable="true"]')) return;
      if (event.key === 'ArrowLeft' && prev) onNavigate(prev);
      if (event.key === 'ArrowRight' && next) onNavigate(next);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, isMedia, prev, next, onNavigate]);

  return (
    <dialog
      ref={dialogRef}
      aria-label={file ? `Preview of ${file.name}` : 'Preview'}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className="m-0 h-[100dvh] max-h-none w-screen max-w-none overflow-hidden bg-transparent p-0 text-white backdrop:bg-[#09080d]/95 backdrop:backdrop-blur-md"
    >
      {file && (
        <div className="flex h-full flex-col">
          <header className="flex items-center gap-3 bg-gradient-to-b from-black/60 to-transparent px-3 py-3 sm:px-5">
            <span
              className={cn(
                'hidden h-10 w-10 shrink-0 place-items-center rounded-xl sm:grid',
                fileTint(file.category),
              )}
            >
              <FileTypeIcon category={file.category} className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-sm font-semibold sm:text-base" title={file.name}>
                {file.name}
              </h2>
              <p className="truncate text-xs tabular-nums text-white/60">
                {formatBytes(file.size)}
                {file.extension && ` · ${file.extension.toUpperCase()}`}
                {file.uploadedBy?.name && ` · ${file.uploadedBy.name}`}
                {file.createdAt && ` · ${formatDate(file.createdAt)}`}
                {index >= 0 && files.length > 1 && ` · ${index + 1} of ${files.length}`}
              </p>
            </div>
            {canTranscribe && (
              <button
                type="button"
                onClick={() => setShowTranscript((shown) => !shown)}
                aria-pressed={showTranscript}
                className={cn(
                  'flex h-10 items-center gap-2 rounded-full px-4 text-sm font-medium ring-1 ring-white/10 backdrop-blur transition-colors',
                  showTranscript ? 'bg-white text-black' : 'bg-white/10 hover:bg-white/20',
                )}
              >
                <Captions className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">Transcript</span>
              </button>
            )}
            {onDownload && (
              <button
                type="button"
                onClick={() => onDownload(file)}
                className="flex h-10 items-center gap-2 rounded-full bg-white/10 px-4 text-sm font-medium ring-1 ring-white/10 backdrop-blur transition-colors hover:bg-white/20"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">Download</span>
              </button>
            )}
            <ViewerButton label="Close (Esc)" onClick={onClose}>
              <X className="h-5 w-5" aria-hidden="true" />
            </ViewerButton>
          </header>

          <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
            <div
              className="relative flex min-h-0 flex-1 items-center justify-center px-3 pb-4 sm:px-20 sm:pb-8"
              onClick={(event) => event.target === event.currentTarget && onClose()}
            >
              <PreviewBody key={file.id} workspaceId={workspaceId} file={file} />
              {prev && (
                <ViewerButton
                  label={`Previous: ${prev.name}`}
                  onClick={() => onNavigate(prev)}
                  className="absolute left-2 top-1/2 hidden -translate-y-1/2 sm:grid lg:left-5"
                >
                  <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                </ViewerButton>
              )}
              {next && (
                <ViewerButton
                  label={`Next: ${next.name}`}
                  onClick={() => onNavigate(next)}
                  className="absolute right-2 top-1/2 hidden -translate-y-1/2 sm:grid lg:right-5"
                >
                  <ChevronRight className="h-5 w-5" aria-hidden="true" />
                </ViewerButton>
              )}
            </div>
            {canTranscribe && showTranscript && (
              <TranscriptPanel
                key={file.id}
                workspaceId={workspaceId}
                file={file}
                canEdit={canEdit}
                getMedia={getMedia}
                className="mx-3 mb-4 max-h-[45dvh] lg:mb-8 lg:ml-0 lg:mr-5 lg:max-h-none lg:w-96 lg:shrink-0"
              />
            )}
          </div>
        </div>
      )}
    </dialog>
  );
}

export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  pending,
  error,
  onConfirm,
  onClose,
}) {
  return (
    <Dialog open={open} onClose={onClose} title={title}>
      {error && (
        <Alert tone="error" className="mb-4">
          {error}
        </Alert>
      )}
      <div className="text-muted text-sm">{children}</div>
      <DialogActions>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="danger" loading={pending} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

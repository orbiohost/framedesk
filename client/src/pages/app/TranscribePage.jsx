import { useQueryClient } from '@tanstack/react-query';
import {
  ArchiveRestore,
  Captions,
  Copy,
  Download,
  FolderOpen,
  Languages,
  Loader2,
  Play,
  RefreshCw,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { Alert } from '../../components/ui/Alert.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { EmptyState } from '../../components/ui/EmptyState.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { SearchInput } from '../../components/ui/SearchInput.jsx';
import { SegmentedControl } from '../../components/ui/SegmentedControl.jsx';
import { SelectField } from '../../components/ui/SelectField.jsx';
import { Skeleton } from '../../components/ui/Skeleton.jsx';
import { ActionMenu } from '../../features/files/ActionMenu.jsx';
import { ConfirmDialog, PreviewDialog } from '../../features/files/FileDialogs.jsx';
import { fileTint } from '../../features/files/FileThumbnail.jsx';
import { FileTypeIcon } from '../../features/files/FileTypeIcon.jsx';
import { useFileLifecycle, useUploads } from '../../features/files/hooks.js';
import { addUploads } from '../../features/files/uploadStore.js';
import { formatTime } from '../../features/media/MediaPlayer.jsx';
import {
  fetchTranscriptText,
  isWorking,
  LANGUAGE_OPTIONS,
  languageName,
  transcriptExportUrl,
  useRemoveTranscript,
  useRerunTranscript,
  useTranscriptHistory,
  useTranscriptionEnabled,
  useTranscriptionsFolder,
} from '../../features/transcripts/hooks.js';
import { canEdit as canEditWorkspace } from '../../features/workspaces/roles.js';
import { cn } from '../../lib/cn.js';
import { formatDate } from '../../lib/dates.js';
import { formatBytes } from '../../lib/format.js';
import { featureKey } from '../../lib/workspaceKeys.js';

// What Whisper can read and the viewer can play. Camera RAW (.r3d, .braw) and
// .mxf are left out: they upload fine to the Drive but can't be transcribed here.
const AUDIO = 'wav mp3 aac m4a aif aiff flac ogg oga opus weba wma amr ac3 mka';
const VIDEO = 'mp4 mov m4v avi mkv webm mts m2ts ts mpeg mpg m2v vob 3gp 3g2 ogv wmv flv';
const EXTENSIONS = new Set(`${AUDIO} ${VIDEO}`.split(' '));
const ACCEPT = ['audio/*', 'video/*', ...[...EXTENSIONS].map((ext) => `.${ext}`)].join(',');

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'working', label: 'In progress' },
  { value: 'done', label: 'Done' },
  { value: 'failed', label: 'Failed' },
];

function extensionOf(name) {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase();
}

function UploadCard({ workspaceId, folder }) {
  const inputRef = useRef(null);
  const [language, setLanguage] = useState('');
  const [translate, setTranslate] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [rejected, setRejected] = useState([]);

  function upload(fileList) {
    const files = [...fileList];
    const accepted = files.filter((file) => EXTENSIONS.has(extensionOf(file.name)));
    setRejected(files.filter((file) => !accepted.includes(file)).map((file) => file.name));
    if (accepted.length === 0 || !folder.data) return;
    addUploads({
      workspaceId,
      projectId: null,
      folderId: folder.data.id,
      folderName: folder.data.name,
      files: accepted,
      extraMetadata: {
        transcribe: translate ? 'translate' : 'transcribe',
        transcribeLanguage: language,
      },
    });
  }

  return (
    <Card className="p-5">
      {folder.error && (
        <Alert tone="error" className="mb-4">
          {folder.error.message}
        </Alert>
      )}
      <button
        type="button"
        onClick={() => inputRef.current.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          upload(event.dataTransfer.files);
        }}
        disabled={!folder.data}
        className={cn(
          'flex w-full flex-col items-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors',
          dragging ? 'border-accent bg-accent/10' : 'border-line hover:bg-subtle/60',
          'disabled:cursor-wait disabled:opacity-60',
        )}
      >
        <span className="bg-accent text-accent-ink mb-3 grid h-12 w-12 place-items-center rounded-2xl">
          <UploadCloud className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="font-semibold">Drop audio or video here, or click to choose</span>
        <span className="text-muted mt-1 text-sm">
          MP3, WAV, M4A, MP4, MOV, MKV, WEBM and more. Several files at once is fine.
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT}
        className="hidden"
        onChange={(event) => {
          upload(event.target.files);
          event.target.value = '';
        }}
      />

      <div className="mt-4 flex flex-wrap items-end gap-4">
        <SelectField
          id="transcribe-language"
          label="Spoken language"
          options={LANGUAGE_OPTIONS}
          value={language}
          onChange={(event) => setLanguage(event.target.value)}
          className="w-56"
        />
        <label className="flex h-10 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={translate}
            onChange={(event) => setTranslate(event.target.checked)}
            className="accent-accent h-4 w-4"
          />
          Translate to English
        </label>
        <p className="text-muted ml-auto flex items-center gap-1.5 text-sm">
          <FolderOpen className="h-4 w-4" aria-hidden="true" />
          Saved to Drive › {folder.data?.name ?? 'Transcriptions'}
        </p>
      </div>
      {rejected.length > 0 && (
        <Alert tone="error" className="mt-4">
          Not an audio or video file: {rejected.join(', ')}
        </Alert>
      )}
    </Card>
  );
}

// Uploads from this page that haven't reached the server's history yet.
function PendingUploads({ workspaceId }) {
  const uploads = useUploads().filter(
    (item) => item.transcribe && item.workspaceId === workspaceId && item.status !== 'done',
  );
  if (uploads.length === 0) return null;
  return (
    <ul className="space-y-2">
      {uploads.map((item) => {
        const percent = item.size ? Math.round((item.uploadedBytes / item.size) * 100) : 0;
        return (
          <li key={item.id} className="border-line/70 bg-surface rounded-2xl border px-4 py-3">
            <div className="flex items-center gap-3 text-sm">
              <span className="min-w-0 flex-1 truncate font-medium">{item.name}</span>
              <span
                className={cn(
                  'tabular-nums',
                  item.status === 'error' ? 'text-danger' : 'text-muted',
                )}
              >
                {item.status === 'error' && item.error}
                {item.status === 'paused' && 'Paused'}
                {item.status === 'uploading' && `Uploading ${percent}%`}
              </span>
            </div>
            <div className="bg-subtle mt-2 h-1.5 overflow-hidden rounded-full">
              <div
                className="bg-accent h-full rounded-full transition-[width]"
                style={{ width: `${percent}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function StatusBadge({ transcript }) {
  if (transcript.file?.deletedAt) return <Badge tone="muted">In Trash</Badge>;
  if (transcript.status === 'queued') return <Badge tone="muted">Waiting</Badge>;
  if (transcript.status === 'processing') {
    return (
      <Badge tone="accent">
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
        {Math.round(transcript.progress * 100)}%
      </Badge>
    );
  }
  if (transcript.status === 'failed') return <Badge tone="danger">Failed</Badge>;
  return <Badge tone="success">Done</Badge>;
}

function locationLabel(location) {
  if (!location) return null;
  const space = location.projectId ? (location.projectName ?? 'Project') : 'Drive';
  return location.folderName ? `${space} › ${location.folderName}` : space;
}

function locationHref(workspaceId, location) {
  const base = location.projectId
    ? `/w/${workspaceId}/projects/${location.projectId}/files`
    : `/w/${workspaceId}/drive`;
  return `${base}?folder=${location.folderId}`;
}

function downloadFrom(href) {
  const link = document.createElement('a');
  link.href = href;
  link.download = '';
  document.body.append(link);
  link.click();
  link.remove();
}

const EXPORTS = [
  { format: 'txt', label: 'Download text (.txt)' },
  { format: 'srt', label: 'Download subtitles (.srt)' },
  { format: 'vtt', label: 'Download subtitles (.vtt)' },
];

// What the "⋯" menu offers for one transcript, given its state and the viewer's role.
function rowActions({ workspaceId, transcript, editable, enabled, onOpen, onAction, navigate }) {
  const { file, location, status } = transcript;
  const inTrash = Boolean(file?.deletedAt);
  const openable = file && !inTrash && file.previewable;
  const done = status === 'done';
  const working = isWorking(transcript);
  const canRerun = editable && enabled && file && !inTrash && !working;
  const items = [];

  if (openable)
    items.push({ key: 'open', label: 'Open', icon: Play, onSelect: () => onOpen(file) });
  if (done) {
    items.push({
      key: 'copy',
      label: 'Copy text',
      icon: Copy,
      onSelect: () => onAction('copy', transcript),
    });
    EXPORTS.forEach(({ format, label }, index) =>
      items.push({
        key: format,
        label,
        icon: Download,
        divider: index === 0 && items.length > 0,
        onSelect: () => downloadFrom(transcriptExportUrl(workspaceId, transcript.fileId, format)),
      }),
    );
  }
  if (location && !inTrash) {
    items.push({
      key: 'folder',
      label: 'Show in folder',
      icon: FolderOpen,
      onSelect: () => navigate(locationHref(workspaceId, location)),
    });
  }

  const editing = [];
  if (canRerun) {
    editing.push({
      key: 'rerun',
      label: status === 'failed' ? 'Retry transcription' : 'Transcribe again',
      icon: RefreshCw,
      onSelect: () => onAction('rerun', transcript),
    });
    if (transcript.task !== 'translate') {
      editing.push({
        key: 'translate',
        label: 'Translate to English',
        icon: Languages,
        onSelect: () => onAction('translate', transcript),
      });
    }
  }
  if (editable && inTrash) {
    editing.push({
      key: 'restore',
      label: 'Restore recording',
      icon: ArchiveRestore,
      onSelect: () => onAction('restore', transcript),
    });
  }
  if (editable) {
    editing.push({
      key: 'delete',
      label: working ? 'Stop and delete transcript' : 'Delete transcript',
      icon: working ? X : Trash2,
      danger: true,
      onSelect: () => onAction('delete', transcript),
    });
    if (file && !inTrash) {
      editing.push({
        key: 'trash',
        label: 'Move recording to Trash',
        icon: Trash2,
        danger: true,
        onSelect: () => onAction('trash', transcript),
      });
    }
  }
  editing.forEach((item, index) => {
    if (index === 0 && items.length > 0) item.divider = true;
    items.push(item);
  });
  return items;
}

function HistoryRow({ workspaceId, transcript, editable, enabled, onOpen, onAction }) {
  const navigate = useNavigate();
  const { file, location } = transcript;
  const spoken = languageName(transcript.detectedLanguage ?? transcript.language);
  const openable = file && !file.deletedAt && file.previewable;
  const meta = [
    transcript.durationSec ? formatTime(transcript.durationSec) : null,
    spoken,
    transcript.task === 'translate' ? 'to English' : null,
    transcript.requestedBy?.name,
    formatDate(transcript.createdAt),
  ].filter(Boolean);

  return (
    <li className="border-line/70 flex items-start gap-3 border-b px-4 py-3 last:border-b-0 sm:px-5">
      <span
        className={cn(
          'mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl',
          fileTint(file?.category ?? 'audio'),
        )}
      >
        <FileTypeIcon category={file?.category ?? 'audio'} className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => openable && onOpen(file)}
            disabled={!openable}
            className="min-w-0 truncate text-left font-semibold hover:underline disabled:no-underline"
            title={file?.name}
          >
            {file?.name ?? 'Deleted file'}
          </button>
          <StatusBadge transcript={transcript} />
        </div>
        {transcript.status === 'failed' && transcript.error ? (
          <p className="text-danger mt-0.5 line-clamp-1 text-sm">{transcript.error}</p>
        ) : (
          transcript.preview && (
            <p className="text-muted mt-0.5 line-clamp-2 text-sm">{transcript.preview}</p>
          )
        )}
        <p className="text-muted mt-1 flex flex-wrap gap-x-2 text-xs tabular-nums">
          {location && (
            <Link
              to={locationHref(workspaceId, location)}
              className="hover:text-ink underline-offset-2 hover:underline"
            >
              {locationLabel(location)}
            </Link>
          )}
          {meta.map((part) => (
            <span key={part}>· {part}</span>
          ))}
          {file && <span>· {formatBytes(file.size)}</span>}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {transcript.status === 'done' &&
          ['txt', 'srt'].map((format) => (
            <a
              key={format}
              href={transcriptExportUrl(workspaceId, transcript.fileId, format)}
              download
              title={format === 'txt' ? 'Download text' : 'Download subtitles (.srt)'}
              className="text-muted hover:bg-subtle hover:text-ink hidden h-8 items-center gap-1 rounded-full px-2.5 text-xs font-medium sm:inline-flex"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />.{format}
            </a>
          ))}
        {openable && (
          <Button size="sm" variant="secondary" onClick={() => onOpen(file)}>
            Open
          </Button>
        )}
        <ActionMenu
          label={`More actions for ${file?.name ?? 'this transcript'}`}
          title={file?.name ?? 'Transcript'}
          items={rowActions({
            workspaceId,
            transcript,
            editable,
            enabled,
            onOpen,
            onAction,
            navigate,
          })}
        />
      </div>
    </li>
  );
}

function matches(transcript, filter, needle) {
  if (filter === 'working' && !isWorking(transcript)) return false;
  if (filter === 'done' && transcript.status !== 'done') return false;
  if (filter === 'failed' && transcript.status !== 'failed') return false;
  if (!needle) return true;
  const haystack = `${transcript.file?.name ?? ''} ${transcript.preview ?? ''}`.toLowerCase();
  return haystack.includes(needle);
}

const CONFIRMS = {
  delete: {
    title: 'Delete this transcript?',
    confirmLabel: 'Delete transcript',
    body: 'The text and subtitles are removed. The recording stays in the Drive, so you can transcribe it again later.',
  },
  trash: {
    title: 'Move the recording to Trash?',
    confirmLabel: 'Move to Trash',
    body: 'The recording goes to the Drive’s Trash, where it can be restored. The transcript stays listed here until the file is deleted for good.',
  },
};

// A short message under the History header that clears itself.
function useNotice() {
  const [notice, setNotice] = useState(null);
  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [notice]);
  return [notice, setNotice];
}

function History({ workspace, editable, enabled }) {
  const workspaceId = workspace.id;
  const queryClient = useQueryClient();
  const history = useTranscriptHistory(workspaceId);
  const rerun = useRerunTranscript(workspaceId);
  const remove = useRemoveTranscript(workspaceId);
  const lifecycle = useFileLifecycle(workspaceId);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [openFile, setOpenFile] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [notice, setNotice] = useNotice();

  const refreshHistory = () =>
    queryClient.invalidateQueries({ queryKey: featureKey(workspaceId, 'transcripts', 'history') });

  async function runFileAction(transcript, action, done) {
    await lifecycle.mutateAsync({ id: transcript.fileId, action });
    await refreshHistory();
    setNotice({ tone: 'success', text: done });
  }

  async function onAction(type, transcript) {
    const name = transcript.file?.name ?? 'the recording';
    try {
      if (type === 'copy') {
        await navigator.clipboard.writeText(
          await fetchTranscriptText(workspaceId, transcript.fileId),
        );
        setNotice({ tone: 'success', text: `Copied the text of ${name}.` });
      } else if (type === 'rerun' || type === 'translate') {
        await rerun.mutateAsync({
          fileId: transcript.fileId,
          language: transcript.language,
          task: type === 'translate' ? 'translate' : transcript.task,
        });
        setNotice({
          tone: 'success',
          text:
            type === 'translate'
              ? `Translating ${name} to English.`
              : `Transcribing ${name} again.`,
        });
      } else if (type === 'restore') {
        await runFileAction(transcript, 'restore', `Restored ${name} from the Trash.`);
      } else {
        lifecycle.reset();
        remove.reset();
        setConfirm({ type, transcript });
      }
    } catch (error) {
      setNotice({ tone: 'error', text: error.message });
    }
  }

  async function onConfirm() {
    const { type, transcript } = confirm;
    const name = transcript.file?.name ?? 'the recording';
    try {
      if (type === 'delete') {
        await remove.mutateAsync({ fileId: transcript.fileId });
        setNotice({ tone: 'success', text: `Deleted the transcript of ${name}.` });
      } else {
        await runFileAction(transcript, 'trash', `Moved ${name} to the Trash.`);
      }
      setConfirm(null);
    } catch {
      // The dialog shows the mutation's error.
    }
  }
  const all = useMemo(
    () => history.data?.pages.flatMap((page) => page.transcripts) ?? [],
    [history.data],
  );
  const needle = search.trim().toLowerCase();
  const shown = all.filter((transcript) => matches(transcript, filter, needle));

  let body;
  if (history.isPending) {
    body = (
      <div className="space-y-3 p-5">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  } else if (history.isError) {
    body = (
      <div className="p-5">
        <Alert tone="error">{history.error.message}</Alert>
      </div>
    );
  } else if (all.length === 0) {
    body = (
      <EmptyState icon={Captions} title="No transcripts yet" className="m-5">
        Upload a recording above, or open any video in Drive or a project and choose Transcribe.
        Everything transcribed in this workspace shows up here.
      </EmptyState>
    );
  } else {
    body = (
      <>
        <ul>
          {shown.map((transcript) => (
            <HistoryRow
              key={transcript.id}
              workspaceId={workspace.id}
              transcript={transcript}
              editable={editable}
              enabled={enabled}
              onOpen={setOpenFile}
              onAction={onAction}
            />
          ))}
        </ul>
        {shown.length === 0 && (
          <p className="text-muted px-5 py-8 text-center text-sm">
            Nothing matches. {history.hasNextPage && 'Older transcripts may match: load more.'}
          </p>
        )}
        {history.hasNextPage && (
          <div className="border-line/70 border-t p-4 text-center">
            <Button
              variant="secondary"
              size="sm"
              loading={history.isFetchingNextPage}
              onClick={() => history.fetchNextPage()}
            >
              Load older transcripts
            </Button>
          </div>
        )}
      </>
    );
  }

  return (
    <Card className="overflow-hidden">
      <header className="border-line flex flex-wrap items-center gap-3 border-b px-5 py-4">
        <h2 className="mr-auto text-[15px] font-semibold">History</h2>
        <SearchInput
          value={search}
          onChange={setSearch}
          label="Search transcripts"
          placeholder="Search names and text"
          className="w-full sm:w-64"
        />
        <SegmentedControl label="Filter" options={FILTERS} value={filter} onChange={setFilter} />
      </header>
      {notice && (
        <div className="border-line/70 border-b px-5 py-3">
          <Alert tone={notice.tone}>{notice.text}</Alert>
        </div>
      )}
      {body}
      <ConfirmDialog
        open={confirm !== null}
        title={confirm ? CONFIRMS[confirm.type].title : ''}
        confirmLabel={confirm ? CONFIRMS[confirm.type].confirmLabel : ''}
        pending={remove.isPending || lifecycle.isPending}
        error={(confirm?.type === 'delete' ? remove.error : lifecycle.error)?.message}
        onConfirm={onConfirm}
        onClose={() => setConfirm(null)}
      >
        <p className="text-ink mb-2 font-medium">{confirm?.transcript.file?.name}</p>
        {confirm && CONFIRMS[confirm.type].body}
      </ConfirmDialog>
      <PreviewDialog
        workspaceId={workspace.id}
        file={openFile}
        canEdit={editable}
        openTranscript
        onClose={() => setOpenFile(null)}
      />
    </Card>
  );
}

// Upload recordings to transcribe, and the history of every transcript in the
// workspace (including ones started from Drive and project files).
export function TranscribePage() {
  const { workspace } = useOutletContext();
  const enabled = useTranscriptionEnabled(workspace.id);
  const editable = canEditWorkspace(workspace);
  const folder = useTranscriptionsFolder(workspace.id, { enabled: enabled && editable });

  return (
    <>
      <PageHeader
        title="Transcribe"
        description="Turn recordings into searchable text and subtitles. Uploads are kept in the Drive, so the whole team can find them."
        actions={
          folder.data && (
            <Link
              to={`/w/${workspace.id}/drive?folder=${folder.data.id}`}
              className="border-line bg-surface hover:bg-subtle inline-flex h-10 items-center gap-2 rounded-full border px-5 text-sm font-medium shadow-sm"
            >
              <FolderOpen className="h-4 w-4" aria-hidden="true" />
              Open folder
            </Link>
          )
        }
      />
      {!enabled && (
        <Alert tone="info" className="mb-6">
          Speech-to-text isn&apos;t set up on this server yet, so new files can&apos;t be
          transcribed. Earlier transcripts are still listed below.
        </Alert>
      )}
      <div className="space-y-6">
        {enabled && editable && (
          <>
            <UploadCard workspaceId={workspace.id} folder={folder} />
            <PendingUploads workspaceId={workspace.id} />
          </>
        )}
        <History workspace={workspace} editable={editable} enabled={enabled} />
      </div>
    </>
  );
}

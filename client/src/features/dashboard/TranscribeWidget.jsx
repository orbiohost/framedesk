import { useQueryClient } from '@tanstack/react-query';
import { Captions, Download, Loader2, UploadCloud } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Skeleton } from '../../components/ui/Skeleton.jsx';
import { cn } from '../../lib/cn.js';
import { formatDate } from '../../lib/dates.js';
import { PreviewDialog } from '../files/FileDialogs.jsx';
import { fileTint } from '../files/FileThumbnail.jsx';
import { FileTypeIcon } from '../files/FileTypeIcon.jsx';
import { useUploads } from '../files/hooks.js';
import { addUploads } from '../files/uploadStore.js';
import { formatTime } from '../media/MediaPlayer.jsx';
import {
  fetchTranscriptionsFolder,
  transcriptExportUrl,
  useTranscriptHistory,
  useTranscriptionEnabled,
} from '../transcripts/hooks.js';
import { splitTranscribable, TRANSCRIBE_ACCEPT } from '../transcripts/transcribeFiles.js';
import { TranscriptStatusBadge } from '../transcripts/TranscriptStatusBadge.jsx';
import { canEdit as canEditWorkspace } from '../workspaces/roles.js';
import { RoundIconButton, Widget } from './Widget.jsx';

const SHOWN = 6;

// Picks recordings and sends them to the Drive's Transcriptions folder, where
// the server starts transcribing each one as soon as it lands.
function useTranscribeUpload(workspaceId) {
  const queryClient = useQueryClient();
  const inputRef = useRef(null);
  const [error, setError] = useState(null);
  const [preparing, setPreparing] = useState(false);

  async function upload(fileList) {
    const { accepted, rejected } = splitTranscribable(fileList);
    setError(
      rejected.length
        ? `Not an audio or video file: ${rejected.map((f) => f.name).join(', ')}`
        : null,
    );
    if (accepted.length === 0) return;
    setPreparing(true);
    try {
      const folder = await fetchTranscriptionsFolder(queryClient, workspaceId);
      addUploads({
        workspaceId,
        projectId: null,
        folderId: folder.id,
        folderName: folder.name,
        files: accepted,
        extraMetadata: { transcribe: 'transcribe', transcribeLanguage: '' },
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setPreparing(false);
    }
  }

  const input = (
    <input
      ref={inputRef}
      type="file"
      multiple
      accept={TRANSCRIBE_ACCEPT}
      className="hidden"
      onChange={(event) => {
        upload(event.target.files);
        event.target.value = '';
      }}
    />
  );
  return { input, pick: () => inputRef.current?.click(), upload, error, preparing };
}

// Recordings from this workspace still on their way to the server.
function PendingUploads({ workspaceId }) {
  const uploads = useUploads().filter(
    (item) => item.transcribe && item.workspaceId === workspaceId && item.status !== 'done',
  );
  if (uploads.length === 0) return null;
  return (
    <ul className="mb-2 space-y-1.5">
      {uploads.map((item) => {
        const percent = item.size ? Math.round((item.uploadedBytes / item.size) * 100) : 0;
        return (
          <li key={item.id} className="bg-subtle/70 rounded-2xl px-3 py-2">
            <div className="flex items-center gap-2 text-xs">
              <span className="min-w-0 flex-1 truncate font-medium">{item.name}</span>
              <span
                className={cn(
                  'shrink-0 tabular-nums',
                  item.status === 'error' ? 'text-danger' : 'text-muted',
                )}
              >
                {item.status === 'error' && 'Upload failed'}
                {item.status === 'paused' && 'Paused'}
                {item.status === 'uploading' && `Uploading ${percent}%`}
              </span>
            </div>
            <div className="bg-line/60 mt-1.5 h-1 overflow-hidden rounded-full">
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

function TranscriptRow({ workspaceId, transcript, onOpen }) {
  const { file } = transcript;
  const openable = file && !file.deletedAt && file.previewable;
  const meta = [
    transcript.durationSec ? formatTime(transcript.durationSec) : null,
    formatDate(transcript.createdAt),
  ].filter(Boolean);

  return (
    <li className="hover:bg-subtle/70 group flex items-start gap-3 rounded-2xl px-2 py-2">
      <span
        className={cn(
          'grid h-9 w-9 shrink-0 place-items-center rounded-xl',
          fileTint(file?.category ?? 'audio'),
        )}
      >
        <FileTypeIcon category={file?.category ?? 'audio'} className="h-4 w-4" />
      </span>
      <button
        type="button"
        onClick={() => openable && onOpen(file)}
        disabled={!openable}
        className="min-w-0 flex-1 text-left disabled:cursor-default"
      >
        <span className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-sm font-medium" title={file?.name}>
            {file?.name ?? 'Deleted file'}
          </span>
          <TranscriptStatusBadge transcript={transcript} />
        </span>
        {transcript.status === 'failed' && transcript.error ? (
          <span className="text-danger mt-0.5 line-clamp-1 block text-xs">{transcript.error}</span>
        ) : (
          transcript.preview && (
            <span className="text-muted mt-0.5 line-clamp-1 block text-xs">
              {transcript.preview}
            </span>
          )
        )}
        <span className="text-muted mt-0.5 block text-xs tabular-nums">{meta.join(' · ')}</span>
      </button>
      {transcript.status === 'done' && (
        <a
          href={transcriptExportUrl(workspaceId, transcript.fileId, 'txt')}
          download
          aria-label={`Download the text of ${file?.name ?? 'this transcript'}`}
          title="Download text (.txt)"
          className="text-muted hover:bg-line/60 hover:text-ink grid h-8 w-8 shrink-0 place-items-center rounded-full opacity-100 transition-opacity sm:opacity-0 sm:focus-visible:opacity-100 sm:group-hover:opacity-100"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
        </a>
      )}
    </li>
  );
}

// The newest transcripts with live progress, plus a quick way to send more.
export function TranscribeWidget({ workspace, className }) {
  const enabled = useTranscriptionEnabled(workspace.id);
  const editable = canEditWorkspace(workspace);
  const canUpload = enabled && editable;
  const history = useTranscriptHistory(workspace.id);
  const uploader = useTranscribeUpload(workspace.id);
  const [openFile, setOpenFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const base = `/w/${workspace.id}`;

  const transcripts = history.data?.pages.flatMap((page) => page.transcripts) ?? [];
  const working = transcripts.filter(
    (t) => t.status === 'queued' || t.status === 'processing',
  ).length;

  let body;
  if (history.isPending) {
    body = <Skeleton className="h-32" />;
  } else if (history.isError) {
    body = <p className="text-danger text-sm">{history.error.message}</p>;
  } else if (transcripts.length === 0) {
    body = canUpload ? (
      <button
        type="button"
        onClick={uploader.pick}
        disabled={uploader.preparing}
        className={cn(
          'flex h-full min-h-28 w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-6 text-center transition-colors',
          dragging ? 'border-accent bg-accent/10' : 'border-line hover:bg-subtle/60',
        )}
      >
        <UploadCloud className="text-muted mb-2 h-5 w-5" aria-hidden="true" />
        <span className="text-sm font-medium">Drop a recording, or click to choose</span>
        <span className="text-muted mt-0.5 text-xs">
          You get searchable text and subtitles back.
        </span>
      </button>
    ) : (
      <p className="text-muted py-6 text-center text-sm">
        {enabled ? 'No transcripts yet.' : 'Speech-to-text isn’t set up on this server yet.'}
      </p>
    );
  } else {
    body = (
      <ul className="space-y-0.5">
        {transcripts.slice(0, SHOWN).map((transcript) => (
          <TranscriptRow
            key={transcript.id}
            workspaceId={workspace.id}
            transcript={transcript}
            onOpen={setOpenFile}
          />
        ))}
      </ul>
    );
  }

  // Dropping recordings anywhere on the tile uploads them.
  const dropHandlers = canUpload
    ? {
        onDragOver: (event) => {
          if (![...event.dataTransfer.types].includes('Files')) return;
          event.preventDefault();
          setDragging(true);
        },
        onDragLeave: (event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false);
        },
        onDrop: (event) => {
          event.preventDefault();
          setDragging(false);
          uploader.upload(event.dataTransfer.files);
        },
      }
    : {};

  return (
    <div {...dropHandlers} className={cn('fit:min-h-0 flex min-w-0 flex-col', className)}>
      <Widget
        icon={Captions}
        title="Transcribe"
        className={cn('flex-1', dragging && 'ring-accent ring-2')}
        actions={
          <>
            {canUpload && (
              <RoundIconButton
                label="Upload recordings to transcribe"
                onClick={uploader.pick}
                disabled={uploader.preparing}
              >
                {uploader.preparing ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <UploadCloud className="h-4 w-4" aria-hidden="true" />
                )}
              </RoundIconButton>
            )}
            <Link
              to={`${base}/transcribe`}
              className="bg-subtle hover:bg-line/70 rounded-full px-3 py-1.5 text-xs font-medium"
            >
              All
            </Link>
          </>
        }
      >
        {uploader.error && <p className="text-danger mb-2 text-xs">{uploader.error}</p>}
        <PendingUploads workspaceId={workspace.id} />
        {working > 0 && (
          <p className="text-muted mb-1 px-2 text-xs">
            {working} {working === 1 ? 'recording' : 'recordings'} being transcribed…
          </p>
        )}
        {body}
        {transcripts.length > SHOWN && (
          <Link
            to={`${base}/transcribe`}
            className="text-muted hover:text-ink mt-2 inline-block px-2 text-xs font-medium"
          >
            See all transcripts
          </Link>
        )}
        {uploader.input}
      </Widget>
      <PreviewDialog
        workspaceId={workspace.id}
        file={openFile}
        canEdit={editable}
        openTranscript
        onClose={() => setOpenFile(null)}
      />
    </div>
  );
}

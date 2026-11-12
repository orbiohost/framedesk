import { ChevronLeft, ChevronRight, Download, Loader2, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from '../../components/ui/Alert.jsx';
import { cn } from '../../lib/cn.js';
import { formatDate } from '../../lib/dates.js';
import { formatBytes } from '../../lib/format.js';
import { fileTint } from '../files/FileThumbnail.jsx';
import { FileTypeIcon } from '../files/FileTypeIcon.jsx';
import { PlayableMedia } from '../media/PlayableMedia.jsx';
import { fetchSharedFileUrl } from './hooks.js';

function isPlayable(file) {
  return file.mime.startsWith('video/') || file.mime.startsWith('audio/');
}

async function inlineUrl(token, fileId) {
  return (await fetchSharedFileUrl(token, fileId, 'inline')).url;
}

// Starts a download without leaving the page: the link answers with
// Content-Disposition: attachment, so the browser saves it in place.
export async function downloadSharedFile(token, fileId) {
  const { url } = await fetchSharedFileUrl(token, fileId, 'attachment');
  const link = document.createElement('a');
  link.href = url;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
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
        'hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white/70',
        className,
      )}
    >
      {children}
    </button>
  );
}

function PreviewBody({ token, file }) {
  const [state, setState] = useState({ url: null, error: null });

  useEffect(() => {
    let isCurrent = true;
    inlineUrl(token, file.id)
      .then((url) => isCurrent && setState({ url, error: null }))
      .catch((error) => isCurrent && setState({ url: null, error: error.message }));
    return () => {
      isCurrent = false;
    };
  }, [token, file.id]);

  // The player asks again when a link expires mid-playback.
  const refreshUrl = useCallback(() => inlineUrl(token, file.id), [token, file.id]);
  const download = useCallback(() => downloadSharedFile(token, file.id), [token, file.id]);

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

  if (isPlayable(file)) {
    const isVideo = file.mime.startsWith('video/');
    return (
      <div
        className={cn(
          'w-full',
          isVideo ? 'max-w-[min(100%,calc((100dvh-9rem)*16/9))]' : 'max-w-xl',
        )}
      >
        <PlayableMedia
          file={file}
          url={state.url}
          refreshUrl={refreshUrl}
          onDownload={download}
          fill
        />
      </div>
    );
  }
  if (file.mime.startsWith('image/')) {
    return (
      <img
        src={state.url}
        alt={file.name}
        className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
      />
    );
  }
  return (
    <iframe
      src={state.url}
      title={file.name}
      className="h-full w-full max-w-5xl rounded-xl border-0 bg-white shadow-2xl"
    />
  );
}

/**
 * Full-screen viewer for a shared project's files: plays video and audio,
 * shows images and PDFs, right on the page.
 * files: the previewable files, for previous/next.
 */
export function SharedPreviewDialog({ token, file, files = [], onNavigate, onClose }) {
  const dialogRef = useRef(null);
  const [downloadError, setDownloadError] = useState(null);
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

  // Arrow keys page through images and documents; players keep them for seeking.
  useEffect(() => {
    if (!open || isMedia) return undefined;
    function onKeyDown(event) {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === 'ArrowLeft' && prev) onNavigate(prev);
      if (event.key === 'ArrowRight' && next) onNavigate(next);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, isMedia, prev, next, onNavigate]);

  async function download() {
    setDownloadError(null);
    try {
      await downloadSharedFile(token, file.id);
    } catch (error) {
      setDownloadError(error.message);
    }
  }

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
                {file.createdAt && ` · ${formatDate(file.createdAt)}`}
                {index >= 0 && files.length > 1 && ` · ${index + 1} of ${files.length}`}
              </p>
              {downloadError && <p className="text-xs text-red-300">{downloadError}</p>}
            </div>
            <button
              type="button"
              onClick={download}
              className="flex h-10 items-center gap-2 rounded-full bg-white/10 px-4 text-sm font-medium ring-1 ring-white/10 backdrop-blur transition-colors hover:bg-white/20"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Download</span>
            </button>
            <ViewerButton label="Close (Esc)" onClick={onClose}>
              <X className="h-5 w-5" aria-hidden="true" />
            </ViewerButton>
          </header>

          <div
            className="relative flex min-h-0 flex-1 items-center justify-center px-3 pb-4 sm:px-20 sm:pb-8"
            onClick={(event) => event.target === event.currentTarget && onClose()}
          >
            <PreviewBody key={file.id} token={token} file={file} />
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
        </div>
      )}
    </dialog>
  );
}

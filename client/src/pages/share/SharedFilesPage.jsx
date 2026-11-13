import { Download, Eye, Lock, Play } from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { Button } from '../../components/ui/Button.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { FullPageMessage } from '../../components/ui/FullPageMessage.jsx';
import { Logo } from '../../components/ui/Logo.jsx';
import { Skeleton } from '../../components/ui/Skeleton.jsx';
import { ThemeToggle } from '../../components/ui/ThemeToggle.jsx';
import {
  fetchSharedFilesLinkUrl,
  useSharedFilesLink,
  useSharedFilesPreviewUrls,
} from '../../features/fileShare/hooks.js';
import { fileTint } from '../../features/files/FileThumbnail.jsx';
import { FileTypeIcon } from '../../features/files/FileTypeIcon.jsx';
import {
  downloadSharedFile,
  SharedFilePreview,
  SharedPreviewDialog,
} from '../../features/projectShare/SharedPreviewDialog.jsx';
import { cn } from '../../lib/cn.js';
import { formatDate } from '../../lib/dates.js';
import { formatBytes } from '../../lib/format.js';
import { showsNatively } from '../../features/files/viewers/formats.js';

function isPlayable(file) {
  return file.mime.startsWith('video/') || file.mime.startsWith('audio/');
}

function fileMeta(file) {
  return [formatBytes(file.size), file.extension?.toUpperCase(), formatDate(file.createdAt)]
    .filter(Boolean)
    .join(' · ');
}

function DownloadButton({ token, file, variant = 'secondary', size = 'sm', onError }) {
  const [downloading, setDownloading] = useState(false);

  async function download() {
    onError(null);
    setDownloading(true);
    try {
      await downloadSharedFile(token, file.id, fetchSharedFilesLinkUrl);
    } catch (err) {
      onError(err.message);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Button variant={variant} size={size} loading={downloading} onClick={download}>
      <Download className="h-4 w-4" aria-hidden="true" /> Download
    </Button>
  );
}

function FileIcon({ file, className }) {
  return (
    <span
      className={cn(
        'grid shrink-0 place-items-center rounded-xl',
        fileTint(file.category),
        className,
      )}
    >
      <FileTypeIcon category={file.category} className="h-[18px] w-[18px]" />
    </span>
  );
}

// A link to one file: the file itself fills the page.
function SingleFile({ token, file }) {
  const [error, setError] = useState(null);
  return (
    <>
      <header className="mb-5 flex flex-wrap items-center gap-3">
        <FileIcon file={file} className="h-12 w-12" />
        <div className="min-w-0 flex-1">
          <h1
            className="font-display truncate text-2xl leading-tight md:text-3xl"
            title={file.name}
          >
            {file.name}
          </h1>
          <p className="text-muted mt-0.5 text-sm tabular-nums">{fileMeta(file)}</p>
          {error && <p className="text-danger text-sm">{error}</p>}
        </div>
        <DownloadButton token={token} file={file} variant="primary" size="md" onError={setError} />
      </header>
      {file.previewable ? (
        <div
          className={cn(
            'flex items-center justify-center rounded-3xl bg-[#09080d] p-3 sm:p-5',
            // Players size themselves; images and documents get a tall frame.
            !isPlayable(file) && 'h-[72dvh]',
          )}
        >
          <SharedFilePreview token={token} file={file} fetchUrl={fetchSharedFilesLinkUrl} />
        </div>
      ) : (
        <Card className="text-muted px-5 py-10 text-center text-sm">
          This kind of file can&apos;t be shown in the browser. Download it to open it.
        </Card>
      )}
    </>
  );
}

function FileRow({ token, file, previewUrl, onOpen }) {
  const [error, setError] = useState(null);
  return (
    <li className="flex flex-wrap items-center gap-3 px-5 py-2.5">
      {previewUrl && showsNatively(file) ? (
        <img
          src={previewUrl}
          alt=""
          loading="lazy"
          className="h-10 w-10 shrink-0 rounded-xl object-cover"
        />
      ) : (
        <FileIcon file={file} className="h-10 w-10" />
      )}
      <div className="min-w-0 flex-1">
        {file.previewable ? (
          <button
            type="button"
            onClick={() => onOpen(file)}
            className="block max-w-full truncate text-left text-sm font-medium hover:underline"
          >
            {file.name}
          </button>
        ) : (
          <p className="truncate text-sm font-medium">{file.name}</p>
        )}
        <p className="text-muted truncate text-xs tabular-nums">{fileMeta(file)}</p>
        {error && <p className="text-danger text-xs">{error}</p>}
      </div>
      <div className="flex gap-1.5">
        {file.previewable && (
          <Button variant="ghost" size="sm" onClick={() => onOpen(file)}>
            {isPlayable(file) ? (
              <Play className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Eye className="h-4 w-4" aria-hidden="true" />
            )}
            {isPlayable(file) ? 'Play' : 'View'}
          </Button>
        )}
        <DownloadButton token={token} file={file} onError={setError} />
      </div>
    </li>
  );
}

function FileList({ token, files }) {
  const imageIds = files
    .filter((file) => file.previewable && showsNatively(file))
    .map((file) => file.id);
  const { data: previewUrls } = useSharedFilesPreviewUrls(token, imageIds);
  const [openFile, setOpenFile] = useState(null);
  const totalBytes = files.reduce((total, file) => total + file.size, 0);

  return (
    <>
      <header className="mb-5">
        <h1 className="font-display text-3xl leading-tight tracking-tight md:text-4xl">
          {files.length} shared files
        </h1>
        <p className="text-muted mt-1 text-sm tabular-nums">{formatBytes(totalBytes)} in total</p>
      </header>
      <Card>
        <ul className="divide-line/60 divide-y">
          {files.map((file) => (
            <FileRow
              key={file.id}
              token={token}
              file={file}
              previewUrl={previewUrls?.[file.id]}
              onOpen={setOpenFile}
            />
          ))}
        </ul>
      </Card>
      <SharedPreviewDialog
        token={token}
        file={openFile}
        files={files.filter((file) => file.previewable)}
        fetchUrl={fetchSharedFilesLinkUrl}
        onNavigate={setOpenFile}
        onClose={() => setOpenFile(null)}
      />
    </>
  );
}

export function SharedFilesPage() {
  const { token } = useParams();
  const location = useLocation();
  const { data, isPending, error } = useSharedFilesLink(token);

  if (isPending) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 p-6">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error?.code === 'SIGN_IN_REQUIRED') {
    return (
      <FullPageMessage title="Sign in to view">
        <p>These files are shared with signed-in FrameDesk users only.</p>
        <div className="mt-6 flex justify-center gap-2">
          <Link
            to="/login"
            state={{ from: location.pathname }}
            className="pill-active inline-flex h-10 items-center gap-2 rounded-full px-5 text-sm font-medium hover:opacity-90"
          >
            <Lock className="h-4 w-4" aria-hidden="true" /> Sign in
          </Link>
          <Link
            to="/signup"
            state={{ from: location.pathname }}
            className="border-line bg-surface text-ink hover:bg-subtle inline-flex h-10 items-center rounded-full border px-5 text-sm font-medium shadow-sm"
          >
            Create an account
          </Link>
        </div>
      </FullPageMessage>
    );
  }

  if (error) {
    return (
      <FullPageMessage title={error.status === 404 ? 'Link not available' : 'Something went wrong'}>
        {error.status === 404
          ? 'This link does not exist, sharing was stopped, or the files were removed. Ask the person who sent it for a new one.'
          : error.message}
      </FullPageMessage>
    );
  }

  const { files, workspace, access } = data;

  return (
    <div className="bg-bg min-h-screen">
      <header className="border-line/70 bg-surface/80 sticky top-0 z-20 border-b backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4 md:px-6">
          <Link to="/" aria-label="FrameDesk home">
            <Logo />
          </Link>
          {workspace.name && (
            <span className="text-muted hidden truncate text-sm sm:inline">
              · Shared by {workspace.name}
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle compact />
            {access.viewer ? (
              <Link to="/app" className="text-sm font-medium underline underline-offset-4">
                Open FrameDesk
              </Link>
            ) : (
              <Link to="/login" className="text-sm font-medium underline underline-offset-4">
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8 md:px-6">
        {files.length === 1 ? (
          <SingleFile token={token} file={files[0]} />
        ) : (
          <FileList token={token} files={files} />
        )}
      </main>
    </div>
  );
}

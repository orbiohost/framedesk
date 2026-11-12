import { Play } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/cn.js';
import { formatTime } from '../media/MediaPlayer.jsx';
import { FileTypeIcon } from './FileTypeIcon.jsx';
import { fetchPreviewUrl, peekFileUrl } from './hooks.js';
import { cachedVideoFrame, loadVideoFrame } from './videoFrames.js';

// Images larger than this show their type icon instead: without server-made
// thumbnails, the grid would download the full image.
const IMAGE_THUMB_MAX_BYTES = 25 * 1024 ** 2;

// Per-type tint, shared with the list view's icon chips.
export const FILE_TINTS = {
  video: 'bg-lavender/60 text-accent',
  image: 'bg-mint/60 text-success',
  audio: 'bg-pink/50 text-danger',
  document: 'bg-peach/60 text-warning',
  archive: 'bg-subtle text-warning',
  project: 'bg-lavender/40 text-ink',
};

export function fileTint(category) {
  return FILE_TINTS[category] ?? 'bg-subtle text-muted';
}

function thumbnailKind(file) {
  if (!file.previewable) return null;
  if (file.mime.startsWith('image/') && file.size <= IMAGE_THUMB_MAX_BYTES) return 'image';
  if (file.mime.startsWith('video/')) return 'video';
  return null;
}

// True once the element has come within a screen of the viewport (and stays true).
function useNearViewport(ref) {
  // Without IntersectionObserver (very old browsers), just load everything.
  const [isNear, setIsNear] = useState(() => typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    const element = ref.current;
    if (!element || isNear) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setIsNear(true);
      },
      { rootMargin: '300px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, isNear]);
  return isNear;
}

// { src, duration? } once there is a picture to show, null while there isn't.
function useThumbnail(workspaceId, file, kind, isNear) {
  const frameKey = `${file.id}:${file.version ?? 1}`;
  const [thumb, setThumb] = useState(() => {
    if (kind === 'video') return cachedVideoFrame(frameKey) ?? null;
    if (kind === 'image') {
      const url = peekFileUrl(workspaceId, file.id, 'inline');
      return url ? { src: url } : null;
    }
    return null;
  });

  useEffect(() => {
    if (!kind || !isNear || thumb) return undefined;
    let isCurrent = true;
    const getUrl = () => fetchPreviewUrl(workspaceId, file.id);
    const pending =
      kind === 'video'
        ? loadVideoFrame(frameKey, file.mime, getUrl)
        : getUrl().then((src) => ({ src }));
    pending
      .then((result) => isCurrent && result && setThumb(result))
      .catch(() => {
        // No picture: the type icon stays.
      });
    return () => {
      isCurrent = false;
    };
  }, [kind, isNear, thumb, workspaceId, file.id, file.mime, frameKey]);

  return thumb;
}

export function FileThumbnail({ workspaceId, file, className }) {
  const ref = useRef(null);
  const kind = thumbnailKind(file);
  const isNear = useNearViewport(ref);
  const thumb = useThumbnail(workspaceId, file, kind, isNear);
  const [loaded, setLoaded] = useState(false);
  const [broken, setBroken] = useState(false);
  const showPicture = thumb && !broken;

  return (
    <div
      ref={ref}
      className={cn(
        'relative grid aspect-[4/3] place-items-center overflow-hidden',
        fileTint(file.category),
        className,
      )}
    >
      <FileTypeIcon
        category={file.category}
        className={cn(
          'h-10 w-10 opacity-75 transition-opacity',
          showPicture && loaded && 'opacity-0',
        )}
      />
      {showPicture && (
        <img
          src={thumb.src}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onLoad={() => setLoaded(true)}
          onError={() => setBroken(true)}
          className={cn(
            'absolute inset-0 h-full w-full object-cover transition-opacity duration-300',
            loaded ? 'opacity-100' : 'opacity-0',
          )}
        />
      )}
      {kind === 'video' && (
        <>
          {/* Soft shade so the play badge and duration read on any frame. */}
          <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
          <span className="pointer-events-none absolute left-1/2 top-1/2 grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-white ring-1 ring-white/30 backdrop-blur-sm transition-transform duration-200 group-hover:scale-110">
            <Play className="ml-0.5 h-4 w-4" fill="currentColor" aria-hidden="true" />
          </span>
          {thumb?.duration > 0 && (
            <span className="pointer-events-none absolute bottom-2 right-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-white">
              {formatTime(thumb.duration)}
            </span>
          )}
        </>
      )}
    </div>
  );
}

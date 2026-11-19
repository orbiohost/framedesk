import { Download, ImagePlus, Loader2, Maximize2, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '../../lib/cn.js';
import { fetchFileUrl, fetchPreviewUrl } from '../files/hooks.js';
import { AI_GRADIENT } from './aiStyle.js';

const RATIO_CLASS = {
  '1:1': 'aspect-square',
  '3:4': 'aspect-[3/4]',
  '4:3': 'aspect-[4/3]',
  '9:16': 'aspect-[9/16]',
  '16:9': 'aspect-video',
  '3:2': 'aspect-[3/2]',
  '2:3': 'aspect-[2/3]',
  '21:9': 'aspect-[21/9]',
};

export function ratioClass(ratio) {
  return RATIO_CLASS[ratio] ?? 'aspect-square';
}

function ActionButton({ label, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="bg-surface/90 text-ink hover:bg-surface grid h-8 w-8 place-items-center rounded-full shadow-md backdrop-blur transition-transform hover:scale-105"
    >
      {children}
    </button>
  );
}

// One picture the AI made, with open / download / reuse actions.
export function AiImageResult({ workspaceId, file, onOpen, onUseAsReference, onRetry }) {
  const [src, setSrc] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let current = true;
    fetchPreviewUrl(workspaceId, file.id)
      .then((url) => current && setSrc(url))
      .catch(() => current && setFailed(true));
    return () => {
      current = false;
    };
  }, [workspaceId, file.id]);

  async function download() {
    try {
      const url = await fetchFileUrl(workspaceId, file.id, 'attachment');
      const link = document.createElement('a');
      link.href = url;
      link.rel = 'noopener';
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      // The preview dialog offers a download too.
      onOpen?.(file);
    }
  }

  return (
    <figure className="border-line/70 bg-subtle group relative w-full max-w-md overflow-hidden rounded-2xl border shadow-sm">
      {src && !failed ? (
        <button
          type="button"
          onClick={() => onOpen?.(file)}
          className="block w-full"
          aria-label={`Open ${file.name}`}
        >
          <img
            src={src}
            alt={file.name}
            className="block h-auto w-full animate-[fade-in_300ms_ease-out]"
            onError={() => setFailed(true)}
          />
        </button>
      ) : (
        <div className="text-muted grid aspect-square place-items-center text-sm">
          {failed ? 'Couldn’t load the image' : <Loader2 className="h-5 w-5 animate-spin" />}
        </div>
      )}
      <div className="absolute right-2 top-2 flex gap-1.5 opacity-100 transition-opacity sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
        <ActionButton label="Open" onClick={() => onOpen?.(file)}>
          <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
        </ActionButton>
        <ActionButton label="Download" onClick={download}>
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
        </ActionButton>
        {onUseAsReference && (
          <ActionButton label="Use as a reference" onClick={() => onUseAsReference(file)}>
            <ImagePlus className="h-3.5 w-3.5" aria-hidden="true" />
          </ActionButton>
        )}
        {onRetry && (
          <ActionButton label="Make another version" onClick={onRetry}>
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          </ActionButton>
        )}
      </div>
      <figcaption className="text-muted truncate px-3 py-1.5 text-[11px]">
        {file.name} · saved to Drive → AI images
      </figcaption>
    </figure>
  );
}

// While an image is being made: a shimmering placeholder in the chosen shape.
export function ImagePending({ ratio, status }) {
  return (
    <div className="flex animate-[ai-rise_220ms_ease-out_both] flex-col gap-2">
      <div
        className={cn(
          'relative w-full max-w-xs overflow-hidden rounded-2xl border border-fuchsia-400/30',
          ratioClass(ratio),
        )}
      >
        <div className={cn(AI_GRADIENT, 'absolute inset-0 animate-pulse opacity-20')} />
        <div className="absolute inset-0 grid place-items-center">
          <Loader2 className="h-6 w-6 animate-spin text-fuchsia-500" aria-hidden="true" />
        </div>
      </div>
      <p className="text-muted text-xs">{status ?? 'Creating your image…'}</p>
    </div>
  );
}

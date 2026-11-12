import { Cpu, Download, Wand2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { cn } from '../../lib/cn.js';
import { formatBytes } from '../../lib/format.js';
import {
  AUTO_CONVERT_MAX_BYTES,
  cachedConversion,
  cancelConversion,
  convertForPlayback,
  findStoredConversion,
  forgetConversion,
} from './browserConvert.js';
import { MediaPlayer } from './MediaPlayer.jsx';

// Plays a stored audio/video file with the least work for the server:
//   1. Native playback, straight from the stored file over HTTP Range.
//   2. If the browser can't decode it (AVI, WMV, MPEG-2, some MKV/MOV...), it
//      is converted on the viewer's device and played from memory. The result
//      is kept in Cache Storage, so the next open skips the conversion.

// Containers no mainstream browser plays; skip the native attempt for these
// unless this browser says it might (Safari plays AIFF, for example).
const NEVER_NATIVE = new Set([
  'avi',
  'wmv',
  'flv',
  'mpeg',
  'mpg',
  'm2v',
  'vob',
  'mxf',
  'wma',
  'amr',
  'ac3',
  'mka',
  'aif',
  'aiff',
]);

function needsConversionUpFront(file) {
  if (!NEVER_NATIVE.has(file.extension)) return false;
  const probe = document.createElement(file.mime.startsWith('audio/') ? 'audio' : 'video');
  return probe.canPlayType(file.mime) === '';
}

const PHASE_LABELS = {
  engine: 'Loading the converter',
  download: 'Fetching the file',
  analyse: 'Reading the file',
  convert: 'Converting on this device',
};

function ConversionProgress({ file, status, onCancel }) {
  const percent = Math.round((status?.progress ?? 0) * 100);
  const label = status?.remuxed ? 'Repackaging (no re-encode)' : PHASE_LABELS[status?.phase];
  return (
    <div className="bg-surface text-ink border-line shadow-lift mx-auto grid w-full max-w-xl place-items-center gap-4 rounded-3xl border px-6 py-10 text-center">
      <span className="bg-lavender/60 text-accent grid h-14 w-14 place-items-center rounded-2xl">
        <Cpu className="h-7 w-7 animate-pulse" aria-hidden="true" />
      </span>
      <div>
        <p className="font-medium">{label ?? 'Preparing'}…</p>
        <p className="text-muted mt-1 max-w-md text-sm">
          Your browser can&apos;t play .{file.extension} files directly, so it&apos;s being
          converted here on your device. Nothing is uploaded and the server does no extra work.
        </p>
      </div>
      <div className="w-full max-w-sm">
        <div
          className="bg-subtle h-2 overflow-hidden rounded-full"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="bg-accent h-full rounded-full transition-[width]"
            style={{ width: `${percent}%` }}
          />
        </div>
        <p className="text-muted mt-1.5 text-xs tabular-nums">{percent}%</p>
      </div>
      <Button variant="secondary" size="sm" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}

function ConvertOffer({ file, error, onConvert, onDownload }) {
  return (
    <div className="bg-surface text-ink border-line shadow-lift mx-auto grid w-full max-w-xl place-items-center gap-4 rounded-3xl border px-6 py-10 text-center">
      <span className="bg-lavender/60 text-accent grid h-14 w-14 place-items-center rounded-2xl">
        <Wand2 className="h-7 w-7" aria-hidden="true" />
      </span>
      <div>
        <p className="font-medium">This browser can&apos;t play .{file.extension} directly</p>
        <p className="text-muted mt-1 max-w-md text-sm">
          It can be converted for preview right here on your device ({formatBytes(file.size)} to
          fetch). Large or high-resolution files take a while. Downloading plays it in your own
          video app instead.
        </p>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      <div className="flex flex-wrap justify-center gap-2">
        <Button onClick={onConvert}>
          <Cpu className="h-4 w-4" aria-hidden="true" /> Convert on this device
        </Button>
        <Button variant="secondary" onClick={onDownload}>
          <Download className="h-4 w-4" aria-hidden="true" /> Download
        </Button>
      </div>
    </div>
  );
}

// After this many link renewals in a row without the file loading again, stop
// retrying and say so (the file is probably gone, or the network is down).
const RENEWAL_WINDOW_MS = 30 * 1000;

/**
 * url: a signed inline link. refreshUrl({ fresh }): resolves a link; fresh
 * skips any cached one (links expire).
 * onDownload(): starts a normal download of the original.
 * fill: sits on the dark full-screen viewer; the player fills its box.
 */
export function PlayableMedia({ file, url, refreshUrl, onDownload, fill = false }) {
  const kind = file.mime.startsWith('audio/') ? 'audio' : 'video';
  const [mode, setMode] = useState(() => {
    if (cachedConversion(file.id)) return 'converted';
    if (!needsConversionUpFront(file)) return 'native';
    return file.size <= AUTO_CONVERT_MAX_BYTES ? 'converting' : 'offer';
  });
  const [source, setSource] = useState(() => ({ url, startAt: 0 }));
  const [converted, setConverted] = useState(() => cachedConversion(file.id));
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const [noPicture, setNoPicture] = useState(false);
  const abortRef = useRef(null);
  const startsConverting = useRef(mode === 'converting');
  const lastRenewal = useRef(0);
  // Set once a conversion that copied the video stream failed to play: every
  // later attempt re-encodes instead.
  const mustReencode = useRef(false);

  // Only sets state after its first await, so it is safe to start from an effect.
  const startConversion = useCallback(async () => {
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const reencode = mustReencode.current;
      // Converted on an earlier visit: no need to fetch the original at all.
      const stored = reencode ? null : await findStoredConversion(file);
      if (controller.signal.aborted) return;
      if (stored) {
        setConverted(stored);
        setMode('converted');
        return;
      }
      const sourceUrl = await refreshUrl();
      const result = await convertForPlayback({
        file,
        sourceUrl,
        signal: controller.signal,
        onStatus: setStatus,
        reencode,
      });
      if (controller.signal.aborted) return;
      setConverted(result);
      setMode('converted');
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(err?.message || 'The conversion failed.');
      setMode('offer');
    }
  }, [file, refreshUrl]);

  const convert = useCallback(() => {
    setMode('converting');
    setError(null);
    setStatus(null);
    startConversion();
  }, [startConversion]);

  function cancel() {
    abortRef.current?.abort();
    cancelConversion();
    setMode('offer');
  }

  // Formats this browser can never play start converting as the preview opens
  // (small files only). Leaving the preview stops a conversion still running.
  useEffect(() => {
    let isCurrent = true;
    if (startsConverting.current) startConversion();
    // A file that needed converting before may already have a stored copy.
    else if (!cachedConversion(file.id)) {
      findStoredConversion(file).then((stored) => {
        if (!isCurrent || !stored) return;
        setConverted(stored);
        setMode('converted');
      });
    }
    return () => {
      isCurrent = false;
      if (abortRef.current && !abortRef.current.signal.aborted) {
        abortRef.current.abort();
        cancelConversion();
      }
    };
    // Runs once per opened file; the player is remounted for another file.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onIssue = useCallback(
    async (type, detail) => {
      if (type === 'no-picture') setNoPicture(true);
      // Small files convert straight away; big ones wait for a click.
      if (type === 'unsupported') {
        if (file.size <= AUTO_CONVERT_MAX_BYTES) convert();
        else setMode('offer');
      }
      // The same player element gets the new link and carries on from where it
      // was (still playing, still full screen), so the viewer barely notices.
      if (type === 'link-expired') {
        if (Date.now() - lastRenewal.current < RENEWAL_WINDOW_MS) {
          setError('The file stopped loading. Check your connection, then open it again.');
          return;
        }
        lastRenewal.current = Date.now();
        try {
          const fresh = await refreshUrl({ fresh: true });
          setSource({ url: fresh, startAt: detail?.time ?? 0 });
        } catch (err) {
          setError(err?.message ?? 'The file could not be reloaded.');
        }
      }
    },
    [refreshUrl, file.size, convert],
  );

  // The converted copy wouldn't play either. If its video was only repackaged
  // (common with iPhone HEVC .mov files, which browsers claim to support but
  // can't decode), re-encode it to H.264, which plays everywhere.
  function onConvertedIssue(type) {
    if (type !== 'unsupported' && type !== 'no-picture') return;
    if (converted?.videoCopied && !mustReencode.current) {
      mustReencode.current = true;
      setConverted(null);
      forgetConversion(file);
      convert();
      return;
    }
    if (type === 'unsupported') {
      setError("Even the converted copy wouldn't play here. Download the file to watch it.");
      setMode('offer');
    }
  }

  if (mode === 'converting')
    return <ConversionProgress file={file} status={status} onCancel={cancel} />;
  if (mode === 'offer') {
    return <ConvertOffer file={file} error={error} onConvert={convert} onDownload={onDownload} />;
  }

  const downloadExtra = { label: 'Download original', icon: Download, onSelect: onDownload };
  if (mode === 'converted' && converted) {
    return (
      <div className="space-y-3">
        <MediaPlayer
          key={converted.url}
          kind={kind}
          src={converted.url}
          title={file.name}
          onIssue={onConvertedIssue}
          menuExtras={[downloadExtra]}
          fill={fill}
        />
        <p
          className={cn(
            'flex items-center gap-1.5 text-xs',
            fill ? 'justify-center text-white/60' : 'text-muted',
          )}
        >
          <Cpu className="h-3.5 w-3.5" aria-hidden="true" />
          {converted.remuxed
            ? 'Repackaged on your device for playback. Original quality.'
            : 'Converted on your device for preview (up to 720p). Download for the original.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {noPicture && (
        <Alert tone="info">
          The picture in this file uses a format your browser can&apos;t show.{' '}
          <button type="button" className="font-medium underline" onClick={convert}>
            Convert on this device
          </button>
        </Alert>
      )}
      {error && <Alert tone="error">{error}</Alert>}
      <MediaPlayer
        kind={kind}
        src={source.url}
        startAt={source.startAt}
        title={file.name}
        onIssue={onIssue}
        menuExtras={[
          downloadExtra,
          { label: 'Not playing right? Convert', icon: Cpu, onSelect: convert },
        ]}
        fill={fill}
      />
    </div>
  );
}

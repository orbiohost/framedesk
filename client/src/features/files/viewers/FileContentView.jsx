import { Loader2 } from 'lucide-react';
import { useEffect, useId, useMemo, useState } from 'react';
import { Alert } from '../../../components/ui/Alert.jsx';
import { convertImage } from './convertImage.js';
import { imageDecoder, viewerKind } from './formats.js';

function Spinner({ label }) {
  return (
    <div className="grid aspect-video w-full max-w-[min(100%,calc((100dvh-9rem)*16/9))] place-items-center rounded-2xl bg-white/5">
      <div className="flex flex-col items-center gap-3 text-sm text-white/70">
        <Loader2 className="h-8 w-8 animate-spin text-white/60" aria-hidden="true" />
        {label}
      </div>
    </div>
  );
}

function Problem({ children }) {
  return (
    <div className="bg-surface text-ink w-full max-w-md rounded-2xl p-4">
      <Alert tone="error">{children}</Alert>
    </div>
  );
}

// Resolves a picture's src: the link itself, or a converted copy for HEIC,
// TIFF, PSD and RAW. { src, error }; src stays null while converting.
export function useViewableImageSrc(file, url) {
  const needsConversion = Boolean(imageDecoder(file));
  const [state, setState] = useState({ key: null, src: null, error: null });
  const key = `${file.id}:${file.version ?? 1}:${url}`;

  useEffect(() => {
    if (!needsConversion || !url) return undefined;
    let isCurrent = true;
    convertImage(file, url)
      .then((src) => isCurrent && setState({ key, src, error: null }))
      .catch(
        (error) =>
          isCurrent &&
          setState({ key, src: null, error: error?.message || 'This picture could not be shown' }),
      );
    return () => {
      isCurrent = false;
    };
  }, [needsConversion, key, file, url]);

  if (!needsConversion) return { src: url, error: null, converting: false };
  const fresh = state.key === key ? state : { src: null, error: null };
  return { src: fresh.src, error: fresh.error, converting: !fresh.src && !fresh.error };
}

function ImageView({ file, url }) {
  const { src, error, converting } = useViewableImageSrc(file, url);
  const [broken, setBroken] = useState(false);
  if (error || broken) {
    return <Problem>{error || 'This picture could not be shown. Download it to open it.'}</Problem>;
  }
  if (converting) return <Spinner label={`Opening ${file.extension.toUpperCase()} picture...`} />;
  return (
    <img
      src={src}
      alt={file.name}
      onError={() => setBroken(true)}
      className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
    />
  );
}

// --- Text

const MAX_TEXT_CHARS = 1_000_000;
const MAX_CSV_ROWS = 2000;

// RFC 4180-ish: quoted fields, doubled quotes, commas and newlines inside quotes.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length && rows.length < MAX_CSV_ROWS; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += char;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function CsvTable({ text }) {
  const rows = useMemo(() => parseCsv(text), [text]);
  const [header, ...body] = rows;
  if (!header) return <p className="text-muted p-6 text-sm">This file is empty.</p>;
  return (
    <table className="min-w-full border-collapse text-sm">
      <thead className="bg-subtle sticky top-0">
        <tr>
          {header.map((cell, index) => (
            <th key={index} className="border-line border-b px-3 py-2 text-left font-semibold">
              {cell}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {body.map((row, rowIndex) => (
          <tr key={rowIndex} className="border-line border-b last:border-0">
            {row.map((cell, index) => (
              <td key={index} className="whitespace-pre-wrap px-3 py-1.5 align-top">
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TextView({ file, url }) {
  const [state, setState] = useState({ url: null, text: null, truncated: false, error: null });

  useEffect(() => {
    let isCurrent = true;
    fetch(url, { mode: 'cors', credentials: 'same-origin', cache: 'no-store' })
      .then((response) => {
        if (!response.ok) throw new Error('The file could not be loaded');
        return response.text();
      })
      .then((text) => {
        if (!isCurrent) return;
        const truncated = text.length > MAX_TEXT_CHARS;
        setState({
          url,
          text: truncated ? text.slice(0, MAX_TEXT_CHARS) : text,
          truncated,
          error: null,
        });
      })
      .catch(
        (error) =>
          isCurrent && setState({ url, text: null, truncated: false, error: error.message }),
      );
    return () => {
      isCurrent = false;
    };
  }, [url]);

  if (state.url === url && state.error) return <Problem>{state.error}</Problem>;
  if (state.url !== url || state.text === null) return <Spinner />;
  const isCsv = file.extension.toLowerCase() === 'csv';
  return (
    <div className="bg-surface text-ink flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-xl shadow-2xl">
      {state.truncated && (
        <p className="bg-subtle text-muted px-4 py-2 text-xs">
          Showing the first part of a large file. Download it to see all of it.
        </p>
      )}
      <div className="min-h-0 flex-1 overflow-auto">
        {isCsv ? (
          <CsvTable text={state.text} />
        ) : (
          <pre className="whitespace-pre-wrap break-words p-5 font-mono text-[13px] leading-relaxed">
            {state.text || 'This file is empty.'}
          </pre>
        )}
      </div>
    </div>
  );
}

// --- Fonts

const FONT_SIZES = [14, 20, 32, 48, 72];
const PANGRAM = 'The quick brown fox jumps over the lazy dog';

function FontView({ url }) {
  const family = `preview-${useId().replace(/[^a-zA-Z0-9-]/g, '')}`;
  const [state, setState] = useState({ url: null, ready: false, error: null });
  const [sample, setSample] = useState(PANGRAM);

  useEffect(() => {
    let isCurrent = true;
    let face = null;
    fetch(url, { mode: 'cors', credentials: 'same-origin', cache: 'no-store' })
      .then((response) => {
        if (!response.ok) throw new Error('The font could not be loaded');
        return response.arrayBuffer();
      })
      .then((bytes) => {
        face = new FontFace(family, bytes);
        return face.load();
      })
      .then((loaded) => {
        if (!isCurrent) return;
        document.fonts.add(loaded);
        setState({ url, ready: true, error: null });
      })
      .catch(
        () =>
          isCurrent &&
          setState({
            url,
            ready: false,
            error: 'This font could not be shown. Download it to open it.',
          }),
      );
    return () => {
      isCurrent = false;
      if (face) document.fonts.delete(face);
    };
  }, [url, family]);

  if (state.url === url && state.error) return <Problem>{state.error}</Problem>;
  if (state.url !== url || !state.ready) return <Spinner />;
  return (
    <div className="bg-surface text-ink h-full w-full max-w-5xl overflow-auto rounded-xl p-6 shadow-2xl">
      <input
        value={sample}
        onChange={(event) => setSample(event.target.value)}
        aria-label="Sample text"
        placeholder="Type to try the font"
        className="border-line bg-subtle mb-6 w-full rounded-lg border px-3 py-2 text-sm transition-shadow focus-visible:border-accent/60 focus-visible:ring-[3px] focus-visible:ring-accent/15"
      />
      <p className="mb-6 break-words text-2xl" style={{ fontFamily: `"${family}"` }}>
        ABCDEFGHIJKLMNOPQRSTUVWXYZ
        <br />
        abcdefghijklmnopqrstuvwxyz
        <br />
        0123456789 !@#$%&amp;*()?.,;:
      </p>
      <div className="space-y-4">
        {FONT_SIZES.map((size) => (
          <div key={size}>
            <p className="text-muted text-xs tabular-nums">{size}px</p>
            <p
              className="break-words leading-tight"
              style={{ fontFamily: `"${family}"`, fontSize: size }}
            >
              {sample || PANGRAM}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Shows a previewable file that isn't video/audio: pictures (converting HEIC,
 * TIFF, PSD and RAW in the browser), text files, fonts, and PDFs in a frame.
 */
export function FileContentView({ file, url }) {
  const kind = viewerKind(file);
  if (kind === 'image') return <ImageView key={file.id} file={file} url={url} />;
  if (kind === 'text') return <TextView key={file.id} file={file} url={url} />;
  if (kind === 'font') return <FontView key={file.id} url={url} />;
  return (
    <iframe
      src={url}
      title={file.name}
      className="h-full w-full max-w-5xl rounded-xl border-0 bg-white shadow-2xl"
    />
  );
}

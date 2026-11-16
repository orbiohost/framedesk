import { AlertCircle, FileText, ImagePlus, RefreshCw, Sparkles, Trash2, Upload, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from '../../components/ui/Button.jsx';
import { cn } from '../../lib/cn.js';
import { PLATFORM_CONFIG, useExtractSocialImport, useSaveSocialImport } from './hooks.js';

// Where to find the numbers on each platform: a screenshot or an export.
export const IMPORT_TIPS = {
  instagram: [
    'Fastest: Meta Business Suite › Insights › Content › Export data (CSV) gives every post with reach, likes, comments, shares and saves.',
    'Or screenshot: your profile (followers), Professional dashboard › Content you shared, and "View insights" on your best posts.',
  ],
  facebook: ['Meta Business Suite › Insights › Content › Export data (CSV), or screenshots of each post’s insights.'],
  youtube: ['YouTube Studio › Analytics › Advanced mode › Content tab › Export current view › CSV.'],
  tiktok: ['TikTok Studio › Analytics › Content: screenshot the list, and the analytics page of your top videos.'],
  linkedin: [
    'Page › Analytics › Posts › Export (open the .xls and save it as CSV), or screenshot each post’s analytics.',
  ],
  twitter: ['Screenshot each post’s analytics (the bar-chart icon), or Analytics › Export data as CSV.'],
  whatsapp: ['Screenshot your channel updates showing views and reactions, and the channel info screen (followers).'],
};

const MAX_IMAGES = 8;
const MAX_TEXT = 400_000;

// Shrinks a screenshot so it uploads fast and stays readable for the AI.
function shrinkImage(file, maxSide = 1800) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`${file.name} is not an image this browser can open`));
    };
    img.src = url;
  });
}

const cellClass =
  'border-line bg-surface focus:border-accent w-full rounded-lg border px-2 py-1 text-xs tabular-nums focus:outline-none';
const METRICS = [
  ['views', 'Views'],
  ['reach', 'Reach'],
  ['likes', 'Likes'],
  ['comments', 'Comm.'],
  ['shares', 'Shares'],
  ['saves', 'Saves'],
];
const TYPES = ['reel', 'carousel', 'image', 'video', 'short', 'story', 'post', 'thread', 'broadcast'];

function toDateInput(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

/**
 * account: import into this existing account, or
 * newAccount: { platform, handle?, accountName? } to create one on save.
 */
export function SocialImportPanel({ workspaceId, account, newAccount, onDone, onBack }) {
  const platform = account?.platform ?? newAccount?.platform ?? 'instagram';
  const cfg = PLATFORM_CONFIG[platform];
  const fileInput = useRef(null);
  const [images, setImages] = useState([]); // { name, dataUrl }
  const [files, setFiles] = useState([]); // { name, text }
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState(null); // { profile, posts, notes }
  const [handle, setHandle] = useState(newAccount?.handle ?? '');
  const extract = useExtractSocialImport(workspaceId);
  const save = useSaveSocialImport(workspaceId);

  async function addFiles(list) {
    setError('');
    const nextImages = [...images];
    const nextFiles = [...files];
    for (const file of list) {
      try {
        if (file.type.startsWith('image/')) {
          if (nextImages.length >= MAX_IMAGES) {
            setError(`Up to ${MAX_IMAGES} screenshots at a time.`);
            continue;
          }
          nextImages.push({ name: file.name, dataUrl: await shrinkImage(file) });
        } else if (/\.(csv|tsv|txt|json)$/i.test(file.name) || file.type.startsWith('text/')) {
          nextFiles.push({ name: file.name, text: (await file.text()).slice(0, MAX_TEXT) });
        } else if (/\.xlsx?$/i.test(file.name)) {
          setError(`${file.name}: open it in Excel or Google Sheets and save as CSV, then add the CSV.`);
        } else {
          setError(`${file.name}: add screenshots (PNG/JPG) or a CSV file.`);
        }
      } catch (err) {
        setError(err.message);
      }
    }
    setImages(nextImages);
    setFiles(nextFiles);
  }

  async function read() {
    setError('');
    try {
      const result = await extract.mutateAsync({
        platform,
        images: images.map((image) => image.dataUrl),
        text: files.length ? files.map((file) => `# ${file.name}\n${file.text}`).join('\n\n') : undefined,
      });
      if (!result.posts.length && result.profile.followerCount === undefined) {
        setError(
          'The AI could not find any numbers in that. Try screenshots that show the stats, or a CSV export.',
        );
        return;
      }
      setPreview({ ...result, posts: result.posts.map((post, index) => ({ ...post, key: index, keep: true })) });
      if (!handle && result.profile.handle) setHandle(result.profile.handle);
    } catch (err) {
      setError(
        err?.code === 'AI_OFF'
          ? 'The AI assistant is switched off. An admin can turn it on in Admin › AI.'
          : err?.message || 'Could not read that.',
      );
    }
  }

  function setPost(key, field, value) {
    setPreview((prev) => ({
      ...prev,
      posts: prev.posts.map((post) => (post.key === key ? { ...post, [field]: value } : post)),
    }));
  }

  function setProfile(field, value) {
    setPreview((prev) => ({ ...prev, profile: { ...prev.profile, [field]: value } }));
  }

  async function handleSave() {
    setError('');
    const numberOrUndefined = (value) =>
      value === '' || value === undefined || value === null ? undefined : Number(value);
    const posts = preview.posts
      .filter((post) => post.keep && post.caption?.trim())
      .map((post) => {
        const out = { caption: post.caption.trim(), mediaType: post.mediaType };
        if (post.publishedAt) out.publishedAt = new Date(post.publishedAt).toISOString();
        if (post.permalink) out.permalink = post.permalink;
        for (const [field] of [...METRICS, ['clicks']]) {
          const n = numberOrUndefined(post[field]);
          if (n !== undefined && Number.isFinite(n)) out[field] = Math.max(0, Math.round(n));
        }
        return out;
      });
    const profile = {};
    for (const field of ['followerCount', 'followingCount', 'postCount']) {
      const n = numberOrUndefined(preview.profile[field]);
      if (n !== undefined && Number.isFinite(n)) profile[field] = n;
    }
    if (preview.profile.bio) profile.bio = preview.profile.bio;
    try {
      const result = await save.mutateAsync({
        ...(account
          ? { accountId: account.id }
          : {
              account: {
                platform,
                handle: handle.trim() || undefined,
                accountName: newAccount?.accountName || preview.profile.accountName || undefined,
              },
            }),
        profile,
        posts,
      });
      onDone?.(result);
    } catch (err) {
      setError(err?.message || 'Could not save the import.');
    }
  }

  const kept = preview?.posts.filter((post) => post.keep).length ?? 0;

  if (preview) {
    return (
      <div className="space-y-4">
        {error && (
          <div className="border-danger/30 bg-danger/10 text-danger flex items-center gap-2 rounded-xl border p-2.5 text-xs">
            <AlertCircle className="h-4 w-4 shrink-0" /> {error}
          </div>
        )}
        <div className="rounded-xl bg-emerald-500/10 p-3 text-xs text-emerald-900 dark:text-emerald-200">
          <strong>Check the numbers.</strong> The AI found {preview.posts.length} post
          {preview.posts.length === 1 ? '' : 's'}
          {preview.profile.followerCount !== undefined ? ' and your follower count' : ''}. Fix anything it misread, untick
          what you don&apos;t want, then save.
          {preview.notes && <span className="text-muted mt-1 block">{preview.notes}</span>}
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {!account && (
            <label className="text-[11px] font-semibold">
              Handle *
              <input value={handle} onChange={(e) => setHandle(e.target.value)} className={cellClass} />
            </label>
          )}
          <label className="text-[11px] font-semibold">
            {cfg.audienceLabel.split(' ')[0]}
            <input
              type="number"
              min="0"
              value={preview.profile.followerCount ?? ''}
              onChange={(e) => setProfile('followerCount', e.target.value)}
              className={cellClass}
            />
          </label>
          <label className="text-[11px] font-semibold">
            Following
            <input
              type="number"
              min="0"
              value={preview.profile.followingCount ?? ''}
              onChange={(e) => setProfile('followingCount', e.target.value)}
              className={cellClass}
            />
          </label>
          <label className="text-[11px] font-semibold">
            Total posts
            <input
              type="number"
              min="0"
              value={preview.profile.postCount ?? ''}
              onChange={(e) => setProfile('postCount', e.target.value)}
              className={cellClass}
            />
          </label>
        </div>

        <div className="border-line/70 max-h-[45vh] overflow-auto rounded-xl border">
          <table className="w-full min-w-[760px] text-xs">
            <thead className="bg-subtle/70 text-muted sticky top-0 text-left text-[10px] uppercase tracking-wider">
              <tr>
                <th className="w-8 p-2" />
                <th className="p-2">Post</th>
                <th className="w-24 p-2">Type</th>
                <th className="w-32 p-2">Date</th>
                {METRICS.map(([, label]) => (
                  <th key={label} className="w-20 p-2">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-line/50 divide-y">
              {preview.posts.map((post) => (
                <tr key={post.key} className={cn(!post.keep && 'opacity-40')}>
                  <td className="p-2 align-top">
                    <input
                      type="checkbox"
                      checked={post.keep}
                      onChange={(e) => setPost(post.key, 'keep', e.target.checked)}
                      aria-label="Keep this post"
                      className="accent-accent h-4 w-4"
                    />
                  </td>
                  <td className="p-2 align-top">
                    <textarea
                      rows={2}
                      value={post.caption}
                      onChange={(e) => setPost(post.key, 'caption', e.target.value)}
                      className={cn(cellClass, 'min-w-48 resize-y')}
                    />
                  </td>
                  <td className="p-2 align-top">
                    <select
                      value={post.mediaType}
                      onChange={(e) => setPost(post.key, 'mediaType', e.target.value)}
                      className={cellClass}
                    >
                      {TYPES.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="p-2 align-top">
                    <input
                      type="date"
                      value={toDateInput(post.publishedAt)}
                      onChange={(e) => setPost(post.key, 'publishedAt', e.target.value)}
                      className={cellClass}
                    />
                  </td>
                  {METRICS.map(([field]) => (
                    <td key={field} className="p-2 align-top">
                      <input
                        type="number"
                        min="0"
                        value={post[field] ?? ''}
                        onChange={(e) => setPost(post.key, field, e.target.value)}
                        placeholder="–"
                        className={cellClass}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setPreview(null)}
            className="text-muted hover:text-ink text-xs font-medium"
          >
            ← Add more screenshots
          </button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={save.isPending || (!account && !handle.trim())}
            className="pill-active gap-2 text-xs"
          >
            {save.isPending ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            Save {kept} post{kept === 1 ? '' : 's'}
            {account ? '' : ` to @${handle.replace(/^@/, '') || '…'}`}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="border-danger/30 bg-danger/10 text-danger flex items-center gap-2 rounded-xl border p-2.5 text-xs">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}
      <ul className="text-ink/85 space-y-1 text-xs">
        {(IMPORT_TIPS[platform] ?? []).map((tip) => (
          <li key={tip} className="flex gap-2">
            <span className="text-accent">•</span>
            <span>{tip}</span>
          </li>
        ))}
      </ul>

      <div
        role="button"
        tabIndex={0}
        onClick={() => fileInput.current?.click()}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') fileInput.current?.click();
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          addFiles([...event.dataTransfer.files]);
        }}
        onPaste={(event) => addFiles([...event.clipboardData.files])}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center transition-colors',
          dragging ? 'border-accent bg-accent/5' : 'border-line hover:bg-subtle/60',
        )}
      >
        <ImagePlus className="text-accent h-7 w-7" />
        <p className="mt-2 text-sm font-semibold">Drop screenshots or a CSV here</p>
        <p className="text-muted text-[11px]">
          Click to choose, or paste a screenshot (Ctrl+V). Up to {MAX_IMAGES} images.
        </p>
        <input
          ref={fileInput}
          type="file"
          multiple
          accept="image/*,.csv,.tsv,.txt,.json,.xls,.xlsx"
          className="hidden"
          onChange={(event) => {
            addFiles([...event.target.files]);
            event.target.value = '';
          }}
        />
      </div>

      {(images.length > 0 || files.length > 0) && (
        <div className="flex flex-wrap gap-2">
          {images.map((image, index) => (
            <div key={`${image.name}-${index}`} className="relative">
              <img src={image.dataUrl} alt={image.name} className="border-line h-20 w-20 rounded-xl border object-cover" />
              <button
                type="button"
                aria-label={`Remove ${image.name}`}
                onClick={() => setImages(images.filter((_, i) => i !== index))}
                className="bg-ink text-bg absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          {files.map((file, index) => (
            <span
              key={`${file.name}-${index}`}
              className="border-line bg-subtle/50 flex h-9 items-center gap-1.5 rounded-xl border px-2.5 text-xs"
            >
              <FileText className="h-3.5 w-3.5" /> {file.name}
              <button
                type="button"
                aria-label={`Remove ${file.name}`}
                onClick={() => setFiles(files.filter((_, i) => i !== index))}
                className="text-muted hover:text-danger"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        {onBack ? (
          <button type="button" onClick={onBack} className="text-muted hover:text-ink text-xs font-medium">
            ← Other ways to connect
          </button>
        ) : (
          <span />
        )}
        <Button
          type="button"
          onClick={read}
          disabled={extract.isPending || (!images.length && !files.length)}
          className="pill-active gap-2 text-xs"
        >
          <Sparkles className={cn('h-3.5 w-3.5', extract.isPending && 'animate-spin')} />
          {extract.isPending ? 'Reading your numbers…' : 'Read with AI'}
        </Button>
      </div>
    </div>
  );
}

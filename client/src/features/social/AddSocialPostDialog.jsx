import { AlertCircle, Plus, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../components/ui/Button.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { PLATFORM_CONFIG, useAddSocialPost } from './hooks.js';

const TYPES_BY_PLATFORM = {
  instagram: ['reel', 'carousel', 'image', 'story', 'video'],
  facebook: ['post', 'image', 'video', 'reel'],
  youtube: ['video', 'short'],
  tiktok: ['video'],
  linkedin: ['post', 'carousel', 'image', 'video'],
  twitter: ['post', 'thread', 'image', 'video'],
  whatsapp: ['broadcast', 'post', 'image', 'video'],
};

const inputClass =
  'border-line bg-surface focus:border-accent text-ink placeholder:text-muted/60 block w-full rounded-xl border px-3 py-2 text-sm focus:outline-none';

function today() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
}

// Adds one real post (copied from the platform's own analytics) to an account
// added by hand, so the AI has something to learn from.
export function AddSocialPostDialog({ workspaceId, account, open, onClose }) {
  if (!account) return null;
  const config = PLATFORM_CONFIG[account.platform];
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Add a post to ${config.name} @${account.handle}`}
      description="Copy the numbers from the post's insights on the app. The more posts you add, the better the AI's advice."
      wide="lg"
    >
      {open && (
        <PostForm key={account.id} workspaceId={workspaceId} account={account} onClose={onClose} />
      )}
    </Dialog>
  );
}

function PostForm({ workspaceId, account, onClose }) {
  const platform = account.platform;
  const types = TYPES_BY_PLATFORM[platform] ?? ['post'];
  const isWhatsApp = platform === 'whatsapp';
  const [form, setForm] = useState(() => ({ mediaType: types[0], publishedAt: today() }));
  const [error, setError] = useState('');
  const [added, setAdded] = useState(0);
  const addPost = useAddSocialPost(workspaceId);

  const set = (field) => (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }));
  const numberField = (field, label, hint) => (
    <label className="block">
      <span className="text-ink/80 mb-1 block text-xs font-semibold">{label}</span>
      <input
        type="number"
        min="0"
        inputMode="numeric"
        value={form[field] ?? ''}
        onChange={set(field)}
        placeholder={hint ?? '0'}
        className={inputClass}
      />
    </label>
  );

  async function submit(event, keepOpen) {
    event?.preventDefault();
    setError('');
    const body = {
      accountId: account.id,
      caption: (form.caption ?? '').trim(),
      title: form.title?.trim() || undefined,
      mediaType: form.mediaType,
      permalink: form.permalink?.trim() || undefined,
      publishedAt: form.publishedAt ? new Date(form.publishedAt).toISOString() : undefined,
    };
    for (const field of ['likes', 'comments', 'shares', 'saves', 'views', 'reach', 'clicks']) {
      if (form[field] !== undefined && form[field] !== '') body[field] = Number(form[field]);
    }
    try {
      await addPost.mutateAsync(body);
      setAdded((count) => count + 1);
      if (keepOpen) {
        setForm({ mediaType: form.mediaType, publishedAt: today() });
      } else {
        onClose();
      }
    } catch (err) {
      setError(err?.message || 'Could not add the post.');
    }
  }

  return (
    <form onSubmit={(event) => submit(event, false)} className="space-y-3 pt-1">
      {error && (
        <div className="border-danger/30 bg-danger/10 text-danger flex items-center gap-2 rounded-xl border p-2.5 text-xs">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {added > 0 && (
        <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
          {added} post{added === 1 ? '' : 's'} added.
        </p>
      )}
      <label className="block">
        <span className="text-ink/80 mb-1 block text-xs font-semibold">
          {isWhatsApp ? 'Message text' : 'Caption / post text'} *
        </span>
        <textarea
          required
          rows={4}
          value={form.caption ?? ''}
          onChange={set('caption')}
          placeholder={
            isWhatsApp ? 'Paste the message you sent' : 'Paste the caption, or describe the video'
          }
          className={inputClass}
        />
      </label>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="text-ink/80 mb-1 block text-xs font-semibold">Type</span>
          <select
            value={form.mediaType ?? types[0]}
            onChange={set('mediaType')}
            className={inputClass}
          >
            {types.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <label className="col-span-1 block sm:col-span-2">
          <span className="text-ink/80 mb-1 block text-xs font-semibold">Posted on</span>
          <input
            type="datetime-local"
            value={form.publishedAt ?? ''}
            onChange={set('publishedAt')}
            className={inputClass}
          />
        </label>
        {numberField('views', isWhatsApp ? 'Views / delivered' : 'Views / impressions')}
        {!isWhatsApp && numberField('reach', 'Reach (accounts)')}
        {numberField('likes', isWhatsApp ? 'Reactions' : 'Likes')}
        {numberField('comments', isWhatsApp ? 'Replies' : 'Comments')}
        {numberField('shares', isWhatsApp ? 'Forwards' : 'Shares / reposts')}
        {!isWhatsApp && numberField('saves', 'Saves')}
        {numberField('clicks', 'Link clicks')}
      </div>
      <label className="block">
        <span className="text-ink/80 mb-1 block text-xs font-semibold">Link to the post</span>
        <input
          type="url"
          value={form.permalink ?? ''}
          onChange={set('permalink')}
          placeholder="https://"
          className={inputClass}
        />
      </label>
      <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={onClose} className="text-xs">
          Done
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={addPost.isPending || !(form.caption ?? '').trim()}
          onClick={(event) => submit(event, true)}
          className="text-xs"
        >
          Save &amp; add another
        </Button>
        <Button type="submit" disabled={addPost.isPending} className="pill-active gap-2 text-xs">
          {addPost.isPending ? (
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plus className="h-3.5 w-3.5" />
          )}
          Save post
        </Button>
      </div>
    </form>
  );
}

import { formatDistanceToNow } from 'date-fns';
import {
  AlertTriangle,
  Calendar,
  ExternalLink,
  LogIn,
  PenLine,
  Plus,
  RefreshCw,
  Share2,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../components/ui/Button.jsx';
import { cn } from '../../lib/cn.js';
import { SOCIAL_PLATFORMS } from './socialPlatforms.js';
import {
  PLATFORM_CONFIG,
  useDisconnectSocialAccount,
  useSocialProviders,
  useStartSocialOAuth,
  useSyncSocialAccount,
  useUpdateSocialAccount,
} from './hooks.js';

function StatusPill({ account }) {
  if (account.status === 'reconnect') {
    return (
      <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
        <AlertTriangle className="h-3 w-3" /> Log in again
      </span>
    );
  }
  if (account.status === 'error') {
    return (
      <span className="text-danger flex items-center gap-1 text-[11px] font-semibold">
        <AlertTriangle className="h-3 w-3" /> Sync failed
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
      {account.connection === 'oauth' ? 'Linked' : account.connection === 'public' ? 'Public link' : 'Added by hand'}
    </span>
  );
}

function Avatar({ account }) {
  const cfg = PLATFORM_CONFIG[account.platform] || PLATFORM_CONFIG.instagram;
  const [broken, setBroken] = useState(false);
  if (account.avatarUrl && !broken) {
    return (
      <img
        src={account.avatarUrl}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
        className="h-10 w-10 shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <span
      className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-bold', cfg.badge)}
    >
      {(account.accountName || account.handle || '?').slice(0, 1).toUpperCase()}
    </span>
  );
}

function EditStats({ workspaceId, account, onDone }) {
  const update = useUpdateSocialAccount(workspaceId);
  const [followers, setFollowers] = useState(String(account.followerCount ?? 0));
  const [goal, setGoal] = useState(account.goal ?? '');
  const [category, setCategory] = useState(account.category ?? '');
  const manual = account.connection === 'manual';
  const inputClass =
    'border-line bg-surface focus:border-accent block w-full rounded-lg border px-2.5 py-1.5 text-xs focus:outline-none';

  async function save(event) {
    event.preventDefault();
    await update.mutateAsync({
      accountId: account.id,
      goal,
      category,
      ...(manual ? { followerCount: Number(followers) || 0 } : {}),
    });
    onDone();
  }

  return (
    <form onSubmit={save} className="bg-subtle/50 mt-3 space-y-2 rounded-xl p-2.5">
      {manual && (
        <label className="block text-[11px] font-semibold">
          Followers now
          <input
            type="number"
            min="0"
            value={followers}
            onChange={(e) => setFollowers(e.target.value)}
            className={inputClass}
          />
        </label>
      )}
      <label className="block text-[11px] font-semibold">
        Niche
        <input value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass} />
      </label>
      <label className="block text-[11px] font-semibold">
        Goal (steers the AI)
        <input
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="e.g. get wedding film inquiries"
          className={inputClass}
        />
      </label>
      {update.error && <p className="text-danger text-[11px]">{update.error.message}</p>}
      <div className="flex justify-end gap-1.5">
        <Button type="button" variant="ghost" size="sm" onClick={onDone} className="text-xs">
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={update.isPending} className="pill-active text-xs">
          Save
        </Button>
      </div>
    </form>
  );
}

export function SocialPlatformsTab({ workspaceId, accounts = [], manager, onOpenConnect, onAddPost, onImport }) {
  const syncMutation = useSyncSocialAccount(workspaceId);
  const disconnectMutation = useDisconnectSocialAccount(workspaceId);
  const startOAuth = useStartSocialOAuth(workspaceId);
  const { data: providers } = useSocialProviders(workspaceId);
  const [syncingId, setSyncingId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [errors, setErrors] = useState({});

  async function handleSync(id) {
    setSyncingId(id);
    setErrors((prev) => ({ ...prev, [id]: null }));
    try {
      await syncMutation.mutateAsync(id);
    } catch (err) {
      setErrors((prev) => ({ ...prev, [id]: err?.message || 'Sync failed' }));
    } finally {
      setSyncingId(null);
    }
  }

  async function handleDisconnect(id, name) {
    if (!window.confirm(`Remove ${name}? Its synced posts and stats are deleted from FrameDesk.`)) return;
    await disconnectMutation.mutateAsync(id);
  }

  const connectedPlatforms = new Set(accounts.map((a) => a.platform));
  const availableToConnect = SOCIAL_PLATFORMS.filter((p) => !connectedPlatforms.has(p.id));

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3">
          <div>
            <h3 className="font-display text-sm font-semibold">Connected accounts ({accounts.length})</h3>
            <p className="text-muted text-xs">
              Linked accounts sync by themselves every 12 hours. Press Sync for the latest numbers now.
            </p>
          </div>
          {manager && (
            <Button type="button" onClick={() => onOpenConnect()} className="pill-active gap-1.5 text-xs">
              <Plus className="h-3.5 w-3.5" /> Connect account
            </Button>
          )}
        </div>

        {accounts.length === 0 ? (
          <div className="border-line/70 bg-surface/80 rounded-2xl border p-10 text-center">
            <Share2 className="text-muted mx-auto h-8 w-8" />
            <h4 className="font-display mt-2 text-sm font-semibold">No accounts connected yet</h4>
            <p className="text-muted mt-1 text-xs">
              Link Instagram, YouTube, Facebook or TikTok by logging in, or add any account by hand.
            </p>
            {manager && (
              <Button type="button" onClick={() => onOpenConnect()} className="pill-active mt-4 text-xs">
                Connect your first account
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {accounts.map((account) => {
              const cfg = PLATFORM_CONFIG[account.platform] || PLATFORM_CONFIG.instagram;
              const isSyncing = syncingId === account.id;
              const linked = account.connection !== 'manual';
              const canRelogin = account.connection === 'oauth' && providers?.[account.platform]?.oauth;
              const error = errors[account.id] || (account.status !== 'connected' ? account.statusMessage : null);
              return (
                <div
                  key={account.id}
                  className={cn(
                    'bg-surface/90 shadow-soft flex flex-col justify-between rounded-2xl border p-4',
                    account.status === 'reconnect' ? 'border-amber-500/40' : 'border-line/70',
                  )}
                >
                  <div>
                    <div className="flex items-center justify-between pb-2">
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                          cfg.bgLight,
                        )}
                      >
                        {cfg.name}
                      </span>
                      <StatusPill account={account} />
                    </div>

                    <div className="mt-1 flex items-center gap-3">
                      <Avatar account={account} />
                      <div className="min-w-0">
                        <h4 className="font-display line-clamp-1 text-sm font-bold">{account.accountName}</h4>
                        <div className="text-muted flex items-center gap-1 text-xs">
                          <span className="truncate">
                            {cfg.handlePrefix}
                            {account.handle}
                          </span>
                          {account.profileUrl && (
                            <a
                              href={account.profileUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="hover:text-ink shrink-0"
                              aria-label="Open profile"
                            >
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="bg-subtle/50 mt-3 grid grid-cols-3 gap-2 rounded-xl p-2.5 text-xs">
                      <div>
                        <span className="text-muted block text-[10px]">{cfg.audienceLabel.split(' ')[0]}</span>
                        <span className="font-semibold tabular-nums">
                          {(account.followerCount || 0).toLocaleString()}
                        </span>
                        {account.followerGrowth30d !== null && account.followerGrowth30d !== undefined && (
                          <span
                            className={cn(
                              'block text-[10px] font-semibold',
                              account.followerGrowth30d >= 0 ? 'text-emerald-600' : 'text-danger',
                            )}
                          >
                            {account.followerGrowth30d >= 0 ? '+' : ''}
                            {account.followerGrowth30d}% / 30d
                          </span>
                        )}
                      </div>
                      <div>
                        <span className="text-muted block text-[10px]">Engagement</span>
                        <span className="text-accent font-semibold tabular-nums">{account.engagementRate || 0}%</span>
                      </div>
                      <div>
                        <span className="text-muted block text-[10px]">Posts</span>
                        <span className="font-semibold tabular-nums">{(account.postCount || 0).toLocaleString()}</span>
                      </div>
                    </div>

                    {error && (
                      <p
                        className={cn(
                          'mt-2 rounded-lg px-2 py-1.5 text-[11px]',
                          account.status === 'reconnect'
                            ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
                            : 'bg-danger/10 text-danger',
                        )}
                      >
                        {error}
                      </p>
                    )}

                    <div className="text-muted mt-2.5 flex items-center gap-1.5 text-[11px]">
                      <Calendar className="h-3 w-3" />
                      <span>
                        {linked ? 'Synced' : 'Updated'}{' '}
                        {formatDistanceToNow(new Date(account.lastSyncedAt || account.updatedAt), { addSuffix: true })}
                      </span>
                    </div>

                    {editingId === account.id && (
                      <EditStats workspaceId={workspaceId} account={account} onDone={() => setEditingId(null)} />
                    )}
                  </div>

                  {manager && (
                    <div className="border-line/50 mt-4 flex flex-wrap items-center justify-between gap-1 border-t pt-3">
                      <div className="flex flex-wrap items-center gap-1">
                        {account.status === 'reconnect' && canRelogin ? (
                          <button
                            type="button"
                            onClick={() => startOAuth.mutate(account.platform)}
                            disabled={startOAuth.isPending}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-500/20 dark:text-amber-300"
                          >
                            <LogIn className="h-3.5 w-3.5" /> Log in again
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleSync(account.id)}
                            disabled={isSyncing}
                            className="text-ink/80 hover:bg-subtle hover:text-ink inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium"
                          >
                            <RefreshCw className={cn('h-3.5 w-3.5', isSyncing && 'animate-spin')} />
                            {isSyncing ? 'Syncing…' : linked ? 'Sync' : 'Recalculate'}
                          </button>
                        )}
                        {!linked && (
                          <button
                            type="button"
                            onClick={() => onImport(account)}
                            className="text-accent hover:bg-subtle inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold"
                          >
                            <Sparkles className="h-3.5 w-3.5" /> Import with AI
                          </button>
                        )}
                        {!linked && (
                          <button
                            type="button"
                            onClick={() => onAddPost(account)}
                            className="text-accent hover:bg-subtle inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold"
                          >
                            <Plus className="h-3.5 w-3.5" /> Add post
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setEditingId(editingId === account.id ? null : account.id)}
                          className="text-muted hover:bg-subtle hover:text-ink inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs"
                        >
                          <PenLine className="h-3.5 w-3.5" /> Edit
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDisconnect(account.id, account.accountName)}
                        className="text-muted hover:bg-danger/10 hover:text-danger inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Remove
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {manager && availableToConnect.length > 0 && (
        <div className="border-line/70 bg-surface/90 shadow-soft rounded-2xl border p-5">
          <h3 className="font-display text-sm font-semibold">More platforms</h3>
          <p className="text-muted text-xs">Add every channel you post on for a full picture of your audience.</p>
          <div className="mt-3.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {availableToConnect.map((item) => {
              const Icon = item.icon;
              const live =
                (item.login && providers?.[item.id]?.oauth) ||
                (item.id === 'youtube' && providers?.youtubePublic?.enabled);
              return (
                <div
                  key={item.id}
                  className="border-line/60 bg-subtle/30 hover:bg-subtle/70 flex items-center justify-between rounded-xl border p-3"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="bg-surface shadow-soft grid h-8 w-8 place-items-center rounded-lg">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div>
                      <span className="block text-xs font-semibold">{item.label}</span>
                      <span className="text-muted text-[10px]">{live ? 'Log in to link' : 'Import with AI'}</span>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onOpenConnect(item.id)}
                    className="text-accent text-xs font-semibold"
                  >
                    Connect
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

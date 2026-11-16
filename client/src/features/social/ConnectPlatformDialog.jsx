import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  Link2,
  Lock,
  LogIn,
  PenLine,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/Button.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { cn } from '../../lib/cn.js';
import { useCurrentUser } from '../auth/hooks.js';
import {
  PLATFORM_CONFIG,
  useConnectSocialAccount,
  useCreatePublicAccount,
  useSocialLookup,
  useSocialProviders,
  useStartSocialOAuth,
} from './hooks.js';
import { SocialImportPanel } from './SocialImportPanel.jsx';
import { SOCIAL_PLATFORMS } from './socialPlatforms.js';

const NICHES = [
  'Creative studio & video production',
  'Content creator & personal brand',
  'Technology, SaaS & AI',
  'E-commerce & D2C',
  'Marketing agency & B2B services',
  'Fitness, health & wellness',
  'Education, media & news',
  'Real estate & architecture',
  'Food, travel & lifestyle',
];

const GOALS = [
  'Get client inquiries and leads',
  'Grow reach and followers',
  'Build community and engagement',
  'Drive sales and website clicks',
];

const inputClass =
  'border-line bg-surface focus:border-accent text-ink placeholder:text-muted/60 block w-full rounded-xl border px-3 py-2 text-sm focus:outline-none';

function ErrorBox({ children }) {
  if (!children) return null;
  return (
    <div className="border-danger/30 bg-danger/10 text-danger flex items-center gap-2 rounded-xl border p-2.5 text-xs">
      <AlertCircle className="h-4 w-4 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

function ManualForm({ workspaceId, platform, initialHandle, onDone }) {
  const config = PLATFORM_CONFIG[platform.id];
  const [handle, setHandle] = useState(initialHandle ?? '');
  const [accountName, setAccountName] = useState('');
  const [followerCount, setFollowerCount] = useState('');
  const [category, setCategory] = useState('');
  const [goal, setGoal] = useState(GOALS[0]);
  const [error, setError] = useState('');
  const create = useConnectSocialAccount(workspaceId);

  async function submit(event) {
    event.preventDefault();
    setError('');
    try {
      const account = await create.mutateAsync({
        platform: platform.id,
        handle: handle.trim(),
        accountName: accountName.trim() || undefined,
        followerCount: followerCount === '' ? undefined : Number(followerCount),
        category: category.trim() || undefined,
        goal,
      });
      onDone(account);
    } catch (err) {
      setError(err?.message || 'Could not add the account. Please try again.');
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <ErrorBox>{error}</ErrorBox>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-ink/80 mb-1 block text-xs font-semibold">
            {platform.id === 'whatsapp' ? 'Channel name or business number' : 'Handle / username'} *
          </span>
          <input
            required
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder={platform.id === 'whatsapp' ? 'e.g. Studio Updates' : `@${config.placeholder}`}
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="text-ink/80 mb-1 block text-xs font-semibold">Display name</span>
          <input
            value={accountName}
            onChange={(e) => setAccountName(e.target.value)}
            placeholder="How it shows in your dashboard"
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="text-ink/80 mb-1 block text-xs font-semibold">{config.audienceLabel} right now</span>
          <input
            type="number"
            min="0"
            inputMode="numeric"
            value={followerCount}
            onChange={(e) => setFollowerCount(e.target.value)}
            placeholder="e.g. 2450"
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="text-ink/80 mb-1 block text-xs font-semibold">Niche</span>
          <input
            list="social-niches"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Pick or type your own"
            className={inputClass}
          />
          <datalist id="social-niches">
            {NICHES.map((niche) => (
              <option key={niche} value={niche} />
            ))}
          </datalist>
        </label>
        <label className="block sm:col-span-2">
          <span className="text-ink/80 mb-1 block text-xs font-semibold">Main goal for this channel</span>
          <select value={goal} onChange={(e) => setGoal(e.target.value)} className={inputClass}>
            {GOALS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex justify-end pt-1">
        <Button type="submit" disabled={create.isPending} className="pill-active gap-2 text-xs">
          {create.isPending ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <PenLine className="h-3.5 w-3.5" />}
          {create.isPending ? 'Adding…' : `Add ${platform.label} account`}
        </Button>
      </div>
    </form>
  );
}

function MethodCard({ icon: Icon, title, badge, children, disabled, onClick, action, tone = 'default' }) {
  return (
    <div
      className={cn(
        'rounded-2xl border p-4',
        disabled ? 'border-line/50 bg-subtle/30' : 'border-line/70 bg-surface/90 shadow-soft',
        tone === 'primary' && !disabled && 'border-accent/50 ring-accent/30 ring-1',
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'grid h-9 w-9 shrink-0 place-items-center rounded-xl',
            disabled ? 'bg-subtle text-muted' : 'bg-lavender text-accent dark:text-ink',
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className={cn('text-sm font-semibold', disabled && 'text-muted')}>{title}</h4>
            {badge && (
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[10px] font-bold',
                  disabled ? 'bg-subtle text-muted' : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
                )}
              >
                {badge}
              </span>
            )}
          </div>
          <div className="text-muted mt-0.5 text-xs">{children}</div>
        </div>
        {onClick && !disabled && (
          <Button type="button" size="sm" onClick={onClick} className="pill-active shrink-0 gap-1 text-xs">
            {action} <ArrowRight className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  );
}

export function ConnectPlatformDialog({ workspaceId, open, onClose, defaultPlatform = null, onManualCreated, onConnected }) {
  // start: paste a link or pick a platform. choose: the ways to connect.
  // import / manual: the chosen way.
  const [step, setStep] = useState(defaultPlatform ? 'choose' : 'start');
  const [platformId, setPlatformId] = useState(defaultPlatform ?? 'instagram');
  const [input, setInput] = useState('');
  const [found, setFound] = useState(null);
  const [error, setError] = useState('');
  const [youtubeInput, setYoutubeInput] = useState('');

  const { data: providers } = useSocialProviders(workspaceId);
  const { data: user } = useCurrentUser();
  const lookup = useSocialLookup(workspaceId);
  const startOAuth = useStartSocialOAuth(workspaceId);
  const addPublic = useCreatePublicAccount(workspaceId);

  const platform = SOCIAL_PLATFORMS.find((item) => item.id === platformId) ?? SOCIAL_PLATFORMS[0];
  const config = PLATFORM_CONFIG[platform.id];
  const handle = found?.platform === platform.id ? found.handle : null;
  const loginReady = platform.login && Boolean(providers?.[platform.id]?.oauth);
  const publicReady = platform.id === 'youtube' && Boolean(providers?.youtubePublic?.enabled);
  const redirecting = startOAuth.isPending || startOAuth.isSuccess;

  function pickPlatform(id) {
    setPlatformId(id);
    setFound(null);
    setError('');
    setStep('choose');
  }

  async function handleFind(event) {
    event.preventDefault();
    setError('');
    try {
      const result = await lookup.mutateAsync({ input: input.trim() });
      setFound(result);
      setPlatformId(result.platform);
      if (result.platform === 'youtube') setYoutubeInput(input.trim());
      setStep('choose');
    } catch (err) {
      setError(
        err?.code === 'PLATFORM_UNKNOWN'
          ? 'Not sure which platform that is. Paste the full profile link, or pick the platform below.'
          : err?.message || 'Could not read that link.',
      );
    }
  }

  async function handleLogin() {
    setError('');
    try {
      await startOAuth.mutateAsync(platform.id);
    } catch (err) {
      setError(err?.message || `Could not start the ${platform.label} login.`);
    }
  }

  async function handlePublic() {
    setError('');
    try {
      const account = await addPublic.mutateAsync({ input: youtubeInput.trim() || handle || '' });
      onClose();
      onConnected?.(account);
    } catch (err) {
      setError(err?.message || 'Could not add that channel.');
    }
  }

  const notSetUp = user?.isSuperadmin ? (
    <>
      Not switched on yet.{' '}
      <Link to="/admin/social" className="text-accent font-semibold hover:underline" onClick={onClose}>
        Set it up in Admin › Social apps
      </Link>
      .
    </>
  ) : (
    'Not switched on for this FrameDesk yet. Ask your admin to set it up, or use another way below.'
  );

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!redirecting) onClose();
      }}
      title={
        step === 'start'
          ? 'Connect a social account'
          : `Connect ${platform.label}${handle ? ` @${handle.replace(/^@/, '')}` : ''}`
      }
      description={
        step === 'start'
          ? 'Paste your profile link, or pick the platform.'
          : step === 'import'
            ? 'Screenshots or an exported file: the AI reads the numbers, you check them.'
            : 'Pick how you want to bring it in. You can switch later.'
      }
      wide="xl"
    >
      <div className="space-y-4 pt-1">
        <ErrorBox>{error}</ErrorBox>

        {step === 'start' && (
          <>
            <form onSubmit={handleFind} className="flex gap-2">
              <div className="relative flex-1">
                <Link2 className="text-muted pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
                <input
                  autoFocus
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="instagram.com/yourstudio, youtube.com/@channel, tiktok.com/@you…"
                  className={cn(inputClass, 'py-2.5 pl-9')}
                />
              </div>
              <Button type="submit" disabled={!input.trim() || lookup.isPending} className="pill-active gap-1.5">
                {lookup.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Continue
              </Button>
            </form>
            <div>
              <p className="text-muted mb-2 text-xs font-medium">Or pick a platform</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
                {SOCIAL_PLATFORMS.map((item) => {
                  const Icon = item.icon;
                  const live =
                    (item.login && providers?.[item.id]?.oauth) ||
                    (item.id === 'youtube' && providers?.youtubePublic?.enabled);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => pickPlatform(item.id)}
                      className="border-line/70 hover:bg-subtle hover:border-line bg-surface flex flex-col items-start rounded-2xl border p-2.5 text-left"
                    >
                      <Icon className="h-4 w-4" />
                      <span className="mt-1.5 text-xs font-semibold">{item.label}</span>
                      <span
                        className={cn(
                          'mt-0.5 text-[10px] font-medium',
                          live ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted',
                        )}
                      >
                        {live ? 'Auto-sync' : 'Import with AI'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {step === 'choose' && (
          <>
            {found?.existingAccountId && (
              <div className="bg-subtle/60 rounded-xl p-2.5 text-xs">
                @{handle} is already in this workspace. Connecting again updates it.
              </div>
            )}

            {platform.login && (
              <MethodCard
                icon={LogIn}
                title={`Log in with ${platform.label}`}
                badge={loginReady ? 'Best · syncs by itself' : 'Not set up'}
                disabled={!loginReady}
                tone="primary"
                onClick={handleLogin}
                action={redirecting ? 'Opening…' : 'Log in'}
              >
                {loginReady ? (
                  <>
                    <span className="block">{platform.needs[0]}</span>
                    <span className="mt-1 flex items-center gap-1">
                      <ShieldCheck className="h-3 w-3 text-emerald-600" /> Read-only. We never post for you or see your
                      password.
                    </span>
                  </>
                ) : (
                  notSetUp
                )}
              </MethodCard>
            )}

            {platform.id === 'youtube' && (
              <MethodCard
                icon={Link2}
                title="Add from the channel link"
                badge={publicReady ? 'No login' : 'Not set up'}
                disabled={!publicReady}
              >
                {publicReady ? (
                  <div className="mt-2 space-y-2">
                    {found?.preview && (
                      <div className="bg-subtle/60 flex items-center gap-2.5 rounded-xl p-2">
                        {found.preview.avatarUrl && (
                          <img
                            src={found.preview.avatarUrl}
                            alt=""
                            referrerPolicy="no-referrer"
                            className="h-9 w-9 rounded-full object-cover"
                          />
                        )}
                        <div className="text-ink min-w-0">
                          <span className="block truncate text-xs font-semibold">{found.preview.accountName}</span>
                          <span className="text-muted text-[11px]">
                            {(found.preview.followerCount || 0).toLocaleString()} subscribers ·{' '}
                            {(found.preview.postCount || 0).toLocaleString()} videos
                          </span>
                        </div>
                        <Check className="ml-auto h-4 w-4 text-emerald-600" />
                      </div>
                    )}
                    {found?.previewError && <p className="text-danger text-[11px]">{found.previewError}</p>}
                    <div className="flex gap-2">
                      <input
                        value={youtubeInput}
                        onChange={(e) => setYoutubeInput(e.target.value)}
                        placeholder="youtube.com/@yourchannel"
                        className={cn(inputClass, 'py-1.5 text-xs')}
                      />
                      <Button
                        type="button"
                        size="sm"
                        onClick={handlePublic}
                        disabled={addPublic.isPending || !(youtubeInput.trim() || handle)}
                        className="pill-active shrink-0 text-xs"
                      >
                        {addPublic.isPending ? 'Adding…' : 'Add channel'}
                      </Button>
                    </div>
                    <span className="block text-[11px]">
                      Public numbers only: views, likes and comments on every video. Syncs by itself.
                    </span>
                  </div>
                ) : (
                  'Needs a YouTube API key in Admin › Social apps.'
                )}
              </MethodCard>
            )}

            <MethodCard
              icon={Sparkles}
              title="Import with AI"
              badge="Works for every platform"
              onClick={() => setStep('import')}
              action="Import"
            >
              Upload screenshots of your stats or an exported CSV. AI reads the followers and every post&apos;s
              numbers; you check them before saving. No developer setup.
            </MethodCard>

            <MethodCard icon={PenLine} title="Type the numbers in" onClick={() => setStep('manual')} action="Add">
              {platform.manualReason ?? 'Enter the follower count now and add posts one by one later.'}
            </MethodCard>

            <button
              type="button"
              onClick={() => {
                setStep('start');
                setFound(null);
                setError('');
              }}
              className="text-muted hover:text-ink inline-flex items-center gap-1 text-xs font-medium"
            >
              <ArrowLeft className="h-3 w-3" /> Different account or platform
            </button>
          </>
        )}

        {step === 'import' && (
          <SocialImportPanel
            workspaceId={workspaceId}
            newAccount={{ platform: platform.id, handle: handle ? handle.replace(/^@/, '') : '' }}
            onBack={() => setStep('choose')}
            onDone={(result) => {
              onClose();
              onConnected?.(result.account, result);
            }}
          />
        )}

        {step === 'manual' && (
          <>
            {platform.login && !loginReady && (
              <div className="flex gap-2 rounded-xl border border-amber-500/25 bg-amber-500/5 p-2.5 text-[11px]">
                <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                <span className="text-muted">
                  Tip: <strong className="text-ink">Import with AI</strong> fills in all your posts from a few
                  screenshots.
                </span>
              </div>
            )}
            <ManualForm
              workspaceId={workspaceId}
              platform={platform}
              initialHandle={handle ? handle.replace(/^@/, '') : ''}
              onDone={(account) => {
                onClose();
                onManualCreated?.(account);
              }}
            />
            <button
              type="button"
              onClick={() => setStep('choose')}
              className="text-muted hover:text-ink inline-flex items-center gap-1 text-xs font-medium"
            >
              <ArrowLeft className="h-3 w-3" /> Other ways to connect
            </button>
          </>
        )}

        {step !== 'start' && (
          <p className="text-muted border-line/50 flex items-center gap-1.5 border-t pt-3 text-[11px]">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: config.color }} />
            Whichever way you choose, AI Strategy analyses the posts and tells you what to post next.{' '}
            <Link to="/privacy#social" target="_blank" className="hover:text-ink underline">
              How we use your data
            </Link>
          </p>
        )}
      </div>
    </Dialog>
  );
}

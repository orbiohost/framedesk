import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Clock,
  Eye,
  Flame,
  Plus,
  Share2,
  Sparkles,
  TrendingUp,
  Users,
} from 'lucide-react';
import { Button } from '../../components/ui/Button.jsx';
import { cn } from '../../lib/cn.js';
import { PLATFORM_CONFIG } from './hooks.js';

function Growth({ value, label }) {
  if (value === null || value === undefined) {
    return <span className="text-muted text-[10px] font-medium">{label ?? 'tracking…'}</span>;
  }
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-1.5 text-[10px] font-bold',
        value >= 0
          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
          : 'bg-danger/10 text-danger',
      )}
    >
      {value >= 0 ? '+' : ''}
      {value}%
    </span>
  );
}

function StatCard({ label, icon: Icon, value, accent, badge, foot }) {
  return (
    <div className="border-line/70 bg-surface/90 shadow-soft rounded-2xl border p-4">
      <div className="text-muted flex items-center justify-between text-xs">
        <span className="font-medium">{label}</span>
        <Icon className="h-4 w-4" />
      </div>
      <div className="mt-2 flex flex-wrap items-baseline gap-2">
        <span className={cn('font-display text-2xl font-bold tabular-nums', accent && 'text-accent')}>{value}</span>
        {badge}
      </div>
      <span className="text-muted mt-1 block text-[11px]">{foot}</span>
    </div>
  );
}

export function SocialOverviewTab({ analytics, accounts, manager, onOpenConnect, onSelectTab }) {
  const platformBreakdown = analytics?.platformBreakdown || [];
  const bestTimes = analytics?.bestTimes || [];
  const formatBreakdown = analytics?.formatBreakdown || [];
  const topPosts = analytics?.topPosts || [];

  if (!accounts?.length) {
    return (
      <div className="border-line/70 bg-surface/90 shadow-soft rounded-2xl border p-10 text-center">
        <span className="bg-lavender text-accent dark:text-ink mx-auto grid h-12 w-12 place-items-center rounded-2xl">
          <Share2 className="h-6 w-6" />
        </span>
        <h3 className="font-display mt-3 text-base font-semibold">Connect your first account</h3>
        <p className="text-muted mx-auto mt-1 max-w-md text-xs">
          Log in with Instagram, YouTube, Facebook or TikTok (or add any account by hand). Your real
          posts and numbers show up here, and the AI tells you what to post next.
        </p>
        {manager && (
          <Button type="button" onClick={() => onOpenConnect()} className="pill-active mt-4 gap-1.5 text-xs">
            <Plus className="h-3.5 w-3.5" /> Connect account
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {analytics?.needsAttention > 0 && (
        <button
          type="button"
          onClick={() => onSelectTab('platforms')}
          className="flex w-full items-center gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/5 px-4 py-2.5 text-left text-xs text-amber-800 dark:text-amber-300"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {analytics.needsAttention} account{analytics.needsAttention === 1 ? '' : 's'} stopped syncing. Open
          Connected Accounts to log in again.
        </button>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Total audience"
          icon={Users}
          value={(analytics?.totalAudience || 0).toLocaleString()}
          badge={<Growth value={analytics?.audienceGrowthRate} />}
          foot="Followers across all accounts, change over 30 days"
        />
        <StatCard
          label="Reach (30 days)"
          icon={Eye}
          value={(analytics?.totalReach || 0).toLocaleString()}
          badge={<Growth value={analytics?.reachGrowthRate} label="vs. previous 30 days" />}
          foot="People reached, or views where reach isn't shared"
        />
        <StatCard
          label="Avg engagement"
          icon={Flame}
          accent
          value={`${analytics?.averageEngagementRate || 0}%`}
          foot="(Likes + comments + shares + saves) ÷ reach"
        />
        <StatCard
          label="Posts tracked"
          icon={Share2}
          value={analytics?.totalPosts || 0}
          badge={
            <span className="bg-lavender text-accent dark:text-ink rounded-full px-1.5 text-[10px] font-bold">
              {analytics?.topPerformingCount || 0} top
            </span>
          }
          foot={`${analytics?.postsLast30Days || 0} published in the last 30 days`}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="border-line/70 bg-surface/90 shadow-soft rounded-2xl border p-4">
          <div className="flex items-center justify-between pb-3">
            <div>
              <h3 className="font-display text-sm font-semibold">Audience by account</h3>
              <p className="text-muted text-xs">Share of your total followers.</p>
            </div>
            <BarChart3 className="text-muted h-4 w-4" />
          </div>
          <div className="space-y-3.5 pt-1">
            {platformBreakdown.map((item) => {
              const cfg = PLATFORM_CONFIG[item.platform] || PLATFORM_CONFIG.instagram;
              return (
                <div key={item.accountId}>
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="min-w-0 truncate font-semibold">
                      {cfg.name} <span className="text-muted font-normal">@{item.handle}</span>
                    </span>
                    <span className="text-muted shrink-0 tabular-nums">
                      {item.followers.toLocaleString()} ({item.sharePercentage}%) · {item.engagementRate}% eng
                    </span>
                  </div>
                  <div className="bg-line/70 mt-1.5 h-2 w-full overflow-hidden rounded-full">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${Math.max(item.sharePercentage, 3)}%`, backgroundColor: cfg.color }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="border-line/70 bg-surface/90 shadow-soft rounded-2xl border p-4">
          <div className="flex items-center justify-between pb-3">
            <div>
              <h3 className="font-display text-sm font-semibold">Your best posting times</h3>
              <p className="text-muted text-xs">
                From when your own posts got the most engagement ({analytics?.timeZone}).
              </p>
            </div>
            <Clock className="text-muted h-4 w-4" />
          </div>
          {bestTimes.length === 0 ? (
            <p className="text-muted py-4 text-center text-xs">Sync or add posts to find your best times.</p>
          ) : (
            <div className="space-y-2.5">
              {bestTimes.map((bt) => {
                const cfg = PLATFORM_CONFIG[bt.platform] || PLATFORM_CONFIG.instagram;
                return (
                  <div
                    key={bt.platform}
                    className="border-line/60 bg-subtle/40 flex flex-wrap items-center justify-between gap-2 rounded-xl border p-2.5 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: cfg.color }} />
                      <span className="font-semibold">{cfg.name}</span>
                      {bt.enoughData && <span className="text-muted">(best: {bt.format}s)</span>}
                    </div>
                    {bt.enoughData ? (
                      <div className="text-ink font-medium">
                        {bt.bestDay} · <span className="text-accent">{bt.bestTime}</span>
                      </div>
                    ) : (
                      <span className="text-muted text-[11px]">
                        Needs 3+ posts ({bt.postsAnalysed} so far)
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {(formatBreakdown.length > 0 || topPosts.length > 0) && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="border-line/70 bg-surface/90 shadow-soft rounded-2xl border p-4">
            <h3 className="font-display text-sm font-semibold">What format works best</h3>
            <p className="text-muted text-xs">Average engagement per post type.</p>
            <div className="mt-3 space-y-2">
              {formatBreakdown.map((item, index) => {
                const max = formatBreakdown[0]?.averageEngagementRate || 1;
                return (
                  <div key={item.mediaType} className="text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold capitalize">
                        {item.mediaType} <span className="text-muted font-normal">· {item.posts} posts</span>
                      </span>
                      <span className={cn('tabular-nums', index === 0 && 'text-accent font-bold')}>
                        {item.averageEngagementRate}%
                      </span>
                    </div>
                    <div className="bg-line/70 mt-1 h-1.5 overflow-hidden rounded-full">
                      <div
                        className="bg-accent h-full rounded-full"
                        style={{ width: `${Math.max((item.averageEngagementRate / max) * 100, 3)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="border-line/70 bg-surface/90 shadow-soft rounded-2xl border p-4">
            <h3 className="font-display flex items-center gap-1.5 text-sm font-semibold">
              <TrendingUp className="text-accent h-4 w-4" /> Top posts
            </h3>
            <p className="text-muted text-xs">Highest engagement. Make more like these.</p>
            <div className="mt-3 space-y-2">
              {topPosts.map((post) => {
                const cfg = PLATFORM_CONFIG[post.platform] || PLATFORM_CONFIG.instagram;
                return (
                  <a
                    key={post.id}
                    href={post.permalink || undefined}
                    target="_blank"
                    rel="noreferrer"
                    className="border-line/60 bg-subtle/40 hover:bg-subtle flex items-center gap-2.5 rounded-xl border p-2 text-xs"
                  >
                    {post.thumbnailUrl ? (
                      <img
                        src={post.thumbnailUrl}
                        alt=""
                        referrerPolicy="no-referrer"
                        className="h-10 w-10 shrink-0 rounded-lg object-cover"
                      />
                    ) : (
                      <span className="h-10 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: cfg.color }} />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{post.title || post.caption}</span>
                      <span className="text-muted block text-[10px] capitalize">
                        {cfg.name} · {post.mediaType} · {(post.metrics?.views || post.metrics?.reach || 0).toLocaleString()} views
                      </span>
                    </span>
                    <span className="text-accent shrink-0 font-bold tabular-nums">
                      {post.metrics?.engagementRate || 0}%
                    </span>
                  </a>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className="border-line/70 rounded-2xl border bg-gradient-to-r from-purple-500/10 via-fuchsia-500/10 to-amber-500/10 p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-sm">
              <Sparkles className="h-5 w-5" />
            </span>
            <div>
              <h4 className="font-display text-sm font-bold">What should you post next?</h4>
              <p className="text-muted text-xs">
                AI reads your real posts, finds what works and what doesn&apos;t, and plans your next week of content.
              </p>
            </div>
          </div>
          <Button type="button" onClick={() => onSelectTab('suggestions')} className="pill-active shrink-0 gap-1.5 text-xs">
            Analyse my content <ArrowUpRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

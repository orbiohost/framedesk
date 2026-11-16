import {
  ArrowRight,
  Plus,
  Share2,
  Sparkles,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { PLATFORM_CONFIG, useSocialAccounts, useSocialAnalytics } from '../social/hooks.js';
import { Widget } from './Widget.jsx';

export function SocialWidget({ workspace, className }) {
  const { data: accounts = [], isPending: accountsPending } = useSocialAccounts(workspace.id);
  const { data: analytics, isPending: analyticsPending } = useSocialAnalytics(workspace.id);

  const totalAudience = analytics?.totalAudience || 0;
  const totalReach = analytics?.totalReach || 0;
  const avgEngagementRate = analytics?.averageEngagementRate || 0;
  const to = `/w/${workspace.id}/social`;
  const bestTime = analytics?.bestTimes?.find((item) => item.enoughData);

  return (
    <Widget
      title="Social Media"
      icon={Share2}
      className={className}
      action={
        <Link
          to={to}
          className="text-accent hover:text-accent/80 flex items-center gap-1 text-xs font-semibold"
        >
          Open Hub <ArrowRight className="h-3 w-3" />
        </Link>
      }
    >
      {accountsPending || analyticsPending ? (
        <div className="space-y-2 p-2">
          <div className="bg-subtle h-12 w-full animate-pulse rounded-xl" />
          <div className="bg-subtle h-16 w-full animate-pulse rounded-xl" />
        </div>
      ) : accounts.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center p-4 text-center">
          <span className="bg-lavender text-ink grid h-9 w-9 place-items-center rounded-full">
            <Share2 className="h-4 w-4" />
          </span>
          <p className="font-display mt-2 text-xs font-semibold">Connect your social accounts</p>
          <p className="text-muted mt-0.5 text-[11px]">
            Sync real post performance and get AI advice on what to post next.
          </p>
          <Link
            to={to}
            className="pill-active mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium"
          >
            <Plus className="h-3 w-3" /> Connect Channel
          </Link>
        </div>
      ) : (
        <div className="flex h-full flex-col justify-between p-1">
          {/* Top Metric Strip */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="border-line/60 bg-subtle/50 rounded-xl border p-2">
              <span className="text-muted block text-[10px]">Audience</span>
              <span className="font-display text-ink text-sm font-bold tabular-nums">
                {totalAudience.toLocaleString()}
              </span>
            </div>
            <div className="border-line/60 bg-subtle/50 rounded-xl border p-2">
              <span className="text-muted block text-[10px]">Monthly Reach</span>
              <span className="font-display text-ink text-sm font-bold tabular-nums">
                {totalReach.toLocaleString()}
              </span>
            </div>
            <div className="border-line/60 bg-subtle/50 rounded-xl border p-2">
              <span className="text-muted block text-[10px]">Avg Eng.</span>
              <span className="font-display text-accent text-sm font-bold tabular-nums">
                {avgEngagementRate}%
              </span>
            </div>
          </div>

          {/* Connected Channels List */}
          <div className="mt-2.5 space-y-1.5">
            {accounts.slice(0, 3).map((acc) => {
              const cfg = PLATFORM_CONFIG[acc.platform] || PLATFORM_CONFIG.instagram;
              return (
                <div
                  key={acc.id}
                  className="border-line/50 bg-subtle/30 flex items-center justify-between rounded-xl border px-2.5 py-1.5 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: cfg.color }}
                    />
                    <span className="font-semibold text-[11px]">{cfg.name}</span>
                    <span className="text-muted text-[10px] truncate max-w-24">
                      {cfg.handlePrefix}{acc.handle}
                    </span>
                  </div>
                  <span className="text-muted text-[11px] tabular-nums font-medium">
                    {(acc.followerCount || 0).toLocaleString()} {cfg.audienceLabel.split(' ')[0]}
                  </span>
                </div>
              );
            })}
          </div>

          {/* AI Tip Footer */}
          <div className="border-line/60 bg-lavender/25 dark:bg-lavender/10 mt-2.5 flex items-center justify-between rounded-xl border px-2.5 py-1.5 text-[11px]">
            <span className="flex items-center gap-1.5 font-medium text-indigo-900 dark:text-indigo-200">
              <Sparkles className="h-3 w-3 text-accent" />
              {bestTime ? (
                <>
                  Best time ({PLATFORM_CONFIG[bestTime.platform]?.name}): <strong>{bestTime.bestDay}, {bestTime.bestTime}</strong>
                </>
              ) : (
                'Ask AI what to post next'
              )}
            </span>
            <Link to={to} className="text-accent font-semibold hover:underline">
              View AI Tips
            </Link>
          </div>
        </div>
      )}
    </Widget>
  );
}

import {
  ExternalLink,
  Filter,
  Plus,
  Search,
  Sparkles,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import { format } from 'date-fns';
import { useState } from 'react';
import { Button } from '../../components/ui/Button.jsx';
import { cn } from '../../lib/cn.js';
import { PLATFORM_CONFIG, useDeleteSocialPost } from './hooks.js';
import { SocialPostDetailDialog } from './SocialPostDetailDialog.jsx';

const PLATFORM_FILTERS = [
  { id: 'all', label: 'All Channels' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'facebook', label: 'Facebook' },
  { id: 'linkedin', label: 'LinkedIn' },
  { id: 'tiktok', label: 'TikTok' },
  { id: 'twitter', label: 'X (Twitter)' },
];

const PERFORMANCE_FILTERS = [
  { id: 'all', label: 'All Scores' },
  { id: 'top', label: 'Top Performers' },
  { id: 'good', label: 'Good' },
  { id: 'average', label: 'Average' },
  { id: 'low', label: 'Low' },
];

export function SocialContentTab({
  workspaceId,
  posts = [],
  accounts = [],
  manager,
  onOpenConnect,
  onAddPost,
}) {
  const deletePost = useDeleteSocialPost(workspaceId);
  const manualAccounts = accounts.filter((account) => account.connection === 'manual');
  const [selectedPlatform, setSelectedPlatform] = useState('all');
  const [selectedPerformance, setSelectedPerformance] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [inspectingPost, setInspectingPost] = useState(null);

  const filteredPosts = posts.filter((post) => {
    if (selectedPlatform !== 'all' && post.platform !== selectedPlatform) return false;
    if (selectedPerformance !== 'all' && post.performanceScore !== selectedPerformance)
      return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = post.title?.toLowerCase().includes(q);
      const matchCaption = post.caption?.toLowerCase().includes(q);
      if (!matchTitle && !matchCaption) return false;
    }
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Filters & Search Row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Platform Pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          {PLATFORM_FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSelectedPlatform(item.id)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-semibold transition-all',
                selectedPlatform === item.id
                  ? 'pill-active shadow-sm'
                  : 'bg-surface border-line/70 text-ink/75 hover:bg-subtle hover:text-ink border',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-64">
          <Search className="text-muted pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search posts or copy…"
            className="border-line bg-surface focus:border-accent focus:ring-accent block w-full rounded-xl border py-1.5 pl-8 pr-3 text-xs transition-all focus:outline-none focus:ring-1"
          />
        </div>
      </div>

      {manager && manualAccounts.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-muted font-medium">Add a post to:</span>
          {manualAccounts.map((account) => (
            <button
              key={account.id}
              type="button"
              onClick={() => onAddPost(account)}
              className="border-line/70 hover:bg-subtle inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-semibold"
            >
              <Plus className="h-3 w-3" />
              {PLATFORM_CONFIG[account.platform].name} @{account.handle}
            </button>
          ))}
        </div>
      )}

      {/* Performance Score Filter Chips */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted flex items-center gap-1 font-medium">
          <Filter className="h-3 w-3" /> Score:
        </span>
        {PERFORMANCE_FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setSelectedPerformance(item.id)}
            className={cn(
              'rounded-lg px-2.5 py-0.5 text-xs transition-colors',
              selectedPerformance === item.id
                ? 'bg-lavender text-ink font-semibold'
                : 'text-muted hover:text-ink hover:bg-subtle',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Posts Grid */}
      {filteredPosts.length === 0 ? (
        <div className="border-line/70 bg-surface/80 rounded-2xl border p-12 text-center">
          <p className="font-display text-sm font-semibold">No content found</p>
          <p className="text-muted mt-1 text-xs">
            {posts.length === 0
              ? accounts.length
                ? 'No posts yet. Sync a linked account, or add posts to an account you added by hand.'
                : 'Connect your social media accounts to sync and inspect content performance.'
              : 'Try adjusting your platform or score filters.'}
          </p>
          {posts.length === 0 && accounts.length === 0 && (
            <Button
              type="button"
              onClick={onOpenConnect}
              className="pill-active mt-4 text-xs"
            >
              Connect Channel
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 lg:grid-cols-3">
          {filteredPosts.map((post) => {
            const cfg = PLATFORM_CONFIG[post.platform] || PLATFORM_CONFIG.instagram;
            const metrics = post.metrics || {};
            const isWhatsApp = post.platform === 'whatsapp';

            return (
              <div
                key={post.id}
                className="border-line/70 bg-surface/90 shadow-soft hover:border-line flex flex-col justify-between rounded-2xl border p-4 transition-all"
              >
                <div>
                  {/* Top Row: Channel & Score Tag */}
                  <div className="flex items-center justify-between pb-2">
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                        cfg.bgLight,
                      )}
                    >
                      {cfg.name} • {post.mediaType}
                    </span>
                    {post.performanceScore === 'top' && (
                      <span className="bg-lavender text-accent dark:text-ink inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold">
                        <TrendingUp className="h-3 w-3" /> Top performer
                      </span>
                    )}
                  </div>

                  {post.thumbnailUrl && (
                    <img
                      src={post.thumbnailUrl}
                      alt=""
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      onError={(event) => {
                        event.currentTarget.style.display = 'none';
                      }}
                      className="mb-2 aspect-video w-full rounded-xl object-cover"
                    />
                  )}
                  {/* Title & Preview */}
                  {post.title && (
                    <h4 className="font-display line-clamp-1 text-sm font-bold">{post.title}</h4>
                  )}
                  <p className="text-muted/90 mt-1 line-clamp-3 text-xs leading-relaxed">
                    {post.caption}
                  </p>
                </div>

                {/* Metrics Footer */}
                <div className="mt-4 border-t border-line/50 pt-3">
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="bg-subtle/50 rounded-lg p-1.5">
                      <span className="text-muted block text-[10px]">
                        {isWhatsApp ? 'Delivered' : 'Views'}
                      </span>
                      <span className="font-semibold tabular-nums">
                        {(metrics.views || metrics.reach || 0).toLocaleString()}
                      </span>
                    </div>

                    <div className="bg-subtle/50 rounded-lg p-1.5">
                      <span className="text-muted block text-[10px]">
                        {isWhatsApp ? 'Inquiries' : 'Likes'}
                      </span>
                      <span className="font-semibold tabular-nums">
                        {(isWhatsApp ? metrics.comments : metrics.likes || 0).toLocaleString()}
                      </span>
                    </div>

                    <div className="bg-subtle/50 rounded-lg p-1.5">
                      <span className="text-muted block text-[10px]">Eng. Rate</span>
                      <span className="text-accent font-semibold tabular-nums">
                        {metrics.engagementRate
                          ? `${metrics.engagementRate}%`
                          : `${metrics.shares || 0} shr`}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-muted flex items-center gap-2 text-[10px]">
                      {format(new Date(post.publishedAt), 'd MMM yyyy')}
                      {post.permalink && (
                        <a href={post.permalink} target="_blank" rel="noreferrer" className="hover:text-ink" aria-label="Open post">
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                      {manager && post.source === 'manual' && (
                        <button
                          type="button"
                          aria-label="Delete post"
                          onClick={() => {
                            if (window.confirm('Delete this post from FrameDesk?')) deletePost.mutate(post.id);
                          }}
                          className="hover:text-danger"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => setInspectingPost(post)}
                      className="text-accent hover:text-ink inline-flex items-center gap-1 text-xs font-semibold transition-colors"
                    >
                      <Sparkles className="h-3 w-3" /> Details
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Post Detail & AI Diagnostics Modal */}
      <SocialPostDetailDialog
        post={inspectingPost}
        open={Boolean(inspectingPost)}
        onClose={() => setInspectingPost(null)}
      />
    </div>
  );
}

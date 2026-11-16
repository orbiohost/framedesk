import {
  Bookmark,
  ExternalLink,
  Eye,
  Heart,
  MessageSquare,
  MousePointerClick,
  Share2,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { format } from 'date-fns';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { cn } from '../../lib/cn.js';
import { PLATFORM_CONFIG } from './hooks.js';

export function SocialPostDetailDialog({ post, open, onClose }) {
  if (!post) return null;

  const config = PLATFORM_CONFIG[post.platform] || PLATFORM_CONFIG.instagram;
  const metrics = post.metrics || {};
  const isWhatsApp = post.platform === 'whatsapp';

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`${config.name} Content Breakdown`}
      description={`Published ${format(new Date(post.publishedAt), 'd MMM yyyy, h:mm a')}`}
      wide={false}
    >
      <div className="space-y-4 pt-1">
        {/* Badges row */}
        <div className="flex items-center gap-2.5">
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider',
              config.bgLight,
            )}
          >
            {config.name} • {post.mediaType}
          </span>
          {post.performanceScore === 'top' && (
            <span className="bg-lavender text-accent dark:text-ink inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold">
              <TrendingUp className="h-3 w-3" /> Top performer
            </span>
          )}
        </div>

        {/* Title */}
        {post.title && <h3 className="font-display text-base font-bold">{post.title}</h3>}
        {post.permalink && (
          <a
            href={post.permalink}
            target="_blank"
            rel="noreferrer"
            className="text-accent inline-flex items-center gap-1 text-xs font-semibold hover:underline"
          >
            Open on {config.name} <ExternalLink className="h-3 w-3" />
          </a>
        )}

        {/* Performance Metric Cards Grid */}
        <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <div className="border-line/70 bg-subtle/50 rounded-2xl border p-3">
            <div className="text-muted flex items-center gap-1.5 text-xs">
              <Eye className="h-3.5 w-3.5" />
              <span>{isWhatsApp ? 'Delivered' : 'Views / Reach'}</span>
            </div>
            <span className="font-display text-ink mt-1 block text-lg font-semibold tabular-nums">
              {(metrics.views || metrics.reach || 0).toLocaleString()}
            </span>
          </div>

          <div className="border-line/70 bg-subtle/50 rounded-2xl border p-3">
            <div className="text-muted flex items-center gap-1.5 text-xs">
              {isWhatsApp ? <MessageSquare className="h-3.5 w-3.5" /> : <Heart className="h-3.5 w-3.5" />}
              <span>{isWhatsApp ? 'Inquiries' : 'Likes'}</span>
            </div>
            <span className="font-display text-ink mt-1 block text-lg font-semibold tabular-nums">
              {(isWhatsApp ? metrics.comments : metrics.likes || 0).toLocaleString()}
            </span>
          </div>

          <div className="border-line/70 bg-subtle/50 rounded-2xl border p-3">
            <div className="text-muted flex items-center gap-1.5 text-xs">
              <Share2 className="h-3.5 w-3.5" />
              <span>{isWhatsApp ? 'Forwards' : 'Shares'}</span>
            </div>
            <span className="font-display text-ink mt-1 block text-lg font-semibold tabular-nums">
              {(metrics.shares || 0).toLocaleString()}
            </span>
          </div>

          <div className="border-line/70 bg-subtle/50 rounded-2xl border p-3">
            <div className="text-muted flex items-center gap-1.5 text-xs">
              <MousePointerClick className="h-3.5 w-3.5" />
              <span>Engagement</span>
            </div>
            <span className="font-display text-accent mt-1 block text-lg font-semibold tabular-nums">
              {metrics.engagementRate || 0}%
            </span>
          </div>
        </div>
        <div className="text-muted flex flex-wrap gap-x-4 gap-y-1 text-xs">
          <span>
            <MessageSquare className="mr-1 inline h-3 w-3" />
            {(metrics.comments || 0).toLocaleString()} comments
          </span>
          {!isWhatsApp && (
            <span>
              <Bookmark className="mr-1 inline h-3 w-3" />
              {(metrics.saves || 0).toLocaleString()} saves
            </span>
          )}
          {metrics.reach > 0 && <span>{metrics.reach.toLocaleString()} reached</span>}
          {metrics.clicks > 0 && <span>{metrics.clicks.toLocaleString()} link clicks</span>}
          <span>{post.source === 'synced' ? `Synced from ${config.name}` : 'Added by hand'}</span>
        </div>

        {/* Caption Preview Box */}
        <div className="mt-4">
          <h4 className="text-ink/80 text-xs font-semibold uppercase tracking-wider">
            Content Text / Copy
          </h4>
          <div className="border-line/70 bg-surface mt-1.5 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-2xl border p-3.5 text-xs leading-relaxed">
            {post.caption}
          </div>
        </div>

        {/* AI Performance Analysis Box */}
        {post.aiAnalysis?.keyTakeaway ? (
          <div className="border-line/70 bg-lavender/25 dark:bg-lavender/10 mt-4 rounded-2xl border p-4">
            <div className="flex items-center justify-between pb-2">
              <span className="flex items-center gap-2 text-xs font-bold text-indigo-900 dark:text-indigo-200">
                <Sparkles className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                AI Content Diagnostic
              </span>
              <span className="bg-surface shadow-soft inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold">
                Hook score: <span className="text-accent">{post.aiAnalysis.hookScore ?? '–'}/100</span>
              </span>
            </div>
            <p className="text-ink mt-1 text-xs">
              <strong>Why it performed this way:</strong> {post.aiAnalysis.keyTakeaway}
            </p>
            {post.aiAnalysis.improvementTip && (
              <p className="text-muted mt-2 text-xs">
                <strong>Do better next time:</strong> {post.aiAnalysis.improvementTip}
              </p>
            )}
          </div>
        ) : (
          <p className="border-line/70 bg-subtle/40 text-muted mt-4 rounded-2xl border p-3 text-xs">
            <Sparkles className="mr-1 inline h-3.5 w-3.5 text-purple-600" />
            Run <strong>AI Strategy › Analyse</strong> on this account to get notes on this post&apos;s hook and what to improve.
          </p>
        )}
      </div>
    </Dialog>
  );
}

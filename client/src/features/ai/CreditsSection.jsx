import { Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '../../components/ui/Button.jsx';
import { Skeleton } from '../../components/ui/Skeleton.jsx';
import { cn } from '../../lib/cn.js';
import { formatInr } from '../../lib/format.js';
import { shortDate } from '../admin/adminFormat.js';
import { UsageDetails } from './AiUsage.jsx';
import { AiResetButton } from './AiUsageDialog.jsx';
import { useAiStatus, useCreditHistory } from './hooks.js';

const KIND_LABELS = {
  chat: 'Question',
  analysis: 'File analysed',
  brief: 'Project brief written',
  moodboard: 'Moodboard AI',
  purchase: 'Extra usage bought',
  grant: 'Adjusted by FrameDesk',
  refund: 'Refund',
};

function Balance({ credits }) {
  return (
    <div className="bg-surface border-line/60 shadow-soft grid gap-6 rounded-3xl border p-5 sm:grid-cols-[minmax(0,1fr)_12rem] sm:p-6">
      <UsageDetails credits={{ ...credits, extra: 0 }} />
      <div className="border-line/70 sm:border-l sm:pl-6">
        <p className="text-muted text-xs">Extra usage</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">
          {credits.extra.toLocaleString('en-IN')}
          <span className="text-muted text-sm font-normal"> credits</span>
        </p>
        <p className="text-muted mt-1 text-xs">
          Used only after a limit is reached. Never expires.
        </p>
      </div>
    </div>
  );
}

function History({ workspaceId }) {
  const history = useCreditHistory(workspaceId);
  const entries = history.data?.pages.flatMap((page) => page.entries) ?? [];
  if (history.isPending) return <Skeleton className="h-24" />;
  if (entries.length === 0) {
    return <p className="text-muted text-sm">No credits used yet.</p>;
  }
  return (
    <div>
      <ul className="divide-line/70 border-line/70 divide-y rounded-2xl border">
        {entries.map((entry) => (
          <li key={entry.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
            <div className="min-w-0 flex-1">
              <p className="truncate">
                {KIND_LABELS[entry.kind] ?? entry.kind}
                {entry.fileName && <span className="text-muted"> · {entry.fileName}</span>}
                {entry.kind !== 'analysis' && entry.note && (
                  <span className="text-muted"> · {entry.note}</span>
                )}
              </p>
              <p className="text-muted text-xs">
                {shortDate(entry.at)}
                {entry.user && ` · ${entry.user}`}
              </p>
            </div>
            <span
              className={cn(
                'shrink-0 font-medium tabular-nums',
                entry.credits > 0 ? 'text-success' : 'text-muted',
              )}
            >
              {entry.credits > 0 ? '+' : ''}
              {entry.credits.toLocaleString('en-IN')}
            </span>
          </li>
        ))}
      </ul>
      {history.hasNextPage && (
        <Button
          size="sm"
          variant="ghost"
          className="mt-2"
          loading={history.isFetchingNextPage}
          onClick={() => history.fetchNextPage()}
        >
          Show more
        </Button>
      )}
    </div>
  );
}

// AI credit balance and packs, on the upgrade page. `ai` is pricing.ai.
export function CreditsSection({ workspace, ai, payOnline, taxNote, onBuy }) {
  const status = useAiStatus(workspace.id);
  const [showHistory, setShowHistory] = useState(false);
  const credits = status.data?.credits;
  const sectionRef = useRef(null);

  // Links from the assistant ("Buy more credits") land on #ai-credits.
  useEffect(() => {
    if (window.location.hash === '#ai-credits') {
      sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  return (
    <section ref={sectionRef} id="ai-credits" className="mt-12 scroll-mt-6">
      <div className="mb-4 flex items-start gap-3">
        <span className="bg-lavender text-accent dark:text-ink grid h-10 w-10 shrink-0 place-items-center rounded-2xl">
          <Sparkles className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h2 className="font-display text-2xl">AI usage</h2>
          <p className="text-muted text-sm">
            The AI assistant studies your uploads and answers questions about them. Your plan
            includes usage that refreshes every {ai.sessionHours} hours, within a weekly limit that
            resets every {ai.weekDays} days. Need more right now? Add extra usage, which is used
            only once a limit is reached and never expires.
          </p>
        </div>
      </div>

      {credits ? (
        <>
          <Balance credits={credits} />
          {status.data?.resetPrice && (
            <div className="border-line/70 mt-4 flex flex-col gap-3 rounded-2xl border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium">Hit a limit and can’t wait?</p>
                <p className="text-muted text-sm">
                  Reset your 5-hour and weekly limits right away, for a one-time fee.
                </p>
              </div>
              <AiResetButton workspace={workspace} status={status.data} className="shrink-0" />
            </div>
          )}
        </>
      ) : (
        status.isPending && <Skeleton className="h-24" />
      )}

      <div className="border-line divide-line mt-6 grid divide-y rounded-lg border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {ai.packs.map((pack) => (
          <div key={pack.code} className="flex flex-col p-6">
            <p className="text-3xl font-semibold tabular-nums tracking-tight">
              {pack.credits.toLocaleString('en-IN')}
              <span className="text-muted text-sm font-normal"> credits of extra usage</span>
            </p>
            <p className="mt-2 text-lg font-medium tabular-nums">{formatInr(pack.price)}</p>
            <p className="text-muted text-xs">
              {formatInr(Math.round((pack.price / pack.credits) * 100))} per 100 credits · never
              expire
            </p>
            <div className="mt-6 flex-1" />
            <Button
              variant="secondary"
              className="w-full"
              disabled={!payOnline}
              onClick={() => onBuy(pack.code)}
            >
              Add {pack.credits.toLocaleString('en-IN')} credits
            </Button>
          </div>
        ))}
      </div>
      <p className="text-muted mt-3 text-sm">
        Prices in INR{taxNote}. A typical question uses 1–3 credits. Usage is shared by all your
        workspaces.
        {!payOnline && ' Online payment isn’t set up yet; contact support to buy extra usage.'}
      </p>

      <div className="mt-6">
        <button
          type="button"
          onClick={() => setShowHistory((value) => !value)}
          className="text-sm font-medium hover:underline"
          aria-expanded={showHistory}
        >
          {showHistory ? 'Hide usage history' : 'Show usage history'}
        </button>
        {showHistory && (
          <div className="mt-3">
            <History workspaceId={workspace.id} />
          </div>
        )}
      </div>
    </section>
  );
}

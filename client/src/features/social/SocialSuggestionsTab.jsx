import { format } from 'date-fns';
import {
  AlertCircle,
  CalendarDays,
  Check,
  Copy,
  Flame,
  Layers,
  Plus,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Wand2,
  Zap,
} from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../components/ui/Button.jsx';
import { cn } from '../../lib/cn.js';
import {
  PLATFORM_CONFIG,
  useGenerateSocialSuggestions,
  useOptimizeSocialPost,
  useSocialAccounts,
} from './hooks.js';

const PRESET_GOALS = [
  'Get client inquiries and leads',
  'Grow reach and followers',
  'Build community and engagement',
  'Drive sales and website clicks',
];

const PLATFORM_IDS = ['instagram', 'youtube', 'facebook', 'tiktok', 'linkedin', 'twitter', 'whatsapp'];

function aiErrorMessage(error) {
  if (!error) return null;
  if (error.code === 'AI_OFF') return 'The AI assistant is switched off. An admin can turn it on in Admin › AI.';
  if (error.code === 'AI_LIMIT') return error.message;
  return error.message || 'The AI could not answer. Please try again.';
}

function useCopy() {
  const [copied, setCopied] = useState(null);
  function copy(text, id) {
    navigator.clipboard?.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  }
  return [copied, copy];
}

function CopyButton({ copied, onClick, label = 'Copy' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="hover:bg-subtle text-muted hover:text-ink inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium"
    >
      {copied ? <Check className="text-success h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? 'Copied!' : label}
    </button>
  );
}

function AccountPicker({ accounts, value, onChange, platform, onPlatform }) {
  return (
    <div className="space-y-1.5">
      {accounts.map((account) => {
        const cfg = PLATFORM_CONFIG[account.platform];
        const selected = value === account.id;
        return (
          <button
            key={account.id}
            type="button"
            onClick={() => onChange(account.id)}
            className={cn(
              'flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-xs',
              selected ? 'border-accent bg-accent/5 ring-accent ring-1' : 'border-line/60 bg-surface hover:bg-subtle',
            )}
          >
            <span className="min-w-0">
              <span className="block truncate font-semibold">
                {cfg.name} · @{account.handle}
              </span>
              <span className="text-muted block text-[10px]">
                {(account.followerCount || 0).toLocaleString()} {cfg.audienceLabel.split(' ')[0].toLowerCase()} ·{' '}
                {account.engagementRate || 0}% engagement
              </span>
            </span>
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: cfg.color }} />
          </button>
        );
      })}
      <div
        className={cn(
          'rounded-xl border text-xs',
          value === null ? 'border-accent bg-accent/5 ring-accent ring-1' : 'border-line/60 bg-surface hover:bg-subtle',
        )}
      >
        <button
          type="button"
          onClick={() => onChange(null)}
          className="w-full px-3 py-2 text-left font-semibold"
        >
          A platform I haven&apos;t connected
        </button>
        {value === null && (
          <div className="flex flex-wrap gap-1 px-3 pb-2">
            {PLATFORM_IDS.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => onPlatform(id)}
                className={cn(
                  'rounded-full border px-2 py-0.5 text-[10px] font-semibold',
                  platform === id ? 'border-accent bg-accent/10 text-accent' : 'border-line/60 text-muted',
                )}
              >
                {PLATFORM_CONFIG[id].name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ListCard({ title, icon: Icon, tone, items }) {
  if (!items?.length) return null;
  return (
    <div className="border-line/70 bg-surface/90 rounded-2xl border p-4">
      <h4 className={cn('font-display flex items-center gap-2 text-xs font-bold', tone)}>
        <Icon className="h-4 w-4" /> {title}
      </h4>
      <ul className="text-ink/85 mt-2 space-y-1.5 text-xs leading-relaxed">
        {items.map((item, index) => (
          <li key={index} className="flex items-start gap-2">
            <span className="text-accent">•</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function InsightView({ insight, platform }) {
  const cfg = PLATFORM_CONFIG[platform] || PLATFORM_CONFIG.instagram;
  const [copied, copy] = useCopy();
  return (
    <div className="space-y-4">
      <div className="border-line/70 rounded-2xl border bg-gradient-to-r from-purple-500/10 via-fuchsia-500/10 to-amber-500/10 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2">
          <span className="font-display flex items-center gap-2 text-xs font-bold">
            <Zap className="text-accent h-4 w-4" /> {cfg.name} analysis
          </span>
          <span className="text-muted text-[11px]">
            {insight.postsAnalysed ? `${insight.postsAnalysed} posts analysed` : 'No post data yet'}
            {insight.generatedAt ? ` · ${format(new Date(insight.generatedAt), 'd MMM, h:mm a')}` : ''}
          </span>
        </div>
        {insight.summary && <p className="text-ink text-xs leading-relaxed">{insight.summary}</p>}
        {insight.platformStrategy && (
          <p className="text-ink mt-2 text-xs leading-relaxed">
            <strong>Strategy: </strong>
            {insight.platformStrategy}
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
          {insight.recommendedFrequency && (
            <span className="bg-surface shadow-soft rounded-full px-2.5 py-0.5 font-semibold">
              Post: {insight.recommendedFrequency}
            </span>
          )}
          {insight.optimalPostingTime && (
            <span className="bg-surface shadow-soft rounded-full px-2.5 py-0.5 font-semibold">
              Best time: {insight.optimalPostingTime}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <ListCard
          title="What's working"
          icon={ThumbsUp}
          tone="text-emerald-700 dark:text-emerald-400"
          items={insight.whatsWorking}
        />
        <ListCard title="What's holding you back" icon={ThumbsDown} tone="text-danger" items={insight.whatsNotWorking} />
      </div>

      {insight.audienceInsight && (
        <p className="border-line/70 bg-surface/90 rounded-2xl border p-4 text-xs leading-relaxed">
          <strong>Your audience: </strong>
          {insight.audienceInsight}
        </p>
      )}

      {insight.contentPillars?.length > 0 && (
        <div className="border-line/70 bg-surface/90 rounded-2xl border p-4">
          <h4 className="font-display flex items-center gap-2 text-xs font-bold">
            <Layers className="text-accent h-4 w-4" /> Content pillars
          </h4>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {insight.contentPillars.map((pillar, index) => (
              <div key={index} className="bg-subtle/50 rounded-xl p-2.5 text-xs">
                <div className="flex items-center justify-between font-semibold">
                  <span>{pillar.name}</span>
                  {pillar.share && <span className="text-accent">{pillar.share}</span>}
                </div>
                <p className="text-muted mt-0.5">{pillar.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3">
        <h4 className="font-display flex items-center gap-2 text-sm font-bold">
          <Sparkles className="text-accent h-4 w-4" /> What to post next
        </h4>
        {insight.ideas?.map((idea, index) => (
          <div key={index} className="border-line/70 bg-surface/90 shadow-soft rounded-2xl border p-4">
            <div className="flex items-start justify-between gap-2 pb-2">
              <div className="flex items-center gap-2">
                <span className="bg-lavender text-accent dark:text-ink font-display grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold">
                  {index + 1}
                </span>
                <span className="font-display text-sm font-bold">{idea.title}</span>
              </div>
              <span className="border-line/70 bg-subtle text-muted shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold">
                {idea.format}
              </span>
            </div>
            <div className="border-line/60 bg-subtle/50 rounded-xl border p-2.5">
              <span className="text-accent block text-[10px] font-bold uppercase tracking-wider">Hook</span>
              <p className="text-ink mt-0.5 text-xs font-medium italic">&ldquo;{idea.hook}&rdquo;</p>
            </div>
            <div className="mt-2.5">
              <span className="text-muted block text-[10px] font-bold uppercase tracking-wider">Outline</span>
              <p className="text-ink/85 mt-1 whitespace-pre-wrap text-xs leading-relaxed">{idea.structure}</p>
            </div>
            {idea.whyItWorks && (
              <p className="text-muted mt-2 text-[11px]">
                <strong className="text-ink/80">Why: </strong>
                {idea.whyItWorks}
              </p>
            )}
            {idea.recommendedHashtags?.length > 0 && (
              <p className="text-accent mt-2 text-[11px]">{idea.recommendedHashtags.join(' ')}</p>
            )}
            <div className="border-line/50 mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t pt-2">
              <div className="text-xs">
                <span className="text-muted font-semibold">CTA: </span>
                <span className="font-medium">{idea.callToAction}</span>
                {idea.bestTimeToPost && <span className="text-muted"> · {idea.bestTimeToPost}</span>}
              </div>
              <CopyButton
                copied={copied === index}
                label="Copy brief"
                onClick={() =>
                  copy(
                    [
                      idea.title,
                      `Format: ${idea.format}`,
                      `Hook: ${idea.hook}`,
                      `Outline:\n${idea.structure}`,
                      `CTA: ${idea.callToAction}`,
                      idea.recommendedHashtags?.length ? idea.recommendedHashtags.join(' ') : '',
                      idea.bestTimeToPost ? `Post: ${idea.bestTimeToPost}` : '',
                    ]
                      .filter(Boolean)
                      .join('\n'),
                    index,
                  )
                }
              />
            </div>
          </div>
        ))}
      </div>

      {insight.weeklyPlan?.length > 0 && (
        <div className="border-line/70 bg-surface/90 rounded-2xl border p-4">
          <h4 className="font-display flex items-center gap-2 text-xs font-bold">
            <CalendarDays className="text-accent h-4 w-4" /> This week&apos;s plan
          </h4>
          <div className="mt-2 divide-y divide-line/50 text-xs">
            {insight.weeklyPlan.map((slot, index) => (
              <div key={index} className="flex gap-3 py-1.5">
                <span className="w-20 shrink-0 font-semibold">{slot.day}</span>
                <span className="text-accent w-24 shrink-0">{slot.format}</span>
                <span className="text-ink/85 min-w-0">{slot.idea}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <ListCard title="Growth tips" icon={Flame} tone="text-warning" items={insight.platformGrowthTips} />
    </div>
  );
}

export function SocialSuggestionsTab({ workspaceId, onOpenConnect }) {
  const [subTab, setSubTab] = useState('ideas');
  const { data: accounts = [] } = useSocialAccounts(workspaceId);

  const [accountId, setAccountId] = useState(undefined);
  const [platform, setPlatform] = useState('instagram');
  const [goal, setGoal] = useState('');
  const [topic, setTopic] = useState('');
  const generate = useGenerateSocialSuggestions(workspaceId);

  const [draftCaption, setDraftCaption] = useState('');
  const optimize = useOptimizeSocialPost(workspaceId);
  const [copiedVariant, copyVariant] = useCopy();

  // Until one is picked, the first account.
  const selectedId = accountId === undefined ? (accounts[0]?.id ?? null) : accountId;
  const account = accounts.find((item) => item.id === selectedId) ?? null;
  const targetPlatform = account?.platform ?? platform;
  const cfg = PLATFORM_CONFIG[targetPlatform] || PLATFORM_CONFIG.instagram;
  const effectiveGoal = goal || account?.goal || '';

  // A fresh answer for this account, or the one saved last time.
  const fresh =
    generate.data && (generate.data.accountId ?? null) === (account?.id ?? null) && generate.data.platform === targetPlatform
      ? generate.data
      : null;
  const insight = fresh ?? account?.aiInsight ?? null;

  function handleGenerate(event) {
    event?.preventDefault();
    generate.mutate({
      ...(account ? { accountId: account.id } : { platform }),
      goal: effectiveGoal || undefined,
      topic: topic.trim() || undefined,
    });
  }

  function handleOptimize(event) {
    event?.preventDefault();
    if (!draftCaption.trim()) return;
    optimize.mutate({
      platform: targetPlatform,
      ...(account ? { accountId: account.id } : {}),
      caption: draftCaption.trim(),
      goal: effectiveGoal || undefined,
    });
  }

  const optimization = optimize.data;
  const postCount = account?.postCount || 0;

  return (
    <div className="space-y-6">
      <div className="border-line/70 bg-surface/80 flex w-fit items-center gap-1.5 rounded-2xl border p-1.5">
        {[
          { id: 'ideas', label: 'Analyse & plan', icon: Sparkles },
          { id: 'optimizer', label: 'Caption rewriter', icon: Wand2 },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setSubTab(item.id)}
            className={cn(
              'flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold',
              subTab === item.id ? 'pill-active shadow-sm' : 'text-ink/75 hover:bg-subtle hover:text-ink',
            )}
          >
            <item.icon className="h-3.5 w-3.5" />
            {item.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="border-line/70 bg-surface/90 shadow-soft h-fit space-y-4 rounded-2xl border p-5">
          <div>
            <h3 className="font-display text-sm font-semibold">Which account?</h3>
            <p className="text-muted text-xs">The AI reads this account&apos;s real posts and numbers.</p>
          </div>
          <AccountPicker
            accounts={accounts}
            value={account ? account.id : null}
            onChange={setAccountId}
            platform={platform}
            onPlatform={setPlatform}
          />
          {accounts.length === 0 && (
            <Button type="button" variant="ghost" onClick={() => onOpenConnect?.()} className="w-full gap-1.5 text-xs">
              <Plus className="h-3.5 w-3.5" /> Connect an account for advice on your own posts
            </Button>
          )}

          <div>
            <span className="text-ink/80 mb-1.5 block text-xs font-semibold">Goal</span>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_GOALS.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setGoal(goal === item ? '' : item)}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-[11px]',
                    effectiveGoal === item
                      ? 'border-accent bg-accent/5 text-accent font-semibold'
                      : 'border-line/60 hover:bg-subtle text-ink/80',
                  )}
                >
                  {item}
                </button>
              ))}
            </div>
            <input
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder={account?.goal || 'Or type your own goal'}
              className="border-line bg-subtle/40 focus:border-accent mt-2 block w-full rounded-xl border px-3 py-2 text-xs focus:outline-none"
            />
          </div>

          {subTab === 'ideas' ? (
            <form onSubmit={handleGenerate} className="space-y-4">
              <label className="block">
                <span className="text-ink/80 mb-1.5 block text-xs font-semibold">Theme to post about (optional)</span>
                <input
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="e.g. behind the scenes, new service launch"
                  className="border-line bg-subtle/40 focus:border-accent block w-full rounded-xl border px-3 py-2 text-xs focus:outline-none"
                />
              </label>
              {account && postCount === 0 && (
                <p className="rounded-xl bg-amber-500/10 p-2.5 text-[11px] text-amber-800 dark:text-amber-300">
                  This account has no posts yet, so the advice will be general.{' '}
                  {account.connection !== 'manual' ? 'Press Sync on Connected Accounts first.' : 'Use Import with AI on Connected Accounts first, for advice built on your own results.'}
                </p>
              )}
              <Button type="submit" disabled={generate.isPending} className="pill-active w-full gap-2 text-xs">
                <Sparkles className={cn('h-3.5 w-3.5', generate.isPending && 'animate-spin')} />
                {generate.isPending ? 'Analysing your posts…' : insight ? 'Analyse again' : `Analyse & plan ${cfg.name}`}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleOptimize} className="space-y-4">
              <label className="block">
                <span className="text-ink/80 mb-1.5 block text-xs font-semibold">Your draft</span>
                <textarea
                  rows={8}
                  value={draftCaption}
                  onChange={(e) => setDraftCaption(e.target.value)}
                  placeholder={
                    targetPlatform === 'whatsapp'
                      ? 'Type the broadcast message…'
                      : `Paste your ${cfg.name} caption, script or post…`
                  }
                  required
                  className="border-line bg-subtle/40 focus:border-accent block w-full rounded-xl border p-3 text-xs leading-relaxed focus:outline-none"
                />
              </label>
              <Button
                type="submit"
                disabled={!draftCaption.trim() || optimize.isPending}
                className="pill-active w-full gap-2 text-xs"
              >
                <Wand2 className={cn('h-3.5 w-3.5', optimize.isPending && 'animate-spin')} />
                {optimize.isPending ? 'Rewriting…' : 'Score & rewrite'}
              </Button>
            </form>
          )}
        </div>

        <div className="space-y-4 lg:col-span-2">
          {subTab === 'ideas' ? (
            <>
              {generate.error && (
                <div className="border-danger/30 bg-danger/10 text-danger flex items-center gap-2 rounded-xl border p-3 text-xs">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {aiErrorMessage(generate.error)}
                </div>
              )}
              {generate.isPending ? (
                <div className="border-line/70 bg-surface/80 rounded-2xl border p-12 text-center">
                  <Wand2 className="text-accent mx-auto h-8 w-8 animate-pulse" />
                  <p className="font-display mt-3 text-sm font-semibold">
                    Reading {account ? `@${account.handle}'s posts` : `${cfg.name} best practice`}…
                  </p>
                  <p className="text-muted mt-1 text-xs">Comparing formats, hooks, timing and engagement. This takes about 20 seconds.</p>
                </div>
              ) : insight ? (
                <InsightView insight={insight} platform={targetPlatform} />
              ) : (
                <div className="border-line/70 bg-surface/80 rounded-2xl border p-12 text-center">
                  <div className="bg-lavender text-accent dark:text-ink mx-auto grid h-12 w-12 place-items-center rounded-2xl">
                    <Sparkles className="h-6 w-6" />
                  </div>
                  <h4 className="font-display mt-3 text-base font-semibold">Find out what to post next</h4>
                  <p className="text-muted mx-auto mt-1 max-w-md text-xs">
                    The AI looks at every synced post (views, likes, comments, shares, saves, timing and
                    format), tells you what is working, and plans your next posts with hooks, outlines and
                    the best times to publish.
                  </p>
                  <Button type="button" onClick={handleGenerate} className="pill-active mt-4 text-xs">
                    Analyse {account ? `@${account.handle}` : cfg.name}
                  </Button>
                </div>
              )}
            </>
          ) : (
            <>
              {optimize.error && (
                <div className="border-danger/30 bg-danger/10 text-danger flex items-center gap-2 rounded-xl border p-3 text-xs">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {aiErrorMessage(optimize.error)}
                </div>
              )}
              {!optimization && !optimize.isPending && (
                <div className="border-line/70 bg-surface/80 rounded-2xl border p-12 text-center">
                  <Wand2 className="text-muted mx-auto h-8 w-8" />
                  <h4 className="font-display mt-2 text-sm font-semibold">Paste a draft to improve it</h4>
                  <p className="text-muted mt-1 text-xs">
                    You get a hook score and two rewrites in the style of your best-performing posts.
                  </p>
                </div>
              )}
              {optimize.isPending && (
                <div className="border-line/70 bg-surface/80 rounded-2xl border p-12 text-center">
                  <Wand2 className="text-accent mx-auto h-8 w-8 animate-pulse" />
                  <p className="font-display mt-3 text-sm font-semibold">Scoring your hook and rewriting…</p>
                </div>
              )}
              {optimization && !optimize.isPending && (
                <div className="space-y-4">
                  <div className="border-line/70 bg-surface/90 shadow-soft rounded-2xl border p-4">
                    <div className="flex items-center justify-between pb-2">
                      <span className="font-display text-xs font-bold uppercase tracking-wider">Hook score</span>
                      <span className="bg-lavender text-accent dark:text-ink font-display rounded-full px-3 py-1 text-xs font-bold">
                        {optimization.hookScore}/100
                      </span>
                    </div>
                    <p className="text-muted text-xs leading-relaxed">{optimization.assessment}</p>
                  </div>
                  {['variationA', 'variationB'].map((key) =>
                    optimization[key] ? (
                      <div key={key} className="border-line/70 bg-surface/90 shadow-soft rounded-2xl border p-4">
                        <div className="flex items-center justify-between pb-2">
                          <span className="font-display text-accent text-xs font-bold">{optimization[key].title}</span>
                          <CopyButton
                            copied={copiedVariant === key}
                            onClick={() =>
                              copyVariant(
                                [optimization[key].caption, optimization.recommendedHashtags?.join(' ')]
                                  .filter(Boolean)
                                  .join('\n\n'),
                                key,
                              )
                            }
                          />
                        </div>
                        <div className="border-line/60 bg-subtle/40 whitespace-pre-wrap rounded-xl border p-3 text-xs leading-relaxed">
                          {optimization[key].caption}
                        </div>
                        {optimization[key].callToAction && (
                          <p className="text-muted mt-2 text-[11px]">
                            <strong>CTA:</strong> {optimization[key].callToAction}
                          </p>
                        )}
                      </div>
                    ) : null,
                  )}
                  {optimization.recommendedHashtags?.length > 0 && (
                    <p className="text-accent text-xs">{optimization.recommendedHashtags.join(' ')}</p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

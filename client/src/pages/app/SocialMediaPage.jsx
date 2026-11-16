import { BarChart3, Plus, Share2, Sparkles, Users, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { Skeleton } from '../../components/ui/Skeleton.jsx';
import { AddSocialPostDialog } from '../../features/social/AddSocialPostDialog.jsx';
import { ConnectPlatformDialog } from '../../features/social/ConnectPlatformDialog.jsx';
import {
  PLATFORM_CONFIG,
  useSocialAccounts,
  useSocialAnalytics,
  useSocialContent,
} from '../../features/social/hooks.js';
import { SocialContentTab } from '../../features/social/SocialContentTab.jsx';
import { SocialImportPanel } from '../../features/social/SocialImportPanel.jsx';
import { SocialOverviewTab } from '../../features/social/SocialOverviewTab.jsx';
import { SocialPlatformsTab } from '../../features/social/SocialPlatformsTab.jsx';
import { SocialSuggestionsTab } from '../../features/social/SocialSuggestionsTab.jsx';
import { canManage } from '../../features/workspaces/roles.js';
import { cn } from '../../lib/cn.js';

function oauthNotice(searchParams) {
  const connected = searchParams.get('social_connected');
  const failed = searchParams.get('social_error');
  if (failed) return { tone: 'error', text: failed };
  if (!connected) return null;
  const count = Number(searchParams.get('count') || 1);
  const name = PLATFORM_CONFIG[connected]?.name ?? 'Account';
  return {
    tone: 'success',
    text:
      count > 1
        ? `${count} ${name} accounts linked. Their posts and stats are synced; open AI Strategy to see what to post next.`
        : `${name} linked. Your posts and stats are synced; open AI Strategy to see what to post next.`,
  };
}

export function SocialMediaPage() {
  const { workspace } = useOutletContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const [notice, setNotice] = useState(() => oauthNotice(searchParams));
  const [activeTab, setActiveTab] = useState(() =>
    searchParams.has('social_connected') ? 'platforms' : 'overview',
  );
  const [connectKey, setConnectKey] = useState(0);
  const [connectOpen, setConnectOpen] = useState(false);
  const [connectDefaultPlatform, setConnectDefaultPlatform] = useState(null);
  const [importAccount, setImportAccount] = useState(null);
  const [postAccount, setPostAccount] = useState(null);

  const { data: accounts = [], isPending: accountsPending } = useSocialAccounts(workspace.id);
  const { data: analytics, isPending: analyticsPending } = useSocialAnalytics(workspace.id);
  const { data: posts = [] } = useSocialContent(workspace.id, { limit: 100 });

  const manager = canManage(workspace);

  // Coming back from Instagram / Facebook / Google / TikTok login: show the
  // outcome once, then take it out of the URL.
  useEffect(() => {
    if (!searchParams.has('social_connected') && !searchParams.has('social_error')) return;
    const next = new URLSearchParams(searchParams);
    for (const key of ['social_connected', 'social_error', 'count']) next.delete(key);
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  // No platform: start from "paste a link". With one: straight to its options.
  function handleOpenConnect(platform) {
    setConnectDefaultPlatform(typeof platform === 'string' ? platform : null);
    setConnectKey((key) => key + 1);
    setConnectOpen(true);
  }

  const tabs = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    {
      id: 'content',
      label: 'Posts & Performance',
      icon: Share2,
      badge: posts.length > 0 ? posts.length : null,
    },
    { id: 'suggestions', label: 'AI Strategy', icon: Sparkles, highlight: true },
    {
      id: 'platforms',
      label: 'Connected Accounts',
      icon: Users,
      badge: accounts.length > 0 ? accounts.length : null,
    },
  ];

  if (accountsPending || analyticsPending) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Social Media Hub"
        subtitle="Link Instagram, YouTube, Facebook, TikTok and more, see what really performs, and get AI advice on what to post next."
        breadcrumbs={[
          { label: 'Workspace', to: `/w/${workspace.id}` },
          { label: 'Social Media' },
        ]}
        action={
          manager && (
            <Button type="button" onClick={() => handleOpenConnect()} className="pill-active gap-1.5">
              <Plus className="h-4 w-4" /> Connect Account
            </Button>
          )
        }
      />

      {notice && (
        <Alert tone={notice.tone} className="items-start">
          <div className="flex items-start justify-between gap-3">
            <span>{notice.text}</span>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => setNotice(null)}
              className="shrink-0 opacity-70 hover:opacity-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </Alert>
      )}

      <div className="scrollbar-thin border-line/70 flex items-center gap-1.5 overflow-x-auto border-b pb-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition-all',
                isActive ? 'pill-active shadow-sm' : 'text-ink/75 hover:bg-subtle hover:text-ink',
              )}
            >
              <Icon
                className={cn('h-4 w-4', tab.highlight && !isActive && 'text-purple-600 dark:text-purple-400')}
              />
              <span>{tab.label}</span>
              {tab.badge && (
                <span
                  className={cn(
                    'rounded-full px-1.5 text-[10px] font-bold tabular-nums',
                    isActive ? 'bg-surface/25 text-current' : 'bg-lavender text-accent dark:text-ink',
                  )}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {activeTab === 'overview' && (
        <SocialOverviewTab
          workspaceId={workspace.id}
          analytics={analytics}
          accounts={accounts}
          manager={manager}
          onOpenConnect={handleOpenConnect}
          onSelectTab={setActiveTab}
        />
      )}

      {activeTab === 'content' && (
        <SocialContentTab
          workspaceId={workspace.id}
          posts={posts}
          accounts={accounts}
          manager={manager}
          onOpenConnect={handleOpenConnect}
          onAddPost={setPostAccount}
        />
      )}

      {activeTab === 'suggestions' && (
        <SocialSuggestionsTab workspaceId={workspace.id} onOpenConnect={handleOpenConnect} />
      )}

      {activeTab === 'platforms' && (
        <SocialPlatformsTab
          workspaceId={workspace.id}
          accounts={accounts}
          manager={manager}
          onOpenConnect={handleOpenConnect}
          onAddPost={setPostAccount}
          onImport={setImportAccount}
        />
      )}

      <ConnectPlatformDialog
        key={connectKey}
        workspaceId={workspace.id}
        open={connectOpen}
        onClose={() => setConnectOpen(false)}
        defaultPlatform={connectDefaultPlatform}
        onManualCreated={(account) => {
          setActiveTab('platforms');
          setPostAccount(account);
        }}
        onConnected={(account, imported) => {
          setActiveTab('platforms');
          const name = PLATFORM_CONFIG[account.platform]?.name ?? 'Account';
          setNotice({
            tone: 'success',
            text: imported
              ? `${name} @${account.handle} added with ${imported.added} post${imported.added === 1 ? '' : 's'}${imported.skipped ? ` (${imported.skipped} already there)` : ''}. Open AI Strategy to see what to post next.`
              : `${name} @${account.handle} connected and synced. Open AI Strategy to see what to post next.`,
          });
        }}
      />

      <Dialog
        open={Boolean(importAccount)}
        onClose={() => setImportAccount(null)}
        title={importAccount ? `Import into ${PLATFORM_CONFIG[importAccount.platform]?.name} @${importAccount.handle}` : ''}
        description="Screenshots of your stats or an exported CSV. AI reads the numbers, you check them, then they're saved."
        wide="xl"
      >
        {importAccount && (
          <SocialImportPanel
            key={importAccount.id}
            workspaceId={workspace.id}
            account={importAccount}
            onDone={(result) => {
              setImportAccount(null);
              setNotice({
                tone: 'success',
                text: `Imported ${result.added} post${result.added === 1 ? '' : 's'}${result.skipped ? ` (${result.skipped} already there)` : ''}.`,
              });
            }}
          />
        )}
      </Dialog>

      <AddSocialPostDialog
        workspaceId={workspace.id}
        account={postAccount}
        open={Boolean(postAccount)}
        onClose={() => setPostAccount(null)}
      />
    </div>
  );
}

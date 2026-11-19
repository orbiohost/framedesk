import {
  Check,
  CircleAlert,
  CircleCheck,
  Copy,
  ExternalLink,
  KeyRound,
  RefreshCw,
} from 'lucide-react';
import { useState } from 'react';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { Skeleton } from '../../components/ui/Skeleton.jsx';
import {
  useAdminSocialApps,
  useClearSocialApp,
  useClearYoutubeKey,
  useSaveSocialApp,
  useSaveYoutubeKey,
  useTestSocialApp,
  useTestYoutubeKey,
} from '../../features/admin/hooks.js';
import { cn } from '../../lib/cn.js';

const inputClass =
  'border-line bg-surface focus:border-accent block w-full rounded-xl border px-3 py-2 font-mono text-sm focus:outline-none';

function Status({ configured, source }) {
  if (!configured) {
    return (
      <span className="text-muted flex items-center gap-1.5 text-xs font-medium">
        <CircleAlert className="h-4 w-4" /> Not set up
      </span>
    );
  }
  return (
    <span className="text-success flex items-center gap-1.5 text-xs font-semibold">
      <CircleCheck className="h-4 w-4" /> On {source === 'env' ? '(from server .env)' : ''}
    </span>
  );
}

function TestResult({ test }) {
  if (!test) return null;
  return (
    <p
      className={cn(
        'rounded-xl px-3 py-2 text-xs',
        test.ok === true && 'bg-success/10 text-success',
        test.ok === false && 'bg-danger/10 text-danger',
        test.ok === null && 'bg-subtle text-muted',
      )}
    >
      {test.message}
    </p>
  );
}

function CopyField({ value }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="bg-subtle/60 border-line flex items-center gap-2 rounded-xl border px-3 py-2">
      <code className="min-w-0 flex-1 truncate text-xs">{value}</code>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard?.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="text-muted hover:text-ink inline-flex shrink-0 items-center gap-1 text-xs font-medium"
      >
        {copied ? <Check className="text-success h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

function AppCard({ app }) {
  const save = useSaveSocialApp();
  const clear = useClearSocialApp();
  const test = useTestSocialApp();
  const [clientId, setClientId] = useState(app.saved.clientId ?? '');
  const [clientSecret, setClientSecret] = useState('');
  const [result, setResult] = useState(null);

  async function submit(event) {
    event.preventDefault();
    setResult(null);
    const body = await save.mutateAsync({
      app: app.id,
      clientId: clientId.trim(),
      clientSecret: clientSecret.trim() || undefined,
    });
    setClientSecret('');
    setResult(body.test);
  }

  return (
    <Card>
      <div className="border-line flex flex-wrap items-center justify-between gap-2 border-b px-5 py-4">
        <div>
          <h2 className="text-[15px] font-semibold">{app.label}</h2>
          <p className="text-muted text-xs">
            Lets people press &ldquo;Log in with {app.label.split(' ')[0]}&rdquo; and sync
            automatically.
          </p>
        </div>
        <Status configured={app.configured} source={app.source} />
      </div>
      <div className="space-y-4 px-5 py-4">
        <ol className="text-ink/85 list-decimal space-y-1.5 pl-5 text-sm">
          {app.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <a
          href={app.console}
          target="_blank"
          rel="noreferrer"
          className="text-accent inline-flex items-center gap-1 text-sm font-semibold hover:underline"
        >
          Open the developer console <ExternalLink className="h-3.5 w-3.5" />
        </a>
        <div>
          <span className="text-muted mb-1 block text-xs font-semibold">
            Redirect URL to register
          </span>
          <CopyField value={app.redirectUri} />
        </div>
        <div>
          <span className="text-muted mb-1 block text-xs font-semibold">
            Permissions to request
          </span>
          <div className="flex flex-wrap gap-1.5">
            {app.scopes.map((scope) => (
              <code key={scope} className="bg-subtle rounded-lg px-2 py-0.5 text-xs">
                {scope}
              </code>
            ))}
          </div>
        </div>

        <form onSubmit={submit} className="border-line space-y-3 border-t pt-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold">{app.idLabel}</span>
              <input
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder={app.source === 'env' ? `Using .env (${app.activeIdHint})` : ''}
                autoComplete="off"
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold">{app.secretLabel}</span>
              <input
                type="password"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder={app.saved.secretSaved ? 'Saved (leave empty to keep)' : ''}
                autoComplete="new-password"
                className={inputClass}
              />
            </label>
          </div>
          {(save.error || clear.error) && (
            <p className="text-danger text-xs">{(save.error || clear.error).message}</p>
          )}
          <TestResult test={result} />
          <div className="flex flex-wrap items-center justify-end gap-2">
            {app.saved.clientId && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  if (window.confirm(`Remove the saved ${app.label} keys?`)) {
                    setResult(null);
                    setClientId('');
                    clear.mutate(app.id);
                  }
                }}
                className="text-danger text-xs"
              >
                Remove keys
              </Button>
            )}
            {app.configured && (
              <Button
                type="button"
                variant="ghost"
                disabled={test.isPending}
                onClick={async () => setResult((await test.mutateAsync(app.id)).test)}
                className="text-xs"
              >
                {test.isPending ? 'Testing…' : 'Test keys'}
              </Button>
            )}
            <Button
              type="submit"
              disabled={
                save.isPending ||
                !clientId.trim() ||
                (!clientSecret.trim() && !app.saved.secretSaved)
              }
              className="pill-active gap-1.5 text-xs"
            >
              {save.isPending ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <KeyRound className="h-3.5 w-3.5" />
              )}
              Save &amp; test
            </Button>
          </div>
        </form>
      </div>
    </Card>
  );
}

function YoutubeKeyCard({ info }) {
  const save = useSaveYoutubeKey();
  const clear = useClearYoutubeKey();
  const test = useTestYoutubeKey();
  const [apiKey, setApiKey] = useState('');
  const [result, setResult] = useState(null);

  return (
    <Card>
      <div className="border-line flex flex-wrap items-center justify-between gap-2 border-b px-5 py-4">
        <div>
          <h2 className="text-[15px] font-semibold">YouTube API key</h2>
          <p className="text-muted text-xs">
            The easiest one: anyone can add a YouTube channel from just its link. No login, no app
            review.
          </p>
        </div>
        <Status configured={info.configured} source={info.source} />
      </div>
      <form
        className="space-y-3 px-5 py-4"
        onSubmit={async (event) => {
          event.preventDefault();
          const body = await save.mutateAsync(apiKey.trim());
          setApiKey('');
          setResult(body.test);
        }}
      >
        <ol className="text-ink/85 list-decimal space-y-1.5 pl-5 text-sm">
          {info.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <a
          href={info.console}
          target="_blank"
          rel="noreferrer"
          className="text-accent inline-flex items-center gap-1 text-sm font-semibold hover:underline"
        >
          Open Google Cloud credentials <ExternalLink className="h-3.5 w-3.5" />
        </a>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={info.saved ? 'Saved (paste a new one to replace)' : 'AIza…'}
          autoComplete="new-password"
          className={inputClass}
        />
        {(save.error || clear.error) && (
          <p className="text-danger text-xs">{(save.error || clear.error).message}</p>
        )}
        <TestResult test={result} />
        <div className="flex flex-wrap justify-end gap-2">
          {info.saved && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                if (window.confirm('Remove the saved YouTube API key?')) {
                  setResult(null);
                  clear.mutate();
                }
              }}
              className="text-danger text-xs"
            >
              Remove key
            </Button>
          )}
          {info.configured && (
            <Button
              type="button"
              variant="ghost"
              disabled={test.isPending}
              onClick={async () => setResult((await test.mutateAsync()).test)}
              className="text-xs"
            >
              {test.isPending ? 'Testing…' : 'Test key'}
            </Button>
          )}
          <Button
            type="submit"
            disabled={save.isPending || !apiKey.trim()}
            className="pill-active gap-1.5 text-xs"
          >
            <KeyRound className="h-3.5 w-3.5" /> Save &amp; test
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function AdminSocialPage() {
  const { data, isPending, isError, error } = useAdminSocialApps();
  if (isError) return <Alert tone="error">{error.message}</Alert>;
  if (isPending) return <Skeleton className="h-64 w-full max-w-3xl" />;

  return (
    <>
      <PageHeader
        title="Social apps"
        description="Keys for 'Log in with Instagram / Facebook / YouTube / TikTok'. Saved encrypted; takes effect right away, no restart. Without them, people can still connect with Import with AI."
      />
      <div className="grid max-w-6xl gap-4 xl:grid-cols-2">
        <YoutubeKeyCard info={data.youtubeApiKey} />
        {data.apps.map((app) => (
          <AppCard key={app.id} app={app} />
        ))}
      </div>
    </>
  );
}

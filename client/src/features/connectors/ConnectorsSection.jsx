import { formatDistanceToNow } from 'date-fns';
import { Check, Copy, KeyRound, Plug, Plus, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { Alert } from '../../components/ui/Alert.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { chipClassName } from '../../components/ui/ChoiceChips.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { Skeleton } from '../../components/ui/Skeleton.jsx';
import { TextField } from '../../components/ui/TextField.jsx';
import { SettingsRow, SettingsSection } from '../account/SettingsSection.jsx';
import { WorkspaceAccessPicker } from './WorkspaceAccessPicker.jsx';
import {
  useConnectors,
  useCreateApiKey,
  useRevokeConnection,
  useUpdateConnectionWorkspaces,
} from './hooks.js';

const KEY_PLACEHOLDER = '<your API key>';

function useCopy() {
  const [copied, setCopied] = useState(null);
  async function copy(text, id = text) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied((current) => (current === id ? null : current)), 1600);
    } catch {
      // Clipboard blocked: the text is on screen to select by hand.
    }
  }
  return { copied, copy };
}

function CodeBlock({ children, label }) {
  const { copied, copy } = useCopy();
  return (
    <div className="border-line/70 bg-subtle/50 relative rounded-2xl border">
      <pre className="scrollbar-thin overflow-x-auto px-3.5 py-3 pr-12 font-mono text-[12.5px] leading-5">
        {children}
      </pre>
      <Button
        size="icon"
        variant="ghost"
        className="absolute right-1.5 top-1.5"
        aria-label={`Copy ${label}`}
        title="Copy"
        onClick={() => copy(children)}
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Setup steps per app

function jsonConfig(shape) {
  return JSON.stringify(shape, null, 2);
}

const GUIDES = [
  {
    id: 'claude',
    label: 'Claude',
    steps: () => [
      'In Claude (web or desktop), open Settings → Connectors.',
      'Choose "Add custom connector", name it FrameDesk and paste the server URL.',
      'Click Connect, sign in to FrameDesk and allow access. Then enable it from the tools menu in a chat.',
    ],
    snippet: (url) => url,
    snippetLabel: 'server URL',
  },
  {
    id: 'chatgpt',
    label: 'ChatGPT',
    steps: () => [
      'In ChatGPT, open Settings → Apps & Connectors → Advanced settings and turn on Developer mode.',
      'Create a new connector, name it FrameDesk, paste the server URL and pick OAuth as the authentication.',
      'Sign in to FrameDesk when asked and allow access. It works in chats and deep research.',
    ],
    snippet: (url) => url,
    snippetLabel: 'server URL',
  },
  {
    id: 'gemini',
    label: 'Gemini CLI',
    steps: () => [
      'Create an API key below.',
      'Add this to ~/.gemini/settings.json (or your project’s .gemini/settings.json), then restart Gemini CLI.',
      'Run /mcp in Gemini CLI to check FrameDesk is connected.',
    ],
    snippet: (url, key) =>
      jsonConfig({
        mcpServers: {
          framedesk: { httpUrl: url, headers: { Authorization: `Bearer ${key}` } },
        },
      }),
    snippetLabel: 'Gemini settings',
  },
  {
    id: 'claude-code',
    label: 'Claude Code',
    steps: () => [
      'Run this in your terminal, then type /mcp inside Claude Code to sign in.',
      'Prefer a key? Add --header "Authorization: Bearer <your API key>" to the command instead.',
    ],
    snippet: (url) => `claude mcp add --transport http framedesk ${url}`,
    snippetLabel: 'command',
  },
  {
    id: 'local',
    label: 'Local model / other',
    steps: () => [
      'Any MCP client that supports remote (Streamable HTTP) servers works: LM Studio, Cursor, VS Code, Open WebUI and others.',
      'Create an API key below and add FrameDesk to the client’s mcp.json. For LM Studio: Program → Install → Edit mcp.json.',
      'Your local model (Llama, Qwen, Mistral…) can then call FrameDesk’s tools. Pick a model that supports tool use.',
    ],
    snippet: (url, key) =>
      jsonConfig({
        mcpServers: {
          framedesk: { url, headers: { Authorization: `Bearer ${key}` } },
        },
      }),
    snippetLabel: 'mcp.json',
  },
];

function SetupGuide({ mcpUrl }) {
  const [active, setActive] = useState(GUIDES[0].id);
  const guide = GUIDES.find((item) => item.id === active);
  return (
    <div className="space-y-3.5">
      <div role="tablist" aria-label="AI app" className="flex flex-wrap gap-1.5">
        {GUIDES.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={item.id === active}
            onClick={() => setActive(item.id)}
            className={chipClassName(item.id === active)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <ol className="list-decimal space-y-1.5 pl-5 text-sm leading-6" role="tabpanel">
        {guide.steps().map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <CodeBlock label={guide.snippetLabel}>{guide.snippet(mcpUrl, KEY_PLACEHOLDER)}</CodeBlock>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Connections and keys

function accessLabel(connection, workspaces) {
  if (connection.allWorkspaces) return 'All workspaces';
  const names = connection.workspaceIds
    .map((id) => workspaces.find((workspace) => workspace.id === id)?.name)
    .filter(Boolean);
  if (names.length === 0) return 'No workspaces';
  return names.length <= 2 ? names.join(', ') : `${names.length} workspaces`;
}

function lastUsed(date) {
  return date ? `Used ${formatDistanceToNow(new Date(date), { addSuffix: true })}` : 'Never used';
}

function ConnectionRow({ connection, workspaces, onEdit }) {
  const revoke = useRevokeConnection();
  const [confirming, setConfirming] = useState(false);
  const isKey = connection.kind === 'api_key';

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
      <span className="bg-subtle grid h-9 w-9 shrink-0 place-items-center rounded-xl">
        {isKey ? (
          <KeyRound className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Plug className="h-4 w-4" aria-hidden="true" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
          <span className="truncate">{connection.name}</span>
          {connection.clientHost && <Badge tone="muted">{connection.clientHost}</Badge>}
        </p>
        <p className="text-muted truncate text-xs">
          {isKey && <span className="font-mono">{connection.keyPreview} · </span>}
          {accessLabel(connection, workspaces)} · {lastUsed(connection.lastUsedAt)}
        </p>
      </div>
      <div className="flex gap-1.5">
        {confirming ? (
          <>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              Keep
            </Button>
            <Button
              size="sm"
              variant="danger"
              loading={revoke.isPending}
              onClick={() => revoke.mutate(connection.id)}
            >
              {isKey ? 'Revoke key' : 'Disconnect'}
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="ghost" onClick={() => onEdit(connection)}>
              Access
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setConfirming(true)}>
              {isKey ? 'Revoke' : 'Disconnect'}
            </Button>
          </>
        )}
      </div>
    </li>
  );
}

function ConnectionList({ connections, workspaces, empty, onEdit }) {
  if (connections.length === 0) return <p className="text-muted text-sm">{empty}</p>;
  return (
    <ul className="divide-line/70 -my-3 divide-y">
      {connections.map((connection) => (
        <ConnectionRow
          key={connection.id}
          connection={connection}
          workspaces={workspaces}
          onEdit={onEdit}
        />
      ))}
    </ul>
  );
}

function EditAccessDialog({ connection, workspaces, onClose }) {
  const update = useUpdateConnectionWorkspaces();
  const [access, setAccess] = useState(() => ({
    allWorkspaces: connection?.allWorkspaces ?? true,
    workspaceIds: connection?.workspaceIds ?? [],
  }));
  const nothingPicked = !access.allWorkspaces && access.workspaceIds.length === 0;

  return (
    <Dialog
      open={Boolean(connection)}
      onClose={onClose}
      title={connection ? `What ${connection.name} can read` : ''}
      description="Changes apply to its next request."
    >
      <div className="space-y-4 pb-1">
        <WorkspaceAccessPicker workspaces={workspaces} value={access} onChange={setAccess} />
        {update.error && <Alert tone="error">{update.error.message}</Alert>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={update.isPending}
            disabled={nothingPicked}
            onClick={() => update.mutate({ id: connection.id, ...access }, { onSuccess: onClose })}
          >
            Save
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function CreateKeyDialog({ open, onClose, workspaces, mcpUrl }) {
  const create = useCreateApiKey();
  const [name, setName] = useState('');
  const [access, setAccess] = useState({ allWorkspaces: true, workspaceIds: [] });
  const created = create.data;

  function close() {
    create.reset();
    setName('');
    setAccess({ allWorkspaces: true, workspaceIds: [] });
    onClose();
  }

  function submit(event) {
    event.preventDefault();
    create.mutate({ name: name.trim(), ...access });
  }

  const nothingPicked = !access.allWorkspaces && access.workspaceIds.length === 0;

  return (
    <Dialog
      open={open}
      onClose={close}
      title={created ? 'Your new API key' : 'Create an API key'}
      description={
        created
          ? 'Copy it now. You won’t be able to see it again.'
          : 'For Gemini CLI, local models and scripts.'
      }
      wide
    >
      {created ? (
        <div className="space-y-4 pb-1">
          <CodeBlock label="API key">{created.key}</CodeBlock>
          <Alert tone="info">
            Anyone with this key can read the workspaces it covers. Keep it out of shared files and
            repositories.
          </Alert>
          <div>
            <p className="mb-1.5 text-sm font-medium">Ready-to-paste mcp.json</p>
            <CodeBlock label="mcp.json">
              {jsonConfig({
                mcpServers: {
                  framedesk: { url: mcpUrl, headers: { Authorization: `Bearer ${created.key}` } },
                },
              })}
            </CodeBlock>
            <p className="text-muted mt-1.5 text-xs">
              Gemini CLI uses <span className="font-mono">httpUrl</span> in place of{' '}
              <span className="font-mono">url</span>.
            </p>
          </div>
          <div className="flex justify-end">
            <Button onClick={close}>Done</Button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4 pb-1">
          <TextField
            id="connector-key-name"
            label="Name"
            placeholder="e.g. Gemini CLI on my laptop"
            value={name}
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
            error={create.error?.fieldError?.('name')}
            autoFocus
          />
          <div>
            <p className="mb-2 text-sm font-medium">Workspaces it can read</p>
            <WorkspaceAccessPicker workspaces={workspaces} value={access} onChange={setAccess} />
          </div>
          {create.error && !create.error.details && (
            <Alert tone="error">{create.error.message}</Alert>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button
              type="submit"
              loading={create.isPending}
              disabled={!name.trim() || nothingPicked}
            >
              Create key
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

export function ConnectorsSection() {
  const { data, isPending, error } = useConnectors();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);

  if (isPending) return <Skeleton className="h-96 rounded-3xl" />;
  if (error) return <Alert tone="error">{error.message}</Alert>;

  const { connections, workspaces, mcpUrl } = data;
  const apps = connections.filter((connection) => connection.kind === 'oauth');
  const keys = connections.filter((connection) => connection.kind === 'api_key');
  const isLocal = /^http:\/\/(localhost|127\.0\.0\.1)/.test(mcpUrl);

  return (
    <>
      <SettingsSection
        title="AI connectors"
        description="Ask Claude, ChatGPT, Gemini or a local model about your projects, tasks, clients and files. Read-only, and limited to what you can see."
      >
        <SettingsRow
          label="Server URL"
          description="FrameDesk speaks MCP, the open standard AI apps use for connectors."
        >
          <div className="space-y-2">
            <CodeBlock label="server URL">{mcpUrl}</CodeBlock>
            {isLocal && (
              <p className="text-muted flex gap-1.5 text-xs">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                This is a local address: Claude.ai and ChatGPT can only reach the live site.
              </p>
            )}
          </div>
        </SettingsRow>
        <SettingsRow label="Set it up" description="Pick the app you use.">
          <SetupGuide mcpUrl={mcpUrl} />
        </SettingsRow>
        <SettingsRow
          label="Connected apps"
          description="Apps you signed in to with your FrameDesk account."
        >
          <ConnectionList
            connections={apps}
            workspaces={workspaces}
            empty="No apps connected yet."
            onEdit={setEditing}
          />
        </SettingsRow>
        <SettingsRow
          label="API keys"
          description="For apps that take a key instead of signing in. Each key can be revoked on its own."
        >
          <div className="space-y-4">
            <ConnectionList
              connections={keys}
              workspaces={workspaces}
              empty="No keys yet."
              onEdit={setEditing}
            />
            <Button size="sm" variant="secondary" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Create API key
            </Button>
          </div>
        </SettingsRow>
      </SettingsSection>

      <CreateKeyDialog
        open={creating}
        onClose={() => setCreating(false)}
        workspaces={workspaces}
        mcpUrl={mcpUrl}
      />
      {editing && (
        <EditAccessDialog
          key={editing.id}
          connection={editing}
          workspaces={workspaces}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

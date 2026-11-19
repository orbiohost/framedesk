import {
  ArrowLeft,
  Bot,
  Brain,
  FileText,
  Lock,
  MessageSquare,
  NotebookPen,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  Users,
  Wand2,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { EmptyState } from '../../components/ui/EmptyState.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { SegmentedControl } from '../../components/ui/SegmentedControl.jsx';
import { Skeleton } from '../../components/ui/Skeleton.jsx';
import { AgentBadge } from '../../features/ai/AgentBadge.jsx';
import { useAiStatus } from '../../features/ai/hooks.js';
import { AgentEditorDialog } from '../../features/ai/studio/AgentEditorDialog.jsx';
import { MemoryPanel } from '../../features/ai/studio/MemoryPanel.jsx';
import { SkillEditorDialog } from '../../features/ai/studio/SkillEditorDialog.jsx';
import { SkillsPanel } from '../../features/ai/studio/SkillsPanel.jsx';
import { useAiAgents, useAiSkills, useDeleteAgent } from '../../features/ai/studioHooks.js';
import { ConfirmDialog } from '../../features/files/FileDialogs.jsx';
import { canEdit } from '../../features/workspaces/roles.js';
import { removeLocal, writeLocal } from '../../lib/storage.js';

const TABS = [
  { value: 'assistants', label: 'Assistants', icon: Bot },
  { value: 'skills', label: 'Skills', icon: Wand2 },
  { value: 'memory', label: 'Memory', icon: Brain },
];

function VisibilityTag({ visibility }) {
  const shared = visibility === 'workspace';
  const Icon = shared ? Users : Lock;
  return (
    <span className="text-muted inline-flex items-center gap-1 text-[11px]">
      <Icon className="h-3 w-3" aria-hidden="true" />
      {shared ? 'Team' : 'Only you'}
    </span>
  );
}

function AgentCard({ agent, onChat, onEdit, onDelete }) {
  const facts = [
    agent.files.length && { icon: FileText, text: `${agent.files.length} files` },
    agent.notes.length && { icon: NotebookPen, text: `${agent.notes.length} notes` },
    agent.skills.length && { icon: Wand2, text: `${agent.skills.length} skills` },
    agent.knowledge && { icon: Brain, text: 'Knowledge' },
  ].filter(Boolean);
  return (
    <article className="border-line/70 bg-surface shadow-soft group flex flex-col rounded-3xl border p-4 transition-shadow hover:shadow-md">
      <div className="flex items-start gap-3">
        <AgentBadge agent={agent} size="lg" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold">{agent.name}</h3>
          <div className="flex flex-wrap items-center gap-x-2">
            <VisibilityTag visibility={agent.visibility} />
            {agent.createdBy && agent.visibility === 'workspace' && (
              <span className="text-muted truncate text-[11px]">by {agent.createdBy.name}</span>
            )}
          </div>
        </div>
      </div>
      <p className="text-muted mt-3 line-clamp-2 min-h-[2.5rem] text-sm">
        {agent.description || agent.instructions || 'No description yet.'}
      </p>
      {facts.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {facts.map(({ icon: Icon, text }) => (
            <li
              key={text}
              className="bg-subtle text-ink/75 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
            >
              <Icon className="h-3 w-3" aria-hidden="true" />
              {text}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 flex items-center gap-1.5 pt-1">
        <Button size="sm" onClick={onChat} className="flex-1">
          <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
          Chat
        </Button>
        {agent.canEdit && (
          <>
            <Button
              size="icon"
              variant="secondary"
              aria-label={`Edit ${agent.name}`}
              onClick={onEdit}
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              aria-label={`Delete ${agent.name}`}
              onClick={onDelete}
              className="hover:!text-danger"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </>
        )}
      </div>
    </article>
  );
}

function AssistantsTab({ workspace, agents, onCreate, onEdit }) {
  const navigate = useNavigate();
  const remove = useDeleteAgent(workspace.id);
  const [deleting, setDeleting] = useState(null);

  function chatWith(agent) {
    // A fresh chat with this assistant on the AI page.
    writeLocal(`ai:agent:${workspace.id}`, agent.id);
    removeLocal(`ai:thread:${workspace.id}`);
    navigate(`/w/${workspace.id}/ai`);
  }

  if (agents.isPending) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((key) => (
          <Skeleton key={key} className="h-52 rounded-3xl" />
        ))}
      </div>
    );
  }
  if (agents.isError) return <Alert tone="error">{agents.error.message}</Alert>;

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <button
          type="button"
          onClick={onCreate}
          className="border-line hover:border-accent/50 hover:bg-subtle/50 group flex min-h-52 flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed p-4 text-center transition-colors"
        >
          <span className="bg-lavender text-accent dark:text-ink grid h-12 w-12 place-items-center rounded-full transition-transform group-hover:scale-110">
            <Plus className="h-5 w-5" aria-hidden="true" />
          </span>
          <span>
            <span className="block font-semibold">Create an assistant</span>
            <span className="text-muted block text-sm">
              Your own AI with a name, personality and knowledge
            </span>
          </span>
        </button>
        {agents.data.map((agent) => (
          <AgentCard
            key={agent.id}
            agent={agent}
            onChat={() => chatWith(agent)}
            onEdit={() => onEdit(agent)}
            onDelete={() => setDeleting(agent)}
          />
        ))}
      </div>
      <ConfirmDialog
        open={Boolean(deleting)}
        title={`Delete ${deleting?.name ?? 'assistant'}?`}
        confirmLabel="Delete"
        pending={remove.isPending}
        error={remove.error?.message}
        onClose={() => setDeleting(null)}
        onConfirm={() => remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}
      >
        {deleting?.visibility === 'workspace'
          ? 'It disappears for the whole team. Past chats stay, but can’t be continued.'
          : 'Past chats stay in your history, but can’t be continued.'}
      </ConfirmDialog>
    </>
  );
}

// The studio's tabs (assistants, skills, memory) and their editors. Used by the
// AI studio page and the "AI assistant" tab of the profile settings.
// `param`: the search param that holds the open section.
export function AiStudio({ workspace, param = 'tab' }) {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((item) => item.value === params.get(param))
    ? params.get(param)
    : 'assistants';
  const agents = useAiAgents(workspace.id);
  const skills = useAiSkills(workspace.id);
  const canShare = canEdit(workspace);
  // { kind: 'agent' | 'skill', item?, copyOf? }
  const [editor, setEditor] = useState(() =>
    params.get('new') === 'agent' ? { kind: 'agent' } : null,
  );

  function setTab(value) {
    setParams(
      (current) => {
        current.set(param, value);
        current.delete('new');
        return current;
      },
      { replace: true },
    );
  }

  function closeEditor() {
    setEditor(null);
    if (params.get('new')) {
      setParams(
        (current) => {
          current.delete('new');
          return current;
        },
        { replace: true },
      );
    }
  }

  return (
    <>
      <SegmentedControl
        label="AI studio section"
        options={TABS}
        value={tab}
        onChange={setTab}
        className="mb-5"
      />
      <div className="animate-[fade-in_160ms_ease-out]" key={tab}>
        {tab === 'assistants' && (
          <AssistantsTab
            workspace={workspace}
            agents={agents}
            onCreate={() => setEditor({ kind: 'agent' })}
            onEdit={(item) => setEditor({ kind: 'agent', item })}
          />
        )}
        {tab === 'skills' && (
          <SkillsPanel
            workspace={workspace}
            skills={skills}
            onCreate={({ ai } = {}) => setEditor({ kind: 'skill', ai })}
            onEdit={(item) => setEditor({ kind: 'skill', item })}
            onCopy={(copyOf) => setEditor({ kind: 'skill', copyOf })}
          />
        )}
        {tab === 'memory' && <MemoryPanel workspaceId={workspace.id} agents={agents.data ?? []} />}
      </div>

      {editor?.kind === 'agent' && (
        <AgentEditorDialog
          workspaceId={workspace.id}
          agent={editor.item ?? null}
          canShare={canShare}
          onClose={closeEditor}
          onSaved={closeEditor}
        />
      )}
      {editor?.kind === 'skill' && (
        <SkillEditorDialog
          workspaceId={workspace.id}
          skill={editor.item ?? null}
          copyOf={editor.copyOf ?? null}
          startWithAi={Boolean(editor.ai)}
          canShare={canShare}
          onClose={closeEditor}
          onSaved={closeEditor}
        />
      )}
    </>
  );
}

export function AiStudioUnavailable() {
  return (
    <EmptyState icon={Sparkles} title="The AI assistant isn’t available right now">
      It has been switched off for this account.
    </EmptyState>
  );
}

// AI studio: build your own assistants, save skills, and see what the AI remembers.
export function AiStudioPage() {
  const { workspace } = useOutletContext();
  const status = useAiStatus(workspace.id);
  if (status.data && !status.data.enabled) return <AiStudioUnavailable />;

  return (
    <div className="mx-auto w-full max-w-5xl">
      <Link
        to={`/w/${workspace.id}/ai`}
        className="text-muted hover:text-ink mb-3 inline-flex items-center gap-1.5 text-sm transition-colors"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to Ask AI
      </Link>
      <PageHeader
        eyebrow="AI studio"
        title="Make the AI your own"
        description="Build custom assistants trained on your knowledge, save reusable skills, and control what the AI remembers about you."
      />
      <AiStudio workspace={workspace} />
    </div>
  );
}

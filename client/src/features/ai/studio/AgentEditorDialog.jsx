import { Brain, Check, Lock, Plus, Users, X } from 'lucide-react';
import { useState } from 'react';
import { Alert } from '../../../components/ui/Alert.jsx';
import { Button } from '../../../components/ui/Button.jsx';
import { Dialog, DialogActions } from '../../../components/ui/Dialog.jsx';
import { SegmentedControl } from '../../../components/ui/SegmentedControl.jsx';
import { Switch } from '../../../components/ui/Switch.jsx';
import { TextAreaField } from '../../../components/ui/TextAreaField.jsx';
import { TextField } from '../../../components/ui/TextField.jsx';
import { cn } from '../../../lib/cn.js';
import { AGENT_COLORS, AgentBadge } from '../AgentBadge.jsx';
import { useAiSkills, useSaveAgent } from '../studioHooks.js';
import { KnowledgePicker } from './KnowledgePicker.jsx';

const MAX_FILES = 10;
const MAX_NOTES = 10;
const MAX_SKILLS = 8;
const MAX_STARTERS = 4;

const CREATIVITY = [
  { value: 0.1, label: 'Precise' },
  { value: 0.4, label: 'Balanced' },
  { value: 0.8, label: 'Creative' },
];

const VISIBILITY = [
  { value: 'private', label: 'Only me', icon: Lock },
  { value: 'workspace', label: 'Whole team', icon: Users },
];

// Starting points for a new assistant; everything stays editable.
export const AGENT_TEMPLATES = [
  {
    key: 'blank',
    name: '',
    emoji: '',
    color: 'violet',
    label: 'Start from scratch',
    description: '',
    instructions: '',
    skills: [],
    starters: [],
    creativity: 0.4,
  },
  {
    key: 'script',
    label: 'Script doctor',
    name: 'Script Doctor',
    emoji: '🎬',
    color: 'amber',
    description: 'Reviews scripts and cuts, suggests hooks and pacing fixes.',
    instructions:
      'You are a senior video script editor. Give direct, specific notes on hooks, structure, pacing and dialogue. Always quote the line or timestamp you are talking about and suggest a rewrite. Keep a supportive but honest tone.',
    skills: ['builtin:feedback', 'builtin:shotlist'],
    starters: ['Review the hook of my latest video', 'Tighten this script to 60 seconds'],
    creativity: 0.6,
  },
  {
    key: 'social',
    label: 'Social media manager',
    name: 'Social Manager',
    emoji: '📣',
    color: 'rose',
    description: 'Writes captions, hashtags and YouTube copy in our brand voice.',
    instructions:
      'You manage social media for our brand. Write in our brand voice (see YOUR KNOWLEDGE). Keep captions punchy, use emojis sparingly, and always offer 2–3 options.',
    skills: ['builtin:social', 'builtin:youtube'],
    starters: ['Write captions for our newest reel', 'YouTube description for the latest upload'],
    creativity: 0.8,
  },
  {
    key: 'client',
    label: 'Client communicator',
    name: 'Client Desk',
    emoji: '💼',
    color: 'blue',
    description: 'Drafts client emails, updates and proposals.',
    instructions:
      'You help the team talk to clients. Be polite, clear and confident. Never promise dates or prices that are not in the knowledge or files; leave them as [placeholders] instead.',
    skills: ['builtin:client-email', 'builtin:proposal', 'builtin:meeting'],
    starters: ['Draft a project update for the client', 'Write a proposal for a 3-video package'],
    creativity: 0.4,
  },
];

function fromAgent(agent, template) {
  const source = agent ?? template ?? AGENT_TEMPLATES[0];
  return {
    name: source.name ?? '',
    emoji: source.emoji ?? '',
    color: source.color ?? 'violet',
    description: source.description ?? '',
    instructions: source.instructions ?? '',
    knowledge: agent?.knowledge ?? '',
    files: agent?.files ?? [],
    notes: agent?.notes ?? [],
    skills: source.skills ?? [],
    starters: source.starters ?? [],
    creativity: source.creativity ?? 0.4,
    useMemory: agent?.useMemory ?? true,
    visibility: agent?.visibility ?? 'private',
  };
}

function nearestCreativity(value) {
  return CREATIVITY.reduce((best, option) =>
    Math.abs(option.value - value) < Math.abs(best.value - value) ? option : best,
  ).value;
}

function Section({ title, hint, children }) {
  return (
    <section className="space-y-2">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {hint && <p className="text-muted text-xs">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

// Create or edit a custom assistant. agent: null to create.
export function AgentEditorDialog({ workspaceId, agent, canShare, onClose, onSaved }) {
  const [template, setTemplate] = useState(agent ? null : 'blank');
  const [form, setForm] = useState(() => fromAgent(agent));
  const [starterDraft, setStarterDraft] = useState('');
  const skills = useAiSkills(workspaceId);
  const save = useSaveAgent(workspaceId);
  const set = (key) => (value) => setForm((current) => ({ ...current, [key]: value }));

  function applyTemplate(key) {
    setTemplate(key);
    setForm((current) => ({
      ...fromAgent(
        null,
        AGENT_TEMPLATES.find((item) => item.key === key),
      ),
      knowledge: current.knowledge,
      files: current.files,
      notes: current.notes,
      visibility: current.visibility,
    }));
  }

  function toggleSkill(id) {
    setForm((current) => ({
      ...current,
      skills: current.skills.includes(id)
        ? current.skills.filter((skill) => skill !== id)
        : current.skills.length >= MAX_SKILLS
          ? current.skills
          : [...current.skills, id],
    }));
  }

  function addStarter() {
    const text = starterDraft.trim();
    if (!text || form.starters.length >= MAX_STARTERS) return;
    set('starters')([...form.starters, text]);
    setStarterDraft('');
  }

  function submit(event) {
    event.preventDefault();
    const knownSkills = new Set((skills.data ?? []).map((skill) => skill.id));
    save.mutate(
      {
        ...(agent && { id: agent.id }),
        name: form.name.trim(),
        emoji: form.emoji.trim(),
        color: form.color,
        description: form.description.trim(),
        instructions: form.instructions.trim(),
        knowledge: form.knowledge.trim(),
        fileIds: form.files.map((file) => file.id),
        noteIds: form.notes.map((note) => note.id),
        skills: skills.data ? form.skills.filter((id) => knownSkills.has(id)) : form.skills,
        starters: form.starters,
        creativity: form.creativity,
        useMemory: form.useMemory,
        visibility: canShare ? form.visibility : 'private',
      },
      { onSuccess: (saved) => onSaved?.(saved) },
    );
  }

  return (
    <Dialog
      open
      wide
      onClose={onClose}
      title={agent ? `Edit ${agent.name}` : 'Create your own assistant'}
      description="Give it a name, a personality and the knowledge it should always have. It learns your preferences as you chat."
    >
      <form onSubmit={submit} className="space-y-6">
        {save.error && <Alert tone="error">{save.error.message}</Alert>}

        {!agent && (
          <Section title="Start from">
            <div className="grid gap-2 sm:grid-cols-4">
              {AGENT_TEMPLATES.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => applyTemplate(item.key)}
                  aria-pressed={template === item.key}
                  className={cn(
                    'flex items-center gap-2 rounded-2xl border px-3 py-2.5 text-left text-sm transition-colors',
                    template === item.key
                      ? 'border-accent/50 bg-lavender/50 dark:bg-lavender/20'
                      : 'border-line/70 hover:bg-subtle',
                  )}
                >
                  <span className="text-base leading-none" aria-hidden="true">
                    {item.emoji || '✨'}
                  </span>
                  <span className="min-w-0 truncate font-medium">{item.label}</span>
                </button>
              ))}
            </div>
          </Section>
        )}

        <Section title="Identity">
          <div className="flex items-start gap-3">
            <AgentBadge
              agent={{ name: form.name || '?', emoji: form.emoji, color: form.color }}
              size="xl"
              className="mt-1"
            />
            <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-[5.5rem_1fr]">
              <TextField
                id="agent-emoji"
                label="Emoji"
                value={form.emoji}
                maxLength={8}
                placeholder="🤖"
                onChange={(event) => set('emoji')(event.target.value)}
              />
              <TextField
                id="agent-name"
                label="Name"
                value={form.name}
                maxLength={60}
                required
                autoFocus={Boolean(agent)}
                placeholder="e.g. Script Doctor"
                onChange={(event) => set('name')(event.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Colour">
            {Object.entries(AGENT_COLORS).map(([key, className]) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={form.color === key}
                aria-label={key}
                onClick={() => set('color')(key)}
                className={cn(
                  className,
                  'grid h-7 w-7 place-items-center rounded-full text-white transition-transform hover:scale-110',
                  form.color === key && 'ring-ink/70 ring-offset-surface ring-2 ring-offset-2',
                )}
              >
                {form.color === key && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
              </button>
            ))}
          </div>
          <TextField
            id="agent-description"
            label="What it’s for"
            value={form.description}
            maxLength={200}
            placeholder="One line shown under its name"
            onChange={(event) => set('description')(event.target.value)}
          />
        </Section>

        <Section
          title="Personality"
          hint="How it should behave: its role, tone, rules and the format of its answers."
        >
          <TextAreaField
            id="agent-instructions"
            label="Instructions"
            rows={5}
            maxLength={8000}
            value={form.instructions}
            placeholder="You are our in-house video editor. Answer in short bullet points, always mention timestamps, and write in a friendly, casual tone…"
            onChange={(event) => set('instructions')(event.target.value)}
            dictationWorkspaceId={workspaceId}
          />
        </Section>

        <Section
          title="Knowledge"
          hint="What it should always know: brand guide, price list, style rules, example answers. This is how you train it."
        >
          <TextAreaField
            id="agent-knowledge"
            label="Knowledge"
            rows={5}
            maxLength={30000}
            value={form.knowledge}
            placeholder={
              'Brand voice: warm, witty, never salesy.\nRates: 30s reel ₹8,000 · 60s ₹12,000\nAlways sign off with "— Team Orbio"'
            }
            onChange={(event) => set('knowledge')(event.target.value)}
            hint={`${form.knowledge.length.toLocaleString()} / 30,000 characters`}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Files it always reads</p>
              <KnowledgePicker
                workspaceId={workspaceId}
                kind="file"
                value={form.files}
                onChange={set('files')}
                max={MAX_FILES}
              />
            </div>
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Saved notes it always reads</p>
              <KnowledgePicker
                workspaceId={workspaceId}
                kind="note"
                value={form.notes}
                onChange={set('notes')}
                max={MAX_NOTES}
              />
            </div>
          </div>
        </Section>

        <Section
          title="Skills"
          hint={`Abilities it uses when a request calls for them (up to ${MAX_SKILLS}). Anyone can also pick one with “!” in the chat.`}
        >
          {skills.isPending ? (
            <p className="text-muted text-sm">Loading skills…</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {(skills.data ?? []).map((skill) => {
                const on = form.skills.includes(skill.id);
                return (
                  <button
                    key={skill.id}
                    type="button"
                    aria-pressed={on}
                    title={skill.description}
                    onClick={() => toggleSkill(skill.id)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                      on
                        ? 'border-fuchsia-400/50 bg-fuchsia-50 text-fuchsia-900 dark:bg-fuchsia-400/15 dark:text-fuchsia-100'
                        : 'border-line/70 text-ink/75 hover:bg-subtle',
                    )}
                  >
                    {skill.emoji && <span aria-hidden="true">{skill.emoji}</span>}
                    {skill.name}
                    {on && <Check className="h-3 w-3" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          )}
        </Section>

        <Section
          title="Conversation starters"
          hint="Suggested first questions on its welcome screen."
        >
          {form.starters.length > 0 && (
            <ul className="space-y-1.5">
              {form.starters.map((starter, index) => (
                <li
                  key={`${starter}-${index}`}
                  className="border-line/70 flex items-center gap-2 rounded-xl border px-3 py-2 text-sm"
                >
                  <span className="min-w-0 flex-1 truncate">{starter}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${starter}`}
                    onClick={() =>
                      set('starters')(form.starters.filter((_, other) => other !== index))
                    }
                    className="text-muted hover:bg-subtle hover:text-ink grid h-6 w-6 place-items-center rounded-full"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {form.starters.length < MAX_STARTERS && (
            <div className="flex gap-2">
              <input
                value={starterDraft}
                maxLength={160}
                onChange={(event) => setStarterDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    addStarter();
                  }
                }}
                placeholder="e.g. Review my latest edit"
                aria-label="New conversation starter"
                className="border-line bg-surface focus:border-accent/60 focus:ring-accent/15 h-10 min-w-0 flex-1 rounded-xl border px-3 text-sm outline-none focus:ring-4"
              />
              <Button
                type="button"
                variant="secondary"
                onClick={addStarter}
                disabled={!starterDraft.trim()}
              >
                <Plus className="h-4 w-4" aria-hidden="true" /> Add
              </Button>
            </div>
          )}
        </Section>

        <Section title="Behaviour">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="space-y-1.5">
              <p className="text-xs font-medium">Style</p>
              <SegmentedControl
                label="Style"
                options={CREATIVITY}
                value={nearestCreativity(form.creativity)}
                onChange={set('creativity')}
              />
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-medium">Who can use it</p>
              <SegmentedControl
                label="Who can use it"
                options={canShare ? VISIBILITY : VISIBILITY.slice(0, 1)}
                value={canShare ? form.visibility : 'private'}
                onChange={set('visibility')}
              />
            </div>
          </div>
          <Switch
            checked={form.useMemory}
            onChange={set('useMemory')}
            label="Use memory"
            description="remembers what you tell it across chats"
          />
          {form.visibility === 'workspace' && canShare && (
            <p className="text-muted flex items-start gap-1.5 text-xs">
              <Brain className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              Teammates use your instructions and knowledge, but each person’s memories stay private
              to them. Knowledge files they can’t open are skipped for them.
            </p>
          )}
        </Section>

        <DialogActions>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={save.isPending} disabled={!form.name.trim()}>
            {agent ? 'Save changes' : 'Create assistant'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

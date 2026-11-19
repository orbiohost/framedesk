import {
  ChevronDown,
  Download,
  FlaskConical,
  Lock,
  Play,
  RotateCcw,
  Sparkles,
  Users,
  Wand2,
} from 'lucide-react';
import { useState } from 'react';
import { Alert } from '../../../components/ui/Alert.jsx';
import { Button } from '../../../components/ui/Button.jsx';
import { Dialog, DialogActions } from '../../../components/ui/Dialog.jsx';
import { SegmentedControl } from '../../../components/ui/SegmentedControl.jsx';
import { SelectField } from '../../../components/ui/SelectField.jsx';
import { TextAreaField } from '../../../components/ui/TextAreaField.jsx';
import { TextField } from '../../../components/ui/TextField.jsx';
import { cn } from '../../../lib/cn.js';
import { AiMessageText } from '../AiMessageText.jsx';
import { AI_GRADIENT, AI_TEXT } from '../aiStyle.js';
import { useGenerateSkill, useSaveSkill, useTestSkill } from '../studioHooks.js';
import { downloadSkills, SKILL_CATEGORY_LABELS } from './skillFile.js';

const VISIBILITY = [
  { value: 'private', label: 'Only me', icon: Lock },
  { value: 'workspace', label: 'Whole team', icon: Users },
];

const CATEGORY_OPTIONS = Object.entries(SKILL_CATEGORY_LABELS).map(([value, label]) => ({
  value,
  label,
}));

// Ideas for an empty "describe your skill" box.
const IDEAS = [
  'Instagram carousel script, 7 slides',
  'Follow-up email to a client after a shoot',
  'Thumbnail text ideas for a YouTube video',
  'Wedding film highlights summary for the couple',
];

// One-tap changes for "Improve with AI".
const IMPROVEMENTS = [
  'More detailed and specific',
  'Shorter answers',
  'Use a table',
  'Friendlier tone',
  'Add Hinglish support',
  'Write a better example',
];

function emptyForm(source, isEdit) {
  return {
    name: source ? (isEdit ? source.name : `${source.name} (my version)`) : '',
    emoji: source?.emoji ?? '',
    category: source?.category ?? 'other',
    description: source?.description ?? '',
    instructions: source?.instructions ?? '',
    example: source?.example ?? '',
    visibility: isEdit ? (source.visibility ?? 'private') : 'private',
  };
}

// The AI writer at the top of the editor: generate a skill from a
// description, or improve the one being edited.
function AiWriter({ workspaceId, form, onDraft, autoFocus }) {
  const hasSkill = form.instructions.trim().length >= 10;
  const [request, setRequest] = useState('');
  const generate = useGenerateSkill(workspaceId);

  function run(text) {
    const wanted = (text ?? request).trim();
    if (!hasSkill && wanted.length < 3) return;
    generate.mutate(
      hasSkill
        ? {
            request: wanted || undefined,
            base: {
              name: form.name,
              description: form.description,
              category: form.category,
              instructions: form.instructions,
              example: form.example,
            },
          }
        : { request: wanted },
      {
        onSuccess: ({ draft }) => {
          onDraft(draft);
          setRequest('');
        },
      },
    );
  }

  return (
    <section className="relative overflow-hidden rounded-2xl border border-fuchsia-400/30 p-3.5 sm:p-4">
      <div
        className={cn(AI_GRADIENT, 'pointer-events-none absolute inset-0 opacity-[0.06]')}
        aria-hidden="true"
      />
      <div className="relative space-y-3">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              AI_GRADIENT,
              'grid h-7 w-7 shrink-0 place-items-center rounded-full text-white',
            )}
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className={cn(AI_TEXT, 'text-sm font-semibold')}>
              {hasSkill ? 'Improve with AI' : 'Generate with AI'}
            </p>
            <p className="text-muted text-xs">
              {hasSkill
                ? 'Tell it what to change, or pick a quick fix.'
                : 'Describe the skill in plain words; AI writes the instructions and an example.'}
            </p>
          </div>
        </div>

        {hasSkill && (
          <div className="flex flex-wrap gap-1.5">
            {IMPROVEMENTS.map((text) => (
              <button
                key={text}
                type="button"
                disabled={generate.isPending}
                onClick={() => run(text)}
                className="border-line/70 bg-surface/80 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors hover:border-fuchsia-400/50 disabled:opacity-50"
              >
                {text}
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-2 sm:flex-row">
          <textarea
            value={request}
            rows={hasSkill ? 1 : 2}
            maxLength={1000}
            onChange={(event) => setRequest(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                run();
              }
            }}
            placeholder={
              hasSkill
                ? 'e.g. Always end with 3 hashtag sets'
                : 'e.g. Turn a raw interview transcript into 5 quotable pull-quotes with timestamps'
            }
            aria-label={hasSkill ? 'What to improve' : 'Describe the skill'}
            autoFocus={autoFocus}
            className="border-line bg-surface min-h-10 min-w-0 flex-1 resize-none rounded-xl border px-3 py-2 text-sm outline-none focus:border-fuchsia-400/60 focus:ring-4 focus:ring-fuchsia-500/10"
          />
          <Button
            type="button"
            onClick={() => run()}
            loading={generate.isPending}
            disabled={!hasSkill && request.trim().length < 3}
            className={cn(AI_GRADIENT, 'text-white sm:self-start')}
          >
            <Wand2 className="h-4 w-4" aria-hidden="true" />
            {hasSkill ? 'Improve' : 'Generate'}
          </Button>
        </div>

        {!hasSkill && !request && (
          <div className="flex flex-wrap gap-1.5">
            {IDEAS.map((idea) => (
              <button
                key={idea}
                type="button"
                onClick={() => setRequest(idea)}
                className="text-muted hover:text-ink text-xs underline-offset-2 hover:underline"
              >
                {idea}
              </button>
            ))}
          </div>
        )}
        {generate.error && <Alert tone="error">{generate.error.message}</Alert>}
      </div>
    </section>
  );
}

// "Test it": runs the current (unsaved) skill on a sample request.
function TestPanel({ workspaceId, form }) {
  const [input, setInput] = useState('');
  const test = useTestSkill(workspaceId);
  const ready = form.instructions.trim().length >= 10;

  function run() {
    if (!ready || !input.trim()) return;
    test.mutate({
      name: form.name.trim() || undefined,
      instructions: form.instructions.trim(),
      example: form.example.trim() || undefined,
      input: input.trim(),
    });
  }

  return (
    <section className="border-line/70 bg-subtle/40 space-y-2.5 rounded-2xl border p-3.5">
      <div className="flex items-center gap-2">
        <FlaskConical className="text-muted h-4 w-4" aria-hidden="true" />
        <p className="text-sm font-semibold">Test it</p>
        <p className="text-muted text-xs">Try the skill before saving. Uses a little AI usage.</p>
      </div>
      <div className="flex gap-2">
        <input
          value={input}
          maxLength={4000}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              run();
            }
          }}
          disabled={!ready}
          placeholder={
            ready ? 'e.g. A 2-minute vlog about our Goa shoot' : 'Write instructions first'
          }
          aria-label="Sample request"
          className="border-line bg-surface focus:border-accent/60 focus:ring-accent/15 h-10 min-w-0 flex-1 rounded-xl border px-3 text-sm outline-none focus:ring-4 disabled:opacity-60"
        />
        <Button
          type="button"
          variant="secondary"
          onClick={run}
          loading={test.isPending}
          disabled={!ready || !input.trim()}
        >
          <Play className="h-3.5 w-3.5" aria-hidden="true" /> Run
        </Button>
      </div>
      {test.error && <Alert tone="error">{test.error.message}</Alert>}
      {test.data?.output && (
        <div className="border-line/70 bg-surface scrollbar-thin max-h-80 animate-[fade-in_160ms_ease-out] overflow-y-auto rounded-xl border p-3.5">
          <AiMessageText text={test.data.output} files={new Map()} onOpenFile={() => {}} />
        </div>
      )}
    </section>
  );
}

// Create or edit a skill, with AI to write, improve and test it.
// skill: the one being edited (null to create); copyOf: prefill from another skill.
export function SkillEditorDialog({
  workspaceId,
  skill,
  copyOf,
  canShare,
  startWithAi = false,
  onClose,
  onSaved,
}) {
  const isEdit = Boolean(skill);
  const [form, setForm] = useState(() => emptyForm(skill ?? copyOf, isEdit));
  // The fields before the last AI change, so it can be undone.
  const [previous, setPrevious] = useState(null);
  const [showExample, setShowExample] = useState(Boolean((skill ?? copyOf)?.example));
  const save = useSaveSkill(workspaceId);
  const set = (key) => (value) => setForm((current) => ({ ...current, [key]: value }));

  function applyDraft(draft) {
    setPrevious(form);
    setForm((current) => ({
      ...current,
      name: draft.name || current.name,
      emoji: draft.emoji || current.emoji,
      category: draft.category || current.category,
      description: draft.description || current.description,
      instructions: draft.instructions || current.instructions,
      example: draft.example ?? current.example,
    }));
    if (draft.example) setShowExample(true);
  }

  function submit(event) {
    event.preventDefault();
    save.mutate(
      {
        ...(skill && { id: skill.id }),
        name: form.name.trim(),
        emoji: form.emoji.trim(),
        category: form.category,
        description: form.description.trim(),
        instructions: form.instructions.trim(),
        example: form.example.trim(),
        visibility: canShare ? form.visibility : 'private',
      },
      { onSuccess: (saved) => onSaved?.(saved) },
    );
  }

  const valid = form.name.trim() && form.instructions.trim().length >= 10;

  return (
    <Dialog
      open
      wide
      onClose={onClose}
      title={isEdit ? `Edit ${skill.name}` : copyOf ? `Customise ${copyOf.name}` : 'New skill'}
      description="A skill is a saved instruction for a kind of answer. Pick it with “!” in the chat, or switch it on for an assistant."
    >
      <form onSubmit={submit} className="space-y-5">
        {save.error && <Alert tone="error">{save.error.message}</Alert>}

        <AiWriter
          workspaceId={workspaceId}
          form={form}
          onDraft={applyDraft}
          autoFocus={startWithAi}
        />
        {previous && (
          <div className="text-muted -mt-2 flex items-center justify-between gap-2 px-1 text-xs">
            <span>AI updated the skill below. Review it before saving.</span>
            <button
              type="button"
              onClick={() => {
                setForm(previous);
                setPrevious(null);
              }}
              className="hover:text-ink inline-flex items-center gap-1 font-medium"
            >
              <RotateCcw className="h-3 w-3" aria-hidden="true" /> Undo
            </button>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-[5.5rem_1fr_11rem]">
          <TextField
            id="skill-emoji"
            label="Emoji"
            value={form.emoji}
            maxLength={8}
            placeholder="✨"
            onChange={(event) => set('emoji')(event.target.value)}
          />
          <TextField
            id="skill-name"
            label="Name"
            value={form.name}
            maxLength={60}
            required
            placeholder="e.g. Reel script"
            onChange={(event) => set('name')(event.target.value)}
          />
          <SelectField
            id="skill-category"
            label="Category"
            options={CATEGORY_OPTIONS}
            value={form.category}
            onChange={(event) => set('category')(event.target.value)}
          />
        </div>
        <TextField
          id="skill-description"
          label="Short description"
          value={form.description}
          maxLength={200}
          placeholder="Shown in the ! picker"
          onChange={(event) => set('description')(event.target.value)}
        />
        <TextAreaField
          id="skill-instructions"
          label="Instructions"
          rows={7}
          maxLength={6000}
          required
          value={form.instructions}
          placeholder="Write a 30-second Instagram reel script: a 3-second hook, 3 quick beats with on-screen text, and a call to action. Format as a table: time, visual, voiceover, on-screen text."
          hint={`Say exactly what to produce and in what format. ${form.instructions.length.toLocaleString()} / 6,000`}
          onChange={(event) => set('instructions')(event.target.value)}
          dictationWorkspaceId={workspaceId}
        />

        <div>
          <button
            type="button"
            onClick={() => setShowExample((open) => !open)}
            aria-expanded={showExample}
            className="text-ink/85 hover:text-ink inline-flex items-center gap-1.5 text-sm font-medium"
          >
            <ChevronDown
              className={cn('h-4 w-4 transition-transform', !showExample && '-rotate-90')}
              aria-hidden="true"
            />
            Example answer
            <span className="text-muted font-normal">
              (optional, makes answers far more consistent)
            </span>
          </button>
          {showExample && (
            <TextAreaField
              id="skill-example"
              label="Example answer"
              rows={6}
              maxLength={4000}
              value={form.example}
              placeholder="Paste or write one great answer. The AI copies its structure and tone, not its facts."
              onChange={(event) => set('example')(event.target.value)}
              className="mt-2"
            />
          )}
        </div>

        {canShare && (
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Who can use it</p>
            <SegmentedControl
              label="Who can use it"
              options={VISIBILITY}
              value={form.visibility}
              onChange={set('visibility')}
            />
          </div>
        )}

        <TestPanel workspaceId={workspaceId} form={form} />

        <DialogActions
          start={
            valid && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => downloadSkills([form])}
                title="Download this skill as a .json file"
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" /> Export
              </Button>
            )
          }
        >
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={save.isPending} disabled={!valid}>
            {isEdit ? 'Save changes' : 'Create skill'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

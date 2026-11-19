import {
  ClipboardCopy,
  Copy,
  Download,
  Lock,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Upload,
  Users,
  Wand2,
} from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Alert } from '../../../components/ui/Alert.jsx';
import { Button } from '../../../components/ui/Button.jsx';
import { EmptyState } from '../../../components/ui/EmptyState.jsx';
import { Skeleton } from '../../../components/ui/Skeleton.jsx';
import { cn } from '../../../lib/cn.js';
import { useDismiss } from '../../../lib/useDismiss.js';
import { ConfirmDialog } from '../../files/FileDialogs.jsx';
import { AI_GRADIENT } from '../aiStyle.js';
import { useDeleteSkill, useImportSkills } from '../studioHooks.js';
import { downloadSkills, readSkillFile, SKILL_CATEGORY_LABELS, skillAsText } from './skillFile.js';

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

// The "…" menu on a skill row.
function SkillMenu({ skill, onEdit, onCopy, onDelete }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);

  const item =
    'hover:bg-subtle flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm';
  return (
    <div ref={ref} className="relative">
      <Button
        size="icon"
        variant="ghost"
        aria-label={`More for ${skill.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((was) => !was)}
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </Button>
      {open && (
        <div
          role="menu"
          className="border-line/70 bg-surface shadow-lift absolute right-0 top-full z-30 mt-1 w-52 animate-[fade-in_120ms_ease-out] rounded-xl border p-1"
        >
          {skill.canEdit && (
            <button
              type="button"
              role="menuitem"
              className={item}
              onClick={() => (close(), onEdit())}
            >
              <Pencil className="h-4 w-4" aria-hidden="true" /> Edit
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={() => (close(), onCopy())}
          >
            <Copy className="h-4 w-4" aria-hidden="true" />
            {skill.builtin ? 'Customise a copy' : 'Duplicate'}
          </button>
          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={() => {
              downloadSkills([skill]);
              close();
            }}
          >
            <Download className="h-4 w-4" aria-hidden="true" /> Export as file
          </button>
          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(skillAsText(skill));
                setCopied(true);
                setTimeout(() => {
                  setCopied(false);
                  close();
                }, 900);
              } catch {
                close();
              }
            }}
          >
            <ClipboardCopy className="h-4 w-4" aria-hidden="true" />
            {copied ? 'Copied!' : 'Copy as text'}
          </button>
          {skill.canEdit && (
            <div className="border-line mt-1 border-t pt-1">
              <button
                type="button"
                role="menuitem"
                className={cn(item, 'text-danger hover:bg-danger/10')}
                onClick={() => (close(), onDelete())}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" /> Delete
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SkillRow({ skill, onEdit, onCopy, onDelete }) {
  return (
    <li className="group flex items-start gap-3 px-4 py-3">
      <span
        className="bg-subtle grid h-9 w-9 shrink-0 place-items-center rounded-xl text-base"
        aria-hidden="true"
      >
        {skill.emoji || <Wand2 className="text-muted h-4 w-4" />}
      </span>
      <button
        type="button"
        onClick={skill.canEdit ? onEdit : onCopy}
        className="min-w-0 flex-1 text-left"
        title={skill.canEdit ? 'Edit' : 'Customise a copy'}
      >
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-sm font-medium">{skill.name}</span>
          <span className="bg-subtle text-ink/70 rounded-full px-1.5 py-px text-[10px] font-medium">
            {SKILL_CATEGORY_LABELS[skill.category] ?? 'Other'}
          </span>
          {skill.builtin ? (
            <span className="text-muted inline-flex items-center gap-1 text-[11px]">
              <Sparkles className="h-3 w-3" aria-hidden="true" /> Built in
            </span>
          ) : (
            <VisibilityTag visibility={skill.visibility} />
          )}
          {skill.usageCount > 0 && (
            <span className="text-muted text-[11px] tabular-nums">used {skill.usageCount}×</span>
          )}
        </span>
        <span className="text-muted line-clamp-2 block text-xs">
          {skill.description || skill.instructions}
        </span>
      </button>
      <SkillMenu skill={skill} onEdit={onEdit} onCopy={onCopy} onDelete={onDelete} />
    </li>
  );
}

// The skills library: yours and the built-in ones, with search, categories,
// AI generation and export / import.
export function SkillsPanel({ workspace, skills, onEdit, onCopy, onCreate }) {
  const remove = useDeleteSkill(workspace.id);
  const importSkills = useImportSkills(workspace.id);
  const fileInput = useRef(null);
  const [deleting, setDeleting] = useState(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [importError, setImportError] = useState(null);

  const list = useMemo(() => skills.data ?? [], [skills.data]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return list.filter(
      (skill) =>
        (category === 'all' || skill.category === category) &&
        (!needle ||
          skill.name.toLowerCase().includes(needle) ||
          skill.description?.toLowerCase().includes(needle) ||
          skill.instructions.toLowerCase().includes(needle)),
    );
  }, [list, query, category]);
  const categories = useMemo(
    () => [
      'all',
      ...Object.keys(SKILL_CATEGORY_LABELS).filter((key) => list.some((s) => s.category === key)),
    ],
    [list],
  );

  if (skills.isPending) return <Skeleton className="h-64 w-full rounded-3xl" />;
  if (skills.isError) return <Alert tone="error">{skills.error.message}</Alert>;

  const custom = filtered.filter((skill) => !skill.builtin);
  const builtin = filtered.filter((skill) => skill.builtin);
  const mine = list.filter((skill) => !skill.builtin);

  async function onImportFile(file) {
    setImportError(null);
    importSkills.reset();
    try {
      const parsed = await readSkillFile(file);
      importSkills.mutate(parsed);
    } catch (error) {
      setImportError(error.message);
    }
  }

  const row = (skill) => (
    <SkillRow
      key={skill.id}
      skill={skill}
      onEdit={() => onEdit(skill)}
      onCopy={() => onCopy(skill)}
      onDelete={() => setDeleting(skill)}
    />
  );

  return (
    <div className="space-y-4">
      {/* Make a skill with AI: the quickest way in. */}
      <button
        type="button"
        onClick={() => onCreate({ ai: true })}
        className="group relative flex w-full items-center gap-3 overflow-hidden rounded-3xl border border-fuchsia-400/30 p-4 text-left transition-shadow hover:shadow-md"
      >
        <span
          className={cn(AI_GRADIENT, 'pointer-events-none absolute inset-0 opacity-[0.07]')}
          aria-hidden="true"
        />
        <span
          className={cn(
            AI_GRADIENT,
            'relative grid h-10 w-10 shrink-0 place-items-center rounded-full text-white transition-transform group-hover:scale-110',
          )}
        >
          <Sparkles className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="relative min-w-0">
          <span className="block font-semibold">Generate a skill with AI</span>
          <span className="text-muted block text-sm">
            Describe what you need in a sentence; AI writes the instructions and an example you can
            test and tweak.
          </span>
        </span>
      </button>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search
            className="text-muted pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search skills"
            aria-label="Search skills"
            className="border-line bg-surface focus:border-accent/60 focus:ring-accent/15 h-10 w-full rounded-full border pl-9 pr-3 text-sm outline-none focus:ring-4"
          />
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => fileInput.current?.click()}>
            <Upload className="h-3.5 w-3.5" aria-hidden="true" /> Import
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={mine.length === 0}
            onClick={() => downloadSkills(mine, 'my-skills.json')}
            title={mine.length ? 'Download all your skills as one file' : 'No custom skills yet'}
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" /> Export all
          </Button>
          <Button size="sm" onClick={() => onCreate({ ai: false })}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" /> New
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) onImportFile(file);
            }}
          />
        </div>
      </div>

      <div className="scrollbar-thin -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
        {categories.map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={category === key}
            onClick={() => setCategory(key)}
            className={cn(
              'shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors',
              category === key ? 'pill-active' : 'bg-subtle text-ink/75 hover:text-ink',
            )}
          >
            {key === 'all' ? 'All' : SKILL_CATEGORY_LABELS[key]}
          </button>
        ))}
      </div>

      {(importError || importSkills.error) && (
        <Alert tone="error">{importError ?? importSkills.error.message}</Alert>
      )}
      {importSkills.isPending && <Alert tone="info">Importing skills…</Alert>}
      {importSkills.data && (
        <Alert tone={importSkills.data.failed.length ? 'error' : 'success'}>
          Imported {importSkills.data.created}{' '}
          {importSkills.data.created === 1 ? 'skill' : 'skills'}.
          {importSkills.data.failed.length > 0 &&
            ` ${importSkills.data.failed.length} could not be added: ${importSkills.data.failed.join('; ')}`}
        </Alert>
      )}

      <section className="border-line/70 bg-surface shadow-soft overflow-hidden rounded-3xl border">
        <header className="border-line/60 border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Your skills</h2>
          <p className="text-muted text-xs">
            Type <kbd className="border-line bg-subtle rounded border px-1 font-mono">!</kbd> in the
            chat to use one. Most used come first.
          </p>
        </header>
        {custom.length === 0 ? (
          <EmptyState
            icon={Wand2}
            title={mine.length ? 'No matches' : 'No custom skills yet'}
            className="py-8"
          >
            {mine.length
              ? 'Try another search or category.'
              : 'Generate one with AI, import a file, or customise a built-in skill below.'}
          </EmptyState>
        ) : (
          <ul className="divide-line/60 divide-y">{custom.map(row)}</ul>
        )}
      </section>
      {builtin.length > 0 && (
        <section className="border-line/70 bg-surface shadow-soft overflow-hidden rounded-3xl border">
          <header className="border-line/60 border-b px-4 py-3">
            <h2 className="text-sm font-semibold">Built-in skills</h2>
            <p className="text-muted text-xs">Ready to use. Customise a copy to make it yours.</p>
          </header>
          <ul className="divide-line/60 divide-y">{builtin.map(row)}</ul>
        </section>
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        title={`Delete ${deleting?.name ?? 'skill'}?`}
        confirmLabel="Delete"
        pending={remove.isPending}
        error={remove.error?.message}
        onClose={() => setDeleting(null)}
        onConfirm={() => remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}
      >
        Assistants using it will stop using it. Tip: export it first if you may want it back.
      </ConfirmDialog>
    </div>
  );
}

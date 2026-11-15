import { NotebookPen, Plus, RefreshCw, Send, Sparkles, X } from 'lucide-react';
import { useState } from 'react';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { SegmentedControl } from '../../components/ui/SegmentedControl.jsx';
import { cn } from '../../lib/cn.js';
import { AI_GRADIENT } from '../ai/aiStyle.js';
import { AiMessageText } from '../ai/AiMessageText.jsx';
import { useAnalyseMoodboard, useAskMoodboard, useSaveMoodboardNote } from './hooks.js';

const NO_FILES = new Map();
const SUGGESTIONS = [
  'Write a shot list for a 30-second film in this mood',
  'Suggest 3 colour grades for the edit',
  'What fonts would fit, and where would each go?',
  'What is missing from this board?',
];

function Section({ title, children }) {
  return (
    <section className="space-y-2">
      <h4 className="text-muted text-[11px] font-semibold uppercase tracking-[0.12em]">{title}</h4>
      {children}
    </section>
  );
}

function Brief({ analysis, onAddPalette, canEdit }) {
  return (
    <div className="space-y-5">
      <div>
        <p className="font-display text-xl leading-snug">{analysis.title}</p>
        <p className="mt-1.5 text-sm leading-6">{analysis.summary}</p>
      </div>
      {analysis.palette.length > 0 && (
        <Section title="Palette">
          <div className="flex flex-wrap gap-2">
            {analysis.palette.map((swatch) => (
              <span key={swatch.hex} className="flex items-center gap-2" title={swatch.role}>
                <span
                  className="border-line h-8 w-8 rounded-lg border"
                  style={{ background: swatch.hex }}
                />
                <span className="text-xs leading-tight">
                  <span className="block font-medium">{swatch.name}</span>
                  <span className="text-muted font-mono uppercase">{swatch.hex}</span>
                </span>
              </span>
            ))}
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={() => onAddPalette(analysis.palette.map((swatch) => swatch.hex))}
              className="text-accent inline-flex items-center gap-1 text-xs font-medium hover:underline"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add palette to the board
            </button>
          )}
        </Section>
      )}
      {analysis.keywords.length > 0 && (
        <Section title="Keywords">
          <div className="flex flex-wrap gap-1.5">
            {analysis.keywords.map((keyword) => (
              <span key={keyword} className="bg-subtle rounded-full px-2.5 py-0.5 text-xs">
                {keyword}
              </span>
            ))}
          </div>
        </Section>
      )}
      {analysis.directions.length > 0 && (
        <Section title="Directions">
          <ul className="space-y-2">
            {analysis.directions.map((direction) => (
              <li key={direction.title} className="border-line/70 rounded-xl border p-3 text-sm">
                <p className="font-medium">{direction.title}</p>
                <p className="text-muted mt-0.5 leading-6">{direction.text}</p>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {analysis.typography.length > 0 && (
        <Section title="Typography">
          <ul className="space-y-1.5 text-sm">
            {analysis.typography.map((type) => (
              <li key={type.title}>
                <span className="font-medium">{type.title}</span>
                <span className="text-muted"> — {type.text}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {analysis.brief && (
        <Section title="Full brief">
          <div className="border-line/70 rounded-xl border p-3">
            <AiMessageText text={analysis.brief} files={NO_FILES} onOpenFile={() => {}} />
          </div>
        </Section>
      )}
    </div>
  );
}

function Ask({ workspaceId, boardId, chat, getSketch }) {
  const ask = useAskMoodboard(workspaceId, boardId);
  const [question, setQuestion] = useState('');

  function send(text) {
    const value = (text ?? question).trim();
    if (!value) return;
    ask.mutate({ question: value, sketchPng: getSketch() }, { onSuccess: () => setQuestion('') });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pb-3">
        {chat.length === 0 && (
          <div className="space-y-2">
            <p className="text-muted text-sm">
              Ask anything about this board. The AI sees its images, notes, colours, links and
              sketches.
            </p>
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => send(suggestion)}
                disabled={ask.isPending}
                className="border-line hover:bg-subtle block w-full rounded-xl border px-3 py-2 text-left text-sm"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
        {chat.map((turn, index) => (
          <div
            key={index}
            className={cn(
              'rounded-2xl px-3 py-2',
              turn.role === 'user' ? 'bg-subtle ml-8' : 'border-line/70 border',
            )}
          >
            {turn.role === 'user' ? (
              <p className="text-sm">{turn.text}</p>
            ) : (
              <AiMessageText text={turn.text} files={NO_FILES} onOpenFile={() => {}} />
            )}
          </div>
        ))}
        {ask.isPending && (
          <p className="text-muted flex items-center gap-2 text-sm">
            <Sparkles className="text-accent h-4 w-4 animate-pulse" aria-hidden="true" />
            Looking at the board…
          </p>
        )}
        {ask.error && <Alert tone="error">{ask.error.message}</Alert>}
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
        className="border-line/70 flex gap-2 border-t pt-3"
      >
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => event.stopPropagation()}
          maxLength={2000}
          placeholder="Ask about this mood…"
          aria-label="Ask about this board"
          className="border-line bg-surface h-10 min-w-0 flex-1 rounded-full border px-4 text-sm"
        />
        <Button type="submit" size="icon-md" loading={ask.isPending} aria-label="Ask">
          <Send className="h-4 w-4" aria-hidden="true" />
        </Button>
      </form>
    </div>
  );
}

// The right-hand panel: write a brief from the board, then ask about it.
export function MoodboardAiPanel({
  workspaceId,
  board,
  canEdit,
  getSketch,
  onAddPalette,
  onClose,
}) {
  const analyse = useAnalyseMoodboard(workspaceId, board.id);
  const saveNote = useSaveMoodboardNote(workspaceId, board.id);
  const [tab, setTab] = useState('brief');
  const [focus, setFocus] = useState('');
  const { analysis } = board;

  function run() {
    analyse.mutate({ sketchPng: getSketch(), ...(focus.trim() && { focus: focus.trim() }) });
  }

  return (
    <aside className="bg-surface border-line/70 flex h-full w-full flex-col border-l p-4 sm:w-[380px]">
      <header className="mb-3 flex items-center gap-2">
        <span className={cn(AI_GRADIENT, 'grid h-8 w-8 place-items-center rounded-xl text-white')}>
          <Sparkles className="h-4 w-4" aria-hidden="true" />
        </span>
        <h3 className="flex-1 text-[15px] font-semibold">AI creative director</h3>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close AI panel">
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </header>
      <SegmentedControl
        label="AI panel"
        value={tab}
        onChange={setTab}
        className="mb-4 self-start"
        options={[
          { value: 'brief', label: 'Brief' },
          { value: 'ask', label: board.chat.length ? `Ask (${board.chat.length / 2})` : 'Ask' },
        ]}
      />

      {tab === 'brief' ? (
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
          <div className="space-y-2">
            <input
              value={focus}
              onChange={(event) => setFocus(event.target.value)}
              onKeyDown={(event) => event.stopPropagation()}
              maxLength={1000}
              placeholder="What is it for? e.g. a launch film for a coffee brand"
              aria-label="What the board is for"
              className="border-line bg-surface h-10 w-full rounded-full border px-4 text-sm"
            />
            <Button onClick={run} loading={analyse.isPending} className="w-full">
              {analysis ? (
                <>
                  <RefreshCw className="h-4 w-4" aria-hidden="true" /> Analyse again
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" aria-hidden="true" /> Analyse board &amp; write a
                  brief
                </>
              )}
            </Button>
            {analyse.isPending && (
              <p className="text-muted text-xs">
                Looking at every image, note and sketch. This takes up to a minute.
              </p>
            )}
            {analyse.error && <Alert tone="error">{analyse.error.message}</Alert>}
          </div>
          {analysis ? (
            <>
              <Brief analysis={analysis} canEdit={canEdit} onAddPalette={onAddPalette} />
              <div className="flex flex-wrap items-center gap-2 pb-2">
                <Button
                  variant="secondary"
                  size="sm"
                  loading={saveNote.isPending}
                  disabled={saveNote.isSuccess}
                  onClick={() => saveNote.mutate()}
                >
                  <NotebookPen className="h-3.5 w-3.5" aria-hidden="true" />
                  {saveNote.isSuccess ? 'Saved to notes' : 'Save brief to notes'}
                </Button>
                {saveNote.error && (
                  <span className="text-danger text-xs">{saveNote.error.message}</span>
                )}
              </div>
            </>
          ) : (
            !analyse.isPending && (
              <p className="text-muted text-sm leading-6">
                When the board feels complete, the AI reads it all — pictures, video, notes,
                colours, links and your sketches — and writes a creative brief: mood, palette, type,
                directions and a full brief your team and client can work from.
              </p>
            )
          )}
        </div>
      ) : (
        <Ask workspaceId={workspaceId} boardId={board.id} chat={board.chat} getSketch={getSketch} />
      )}
    </aside>
  );
}

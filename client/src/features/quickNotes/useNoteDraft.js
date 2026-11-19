import { useCallback, useEffect, useRef, useState } from 'react';
import { readLocal } from '../../lib/storage.js';
import { useAutosaveQuickNote } from './hooks.js';

const SAVE_AFTER_MS = 800;

function rememberedVisibility() {
  return readLocal('quick-notes:visibility') === 'workspace' ? 'workspace' : 'private';
}

/**
 * Edits a note and saves it a moment after typing stops.
 * note: the saved note, or null for a new one (created on the first save,
 * once there's some text; onCreated gets the new note).
 * status: 'idle' | 'saving' | 'saved' | 'error'.
 */
export function useNoteDraft(workspaceId, note, { onCreated, createFields } = {}) {
  const { mutateAsync } = useAutosaveQuickNote(workspaceId);
  const [draft, setDraft] = useState(() => ({ title: note?.title ?? '', body: note?.body ?? '' }));
  const [seen, setSeen] = useState(note?.updatedAt ?? null);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  // The note's id once it exists (a new note gets one on its first save).
  const [savedId, setSavedId] = useState(note?.id ?? null);

  const draftRef = useRef(draft);
  const idRef = useRef(note?.id ?? null);
  const timer = useRef(null);
  const version = useRef(0);
  const saving = useRef(null);
  const createdRef = useRef(onCreated);
  const fieldsRef = useRef(createFields);

  useEffect(() => {
    createdRef.current = onCreated;
    fieldsRef.current = createFields;
  }, [onCreated, createFields]);

  // Changed somewhere else (another tab, the Notes page) and nothing typed
  // here: show the newer text.
  if (note && note.updatedAt !== seen && !dirty) {
    setSeen(note.updatedAt);
    setDraft({ title: note.title ?? '', body: note.body ?? '' });
  }
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const save = useCallback(async () => {
    clearTimeout(timer.current);
    timer.current = null;
    // One save at a time; the latest text goes in the next one.
    if (saving.current) {
      await saving.current.catch(() => {});
      if (version.current === 0) return;
    }
    const next = draftRef.current;
    // A note needs a title or some text; an empty one just isn't saved (yet).
    if (!next.body.trim() && !next.title.trim()) {
      version.current = 0;
      setDirty(false);
      setStatus('idle');
      return;
    }
    const savedVersion = version.current;
    setStatus('saving');
    setError(null);
    const isNew = !idRef.current;
    const request = mutateAsync({
      id: idRef.current ?? undefined,
      title: next.title.trim() || null,
      body: next.body,
      // A new note: its sharing (and anything the caller adds, like projects).
      ...(isNew && { visibility: rememberedVisibility(), ...fieldsRef.current?.() }),
    });
    saving.current = request;
    try {
      const saved = await request;
      idRef.current = saved.id;
      setSavedId(saved.id);
      setSeen(saved.updatedAt);
      if (version.current === savedVersion) {
        version.current = 0;
        setDirty(false);
      }
      setStatus('saved');
      if (isNew) createdRef.current?.(saved);
    } catch (saveError) {
      setStatus('error');
      setError(saveError.message);
    } finally {
      saving.current = null;
    }
  }, [mutateAsync]);

  const change = useCallback(
    (field, value) => {
      const next = { ...draftRef.current, [field]: value };
      draftRef.current = next;
      version.current += 1;
      setDraft(next);
      setDirty(true);
      setStatus('idle');
      clearTimeout(timer.current);
      timer.current = setTimeout(save, SAVE_AFTER_MS);
    },
    [save],
  );

  // Closing mid-pause still saves what was typed.
  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
        save();
      }
    },
    [save],
  );

  return { draft, change, flush: save, status, error, dirty, id: savedId };
}

import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { useFieldArray } from 'react-hook-form';
import { Button } from '../../components/ui/Button.jsx';

export function ChecklistEditor({ control, register }) {
  const { fields, append, remove } = useFieldArray({ control, name: 'checklist' });
  const [draft, setDraft] = useState('');

  function addItem() {
    const text = draft.trim();
    if (!text) return;
    append({ text, done: false });
    setDraft('');
  }

  function addOnEnter(event) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    addItem();
  }

  return (
    <fieldset className="space-y-2">
      <legend className="mb-1.5 text-sm font-medium">Checklist</legend>
      {fields.length > 0 && (
        <ul className="space-y-1">
          {fields.map((field, index) => (
            <li key={field.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[rgb(var(--color-ink))]"
                aria-label={`Done: ${field.text}`}
                {...register(`checklist.${index}.done`)}
              />
              <input
                className="border-line bg-surface h-8 flex-1 rounded border px-2 text-sm"
                aria-label="Checklist item"
                {...register(`checklist.${index}.text`)}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => remove(index)}
                aria-label={`Remove ${field.text}`}
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={addOnEnter}
          placeholder="Add an item, e.g. 9:16 cutdown"
          aria-label="New checklist item"
          className="border-line bg-surface placeholder:text-muted/70 h-8 flex-1 rounded border px-2 text-sm"
        />
        <Button type="button" variant="secondary" size="sm" onClick={addItem}>
          <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add
        </Button>
      </div>
    </fieldset>
  );
}

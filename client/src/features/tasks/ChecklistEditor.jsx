import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { useFieldArray } from 'react-hook-form';
import { fieldLabelClassName } from '../../components/ui/FieldShell.jsx';

const rowInputClassName =
  'placeholder:text-muted/60 h-9 min-w-0 flex-1 bg-transparent text-sm outline-none focus-visible:ring-0 focus-visible:ring-offset-0';

// One bordered list: existing items, then a row that adds a new one on Enter.
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
    if (event.key !== 'Enter' || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    addItem();
  }

  return (
    <fieldset className="min-w-0">
      <legend className={`${fieldLabelClassName} mb-1.5`}>Checklist</legend>
      <div className="border-line/80 bg-subtle/60 focus-within:border-accent/70 divide-line/70 divide-y rounded-[12px] border transition-colors">
        {fields.map((field, index) => (
          <div key={field.id} className="group flex items-center gap-2.5 pl-3 pr-1">
            <input
              type="checkbox"
              className="accent-accent h-4 w-4 shrink-0"
              aria-label={`Done: ${field.text}`}
              {...register(`checklist.${index}.done`)}
            />
            <input
              className={rowInputClassName}
              aria-label="Checklist item"
              {...register(`checklist.${index}.text`)}
            />
            <button
              type="button"
              onClick={() => remove(index)}
              aria-label={`Remove ${field.text}`}
              className="text-muted hover:bg-subtle hover:text-ink grid h-7 w-7 shrink-0 place-items-center rounded-full opacity-60 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        ))}
        <div className="flex items-center gap-2.5 pl-3 pr-1">
          <Plus className="text-muted h-4 w-4 shrink-0" aria-hidden="true" />
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={addOnEnter}
            placeholder="Add an item and press Enter"
            aria-label="New checklist item"
            className={rowInputClassName}
          />
          {draft.trim() && (
            <button
              type="button"
              onClick={addItem}
              className="text-accent hover:bg-accent/10 mr-1 h-7 shrink-0 rounded-full px-2.5 text-[13px] font-medium"
            >
              Add
            </button>
          )}
        </div>
      </div>
    </fieldset>
  );
}

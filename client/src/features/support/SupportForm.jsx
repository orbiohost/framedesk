import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { TextAreaField } from '../../components/ui/TextAreaField.jsx';
import { TextField } from '../../components/ui/TextField.jsx';
import { cn } from '../../lib/cn.js';
import { applyServerFieldErrors } from '../../lib/forms.js';
import { useCreateTicket } from './hooks.js';
import { StarRating } from './StarRating.jsx';
import { TICKET_TYPES } from './supportMeta.js';

const schema = z.object({
  subject: z.string().trim().min(3, 'Add a short subject').max(140),
  message: z.string().trim().min(10, 'Tell us a little more (10 characters or more)').max(5000),
});

function TypePicker({ value, onChange }) {
  return (
    <div role="radiogroup" aria-label="What is this about?" className="grid gap-2 sm:grid-cols-2">
      {Object.entries(TICKET_TYPES).map(([type, meta]) => {
        const Icon = meta.icon;
        const active = type === value;
        return (
          <button
            key={type}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(type)}
            className={cn(
              'flex items-start gap-3 rounded-2xl border p-3 text-left transition-colors',
              active
                ? 'border-accent bg-lavender/50 ring-accent/30 ring-2'
                : 'border-line hover:bg-subtle',
            )}
          >
            <span
              className={cn(
                'grid h-9 w-9 shrink-0 place-items-center rounded-xl',
                active ? 'bg-accent text-accent-ink' : 'bg-subtle text-muted',
              )}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium">{meta.label}</span>
              <span className="text-muted block text-xs">{meta.hint}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

// workspaceId is sent along so the team knows where the person was working.
export function SupportForm({ workspaceId, initialType = 'question' }) {
  const create = useCreateTicket();
  const [type, setType] = useState(initialType);
  const [rating, setRating] = useState(null);
  const [sent, setSent] = useState(null);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm({ resolver: zodResolver(schema), defaultValues: { subject: '', message: '' } });
  const meta = TICKET_TYPES[type];

  function onSubmit(values) {
    create.mutate(
      {
        ...values,
        type,
        rating: type === 'feedback' ? rating : null,
        workspaceId,
        pageUrl: window.location.href,
      },
      {
        onSuccess: (ticket) => {
          setSent(ticket);
          setRating(null);
          reset();
        },
        onError: (error) => applyServerFieldErrors(error, setError),
      },
    );
  }

  if (sent) {
    const expectsReply = sent.type === 'question' || sent.type === 'bug';
    return (
      <div className="grid place-items-center gap-3 px-5 py-10 text-center">
        <span className="bg-success/10 text-success grid h-12 w-12 place-items-center rounded-2xl">
          <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
        </span>
        <div>
          <p className="font-semibold">Thanks, we got it</p>
          <p className="text-muted mt-1 max-w-sm text-sm">
            {expectsReply
              ? 'We will reply by email, and the answer also shows under Your requests.'
              : 'Every message is read by the team. It helps decide what we build next.'}
          </p>
        </div>
        <Button variant="secondary" onClick={() => setSent(null)}>
          Send another
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4 p-5">
      {create.error && !create.error.details && <Alert tone="error">{create.error.message}</Alert>}
      <TypePicker value={type} onChange={setType} />
      {type === 'feedback' && (
        <div>
          <p className="mb-1 text-sm font-medium">How is FrameDesk working for you?</p>
          <StarRating value={rating} onChange={setRating} />
        </div>
      )}
      <TextField
        id="support-subject"
        label="Subject"
        placeholder={meta.subject}
        maxLength={140}
        error={errors.subject?.message}
        {...register('subject')}
      />
      <TextAreaField
        id="support-message"
        label="Message"
        rows={6}
        placeholder={meta.message}
        maxLength={5000}
        dictationWorkspaceId={workspaceId}
        error={errors.message?.message}
        hint={type === 'bug' ? 'Your browser and the page you were on are sent along.' : undefined}
        {...register('message')}
      />
      <Button type="submit" loading={create.isPending}>
        Send to the team
      </Button>
    </form>
  );
}

import { useRef, useState } from 'react';
import { DictateButton } from '../../features/transcripts/DictateButton.jsx';
import { useTranscriptionEnabled } from '../../features/transcripts/hooks.js';
import { cn } from '../../lib/cn.js';
import { insertSpokenText } from '../../lib/insertText.js';

/**
 * Speak-to-type for a TextField / TextAreaField. Pass the workspace id to turn
 * it on; returns a ref for the control, the mic button, and any mic error.
 * The button renders nothing when the server has no speech-to-text.
 */
export function useFieldDictation(workspaceId, { disabled, multiline, label } = {}) {
  const controlRef = useRef(null);
  const [alert, setAlert] = useState(null);
  // Same cached query DictateButton uses, so this costs no extra request.
  const serverEnabled = useTranscriptionEnabled(workspaceId);
  const active = Boolean(workspaceId) && !disabled && serverEnabled;

  const button = active ? (
    <DictateButton
      workspaceId={workspaceId}
      variant="icon"
      label={label ? `Speak to type: ${label}` : 'Speak to type'}
      onError={setAlert}
      onText={(text) => insertSpokenText(controlRef.current, text)}
      className={cn('absolute right-1', multiline ? 'bottom-1' : 'top-1')}
    />
  ) : null;

  return { controlRef, button, alert, active };
}

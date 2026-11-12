import { Loader2 } from 'lucide-react';
import { Badge } from '../../components/ui/Badge.jsx';

// A history row's state: waiting, a live percentage, failed, done, or in Trash.
export function TranscriptStatusBadge({ transcript }) {
  if (transcript.file?.deletedAt) return <Badge tone="muted">In Trash</Badge>;
  if (transcript.status === 'queued') return <Badge tone="muted">Waiting</Badge>;
  if (transcript.status === 'processing') {
    return (
      <Badge tone="accent">
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
        {Math.round(transcript.progress * 100)}%
      </Badge>
    );
  }
  if (transcript.status === 'failed') return <Badge tone="danger">Failed</Badge>;
  return <Badge tone="success">Done</Badge>;
}

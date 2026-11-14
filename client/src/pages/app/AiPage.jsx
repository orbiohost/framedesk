import { Sparkles } from 'lucide-react';
import { useOutletContext } from 'react-router-dom';
import { EmptyState } from '../../components/ui/EmptyState.jsx';
import { Skeleton } from '../../components/ui/Skeleton.jsx';
import { AiChat } from '../../features/ai/AiAssistant.jsx';
import { useAiStatus } from '../../features/ai/hooks.js';

// The assistant on a page of its own (Sidebar → Ask AI). Same chat as the corner button.
export function AiPage() {
  const { workspace } = useOutletContext();
  const status = useAiStatus(workspace.id);

  if (status.isPending)
    return (
      <Skeleton className="h-[calc(100dvh-9.75rem)] w-full rounded-3xl lg:h-[calc(100dvh-7.5rem)]" />
    );
  if (!status.data?.enabled) {
    return (
      <EmptyState icon={Sparkles} title="The AI assistant isn’t available right now">
        It has been switched off for this account. Please check back later or contact support.
      </EmptyState>
    );
  }
  return <AiChat workspace={workspace} status={status.data} variant="page" />;
}

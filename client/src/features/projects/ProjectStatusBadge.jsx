import { Badge } from '../../components/ui/Badge.jsx';
import { projectStatus } from './projectMeta.js';

export function ProjectStatusBadge({ status }) {
  const { label, tone } = projectStatus(status);
  return <Badge tone={tone}>{label}</Badge>;
}

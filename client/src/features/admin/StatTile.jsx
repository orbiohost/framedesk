import { Link } from 'react-router-dom';
import { cn } from '../../lib/cn.js';

// One headline number. Text tokens only: the value carries no colour of its own.
export function StatTile({ label, value, detail, to }) {
  const body = (
    <>
      <p className="text-muted text-xs uppercase tracking-[0.12em]">{label}</p>
      <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight">{value}</p>
      {detail && <p className="text-muted mt-1 text-sm">{detail}</p>}
    </>
  );
  const className = cn(
    'border-line bg-surface block rounded-lg border p-4',
    to && 'hover:border-muted/50 transition-colors',
  );
  return to ? (
    <Link to={to} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

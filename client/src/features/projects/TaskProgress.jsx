export function TaskProgress({ done, total }) {
  if (total === 0) return <span className="text-muted text-xs">No tasks yet</span>;

  return (
    <div className="flex items-center gap-2">
      <div className="bg-subtle h-1 w-16 overflow-hidden rounded-full" aria-hidden="true">
        <div
          className="bg-accent h-full rounded-full"
          style={{ width: `${(done / total) * 100}%` }}
        />
      </div>
      <span className="text-muted text-xs tabular-nums">
        {done}/{total} tasks
      </span>
    </div>
  );
}

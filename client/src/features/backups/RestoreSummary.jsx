const LABELS = {
  clients: 'Clients',
  projects: 'Projects',
  folders: 'Folders',
  tasks: 'Tasks',
  events: 'Calendar events',
  files: 'Files',
  notes: 'Quick notes',
};

export function RestoreSummary({ summary }) {
  return (
    <div className="space-y-4">
      <table className="w-full text-sm">
        <thead className="text-muted text-left text-xs uppercase tracking-[0.1em]">
          <tr>
            <th className="py-1.5 font-medium">From the backup</th>
            <th className="py-1.5 text-right font-medium">Brought back</th>
            <th className="py-1.5 text-right font-medium">Already here</th>
            <th className="py-1.5 text-right font-medium">Skipped</th>
          </tr>
        </thead>
        <tbody className="divide-line divide-y">
          {Object.entries(summary.collections).map(([name, result]) => (
            <tr key={name}>
              <td className="py-2">{LABELS[name] ?? name}</td>
              <td className="py-2 text-right font-medium tabular-nums">{result.restored}</td>
              <td className="text-muted py-2 text-right tabular-nums">{result.kept}</td>
              <td className="text-muted py-2 text-right tabular-nums">{result.skipped}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {summary.problems.length > 0 && (
        <div>
          <p className="mb-1 text-sm font-medium">Not restored</p>
          <ul className="text-muted list-disc space-y-0.5 pl-5 text-sm">
            {summary.problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

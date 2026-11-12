import { Download } from 'lucide-react';
import { useDeferredValue, useState } from 'react';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Card, CardHeader } from '../../components/ui/Card.jsx';
import { SegmentedControl } from '../../components/ui/SegmentedControl.jsx';
import { TextField } from '../../components/ui/TextField.jsx';
import { formatBytes } from '../../lib/format.js';
import { RANGE_PRESETS, rangeFromInputs } from './backupRange.js';
import { useBackupSummary, useStartBackupDownload } from './hooks.js';

const SCOPE_OPTIONS = [
  { value: 'all', label: 'Everything' },
  { value: 'dates', label: 'Choose dates' },
];

function plural(count, word) {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function SummaryLine({ summary }) {
  if (!summary) return <p className="text-muted text-sm">Counting…</p>;
  const { counts } = summary;
  return (
    <p className="text-muted text-sm">
      {plural(counts.clients, 'client')}, {plural(counts.projects, 'project')},{' '}
      {plural(counts.tasks, 'task')}, {plural(counts.events, 'event')},{' '}
      {plural(counts.files, 'file')} and {plural(counts.notes ?? 0, 'quick note')} (folders
      included). Quick notes are the team&apos;s shared ones plus your own private ones.
    </p>
  );
}

function DateRangeFields({ fromValue, toValue, onChange }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {RANGE_PRESETS.map((preset) => (
          <Button
            key={preset.label}
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => onChange(...preset.inputs())}
          >
            {preset.label}
          </Button>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id="backup-from"
          label="From"
          type="date"
          value={fromValue}
          max={toValue || undefined}
          onChange={(event) => onChange(event.target.value, toValue)}
        />
        <TextField
          id="backup-to"
          label="To"
          type="date"
          value={toValue}
          min={fromValue || undefined}
          onChange={(event) => onChange(fromValue, event.target.value)}
        />
      </div>
      <p className="text-muted text-sm">
        Includes anything created or changed in these dates, plus the projects, clients and folders
        it belongs to.
      </p>
    </div>
  );
}

export function DownloadBackupCard({ workspace }) {
  const [scope, setScope] = useState('all');
  const [dates, setDates] = useState({ from: '', to: '' });
  const [includeFiles, setIncludeFiles] = useState(false);
  const range = scope === 'dates' ? rangeFromInputs(dates.from, dates.to) : null;
  const { data: summary } = useBackupSummary(workspace.id, useDeferredValue(range));
  const download = useStartBackupDownload(workspace.id);
  const needsDates = scope === 'dates' && !range;

  return (
    <Card>
      <CardHeader
        title="Download a backup"
        description="A zip of your workspace that you keep. Readable without FrameDesk too."
      />
      <div className="space-y-5 p-5">
        <SegmentedControl
          label="What to back up"
          options={SCOPE_OPTIONS}
          value={scope}
          onChange={setScope}
        />
        {scope === 'dates' && (
          <DateRangeFields
            fromValue={dates.from}
            toValue={dates.to}
            onChange={(from, to) => setDates({ from, to })}
          />
        )}
        {!needsDates && <SummaryLine summary={summary} />}

        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4"
            checked={includeFiles}
            onChange={(event) => setIncludeFiles(event.target.checked)}
          />
          <span>
            <span className="font-medium">Include uploaded files</span>
            <span className="text-muted block">
              {summary ? `Adds ${formatBytes(summary.fileBytes)}. ` : ''}
              Without this, the zip lists your files but doesn&apos;t contain them.
            </span>
          </span>
        </label>

        {download.error && <Alert tone="error">{download.error.message}</Alert>}
        {download.isSuccess && (
          <Alert tone="success">
            Your download has started. Large backups keep downloading in the browser even if you
            leave this page.
          </Alert>
        )}
        <Button
          onClick={() => download.mutate({ range, includeFiles })}
          loading={download.isPending}
          disabled={needsDates}
        >
          <Download className="h-4 w-4" aria-hidden="true" /> Download backup
        </Button>
      </div>
    </Card>
  );
}

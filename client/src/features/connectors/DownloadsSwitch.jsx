import { Switch } from '../../components/ui/Switch.jsx';

// Off by default: the assistant reads details, AI summaries and transcripts.
// On: it can also download the original files it can see (to edit, convert or
// analyse them). Used on the consent screen, new keys and the Access dialog.
export function DownloadsSwitch({ checked, onChange }) {
  return (
    <div className="border-line/70 rounded-2xl border p-3.5">
      <Switch
        checked={checked}
        onChange={onChange}
        label="Allow file downloads"
        description={checked ? 'on' : 'off'}
      />
      <p className="text-muted mt-2 text-xs leading-5">
        Lets the assistant download the original files (videos, photos, documents) in the workspaces
        above, so it can edit, convert or analyse them. Links last an hour and stop working when you
        turn this off or disconnect.
      </p>
    </div>
  );
}

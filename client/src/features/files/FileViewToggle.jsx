import { LayoutGrid, List } from 'lucide-react';
import { useCallback, useState } from 'react';
import { SegmentedControl } from '../../components/ui/SegmentedControl.jsx';
import { readLocal, writeLocal } from '../../lib/storage.js';

const STORAGE_KEY = 'files:view';

// "list" or "grid", remembered in this browser for every Drive and project.
export function useFileView() {
  const [view, setView] = useState(() => (readLocal(STORAGE_KEY) === 'grid' ? 'grid' : 'list'));
  const change = useCallback((next) => {
    setView(next);
    writeLocal(STORAGE_KEY, next);
  }, []);
  return [view, change];
}

// Icons only on phones; the words stay readable to screen readers.
const OPTIONS = [
  { value: 'list', label: <span className="sr-only sm:not-sr-only">List</span>, icon: List },
  { value: 'grid', label: <span className="sr-only sm:not-sr-only">Grid</span>, icon: LayoutGrid },
];

export function FileViewToggle({ value, onChange }) {
  return <SegmentedControl label="View" options={OPTIONS} value={value} onChange={onChange} />;
}

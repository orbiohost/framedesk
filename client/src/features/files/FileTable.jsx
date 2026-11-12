import { ArrowDown, ArrowUp } from 'lucide-react';
import { Button } from '../../components/ui/Button.jsx';
import { cn } from '../../lib/cn.js';
import { FileRow } from './FileRow.jsx';

// A column heading that sorts when clicked. `first` is the sort a first click
// picks; `second` (optional) is what a click on the active heading flips to.
function SortHeading({ children, sort, onSort, first, second }) {
  if (!onSort) return children;
  const isActive = sort === first || sort === second;
  const next = sort === first && second ? second : first;
  const Arrow = sort === 'oldest' || sort === 'name' ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={() => onSort(next)}
      className={cn(
        'hover:text-ink -mx-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 uppercase tracking-[inherit] transition-colors',
        isActive && 'text-ink',
      )}
    >
      {children}
      {isActive && <Arrow className="h-3 w-3" aria-hidden="true" />}
    </button>
  );
}

// `files` overrides the query's list (used for search, filters and sorting);
// the query still drives "Load more".
// selection (optional): { ids: Set, toggle(file), toggleAll(), allSelected } adds checkboxes.
// sort + onSort (optional) make the headings sort.
// linked: files shown under a project they are only linked to (fewer actions).
export function FileTable({
  query,
  files,
  inTrash = false,
  canEdit,
  canTranscribe,
  onAction,
  onWarm,
  selection,
  sort,
  onSort,
  linked = false,
}) {
  const shown = files ?? query.data?.pages.flatMap((page) => page.files) ?? [];
  const sortProps = { sort, onSort };

  return (
    <div className="border-line/80 bg-surface overflow-hidden rounded-2xl border">
      <table className="w-full">
        <thead className="border-line bg-subtle/50 text-muted border-b text-left text-[11px] font-semibold uppercase tracking-[0.12em]">
          <tr>
            {selection && (
              <th scope="col" className="py-2.5 pl-4 pr-0">
                <input
                  type="checkbox"
                  aria-label="Select all files shown"
                  checked={selection.allSelected}
                  onChange={selection.toggleAll}
                  className="accent-accent block h-4 w-4"
                />
              </th>
            )}
            <th scope="col" className={cn('w-full py-2.5 pr-2', selection ? 'pl-3' : 'pl-4')}>
              <SortHeading {...sortProps} first="name">
                Name
              </SortHeading>
            </th>
            <th scope="col" className="hidden whitespace-nowrap px-2 sm:table-cell">
              <SortHeading {...sortProps} first="size">
                Size
              </SortHeading>
            </th>
            <th scope="col" className="hidden whitespace-nowrap px-2 md:table-cell">
              Status
            </th>
            <th scope="col" className="hidden whitespace-nowrap px-2 lg:table-cell">
              {inTrash ? (
                'Uploaded by · trashed'
              ) : (
                <SortHeading {...sortProps} first="newest" second="oldest">
                  Uploaded
                </SortHeading>
              )}
            </th>
            <th scope="col" className="pr-3">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {shown.map((file) => (
            <FileRow
              key={file.id}
              file={file}
              inTrash={inTrash}
              canEdit={canEdit}
              canTranscribe={canTranscribe}
              onAction={onAction}
              onWarm={onWarm}
              selected={selection ? selection.ids.has(file.id) : undefined}
              onToggleSelect={selection?.toggle}
              linked={linked}
            />
          ))}
        </tbody>
      </table>
      {query.hasNextPage && (
        <div className="border-line border-t p-3 text-center">
          <Button
            variant="secondary"
            size="sm"
            loading={query.isFetchingNextPage}
            onClick={() => query.fetchNextPage()}
          >
            Load more files
          </Button>
        </div>
      )}
    </div>
  );
}

export function countFiles(query) {
  return query.data?.pages.reduce((total, page) => total + page.files.length, 0) ?? 0;
}

export function allFiles(query) {
  return query.data?.pages.flatMap((page) => page.files) ?? [];
}

// Case-insensitive match on the name, tags and note of the files loaded so far.
export function filterFiles(files, search) {
  const needle = search.trim().toLowerCase();
  if (!needle) return files;
  return files.filter((file) =>
    [file.name, file.note, ...(file.tags ?? [])].some((text) =>
      text?.toLowerCase().includes(needle),
    ),
  );
}

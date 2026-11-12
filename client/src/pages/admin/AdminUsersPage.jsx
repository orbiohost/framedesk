import { useDeferredValue, useState } from 'react';
import { Alert } from '../../components/ui/Alert.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { SearchInput } from '../../components/ui/SearchInput.jsx';
import { SegmentedControl } from '../../components/ui/SegmentedControl.jsx';
import { Skeleton } from '../../components/ui/Skeleton.jsx';
import {
  BILLING_STATUS,
  PLAN_NAMES,
  dateTime,
  shortDate,
} from '../../features/admin/adminFormat.js';
import { useAdminUser, useAdminUsers, useSetUserStatus } from '../../features/admin/hooks.js';
import { formatBytes } from '../../lib/format.js';

const STATUS_FILTERS = [
  { value: '', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
];

function UserDetail({ userId }) {
  const { data, isPending } = useAdminUser(userId);
  const setStatus = useSetUserStatus();
  if (isPending) return <Skeleton className="h-40" />;
  const { user, workspaces } = data;
  const suspended = user.status === 'suspended';

  return (
    <div className="space-y-5 text-sm">
      <dl className="grid grid-cols-2 gap-4">
        <div>
          <dt className="text-muted text-xs">Email</dt>
          <dd className="break-all">{user.email}</dd>
        </div>
        <div>
          <dt className="text-muted text-xs">Joined</dt>
          <dd>{shortDate(user.createdAt)}</dd>
        </div>
        <div>
          <dt className="text-muted text-xs">Last active</dt>
          <dd>{dateTime(user.lastActiveAt)}</dd>
        </div>
        <div>
          <dt className="text-muted text-xs">Email confirmed</dt>
          <dd>{user.emailVerified ? 'Yes' : 'Not yet'}</dd>
        </div>
      </dl>
      <div>
        <p className="mb-2 font-medium">Workspaces</p>
        <ul className="border-line divide-line divide-y rounded-md border">
          {workspaces.map((workspace) => (
            <li
              key={workspace.id}
              className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
            >
              <span>
                {workspace.name} <span className="text-muted capitalize">· {workspace.role}</span>
              </span>
              <span className="text-muted">
                {PLAN_NAMES[workspace.billing.planCode] ?? 'No plan'} ·{' '}
                {BILLING_STATUS[workspace.billing.status]?.label} ·{' '}
                {formatBytes(workspace.storage.usedBytes)}
              </span>
            </li>
          ))}
        </ul>
      </div>
      {setStatus.error && <Alert tone="error">{setStatus.error.message}</Alert>}
      {!user.isSuperadmin && (
        <Button
          variant={suspended ? 'primary' : 'danger'}
          loading={setStatus.isPending}
          onClick={() =>
            setStatus.mutate({ userId: user.id, status: suspended ? 'active' : 'suspended' })
          }
        >
          {suspended ? 'Restore account' : 'Suspend account (signs them out everywhere)'}
        </Button>
      )}
    </div>
  );
}

export function AdminUsersPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState(null);
  const query = useAdminUsers({ q: useDeferredValue(search.trim()), status });

  return (
    <>
      <PageHeader title="Users" />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <SegmentedControl
          label="Account status"
          options={STATUS_FILTERS}
          value={status}
          onChange={setStatus}
        />
        <SearchInput
          label="Search users"
          placeholder="Name or email"
          value={search}
          onChange={setSearch}
          className="w-full sm:ml-auto sm:w-72"
        />
      </div>
      {query.isError && <Alert tone="error">{query.error.message}</Alert>}
      {query.isPending && <Skeleton className="h-64 w-full" />}
      {query.data && (
        <div className="border-line bg-surface overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-line text-muted border-b text-left text-xs uppercase tracking-[0.1em]">
              <tr>
                <th className="px-4 py-2 font-medium">User</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="hidden px-4 py-2 font-medium md:table-cell">Last active</th>
                <th className="hidden px-4 py-2 font-medium md:table-cell">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-line divide-y">
              {query.data.items.map((user) => (
                <tr
                  key={user.id}
                  className="hover:bg-subtle/50 cursor-pointer"
                  onClick={() => setSelected(user)}
                >
                  <td className="px-4 py-2.5">
                    <button type="button" className="text-left" onClick={() => setSelected(user)}>
                      <span className="block font-medium">
                        {user.name}
                        {user.isSuperadmin && <span className="text-accent"> · admin</span>}
                      </span>
                      <span className="text-muted block">{user.email}</span>
                    </button>
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge tone={user.status === 'suspended' ? 'danger' : 'muted'}>
                      {user.status === 'suspended' ? 'Suspended' : 'Active'}
                    </Badge>
                  </td>
                  <td className="text-muted hidden px-4 py-2.5 md:table-cell">
                    {dateTime(user.lastActiveAt)}
                  </td>
                  <td className="text-muted hidden px-4 py-2.5 md:table-cell">
                    {shortDate(user.createdAt)}
                  </td>
                </tr>
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
                Load more
              </Button>
            </div>
          )}
        </div>
      )}
      <Dialog
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.name ?? 'User'}
        wide
      >
        {selected && <UserDetail userId={selected.id} />}
      </Dialog>
    </>
  );
}

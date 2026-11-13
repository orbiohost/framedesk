import { format } from 'date-fns';
import {
  BadgeCheck,
  Camera,
  ChevronRight,
  CreditCard,
  DatabaseBackup,
  KeyRound,
  Settings,
  UserRound,
} from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import { Avatar } from '../../components/ui/Avatar.jsx';
import { Dialog } from '../../components/ui/Dialog.jsx';
import { Skeleton } from '../../components/ui/Skeleton.jsx';
import { BillingSection } from '../../features/account/BillingSection.jsx';
import { ProfileSection } from '../../features/account/ProfileSection.jsx';
import { SecuritySection } from '../../features/account/SecuritySection.jsx';
import { SettingsSection } from '../../features/account/SettingsSection.jsx';
import { useCurrentUser } from '../../features/auth/hooks.js';
import { planLabel } from '../../features/workspaces/planLabel.js';
import { canAdminister } from '../../features/workspaces/roles.js';
import { cn } from '../../lib/cn.js';

// The avatar styles are a few hundred KB, so they load only when the picker opens.
const AvatarPicker = lazy(() => import('../../features/users/AvatarPicker.jsx'));

function AccountHeader({ user, workspace, onChangePicture }) {
  return (
    <header className="bg-surface border-line/60 shadow-soft relative overflow-hidden rounded-3xl border">
      <div className="widget-lavender h-20 sm:h-24" aria-hidden="true" />
      <div className="flex flex-wrap items-end gap-x-5 gap-y-3 px-6 pb-5">
        <div className="relative -mt-10 shrink-0">
          <Avatar name={user.name} src={user.avatarUrl} size="xl" className="ring-surface ring-4" />
          <button
            type="button"
            onClick={onChangePicture}
            aria-label="Change profile picture"
            title="Change profile picture"
            className="bg-surface border-line text-ink hover:bg-subtle absolute -bottom-0.5 -right-0.5 grid h-8 w-8 place-items-center rounded-full border shadow-sm"
          >
            <Camera className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
        <div className="min-w-0 flex-1 pb-0.5">
          <h1 className="font-display truncate text-2xl leading-tight">{user.name}</h1>
          <p className="text-muted mt-0.5 flex flex-wrap items-center gap-x-2 text-sm">
            <span className="truncate">{user.email}</span>
            {user.emailVerified && (
              <BadgeCheck className="text-success h-4 w-4" aria-label="Verified email" />
            )}
            <span aria-hidden="true">·</span>
            <span>Member since {format(new Date(user.createdAt), 'MMM yyyy')}</span>
          </p>
        </div>
        {workspace && (
          <div className="border-line/70 bg-subtle/50 rounded-2xl border px-3.5 py-2 text-right">
            <p className="text-muted text-[11px] uppercase tracking-[0.12em]">{workspace.name}</p>
            <p className="text-sm font-medium">{planLabel(workspace.billing)}</p>
          </div>
        )}
      </div>
    </header>
  );
}

function Tabs({ tabs, active, onChange }) {
  return (
    <nav
      aria-label="Account sections"
      className="border-line/80 scrollbar-thin -mx-1 flex gap-1 overflow-x-auto border-b px-1"
    >
      {tabs.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          aria-current={active === id ? 'page' : undefined}
          className={cn(
            '-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
            active === id ? 'border-ink text-ink' : 'text-muted hover:text-ink border-transparent',
          )}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
          {label}
        </button>
      ))}
    </nav>
  );
}

function WorkspaceAdminSection({ workspace }) {
  const base = `/w/${workspace.id}`;
  const links = [
    {
      to: `${base}/settings`,
      icon: Settings,
      label: 'Workspace settings',
      hint: 'Name, members, roles and plan',
    },
    {
      to: `${base}/backup`,
      icon: DatabaseBackup,
      label: 'Backup & restore',
      hint: 'Download or restore a copy of this workspace',
    },
  ];
  return (
    <SettingsSection title={workspace.name} description="Admin tools for this workspace.">
      <ul className="-mx-3 py-2">
        {links.map(({ to, icon: Icon, label, hint }) => (
          <li key={to}>
            <Link to={to} className="hover:bg-subtle flex items-center gap-3 rounded-2xl px-3 py-3">
              <span className="bg-subtle grid h-9 w-9 shrink-0 place-items-center rounded-xl">
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{label}</span>
                <span className="text-muted block text-xs">{hint}</span>
              </span>
              <ChevronRight className="text-muted h-4 w-4" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </SettingsSection>
  );
}

export function AccountPage() {
  const { data: user } = useCurrentUser();
  const { workspace } = useOutletContext() ?? {};
  const [searchParams, setSearchParams] = useSearchParams();
  const [pickerOpen, setPickerOpen] = useState(false);

  const isAdmin = workspace && canAdminister(workspace);
  const tabs = [
    { id: 'profile', label: 'Profile', icon: UserRound },
    { id: 'security', label: 'Security', icon: KeyRound },
    { id: 'billing', label: 'Billing & invoices', icon: CreditCard },
    ...(isAdmin ? [{ id: 'workspace', label: 'Workspace', icon: Settings }] : []),
  ];
  const requested = searchParams.get('tab');
  const active = tabs.some((tab) => tab.id === requested) ? requested : 'profile';

  function selectTab(id) {
    setSearchParams(id === 'profile' ? {} : { tab: id }, { replace: true });
  }

  const openPicker = () => setPickerOpen(true);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <AccountHeader user={user} workspace={workspace} onChangePicture={openPicker} />
      <Tabs tabs={tabs} active={active} onChange={selectTab} />

      {active === 'profile' && <ProfileSection user={user} onChangePicture={openPicker} />}
      {active === 'security' && <SecuritySection />}
      {active === 'billing' && <BillingSection user={user} />}
      {active === 'workspace' && isAdmin && <WorkspaceAdminSection workspace={workspace} />}

      <Dialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="Profile picture"
        description="Upload a photo or pick an avatar. Teammates see it everywhere."
      >
        <Suspense fallback={<Skeleton className="h-64" />}>
          <div className="-mx-6 -my-5">
            <AvatarPicker user={user} onSaved={() => setPickerOpen(false)} />
          </div>
        </Suspense>
      </Dialog>
    </div>
  );
}

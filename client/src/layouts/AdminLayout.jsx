import {
  Activity,
  ArrowLeft,
  CreditCard,
  Gauge,
  Inbox,
  IndianRupee,
  ReceiptText,
  LifeBuoy,
  ScrollText,
  Users,
} from 'lucide-react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { Logo } from '../components/ui/Logo.jsx';
import { ThemeToggle } from '../components/ui/ThemeToggle.jsx';
import { useAdminDashboard } from '../features/admin/hooks.js';
import { cn } from '../lib/cn.js';

const NAV = [
  { to: '/admin', label: 'Dashboard', icon: Gauge, end: true },
  { to: '/admin/users', label: 'Users', icon: Users },
  { to: '/admin/subscriptions', label: 'Subscriptions', icon: CreditCard },
  { to: '/admin/sales', label: 'Sales', icon: IndianRupee },
  { to: '/admin/invoicing', label: 'Invoicing', icon: ReceiptText },
  {
    to: '/admin/upgrade-requests',
    label: 'Upgrade requests',
    icon: Inbox,
    badge: 'openUpgradeRequests',
  },
  { to: '/admin/support', label: 'Support', icon: LifeBuoy, badge: 'openSupportTickets' },
  { to: '/admin/audit-log', label: 'Audit log', icon: ScrollText },
  { to: '/admin/system', label: 'System', icon: Activity },
];

function AdminNav() {
  const { data: metrics } = useAdminDashboard();
  return (
    <nav aria-label="Admin" className="flex gap-1 overflow-x-auto md:block md:space-y-1">
      {NAV.map(({ to, label, icon: Icon, end, badge }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            cn(
              'flex shrink-0 items-center gap-3 rounded-full px-3.5 py-2.5 text-sm transition-colors',
              isActive ? 'pill-active font-medium' : 'text-ink/75 hover:bg-surface hover:text-ink',
            )
          }
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
          <span className="md:flex-1">{label}</span>
          {badge && metrics?.[badge] > 0 && (
            <span className="bg-accent text-accent-ink rounded-full px-1.5 text-xs font-medium tabular-nums">
              {metrics[badge]}
            </span>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

export function AdminLayout() {
  return (
    <div>
      <div className="bg-surface min-h-screen p-2 sm:p-3 md:flex md:gap-4">
        <aside className="bg-bg mb-3 flex flex-col gap-4 rounded-[22px] px-3 py-4 md:sticky md:top-3 md:mb-0 md:h-[calc(100vh-1.5rem)] md:w-64 lg:rounded-[28px]">
          <div className="flex items-center justify-between px-2">
            <Logo />
            <span className="text-muted text-xs uppercase tracking-[0.14em]">Admin</span>
          </div>
          <AdminNav />
          <div className="border-line mt-auto hidden items-center justify-between border-t pt-3 md:flex">
            <Link
              to="/app"
              className="text-muted hover:text-ink flex items-center gap-1.5 px-2 text-sm"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Back to the app
            </Link>
            <ThemeToggle />
          </div>
        </aside>
        <main className="bg-bg min-w-0 flex-1 rounded-[22px] px-4 py-6 md:px-8 md:py-8 lg:rounded-[28px]">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

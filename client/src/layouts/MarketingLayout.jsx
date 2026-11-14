import { Link, Outlet } from 'react-router-dom';
import { Logo } from '../components/ui/Logo.jsx';
import { ThemeToggle } from '../components/ui/ThemeToggle.jsx';
import { useCurrentUser } from '../features/auth/hooks.js';
import { OfferBar } from '../pages/marketing/home/OfferBar.jsx';

const SECTION_LINKS = [
  { href: '/#ai', label: 'AI assistant' },
  { href: '/#connectors', label: 'Connectors' },
  { href: '/#workflows', label: 'How it works' },
  { href: '/#pricing', label: 'Pricing' },
  { href: '/#faq', label: 'FAQ' },
];

function AccountLinks() {
  const { data: user } = useCurrentUser();

  if (user) {
    return (
      <Link
        to="/app"
        className="pill-active rounded-full px-4 py-2 text-sm font-medium hover:opacity-90"
      >
        Open your studio
      </Link>
    );
  }

  return (
    <>
      <Link to="/login" className="text-muted hover:text-ink hidden text-sm sm:inline">
        Sign in
      </Link>
      <Link
        to="/signup"
        className="pill-active rounded-full px-4 py-2 text-sm font-medium hover:opacity-90"
      >
        Start free trial
      </Link>
    </>
  );
}

function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 px-3 pt-3 sm:px-5">
      <div className="bg-surface/85 shadow-soft border-surface mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 rounded-full border px-3 backdrop-blur sm:px-4">
        <Link to="/" className="rounded-full" aria-label="FrameDesk home">
          <Logo />
        </Link>
        <nav className="hidden items-center gap-6 lg:flex" aria-label="Main">
          {SECTION_LINKS.map((link) => (
            <a key={link.href} href={link.href} className="text-muted hover:text-ink text-sm">
              {link.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <AccountLinks />
        </div>
      </div>
    </header>
  );
}

function SiteFooter() {
  return (
    <footer className="border-line border-t">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm">
            <Logo />
            <p className="text-muted mt-3 text-sm leading-relaxed">
              One desk for footage, files and client feedback, with an AI assistant built in. Made
              for editors, designers and small studios in India.
            </p>
          </div>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-7 gap-y-2 text-sm">
            {SECTION_LINKS.map((link) => (
              <a key={link.href} href={link.href} className="text-muted hover:text-ink">
                {link.label}
              </a>
            ))}
            <Link to="/login" className="text-muted hover:text-ink">
              Sign in
            </Link>
          </nav>
        </div>
        <p className="text-muted border-line mt-10 border-t pt-6 text-sm">
          © {new Date().getFullYear()} FrameDesk · Prices in INR, plus GST
        </p>
      </div>
    </footer>
  );
}

export function MarketingLayout() {
  return (
    <div className="min-h-screen">
      <OfferBar />
      <SiteHeader />
      <Outlet />
      <SiteFooter />
    </div>
  );
}

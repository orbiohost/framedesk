import { Menu, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { Logo } from '../components/ui/Logo.jsx';
import { ThemeToggle } from '../components/ui/ThemeToggle.jsx';
import { useCurrentUser } from '../features/auth/hooks.js';
import { OfferBar } from '../pages/marketing/home/OfferBar.jsx';
import { cn } from '../lib/cn.js';
import { useDismiss } from '../lib/useDismiss.js';

const SECTION_LINKS = [
  { href: '/features', label: 'Features' },
  { href: '/ai', label: 'AI assistant' },
  { href: '/ai#connectors', label: 'Connectors' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/features#android', label: 'Android app' },
  { href: '/pricing#faq', label: 'FAQ' },
];

// Moving between pages starts at the top, or at the #section asked for once
// the (lazily loaded) page has drawn it.
function useScrollOnNavigate() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (!hash) {
      window.scrollTo(0, 0);
      return undefined;
    }
    let tries = 0;
    const timer = setInterval(() => {
      const target = document.getElementById(decodeURIComponent(hash.slice(1)));
      if (target || ++tries > 40) {
        clearInterval(timer);
        target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 50);
    return () => clearInterval(timer);
  }, [pathname, hash]);
}

function AccountLinks() {
  const { data: user } = useCurrentUser();

  if (user) {
    return (
      <Link
        to="/app"
        className="pill-active rounded-full px-4 py-2 text-sm font-medium hover:opacity-90"
      >
        <span className="sm:hidden">Open app</span>
        <span className="hidden sm:inline">Open your studio</span>
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
        <span className="sm:hidden">Start free</span>
        <span className="hidden sm:inline">Get started free</span>
      </Link>
    </>
  );
}

// Phones and tablets: the section links fold into a menu under the header.
function MobileMenu({ onClose }) {
  const { data: user } = useCurrentUser();
  return (
    <div
      id="site-menu"
      className="bg-surface/95 shadow-soft border-line/70 mx-auto mt-2 max-w-6xl animate-[fade-in_150ms_ease-out] rounded-3xl border p-3 backdrop-blur lg:hidden"
    >
      <nav aria-label="Main" className="grid">
        {SECTION_LINKS.map((link) => (
          <Link
            key={link.href}
            to={link.href}
            onClick={onClose}
            className="hover:bg-subtle active:bg-subtle rounded-2xl px-4 py-3 text-[15px] font-medium"
          >
            {link.label}
          </Link>
        ))}
      </nav>
      <div className="border-line/70 mt-2 flex items-center justify-between gap-3 border-t px-2 pt-3">
        <ThemeToggle compact />
        {!user && (
          <Link
            to="/login"
            onClick={onClose}
            className="bg-subtle rounded-full px-5 py-2.5 text-sm font-medium"
          >
            Sign in
          </Link>
        )}
      </div>
    </div>
  );
}

function SiteHeader() {
  const { pathname, hash } = useLocation();
  // The menu belongs to the place it was opened on, so following a link closes it.
  const [openedOn, setOpenedOn] = useState(null);
  const here = pathname + hash;
  const isOpen = openedOn === here;
  const close = useCallback(() => setOpenedOn(null), []);
  const headerRef = useRef(null);
  useDismiss(headerRef, isOpen, close);

  return (
    <header ref={headerRef} className="sticky top-0 z-30 px-3 pt-3 sm:px-5">
      <div className="bg-surface/85 shadow-soft border-surface mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 rounded-full border px-3 backdrop-blur sm:gap-6 sm:px-4">
        <Link to="/" className="min-w-0 shrink rounded-full" aria-label="FrameDesk home">
          <Logo />
        </Link>
        <nav className="hidden items-center gap-6 lg:flex" aria-label="Main">
          {SECTION_LINKS.map((link) => (
            <Link key={link.href} to={link.href} className="text-muted hover:text-ink text-sm">
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <span className="hidden lg:block">
            <ThemeToggle />
          </span>
          <AccountLinks />
          <button
            type="button"
            onClick={() => setOpenedOn(isOpen ? null : here)}
            aria-label={isOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={isOpen}
            aria-controls="site-menu"
            className={cn(
              'grid h-10 w-10 place-items-center rounded-full transition-colors active:scale-95 lg:hidden',
              isOpen ? 'pill-active' : 'bg-subtle',
            )}
          >
            {isOpen ? (
              <X className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Menu className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>
      {isOpen && <MobileMenu onClose={close} />}
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
              <Link key={link.href} to={link.href} className="text-muted hover:text-ink">
                {link.label}
              </Link>
            ))}
            <Link to="/login" className="text-muted hover:text-ink">
              Sign in
            </Link>
          </nav>
        </div>
        <div className="text-muted border-line mt-10 flex flex-wrap items-center justify-between gap-3 border-t pt-6 text-sm">
          <p>© {new Date().getFullYear()} FrameDesk · Prices in INR, plus GST</p>
          <nav aria-label="Legal" className="flex gap-5">
            <Link to="/privacy" className="hover:text-ink">
              Privacy Policy
            </Link>
            <Link to="/terms" className="hover:text-ink">
              Terms of Service
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}

export function MarketingLayout() {
  useScrollOnNavigate();
  return (
    <div className="min-h-screen">
      <OfferBar />
      <SiteHeader />
      <Outlet />
      <SiteFooter />
    </div>
  );
}

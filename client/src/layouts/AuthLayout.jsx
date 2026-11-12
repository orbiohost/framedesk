import { Link } from 'react-router-dom';
import { Logo } from '../components/ui/Logo.jsx';

const PROMISES = [
  'Multi-GB rushes upload in the background and survive a dropped connection.',
  'Clients leave notes pinned to the exact second of a cut.',
  'Freelancers see only the projects you hand them.',
];

function EditorialPanel() {
  return (
    <aside className="widget-lavender text-ink m-4 hidden flex-col justify-between rounded-[36px] p-12 lg:flex">
      <p className="text-muted text-xs uppercase tracking-[0.16em]">
        For editors, designers and small studios
      </p>
      <div>
        <p className="font-display max-w-md text-5xl leading-[1.05]">
          Raw footage, exports and client notes. One place, not five.
        </p>
        <ol className="text-ink/75 mt-10 max-w-sm space-y-3 text-sm">
          {PROMISES.map((promise, index) => (
            <li
              key={promise}
              className="bg-surface/60 flex gap-4 rounded-2xl px-4 py-3 backdrop-blur"
            >
              <span className="font-display text-ink text-base">0{index + 1}</span>
              <span>{promise}</span>
            </li>
          ))}
        </ol>
      </div>
      <p className="text-muted text-xs">Billed in INR. Your files stay on our servers in India.</p>
    </aside>
  );
}

export function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <main className="bg-surface/85 m-2 flex flex-col rounded-[32px] px-6 py-8 backdrop-blur sm:m-4 sm:px-12 lg:mr-0">
        <Link to="/" className="self-start rounded">
          <Logo />
        </Link>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">
          <h1 className="font-display text-[40px] leading-[1.05]">{title}</h1>
          {subtitle && <p className="text-muted mt-3">{subtitle}</p>}
          <div className="mt-10">{children}</div>
          {footer && <div className="text-muted mt-8 text-sm">{footer}</div>}
        </div>
      </main>
      <EditorialPanel />
    </div>
  );
}

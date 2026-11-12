import { Logo } from './Logo.jsx';

export function FullPageMessage({ title, children }) {
  return (
    <main className="grid min-h-screen place-items-center px-6">
      <div className="max-w-sm text-center">
        <Logo className="mb-10 justify-center" />
        <h1 className="font-display text-4xl leading-tight">{title}</h1>
        <div className="text-muted mt-3">{children}</div>
      </div>
    </main>
  );
}

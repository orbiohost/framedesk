import { isRouteErrorResponse, Link, useRouteError } from 'react-router-dom';
import { FullPageMessage } from '../components/ui/FullPageMessage.jsx';
import { NotFoundPage } from './NotFoundPage.jsx';

// Shown instead of React Router's developer screen when a page crashes.
export function RouteErrorPage() {
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFoundPage />;
  if (error) console.error(error);

  return (
    <FullPageMessage title="Something went wrong">
      This page hit a problem. Your work is saved.{' '}
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="text-ink underline underline-offset-4"
      >
        Reload the page
      </button>{' '}
      or{' '}
      <Link to="/app" reloadDocument className="text-ink underline underline-offset-4">
        go to your workspace
      </Link>
      .
    </FullPageMessage>
  );
}

import { Link } from 'react-router-dom';
import { FullPageMessage } from '../components/ui/FullPageMessage.jsx';

export function NotFoundPage() {
  return (
    <FullPageMessage title="Nothing here">
      The page you followed doesn&apos;t exist or has moved.{' '}
      <Link to="/app" className="text-ink underline underline-offset-4">
        Go to your workspace
      </Link>
    </FullPageMessage>
  );
}

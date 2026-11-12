import { useOutletContext } from 'react-router-dom';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { CalendarView } from '../../features/calendar/CalendarView.jsx';

export function CalendarPage() {
  const { workspace } = useOutletContext();
  return (
    <>
      <PageHeader title="Calendar" />
      <CalendarView workspace={workspace} />
    </>
  );
}

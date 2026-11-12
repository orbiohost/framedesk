import { useOutletContext } from 'react-router-dom';
import { CalendarView } from '../../../features/calendar/CalendarView.jsx';

export function ProjectCalendarPage() {
  const { workspace, project } = useOutletContext();
  return <CalendarView workspace={workspace} projectId={project.id} defaultView="agenda" />;
}

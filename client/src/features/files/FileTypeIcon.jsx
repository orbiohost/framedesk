import {
  FileArchive,
  FileAudio,
  FileImage,
  FileText,
  FileVideo,
  File as GenericFileIcon,
  Shapes,
} from 'lucide-react';

export function FileTypeIcon({ category, className }) {
  const props = { className, 'aria-hidden': true };
  switch (category) {
    case 'video':
      return <FileVideo {...props} />;
    case 'image':
      return <FileImage {...props} />;
    case 'audio':
      return <FileAudio {...props} />;
    case 'document':
      return <FileText {...props} />;
    case 'project':
      return <Shapes {...props} />;
    case 'archive':
      return <FileArchive {...props} />;
    default:
      return <GenericFileIcon {...props} />;
  }
}

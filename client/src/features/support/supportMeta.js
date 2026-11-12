import { Bug, HelpCircle, Lightbulb, MessageSquareHeart } from 'lucide-react';

export const TICKET_TYPES = {
  question: {
    label: 'Question',
    hint: 'Need help or stuck on something',
    icon: HelpCircle,
    subject: 'What do you need help with?',
    message: 'Describe your question. The more detail, the faster we can help.',
  },
  bug: {
    label: 'Bug report',
    hint: 'Something is broken or not working',
    icon: Bug,
    subject: 'What went wrong? (e.g. "Video won\'t play on iPhone")',
    message:
      'What did you do, what did you expect, and what happened instead? Steps to repeat it help a lot.',
  },
  feature: {
    label: 'Feature request',
    hint: 'Something you wish FrameDesk could do',
    icon: Lightbulb,
    subject: 'The feature in a few words',
    message: 'What would you like, and how would it help you or your team?',
  },
  feedback: {
    label: 'Feedback',
    hint: 'Tell us what you like or what to improve',
    icon: MessageSquareHeart,
    subject: 'Sum it up in a few words',
    message: 'What is working well, and what could be better?',
  },
};

export const TICKET_TYPE_OPTIONS = Object.entries(TICKET_TYPES).map(([value, { label }]) => ({
  value,
  label,
}));

export const TICKET_STATUSES = {
  open: { label: 'Open', tone: 'accent' },
  in_progress: { label: 'In progress', tone: 'neutral' },
  resolved: { label: 'Resolved', tone: 'success' },
  closed: { label: 'Closed', tone: 'muted' },
};

export const TICKET_STATUS_OPTIONS = Object.entries(TICKET_STATUSES).map(([value, { label }]) => ({
  value,
  label,
}));

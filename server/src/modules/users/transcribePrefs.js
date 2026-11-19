// How long a clip dropped into a project's "Notes & Briefs" folder may be and
// still be transcribed by itself. Each person sets their own (Account → Profile).
export const AUTO_TRANSCRIBE_DEFAULT_MINUTES = 60;

export function autoTranscribeMinutesOf(user) {
  return user?.autoTranscribeMinutes ?? AUTO_TRANSCRIBE_DEFAULT_MINUTES;
}

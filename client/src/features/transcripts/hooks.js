import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/apiClient.js';
import { toQueryString } from '../../lib/queryString.js';
import { featureKey } from '../../lib/workspaceKeys.js';

const POLL_MS = 3000;

function path(workspaceId) {
  return `/workspaces/${workspaceId}/transcripts`;
}

export function isTranscribable(file) {
  return file?.category === 'video' || file?.category === 'audio';
}

export function isWorking(transcript) {
  return transcript?.status === 'queued' || transcript?.status === 'processing';
}

// Whether this server has speech-to-text at all.
export function useTranscriptionEnabled(workspaceId) {
  const { data } = useQuery({
    queryKey: featureKey(workspaceId, 'transcripts', 'config'),
    queryFn: () => api.get(`${path(workspaceId)}/config`),
    enabled: Boolean(workspaceId),
    staleTime: 10 * 60 * 1000,
  });
  return Boolean(data?.enabled);
}

// Polls while speech-to-text is working, so new lines show up as they are written.
export function useTranscript(workspaceId, fileId, { enabled = true } = {}) {
  return useQuery({
    queryKey: featureKey(workspaceId, 'transcripts', fileId),
    queryFn: async () => (await api.get(`${path(workspaceId)}/${fileId}`)).transcript,
    enabled: enabled && Boolean(fileId),
    refetchInterval: (query) => (isWorking(query.state.data) ? POLL_MS : false),
  });
}

// Every transcript in the workspace, newest first, 30 at a time. Refreshes
// itself only while something on screen is still queued or transcribing.
export function useTranscriptHistory(workspaceId) {
  return useInfiniteQuery({
    queryKey: featureKey(workspaceId, 'transcripts', 'history'),
    queryFn: ({ pageParam }) =>
      api.get(`${path(workspaceId)}${toQueryString({ cursor: pageParam })}`),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    refetchInterval: (query) =>
      query.state.data?.pages.some((page) => page.transcripts.some(isWorking)) ? POLL_MS : false,
  });
}

// The Drive folder uploads from the Transcribe page go to; created on first use.
function transcriptionsFolderQuery(workspaceId) {
  return {
    queryKey: featureKey(workspaceId, 'transcripts', 'folder'),
    queryFn: async () => (await api.post(`${path(workspaceId)}/folder`)).folder,
    staleTime: Infinity,
  };
}

export function useTranscriptionsFolder(workspaceId, { enabled = true } = {}) {
  return useQuery({ ...transcriptionsFolderQuery(workspaceId), enabled });
}

// The same folder on demand, for places that only need it once files are picked.
export function fetchTranscriptionsFolder(queryClient, workspaceId) {
  return queryClient.fetchQuery(transcriptionsFolderQuery(workspaceId));
}

export function useRequestTranscript(workspaceId, fileId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ language, task }) =>
      (await api.post(`${path(workspaceId)}/${fileId}`, { language: language || null, task }))
        .transcript,
    onSuccess: (transcript) => {
      queryClient.setQueryData(featureKey(workspaceId, 'transcripts', fileId), transcript);
      queryClient.invalidateQueries({
        queryKey: featureKey(workspaceId, 'transcripts', 'history'),
      });
    },
  });
}

export function useDeleteTranscript(workspaceId, fileId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete(`${path(workspaceId)}/${fileId}`),
    onSuccess: () => {
      queryClient.setQueryData(featureKey(workspaceId, 'transcripts', fileId), null);
      queryClient.invalidateQueries({
        queryKey: featureKey(workspaceId, 'transcripts', 'history'),
      });
    },
  });
}

// The same actions for any row of the history: the file id comes with each call.
function useHistoryMutation(workspaceId, mutationFn) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (_result, { fileId }) =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: featureKey(workspaceId, 'transcripts', fileId),
        }),
        queryClient.invalidateQueries({
          queryKey: featureKey(workspaceId, 'transcripts', 'history'),
        }),
      ]),
  });
}

// Starts a transcript over: a retry, a fresh run, or a run as an English translation.
export function useRerunTranscript(workspaceId) {
  return useHistoryMutation(workspaceId, ({ fileId, language, task }) =>
    api.post(`${path(workspaceId)}/${fileId}`, { language: language || null, task }),
  );
}

// Removes the transcript only; the recording stays in the Drive.
export function useRemoveTranscript(workspaceId) {
  return useHistoryMutation(workspaceId, ({ fileId }) =>
    api.delete(`${path(workspaceId)}/${fileId}`),
  );
}

// The full text of a finished transcript, one line per segment.
export async function fetchTranscriptText(workspaceId, fileId) {
  const { transcript } = await api.get(`${path(workspaceId)}/${fileId}`);
  return (transcript?.segments ?? []).map((segment) => segment.text.trim()).join('\n');
}

export function transcriptExportUrl(workspaceId, fileId, format) {
  return `/api${path(workspaceId)}/${fileId}/export${toQueryString({ format })}`;
}

// A recorded voice clip in, its text out.
export async function dictate(workspaceId, blob, language) {
  return api.postBlob(`${path(workspaceId)}/dictation${toQueryString({ language })}`, blob);
}

// The languages Qwen3-ASR transcribes (ISO codes); "" lets it detect the language.
export const LANGUAGE_OPTIONS = [
  { value: '', label: 'Detect automatically' },
  { value: 'en', label: 'English' },
  { value: 'hi', label: 'Hindi' },
  { value: 'ar', label: 'Arabic' },
  { value: 'yue', label: 'Cantonese' },
  { value: 'zh', label: 'Chinese' },
  { value: 'cs', label: 'Czech' },
  { value: 'da', label: 'Danish' },
  { value: 'nl', label: 'Dutch' },
  { value: 'fil', label: 'Filipino' },
  { value: 'fi', label: 'Finnish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'el', label: 'Greek' },
  { value: 'hu', label: 'Hungarian' },
  { value: 'id', label: 'Indonesian' },
  { value: 'it', label: 'Italian' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'mk', label: 'Macedonian' },
  { value: 'ms', label: 'Malay' },
  { value: 'fa', label: 'Persian' },
  { value: 'pl', label: 'Polish' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'ro', label: 'Romanian' },
  { value: 'ru', label: 'Russian' },
  { value: 'es', label: 'Spanish' },
  { value: 'sv', label: 'Swedish' },
  { value: 'th', label: 'Thai' },
  { value: 'tr', label: 'Turkish' },
  { value: 'vi', label: 'Vietnamese' },
];

export function languageName(code) {
  if (!code) return null;
  return (
    LANGUAGE_OPTIONS.find((option) => option.value === code)?.label ??
    new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ??
    code
  );
}

// Suggestions in an Indian script for a word typed in English letters
// ("aapka" → ["आपका", ...]). Answers are kept for the session.
const transliterations = new Map();
export async function fetchTransliteration(workspaceId, text, language) {
  const key = `${language}:${text.toLowerCase()}`;
  if (!transliterations.has(key)) {
    const request = api
      .get(`${path(workspaceId)}/transliterate${toQueryString({ text, language })}`)
      .then((data) => data.suggestions ?? []);
    transliterations.set(key, request);
    // A failed lookup is asked again next time.
    request.catch(() => transliterations.delete(key));
  }
  return transliterations.get(key);
}

// Saves hand-corrected lines: edits = [{ index, text }].
export function useEditTranscriptSegments(workspaceId, fileId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (edits) =>
      (await api.patch(`${path(workspaceId)}/${fileId}/segments`, { edits })).transcript,
    onSuccess: (transcript) => {
      queryClient.setQueryData(featureKey(workspaceId, 'transcripts', fileId), transcript);
      queryClient.invalidateQueries({ queryKey: featureKey(workspaceId, 'briefs') });
    },
  });
}

// Has the AI watch a video too, not only read its transcript.
export function useWatchVideo(workspaceId, fileId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      (await api.post(`${path(workspaceId)}/${fileId}/watch-video`)).transcript,
    onSuccess: (transcript) =>
      queryClient.setQueryData(featureKey(workspaceId, 'transcripts', fileId), transcript),
  });
}

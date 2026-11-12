import { ApiError, api, ensureCsrfToken } from '../../lib/apiClient.js';

function parseError(xhr) {
  try {
    const payload = JSON.parse(xhr.responseText);
    return new ApiError({ status: xhr.status, ...payload.error });
  } catch {
    return new ApiError({
      status: xhr.status,
      code: 'RESTORE_FAILED',
      message: 'The restore did not finish. Please try again.',
    });
  }
}

function send(url, file, csrfToken, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.withCredentials = true;
    xhr.setRequestHeader('Content-Type', 'application/zip');
    xhr.setRequestHeader('X-CSRF-Token', csrfToken);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(JSON.parse(xhr.responseText).data.summary);
      else reject(parseError(xhr));
    };
    xhr.onerror = () =>
      reject(
        new ApiError({
          status: 0,
          code: 'NETWORK_ERROR',
          message: 'The connection dropped while uploading the backup.',
        }),
      );
    xhr.send(file);
  });
}

// XMLHttpRequest rather than fetch, because only it reports upload progress.
export async function uploadBackupZip(workspaceId, file, onProgress) {
  // A cheap authenticated call first, so an expired session is refreshed before a long upload.
  await api.get('/users/me');
  const csrfToken = await ensureCsrfToken();
  return send(`/api/workspaces/${workspaceId}/backups/restore`, file, csrfToken, onProgress);
}

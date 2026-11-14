import { createHmac, timingSafeEqual } from 'node:crypto';
import { storageConfig } from '../../config/storage.js';
import { MCP_PATH, PUBLIC_ORIGIN } from './oauth.service.js';

// Download links handed to AI assistants when a connection has "Allow file
// downloads" on. A link is a signed, self-contained token (which grant, which
// workspace, which file, until when) served from FrameDesk's own domain, so a
// sandboxed assistant only has to be allowed to reach one host. Nothing is
// stored: the download endpoint re-checks the grant, the switch, the person's
// membership and the file's visibility on every request, so revoking the
// connection or turning the switch off kills every link already handed out.

export const DOWNLOAD_LINK_TTL_SECONDS = 60 * 60;
export const DOWNLOAD_PATH = `${MCP_PATH}/files`;

const key = createHmac('sha256', storageConfig.urlSecret).update('mcp-download-links').digest();

function sign(payload) {
  return createHmac('sha256', key).update(payload).digest('base64url');
}

export function createDownloadLink({ grantId, workspaceId, fileId, fileName }) {
  const expiresAt = Math.floor(Date.now() / 1000) + DOWNLOAD_LINK_TTL_SECONDS;
  const payload = Buffer.from(
    JSON.stringify({ g: String(grantId), w: String(workspaceId), f: String(fileId), e: expiresAt }),
  ).toString('base64url');
  const token = `${payload}.${sign(payload)}`;
  // The file name at the end is only for tools that name the saved file after the URL.
  const safeName = encodeURIComponent(fileName.replace(/[/\\]/g, '_'));
  return {
    url: `${PUBLIC_ORIGIN}${DOWNLOAD_PATH}/${token}/${safeName}`,
    expiresAt: new Date(expiresAt * 1000).toISOString(),
  };
}

// The token's contents, or null when it is malformed, tampered with or expired.
export function readDownloadToken(token) {
  if (typeof token !== 'string' || token.length > 600) return null;
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra !== undefined) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  let data;
  try {
    data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!data || typeof data.e !== 'number' || data.e * 1000 <= Date.now()) return null;
  return { grantId: data.g, workspaceId: data.w, fileId: data.f };
}

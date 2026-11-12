// Reads the tus "Upload-Metadata" header: comma-separated "key base64(value)" pairs.

export function parseUploadMetadata(header = '') {
  const metadata = {};
  for (const pair of header.split(',')) {
    const [key, encoded] = pair.trim().split(' ');
    if (!key) continue;
    metadata[key] = encoded ? Buffer.from(encoded, 'base64').toString('utf8') : '';
  }
  return metadata;
}

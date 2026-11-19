import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import { PassThrough } from 'node:stream';
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListPartsCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { storageConfig } from '../config/storage.js';
import { contentDisposition, playbackMime } from './mediaHeaders.js';

// Same key shape the local driver enforces: "<workspaceId>/<yyyy-mm>/<uuid>".
const KEY_PATTERN = /^[a-f\d]{24}\/\d{4}-\d{2}\/[a-f\d-]{36}$/i;
// Big uploads go up in parallel 16 MiB parts (S3 allows 10,000 parts, so up to ~160 GB).
const PART_BYTES = 16 * 1024 * 1024;
const PARALLEL_PARTS = 4;
// Signed links are rounded to this step so opening a file again soon gives the
// identical URL, and the browser can reuse the video it already cached.
const URL_STEP_SECONDS = 5 * 60;

function isNotFound(err) {
  return (
    err?.name === 'NotFound' || err?.name === 'NoSuchKey' || err?.$metadata?.httpStatusCode === 404
  );
}

function clientFromConfig(config) {
  const credentials =
    config.accessKeyId && config.secretAccessKey
      ? { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey }
      : undefined; // the AWS default chain: IAM role, environment, ~/.aws
  return new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle,
    credentials,
  });
}

// Files in an Amazon S3 bucket (or any S3-compatible store). The bucket stays
// private: browsers get short-lived signed links straight to S3, so video
// streams from S3 and never passes through this server.
export class S3Driver {
  constructor(config = storageConfig.s3, client = clientFromConfig(config)) {
    this.bucket = config.bucket;
    this.prefix = config.keyPrefix ?? '';
    this.client = client;
  }

  objectKey(key) {
    if (!KEY_PATTERN.test(key)) throw new Error('Invalid storage key');
    return `${this.prefix}${key}`;
  }

  // Streams a local file into the bucket and leaves the local file alone
  // (the migration script copies this way).
  async uploadFile(localPath, key) {
    const upload = new Upload({
      client: this.client,
      params: { Bucket: this.bucket, Key: this.objectKey(key), Body: createReadStream(localPath) },
      partSize: PART_BYTES,
      queueSize: PARALLEL_PARTS,
      leavePartsOnError: false,
    });
    await upload.done();
  }

  // Takes a finished upload from local staging: the bucket now owns the bytes.
  async saveFromFile(localPath, key) {
    await this.uploadFile(localPath, key);
    await fs.rm(localPath, { force: true });
  }

  // Callers expect a stream straight away (backup zips open entries lazily),
  // so the S3 request starts here and its body is piped into a PassThrough.
  readStream(key, range) {
    const out = new PassThrough();
    const params = { Bucket: this.bucket, Key: this.objectKey(key) };
    if (range) params.Range = `bytes=${range.start}-${range.end}`;
    this.client
      .send(new GetObjectCommand(params))
      .then(({ Body }) => {
        Body.on('error', (err) => out.destroy(err));
        Body.pipe(out);
      })
      .catch((err) => out.destroy(err));
    return out;
  }

  async delete(key) {
    // S3 answers a delete of a missing key with success, as the interface wants.
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: this.objectKey(key) }),
    );
  }

  async head(key) {
    return this.client.send(
      new HeadObjectCommand({ Bucket: this.bucket, Key: this.objectKey(key) }),
    );
  }

  async exists(key) {
    try {
      await this.head(key);
      return true;
    } catch (err) {
      if (isNotFound(err)) return false;
      throw err;
    }
  }

  async getSize(key) {
    return (await this.head(key)).ContentLength;
  }

  // The download name, type and caching travel in the link itself, so S3
  // answers with the right headers for playback or download.
  async createSignedUrl(key, { fileName, mime, disposition, expiresInSeconds }) {
    const now = Math.floor(Date.now() / 1000);
    const signedAt = Math.floor(now / URL_STEP_SECONDS) * URL_STEP_SECONDS;
    // Signed at the start of the step, but valid for at least the full TTL from now.
    const expiresIn = expiresInSeconds + URL_STEP_SECONDS;
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: this.objectKey(key),
      ResponseContentType: playbackMime({ mime, disposition }),
      ResponseContentDisposition: contentDisposition(disposition, fileName),
      ResponseCacheControl: `private, max-age=${expiresInSeconds}, immutable`,
    });
    return getSignedUrl(this.client, command, {
      expiresIn,
      signingDate: new Date(signedAt * 1000),
    });
  }

  // A plain download link for the speech-to-text (asr) service, valid long enough to sit in its queue.
  async createWorkerUrl(key, expiresInSeconds) {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: this.objectKey(key) });
    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }

  // ---- Direct browser uploads (S3 multipart with presigned part links) ----
  // The browser PUTs each part straight to S3; the bytes never reach this
  // server or its disk. The bucket needs a CORS rule that allows PUT from the
  // app's origin and exposes the ETag header (see README).

  async createMultipartUpload(key, contentType) {
    const { UploadId } = await this.client.send(
      new CreateMultipartUploadCommand({
        Bucket: this.bucket,
        Key: this.objectKey(key),
        ContentType: contentType || 'application/octet-stream',
      }),
    );
    return UploadId;
  }

  async signUploadPart(key, uploadId, partNumber, expiresInSeconds) {
    const command = new UploadPartCommand({
      Bucket: this.bucket,
      Key: this.objectKey(key),
      UploadId: uploadId,
      PartNumber: partNumber,
    });
    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }

  // Every part S3 has received so far: [{ partNumber, etag, size }].
  async listParts(key, uploadId) {
    const parts = [];
    let marker;
    do {
      const page = await this.client.send(
        new ListPartsCommand({
          Bucket: this.bucket,
          Key: this.objectKey(key),
          UploadId: uploadId,
          PartNumberMarker: marker,
        }),
      );
      for (const part of page.Parts ?? []) {
        parts.push({ partNumber: part.PartNumber, etag: part.ETag, size: part.Size });
      }
      marker = page.IsTruncated ? page.NextPartNumberMarker : undefined;
    } while (marker);
    return parts;
  }

  async completeMultipartUpload(key, uploadId, parts) {
    await this.client.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.bucket,
        Key: this.objectKey(key),
        UploadId: uploadId,
        MultipartUpload: {
          Parts: parts.map((part) => ({ PartNumber: part.partNumber, ETag: part.etag })),
        },
      }),
    );
  }

  async abortMultipartUpload(key, uploadId) {
    try {
      await this.client.send(
        new AbortMultipartUploadCommand({
          Bucket: this.bucket,
          Key: this.objectKey(key),
          UploadId: uploadId,
        }),
      );
    } catch (err) {
      if (err?.name !== 'NoSuchUpload' && !isNotFound(err)) throw err;
    }
  }

  // The first bytes of a stored object (for checking what the file really is).
  async readStart(key, bytes) {
    const chunks = [];
    for await (const chunk of this.readStream(key, { start: 0, end: bytes - 1 }))
      chunks.push(chunk);
    return Buffer.concat(chunks);
  }
}

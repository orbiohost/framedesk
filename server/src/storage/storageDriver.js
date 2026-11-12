/**
 * Every storage driver implements this shape. Services only talk to the driver
 * returned by getStorageDriver(), which is the S3 bucket.
 *
 * @typedef {object} StorageDriver
 * @property {(localPath: string, key: string) => Promise<void>} saveFromFile
 *   Takes ownership of a finished upload on local disk and stores it under `key`.
 * @property {(key: string, range?: { start: number, end: number }) => import('node:stream').Readable} readStream
 * @property {(key: string) => Promise<void>} delete   No error if the key is already gone.
 * @property {(key: string) => Promise<boolean>} exists
 * @property {(key: string) => Promise<number>} getSize
 * @property {(key: string, options: SignedUrlOptions) => Promise<string>} createSignedUrl
 *   A short-lived link the browser opens directly.
 * @property {(key: string, expiresInSeconds: number) => Promise<string>} createWorkerUrl
 *   A download link for the Whisper service, which can't read the bucket itself.
 *
 * @typedef {object} SignedUrlOptions
 * @property {string} fileName      Name the browser should save the file as.
 * @property {string} mime
 * @property {'inline' | 'attachment'} disposition
 * @property {number} expiresInSeconds
 */

import { S3Driver } from './s3Driver.js';

let driver;

/** @returns {StorageDriver} */
export function getStorageDriver() {
  driver ??= new S3Driver();
  return driver;
}

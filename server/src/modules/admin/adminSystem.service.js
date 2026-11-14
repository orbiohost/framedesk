import fs from 'node:fs/promises';
import mongoose from 'mongoose';
import { env } from '../../config/env.js';
import { storageConfig } from '../../config/storage.js';
import { isGeminiConfigured } from '../ai/gemini.client.js';

async function databaseHealth() {
  const started = performance.now();
  try {
    await mongoose.connection.db.admin().ping();
    return { ok: true, latencyMs: Math.round(performance.now() - started) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// Unfinished uploads waiting to be resumed (each has a .json sidecar).
async function pendingUploads() {
  try {
    const names = await fs.readdir(storageConfig.stagingDir);
    return names.filter((name) => name.endsWith('.json')).length;
  } catch {
    return 0;
  }
}

export async function getSystemHealth() {
  const memory = process.memoryUsage();
  return {
    database: await databaseHealth(),
    server: {
      uptimeSeconds: Math.round(process.uptime()),
      nodeVersion: process.version,
      environment: env.NODE_ENV,
      memoryRssBytes: memory.rss,
      heapUsedBytes: memory.heapUsed,
    },
    uploads: { pending: await pendingUploads() },
    email: { transport: env.MAIL_TRANSPORT },
    ai: { geminiConfigured: isGeminiConfigured() },
    // Not part of this build yet; listed so the page says so plainly.
    notConfigured: ['Background job queue (Redis/BullMQ)', 'Razorpay'],
  };
}

import dns from 'node:dns';
import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

// Used only when the machine's own DNS can't answer the SRV lookup.
const FALLBACK_DNS_SERVERS = ['1.1.1.1', '8.8.8.8'];

// `mongodb+srv://` URIs need a DNS SRV lookup. Many home routers and some
// ISP resolvers fail those (ESERVFAIL / ECONNREFUSED), which stops the server
// from starting. Check the lookup up front and, if the system resolver can't
// do it, switch this process to public resolvers before connecting.
async function ensureSrvResolvable(uri) {
  if (!uri.startsWith('mongodb+srv://')) return;
  const host = new URL(uri).hostname;
  try {
    await dns.promises.resolveSrv(`_mongodb._tcp.${host}`);
  } catch (error) {
    logger.warn(
      { code: error.code, systemDns: dns.getServers(), fallback: FALLBACK_DNS_SERVERS },
      'System DNS cannot resolve the MongoDB SRV record; using fallback DNS servers',
    );
    dns.setServers(FALLBACK_DNS_SERVERS);
  }
}

export async function connectDatabase(uri = env.MONGODB_URI) {
  mongoose.set('strictQuery', true);
  await ensureSrvResolvable(uri);
  await mongoose.connect(uri);
  logger.info('MongoDB connected');
}

export async function disconnectDatabase() {
  await mongoose.disconnect();
}

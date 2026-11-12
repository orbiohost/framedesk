/* eslint-disable no-console -- CLI script: printing the result is its job. */
// Creates (or updates) a superadmin and a demo client-role user in the admin's workspace.
// Credentials come from arguments so they are never stored in the repo:
//
//   npm run seed:users -w server -- --admin-email you@example.com --admin-password "secret" \
//     [--admin-name "Your Name"] [--client-email client@example.com] [--client-password "secret"]
//
// Safe to re-run: existing users are updated, not duplicated.
import { parseArgs } from 'node:util';
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { Membership } from '../src/modules/members/membership.model.js';
import { User } from '../src/modules/users/user.model.js';
import { createWorkspace } from '../src/modules/workspaces/workspaces.service.js';
import { Workspace } from '../src/modules/workspaces/workspace.model.js';
import { randomToken } from '../src/utils/crypto.js';
import { hashPassword } from '../src/utils/password.js';

const MIN_PASSWORD_LENGTH = 10;

function readOptions() {
  const { values } = parseArgs({
    options: {
      'admin-email': { type: 'string' },
      'admin-password': { type: 'string' },
      'admin-name': { type: 'string', default: 'Studio Admin' },
      'client-email': { type: 'string', default: 'demo.client@framedesk.local' },
      'client-password': { type: 'string' },
      'client-name': { type: 'string', default: 'Demo Client' },
    },
  });

  if (!values['admin-email'] || !values['admin-password']) {
    throw new Error('--admin-email and --admin-password are required');
  }
  for (const key of ['admin-password', 'client-password']) {
    if (values[key] && values[key].length < MIN_PASSWORD_LENGTH) {
      throw new Error(`--${key} must be at least ${MIN_PASSWORD_LENGTH} characters`);
    }
  }
  return values;
}

async function upsertUser({ email, name, password, isSuperadmin }) {
  const normalizedEmail = email.trim().toLowerCase();
  const fields = {
    name,
    passwordHash: await hashPassword(password),
    emailVerifiedAt: new Date(),
    status: 'active',
    failedLoginAttempts: 0,
    lockedUntil: null,
    isSuperadmin,
  };
  return User.findOneAndUpdate(
    { email: normalizedEmail },
    { $set: fields, $setOnInsert: { email: normalizedEmail } },
    { new: true, upsert: true, runValidators: true },
  );
}

async function ensureOwnedWorkspace(user) {
  const existing = await Workspace.findOne({ ownerId: user._id }).sort({ createdAt: 1 });
  if (existing) return existing;

  const summary = await createWorkspace({
    ownerId: user._id,
    name: `${user.name.split(' ')[0]}'s Studio`,
  });
  return Workspace.findById(summary.id);
}

async function ensureClientMembership({ workspace, client, invitedBy }) {
  await Membership.updateOne(
    { workspaceId: workspace._id, userId: client._id },
    {
      $set: { role: 'client', status: 'active' },
      $setOnInsert: { invitedBy, joinedAt: new Date() },
    },
    { upsert: true },
  );
}

async function main() {
  const options = readOptions();
  const clientPassword = options['client-password'] ?? `Demo-${randomToken(9)}`;

  await connectDatabase();

  const admin = await upsertUser({
    email: options['admin-email'],
    name: options['admin-name'],
    password: options['admin-password'],
    isSuperadmin: true,
  });
  const workspace = await ensureOwnedWorkspace(admin);

  const client = await upsertUser({
    email: options['client-email'],
    name: options['client-name'],
    password: clientPassword,
    isSuperadmin: false,
  });
  await ensureClientMembership({ workspace, client, invitedBy: admin._id });

  console.log('\nSeed complete');
  console.log(`  Superadmin : ${admin.email}  (owner of "${workspace.name}")`);
  console.log(`  Client     : ${client.email}  password: ${clientPassword}`);
  console.log(`  Workspace  : ${workspace._id}\n`);
}

main()
  .catch((err) => {
    console.error(`Seed failed: ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => disconnectDatabase());

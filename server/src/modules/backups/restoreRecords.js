import mongoose from 'mongoose';

// Merge rule for every collection: a record whose id already exists (anywhere)
// is left exactly as it is; a missing one is recreated in this workspace.
// Only whitelisted fields are copied, workspaceId always comes from the server,
// and mongoose validation still runs on every restored document.

const DUPLICATE_KEY = 11000;
export const MAX_PROBLEMS = 50;

export function newCollectionResult() {
  return { restored: 0, kept: 0, skipped: 0 };
}

export function addProblem(summary, message) {
  if (summary.problems.length < MAX_PROBLEMS) summary.problems.push(message);
}

function pick(record, fields) {
  return Object.fromEntries(
    fields.filter((field) => field in record).map((field) => [field, record[field]]),
  );
}

async function existsAnywhere(Model, id) {
  return Model.exists({ _id: id }).setOptions({ crossWorkspace: true });
}

export function existsHere(Model, workspaceId, id) {
  if (!id || !mongoose.isValidObjectId(id)) return null;
  return Model.exists({ _id: id, workspaceId });
}

// `prepare(doc)` fixes references and returns the doc, or { skip: reason }.
export async function restoreRecords({ Model, records, fields, label, ctx, prepare }) {
  const result = ctx.summary.collections[label];

  for (const record of Array.isArray(records) ? records : []) {
    if (!mongoose.isValidObjectId(record?._id)) {
      result.skipped += 1;
      continue;
    }
    if (await existsAnywhere(Model, record._id)) {
      result.kept += 1;
      continue;
    }

    const now = new Date();
    const prepared = await prepare({
      createdAt: now,
      updatedAt: now,
      ...pick(record, fields),
      _id: record._id,
      workspaceId: ctx.workspaceId,
    });
    if (prepared.skip) {
      result.skipped += 1;
      addProblem(
        ctx.summary,
        `${label}: "${record.name ?? record.title ?? record.displayName ?? record._id}" ${prepared.skip}`,
      );
      continue;
    }

    try {
      // timestamps: false keeps the original created/updated dates.
      await new Model(prepared).save({ timestamps: false });
      result.restored += 1;
    } catch (err) {
      result.skipped += 1;
      const reason =
        err.code === DUPLICATE_KEY
          ? 'clashes with an existing item of the same name'
          : 'has invalid data';
      addProblem(ctx.summary, `${label}: "${record.name ?? record.title ?? record._id}" ${reason}`);
    }
  }
}

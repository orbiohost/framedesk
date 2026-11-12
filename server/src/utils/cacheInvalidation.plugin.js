import { invalidate } from './cache.js';

// Bumps cache generations (see cache.js) after every write through Mongoose,
// so cached copies of a document are never served after it changes.
//
// scopesFor(source) receives a query filter or a document (or the document a
// findOneAnd* returned) and returns the scopes it touches, or null when they
// can't be told, which invalidates the whole cache.
//
// Not covered: writes that bypass Mongoose middleware (Model.collection.*,
// bulkWrite) and scripts running in another process. Those become visible
// when the cache TTL (60 s) runs out.

const QUERY_WRITES = [
  'updateOne',
  'updateMany',
  'replaceOne',
  'deleteOne',
  'deleteMany',
  'findOneAndUpdate',
  'findOneAndReplace',
  'findOneAndDelete',
];

// The id(s) a filter value pins down: an id, or { $in: [ids] }.
export function idsIn(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || value._bsontype === 'ObjectId') return [String(value)];
  if (Array.isArray(value.$in) && Object.keys(value).length === 1) return value.$in.map(String);
  return null;
}

export function cacheInvalidationPlugin(schema, { scopesFor }) {
  schema.post(
    QUERY_WRITES,
    { document: false, query: true },
    async function afterQueryWrite(result) {
      let scopes = scopesFor(this.getFilter());
      // findOneAnd* by some other field (e.g. a token hash): use the matched document.
      if (!scopes && result && !Array.isArray(result) && result._id) scopes = scopesFor(result);
      await invalidate(scopes);
    },
  );

  schema.post(
    ['save', 'deleteOne'],
    { document: true, query: false },
    async function afterDocWrite() {
      await invalidate(scopesFor(this));
    },
  );
}

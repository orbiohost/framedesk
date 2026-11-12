import { Schema } from 'mongoose';

const SCOPED_QUERY_OPS = [
  'find',
  'findOne',
  'findOneAndUpdate',
  'findOneAndDelete',
  'findOneAndReplace',
  'countDocuments',
  'distinct',
  'updateOne',
  'updateMany',
  'replaceOne',
  'deleteOne',
  'deleteMany',
];

function unscopedQueryError(modelName, operation) {
  return new Error(
    `Unscoped ${operation} on ${modelName}: the filter must include workspaceId. ` +
      'Pass { crossWorkspace: true } via setOptions only for deliberate cross-tenant reads.',
  );
}

// Adds workspaceId to a schema and makes every query on it fail loudly
// unless the filter includes workspaceId. This is the tenant-isolation guard:
// a forgotten filter becomes a crash in development, not a data leak.
//
// Note: use Model.deleteOne({ _id, workspaceId }) rather than doc.deleteOne(),
// since the latter builds a filter with only _id.
export function workspaceScopePlugin(schema) {
  schema.add({
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true, immutable: true },
  });

  schema.pre(SCOPED_QUERY_OPS, async function requireWorkspaceFilter() {
    if (this.getOptions().crossWorkspace) return;
    if (!this.getFilter().workspaceId) {
      throw unscopedQueryError(this.model.modelName, this.op);
    }
  });

  schema.pre('aggregate', async function requireWorkspaceMatch() {
    if (this.options.crossWorkspace) return;
    const firstStage = this.pipeline()[0];
    if (!firstStage?.$match?.workspaceId) {
      throw unscopedQueryError(this.model()?.modelName, 'aggregate');
    }
  });
}

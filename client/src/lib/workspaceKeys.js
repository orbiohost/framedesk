// Query keys for workspace data: ['ws', workspaceId, feature, ...rest].
// Invalidating ['ws', id, feature] refreshes every list and detail of that feature.
export function featureKey(workspaceId, feature, ...rest) {
  return ['ws', workspaceId, feature, ...rest];
}

export function invalidateFeatures(queryClient, workspaceId, features) {
  return Promise.all(
    features.map((feature) =>
      queryClient.invalidateQueries({ queryKey: featureKey(workspaceId, feature) }),
    ),
  );
}

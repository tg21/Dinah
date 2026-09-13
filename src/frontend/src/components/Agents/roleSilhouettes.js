// Fallback silhouette only. Real per-role blocks live in
// agent-templates/<role>.json (`sprite: {hat,tool,ears}`) and arrive via
// GET /api/roles into AppContext.roleSprites — edit templates to evolve
// looks, no frontend change needed.
export const FALLBACK_SILHOUETTE = { hat: 'hood', tool: 'staff', ears: 'round' };

export function silhouetteForRole(role, table) {
  const entry = table?.[role];
  if (!entry || typeof entry !== 'object') return FALLBACK_SILHOUETTE;
  return {
    hat: entry.hat || FALLBACK_SILHOUETTE.hat,
    tool: entry.tool || FALLBACK_SILHOUETTE.tool,
    ears: entry.ears || FALLBACK_SILHOUETTE.ears
  };
}

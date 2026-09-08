export function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return String(text).replace(/[&<>"']/g, (m) => map[m]);
}

// Long-log UI behavior (matches AGENTS.md): collapse entries over 900 chars.
export const LONG_LOG_THRESHOLD = 900;
export const LOG_PREVIEW_LENGTH = 220;

export function splitLongText(value, threshold = LONG_LOG_THRESHOLD) {
  const text = String(value ?? '');
  if (text.length <= threshold) return { collapsed: false, text };
  const preview = `${text.slice(0, LOG_PREVIEW_LENGTH).replace(/\s+/g, ' ').trim()}…`;
  return { collapsed: true, text, preview };
}

export function formatTokens(n) {
  return Number(n || 0).toLocaleString();
}

export function shortRoleName(role = '') {
  return role.split('-').slice(0, 2).join(' ');
}

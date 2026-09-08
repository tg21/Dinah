// Deprecated entry point — kept for backward compatibility.
// The server was refactored into `src/backend/` (see `src/backend/server.js`).
// New code should use `node src/backend/server.js` or `npm start`.
export * from './backend/server.js';
import './backend/server.js';

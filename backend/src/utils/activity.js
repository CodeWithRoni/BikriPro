import { query } from '../config/db.js';

/**
 * Record an entry in the Activity Log. Never throws: logging must not break
 * the business action it describes.
 */
async function logActivity(req, module, action, refId = null, details = null, conn = null) {
  try {
    const run = conn ? conn.query : query;
    await run(
      'INSERT INTO activity_logs (user_id, module, action, ref_id, details, ip_address) VALUES (?,?,?,?,?,?)',
      [
        req?.user?.id || null,
        module,
        action,
        refId,
        details ? (typeof details === 'string' ? details : JSON.stringify(details)) : null,
        req?.ip || null,
      ]
    );
  } catch (e) {
    console.error('[activity] failed to log', e.message);
  }
}

export { logActivity };

/**
 * Client IP for rate limits / guest billing.
 * Uses Express `req.ip` (honors `trust proxy`) — never the leftmost
 * client-supplied X-Forwarded-For hop, which is trivial to spoof.
 */
export function getClientIp(req) {
  const raw = req.ip || req.socket?.remoteAddress || null;
  if (!raw || typeof raw !== 'string') return null;

  // Express may return IPv4-mapped IPv6 (::ffff:1.2.3.4)
  if (raw.startsWith('::ffff:')) {
    return raw.slice(7);
  }

  return raw;
}

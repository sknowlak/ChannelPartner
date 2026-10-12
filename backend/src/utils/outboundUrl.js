const dns = require('dns').promises;
const net = require('net');

// SSRF guard for every URL the server calls on a partner's behalf
// (integration webhooks, notification-rule webhooks). Without it, anyone
// with MANAGE_SETTINGS could point a webhook at http://169.254.169.254/
// (cloud metadata), localhost:27017 or an internal admin panel, trigger a
// send, and read the response back out of the delivery log.
//
// Checked twice: when the URL is saved (fast feedback in the form) and
// again right before each send (the hostname's DNS may have changed since).
// Callers must also send with `redirect: 'manual'` so a public URL can't
// 30x-bounce the request to an internal one.
//
// For local development against a webhook receiver on your own machine,
// set ALLOW_PRIVATE_WEBHOOK_TARGETS=true in backend/.env.

const blocked = new net.BlockList();
[
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.168.0.0', 16],
  ['198.18.0.0', 15], ['224.0.0.0', 4], ['240.0.0.0', 4]
].forEach(([addr, prefix]) => blocked.addSubnet(addr, prefix, 'ipv4'));
[
  ['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8]
].forEach(([addr, prefix]) => blocked.addSubnet(addr, prefix, 'ipv6'));

function isBlockedAddress(ip) {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped) return blocked.check(mapped[1], 'ipv4');
  const family = net.isIP(ip);
  if (family === 4) return blocked.check(ip, 'ipv4');
  if (family === 6) return blocked.check(ip, 'ipv6');
  return true;
}

// Never honoured in production (section 52), whatever the env says.
function privateTargetsAllowed() {
  return process.env.ALLOW_PRIVATE_WEBHOOK_TARGETS === 'true' && process.env.NODE_ENV !== 'production';
}

// Syntax-only check (scheme, no credentials) - safe to run without network.
function urlShapeProblem(rawUrl) {
  let url;
  try {
    url = new URL(String(rawUrl));
  } catch {
    return 'Enter a full URL starting with http:// or https://';
  }
  if (!['http:', 'https:'].includes(url.protocol)) return 'Only http:// and https:// URLs are allowed';
  if (url.username || url.password) return 'Put credentials in a header, not in the URL';
  return null;
}

// Full check: shape, then every address the hostname resolves to must be
// public. Returns null when the URL is safe to call, otherwise a reason.
async function outboundUrlProblem(rawUrl) {
  const shape = urlShapeProblem(rawUrl);
  if (shape) return shape;
  if (privateTargetsAllowed()) return null;

  const host = new URL(String(rawUrl)).hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) {
    return 'Webhook URLs must point to a public internet address';
  }

  let addresses;
  if (net.isIP(host)) {
    addresses = [host];
  } else {
    try {
      addresses = (await dns.lookup(host, { all: true })).map((a) => a.address);
    } catch {
      return `Could not resolve host "${host}"`;
    }
  }
  if (!addresses.length || addresses.some(isBlockedAddress)) {
    return 'Webhook URLs must point to a public internet address';
  }
  return null;
}

module.exports = { outboundUrlProblem, urlShapeProblem, isBlockedAddress };

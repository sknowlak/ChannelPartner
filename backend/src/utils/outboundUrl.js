const dnsCallback = require('dns');
const net = require('net');
const { Agent } = require('undici');

const dns = dnsCallback.promises;

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
// The pre-send check alone is not enough: fetch() resolves the hostname
// AGAIN when it connects, so a DNS-rebinding host (public IP for our check,
// 127.0.0.1 a moment later) would slip through. Every outbound call is
// therefore sent through `safeDispatcher` below, whose connect-time DNS
// lookup refuses blocked addresses - the address that is actually
// connected to is the one that was checked.
//
// For local development against a webhook receiver on your own machine,
// set ALLOW_PRIVATE_WEBHOOK_TARGETS=true in backend/.env.

const blocked = new net.BlockList();
[
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.168.0.0', 16],
  ['198.18.0.0', 15], ['224.0.0.0', 4], ['240.0.0.0', 4]
].forEach(([addr, prefix]) => blocked.addSubnet(addr, prefix, 'ipv4'));
// ::/96 (IPv4-compatible, covers :: and ::1), NAT64 (64:ff9b::/96 and the
// local-use 64:ff9b:1::/48), 6to4 (2002::/16) and the discard prefix
// (100::/64) all carry or reach an embedded IPv4 address - and with it,
// possibly an internal one - so none of them is a valid public target.
[
  ['::', 96], ['::1', 128], ['64:ff9b::', 96], ['64:ff9b:1::', 48], ['100::', 64], ['2002::', 16],
  ['fc00::', 7], ['fe80::', 10], ['ff00::', 8]
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

// dns.lookup with the same rule applied to whatever it returns. Used as
// the socket's `lookup`, so it runs for the connection itself (node:net
// skips lookup for IP literals - those are covered by outboundUrlProblem,
// which every caller runs first).
function guardedLookup(hostname, options, callback) {
  const opts = typeof options === 'object' && options !== null ? options : { family: options };
  dnsCallback.lookup(hostname, { ...opts, all: true }, (err, addresses) => {
    if (err) return callback(err);
    if (!privateTargetsAllowed() && (!addresses.length || addresses.some((a) => isBlockedAddress(a.address)))) {
      const blockedErr = new Error(`Blocked: "${hostname}" resolves to a non-public address`);
      blockedErr.code = 'EBLOCKEDADDRESS';
      return callback(blockedErr);
    }
    if (opts.all) return callback(null, addresses);
    return callback(null, addresses[0].address, addresses[0].family);
  });
}

// Pass as fetch(url, { dispatcher: safeDispatcher }) for every outbound
// call made on a partner's behalf.
const safeDispatcher = new Agent({ connect: { lookup: guardedLookup } });

module.exports = { outboundUrlProblem, urlShapeProblem, isBlockedAddress, guardedLookup, safeDispatcher };

import { trustProxyFrom } from '../src/app.setup';

/**
 * Which hops may set X-Forwarded-For (phase 11, D-100). On the VPS the API sits
 * in Docker: Nginx and the web app reach it from private container addresses,
 * not loopback. req.ip must still be the browser's address, for the login
 * throttling (D-6), and a client must not be able to choose it.
 */

// proxy-addr is what Express uses for "trust proxy"; it ships no types.
type ProxyAddr = {
  (req: object, trust: unknown): string;
  compile(value: string | string[]): unknown;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const proxyaddr = require('proxy-addr') as ProxyAddr;

function clientIp(setting: string, remoteAddress: string, forwardedFor: string): string {
  const trust = proxyaddr.compile(setting.split(',').map((part) => part.trim()));
  return proxyaddr(
    { connection: { remoteAddress }, headers: { 'x-forwarded-for': forwardedFor } },
    trust,
  );
}

describe('trustProxyFrom', () => {
  it('keeps loopback only when TRUST_PROXY is not set (development, tests)', () => {
    expect(trustProxyFrom(undefined)).toBe('loopback');
    expect(trustProxyFrom('  ')).toBe('loopback');
  });

  it('takes the setting given', () => {
    expect(trustProxyFrom('loopback, uniquelocal')).toBe('loopback, uniquelocal');
  });
});

describe('in Docker: browser → Nginx → web container → API container', () => {
  const docker = 'loopback, uniquelocal';

  it('finds the browser behind the two private hops', () => {
    // Nginx appends the browser, the web app forwards it; the API sees the web container.
    expect(clientIp(docker, '172.18.0.4', '41.226.10.20, 172.18.0.1')).toBe('41.226.10.20');
  });

  it('ignores an address the client wrote itself', () => {
    expect(clientIp(docker, '172.18.0.4', '8.8.8.8, 41.226.10.20, 172.18.0.1')).toBe(
      '41.226.10.20',
    );
    expect(clientIp(docker, '172.18.0.4', '10.0.0.9, 41.226.10.20, 172.18.0.1')).toBe(
      '41.226.10.20',
    );
  });

  it('with loopback only, every browser would look like the web container', () => {
    expect(clientIp('loopback', '172.18.0.4', '41.226.10.20, 172.18.0.1')).toBe('172.18.0.4');
  });
});

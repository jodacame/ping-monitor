import net from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TcpCheckExecutor } from '../src/index.js';

const executor = new TcpCheckExecutor();
let server: net.Server;
let openPort: number;

beforeAll(async () => {
  server = net.createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  openPort = (server.address() as net.AddressInfo).port;
});

afterAll(() => {
  server.close();
});

describe('TcpCheckExecutor', () => {
  it('is up when the port accepts a connection', async () => {
    const out = await executor.execute({ target: '127.0.0.1', config: { port: openPort }, timeoutMs: 2000 });
    expect(out.up).toBe(true);
    expect(out.responseMs).not.toBeNull();
  });

  it('is down when the connection is refused', async () => {
    // Grab a guaranteed-free port by opening then immediately closing.
    const tmp = net.createServer();
    await new Promise<void>((resolve) => tmp.listen(0, '127.0.0.1', resolve));
    const closedPort = (tmp.address() as net.AddressInfo).port;
    await new Promise<void>((resolve) => tmp.close(() => resolve()));

    const out = await executor.execute({ target: '127.0.0.1', config: { port: closedPort }, timeoutMs: 2000 });
    expect(out.up).toBe(false);
    expect(out.error?.kind).toBe('connection');
  });

  it('is down (protocol) when the port is invalid', async () => {
    const out = await executor.execute({ target: '127.0.0.1', config: {}, timeoutMs: 2000 });
    expect(out.up).toBe(false);
    expect(out.error?.kind).toBe('protocol');
  });
});

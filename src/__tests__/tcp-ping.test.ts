import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';

const { mockCreateConnection } = vi.hoisted(() => ({
  mockCreateConnection: vi.fn(),
}));

vi.mock('net', () => ({
  createConnection: mockCreateConnection,
}));

import { tcpPing } from '../tcp-ping.js';

function createMockSocket() {
  const socket = new EventEmitter() as any;
  socket.destroy = vi.fn();
  socket.setTimeout = vi.fn((ms: number) => {
    setTimeout(() => socket.emit('timeout'), ms);
  });
  return socket;
}

describe('tcpPing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('successful connection returns time > 0 and no error', async () => {
    const socket = createMockSocket();
    mockCreateConnection.mockImplementation((_opts: any, cb?: Function) => {
      if (cb) socket.once('connect', cb as any);
      setTimeout(() => socket.emit('connect'), 10);
      return socket;
    });

    const result = await tcpPing('example.com', 443, 5000);

    expect(result.time).toBeGreaterThan(0);
    expect(result.error).toBeUndefined();
    expect(socket.destroy).toHaveBeenCalled();
  });

  it('timeout returns error containing timeout', async () => {
    const socket = createMockSocket();
    mockCreateConnection.mockImplementation((_opts: any, _cb?: Function) => {
      return socket;
    });

    const result = await tcpPing('example.com', 443, 10);

    expect(result.error?.toLowerCase()).toContain('timeout');
    expect(socket.destroy).toHaveBeenCalled();
  });

  it('connection refused returns error containing refused', async () => {
    const socket = createMockSocket();
    mockCreateConnection.mockImplementation((_opts: any, _cb?: Function) => {
      setImmediate(() =>
        socket.emit(
          'error',
          Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }),
        ),
      );
      return socket;
    });

    const result = await tcpPing('example.com', 443, 5000);

    expect(result.error?.toLowerCase()).toContain('refused');
    expect(socket.destroy).toHaveBeenCalled();
  });

  it('default port 443 is used when port not specified', async () => {
    const socket = createMockSocket();
    mockCreateConnection.mockImplementation((_opts: any, cb?: Function) => {
      if (cb) socket.once('connect', cb as any);
      setTimeout(() => socket.emit('connect'), 10);
      return socket;
    });

    await tcpPing('example.com');

    expect(mockCreateConnection).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'example.com', port: 443 }),
      expect.any(Function),
    );
  });
});

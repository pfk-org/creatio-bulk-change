import { MessageChannelService } from '@creatio-devkit/common';

import { LIVE_EDITING_SENDER, watchLiveUpdates } from './live-update-watcher';

type Listener = (event: { body: unknown }) => void;

describe('watchLiveUpdates', () => {
  const options = { quietMs: 200, minWaitMs: 100, maxWaitMs: 2000 };
  let listener: Listener | undefined;
  let unsubscribe: jest.Mock;

  function send(body: unknown): void {
    listener?.({ body });
  }

  function mockSubscribe(implementation: (sender: string, callback: Listener) => Promise<unknown>): void {
    Object.defineProperty(MessageChannelService.prototype, 'subscribe', {
      configurable: true,
      get: () => jest.fn(implementation),
    });
  }

  beforeEach(() => {
    listener = undefined;
    unsubscribe = jest.fn();
    mockSubscribe(async (sender, callback) => {
      expect(sender).toBe(LIVE_EDITING_SENDER);
      listener = callback;
      return { unsubscribe };
    });
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('waits until the notifications of the entity stop', async () => {
    const watcher = await watchLiveUpdates('Account');
    const startedAt = Date.now();
    const timer = setInterval(() => send({ EntitySchemaName: 'Account' }), 50);
    setTimeout(() => clearInterval(timer), 400);
    await watcher.waitUntilQuiet(options);
    // Notifications came for 400 ms, then the list must stay quiet for 200 ms more.
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(550);
    watcher.dispose();
    expect(unsubscribe).toHaveBeenCalled();
  });

  it('ignores notifications of other entities and reads string bodies', async () => {
    const watcher = await watchLiveUpdates('Account');
    const timer = setInterval(() => send(JSON.stringify({ EntitySchemaName: 'Contact' })), 50);
    const startedAt = Date.now();
    await watcher.waitUntilQuiet(options);
    clearInterval(timer);
    expect(Date.now() - startedAt).toBeLessThan(450);
  });

  it('stops waiting at the upper limit', async () => {
    const watcher = await watchLiveUpdates('Account');
    const timer = setInterval(() => send({ EntitySchemaName: 'Account' }), 20);
    const startedAt = Date.now();
    await watcher.waitUntilQuiet({ quietMs: 200, minWaitMs: 50, maxWaitMs: 300 });
    clearInterval(timer);
    expect(Date.now() - startedAt).toBeLessThan(600);
  });

  it('falls back to the shortest wait when notifications cannot be watched', async () => {
    mockSubscribe(() => Promise.reject(new Error('no channel')));
    const watcher = await watchLiveUpdates('Account');
    const startedAt = Date.now();
    await watcher.waitUntilQuiet(options);
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(190);
    expect(() => watcher.dispose()).not.toThrow();
  });
});

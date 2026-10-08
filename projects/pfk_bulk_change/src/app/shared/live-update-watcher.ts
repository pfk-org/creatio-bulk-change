import { MessageChannelService } from '@creatio-devkit/common';

/** Sender of the live data update notifications: one message per saved record. */
export const LIVE_EDITING_SENDER = 'LiveEditingNotifier';

export interface LiveUpdateWaitOptions {
  /** The notifications are considered finished after this long without a new one. */
  quietMs: number;
  /** Shortest wait after the last saved batch, also used when live data update is off. */
  minWaitMs: number;
  /** Longest wait: the list is reloaded even if notifications still arrive. */
  maxWaitMs: number;
}

export const DEFAULT_LIVE_UPDATE_WAIT: LiveUpdateWaitOptions = {
  quietMs: 2000,
  minWaitMs: 2000,
  maxWaitMs: 60000,
};

const POLL_MS = 100;

export interface LiveUpdateWatcher {
  /** Resolves when the live update notifications for the entity have stopped (see {@link LiveUpdateWaitOptions}). */
  waitUntilQuiet(options?: LiveUpdateWaitOptions): Promise<void>;
  dispose(): void;
}

interface LiveEditingMessage {
  EntitySchemaName?: string;
}

/**
 * Watches the live data update notifications of an entity during a bulk change.
 *
 * When live data update is on, the platform re-reads every changed row that the list shows, one
 * notification per saved record. They keep arriving after the last batch is saved, longer for large
 * volumes, so a list reload must wait until they stop; otherwise the re-reads run on top of the
 * reloaded list. Start the watcher before the first batch so the wait covers the whole run.
 */
export async function watchLiveUpdates(entitySchemaName: string): Promise<LiveUpdateWatcher> {
  let lastMessageAt = 0;
  let unsubscribe: () => void = () => undefined;
  try {
    const subscription = await new MessageChannelService().subscribe<unknown>(LIVE_EDITING_SENDER, (event) => {
      if (getEntitySchemaName(event.body) === entitySchemaName) {
        lastMessageAt = Date.now();
      }
    });
    unsubscribe = () => subscription.unsubscribe();
  } catch (error) {
    console.warn('[PfkBulkChange] Live data update notifications cannot be watched; a fixed pause is used', error);
  }
  return {
    waitUntilQuiet: (options = DEFAULT_LIVE_UPDATE_WAIT) =>
      new Promise<void>((resolve) => {
        const startedAt = Date.now();
        const check = (): void => {
          const now = Date.now();
          const isQuiet = now - Math.max(lastMessageAt, startedAt) >= options.quietMs;
          const waited = now - startedAt;
          if ((waited >= options.minWaitMs && isQuiet) || waited >= options.maxWaitMs) {
            resolve();
            return;
          }
          setTimeout(check, POLL_MS);
        };
        check();
      }),
    dispose: () => unsubscribe(),
  };
}

function getEntitySchemaName(body: unknown): string | undefined {
  let message = body;
  if (typeof message === 'string') {
    try {
      message = JSON.parse(message);
    } catch {
      return undefined;
    }
  }
  return (message as LiveEditingMessage | null)?.EntitySchemaName;
}

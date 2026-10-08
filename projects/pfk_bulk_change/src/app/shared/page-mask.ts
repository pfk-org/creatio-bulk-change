import { MaskService } from '@creatio-devkit/common';

/**
 * Runs `work` under the platform page mask, the same mask the page shows while it loads.
 * The mask is removed when the work ends or fails. A mask that cannot be shown never stops the work.
 */
export async function withPageMask<T>(work: () => Promise<T>): Promise<T> {
  const maskService = new MaskService();
  try {
    await maskService.showBodyMask();
  } catch (error) {
    console.warn('[PfkBulkChange] Could not show the page mask', error);
  }
  try {
    return await work();
  } finally {
    try {
      await maskService.hideBodyMask();
    } catch (error) {
      console.warn('[PfkBulkChange] Could not hide the page mask', error);
    }
  }
}

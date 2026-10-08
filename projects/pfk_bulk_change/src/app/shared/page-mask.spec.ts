import { MaskService } from '@creatio-devkit/common';

import { withPageMask } from './page-mask';

describe('withPageMask', () => {
  let show: jest.SpyInstance;
  let hide: jest.SpyInstance;

  beforeEach(() => {
    show = jest.fn().mockResolvedValue(undefined) as unknown as jest.SpyInstance;
    hide = jest.fn().mockResolvedValue(undefined) as unknown as jest.SpyInstance;
    Object.defineProperty(MaskService.prototype, 'showBodyMask', { configurable: true, get: () => show });
    Object.defineProperty(MaskService.prototype, 'hideBodyMask', { configurable: true, get: () => hide });
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('shows the mask for the time of the work and returns its result', async () => {
    const work = jest.fn(async () => {
      expect(show).toHaveBeenCalled();
      expect(hide).not.toHaveBeenCalled();
      return 42;
    });
    await expect(withPageMask(work)).resolves.toBe(42);
    expect(hide).toHaveBeenCalled();
  });

  it('removes the mask when the work fails', async () => {
    await expect(withPageMask(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    expect(hide).toHaveBeenCalled();
  });

  it('still does the work when the mask cannot be shown', async () => {
    show.mockRejectedValue(new Error('no handler'));
    await expect(withPageMask(async () => 'done')).resolves.toBe('done');
  });
});

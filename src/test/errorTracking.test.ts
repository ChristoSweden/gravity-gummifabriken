import { describe, it, expect, vi } from 'vitest';
import { captureError, captureMessage } from '../utils/errorTracking';

describe('Error Tracking', () => {
  it('captureError does not throw', () => {
    expect(() => captureError(new Error('test'))).not.toThrow();
    expect(() => captureError('string error')).not.toThrow();
    expect(() => captureError(null)).not.toThrow();
    expect(() => captureError(undefined)).not.toThrow();
  });

  it('captureError logs in dev mode', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    captureError(new Error('test'), { context: 'unit-test' });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('captureMessage does not throw', () => {
    expect(() => captureMessage('test message')).not.toThrow();
    expect(() => captureMessage('msg', { foo: 'bar' })).not.toThrow();
  });

  it('captureMessage logs in dev mode', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    captureMessage('test message', { context: 'unit-test' });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

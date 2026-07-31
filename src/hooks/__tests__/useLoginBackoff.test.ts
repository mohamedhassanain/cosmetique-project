import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLoginBackoff } from '../useLoginBackoff';

describe('useLoginBackoff', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('détecte un vrai rate limit 429 et bloque avant 5 échecs', () => {
    const { result } = renderHook(() => useLoginBackoff());

    act(() => {
      result.current.registerFailure({ status: 429, message: 'Request rate limit reached, please retry after 30 seconds' });
    });

    expect(result.current.isBlocked).toBe(true);
    expect(result.current.beforeAttempt()).toBe(false);
    // ~30 secondes restantes (le hook met à jour `now` toutes les secondes)
    expect(result.current.cooldownRemaining).toBeGreaterThan(20);
  });

  it('bloque après 5 échecs consécutifs', () => {
    const { result } = renderHook(() => useLoginBackoff());

    for (let i = 0; i < 5; i++) {
      act(() => {
        result.current.registerFailure({ message: 'Invalid login credentials' });
      });
    }

    expect(result.current.isBlocked).toBe(true);
  });

  it('débloque après la fin du cooldown (60s fallback)', () => {
    const { result } = renderHook(() => useLoginBackoff());

    for (let i = 0; i < 5; i++) {
      act(() => {
        result.current.registerFailure({ message: 'Invalid login credentials' });
      });
    }

    expect(result.current.isBlocked).toBe(true);

    act(() => {
      vi.advanceTimersByTime(61_000);
    });

    // après 61s, le cooldown (60s) est dépassé
    expect(result.current.beforeAttempt()).toBe(true);
  });

  it('reset après un succès', () => {
    const { result } = renderHook(() => useLoginBackoff());

    for (let i = 0; i < 5; i++) {
      act(() => {
        result.current.registerFailure({ message: 'Invalid login credentials' });
      });
    }

    act(() => {
      result.current.registerSuccess();
    });

    expect(result.current.isBlocked).toBe(false);
    expect(result.current.cooldownRemaining).toBe(0);
    expect(result.current.beforeAttempt()).toBe(true);
  });
});

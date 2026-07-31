import { useCallback, useEffect, useRef, useState } from 'react';

const ATTEMPT_LIMIT = 5;
const BASE_DELAY_SECONDS = 60;

function parseRateLimitRetryAfter(error: unknown): number | null {
  if (typeof error !== 'object' || error === null) return null;
  const err = error as { status?: number; message?: string };
  const status = err.status;
  const message = err.message?.toLowerCase() ?? '';
  if (status === 429 || message.includes('rate limit') || message.includes('too many')) {
    // Formats réels observés côté GoTrue (Supabase Auth) :
    // - "Request rate limit reached, please retry after 30 seconds"
    // - "Too many requests, please try again in 60 seconds"
    const match = message.match(/(?:retry after|in) (\d+)/i);
    return match ? Number(match[1]) : BASE_DELAY_SECONDS;
  }
  return null;
}

export function useLoginBackoff() {
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const failuresRef = useRef(0);

  const reset = useCallback(() => {
    failuresRef.current = 0;
    setCooldownUntil(null);
  }, []);

  const beforeAttempt = useCallback((): boolean => {
    if (cooldownUntil !== null && Date.now() < cooldownUntil) return false;
    return true;
  }, [cooldownUntil]);

  const registerFailure = useCallback((error: unknown) => {
    const retryAfterSeconds = parseRateLimitRetryAfter(error);
    if (retryAfterSeconds !== null) {
      setCooldownUntil(Date.now() + retryAfterSeconds * 1000);
      return;
    }
    failuresRef.current += 1;
    if (failuresRef.current >= ATTEMPT_LIMIT) {
      setCooldownUntil(Date.now() + BASE_DELAY_SECONDS * 1000);
    }
  }, []);

  const registerSuccess = useCallback(() => {
    reset();
  }, [reset]);

  // Tick une fois par seconde pendant le cooldown pour mettre à jour l'affichage
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (cooldownUntil === null) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [cooldownUntil]);

  const cooldownRemaining = cooldownUntil === null
    ? 0
    : Math.max(0, Math.ceil((cooldownUntil - now) / 1000));
  const isBlocked = cooldownRemaining > 0;

  return { isBlocked, cooldownRemaining, beforeAttempt, registerFailure, registerSuccess, reset };
}

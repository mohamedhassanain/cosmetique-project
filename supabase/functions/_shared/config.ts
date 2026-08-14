// =====================================================================
// Configuration du rate limiting — valeurs par défaut adaptées à un petit
// site e-commerce, surchargeables par variables d'environnement
// (Secret Dashboard → Edge Functions → config).
// =====================================================================
import { getPositiveIntEnv, getEnv } from './env.ts';

export interface RateLimitRule {
  /** Durée de la fenêtre en secondes (10 min, 1 h). */
  windowSeconds: number;
  /** Nombre maximal de soumissions autorisées par fenêtre. */
  maxCount: number;
}

/** bornes de sécurité applicatives communes (indépendantes du rate limit) */
export const LIMITS = {
  MAX_ORDER_QUANTITY: 99,
  MAX_ORDER_TOTAL: 1_000_000,
  MAX_ORDER_NOTE_LENGTH: 2_000,
  MAX_ORDER_PRODUCT_NAME: 200,
  MAX_ORDER_CUSTOMER_NAME: 120,
  MAX_ORDER_PHONE: 30,
  MAX_ORDER_CITY: 80,
  MAX_CONTACT_NAME: 120,
  MAX_CONTACT_EMAIL: 254,
  MAX_CONTACT_PHONE: 30,
  MAX_CONTACT_SUBJECT: 200,
  MAX_CONTACT_MESSAGE: 3_000,
  /** Intervalle minimum entre deux soumissions du même IP (anti-spam). */
  MIN_SUBMISSION_INTERVAL_MS: 5_000,
  /** Nombre maximal de produits par commande panier. */
  MAX_ORDER_ITEMS: 20,
} as const;

export interface RateLimitConfig {
  orders: {
    rules: RateLimitRule[];
  };
  contact: {
    rules: RateLimitRule[];
  };
  /** Intervalle minimal entre deux soumissions du même IP (anti-spam rapide). */
  minSubmissionIntervalMs: number;
  /** Clé HMAC pour hacher les IP avant stockage. */
  hashSecret: string;
}

export function getRateLimitConfig(): RateLimitConfig {
  return {
    orders: {
      rules: [
        {
          windowSeconds: 10 * 60,
          maxCount: getPositiveIntEnv('ORDERS_LIMIT_10M', 3),
        },
        {
          windowSeconds: 60 * 60,
          maxCount: getPositiveIntEnv('ORDERS_LIMIT_1H', 10),
        },
      ],
    },
    contact: {
      rules: [
        {
          windowSeconds: 10 * 60,
          maxCount: getPositiveIntEnv('CONTACT_LIMIT_10M', 3),
        },
        {
          windowSeconds: 60 * 60,
          maxCount: getPositiveIntEnv('CONTACT_LIMIT_1H', 10),
        },
      ],
    },
    minSubmissionIntervalMs: getPositiveIntEnv('RATE_LIMIT_MIN_INTERVAL_MS', LIMITS.MIN_SUBMISSION_INTERVAL_MS),
    hashSecret: getEnv('RATE_LIMIT_HASH_SECRET') ?? '',
  };
}

// =====================================================================
// Validation des payloads publics — pure, sans dépendance runtime,
// testable unitairement avec Vitest.
// Rejette tout payload malformé (400) avant toute insertion.
// =====================================================================
import { LIMITS } from './config.ts';

export interface ValidationResult {
  ok: boolean;
  /** Message stable et générique côté client (pas d'implémentation interne). */
  error: string;
}

function ok(): ValidationResult {
  return { ok: true, error: '' };
}

function fail(error: string): ValidationResult {
  return { ok: false, error };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStr(value: unknown): value is string {
  return typeof value === 'string';
}

function requiredString(
  body: Record<string, unknown>,
  key: string,
  label: string,
  maxLength: number,
  minLength = 1
): ValidationResult {
  const value = body[key];
  if (!isStr(value)) return fail(`${label} est requis.`);
  const trimmed = value.trim();
  if (trimmed.length < minLength) return fail(`${label} est requis.`);
  if (trimmed.length > maxLength) return fail(`${label} est trop long.`);
  return ok();
}

function optionalString(
  body: Record<string, unknown>,
  key: string,
  label: string,
  maxLength: number
): ValidationResult {
  const value = body[key];
  if (value === undefined || value === null || value === '') return ok();
  if (!isStr(value)) return fail(`${label} est invalide.`);
  if (value.length > maxLength) return fail(`${label} est trop long.`);
  return ok();
}

/** Numéro de téléphone international basique (+ ou chiffres, 6-20). */
function validPhone(value: string): boolean {
  return /^\+?[0-9]{6,20}$/.test(value);
}

// ────────────────────────────────────────────────────────────
// ORDERS
// ────────────────────────────────────────────────────────────
export interface OrderPayload {
  product_id?: string | null;
  product_name: string;
  quantity: number;
  total_price: number;
  customer_name: string;
  customer_phone: string;
  customer_city?: string | null;
  status?: string;
  notes?: string | null;
  /** anti-honeypot : tout visiteur humain laisse ce champ vide. */
  website?: string;
  /** anti-fraude prix : ignoré côté serveur, présent pour compatibilité. */
  items?: unknown;
}

// ────────────────────────────────────────────────────────────
// CONTACT MESSAGES
// ────────────────────────────────────────────────────────────
export interface ContactPayload {
  name: string;
  email: string;
  phone?: string | null;
  subject?: string | null;
  message: string;
  /** anti-honeypot : tout visiteur humain laisse ce champ vide. */
  website?: string;
}

export function validateContactPayload(body: unknown): ValidationResult {
  if (!isRecord(body)) return fail('Payload invalide.');

  const rName = requiredString(body, 'name', 'Le nom', LIMITS.MAX_CONTACT_NAME);
  if (!rName.ok) return rName;

  const rEmail = requiredString(body, 'email', 'L\'email', LIMITS.MAX_CONTACT_EMAIL);
  if (!rEmail.ok) return rEmail;
  if (
    !isStr(body.email) ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(body.email.trim().toLowerCase())
  ) {
    return fail('Email invalide.');
  }

  const rPhone = optionalString(body, 'phone', 'Le téléphone', LIMITS.MAX_CONTACT_PHONE);
  if (!rPhone.ok) return rPhone;
  if (isStr(body.phone) && body.phone.trim().length > 0 && !validPhone(body.phone.trim())) {
    return fail('Numéro de téléphone invalide.');
  }

  const rSubject = optionalString(body, 'subject', 'Le sujet', LIMITS.MAX_CONTACT_SUBJECT);
  if (!rSubject.ok) return rSubject;

  const rMessage = requiredString(body, 'message', 'Le message', LIMITS.MAX_CONTACT_MESSAGE, 10);
  if (!rMessage.ok) return rMessage;

  // Honeypot : une valeur remplie = bot.
  if (isStr(body.website) && body.website.trim().length > 0) {
    return fail('Soumission rejetée.');
  }

  return ok();
}

export function validateOrderPayload(body: unknown): ValidationResult {
  if (!isRecord(body)) return fail('Payload invalide.');

  const r1 = requiredString(body, 'product_name', 'Le nom du produit', LIMITS.MAX_ORDER_PRODUCT_NAME);
  if (!r1.ok) return r1;

  const rName = requiredString(body, 'customer_name', 'Le nom du client', LIMITS.MAX_ORDER_CUSTOMER_NAME);
  if (!rName.ok) return rName;

  // Téléphone OPTIONNEL : le flux panier (commande de tracking WhatsApp)
  // n'en collecte pas. Validé uniquement s'il est fourni.
  const rPhone = optionalString(body, 'customer_phone', 'Le téléphone', LIMITS.MAX_ORDER_PHONE);
  if (!rPhone.ok) return rPhone;
  if (isStr(body.customer_phone) && body.customer_phone.trim().length > 0 && !validPhone(body.customer_phone.trim())) {
    return fail('Numéro de téléphone invalide.');
  }

  const rCity = optionalString(body, 'customer_city', 'La ville', LIMITS.MAX_ORDER_CITY);
  if (!rCity.ok) return rCity;

  const rNotes = optionalString(body, 'notes', 'Les notes', LIMITS.MAX_ORDER_NOTE_LENGTH);
  if (!rNotes.ok) return rNotes;

  // Quantité : entier borné [1, MAX_ORDER_QUANTITY].
  if (!Number.isInteger(body.quantity) || (body.quantity as number) < 1) {
    return fail('Quantité invalide.');
  }
  if ((body.quantity as number) > LIMITS.MAX_ORDER_QUANTITY) {
    return fail('Quantité trop élevée.');
  }

  // total_price : nombre fini borné [0, MAX_ORDER_TOTAL].
  const total = body.total_price;
  if (
    typeof total !== 'number' ||
    !Number.isFinite(total) ||
    total < 0 ||
    total > LIMITS.MAX_ORDER_TOTAL
  ) {
    return fail('Montant invalide.');
  }

  // status fourni par le client → forcer 'pending' (jamais 'completed'/'cancelled').
  if (body.status !== undefined && body.status !== 'pending') {
    return fail('Statut invalide.');
  }

  // Honeypot : une valeur remplie = bot.
  if (isStr(body.website) && body.website.trim().length > 0) {
    return fail('Soumission rejetée.');
  }

  return ok();
}

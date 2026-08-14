/**
 * Couche d'accès aux messages de contact (Supabase).
 *
 * La création publique passe UNIQUEMENT par l'Edge Function `create-contact`
 * (validation serveur + rate limiting par IP). Il n'existe AUCUNE policy
 * d'INSERT anon sur `contact_messages` — un appel PostgREST direct échouerait.
 */
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export interface PublicContactInput {
  name: string;
  email: string;
  phone?: string | null;
  subject?: string | null;
  message: string;
  /** Champ honeypot anti-bot : le navigateur l'envoie vide. */
  website?: string;
}

export class ContactSubmissionError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = 'ContactSubmissionError';
  }
}

/**
 * Envoie un message de contact via l'Edge Function sécurisée.
 * - 400 : validation serveur échouée
 * - 429 : trop de requêtes (rate limit atteint)
 * - 503 : service indisponible
 */
export async function submitContactMessage(
  input: PublicContactInput
): Promise<{ ok: boolean }> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/create-contact`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      Accept: 'application/json',
    },
    body: JSON.stringify(input),
  });

  if (res.status === 201 || res.status === 200) {
    return (await res.json().catch(() => ({ ok: true }))) as { ok: boolean };
  }

  let message = 'Une erreur est survenue. Veuillez réessayer.';
  try {
    const data = (await res.json()) as { error?: string };
    if (typeof data.error === 'string' && data.error.trim()) {
      message = data.error;
    }
  } catch {
    // réponse non-JSON : message par défaut
  }

  throw new ContactSubmissionError(message, res.status);
}

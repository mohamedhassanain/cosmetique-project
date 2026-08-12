// Vérifie la présence de l'URL Supabase et de la clé anon dans .env
// (affiche uniquement des empreintes partielles — jamais les secrets).
import { readFileSync } from 'node:fs';

const env = readFileSync('.env', 'utf8');
const get = (k) => {
  const m = env.match(new RegExp(`^${k}=["']?(.*?)["']?$`, 'm'));
  return m ? m[1] : '';
};

const url = get('VITE_SUPABASE_URL');
const key =
  get('VITE_SUPABASE_PUBLISHABLE_KEY') ||
  get('SUPABASE_ANON_KEY') ||
  get('VITE_SUPABASE_ANON_KEY');

console.log('URL=' + url);
console.log('URL_IS_REAL=', /^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url));
console.log('KEY_LEN=', key.length);
console.log('KEY_PREFIX=', key.slice(0, 10));
console.log('HAS_PLACEHOLDER=', /YOUR_|PLACEHOLDER|x{4,}/i.test(key));

// Run locally; copy the private key only to Supabase Edge Function secrets.
import { createECDH, randomBytes } from 'node:crypto';
const key = createECDH('prime256v1');
key.generateKeys();
console.log('VITE_WEB_PUSH_PUBLIC_KEY=' + key.getPublicKey().toString('base64url'));
console.log('WEB_PUSH_PUBLIC_KEY=' + key.getPublicKey().toString('base64url'));
console.log('WEB_PUSH_PRIVATE_KEY=' + key.getPrivateKey().toString('base64url'));
console.log('DAILY_REMINDER_SECRET=' + randomBytes(32).toString('base64url'));

/**
 * Rellena el libro de billing con lo que ya existe en Stripe. La lógica vive en
 * `lib/billing/libro/relleno.ts` (la misma que usa `/api/cron/billing-relleno`); léela ahí para
 * saber qué hace y qué NO hace. SOLO LEE de Stripe; por defecto es un ensayo.
 *
 * USO (con la clave de Stripe del entorno que se quiera leer y la service-role de Supabase):
 *   STRIPE_SECRET_KEY=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/billing-relleno-libro.ts
 *   STRIPE_SECRET_KEY=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/billing-relleno-libro.ts --ejecutar
 */
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { rellenarLibro } from '../lib/billing/libro/relleno.ts';

const faltan = ['STRIPE_SECRET_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'].filter((v) => !process.env[v]);
if (faltan.length) {
  console.error(`Faltan variables de entorno: ${faltan.join(', ')}`);
  process.exit(1);
}
const ejecutar = process.argv.includes('--ejecutar');
console.log(ejecutar ? 'EJECUTANDO: se escribirá en el libro.' : 'ENSAYO: no se escribe nada (añade --ejecutar para aplicarlo).');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, { apiVersion: '2026-06-24.dahlia' });
const db = createClient(process.env.SUPABASE_URL as string, process.env.SUPABASE_SERVICE_ROLE_KEY as string, { auth: { persistSession: false } });
const r = await rellenarLibro(db, stripe, { ejecutar });
console.log(JSON.stringify(r, null, 2));
if (r.errores.length > 0) process.exit(1);

'use server';

import { requireAuthInServerAction } from '@/lib/auth-server-action';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';

/**
 * equipoTarjetas
 *
 * Migrated from: app/api/equipo/tarjetas/route.ts
 * Domain: equipo
 *
 * TODO: Extract and implement logic from the original API route
 */
<<<<<<< HEAD
export async function equipoTarjetas(input: Record<string, unknown>) {
  const sesion = await requireAuthInServerAction();
=======
export async function equipoTarjetas(_input: Record<string, unknown>) {
  const _sesion = await requireAuthInServerAction();
>>>>>>> origin/main
  const admin = getSupabaseAdmin();

  if (!admin) {
    throw new Error('Servidor no configurado');
  }

  // TODO: Extract handler logic from tarjetas route
  throw new Error('Not yet implemented - extract from app/api/equipo/tarjetas/route.ts');
}

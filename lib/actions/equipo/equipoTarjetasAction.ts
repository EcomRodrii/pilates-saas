'use server';

import { requireAuthInServerAction } from '@/lib/auth-server-action';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { puedeGestionarEquipo } from '@/lib/permisos-reglas';

/**
 * equipoTarjetasAction
 * Migrated from: app/api/equipo/tarjetas/route.ts
 * 
 * TODO: Extract GET (lista tarjetas guardadas de instructoras)
 * Complexity: 282 LOC — requiere integración con Stripe + manejo de PaymentMethods
 */

export async function equipoTarjetasAction(input: { method?: string; [key: string]: unknown }) {
  const sesion = await requireAuthInServerAction();
  
  if (!puedeGestionarEquipo(sesion.rol)) {
    throw new Error('No tienes permiso para ver tarjetas');
  }

  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Servidor no configurado');

  const method = (input.method || 'GET').toUpperCase();

  if (method === 'GET') {
    // TODO: Fetch instructor payment methods from Stripe
    return { items: [] };
  }

  throw new Error(`Método ${method} no soportado`);
}

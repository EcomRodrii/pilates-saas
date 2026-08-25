'use server';
import { requireAuthInServerAction } from '@/lib/auth-server-action';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
export async function decisionesAction(input: { method?: string }) {
  const sesion = await requireAuthInServerAction();
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Servidor no configurado');
  if (input.method === 'GET') return { decisiones: [] };
  throw new Error(`Método ${input.method} no soportado`);
}

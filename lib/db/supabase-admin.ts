import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Cliente con la Service Role Key — SOLO para rutas de servidor (nunca
// importar desde código que se ejecuta en el navegador). Salta las políticas
// RLS a propósito: los backups necesitan leer/escribir todas las tablas de
// un negocio sin depender de qué sesión (o ninguna, en el caso del cron)
// esté haciendo la llamada.
let admin: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  if (!admin) {
    admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  }
  return admin;
}

// Igual que getSupabaseAdmin pero lanza si no está configurado. Úsalo en el
// código de servidor cuyas escrituras DEBEN persistir (p.ej. el Decision OS):
// con el cliente anon, RLS bloquea el INSERT y —si el error se traga— el paso
// "completa" sin escribir nada. Mejor fallar ruidosamente que en silencio.
export function requireSupabaseAdmin(): SupabaseClient {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('SUPABASE_SERVICE_ROLE_KEY no configurada (requerida para escrituras de servidor)');
  return admin;
}

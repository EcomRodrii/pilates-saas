import 'server-only';
import type { NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { puedeGestionarClavesApi } from '@/lib/permisos-reglas';
import type { Plan } from '@/lib/billing/entitlements';
import type { ScopeOAuth } from './catalogo-scopes';
import { scopesDelPlan, scopesQuePuedeConceder } from './scopes';
import { estadoClave } from './gestion-reglas';

// Lo que comparten las rutas del panel que gestionan la API del estudio
// (/api/integrations/api-publica/*): quién puede, si la API está activada y
// qué permisos se pueden dar. La cerradura es esto, no la pantalla.

export type Gestor =
  | { ok: true; admin: SupabaseClient; studioId: string; userId: string; activada: boolean; permitidos: ScopeOAuth[] }
  | { ok: false; status: number; error: string };

export async function exigirGestorApi(req: NextRequest): Promise<Gestor> {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return { ok: false, status: 401, error: 'No autenticado' };
  if (!puedeGestionarClavesApi(sesion.rol)) return { ok: false, status: 403, error: 'Solo la propietaria gestiona la API del estudio.' };
  const admin = getSupabaseAdmin();
  if (!admin) return { ok: false, status: 503, error: 'Servidor no configurado' };

  const [{ data: acceso }, { data: studio }] = await Promise.all([
    admin.from('api_acceso_estudios').select('desactivada_en').eq('studio_id', sesion.studioId).maybeSingle(),
    admin.from('studios').select('plan').eq('id', sesion.studioId).maybeSingle(),
  ]);
  const plan: Plan = studio?.plan === 'ESTUDIO' || studio?.plan === 'CADENA' ? studio.plan : 'BASE';
  const delPlan = new Set<string>(scopesDelPlan(plan));
  return {
    ok: true, admin, studioId: sesion.studioId, userId: sesion.userId,
    activada: !!acceso && !acceso.desactivada_en,
    permitidos: scopesQuePuedeConceder(sesion.rol).filter((s) => delPlan.has(s)),
  };
}

const COLUMNAS_CLAVE = 'id, nombre, prefijo, scopes, creada_en, expira_en, ultimo_uso_en, revocada_en, rotada_desde';

/** Lo que ve el panel de una clave. Nunca el hash. */
export function clavePanel(f: {
  id: string; nombre: string; prefijo: string; scopes: string[]; creada_en: string; expira_en: string | null;
  ultimo_uso_en: string | null; revocada_en: string | null; rotada_desde: string | null;
}) {
  return {
    id: f.id, nombre: f.nombre, prefijo: f.prefijo, scopes: f.scopes, creadaEn: f.creada_en,
    expiraEn: f.expira_en, ultimoUsoEn: f.ultimo_uso_en, revocadaEn: f.revocada_en, rotadaDesde: f.rotada_desde,
    estado: estadoClave(f, new Date()),
  };
}

export async function listarClaves(admin: SupabaseClient, studioId: string) {
  const { data, error } = await admin.from('api_claves').select(COLUMNAS_CLAVE)
    .eq('studio_id', studioId).order('creada_en', { ascending: false }).limit(100);
  if (error) return null;
  return (data ?? []).map(clavePanel);
}

export { COLUMNAS_CLAVE };

import 'server-only';
import type { NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { puedeGestionarClavesApi } from '@/lib/permisos-reglas';
import type { Plan } from '@/lib/billing/entitlements';
import type { ScopeOAuth } from './catalogo-scopes';
import { scopesDelPlan, scopesQuePuedeConceder } from './scopes';
import { estadoClave, filtroClaves } from './gestion-reglas';

// Lo que comparten las rutas del panel que gestionan la API del estudio
// (/api/integrations/api-publica/*): quién puede, si la API está activada y
// qué permisos se pueden dar. La cerradura es esto, no la pantalla.

export type Gestor =
  | {
      ok: true; admin: SupabaseClient; studioId: string; userId: string; activada: boolean; permitidos: ScopeOAuth[];
      /**
       * La cadena de la sede, SOLO si quien gestiona es la dueña de la cadena y
       * de la sede: entonces puede crear y gestionar claves de cadena
       * (lib/api-publica/cadena.ts). `null` en cualquier otro caso.
       */
      cadenaId: string | null;
    }
  | { ok: false; status: number; error: string };

export async function exigirGestorApi(req: NextRequest): Promise<Gestor> {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return { ok: false, status: 401, error: 'No autenticado' };
  if (!puedeGestionarClavesApi(sesion.rol)) return { ok: false, status: 403, error: 'Solo la propietaria gestiona la API del estudio.' };
  const admin = getSupabaseAdmin();
  if (!admin) return { ok: false, status: 503, error: 'Servidor no configurado' };

  const [{ data: acceso }, { data: studio }] = await Promise.all([
    admin.from('api_acceso_estudios').select('desactivada_en').eq('studio_id', sesion.studioId).maybeSingle(),
    admin.from('studios').select('plan, cadena_id, owner_auth_user_id').eq('id', sesion.studioId).maybeSingle(),
  ]);
  const plan: Plan = studio?.plan === 'ESTUDIO' || studio?.plan === 'CADENA' ? studio.plan : 'BASE';
  const delPlan = new Set<string>(scopesDelPlan(plan));

  let cadenaId: string | null = null;
  if (studio?.cadena_id && studio.owner_auth_user_id === sesion.userId) {
    const { data: cadena } = await admin.from('cadenas').select('owner_auth_user_id').eq('id', studio.cadena_id).maybeSingle();
    if (cadena?.owner_auth_user_id === sesion.userId) cadenaId = studio.cadena_id as string;
  }
  return {
    ok: true, admin, studioId: sesion.studioId, userId: sesion.userId,
    activada: !!acceso && !acceso.desactivada_en,
    permitidos: scopesQuePuedeConceder(sesion.rol).filter((s) => delPlan.has(s)),
    cadenaId,
  };
}

export interface SedePanel { id: string; nombre: string; apiActivada: boolean; esEsta: boolean }

/**
 * Las sedes de la cadena de la dueña, para el panel: a cuáles llegaría una clave
 * de cadena y cuáles no tienen todavía la API activada. Solo las suyas (las
 * mismas que admite la puerta de la API).
 */
export async function sedesDeLaCadena(g: Extract<Gestor, { ok: true }>): Promise<SedePanel[]> {
  if (!g.cadenaId) return [];
  const { data: sedes } = await g.admin.from('studios').select('id, nombre')
    .eq('cadena_id', g.cadenaId).eq('owner_auth_user_id', g.userId).order('nombre');
  const ids = (sedes ?? []).map((s) => s.id as string);
  if (ids.length === 0) return [];
  const { data: accesos } = await g.admin.from('api_acceso_estudios').select('studio_id').in('studio_id', ids).is('desactivada_en', null);
  const activas = new Set((accesos ?? []).map((a) => a.studio_id as string));
  return (sedes ?? []).map((s) => ({ id: s.id as string, nombre: s.nombre as string, apiActivada: activas.has(s.id as string), esEsta: s.id === g.studioId }));
}

const COLUMNAS_CLAVE = 'id, nombre, prefijo, scopes, creada_en, expira_en, ultimo_uso_en, revocada_en, rotada_desde, cadena_id';

/** Lo que ve el panel de una clave. Nunca el hash. */
export function clavePanel(f: {
  id: string; nombre: string; prefijo: string; scopes: string[]; creada_en: string; expira_en: string | null;
  ultimo_uso_en: string | null; revocada_en: string | null; rotada_desde: string | null; cadena_id: string | null;
}) {
  return {
    id: f.id, nombre: f.nombre, prefijo: f.prefijo, scopes: f.scopes, creadaEn: f.creada_en,
    expiraEn: f.expira_en, ultimoUsoEn: f.ultimo_uso_en, revocadaEn: f.revocada_en, rotadaDesde: f.rotada_desde,
    estado: estadoClave(f, new Date()),
    alcance: f.cadena_id ? 'cadena' as const : 'sede' as const,
  };
}

/** Las claves que se gestionan desde esta sede (`filtroClaves`). */
export async function listarClaves(g: Extract<Gestor, { ok: true }>) {
  const { data, error } = await g.admin.from('api_claves').select(COLUMNAS_CLAVE)
    .or(filtroClaves(g)).order('creada_en', { ascending: false }).limit(100);
  if (error) return null;
  return (data ?? []).map(clavePanel);
}

export { COLUMNAS_CLAVE };

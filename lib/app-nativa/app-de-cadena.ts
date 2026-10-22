// En una cadena hay UNA app de tienda (decisión del fundador, 15-oct-2026): la pide la sede
// principal, su fila de `apps_estudio` va con el id de esa sede, y dentro la alumna elige la suya.
// Aquí, de qué estudio es la app que le toca a una sede, y qué sedes van dentro.
//
// ⚠️ Una sede que YA tiene su propia fila (la app piloto de «marta», de antes de esta decisión, es
// una sede secundaria de su cadena) la conserva tal cual: es la app de ESA sede, sin las demás.
// Nada de lo que ya funciona cambia por la regla nueva; la regla nueva es para lo que se pida.
//
// La principal es la sede más ANTIGUA de la cadena, con el mismo orden que `leerCadenaParaGratis`
// (lib/billing/convertir-a-gratis.ts): `creado_en` y, a igualdad, `id`. No hay columna que lo diga.

import type { SupabaseClient } from '@supabase/supabase-js';

export interface EstudioDeLaApp {
  /** El estudio dueño de la app: el propio si va suelto o ya tiene la suya; si no, la principal de su cadena. */
  studioId: string;
  /** ¿Es una sede de una cadena que no es la principal ni tiene app propia? Esa no pide: ve la de su cadena. */
  esSedeSecundaria: boolean;
  /** El nombre de la sede principal, para decirle a una secundaria desde dónde se pide. */
  nombrePrincipal: string | null;
  /** Las sedes que van en la app (la principal primero). Solo la propia si va suelta o tiene la suya. */
  sedes: string[];
}

type Sede = { id: string; nombre: string | null };

/** Las sedes de una cadena, la principal primero. */
export async function sedesDeCadena(admin: SupabaseClient, cadenaId: string): Promise<Sede[]> {
  const { data, error } = await admin.from('studios').select('id, nombre').eq('cadena_id', cadenaId)
    .order('creado_en', { ascending: true, nullsFirst: false }).order('id', { ascending: true });
  if (error) throw new Error(`leer las sedes de la cadena: ${error.message}`);
  return (data ?? []) as Sede[];
}

/** Lo puro: dado quién es, si tiene app propia y las sedes de su cadena, de quién es la app. */
export function resolverDuena(studioId: string, tieneAppPropia: boolean, sedes: readonly Sede[] | null): EstudioDeLaApp {
  const suelta: EstudioDeLaApp = { studioId, esSedeSecundaria: false, nombrePrincipal: null, sedes: [studioId] };
  if (!sedes || sedes.length === 0) return suelta;
  const principal = sedes[0];
  const todas = sedes.map((s) => s.id);
  if (principal.id === studioId) return { studioId, esSedeSecundaria: false, nombrePrincipal: null, sedes: todas };
  if (tieneAppPropia) return suelta;
  return { studioId: principal.id, esSedeSecundaria: true, nombrePrincipal: principal.nombre, sedes: todas };
}

export async function estudioDeLaApp(admin: SupabaseClient, studioId: string): Promise<EstudioDeLaApp> {
  const [{ data: estudio, error }, { data: propia, error: errPropia }] = await Promise.all([
    admin.from('studios').select('id, cadena_id').eq('id', studioId).maybeSingle(),
    admin.from('apps_estudio').select('studio_id').eq('studio_id', studioId).maybeSingle(),
  ]);
  if (error) throw new Error(`leer el estudio: ${error.message}`);
  if (errPropia) throw new Error(`leer la app del estudio: ${errPropia.message}`);
  const cadenaId = (estudio as { cadena_id: string | null } | null)?.cadena_id ?? null;
  const sedes = cadenaId ? await sedesDeCadena(admin, cadenaId) : null;
  return resolverDuena(studioId, !!propia, sedes);
}

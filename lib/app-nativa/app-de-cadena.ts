// En una cadena hay UNA app de tienda (decisión del fundador, 15-oct-2026): la pide la sede
// principal, su fila de `apps_estudio` va con el id de esa sede, y dentro la alumna elige la suya.
// Aquí, de qué estudio es la app que le toca a una sede.
//
// La principal es la sede más ANTIGUA de la cadena, con el mismo orden que `leerCadenaParaGratis`
// (lib/billing/convertir-a-gratis.ts): `creado_en` y, a igualdad, `id`. No hay columna que lo diga.

import type { SupabaseClient } from '@supabase/supabase-js';

export interface EstudioDeLaApp {
  /** El estudio dueño de la app: la propia sede si va suelta, la principal si es de una cadena. */
  studioId: string;
  /** ¿Es una sede de una cadena que no es la principal? Esa no pide: ve la de su cadena. */
  esSedeSecundaria: boolean;
  /** El nombre de la sede principal, para decirle a una secundaria desde dónde se pide. */
  nombrePrincipal: string | null;
  /** Todas las sedes que van en la app (la propia si va suelta), la principal primero. */
  sedes: string[];
}

export async function estudioDeLaApp(admin: SupabaseClient, studioId: string): Promise<EstudioDeLaApp> {
  const { data: estudio, error } = await admin.from('studios').select('id, cadena_id').eq('id', studioId).maybeSingle();
  if (error) throw new Error(`leer el estudio: ${error.message}`);
  const cadenaId = (estudio as { cadena_id: string | null } | null)?.cadena_id ?? null;
  if (!cadenaId) return { studioId, esSedeSecundaria: false, nombrePrincipal: null, sedes: [studioId] };

  const { data: sedes, error: errSedes } = await admin.from('studios').select('id, nombre').eq('cadena_id', cadenaId)
    .order('creado_en', { ascending: true, nullsFirst: false }).order('id', { ascending: true });
  if (errSedes) throw new Error(`leer las sedes de la cadena: ${errSedes.message}`);
  const lista = (sedes ?? []) as { id: string; nombre: string | null }[];
  const principal = lista[0];
  if (!principal) return { studioId, esSedeSecundaria: false, nombrePrincipal: null, sedes: [studioId] };
  return {
    studioId: principal.id,
    esSedeSecundaria: principal.id !== studioId,
    nombrePrincipal: principal.nombre,
    sedes: lista.map((s) => s.id),
  };
}

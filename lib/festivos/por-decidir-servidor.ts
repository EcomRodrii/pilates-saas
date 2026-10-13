// ─────────────────────────────────────────────────────────────────────────────
// Lee de la base de datos los festivos que esperan una decisión del estudio
// (lib/festivos/por-decidir.ts dice cuáles y cómo se cuentan).
//
// Va con service-role: el llamador comprueba el rol (`puedeGestionarSede`) y
// pasa el estudio de la SESIÓN, nunca del cliente. Cada consulta filtra por él.
// Imports relativos con `.ts` para probarlo con un cliente falso
// (por-decidir-servidor.test.ts).
//
// Tres salidas, y ninguna inventa un cero:
//   · { disponible: false } → apagado: el interruptor `FESTIVOS_AVISO` no está
//     encendido para este estudio, o la tabla `festivos_abiertos` aún no existe
//     (migr 20261012210000 sin aplicar). Ni línea en la bandeja ni tarjeta: un
//     aviso que solo se pudiera quitar cerrando empujaría a cerrar.
//   · { disponible: true, festivos } → lo que hay (puede ser []).
//   · null → falló una lectura: la bandeja no lo enseña (como el resto).
// ─────────────────────────────────────────────────────────────────────────────
import type { SupabaseClient } from '@supabase/supabase-js';
import { esTablaQueFalta } from '../db/tabla-que-falta.ts';
import { mapLimit } from '../concurrency.ts';
import { avisoFestivosEncendido } from '../interruptor-por-estudio.ts';
import { finDelDiaEstudio, hoyEnEstudio, inicioDelDiaEstudio } from '../utils.ts';
import type { FestivoOficial, ZonaFestivos } from './oficiales.ts';
import { festivosSinDecidir, ventanaFestivos, type FestivoConClases } from './por-decidir.ts';
import { zonaDelEstudio } from './zona-del-estudio.ts';

export type ResultadoFestivos =
  | { disponible: false }
  | { disponible: true; zona: ZonaFestivos | null; festivos: FestivoConClases[] }
  | null;

/** La zona del estudio según su dirección, o null (sin calendario: no se avisa). */
export async function zonaDeEstudio(admin: SupabaseClient, studioId: string): Promise<ZonaFestivos | null | 'error'> {
  const { data, error } = await admin.from('studios')
    .select('codigo_postal, ciudad, direccion, zona_horaria').eq('id', studioId).maybeSingle();
  if (error) {
    console.error('[festivos:estudio]', error);
    return 'error';
  }
  if (!data) return null;
  return zonaDelEstudio({
    codigoPostal: data.codigo_postal as string | null,
    ciudad: data.ciudad as string | null,
    direccion: data.direccion as string | null,
    zonaHoraria: data.zona_horaria as string | null,
  });
}

/** ¿Existe la tabla de «abrimos igualmente»? (la migración puede no estar aplicada) */
async function abiertosEntre(admin: SupabaseClient, studioId: string, desde: string, hasta: string) {
  const { data, error } = await admin.from('festivos_abiertos')
    .select('fecha').eq('studio_id', studioId).gte('fecha', desde).lte('fecha', hasta);
  if (error) return esTablaQueFalta(error) ? ('no_disponible' as const) : ('error' as const);
  return new Set((data ?? []).map((f) => String(f.fecha).slice(0, 10)));
}

export async function festivosPorDecidir(
  admin: SupabaseClient,
  { studioId, ahora, alcance, conReservas }: { studioId: string; ahora: Date; alcance: 'aviso' | 'todos'; conReservas: boolean },
): Promise<ResultadoFestivos> {
  if (!avisoFestivosEncendido(studioId)) return { disponible: false };

  const zona = await zonaDeEstudio(admin, studioId);
  if (zona === 'error') return null;

  // La tabla se mira SIEMPRE, también sin zona: «disponible» tiene que querer
  // decir lo mismo para todos los estudios.
  const hoy = hoyEnEstudio(ahora);
  const abiertos = await abiertosEntre(admin, studioId, hoy, hoy);
  if (abiertos === 'no_disponible') return { disponible: false };
  if (abiertos === 'error') return null;

  if (!zona) return { disponible: true, zona: null, festivos: [] };
  const ventana = ventanaFestivos(hoy, alcance, zona);
  if (!ventana) return { disponible: true, zona, festivos: [] };

  // Sin ningún festivo en la ventana, nada más que leer (lo normal casi todo el año).
  const enVentana = festivosSinDecidir(zona, ventana, { abiertos: new Set(), cierres: [] });
  if (enVentana.length === 0) return { disponible: true, zona, festivos: [] };

  const [yaAbiertos, cierres] = await Promise.all([
    abiertosEntre(admin, studioId, ventana.desde, ventana.hasta),
    admin.from('cierres_estudio').select('desde, hasta').eq('studio_id', studioId)
      .lte('desde', ventana.hasta).gte('hasta', ventana.desde),
  ]);
  if (yaAbiertos === 'no_disponible') return { disponible: false };
  if (yaAbiertos === 'error' || cierres.error) {
    if (cierres.error) console.error('[festivos:cierres]', cierres.error);
    return null;
  }
  const pendientes = festivosSinDecidir(zona, ventana, {
    abiertos: yaAbiertos,
    cierres: (cierres.data ?? []).map((c) => ({ desde: String(c.desde).slice(0, 10), hasta: String(c.hasta).slice(0, 10) })),
  });

  // De a pocos: el aviso son 0–2 festivos, «Ver todos» hasta ~15.
  const contados = await mapLimit(pendientes, 3, (f) => contarDia(admin, studioId, f, conReservas));
  if (contados.some((c) => c === null)) return null;
  return { disponible: true, zona, festivos: (contados as FestivoConClases[]).filter((f) => f.clases > 0) };
}

async function contarDia(
  admin: SupabaseClient, studioId: string, f: FestivoOficial, conReservas: boolean,
): Promise<FestivoConClases | null> {
  // El día del ESTUDIO: con días UTC se escaparían las clases de madrugada.
  const { data, error } = await admin.from('sesiones').select('id')
    .eq('studio_id', studioId).eq('cancelada', false)
    .gte('inicio', inicioDelDiaEstudio(f.fecha)).lt('inicio', finDelDiaEstudio(f.fecha))
    .limit(500);
  if (error) {
    console.error('[festivos:clases]', error);
    return null;
  }
  const ids = (data ?? []).map((s) => s.id as string);
  if (!conReservas || ids.length === 0) return { ...f, clases: ids.length, reservas: conReservas ? 0 : null };
  const { count, error: errRes } = await admin.from('reservas').select('id', { count: 'exact', head: true })
    .eq('studio_id', studioId).eq('estado', 'CONFIRMADA').in('sesion_id', ids);
  if (errRes) {
    console.error('[festivos:reservas]', errRes);
    return null;
  }
  return { ...f, clases: ids.length, reservas: count ?? 0 };
}

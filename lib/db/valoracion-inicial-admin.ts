import 'server-only';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import {
  normalizar, sePuedeCompletar, repartirHistorial,
  type Valoracion, type FilaValoracion, type Historial,
} from '@/lib/valoracion-inicial';

// Lectura y escritura de la valoración inicial, EN SERVIDOR y con service-role.
//
// ⚠️ Por qué service-role y no RLS: la app de la alumna se autentica con
// `supabasePortal`, que es un `AuthClient` PURO — sin Postgrest. No puede hacer
// un `.from()` ni queriendo. Todo lo suyo va por `/api/public/*`, y la
// cerradura es `socioAutenticado(userId, studioId)` en la ruta, que resuelve el
// `socioId` desde el JWT verificado. **El `socioId` no se acepta nunca del
// body**: aceptarlo sería dejar elegir de quién es la valoración que se
// escribe. Mismo criterio que `crearReservaPublica` y `toggleFavoritoPublico`.
//
// Las tablas siguen con RLS activa y sin ninguna política de escritura: nadie
// más que esto escribe aquí.

const TABLA = 'valoraciones_iniciales';
const TABLA_SALUD = 'valoraciones_iniciales_salud';

interface FilaBase {
  id: string; estado: 'EN_PROGRESO' | 'COMPLETADA';
  objetivos: string[] | null; objetivo_principal: string | null;
  experiencia: string | null; nivel: string | null;
  actividad_habitual: string | null; frecuencia: string | null;
  expectativas: string | null;
  creado_en: string; completada_en: string | null;
}
interface FilaSalud {
  valoracion_id: string; tiene_molestias: boolean | null;
  zonas: string[] | null; detalle: string | null; estado_cuerpo: string | null;
}

function proyectar(b: FilaBase, s: FilaSalud | undefined): FilaValoracion {
  return {
    id: b.id,
    estado: b.estado,
    // ⚠️ `completada_en` manda sobre `creado_en` para ordenar el historial. Un
    // borrador abierto en enero y terminado en junio se creó antes que una
    // valoración de marzo, pero se COMPLETÓ después — y lo que ordena «cómo
    // llegó» frente a «qué dice hoy» es cuándo lo dijo, no cuándo abrió la
    // pantalla.
    creadoEn: b.completada_en ?? b.creado_en,
    valoracion: normalizar({
      objetivos: (b.objetivos ?? []) as Valoracion['objetivos'],
      objetivoPrincipal: b.objetivo_principal as Valoracion['objetivoPrincipal'],
      experiencia: b.experiencia as Valoracion['experiencia'],
      nivel: b.nivel as Valoracion['nivel'],
      actividadHabitual: b.actividad_habitual ?? '',
      frecuencia: b.frecuencia as Valoracion['frecuencia'],
      expectativas: b.expectativas ?? '',
      tieneMolestias: s?.tiene_molestias ?? null,
      zonas: (s?.zonas ?? []) as Valoracion['zonas'],
      detalle: s?.detalle ?? '',
      estadoCuerpo: (s?.estado_cuerpo ?? null) as Valoracion['estadoCuerpo'],
    }),
  };
}

/**
 * Todo lo que esa socia ha declarado en este estudio.
 *
 * `conSalud` decide si se llega a leer la mitad clínica. Lo pasa quien llama
 * según QUIÉN pregunta: la propia socia sí, el panel solo si el rol y el
 * consentimiento lo permiten.
 */
export async function leerHistorialValoracion(
  studioId: string, socioId: string, conSalud: boolean,
): Promise<Historial> {
  const admin = getSupabaseAdmin();
  if (!admin) return { inicial: null, actual: null, borrador: null, vueltas: 0 };

  const { data: base } = await admin.from(TABLA)
    .select('id, estado, objetivos, objetivo_principal, experiencia, nivel, actividad_habitual, frecuencia, expectativas, creado_en, completada_en')
    .eq('studio_id', studioId).eq('socio_id', socioId);
  const filas = (base ?? []) as FilaBase[];
  if (filas.length === 0) return { inicial: null, actual: null, borrador: null, vueltas: 0 };

  let salud: FilaSalud[] = [];
  if (conSalud) {
    const { data } = await admin.from(TABLA_SALUD)
      .select('valoracion_id, tiene_molestias, zonas, detalle, estado_cuerpo')
      .in('valoracion_id', filas.map((f) => f.id));
    salud = (data ?? []) as FilaSalud[];
  }
  const porId = new Map(salud.map((s) => [s.valoracion_id, s]));
  // El reparto inicial/actual lo decide la función pura, no una query con
  // ORDER BY: así la regla se puede probar sin base de datos, y es la MISMA que
  // usa el panel.
  return repartirHistorial(filas.map((f) => proyectar(f, porId.get(f.id))));
}

export type ResultadoGuardar =
  | { ok: true; id: string; estado: 'EN_PROGRESO' | 'COMPLETADA' }
  | { error: string; falta?: string[] };

/**
 * Guarda el borrador, o lo da por terminado.
 *
 * ⚠️ Se REVALIDA aquí lo que ya validó la pantalla. No es paranoia de manual:
 * este endpoint acepta cualquier cuerpo JSON, y `normalizar` es lo único que
 * impide que se cuele un objetivo que no está en el catálogo o —peor— unas
 * zonas de dolor en la ficha de alguien que ha declarado que no tiene ninguna.
 *
 * ⚠️ `conSalud` NO viene del cliente: lo resuelve el llamador consultando el
 * consentimiento en la base. Un flag del body decidiendo si se puede escribir
 * dato del art. 9 sería exactamente el bug que este diseño evita.
 */
export async function guardarValoracionInicial(params: {
  studioId: string; socioId: string; valoracion: Valoracion;
  completar: boolean; conSalud: boolean;
}): Promise<ResultadoGuardar> {
  const admin = getSupabaseAdmin();
  if (!admin) return { error: 'Servidor no configurado' };
  const { studioId, socioId, completar, conSalud } = params;
  const v = normalizar(params.valoracion);

  if (completar && !sePuedeCompletar(v, conSalud)) {
    // Se devuelve QUÉ falta, no un «no» a secas: la pantalla necesita poder
    // llevarla al paso que le falta.
    const { loQueFalta } = await import('@/lib/valoracion-inicial');
    return { error: 'Faltan respuestas obligatorias', falta: loQueFalta(v, conSalud) };
  }

  // El borrador abierto, si lo hay. El índice parcial garantiza que sea uno.
  const { data: abierto } = await admin.from(TABLA)
    .select('id').eq('studio_id', studioId).eq('socio_id', socioId)
    .eq('estado', 'EN_PROGRESO').maybeSingle();

  const id = abierto?.id ?? crypto.randomUUID();
  const ahora = new Date().toISOString();
  const campos = {
    id, studio_id: studioId, socio_id: socioId,
    estado: completar ? 'COMPLETADA' : 'EN_PROGRESO',
    objetivos: v.objetivos,
    objetivo_principal: v.objetivoPrincipal,
    experiencia: v.experiencia,
    nivel: v.nivel,
    actividad_habitual: v.actividadHabitual,
    frecuencia: v.frecuencia,
    expectativas: v.expectativas,
    actualizado_en: ahora,
    completada_en: completar ? ahora : null,
  };

  const { error } = await admin.from(TABLA).upsert(campos, { onConflict: 'id' });
  if (error) return { error: 'No hemos podido guardar tu valoración.' };

  // La mitad de salud, solo si hay consentimiento vigente. Sin él no se escribe
  // NADA aquí — ni siquiera una fila con `tiene_molestias: null`, que ya sería
  // una fila de datos de salud sobre esa persona.
  if (conSalud) {
    const { error: e2 } = await admin.from(TABLA_SALUD).upsert({
      valoracion_id: id, studio_id: studioId, socio_id: socioId,
      tiene_molestias: v.tieneMolestias, zonas: v.zonas, detalle: v.detalle,
      estado_cuerpo: v.estadoCuerpo,
    }, { onConflict: 'valoracion_id' });
    // ⚠️ No se revierte la mitad de arriba si esta falla, y es deliberado: lo
    // que queda es un borrador válido al que le falta un trozo, que es un
    // estado correcto y recuperable. Envolverlo en una RPC transaccional sería
    // maquinaria para un invariante que no existe.
    if (e2) return { error: 'Hemos guardado parte, pero no todo. Inténtalo de nuevo.' };
  }

  return { ok: true, id, estado: completar ? 'COMPLETADA' : 'EN_PROGRESO' };
}

/**
 * ¿Tiene consentimiento de datos de salud vigente?
 *
 * Se lee de las MISMAS columnas que usa `tiene_consentimiento_salud` en SQL
 * (0138 / 20260804201830), no de una copia: fecha puesta y sin revocar.
 */
export async function tieneConsentimientoSalud(socioId: string): Promise<boolean> {
  const admin = getSupabaseAdmin();
  if (!admin) return false;
  const { data } = await admin.from('socios')
    .select('consentimiento_salud_fecha, consentimiento_salud_revocado_en')
    .eq('id', socioId).maybeSingle();
  return Boolean(data?.consentimiento_salud_fecha) && !data?.consentimiento_salud_revocado_en;
}

/** Lo deja registrado con quién lo dio y QUÉ texto aceptó. */
export async function registrarConsentimientoSaludSocia(
  socioId: string, texto: string,
): Promise<{ ok: true } | { error: string }> {
  const admin = getSupabaseAdmin();
  if (!admin) return { error: 'Servidor no configurado' };
  const { error } = await admin.from('socios').update({
    consentimiento_salud_fecha: new Date().toISOString(),
    // 'SOCIA' = lo dio ella misma desde su app. La convención ya estaba escrita
    // para el consentimiento de marketing: o 'SOCIA', o el nombre de quien del
    // estudio lo registró en mostrador.
    consentimiento_salud_registrado_por: 'SOCIA',
    consentimiento_salud_texto: texto,
    // Volver a darlo levanta una revocación anterior; si no, quedaría dado y
    // revocado a la vez, y `tiene_consentimiento_salud` seguiría diciendo que no.
    consentimiento_salud_revocado_en: null,
  }).eq('id', socioId);
  return error ? { error: 'No hemos podido guardar tu consentimiento.' } : { ok: true };
}

import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { uid } from '@/lib/utils';
import { mapLimit } from '@/lib/concurrency';
import { fetchAllRows } from '@/lib/supabase-data';
import { capturarExcepcion } from '@/lib/sentry-cliente';
import type { NivelRiesgoDependencia, AlumnaCautiva } from '@/lib/types';

// Mismo límite que ya usa el resto del repo para abanicos contra Supabase
// (mensajería, studio-context): suficiente para que el barrido quepa de sobra
// en los 300 s, sin abrir tantas conexiones a la vez que se estorben entre sí.
export const CONCURRENCIA_ESTUDIOS = 8;

// ─────────────────────────────────────────────────────────────────────────────
// Riesgo de concentración por instructor (Instructor Dependency Risk).
//
// Cálculo DETERMINISTA (sin ML) sobre datos históricos, en servidor con
// service-role. Para cada instructor de un estudio, en una ventana móvil:
//   1. Alumnas únicas que han ASISTIDO a sus clases.
//   2. De esas, cuántas son "cautivas": ≥80% de sus asistencias son con él/ella.
//   3. Ingresos totales de esas cautivas (todo su gasto en el estudio, no solo
//      las clases del instructor) en la ventana.
//   4. % que ese ingreso cautivo representa sobre la facturación total del
//      estudio en la ventana → nivel de riesgo (umbrales configurables).
//
// El resultado se persiste (upsert) en instructor_dependency_snapshots.
// ─────────────────────────────────────────────────────────────────────────────

// Umbral de "cautividad": fracción de asistencias con el mismo instructor.
const UMBRAL_CAUTIVA = 0.8;
// Mínimo de asistencias en la ventana para considerar a una socia (evita que una
// socia de 1 sola visita cuente como 100% cautiva y meta ruido).
const MIN_ASISTENCIAS_CAUTIVA = 2;

export function nivelRiesgo(pct: number, umbralAlto: number, umbralMedio: number): NivelRiesgoDependencia {
  if (pct > umbralAlto) return 'ALTO';
  if (pct >= umbralMedio) return 'MEDIO';
  return 'BAJO';
}

type Admin = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

export interface TransicionRiesgo {
  instructorId: string;
  nombre: string;
  nivelAnterior: NivelRiesgoDependencia | null;
  nivelNuevo: NivelRiesgoDependencia;
  porcentaje: number;
}

// Calcula y persiste los snapshots de un estudio. Devuelve las transiciones de
// nivel (para que el cron notifique a quien pasa a ALTO).
export async function calcularDependenciaEstudio(
  admin: Admin,
  studioId: string,
): Promise<TransicionRiesgo[]> {
  // Config del estudio (umbrales + ventana).
  const { data: studio } = await admin
    .from('studios')
    .select('dep_umbral_alto, dep_umbral_medio, dep_ventana_dias')
    .eq('id', studioId)
    .maybeSingle();
  const umbralAlto = Number(studio?.dep_umbral_alto ?? 25);
  const umbralMedio = Number(studio?.dep_umbral_medio ?? 15);
  const ventanaDias = Number(studio?.dep_ventana_dias ?? 90);

  const fin = new Date();
  const inicio = new Date(fin.getTime() - ventanaDias * 24 * 60 * 60 * 1000);
  const inicioISO = inicio.toISOString();
  const finISO = fin.toISOString();
  const periodoInicio = inicioISO.slice(0, 10);
  const periodoFin = finISO.slice(0, 10);

  // Instructores EN ACTIVO (los que no tengan actividad quedan en BAJO). A quien
  // ya no está en el equipo no se le mide la dependencia: el riesgo es "si se va,
  // me llevo su cartera", y de alguien que ya se fue no hay nada que prevenir.
  // Además evita alertas fantasma: tres instructoras de demo dadas de baja
  // sostenían un "riesgo ALTO" del 32,8% que no existía.
  const { data: instructores } = await admin
    .from('instructores')
    .select('id, nombre')
    .eq('studio_id', studioId)
    .eq('activo', true);
  const nombreInstructor = new Map<string, string>();
  for (const i of instructores ?? []) nombreInstructor.set(i.id as string, (i.nombre as string) ?? '');

  // Sesiones de la ventana → mapa sesion_id → instructor_id.
  const { data: sesiones } = await admin
    .from('sesiones')
    .select('id, instructor_id')
    .eq('studio_id', studioId)
    .gte('inicio', inicioISO)
    .lt('inicio', finISO);
  const sesionInstructor = new Map<string, string>();
  for (const s of sesiones ?? []) {
    if (s.instructor_id) sesionInstructor.set(s.id as string, s.instructor_id as string);
  }

  // Asistencias (reservas ASISTIDA) de la ventana → por socia, conteo por instructor.
  const { data: reservas } = await admin
    .from('reservas')
    .select('socio_id, sesion_id')
    .eq('studio_id', studioId)
    .eq('estado', 'ASISTIDA');

  // socioId → { total, porInstructor: Map<instructorId, count> }
  const asistPorSocio = new Map<string, { total: number; porInstructor: Map<string, number> }>();
  // instructorId → set de socios que han asistido a alguna de sus clases
  const alumnasPorInstructor = new Map<string, Set<string>>();

  for (const r of reservas ?? []) {
    const sid = r.socio_id as string | null;
    const sesId = r.sesion_id as string | null;
    if (!sid || !sesId) continue;
    const insId = sesionInstructor.get(sesId);
    if (!insId) continue; // reserva fuera de la ventana o sin instructor

    const entry = asistPorSocio.get(sid) ?? { total: 0, porInstructor: new Map() };
    entry.total += 1;
    entry.porInstructor.set(insId, (entry.porInstructor.get(insId) ?? 0) + 1);
    asistPorSocio.set(sid, entry);

    const set = alumnasPorInstructor.get(insId) ?? new Set<string>();
    set.add(sid);
    alumnasPorInstructor.set(insId, set);
  }

  // Determina cautividad: cada socia se asigna (como máximo) a UN instructor
  // dominante si concentra ≥80% de sus asistencias con él/ella.
  const cautivasPorInstructor = new Map<string, Array<{ socioId: string; pct: number }>>();
  for (const [socioId, { total, porInstructor }] of asistPorSocio) {
    if (total < MIN_ASISTENCIAS_CAUTIVA) continue;
    let mejorIns = '';
    let mejorCount = 0;
    for (const [insId, count] of porInstructor) {
      if (count > mejorCount) { mejorCount = count; mejorIns = insId; }
    }
    const pct = mejorCount / total;
    if (pct >= UMBRAL_CAUTIVA && mejorIns) {
      const arr = cautivasPorInstructor.get(mejorIns) ?? [];
      arr.push({ socioId, pct });
      cautivasPorInstructor.set(mejorIns, arr);
    }
  }

  // Ingresos por socia en la ventana (recibos COBRADO + ventas_pos).
  const gastoPorSocio = new Map<string, number>();
  let ingresosTotalEstudio = 0;

  const { data: recibos } = await admin
    .from('recibos')
    .select('socio_id, importe')
    .eq('studio_id', studioId)
    .eq('estado', 'COBRADO')
    .gte('fecha_cobro', periodoInicio)
    .lte('fecha_cobro', periodoFin);
  for (const rec of recibos ?? []) {
    const imp = Number(rec.importe ?? 0);
    ingresosTotalEstudio += imp;
    if (rec.socio_id) gastoPorSocio.set(rec.socio_id as string, (gastoPorSocio.get(rec.socio_id as string) ?? 0) + imp);
  }

  const { data: ventas } = await admin
    .from('ventas_pos')
    .select('socio_id, total')
    .eq('studio_id', studioId)
    .gte('realizada_en', inicioISO)
    .lt('realizada_en', finISO);
  for (const v of ventas ?? []) {
    const imp = Number(v.total ?? 0);
    ingresosTotalEstudio += imp;
    if (v.socio_id) gastoPorSocio.set(v.socio_id as string, (gastoPorSocio.get(v.socio_id as string) ?? 0) + imp);
  }

  // Nombres de las socias cautivas (para el detalle del modal).
  const idsCautivas = [...new Set([...cautivasPorInstructor.values()].flat().map(c => c.socioId))];
  const nombreSocio = new Map<string, string>();
  if (idsCautivas.length) {
    const { data: socios } = await admin
      .from('socios').select('id, nombre, apellidos').in('id', idsCautivas);
    for (const s of socios ?? []) {
      nombreSocio.set(s.id as string, `${(s.nombre as string) ?? ''} ${(s.apellidos as string) ?? ''}`.trim());
    }
  }

  // Nivel anterior por instructor (para detectar transiciones a ALTO).
  const { data: previos } = await admin
    .from('instructor_dependency_snapshots')
    .select('instructor_id, nivel_riesgo')
    .eq('studio_id', studioId);
  const nivelAnterior = new Map<string, NivelRiesgoDependencia>();
  for (const p of previos ?? []) {
    if (p.instructor_id) nivelAnterior.set(p.instructor_id as string, (p.nivel_riesgo as NivelRiesgoDependencia) ?? 'BAJO');
  }

  // Construye y persiste un snapshot por instructor.
  const transiciones: TransicionRiesgo[] = [];
  const filas: Record<string, unknown>[] = [];

  for (const insId of nombreInstructor.keys()) {
    const cautivas = cautivasPorInstructor.get(insId) ?? [];
    const detalle: AlumnaCautiva[] = cautivas.map(c => ({
      socioId: c.socioId,
      nombre: nombreSocio.get(c.socioId) ?? 'Socia',
      gasto: Math.round((gastoPorSocio.get(c.socioId) ?? 0) * 100) / 100,
      pctConInstructor: Math.round(c.pct * 100),
    })).sort((a, b) => b.gasto - a.gasto);

    const ingresosCautivos = Math.round(detalle.reduce((s, d) => s + d.gasto, 0) * 100) / 100;
    const pct = ingresosTotalEstudio > 0
      ? Math.round((ingresosCautivos / ingresosTotalEstudio) * 100 * 100) / 100
      : 0;
    const nivel = nivelRiesgo(pct, umbralAlto, umbralMedio);
    const antes = nivelAnterior.get(insId) ?? null;

    if (nivel === 'ALTO' && antes !== 'ALTO') {
      transiciones.push({ instructorId: insId, nombre: nombreInstructor.get(insId) ?? '', nivelAnterior: antes, nivelNuevo: nivel, porcentaje: pct });
    }

    filas.push({
      id: `dep-${studioId}-${insId}`,
      studio_id: studioId,
      instructor_id: insId,
      periodo_inicio: periodoInicio,
      periodo_fin: periodoFin,
      ventana_dias: ventanaDias,
      alumnas_total: (alumnasPorInstructor.get(insId) ?? new Set()).size,
      alumnas_cautivas_count: detalle.length,
      ingresos_cautivos: ingresosCautivos,
      ingresos_total_estudio: Math.round(ingresosTotalEstudio * 100) / 100,
      porcentaje_facturacion: pct,
      nivel_riesgo: nivel,
      detalle,
      calculado_en: new Date().toISOString(),
    });
  }

  if (filas.length) {
    const { error } = await admin
      .from('instructor_dependency_snapshots')
      .upsert(filas, { onConflict: 'studio_id,instructor_id' });
    if (error) throw new Error(`[calcularDependenciaEstudio] ${error.message}`);
  }

  // Y borra los de quien ya no está en el equipo. El upsert solo pisa lo que
  // recalcula, así que sin esto el último snapshot de una instructora dada de
  // baja se quedaría en la tabla — y la tarjeta lo seguiría enseñando, con su
  // nivel de riesgo congelado, para siempre.
  const activos = [...nombreInstructor.keys()];
  if (activos.length) {
    await admin.from('instructor_dependency_snapshots')
      .delete().eq('studio_id', studioId)
      .not('instructor_id', 'in', `(${activos.map(id => `"${id}"`).join(',')})`);
  }

  return transiciones;
}

const VENTANA_SEGUIMIENTO_SEMANAS = 6;
// Recencia para contar una alumna cautiva como "sigue viniendo" tras la baja
// de su instructora — mismo criterio de "reciente" que usa
// rendimiento-instructoras.ts para retención (30 días).
const DIAS_RECIENCIA_RETENIDA = 30;

type SnapshotBajaCartera = {
  nivelRiesgo: string;
  porcentajeFacturacion: number;
  alumnasCautivasCount: number;
  detalle: AlumnaCautiva[];
};

// Fila 18 (protocolo de salida): foto de la cartera de una instructora EN EL
// MOMENTO de su baja. Lee el último snapshot ya calculado (hasta 1 semana de
// antigüedad, aceptable para un indicador de seguimiento) en vez de recalcular
// síncronamente dentro del endpoint de baja — reutiliza el dato, no lo rehace.
// Debe llamarse ANTES del DELETE de `instructores`: `instructor_dependency_
// snapshots.instructor_id` tiene ON DELETE CASCADE, así que su fila
// desaparece en el mismo instante de la baja dura. Solo LEE — el registro se
// escribe con `registrarBajaCartera` DESPUÉS de confirmar que el DELETE tuvo
// éxito, para no dejar una baja "fantasma" si el DELETE falla (p.ej. la
// instructora todavía tiene clases asignadas, caso que el propio endpoint ya
// contempla en su mensaje de error).
export async function leerSnapshotParaBaja(
  admin: Admin,
  studioId: string,
  instructorId: string,
): Promise<SnapshotBajaCartera | null> {
  const { data: snapshot } = await admin
    .from('instructor_dependency_snapshots')
    .select('nivel_riesgo, porcentaje_facturacion, alumnas_cautivas_count, detalle')
    .eq('studio_id', studioId)
    .eq('instructor_id', instructorId)
    .maybeSingle();

  // Sin snapshot (instructora nueva, sin cron todavía, o sin ninguna alumna
  // cautiva) → no hay cartera que proteger, no se registra nada.
  if (!snapshot || (snapshot.alumnas_cautivas_count as number) === 0) return null;

  return {
    nivelRiesgo: snapshot.nivel_riesgo,
    porcentajeFacturacion: snapshot.porcentaje_facturacion,
    alumnasCautivasCount: snapshot.alumnas_cautivas_count,
    detalle: snapshot.detalle as AlumnaCautiva[],
  };
}

export async function registrarBajaCartera(
  admin: Admin,
  params: { studioId: string; instructorId: string; instructorNombre: string; snapshot: SnapshotBajaCartera },
): Promise<void> {
  const { snapshot } = params;
  const { error } = await admin.from('instructor_bajas_seguimiento').insert({
    id: `ibs-${uid()}`,
    studio_id: params.studioId,
    instructor_id: params.instructorId,
    instructor_nombre: params.instructorNombre,
    nivel_riesgo_al_salir: snapshot.nivelRiesgo,
    porcentaje_facturacion_al_salir: snapshot.porcentajeFacturacion,
    alumnas_cautivas_count: snapshot.alumnasCautivasCount,
    alumnas_cautivas: snapshot.detalle,
  });
  if (error) throw new Error(`[registrarBajaCartera] ${error.message}`);
}

// Fila 18: a las N semanas de una baja con cartera congelada, ¿cuántas de sus
// alumnas cautivas siguen viniendo al estudio (con cualquier instructora)?
// Un número agregado, no una lista de "quién se fue con quién" — no es una
// herramienta para señalar a nadie, es la señal de si hubo fuga real o no.
export async function evaluarRetencionTrasBajas(admin: Admin, studioId: string): Promise<void> {
  const hasta = new Date(Date.now() - VENTANA_SEGUIMIENTO_SEMANAS * 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: pendientes } = await admin
    .from('instructor_bajas_seguimiento')
    .select('id, alumnas_cautivas')
    .eq('studio_id', studioId)
    .is('evaluado_en', null)
    .lte('fecha_baja', hasta);
  if (!pendientes || pendientes.length === 0) return;

  // Recencia por la fecha REAL de la clase (sesiones.inicio), no por cuándo se
  // hizo la reserva — mismo criterio que calcularDependenciaEstudio más arriba
  // en este fichero. Una socia puede reservar con semanas de antelación, así
  // que `reservas.creado_en` no sirve como proxy de "ha venido recientemente".
  const desdeReciencia = new Date(Date.now() - DIAS_RECIENCIA_RETENIDA * 24 * 60 * 60 * 1000).toISOString();
  const { data: sesionesRecientes } = await admin
    .from('sesiones')
    .select('id')
    .eq('studio_id', studioId)
    .gte('inicio', desdeReciencia);
  const sesionIdsRecientes = (sesionesRecientes ?? []).map(s => s.id as string);

  for (const p of pendientes) {
    const cautivas = (p.alumnas_cautivas as AlumnaCautiva[]) ?? [];
    const socioIds = cautivas.map(c => c.socioId).filter(Boolean);
    let retenidas = 0;
    if (socioIds.length > 0 && sesionIdsRecientes.length > 0) {
      const { data: asistidas } = await admin
        .from('reservas')
        .select('socio_id')
        .eq('studio_id', studioId)
        .eq('estado', 'ASISTIDA')
        .in('socio_id', socioIds)
        .in('sesion_id', sesionIdsRecientes);
      retenidas = new Set((asistidas ?? []).map(r => r.socio_id as string)).size;
    }
    await admin.from('instructor_bajas_seguimiento')
      .update({ evaluado_en: new Date().toISOString(), alumnas_retenidas_count: retenidas })
      .eq('id', p.id as string);
  }
}

// Recorre TODOS los estudios (para el cron semanal). Devuelve, por estudio, las
// transiciones a ALTO detectadas.
export async function calcularDependenciaTodosLosEstudios(
  admin: Admin,
): Promise<Array<{ studioId: string; transiciones: TransicionRiesgo[] }>> {
  // Paginado: sin `.range()` PostgREST corta a 1.000 filas en silencio y, pasado
  // el estudio 1.001, a esos no se les calcularía el riesgo jamás.
  const { data: studios } = await fetchAllRows<{ id: string }>(
    '(global)', 'studios',
    (from, to) => admin.from('studios').select('id').range(from, to),
  );

  // En paralelo acotado, no en serie. Esto era un `for` con un `await` por
  // estudio dentro de una función de Vercel con techo de 300 s (`maxDuration`),
  // y al agotarlo Vercel la mata a media pasada SIN dejar constancia de por
  // dónde iba: la siguiente ejecución empieza otra vez por el principio, así que
  // los estudios del final de la lista no se calcularían NUNCA. El fallo no se
  // vería como una caída, sino como "a unos estudios les funciona el aviso de
  // riesgo y a otros no", que es de lo más difícil de diagnosticar.
  const res = await mapLimit(studios, CONCURRENCIA_ESTUDIOS, async (s) => {
    try {
      return { studioId: s.id, transiciones: await calcularDependenciaEstudio(admin, s.id) };
    } catch (e) {
      // Antes esto era un `console.error` y se perdía: un estudio cuyo cálculo
      // fallaba desaparecía del informe sin dejar ningún rastro accionable.
      capturarExcepcion(e, { tags: { area: 'cron-dependency' }, extra: { studioId: s.id } });
      return null;
    }
  });
  return res.filter((r): r is { studioId: string; transiciones: TransicionRiesgo[] } => r !== null);
}

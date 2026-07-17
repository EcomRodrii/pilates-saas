import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import type { NivelRiesgoDependencia, AlumnaCautiva } from '@/lib/types';

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

  // Instructores del estudio (todos; los que no tengan actividad quedan en BAJO).
  const { data: instructores } = await admin
    .from('instructores')
    .select('id, nombre')
    .eq('studio_id', studioId);
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

  return transiciones;
}

// Recorre TODOS los estudios (para el cron semanal). Devuelve, por estudio, las
// transiciones a ALTO detectadas.
export async function calcularDependenciaTodosLosEstudios(
  admin: Admin,
): Promise<Array<{ studioId: string; transiciones: TransicionRiesgo[] }>> {
  const { data: studios } = await admin.from('studios').select('id');
  const out: Array<{ studioId: string; transiciones: TransicionRiesgo[] }> = [];
  for (const s of studios ?? []) {
    try {
      const transiciones = await calcularDependenciaEstudio(admin, s.id as string);
      out.push({ studioId: s.id as string, transiciones });
    } catch (e) {
      console.error('[dependency] estudio', s.id, e);
    }
  }
  return out;
}

import type { SupabaseClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';

// Ausencias de instructoras (vacaciones / baja médica / otro): la lógica que
// comparten el panel (`app/api/equipo/ausencias`) y la app del estudio
// (`app/api/portal/instructora/ausencias`). Quién puede tocar qué lo decide
// cada ruta: aquí el `instructorId` ya llega resuelto en servidor.
//
// Al crearlas se materializan los bloqueos día a día en
// instructora_disponibilidad_excepciones (lo que ya lee rankear_candidatas), así
// la instructora deja de salir en el ranking de sustituciones durante esas
// fechas. Borrar la ausencia borra sus bloqueos en cascada (FK ON DELETE CASCADE).
//
// NO dispara ninguna sustitución sobre sus clases ya programadas (#558): solo
// se cuentan, para que se vea qué queda por cubrir.

export const TIPOS_AUSENCIA = ['VACACIONES', 'BAJA_MEDICA', 'OTRO'] as const;
export type TipoAusencia = (typeof TIPOS_AUSENCIA)[number];

const MAX_DIAS = 366; // tope defensivo: una ausencia no materializa años de bloqueos
const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;

export interface AusenciaFila {
  id: string;
  instructorId: string;
  tipo: TipoAusencia;
  desde: string;
  hasta: string;
  motivo: string | null;
}

export type ResultadoAusencia<T extends object = object> =
  | ({ ok: true } & T)
  | { ok: false; status: 400 | 404 | 500; error: string };

// Instante UTC del inicio (o fin) del día natural de Madrid para una fecha
// YYYY-MM-DD, con el offset correcto para esa fecha concreta (CET +1 / CEST
// +2). Se calcula a mediodía UTC de esa fecha para no caer justo en el
// instante de un cambio de hora.
function limiteDiaMadrid(fecha: string, finDelDia: boolean): string {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Madrid', timeZoneName: 'shortOffset',
  }).formatToParts(new Date(`${fecha}T12:00:00Z`));
  const offset = partes.find(p => p.type === 'timeZoneName')?.value ?? 'GMT+1';
  const horas = parseInt(offset.replace('GMT', '') || '+1', 10);
  const signo = horas >= 0 ? '+' : '-';
  const abs = String(Math.abs(horas)).padStart(2, '0');
  const hora = finDelDia ? '23:59:59.999' : '00:00:00';
  return `${fecha}T${hora}${signo}${abs}:00`;
}

function dias(desde: string, hasta: string): string[] {
  const out: string[] = [];
  const d = new Date(`${desde}T00:00:00Z`);
  const fin = new Date(`${hasta}T00:00:00Z`);
  while (d <= fin && out.length <= MAX_DIAS) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/**
 * A quién alcanza una lectura o un borrado. Explícito a propósito: «todo el
 * estudio» tiene que ser una decisión escrita por quien llama, nunca lo que
 * pasa cuando un `instructorId` llega vacío por error.
 */
export type AlcanceAusencias = 'estudio' | { instructorId: string };

/** Ausencias del estudio, o solo las de una instructora. Lanza si falla la BD. */
export async function listarAusencias(
  admin: SupabaseClient,
  p: { studioId: string; alcance: AlcanceAusencias },
): Promise<AusenciaFila[]> {
  let q = admin.from('instructora_ausencias')
    .select('id, instructor_id, tipo, desde, hasta, motivo')
    .eq('studio_id', p.studioId)
    .order('desde', { ascending: false });
  if (p.alcance !== 'estudio') q = q.eq('instructor_id', p.alcance.instructorId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(r => ({
    id: r.id as string,
    instructorId: r.instructor_id as string,
    tipo: r.tipo as TipoAusencia,
    desde: r.desde as string,
    hasta: r.hasta as string,
    motivo: (r.motivo as string | null) ?? null,
  }));
}

export async function crearAusencia(
  admin: SupabaseClient,
  p: { studioId: string; instructorId: string | null | undefined; tipo: unknown; desde: unknown; hasta: unknown; motivo: unknown },
): Promise<ResultadoAusencia<{ id: string; clasesAfectadas: number }>> {
  const { studioId, instructorId } = p;
  const tipo = typeof p.tipo === 'string' ? p.tipo : '';
  const desde = typeof p.desde === 'string' ? p.desde : '';
  const hasta = typeof p.hasta === 'string' ? p.hasta : '';

  if (!instructorId || !(TIPOS_AUSENCIA as readonly string[]).includes(tipo)) {
    return { ok: false, status: 400, error: 'Datos incompletos' };
  }
  if (!RE_FECHA.test(desde) || !RE_FECHA.test(hasta) || hasta < desde) {
    return { ok: false, status: 400, error: 'Fechas no válidas' };
  }

  // La instructora debe ser de SU estudio.
  const { data: instr } = await admin.from('instructores')
    .select('id, nombre').eq('id', instructorId).eq('studio_id', studioId).maybeSingle();
  if (!instr) return { ok: false, status: 404, error: 'Instructora no encontrada' };

  const fechas = dias(desde, hasta);
  if (fechas.length > MAX_DIAS) {
    return { ok: false, status: 400, error: 'El periodo es demasiado largo (máximo 1 año)' };
  }

  const id = `aus-${crypto.randomUUID()}`;
  const motivo = typeof p.motivo === 'string' ? p.motivo.trim().slice(0, 300) || null : null;
  const { error } = await admin.from('instructora_ausencias').insert({
    id, studio_id: studioId, instructor_id: instructorId, tipo, desde, hasta, motivo,
  });
  if (error) {
    console.error('[equipo:ausencias]', error.message);
    return { ok: false, status: 500, error: 'No se ha podido guardar la ausencia' };
  }

  // Materializa un bloqueo de TODO EL DÍA por fecha (hora_inicio/fin NULL).
  const bloqueos = fechas.map(f => ({
    id: `exc-${crypto.randomUUID()}`,
    studio_id: studioId, instructor_id: instructorId,
    fecha: f, hora_inicio: null, hora_fin: null, tipo: 'bloqueo', ausencia_id: id,
  }));
  const { error: errExc } = await admin.from('instructora_disponibilidad_excepciones').insert(bloqueos);
  if (errExc) {
    // I-5 (auditoría 59ª pasada, 13-sep-2026): esto era un `console.error` y
    // seguía a un 200 OK. El bloqueo materializado aquí es lo ÚNICO que ve el
    // motor de sustituciones (`rankear_candidatas` mira
    // `instructora_disponibilidad_excepciones`, nunca `instructora_ausencias`),
    // así que una ausencia sin su bloqueo deja a la instructora ELEGIBLE para
    // cubrir clases durante sus propias vacaciones — y la dueña, que la ve en
    // la lista, no tiene forma de saberlo. Clase «desplegado, en verde y sin
    // efecto».
    //
    // El insert de un array es una sola sentencia: si falla, no entró ninguna
    // fila. Se retira la ausencia recién creada para no dejar el estado a
    // medias y se devuelve error, que es lo que permite reintentar. El aviso
    // del Notification Engine todavía no se ha emitido a estas alturas.
    console.error('[equipo:ausencias] bloqueos', errExc.message);
    Sentry.captureMessage('[equipo:ausencias] no se pudo materializar el bloqueo de disponibilidad', {
      level: 'error', tags: { area: 'sustituciones' },
      extra: { studioId, instructorId, ausenciaId: id, error: errExc.message },
    });
    //
    // El propio rollback puede fallar, y por la MISMA causa (BD caída). Si
    // falla, la ausencia queda viva y sin bloqueos — justo el estado que este
    // bloque intenta evitar—, así que el mensaje no puede decir «no se ha
    // guardado»: sería un fracaso falso, y la dueña crearía una segunda
    // ausencia dejando la primera huérfana para siempre.
    const { error: errRollback } = await admin.from('instructora_ausencias')
      .delete().eq('id', id).eq('studio_id', studioId);
    if (errRollback) {
      Sentry.captureMessage('[equipo:ausencias] ausencia huérfana: sin bloqueo y sin poder retirarla', {
        level: 'error', tags: { area: 'sustituciones' },
        extra: { studioId, instructorId, ausenciaId: id, error: errRollback.message },
      });
      return {
        ok: false, status: 500,
        error: 'La ausencia se ha guardado, pero NO hemos podido bloquear esas fechas: bórrala y vuelve a crearla, o el motor de sustituciones seguirá proponiendo a esta instructora.',
      };
    }
    return {
      ok: false, status: 500,
      error: 'No se ha podido bloquear la disponibilidad de esas fechas. La ausencia no se ha guardado: vuelve a intentarlo.',
    };
  }

  // Clases YA programadas de esa instructora dentro del periodo: es lo accionable
  // (hay que cubrirlas). Se cuentan para devolverlo y para el aviso.
  //
  // `sesiones.inicio` se guarda en UTC absoluto, y el rango de la ausencia es
  // por DÍA NATURAL DE MADRID (0084/0105 ya fijaron este mismo patrón para
  // reservas). Comparar contra el literal sin zona horaria lo interpreta en
  // UTC: una clase de madrugada (p. ej. 07:00 en Madrid = 05:00 UTC en
  // verano) en el borde del periodo podía quedar fuera del recuento, o una
  // del día siguiente aún no entrado en Madrid podía colarse — dejando
  // "0 clases afectadas" cuando sí había una clase sin cubrir.
  const { data: choques } = await admin.from('sesiones')
    .select('id').eq('studio_id', studioId).eq('instructor_id', instructorId)
    .eq('cancelada', false)
    .gte('inicio', limiteDiaMadrid(desde, false)).lte('inicio', limiteDiaMadrid(hasta, true));
  const clasesAfectadas = choques?.length ?? 0;

  // Notification Engine: la dueña ve la ausencia y, sobre todo, cuántas clases
  // quedan sin cubrir en esas fechas.
  const { emitirInstructoraAusencia } = await import('@/lib/notifications/emit');
  await emitirInstructoraAusencia(admin, {
    studioId, ausenciaId: id,
    instructora: (instr.nombre as string | null) ?? 'Una instructora',
    desde, hasta, clasesAfectadas,
  });

  return { ok: true, id, clasesAfectadas };
}

/** Borra una ausencia del estudio. Con alcance de instructora, solo si es suya. */
export async function borrarAusencia(
  admin: SupabaseClient,
  p: { studioId: string; id: string; alcance: AlcanceAusencias },
): Promise<ResultadoAusencia> {
  let q = admin.from('instructora_ausencias')
    .delete().eq('id', p.id).eq('studio_id', p.studioId);
  // Solo puede borrar la SUYA — nunca la de una compañera, aunque adivine el id.
  if (p.alcance !== 'estudio') q = q.eq('instructor_id', p.alcance.instructorId);

  // .select('id') para saber si de verdad borró algo: sin esto, una
  // instructora borrando el id de otra recibía "ok:true" sin haber tocado nada.
  const { data, error } = await q.select('id');
  if (error) return { ok: false, status: 500, error: 'No se ha podido borrar' };
  if (!data || data.length === 0) return { ok: false, status: 404, error: 'Ausencia no encontrada' };
  return { ok: true };
}

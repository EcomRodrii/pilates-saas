// Especialista en Equipo — ¿está bien repartido el trabajo del equipo?
// MVP: E1 · una instructora que daba clases hace poco se ha quedado SIN ninguna
// clase asignada en las próximas semanas → hueco de horario a revisar (¿baja,
// olvido al programar, reparto desigual?). Aviso a nivel de estudio.
// P2-5: E2 · una sustitución sigue sin resolverse pasado un margen razonable
// — punto ciego original del feedback: este especialista nunca miraba
// `sustituciones`, solo `sesiones`/`instructores`.
import type { Candidata, Especialista, MemoriaEstudio, SnapshotEstudio } from '../tipos.ts';
import { confianzaCargaEquipo, confianzaSustitucionSinResolver } from '../confianza.ts';

const MS_DIA = 86400000;
const MS_HORA = 3600000;
const DIAS_FUTURO = 21;   // ventana de clases próximas
const DIAS_PASADO = 30;   // "daba clases hace poco"
// El ciclo automático de contacto por candidata dura como mucho 45 min
// (VENTANA_MAX, lib/sustituciones/ventanas.ts) por intento — este umbral es
// mucho más generoso a propósito: solo avisa cuando el motor lleva HORAS sin
// resolverlo solo, no compite con su propio ciclo de reintento.
const HORAS_SIN_RESOLVER = 3;

/** E2 · sustitución en 'contactando' pasado el plazo → REVISAR_CARGA_EQUIPO. */
function reglaE2(s: SnapshotEstudio, now: Date): Candidata[] {
  const candidatas: Candidata[] = [];
  const t = now.getTime();
  const instructorPorId = new Map(s.instructores.map(i => [i.id, i]));

  for (const sus of s.sustituciones) {
    if (sus.estado !== 'contactando') continue;
    const antiguedadMs = t - new Date(sus.creadoEn).getTime();
    if (antiguedadMs < HORAS_SIN_RESOLVER * MS_HORA) continue;

    const confianza = confianzaSustitucionSinResolver({ sinResolverTrasPlazo: true });
    if (!confianza) continue;

    const original = sus.instructorOriginalId ? instructorPorId.get(sus.instructorOriginalId) : undefined;
    const horas = Math.round(antiguedadMs / MS_HORA);
    const motivoMotor = original
      ? `La clase de ${original.nombre} sigue buscando quién la cubra desde hace ${horas}h. El motor automático no lo ha resuelto solo — puede que necesite que alguien mire el panel de sustituciones.`
      : `Hay una sustitución sin resolver desde hace ${horas}h. El motor automático no lo ha resuelto solo — revisa el panel de sustituciones.`;

    candidatas.push({
      especialista: 'EQUIPO',
      tipo: 'REVISAR_CARGA_EQUIPO',
      dedupeKey: `EQUIPO:REVISAR_CARGA_EQUIPO:SUSTITUCION:${sus.id}`,
      tituloMotor: original ? `La clase de ${original.nombre} sigue sin sustituta` : 'Sustitución sin resolver',
      motivoMotor,
      datosUsados: { sustitucionId: sus.id, horasSinResolver: horas, instructora: original?.nombre ?? '' },
      riesgo: 'PERDIDA',
      confianza,
      accion: { tipo: 'MARCAR_GESTIONADO' },
      instructorId: sus.instructorOriginalId ?? undefined,
      tiempoEstimadoMin: 5,
      expiraEnDias: 3,
      urgencia: 0.7,
      esfuerzo: 0.3,
    });
  }
  return candidatas;
}

export const equipo: Especialista = {
  id: 'EQUIPO',
  pregunta: '¿Está bien repartido el trabajo del equipo?',
  detectar(s: SnapshotEstudio, _m: MemoriaEstudio, now: Date): Candidata[] {
    const candidatas: Candidata[] = [...reglaE2(s, now)];
    const t = now.getTime();

    // Índice: nº de sesiones futuras y pasadas recientes por instructora.
    const futuras = new Map<string, number>();
    const pasadas = new Map<string, number>();
    for (const se of s.sesiones) {
      if (se.cancelada) continue;
      const inicio = new Date(se.inicio).getTime();
      if (inicio > t && inicio <= t + DIAS_FUTURO * MS_DIA) futuras.set(se.instructorId, (futuras.get(se.instructorId) ?? 0) + 1);
      else if (inicio <= t && inicio >= t - DIAS_PASADO * MS_DIA) pasadas.set(se.instructorId, (pasadas.get(se.instructorId) ?? 0) + 1);
    }

    // Solo tiene sentido si el estudio SÍ tiene clases futuras (si no hay ninguna,
    // es cierre de vacaciones, no un hueco de una instructora concreta). Esto
    // es un gate solo de E1 — E2 (sustituciones sin resolver, ya en `candidatas`)
    // no depende de si hay clases futuras programadas.
    const hayClasesFuturas = [...futuras.values()].some(v => v > 0);
    if (!hayClasesFuturas) return candidatas;

    for (const ins of s.instructores) {
      if (!ins.activo) continue;
      const clasesRecientes = pasadas.get(ins.id) ?? 0;
      const clasesProximas = futuras.get(ins.id) ?? 0;
      // Daba clases hace poco pero no tiene NINGUNA asignada por delante.
      const huecoClaro = clasesRecientes >= 2 && clasesProximas === 0;
      const confianza = confianzaCargaEquipo({ huecoClaro });
      if (!confianza) continue;

      const motivoMotor = `${ins.nombre} daba clases hasta hace nada (${clasesRecientes} en el último mes) pero no tiene ninguna asignada en las próximas ${DIAS_FUTURO / 7} semanas. ¿Se te ha pasado programarle, o hay algo que revisar?`;
      candidatas.push({
        especialista: 'EQUIPO',
        tipo: 'REVISAR_CARGA_EQUIPO',
        dedupeKey: `EQUIPO:REVISAR_CARGA_EQUIPO:${ins.id}`,
        tituloMotor: `${ins.nombre} se quedó sin clases asignadas`,
        motivoMotor,
        datosUsados: { instructora: ins.nombre, clasesRecientes, clasesProximas },
        riesgo: 'OPORTUNIDAD',
        confianza,
        accion: { tipo: 'MARCAR_GESTIONADO' },
        instructorId: ins.id,
        tiempoEstimadoMin: 5,
        expiraEnDias: 14,
        urgencia: 0.5,
        esfuerzo: 0.4,
      });
    }
    return candidatas;
  },
};

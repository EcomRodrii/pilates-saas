// Especialista en Equipo — ¿está bien repartido el trabajo del equipo?
// MVP: E1 · una instructora que daba clases hace poco se ha quedado SIN ninguna
// clase asignada en las próximas semanas → hueco de horario a revisar (¿baja,
// olvido al programar, reparto desigual?). Aviso a nivel de estudio.
import type { Candidata, Especialista, MemoriaEstudio, SnapshotEstudio } from '../tipos.ts';
import { confianzaCargaEquipo } from '../confianza.ts';

const MS_DIA = 86400000;
const DIAS_FUTURO = 21;   // ventana de clases próximas
const DIAS_PASADO = 30;   // "daba clases hace poco"

export const equipo: Especialista = {
  id: 'EQUIPO',
  pregunta: '¿Está bien repartido el trabajo del equipo?',
  detectar(s: SnapshotEstudio, _m: MemoriaEstudio, now: Date): Candidata[] {
    const candidatas: Candidata[] = [];
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
    // es cierre de vacaciones, no un hueco de una instructora concreta).
    const hayClasesFuturas = [...futuras.values()].some(v => v > 0);
    if (!hayClasesFuturas) return [];

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
        tiempoEstimadoMin: 5,
        expiraEnDias: 14,
        urgencia: 0.5,
        esfuerzo: 0.4,
      });
    }
    return candidatas;
  },
};

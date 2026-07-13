// Especialista en Marketing — ¿a quién deberíamos estar escribiendo en grupo?
// MVP: M1 · bolsa de socias inactivas / leads sin convertir suficientemente
// grande → proponer una campaña de reactivación. Cubre PREPARAR_CAMPANA, que
// existía en el catálogo sin generador. Es un aviso a nivel de estudio (la
// campaña la lanza el propietario desde Marketing), no un contacto individual.
import type { Candidata, Especialista, MemoriaEstudio, SnapshotEstudio } from '../tipos.ts';
import { construirIndices } from '../senales.ts';
import { confianzaPrepararCampana } from '../confianza.ts';

const MS_DIA = 86400000;
const MIN_PUBLICO = 5;         // por debajo de esto una campaña no compensa
const DIAS_INACTIVA = 30;      // sin asistir desde hace 30 días
const LEADS_ENTRADA = new Set(['LEAD', 'INTERESADA']);

export const marketing: Especialista = {
  id: 'MARKETING',
  pregunta: '¿A quién deberíamos estar escribiendo en grupo?',
  detectar(s: SnapshotEstudio, _m: MemoriaEstudio, now: Date): Candidata[] {
    const idx = construirIndices(s);

    const publico = new Set<string>();
    // Socias activas que llevan 30+ días sin asistir.
    for (const socio of s.socios) {
      if (!socio.activo) continue;
      const asistidas = idx.asistidasPorSocio.get(socio.id);
      const ultima = asistidas?.[0]?.creadoEn;
      if (ultima && (now.getTime() - new Date(ultima).getTime()) / MS_DIA >= DIAS_INACTIVA) publico.add(socio.id);
      // Leads sin convertir (sin suscripción activa) también son público de campaña.
      if (socio.leadStage && LEADS_ENTRADA.has(socio.leadStage) && !idx.suscripcionActivaPorSocio.has(socio.id)) publico.add(socio.id);
    }

    const n = publico.size;
    if (n < MIN_PUBLICO) return [];

    // Sin campaña reciente: ninguna campaña creada en los últimos 14 días.
    const sinCampanaReciente = !s.campanas.some(c => c.creadaEn && (now.getTime() - new Date(c.creadaEn).getTime()) / MS_DIA < 14);
    const confianza = confianzaPrepararCampana({ volumenSuficiente: n >= MIN_PUBLICO, sinCampanaReciente });
    if (!confianza) return [];

    const motivoMotor = `Tienes ${n} socias inactivas o leads sin convertir. Una campaña de reactivación bien redactada podría traer de vuelta a unas cuantas — te la puedo preparar.`;
    return [{
      especialista: 'MARKETING',
      tipo: 'PREPARAR_CAMPANA',
      dedupeKey: `MARKETING:PREPARAR_CAMPANA:${s.studioId}`,
      tituloMotor: `${n} socias para una campaña de reactivación`,
      motivoMotor,
      datosUsados: { publico: n, diasInactiva: DIAS_INACTIVA },
      riesgo: 'OPORTUNIDAD',
      confianza,
      accion: { tipo: 'MARCAR_GESTIONADO' },
      tiempoEstimadoMin: 10,
      expiraEnDias: 14,
      urgencia: Math.min(0.7, 0.4 + 0.01 * n),
      esfuerzo: 0.5,
    }];
  },
};

import type { AnalisisCapacidad } from './capacidad.ts';
import { NOMBRE_ETAPA, type EtapaVista } from './etapas.ts';
import { ANCLA_LISTO, type IdComprobacion } from './listo.ts';
import { diasParaFinEtapa, tocaRecordarFinEtapa } from './comunicaciones.ts';

export interface AlertaApertura {
  /** Único por estudio mientras está abierta (índice uq_alertas_opening_abierta). */
  tipo: string;
  severidad: 'CRITICA' | 'ALTA' | 'MEDIA' | 'BAJA';
  titulo: string;
  descripcion: string;
  href: string;
}

export interface EntradaAlertas {
  diasHastaApertura: number | null;
  analisis: AnalisisCapacidad;
  etapas: EtapaVista[];
  /** Id → activo de los planes del estudio. */
  planActivo: Map<string, boolean>;
  objetivoPreventa: number;
  /** Imprescindibles de «¿lista para abrir?» que no están OK (lib/opening/listo.ts). */
  pendientesListo?: IdComprobacion[];
  /** Día del estudio (YYYY-MM-DD), para los plazos de las etapas. */
  hoy?: string;
}

/** A partir de cuántos días antes de abrir tiene sentido vigilar horario y preventa. */
export const DIAS_VIGILANCIA_HORARIO = 21;
export const DIAS_VIGILANCIA_PREVENTA = 14;
export const DIAS_VIGILANCIA_LISTO = 7;

const pct = (x: number) => `${Math.round(x * 100)} %`;
const dias = (n: number) => (n === 1 ? '1 día' : `${n} días`);

/**
 * Qué merece avisar a la propietaria que abre. Cada alerta lleva su cifra y
 * adónde ir: un aviso sin respaldo en pantalla no se enseña.
 */
export function detectarAlertas(e: EntradaAlertas): AlertaApertura[] {
  const out: AlertaApertura[] = [];
  const d = e.diasHastaApertura;
  const a = e.analisis;

  if (d !== null && d <= DIAS_VIGILANCIA_HORARIO && a.riesgo === 'SIN_OFERTA') {
    out.push({
      tipo: 'SIN_HORARIO',
      severidad: 'CRITICA',
      titulo: 'Aún no hay clases publicadas',
      descripcion: d >= 0
        ? `Abres en ${dias(d)} y no hay horario en las próximas ${Math.round(a.ventana.dias / 7)} semanas: nadie puede reservar.`
        : `No hay horario en las próximas ${Math.round(a.ventana.dias / 7)} semanas: nadie puede reservar.`,
      href: '/calendario',
    });
  }

  // Las clases ya las avisa SIN_HORARIO: no se cuentan dos veces.
  const pendientes = (e.pendientesListo ?? []).filter(id => !(id === 'clases' && out.some(x => x.tipo === 'SIN_HORARIO')));
  if (d !== null && d <= DIAS_VIGILANCIA_LISTO && pendientes.length > 0) {
    out.push({
      tipo: 'APERTURA_NO_LISTA',
      severidad: 'CRITICA',
      titulo: d >= 0 ? `Abres en ${dias(d)} y aún falta algo imprescindible` : 'Aún falta algo imprescindible para funcionar',
      // Sin cifra: la alerta queda abierta mientras falte algo y la lista cambia.
      descripcion: 'Mira «¿Lista para abrir?» en Inicio: te dice qué falta y dónde se arregla.',
      href: `/dashboard#${ANCLA_LISTO}`,
    });
  }

  if (a.riesgo === 'ROJO' && a.ocupacionPrevista !== null) {
    out.push({
      tipo: 'CAPACIDAD_LLENA',
      severidad: 'ALTA',
      titulo: 'Tus clases se van a llenar',
      descripcion: `Ocupación prevista ${pct(a.ocupacionPrevista)}: ${a.demandaComprometida} plazas para ${a.capacidadPublicada} publicadas. Publica más horarios antes de que alguien se quede fuera.`,
      href: '/calendario',
    });
  }

  if (d !== null && d > 0 && d <= DIAS_VIGILANCIA_PREVENTA && a.ocupacionPrevista !== null && a.ocupacionPrevista < e.objetivoPreventa) {
    out.push({
      tipo: 'PREVENTA_LENTA',
      severidad: 'MEDIA',
      titulo: 'La preventa va lenta',
      descripcion: `Quedan ${dias(d)} y tus cuotas cubren el ${pct(a.ocupacionPrevista)} de las plazas; tu objetivo es el ${pct(e.objetivoPreventa)}.`,
      href: '/productos',
    });
  }

  // Propone, no envía: el recordatorio lo escribe y lo manda la propietaria
  // desde la etapa (Mensajería prerrellenada). Se resuelve sola al cerrarse.
  for (const et of e.hoy ? e.etapas.filter(x => tocaRecordarFinEtapa(x, e.hoy!)) : []) {
    const d = diasParaFinEtapa(et, e.hoy!)!;
    const quedan = et.limitePlazas !== null ? ` y quedan ${et.limitePlazas - et.ventas} plazas` : '';
    out.push({
      tipo: `ETAPA_TERMINA:${et.id}`,
      severidad: 'BAJA',
      titulo: `La etapa ${NOMBRE_ETAPA[et.etapa]} termina ${d === 0 ? 'hoy' : d === 1 ? 'mañana' : `en ${dias(d)}`}`,
      descripcion: `Aún no se ha llenado${quedan}. Si quieres, recuérdaselo a tus interesadas: el correo ya está escrito.`,
      href: '/dashboard#etapas-lanzamiento',
    });
  }

  for (const et of e.etapas) {
    const planSigue = et.planId !== null && e.planActivo.get(et.planId) === true;
    if (et.cerrada && et.cerradaMotivo === 'CUPO' && et.alCompletar === 'AVISAR' && planSigue) {
      out.push({
        tipo: `ETAPA_LLENA:${et.id}`,
        severidad: 'MEDIA',
        titulo: `La etapa ${NOMBRE_ETAPA[et.etapa]} se ha llenado`,
        descripcion: `${et.ventas} de ${et.limitePlazas} vendidas y ${et.planNombre ? `«${et.planNombre}»` : 'el plan'} sigue a la venta. Desactívalo si no quieres vender más a ese precio.`,
        href: '/productos',
      });
    }
  }

  return out;
}

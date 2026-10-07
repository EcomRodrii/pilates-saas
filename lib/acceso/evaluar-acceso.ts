// ¿Puede entrar a ESTA clase? — la decisión del control de acceso, sin I/O.
//
// El QR solo dice QUIÉN es. Esto decide si entra, y no inventa ninguna regla:
// lee el estado ACTUAL de su reserva para la clase que se está comprobando.
// Eso basta porque en Tentare todo lo demás ya se decidió al reservar:
//
//   · el bono o la cuota se descuentan dentro de `reservar_plaza` (una reserva
//     CONFIRMADA ya es «su plan cubre esta clase»);
//   · la plaza fija se materializa en reservas CONFIRMADA (`res-pf-…`) solo si
//     su cuota la cubre (`materializar_plazas_fijas_interno`);
//   · la aprobación manual, la lista de espera y la cancelación son estados de
//     esa misma reserva.
//
// Volver a calcular aquí si «tiene bono» sería un segundo motor de reservas que
// tarde o temprano diría otra cosa que el primero. Tener bono sin reserva NO da
// acceso, igual que no lo da en el resto de Tentare.
//
// Tres salidas (decisión del fundador, 27-sep):
//   🟢 PERMITIDO  reserva confirmada o plaza fija.
//   🟠 REVISAR    pendiente de aprobación, clienta desactivada o con impago
//                 (cuando el estudio bloquea por impago): decide la persona.
//   🔴 DENEGADO   sin reserva, cancelada, lista de espera, otra clase, clase
//                 cancelada o terminada.
//
// Import relativo con extensión `.ts`: lo prueba `node --test`.

import { esReservaPlazaFija } from '../reservas/plaza-fija-id.ts';

/** Minutos antes del inicio en que una clase ya es «la de ahora» en la puerta.
 *  Los mismos que abren la lista de la instructora y la puerta de Kisi. */
export const MINUTOS_ANTES_DE_EMPEZAR = 60;

export type Veredicto = 'PERMITIDO' | 'REVISAR' | 'DENEGADO';

export type MotivoAcceso =
  // 🟢
  | 'RESERVA_CONFIRMADA' | 'PLAZA_FIJA' | 'YA_ENTRO'
  // 🟠
  | 'PENDIENTE_APROBACION' | 'CLIENTA_DESACTIVADA' | 'IMPAGO' | 'VARIAS_CLASES'
  // 🔴
  | 'SIN_RESERVA' | 'RESERVA_CANCELADA' | 'LISTA_ESPERA' | 'NO_ASISTIO' | 'RESERVA_OTRA_CLASE'
  | 'CLASE_CANCELADA' | 'CLASE_TERMINADA' | 'CLASE_NO_EMPEZADA' | 'SIN_CLASE_AHORA'
  | 'QR_NO_RECONOCIDO' | 'QR_SUSTITUIDO' | 'QR_OTRO_ESTUDIO'
  // Tras decidir un 🟠
  | 'APROBADA_SIN_PLAZA' | 'CLASE_YA_EMPEZADA' | 'NO_PERMITIDO';

export type TipoAcceso = 'PLAZA_FIJA' | 'RESERVA' | 'RECUPERACION' | 'CLASE_DE_PRUEBA';

/** Estados de la alumna que no impiden entrar pero piden que alguien mire. */
export type AvisoRevisar = 'CLIENTA_DESACTIVADA' | 'IMPAGO';

export interface ClaseEnPuerta {
  id: string;
  inicio: string;
  fin: string;
  cancelada: boolean;
}

export interface ReservaEnPuerta {
  id: string;
  sesionId: string;
  estado: string;
  checkInEn: string | null;
  creadoEn: string | null;
  /** La usó una recuperación (`recuperaciones.usada_en_reserva_id`). */
  esRecuperacion: boolean;
  /** Pagada con la clase de prueba (`sus-prueba-…`). */
  esPrueba: boolean;
}

export interface EntradaAcceso {
  ahoraMs: number;
  /** La clase que se comprueba cuando ya se sabe: la de la instructora, o la
   *  que recepción ha fijado. `null` = «cualquiera de las de ahora». */
  claseElegida: ClaseEnPuerta | null;
  /** Las clases del estudio de ahora, canceladas incluidas (para poder decir
   *  «esa clase se canceló»). */
  clasesAhora: ClaseEnPuerta[];
  /** Todas sus reservas en esas clases, en cualquier estado. */
  reservas: ReservaEnPuerta[];
  socia: { activa: boolean; conImpago: boolean };
}

export interface ResultadoAcceso {
  veredicto: Veredicto;
  motivo: MotivoAcceso;
  clase: ClaseEnPuerta | null;
  reserva: ReservaEnPuerta | null;
  tipoAcceso: TipoAcceso | null;
  /** Tiene plaza en OTRA clase de ahora: a dónde mandarla. */
  otraClase: ClaseEnPuerta | null;
  /** VARIAS_CLASES: entre cuáles elegir. */
  candidatas: ClaseEnPuerta[];
  /** Desactivada / impago, aunque el motivo principal sea otro. */
  avisos: AvisoRevisar[];
  /** Si ya había entrado a esta clase, cuándo. */
  yaEntroEn: string | null;
}

const MIN = 60_000;

/** ¿Es una de las clases «de ahora»? Desde una hora antes hasta que termina. */
export function claseEsDeAhora(c: Pick<ClaseEnPuerta, 'inicio' | 'fin'>, ahoraMs: number): boolean {
  return ahoraMs >= Date.parse(c.inicio) - MINUTOS_ANTES_DE_EMPEZAR * MIN && ahoraMs <= Date.parse(c.fin);
}

/** Las que le dejan entrar o casi: ocupan su sitio en esa clase. */
const CON_SITIO = new Set(['CONFIRMADA', 'ASISTIDA', 'PENDIENTE_APROBACION']);

/**
 * Su reserva en esa clase. Puede haber varias filas (canceló y volvió a
 * reservar), pero solo una viva: el índice `uq_reserva_activa_socio_sesion`
 * cubre CONFIRMADA, LISTA_ESPERA, ASISTIDA y PENDIENTE_APROBACION. Si no hay
 * viva, se enseña la que más explica: no vino, y si no, la última cancelada.
 */
export function reservaEnClase(reservas: readonly ReservaEnPuerta[], sesionId: string): ReservaEnPuerta | null {
  const suyas = reservas.filter(r => r.sesionId === sesionId);
  const viva = suyas.find(r => CON_SITIO.has(r.estado) || r.estado === 'LISTA_ESPERA');
  if (viva) return viva;
  const noVino = suyas.find(r => r.estado === 'NO_ASISTIO');
  if (noVino) return noVino;
  return suyas.filter(r => r.estado === 'CANCELADA')
    .sort((a, b) => (b.creadoEn ?? '').localeCompare(a.creadoEn ?? ''))[0] ?? null;
}

export function tipoDeAcceso(r: Pick<ReservaEnPuerta, 'id' | 'esRecuperacion' | 'esPrueba'>): TipoAcceso {
  // El único rastro de que viene de una plaza fija es el id (`reservas` no
  // guarda el origen): lo pone `materializar_plazas_fijas_interno`.
  if (esReservaPlazaFija(r.id)) return 'PLAZA_FIJA';
  if (r.esRecuperacion) return 'RECUPERACION';
  if (r.esPrueba) return 'CLASE_DE_PRUEBA';
  return 'RESERVA';
}

const porInicio = (a: ClaseEnPuerta, b: ClaseEnPuerta) => a.inicio.localeCompare(b.inicio);

function resultado(parcial: Partial<ResultadoAcceso> & Pick<ResultadoAcceso, 'veredicto' | 'motivo'>): ResultadoAcceso {
  return {
    clase: null, reserva: null, tipoAcceso: null, otraClase: null, candidatas: [], avisos: [], yaEntroEn: null,
    ...parcial,
  };
}

/** Cuánto explica cada estado cuando NO tiene sitio: para elegir de qué clase hablar. */
const PESO_SIN_SITIO: Record<string, number> = { LISTA_ESPERA: 3, NO_ASISTIO: 2, CANCELADA: 1 };

export function evaluarAcceso(e: EntradaAcceso): ResultadoAcceso {
  const avisos: AvisoRevisar[] = [];
  if (!e.socia.activa) avisos.push('CLIENTA_DESACTIVADA');
  if (e.socia.conImpago) avisos.push('IMPAGO');

  const deAhora = e.clasesAhora.filter(c => claseEsDeAhora(c, e.ahoraMs)).sort(porInicio);
  const conSitio = (c: ClaseEnPuerta) => {
    const r = reservaEnClase(e.reservas, c.id);
    return !!r && CON_SITIO.has(r.estado) && !c.cancelada;
  };

  // ── ¿De qué clase hablamos? ────────────────────────────────────────────────
  let clase = e.claseElegida;
  if (!clase) {
    const suyas = deAhora.filter(conSitio);
    if (suyas.length > 1) {
      return resultado({ veredicto: 'REVISAR', motivo: 'VARIAS_CLASES', candidatas: suyas, avisos });
    }
    if (suyas.length === 1) {
      clase = suyas[0];
    } else {
      if (deAhora.length === 0) return resultado({ veredicto: 'DENEGADO', motivo: 'SIN_CLASE_AHORA', avisos });
      // Sin sitio en ninguna: se habla de la clase en la que tuvo algo (canceló,
      // está en espera, no vino), que es lo que ella viene a reclamar.
      const conAlgo = deAhora
        .map(c => ({ c, r: reservaEnClase(e.reservas, c.id) }))
        .filter((x): x is { c: ClaseEnPuerta; r: ReservaEnPuerta } => !!x.r)
        .sort((a, b) => (PESO_SIN_SITIO[b.r.estado] ?? 0) - (PESO_SIN_SITIO[a.r.estado] ?? 0));
      if (conAlgo.length === 0) return resultado({ veredicto: 'DENEGADO', motivo: 'SIN_RESERVA', avisos });
      clase = conAlgo[0].c;
    }
  }

  // ── Esa clase ──────────────────────────────────────────────────────────────
  const reserva = reservaEnClase(e.reservas, clase.id);
  const otraClase = deAhora.find(c => c.id !== clase.id && conSitio(c)) ?? null;
  const base = { clase, reserva, avisos, otraClase };
  const denegar = (motivo: MotivoAcceso) => resultado({ ...base, veredicto: 'DENEGADO', motivo });

  if (clase.cancelada) return denegar('CLASE_CANCELADA');
  if (e.ahoraMs > Date.parse(clase.fin)) return denegar('CLASE_TERMINADA');
  if (e.ahoraMs < Date.parse(clase.inicio) - MINUTOS_ANTES_DE_EMPEZAR * MIN) return denegar('CLASE_NO_EMPEZADA');
  if (!reserva) return denegar(otraClase ? 'RESERVA_OTRA_CLASE' : 'SIN_RESERVA');

  switch (reserva.estado) {
    case 'CANCELADA': return denegar('RESERVA_CANCELADA');
    case 'LISTA_ESPERA': return denegar('LISTA_ESPERA');
    case 'NO_ASISTIO': return denegar('NO_ASISTIO');
    case 'PENDIENTE_APROBACION':
      return resultado({ ...base, veredicto: 'REVISAR', motivo: 'PENDIENTE_APROBACION', tipoAcceso: tipoDeAcceso(reserva) });
    case 'ASISTIDA':
      // Ya dentro: lo que había que decidir se decidió al entrar. Se dice cuándo,
      // porque un segundo escaneo de otra persona es la pista de un QR prestado.
      return resultado({
        ...base, veredicto: 'PERMITIDO', motivo: 'YA_ENTRO', tipoAcceso: tipoDeAcceso(reserva), yaEntroEn: reserva.checkInEn,
      });
    case 'CONFIRMADA': {
      const tipoAcceso = tipoDeAcceso(reserva);
      if (avisos.length > 0) return resultado({ ...base, veredicto: 'REVISAR', motivo: avisos[0], tipoAcceso });
      return resultado({
        ...base, veredicto: 'PERMITIDO', motivo: tipoAcceso === 'PLAZA_FIJA' ? 'PLAZA_FIJA' : 'RESERVA_CONFIRMADA', tipoAcceso,
      });
    }
    default:
      return denegar('SIN_RESERVA');
  }
}

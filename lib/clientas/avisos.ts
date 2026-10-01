// El AVISO de una clienta: como mucho uno, y siempre con su motivo.
//
// No se calcula aquí ningún riesgo propio: el aviso es la recomendación que el
// Centro de Control ya tiene abierta sobre ella, con las mismas palabras (el
// mismo motor, no una segunda opinión), o un hecho de dinero que no necesita
// motor —un recibo suyo sin cobrar—. Sin puntuaciones de 0 a 100: un nombre
// corto para la fila y, al lado, el motivo entero.
//
// Puro: se prueba con `node --test`.

export interface AvisoClienta {
  /** Dos o tres palabras para la fila: «Viene menos», «Prueba sin comprar». */
  etiqueta: string;
  /** El motivo entero, en palabras de la propietaria. */
  motivo: string;
  /** Tiene que ver con dinero: solo lo ven quienes cobran. */
  dinero: boolean;
  /** De dónde sale, para poder ir a decidirlo. */
  origen: 'CENTRO_DE_CONTROL' | 'COBROS';
  /** Desde cuándo (ISO o 'YYYY-MM-DD'): un contacto apuntado después lo da por atendido. */
  desde: string | null;
  /** La recomendación del Centro de Control de la que sale (para enlazarle un seguimiento). */
  recomendacionId?: string | null;
}

/** Lo corto de cada recomendación del Centro de Control que va sobre UNA clienta. */
const ETIQUETA_POR_TIPO: Record<string, { etiqueta: string; dinero?: boolean }> = {
  RECUPERAR_SOCIA: { etiqueta: 'Viene menos' },
  ENVIAR_REACTIVACION: { etiqueta: 'Para recuperar' },
  CONGELAR_MEMBRESIA: { etiqueta: 'Paga y no viene' },
  RIESGO_RESERVA_FALLIDA: { etiqueta: 'No consigue reservar' },
  CONVERTIR_PRUEBA: { etiqueta: 'Prueba sin comprar' },
  CONTACTAR_LEAD: { etiqueta: 'Sin contestar' },
  IMPULSAR_ONBOARDING: { etiqueta: 'Arranque flojo' },
  PROPONER_RENOVACION_BONO: { etiqueta: 'Bono por acabar' },
  PROPONER_SUSCRIPCION_MENSUAL: { etiqueta: 'Le conviene la cuota' },
  RECUPERAR_PAGOS: { etiqueta: 'Recibo sin cobrar', dinero: true },
  COBRAR_PENDIENTE: { etiqueta: 'Recibo sin cobrar', dinero: true },
};

export interface RecomendacionSobreClienta {
  id?: string;
  tipo: string;
  titulo: string;
  motivo: string;
  socioId: string | null;
  score: number;
  creadoEn?: string | null;
}

/**
 * La recomendación más importante de cada clienta (la de más `score`, el mismo
 * orden del Centro de Control). Las que no van sobre una clienta concreta, o
 * de un tipo que no tiene sentido en su fila, no cuentan.
 */
export function avisosDelCentroDeControl(recomendaciones: readonly RecomendacionSobreClienta[]): Map<string, AvisoClienta> {
  const mejor = new Map<string, RecomendacionSobreClienta>();
  for (const r of recomendaciones) {
    if (!r.socioId || !ETIQUETA_POR_TIPO[r.tipo]) continue;
    const previa = mejor.get(r.socioId);
    if (!previa || r.score > previa.score) mejor.set(r.socioId, r);
  }
  const avisos = new Map<string, AvisoClienta>();
  for (const [socioId, r] of mejor) {
    const e = ETIQUETA_POR_TIPO[r.tipo];
    avisos.set(socioId, {
      etiqueta: e.etiqueta, motivo: r.motivo || r.titulo, dinero: e.dinero === true, origen: 'CENTRO_DE_CONTROL',
      desde: r.creadoEn ?? null, ...(r.id ? { recomendacionId: r.id } : {}),
    });
  }
  return avisos;
}

export interface ReciboParaAviso {
  /** `null` en una venta de mostrador sin clienta: no es aviso de nadie. */
  socioId: string | null;
  estado: string;
  importe: number;
  fechaVencimiento: string | null;
}

const euros = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(2).replace('.', ',')} €`;

/**
 * Recibos suyos que ya deberían estar cobrados: FALLIDO, o PENDIENTE con el
 * vencimiento pasado. `hoyISO`: 'YYYY-MM-DD' del estudio.
 */
export function avisosDeCobro(recibos: readonly ReciboParaAviso[], hoyISO: string): Map<string, AvisoClienta> {
  const deuda = new Map<string, { n: number; total: number; fallido: boolean; desde: string | null }>();
  for (const r of recibos) {
    if (!r.socioId) continue;
    const vencido = r.estado === 'FALLIDO' || (r.estado === 'PENDIENTE' && !!r.fechaVencimiento && r.fechaVencimiento.slice(0, 10) < hoyISO);
    if (!vencido) continue;
    const d = deuda.get(r.socioId) ?? { n: 0, total: 0, fallido: false, desde: null };
    d.n++;
    d.total += Number(r.importe) || 0;
    d.fallido ||= r.estado === 'FALLIDO';
    const venc = r.fechaVencimiento?.slice(0, 10) ?? null;
    if (venc && (!d.desde || venc < d.desde)) d.desde = venc;
    deuda.set(r.socioId, d);
  }
  const avisos = new Map<string, AvisoClienta>();
  for (const [socioId, d] of deuda) {
    const motivo = d.n === 1
      ? `Tiene un recibo de ${euros(d.total)} sin cobrar${d.fallido ? ': el cobro falló' : ''}.`
      : `Tiene ${d.n} recibos sin cobrar (${euros(d.total)}).`;
    avisos.set(socioId, { etiqueta: 'Recibo sin cobrar', motivo, dinero: true, origen: 'COBROS', desde: d.desde });
  }
  return avisos;
}

/**
 * El aviso que enseña su fila: el del Centro de Control si hay uno, y si no, el
 * de cobro (solo para quien cobra). Como mucho uno.
 */
export function avisoDeClienta(
  socioId: string,
  delCentro: ReadonlyMap<string, AvisoClienta>,
  deCobro: ReadonlyMap<string, AvisoClienta>,
  veDinero: boolean,
): AvisoClienta | null {
  const c = delCentro.get(socioId);
  if (c && (!c.dinero || veDinero)) return c;
  return veDinero ? deCobro.get(socioId) ?? null : null;
}

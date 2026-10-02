// ─────────────────────────────────────────────────────────────────────────────
// «Marcar cobrado» desde el panel: el contrato entre la pantalla y el servidor.
//
// Hasta el PR 3 del dueño único el panel marcaba el recibo COBRADO desde el
// NAVEGADOR (`dbMarcarCobrado`/`dbUpdateRecibosBatch`), sellaba la factura con
// otra llamada, renovaba el bono con otra y daba los créditos con otra. Cada una
// podía fallar por separado, el cobro masivo guardaba la fecha en UTC y sellaba
// sin esperar. Ahora lo hace `POST /api/cobros/marcar-cobrado` con
// `confirmarCobro(origen: 'manual')`, y la pantalla solo cambia con su respuesta.
//
// Aquí vive lo que no necesita red ni BD, para fijarlo con `node --test`: qué se
// acepta en la petición, cómo se traduce cada desenlace, qué código HTTP sale y
// cómo lee la pantalla la respuesta (incluida la que no llega).
//
// Sin dependencias de servidor: lo importan la ruta Y el contexto del panel.
// ─────────────────────────────────────────────────────────────────────────────
import type { MetodoCobro } from '../types.ts';
import type { ResultadoEscritura } from '../errores.ts';
import type { ResultadoConfirmarCobro } from '../billing/confirmar-cobro.ts';
import {
  cobroManualDeRecibo, penalizacionDelRecibo, TEXTO_PENALIZACION_ANULADA,
} from '../billing/penalizacion-aprobar-reglas.ts';
import { fraseSaltados } from './texto-cobro-en-lote.ts';
import { facturaIdManual } from '../billing/cobro-confirmado-reglas.ts';

/**
 * Cómo se puede marcar un cobro a mano: exactamente los botones de «¿Cómo lo has
 * cobrado?» (`components/cobros/dialogo-metodo-cobro.tsx`), más `null` para
 * «sin especificar».
 *
 * SEPA queda fuera a propósito: un adeudo lo confirma el banco, y marcarlo a mano
 * escribiría `sepa_estado = 'succeeded'` sin que nadie lo haya liquidado.
 */
export const METODOS_COBRO_MANUAL = ['EFECTIVO', 'TARJETA', 'BIZUM', 'TRANSFERENCIA'] as const satisfies readonly MetodoCobro[];
export type MetodoCobroManual = (typeof METODOS_COBRO_MANUAL)[number];

/** Tope por petición: se procesan en serie y cada uno puede sellar una factura. */
export const MAX_RECIBOS_POR_PETICION = 50;

/**
 * Cuántos manda el panel en cada petición. Por debajo del tope para que una
 * petición no se acerque al límite de duración de la función y para que la barra
 * del cobro masivo avance.
 */
export const RECIBOS_POR_LOTE_PANEL = 10;

// Ids de recibo: `rec-<uid>`, `rec-renov-…`, uuids de importación. Nada que no
// sea esto viaja a un filtro PostgREST.
//
// Y con un largo máximo que no es arbitrario: la factura de este canal se llama
// `fac-manual-<recibo>` y quien la sella acepta ids de hasta 64 caracteres
// (`sellar-factura-server.ts`). Un recibo más largo se cobraría y su factura no
// se sellaría nunca. Hoy el más largo mide 50; el tope solo cierra el caso latente.
const LIMITE_ID_FACTURA = 64;
export const LONGITUD_MAXIMA_ID_RECIBO = LIMITE_ID_FACTURA - facturaIdManual('').length;
const ID_RECIBO = new RegExp(`^[A-Za-z0-9_-]{1,${LONGITUD_MAXIMA_ID_RECIBO}}$`);

export interface PeticionMarcarCobrado {
  reciboIds: string[];
  metodo: MetodoCobroManual | null;
  /**
   * `banco`: «El banco lo ha cobrado», el cierre de lo que salió en una remesa
   * (origen `banco` de `confirmarCobro`). El método no lo dice quien pulsa: es
   * un adeudo SEPA, y lo pone el servidor.
   */
  canal: 'mostrador' | 'banco';
  /**
   * Cobro de varios a la vez («Cobrar varias», «Cobrar todos», «Cobrar pendientes»):
   * no se cobra un recibo con un cobro en marcha —la clienta pagando online, un
   * cobro en el datáfono, un reintento automático programado—. Uno a uno sí, a
   * propósito: es quien cobra quien sabe que le ha pagado.
   */
  lote: boolean;
  /**
   * «Hacerle factura»: un cobro en efectivo no saca factura solo; con esto, sí, y la
   * emite el servidor al cobrar. Solo en el mostrador, de UN recibo y en efectivo.
   */
  conFactura: boolean;
}

export function esMetodoCobroManual(m: unknown): m is MetodoCobroManual {
  return typeof m === 'string' && (METODOS_COBRO_MANUAL as readonly string[]).includes(m);
}

/** Valida el cuerpo. Los ids repetidos se procesan una vez. */
export function parsearPeticionMarcarCobrado(
  cuerpo: unknown,
): { ok: true; peticion: PeticionMarcarCobrado } | { ok: false; error: string } {
  if (!cuerpo || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) {
    return { ok: false, error: 'Petición mal formada' };
  }
  const { reciboIds, metodo, canal, lote, conFactura } = cuerpo as { reciboIds?: unknown; metodo?: unknown; canal?: unknown; lote?: unknown; conFactura?: unknown };
  if (!Array.isArray(reciboIds) || reciboIds.length === 0) {
    return { ok: false, error: 'Falta el recibo' };
  }
  if (!reciboIds.every((id): id is string => typeof id === 'string' && ID_RECIBO.test(id))) {
    return { ok: false, error: 'Recibo no válido' };
  }
  const unicos = [...new Set(reciboIds)];
  if (unicos.length > MAX_RECIBOS_POR_PETICION) {
    return { ok: false, error: `Como mucho ${MAX_RECIBOS_POR_PETICION} recibos por petición` };
  }
  if (canal !== undefined && canal !== 'mostrador' && canal !== 'banco') {
    return { ok: false, error: 'Canal de cobro no admitido' };
  }
  if (canal === 'banco') {
    // Lo cobró el banco: el método es el adeudo, y no lo elige quien pulsa.
    if (metodo !== undefined && metodo !== null) return { ok: false, error: 'Lo cobrado por el banco no lleva método' };
    if (conFactura !== undefined) return { ok: false, error: 'Lo cobrado por el banco no lleva «Hacerle factura»' };
    return { ok: true, peticion: { reciboIds: unicos, metodo: null, canal: 'banco', lote: lote === true, conFactura: false } };
  }
  if (metodo !== undefined && metodo !== null && !esMetodoCobroManual(metodo)) {
    return { ok: false, error: 'Método de cobro no admitido' };
  }
  if (conFactura !== undefined && conFactura !== false) {
    if (conFactura !== true || metodo !== 'EFECTIVO' || unicos.length !== 1 || lote === true) {
      return { ok: false, error: '«Hacerle factura» es para un cobro en efectivo de un solo recibo' };
    }
  }
  return { ok: true, peticion: { reciboIds: unicos, metodo: metodo ?? null, canal: 'mostrador', lote: lote === true, conFactura: conFactura === true } };
}

export const RESULTADOS_MARCADO = ['aplicada', 'ya_estaba', 'no_cobrable', 'no_encontrado', 'penalizacion_anulada', 'error'] as const;
export type ResultadoMarcado = (typeof RESULTADOS_MARCADO)[number];

export interface ResultadoReciboMarcado {
  reciboId: string;
  resultado: ResultadoMarcado;
  /** `false` solo si ESTA petición cobró y la factura quedó sin sellar (se reintenta sola). */
  selladoOk: boolean;
  numeroFactura?: string;
  /** `true` solo si ESTA petición cobró y no pudo entregar el plan (bono o mensual): hay que renovarlo a mano. */
  renovacionFallida?: boolean;
  error?: string;
}

export const MENSAJE_YA_ESTABA = 'Ya estaba cobrado.';

/** En un cobro de varios, el recibo que ya tiene un cobro en marcha no se cobra. */
export const MENSAJE_COBRO_EN_MARCHA_LOTE =
  'Tiene un cobro en marcha (pago online, datáfono o reintento automático): no se ha cobrado. Si de verdad te ha pagado, cóbralo uno a uno.';

/** Un recibo que no se cobra por una regla del propio lote, con el motivo. */
export function resultadoNoCobrable(reciboId: string, error: string): ResultadoReciboMarcado {
  return { reciboId, resultado: 'no_cobrable', selladoOk: true, error };
}

/** Cobrado, pero el plan no se entregó. Antes lo avisaba el navegador; ahora lo dice el servidor. */
export const MENSAJE_COBRADO_SIN_RENOVAR =
  'Cobro registrado, pero no se ha podido renovar el plan de la clienta. Renuévalo a mano desde su ficha.';

function mensajeNoCobrable(estado: string | null | undefined): string {
  // El único que no es «ya no hay nada que cobrar»: hay dinero en camino y
  // marcarlo a mano encima es la puerta al doble cobro.
  if (estado === 'EN_CURSO') {
    return 'Este recibo tiene un cobro en curso (banco o tarjeta). Espera a que se resuelva antes de marcarlo a mano.';
  }
  return `Este recibo ya no se puede cobrar${estado ? ` (estado: ${estado})` : ''}.`;
}

/** Lo que devuelve `confirmarCobro`, en el idioma de la respuesta HTTP. */
export function resultadoDeConfirmacion(reciboId: string, r: ResultadoConfirmarCobro): ResultadoReciboMarcado {
  if (r.ok) {
    if (r.transicion === 'aplicada') {
      return {
        reciboId, resultado: 'aplicada', selladoOk: r.selladoOk,
        ...(r.numeroFactura ? { numeroFactura: r.numeroFactura } : {}),
        ...(r.renovacionFallida ? { renovacionFallida: true } : {}),
      };
    }
    if (r.transicion === 'ya_estaba') return { reciboId, resultado: 'ya_estaba', selladoOk: true };
    // `devuelto` exige un cargo entrante y a mano no lo hay: no debería darse.
    // Si se diera, no es un cobro.
    return { reciboId, resultado: 'no_cobrable', selladoOk: true, error: mensajeNoCobrable('DEVUELTO') };
  }
  switch (r.codigo) {
    case 'NO_ENCONTRADO':
      return { reciboId, resultado: 'no_encontrado', selladoOk: true, error: 'No se encuentra ese recibo en tu estudio.' };
    case 'NO_COBRABLE':
      return { reciboId, resultado: 'no_cobrable', selladoOk: true, error: mensajeNoCobrable(r.estado) };
    case 'PERSISTENCIA':
      // El compare-and-set falló o no se pudo releer. NO se afirma que no se escribió
      // nada: un corte de red o un timeout puede llegar después de que la base de datos
      // guardara. Quien cobra comprueba el recibo antes de volver a intentarlo.
      return { reciboId, resultado: 'error', selladoOk: true, error: 'No se ha podido confirmar el cobro. Comprueba el recibo antes de volver a cobrarlo.' };
  }
}

// ── Penalizaciones anuladas: no se cobran, y no es un fallo ─────────────────
//
// El trigger que anula una penalización (`OMITIDA_*`) o la reembolsa no toca su
// recibo: hasta que el barrido del cron lo suelta sigue PENDIENTE, y en el
// mostrador aparecería como una deuda más. Esta guardia estaba en el NAVEGADOR
// (`recibosDePenalizacionAnulada`, que leía `penalizaciones` con la sesión del
// personal); al pasar el cobro al servidor se traslada aquí, con la MISMA regla
// pura (`cobroManualDeRecibo`, contexto `'mostrador'`).
//
// No es un error: quien cobra un lote tiene que ver «2 cobrados, 1 no (12 €)» y no
// un fallo rojo, y el importe que no va tiene que saberse para no cobrárselo a la
// alumna a mano. Por eso tiene su propio resultado.

/** Ids de penalización de los recibos `rec-penaliz-*` de la lista (los demás no tienen). */
export function penalizacionesDeLosRecibos(reciboIds: readonly string[]): string[] {
  return [...new Set(reciboIds.map(penalizacionDelRecibo).filter((id): id is string => !!id))];
}

/**
 * De `reciboIds`, cuáles no se cobran por ser de una penalización anulada o
 * reembolsada. `estados` = estado de cada penalización por su id, o `null` si no
 * se pudo leer: entonces se deja cobrar (hay una persona delante de la alumna, y
 * parar el cobro por un fallo de lectura deja sin cobrar cuotas reales por un caso
 * raro) y se devuelve en `sinComprobar` para que quien llama lo registre.
 */
export function recibosDePenalizacionAnulada(
  reciboIds: readonly string[], estados: ReadonlyMap<string, string> | null,
): { bloqueados: Set<string>; sinComprobar: string[] } {
  const bloqueados = new Set<string>();
  const sinComprobar: string[] = [];
  for (const reciboId of reciboIds) {
    const penalizacionId = penalizacionDelRecibo(reciboId);
    const lectura = estados
      ? { ok: true as const, estado: (penalizacionId && estados.get(penalizacionId)) || null }
      : { ok: false as const };
    const veredicto = cobroManualDeRecibo(reciboId, lectura, 'mostrador');
    if (!veredicto.ok) bloqueados.add(reciboId);
    else if (veredicto.sinComprobar) sinComprobar.push(reciboId);
  }
  return { bloqueados, sinComprobar };
}

export function resultadoPenalizacionAnulada(reciboId: string): ResultadoReciboMarcado {
  return { reciboId, resultado: 'penalizacion_anulada', selladoOk: true, error: TEXTO_PENALIZACION_ANULADA };
}

/** Un fallo inesperado procesando UN recibo no tumba los demás del lote. */
export function resultadoDeExcepcion(reciboId: string): ResultadoReciboMarcado {
  return {
    reciboId, resultado: 'error', selladoOk: true,
    error: 'Ha fallado algo al guardar este cobro. Comprueba el recibo antes de volver a cobrarlo.',
  };
}

/**
 * Código HTTP del lote. Nunca 200 si algún recibo no quedó cobrado: 200 es
 * «todos cobrados (ahora o antes)». El cuerpo lleva siempre el detalle por
 * recibo, también en 409/500, para que la pantalla aplique lo que sí entró.
 */
export function estadoHttpDeLote(resultados: ResultadoReciboMarcado[]): 200 | 409 | 500 {
  if (resultados.some(r => r.resultado === 'error')) return 500;
  // Una penalización anulada que se salta no es un fallo del lote: es lo esperado.
  if (resultados.every(r => r.resultado === 'aplicada' || r.resultado === 'ya_estaba' || r.resultado === 'penalizacion_anulada')) return 200;
  return 409;
}

// ── Lado de la pantalla ─────────────────────────────────────────────────────

export type RespuestaMarcarCobrado = { status: number; cuerpo: unknown } | { red: true };

export type LecturaRespuesta =
  /** El servidor dijo qué pasó con cada recibo enviado. */
  | { tipo: 'resultados'; resultados: ResultadoReciboMarcado[] }
  /** Rechazada antes de tocar nada (sesión, rol, petición): nada se cobró. */
  | { tipo: 'rechazada'; status: number; error: string | null }
  /** No se sabe: red caída, timeout, 5xx sin detalle o un 2xx sin detalle. */
  | { tipo: 'desconocida' };

function esResultadoValido(x: unknown): x is ResultadoReciboMarcado {
  if (!x || typeof x !== 'object') return false;
  const r = x as Record<string, unknown>;
  return typeof r.reciboId === 'string'
    && (RESULTADOS_MARCADO as readonly string[]).includes(r.resultado as string)
    && typeof r.selladoOk === 'boolean';
}

/**
 * Cómo lee la pantalla la respuesta. La regla que importa: **nada se da por
 * cobrado sin un detalle por recibo que lo diga**. Un 200 con `{}` (un proxy, un
 * mock, una versión vieja) es «no sé», no «sí».
 *
 * Solo un 4xx sin detalle es un «no» seguro: la ruta comprueba sesión, rol y
 * cuerpo ANTES de tocar ningún recibo. Un 5xx sin detalle puede haber muerto a
 * mitad del lote, así que es «no sé» y toca releer.
 */
export function leerRespuestaMarcarCobrado(resp: RespuestaMarcarCobrado, idsEnviados: string[]): LecturaRespuesta {
  if ('red' in resp) return { tipo: 'desconocida' };
  const cuerpo = (resp.cuerpo && typeof resp.cuerpo === 'object' ? resp.cuerpo : {}) as { resultados?: unknown; error?: unknown };
  const lista = Array.isArray(cuerpo.resultados) ? cuerpo.resultados : null;
  if (lista && lista.every(esResultadoValido)) {
    const porId = new Map(lista.map(r => [r.reciboId, r]));
    if (idsEnviados.every(id => porId.has(id))) {
      return { tipo: 'resultados', resultados: idsEnviados.map(id => porId.get(id) as ResultadoReciboMarcado) };
    }
  }
  const noProcesada = resp.status >= 400 && resp.status < 500 && resp.status !== 408;
  if (noProcesada) {
    return { tipo: 'rechazada', status: resp.status, error: typeof cuerpo.error === 'string' ? cuerpo.error : null };
  }
  return { tipo: 'desconocida' };
}

/** Lo que la pantalla sabe al final de un recibo. */
export type DesenlaceCobroManual = Omit<ResultadoReciboMarcado, 'resultado'> & {
  resultado: ResultadoMarcado
    /** La respuesta no llegó y al releer la BD el recibo ya está COBRADO. */
    | 'cobrado_al_releer'
    /** La respuesta no llegó y no se puede afirmar que se cobrara. */
    | 'sin_confirmar';
};

export function esCobroConfirmado(d: Pick<DesenlaceCobroManual, 'resultado'>): boolean {
  return d.resultado === 'aplicada' || d.resultado === 'ya_estaba' || d.resultado === 'cobrado_al_releer';
}

/**
 * Tras una respuesta que no llegó, se relee el recibo. `estados` = null si la
 * relectura también falló. Nunca se propone reintentar a ciegas: el servidor es
 * idempotente, pero quien cobra tiene que saber qué hay antes de pulsar otra vez.
 */
export function desenlaceTrasReleer(ids: string[], estados: ReadonlyMap<string, string> | null): DesenlaceCobroManual[] {
  return ids.map(reciboId => {
    if (!estados) {
      return {
        reciboId, resultado: 'sin_confirmar', selladoOk: true,
        error: 'No hemos podido confirmar si el cobro se ha guardado. Recarga la página antes de volver a cobrarlo.',
      };
    }
    if (estados.get(reciboId) === 'COBRADO') return { reciboId, resultado: 'cobrado_al_releer', selladoOk: true };
    return {
      reciboId, resultado: 'sin_confirmar', selladoOk: true,
      error: 'No hemos podido confirmar el cobro y ahora figura sin cobrar. Espera unos segundos y compruébalo antes de volver a cobrarlo.',
    };
  });
}

export function trocear<T>(xs: readonly T[], tamano: number): T[][] {
  const n = Math.max(1, Math.floor(tamano));
  const trozos: T[][] = [];
  for (let i = 0; i < xs.length; i += n) trozos.push(xs.slice(i, i + n));
  return trozos;
}

// ── Lo que devuelven las funciones del contexto ─────────────────────────────

/**
 * `marcarCobrado` (un recibo). `cobroRegistrado` = el dinero SÍ quedó registrado
 * y solo falta la factura: quien llama nunca debe tratarlo como «no pasó nada,
 * reintenta». `yaEstaba` = estaba cobrado (o figura cobrado al releer): no es un
 * error, y no se manda justificante.
 */
export type ResultadoMarcarCobrado =
  | { ok: true; yaEstaba?: boolean; numeroFactura?: string }
  | { ok: false; error: string }
  | { ok: false; error: string; cobroRegistrado: true; numeroFactura?: string };

/**
 * «Nueva factura» y el cobro de una cita: un cobro al contado de UN recibo. Se crea
 * pendiente y se cobra por el servidor, así que hay cuatro desenlaces y quien llama
 * tiene que distinguirlos:
 *  · `{ ok: true }` — cobrado y con su factura;
 *  · `{ ok: false, error }` — NO se creó nada (o ni siquiera se llegó a escribir):
 *    reintentar es seguro;
 *  · `cobroRegistrado` — el dinero SÍ entró y lo que falló es la factura: no reenviar;
 *  · `cobroSinConfirmar` — el recibo EXISTE pero no consta cobrado (el servidor dijo
 *    que no, o no se supo): está en «Quién me debe», y reenviar crearía otro.
 */
export type ResultadoFacturaDirecta =
  | ResultadoEscritura
  | { ok: false; error: string; cobroRegistrado: true }
  | { ok: false; error: string; cobroSinConfirmar: true };

export interface ConteoLote {
  /** Cobrados por ESTA acción. */
  cobrados: number;
  /** Ya estaban cobrados (o figuran cobrados al releer). */
  yaEstaban: number;
  /** De los cobrados, con la factura pendiente de sellar. */
  sinFactura: number;
  /** De los cobrados, sin poder entregar el plan (bono o mensual): hay que renovarlo a mano. */
  sinRenovar: number;
  /** Seguro que NO se cobraron (por un fallo o porque ya no eran cobrables). */
  noCobrados: number;
  /** Se saltaron a propósito: son de una penalización anulada y no se cobran. */
  anulados: number;
  /** No se sabe: la respuesta no llegó y al releer no figuran cobrados. */
  sinConfirmar: number;
}

export type ResumenCobroEnLote = ({ ok: true } | { ok: false; error: string }) & ConteoLote;

export function resumenDeLote(desenlaces: DesenlaceCobroManual[]): ResumenCobroEnLote {
  const c: ConteoLote = { cobrados: 0, yaEstaban: 0, sinFactura: 0, sinRenovar: 0, noCobrados: 0, anulados: 0, sinConfirmar: 0 };
  let primerNo: string | undefined;
  let primerDuda: string | undefined;
  for (const d of desenlaces) {
    if (d.resultado === 'aplicada') {
      c.cobrados++;
      if (!d.selladoOk) c.sinFactura++;
      if (d.renovacionFallida) c.sinRenovar++;
    } else if (d.resultado === 'ya_estaba' || d.resultado === 'cobrado_al_releer') {
      c.yaEstaban++;
    } else if (d.resultado === 'penalizacion_anulada') {
      c.anulados++;
    } else if (d.resultado === 'sin_confirmar') {
      c.sinConfirmar++;
      primerDuda ??= d.error;
    } else {
      c.noCobrados++;
      primerNo ??= d.error;
    }
  }
  if (c.noCobrados === 0 && c.sinConfirmar === 0) return { ok: true, ...c };
  const partes = [`${c.cobrados} de ${desenlaces.length} cobrados.`];
  if (c.noCobrados) partes.push(`${c.noCobrados} sin cobrar: ${primerNo ?? 'no se ha podido guardar.'}`);
  if (c.sinConfirmar) partes.push(`${c.sinConfirmar} sin confirmar: ${primerDuda ?? 'compruébalo antes de volver a cobrar.'}`);
  return { ok: false, error: partes.join(' '), ...c };
}

/**
 * El aviso de un lote que salió bien. `saltados` son los recibos que se dejaron
 * fuera por ser de una penalización anulada: se dicen con su importe, porque
 * quien cobra en el mostrador tiene que saber que ese dinero no va.
 */
export function textoLoteCobrado(r: ConteoLote, saltados: readonly { importe: number }[] = []): string {
  const partes = [`${r.cobrados} ${r.cobrados === 1 ? 'recibo cobrado' : 'recibos cobrados'}`];
  if (r.yaEstaban) partes.push(`${r.yaEstaban} ya ${r.yaEstaban === 1 ? 'estaba cobrado' : 'estaban cobrados'}`);
  if (r.sinFactura) partes.push(`${r.sinFactura} con la factura pendiente de sellar`);
  if (r.sinRenovar) partes.push(`${r.sinRenovar} sin poder renovar el plan: renuévalo a mano desde la ficha`);
  const base = partes.join(' · ');
  return saltados.length > 0 ? `${base}. ${fraseSaltados(saltados)}.` : base;
}

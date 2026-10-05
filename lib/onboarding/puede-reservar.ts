// ─────────────────────────────────────────────────────────────────────────────
// ¿Puede una alumna NUEVA reservar ya desde la página del estudio?
//
// Es la verdad que hay detrás de «Tu estudio ya puede recibir reservas»
// (components/onboarding/listo-para-reservar.tsx): esa pantalla prometía
// «cualquiera con este enlace puede reservar» con una heurística del cliente
// (`avisoVentaOnline`) que da por cobrable a un Stripe solo por tener
// `stripe_account_id` — con la verificación a medias, `charges_enabled` sigue en
// false (lib/billing/cuenta-puede-cobrar.ts) y la alumna no puede comprar el
// bono que se le exige. Mientras, el «¿Lista para abrir?» de Inicio le decía a
// la misma propietaria lo contrario.
//
// ⚠️ Se evalúa CLASE A CLASE con las MISMAS funciones que el gate real
// (`crearReservaPublica` en TS y `reservar_plaza`/`evaluar_reserva` en SQL):
// ventana mínima y máxima con `heredaOverride`, apertura suave con
// `bloqueadaPorAperturaSuave`, cierres con `cierreDeFecha` (gemela de
// `fecha_en_cierre`), «solo alumnas autorizadas», y el plan con
// `exigePlanAlReservar` + `planCubreTipoClase`. Basta UNA clase que pase.
//
// No se reutiliza `evaluarListo` (lib/opening/listo.ts) tal cual, y no por
// capricho: exige instructora (el gate solo la mira para el rol INSTRUCTOR),
// usa `exigirPlan` a secas (con el ajuste puesto y nada que contratar el gate no
// bloquea, y diría «falta algo que vender»), y solo mira la semana de apertura.
//
// Lo que no mira, a sabiendas: el tope semanal del plan, el máximo de reservas a
// la vez o al día y las preguntas de alta. A una alumna nueva no le aplica
// ninguno antes de su primera reserva.
//
// Puro: se prueba con `node --test`. Solo imports relativos con extensión.
// ─────────────────────────────────────────────────────────────────────────────

import {
  bloqueadaPorAperturaSuave, heredaOverride, instanteDeApertura,
  puedeReservarPorAntelacionMaxima, puedeReservarPorVentanaMinima,
} from '../booking-logic.ts';
import { exigePlanAlReservar, planCubreTipoClase } from '../bono-logic.ts';
import { cierreDeFecha } from '../calendario/nueva-clase.ts';
import { diaEnEstudio } from '../calendario-hora-estudio.ts';
import { inicioDelDiaEstudio } from '../utils.ts';
import { diaDeApertura } from '../opening/listo.ts';
import { AVISO_VENTA_SIN_STRIPE } from '../onboarding.ts';
import type { CierreGuardado } from '../cierres/quitar-cierre.ts';
import type { EstadoCobroCuenta } from '../billing/cuenta-puede-cobrar.ts';

/**
 * Por qué una alumna nueva todavía no puede reservar. En el ORDEN del embudo:
 * se informa del escalón en el que se quedó la clase que más lejos llegó, que es
 * lo que la propietaria tiene que arreglar primero.
 */
export type MotivoNoReserva =
  | 'SIN_CLASE_FUTURA'
  | 'CIERRE'
  | 'APERTURA_SUAVE'
  | 'ANTELACION'
  | 'NECESITA_AUTORIZACION'
  | 'SIN_PLAN_QUE_CUBRA'
  | 'STRIPE_SIN_CUENTA'
  | 'STRIPE_NO_PUEDE';

export type ResultadoPuedeReservar =
  | { estado: 'SI' }
  /** `abreEl` (ISO): cuándo se abre la reserva (ANTELACION) o el día de apertura (APERTURA_SUAVE). */
  | { estado: 'NO'; motivo: MotivoNoReserva; abreEl?: string; antelacionDias?: number }
  /** Lo único que faltaba saber era si Stripe cobra, y no contestó. Nunca es un sí. */
  | { estado: 'SIN_COMPROBAR' };

export interface SesionPuedeReservar {
  inicio: string;
  cancelada: boolean;
  aforoMaximo: number;
  tipoClaseId: string | null;
}

/** Los overrides de la Fase 1 que deciden si se puede reservar. NULL = hereda del estudio. */
export interface TipoPuedeReservar {
  id: string;
  reservaExigirPlan: boolean | null;
  reservaVentanaMinimaMinutos: number | null;
  reservaAntelacionMaximaDias: number | null;
  requiereAutorizacion: boolean;
}

/** `tiposClaseIds` vacío o ausente = cubre todos, como el checkout. */
export interface PlanPuedeReservar {
  id: string;
  activo: boolean;
  precio: number;
  esPrueba?: boolean;
  tiposClaseIds?: string[];
}

export interface DatosPuedeReservar {
  /** Las clases por venir (las pasadas o canceladas que lleguen, no cuentan). */
  sesiones: SesionPuedeReservar[];
  tipos: TipoPuedeReservar[];
  estudio: {
    /** NULL = se exige, el mismo defecto que `cargarPoliticaEstudio`. */
    reservaExigirPlan: boolean | null;
    reservaVentanaMinimaMinutos: number | null;
    reservaAntelacionMaximaDias: number | null;
    /** 'HH:MM' (studios.reserva_antelacion_hora); null = a la hora de la clase. */
    reservaAntelacionHora: string | null;
    aperturaSuave: boolean;
    /** 'YYYY-MM-DD' (studios.fecha_apertura). */
    fechaApertura: string | null;
  };
  /** TODAS las tarifas del estudio: `exigePlanAlReservar` mira si hay algo que contratar. */
  planes: PlanPuedeReservar[];
  cierres: CierreGuardado[];
  /** SIN_CUENTA: ni ha empezado a conectar Stripe. */
  stripe: EstadoCobroCuenta | 'SIN_CUENTA';
}

const no = (motivo: MotivoNoReserva, extra: { abreEl?: string; antelacionDias?: number } = {}): ResultadoPuedeReservar =>
  ({ estado: 'NO', motivo, ...extra });

export function puedeReservarAlumnaNueva(d: DatosPuedeReservar, now: Date): ResultadoPuedeReservar {
  const e = d.estudio;
  const tipos = new Map(d.tipos.map(t => [t.id, t]));
  const tipoDe = (s: SesionPuedeReservar) => (s.tipoClaseId ? tipos.get(s.tipoClaseId) : undefined);

  // 0 · Lo que enseña /reservar (lib/reservar/construir-slots.ts): por venir y sin
  // cancelar. Con plazas, porque con aforo 0 solo cabe la lista de espera. Y fuera
  // de la ventana mínima: la que ya no admite reservas es, para ella, como pasada.
  const futuras = d.sesiones
    .filter(s => !s.cancelada && s.aforoMaximo > 0 && new Date(s.inicio).getTime() > now.getTime())
    .filter(s => puedeReservarPorVentanaMinima(
      s.inicio, now, heredaOverride(tipoDe(s)?.reservaVentanaMinimaMinutos, e.reservaVentanaMinimaMinutos ?? 0),
    ));
  if (futuras.length === 0) return no('SIN_CLASE_FUTURA');

  // 1 · Cierre del centro: `reservar_plaza` la rechaza (ESTUDIO_CERRADO). Una clase
  // suelta en un día de cierre se crea sin problema, por eso se mira.
  const sinCierre = futuras.filter(s => !cierreDeFecha(diaEnEstudio(s.inicio), d.cierres));
  if (sinCierre.length === 0) return no('CIERRE');

  // 2 · Apertura suave. Una alumna nueva no está en el grupo por definición (no
  // tiene etiqueta ni cuota de etapa), así que da igual que haya fundadoras: las
  // clases de antes del día de apertura no son para ella.
  const inicioApertura = e.aperturaSuave && e.fechaApertura ? inicioDelDiaEstudio(e.fechaApertura) : null;
  const publicas = sinCierre.filter(s => !bloqueadaPorAperturaSuave(s.inicio, inicioApertura, e.aperturaSuave, false));
  if (publicas.length === 0) return no('APERTURA_SUAVE', inicioApertura ? { abreEl: inicioApertura } : {});

  // 3 · Antelación máxima: el mismo instante que aplica el servidor.
  const antelacion = (s: SesionPuedeReservar) =>
    heredaOverride(tipoDe(s)?.reservaAntelacionMaximaDias, e.reservaAntelacionMaximaDias);
  const enPlazo = publicas.filter(s => puedeReservarPorAntelacionMaxima(s.inicio, now, antelacion(s), e.reservaAntelacionHora));
  if (enPlazo.length === 0) {
    // Ninguna se puede reservar aún, así que todas tienen antelación: la fecha
    // que importa es la de la primera que se abra.
    const aperturas = publicas.map(s => ({ dias: antelacion(s)!, abre: instanteDeApertura(s.inicio, antelacion(s)!, e.reservaAntelacionHora) }));
    const primera = aperturas.reduce((a, b) => (b.abre.getTime() < a.abre.getTime() ? b : a));
    return no('ANTELACION', { abreEl: primera.abre.toISOString(), antelacionDias: primera.dias });
  }

  // 4 · «Solo para alumnas autorizadas»: nadie la reserva hasta que se la abran
  // desde su ficha, y a una alumna nueva todavía no se la ha abierto nadie
  // (`evaluar_reserva`, NECESITA_AUTORIZACION).
  const abiertas = enPlazo.filter(s => !tipoDe(s)?.requiereAutorizacion);
  if (abiertas.length === 0) return no('NECESITA_AUTORIZACION');

  // 5 · El plan. `exigePlanAlReservar` es la decisión ENTERA del gate (el ajuste
  // resuelto Y que haya algo que contratar), con las tarifas de todo el estudio;
  // si se exige, tiene que poder comprar uno que cubra la clase, y el checkout
  // solo vende tarifas activas con precio.
  const exige = (s: SesionPuedeReservar) =>
    exigePlanAlReservar(heredaOverride(tipoDe(s)?.reservaExigirPlan, e.reservaExigirPlan ?? true), d.planes);
  const vendibles = d.planes.filter(p => p.activo && p.precio > 0);
  const conSalida = abiertas.filter(s => !exige(s) || vendibles.some(p => planCubreTipoClase(p, s.tipoClaseId)));
  if (conSalida.length === 0) return no('SIN_PLAN_QUE_CUBRA');
  if (conSalida.some(s => !exige(s))) return { estado: 'SI' };

  // 6 · Todas las que quedan piden comprar algo: solo se puede si Stripe cobra.
  switch (d.stripe) {
    case 'PUEDE': return { estado: 'SI' };
    case 'SIN_CUENTA': return no('STRIPE_SIN_CUENTA');
    case 'NO_PUEDE': return no('STRIPE_NO_PUEDE');
    case 'SIN_RESPUESTA': return { estado: 'SIN_COMPROBAR' };
  }
}

// ─── Lo que llega al navegador ───────────────────────────────────────────────

/** La respuesta de `/api/onboarding/puede-reservar` tal como se lee: un motivo que no se conoce sigue siendo un NO. */
export type RespuestaPuedeReservar =
  | { estado: 'SI' }
  | { estado: 'NO'; motivo: string; abreEl?: string; antelacionDias?: number }
  | { estado: 'SIN_COMPROBAR' };

const SIN_COMPROBAR: RespuestaPuedeReservar = { estado: 'SIN_COMPROBAR' };

/**
 * Sin dar por hecha la forma: los e2e mockean `/api/**` como `{}` y nada del
 * panel puede romperse por un cuerpo raro. Todo lo que no se reconoce es
 * SIN_COMPROBAR, que nunca promete nada que no sepa.
 */
export function leerRespuestaPuedeReservar(x: unknown): RespuestaPuedeReservar {
  if (!x || typeof x !== 'object') return SIN_COMPROBAR;
  const r = x as Record<string, unknown>;
  if (r.estado === 'SI') return { estado: 'SI' };
  if (r.estado === 'NO' && typeof r.motivo === 'string') {
    return {
      estado: 'NO',
      motivo: r.motivo,
      ...(typeof r.abreEl === 'string' && !Number.isNaN(new Date(r.abreEl).getTime()) ? { abreEl: r.abreEl } : {}),
      ...(typeof r.antelacionDias === 'number' && Number.isFinite(r.antelacionDias) ? { antelacionDias: r.antelacionDias } : {}),
    };
  }
  return SIN_COMPROBAR;
}

const NO_PUEDE_AUN = 'Una alumna nueva todavía no puede reservar desde tu página';

// `undefined`: con lo que ha llegado no se puede escribir una frase cierta (un
// motivo nuevo, una fecha que falta) y manda el aviso de siempre. `null`: no hay
// nada que avisar.
const TEXTO_MOTIVO: Record<MotivoNoReserva, (r: { abreEl?: string; antelacionDias?: number }) => string | null | undefined> = {
  // Sin aviso: la vista previa de al lado ya enseña que no hay nada que
  // reservar, y el párrafo deja de prometerlo.
  SIN_CLASE_FUTURA: () => null,
  CIERRE: () => `${NO_PUEDE_AUN}: tus clases caen en días que tienes marcados como cierre del centro.`,
  APERTURA_SUAVE: r => `Tienes puesta la apertura suave: ${r.abreEl ? `hasta el ${diaDeApertura(new Date(r.abreEl))}` : 'por ahora'} estas clases solo las reservan tus fundadoras e invitadas, o tú desde el mostrador.`,
  ANTELACION: r => (r.abreEl && r.antelacionDias != null
    ? `Solo dejas reservar con ${r.antelacionDias} ${r.antelacionDias === 1 ? 'día' : 'días'} de antelación: tu primera clase no se podrá reservar hasta el ${diaDeApertura(new Date(r.abreEl))}.`
    : undefined),
  NECESITA_AUTORIZACION: () => `${NO_PUEDE_AUN}: estas clases son solo para alumnas autorizadas, y a una alumna nueva tendrías que abrírselas tú desde su ficha.`,
  SIN_PLAN_QUE_CUBRA: () => `${NO_PUEDE_AUN}: pides bono para reservar y ninguno de tus planes a la venta incluye estas clases.`,
  // El mismo caso que ya avisaba el cliente (evaluación del 13-sep), con la misma frase.
  STRIPE_SIN_CUENTA: () => AVISO_VENTA_SIN_STRIPE,
  STRIPE_NO_PUEDE: () => `${NO_PUEDE_AUN}: pides bono para reservar y Stripe aún no puede cobrar. Termina la verificación en Stripe o véndeselo tú en el mostrador.`,
};

const esMotivo = (m: string): m is MotivoNoReserva => Object.hasOwn(TEXTO_MOTIVO, m);

/**
 * El aviso que se pinta bajo «Tu estudio ya puede recibir reservas».
 * `avisoCliente` es el de `avisoVentaOnline`, que ya está en pantalla antes de
 * que conteste el servidor: se queda mientras espera y cuando no se ha podido
 * comprobar, y el servidor lo sustituye en cuanto sabe algo.
 */
export function avisoListo(srv: RespuestaPuedeReservar | null, avisoCliente: string | null): string | null {
  if (!srv || srv.estado === 'SIN_COMPROBAR') return avisoCliente;
  if (srv.estado === 'SI') return null;
  if (!esMotivo(srv.motivo)) return avisoCliente;
  const texto = TEXTO_MOTIVO[srv.motivo](srv);
  return texto === undefined ? avisoCliente : texto;
}

/**
 * ¿Se puede decir «cualquiera con este enlace puede reservar»? Solo con el sí
 * del servidor, o si no ha podido comprobarlo y tampoco hay nada que avisar —
 * que es justo lo que decía la pantalla antes, ni más ni menos—. Mientras
 * espera, NO: una promesa que se pinta y luego se retira es peor que esperar un
 * segundo a pintarla.
 */
export function prometeReservas(srv: RespuestaPuedeReservar | null, avisoCliente: string | null): boolean {
  return srv?.estado === 'SI' || (srv?.estado === 'SIN_COMPROBAR' && !avisoCliente);
}

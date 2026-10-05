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
// `exigePlanAlReservar` + `planCubreTipoClase`. Basta UNA clase que pase. Y
// antes que nada, la página oculta (`pagina_publica_oculta`), que cierra las
// puertas que escriben a quien no trae la clave.
//
// ⚠️ Un «no» por la FECHA (cierre, apertura suave, antelación) nunca tapa uno
// que no se arregla esperando (autorización, plan, Stripe): si también falla
// eso, se cuenta eso, porque «no se podrá reservar hasta el 15» da a entender
// que el 15 sí.
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
  | 'PAGINA_OCULTA'
  | 'SIN_CLASE_FUTURA'
  | 'CIERRE'
  | 'APERTURA_SUAVE'
  | 'ANTELACION'
  | 'NECESITA_AUTORIZACION'
  | 'SIN_PLAN_QUE_CUBRA'
  | 'STRIPE_SIN_CUENTA'
  | 'STRIPE_NO_PUEDE';

/**
 * `abreEl` (ISO): cuándo se abre la reserva (ANTELACION) o el día de apertura
 * (APERTURA_SUAVE). `conClave`: si la página oculta deja entrar a alguien con
 * clave (PAGINA_OCULTA).
 */
interface ExtraNo { abreEl?: string; antelacionDias?: number; conClave?: boolean }

export type ResultadoPuedeReservar =
  | { estado: 'SI' }
  | ({ estado: 'NO'; motivo: MotivoNoReserva } & ExtraNo)
  /**
   * Lo único que faltaba saber era si Stripe cobra, y no contestó. Nunca es un
   * sí: lleva su motivo para que la pantalla lo diga en vez de prometer.
   */
  | { estado: 'SIN_COMPROBAR'; motivo: 'STRIPE' };

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
    /** studios.pagina_publica_oculta: el catálogo público no enseña clases y las puertas que escriben dicen que no. */
    paginaOculta: boolean;
    /** Si la oculta tiene clave: con ella entra (y reserva) quien la tenga; sin ella, nadie. */
    paginaConClave: boolean;
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

const no = (motivo: MotivoNoReserva, extra: ExtraNo = {}): ResultadoPuedeReservar =>
  ({ estado: 'NO', motivo, ...extra });

/**
 * Lo que vende el checkout desde el enlace que se comparte (`/reservar/<slug>`,
 * sin `?prueba=1`): activas, con precio y que no sean la clase de prueba. Es el
 * criterio de `planesComprablesParaReservar` y de la tienda; la prueba solo se
 * ofrece en su propia vista, y contarla aquí daba un sí que nadie podía comprar.
 */
export const esVendibleDesdeElEnlace = (p: PlanPuedeReservar): boolean =>
  p.activo && p.precio > 0 && p.esPrueba !== true;

export function puedeReservarAlumnaNueva(d: DatosPuedeReservar, now: Date): ResultadoPuedeReservar {
  const e = d.estudio;
  const tipos = new Map(d.tipos.map(t => [t.id, t]));
  const tipoDe = (s: SesionPuedeReservar) => (s.tipoClaseId ? tipos.get(s.tipoClaseId) : undefined);

  // Página oculta: con ella, el catálogo público no enseña ni una clase y las
  // puertas que escriben (reserva, alta, checkout) contestan que no a quien no
  // trae el pase de la clave (lib/publico/pagina-cerrada-peticion.ts). Va antes
  // que todo: no es de una clase, es de la página entera.
  if (e.paginaOculta) return no('PAGINA_OCULTA', { conClave: e.paginaConClave });

  // 0 · Lo que enseña /reservar (lib/reservar/construir-slots.ts): por venir y sin
  // cancelar. Con plazas, porque con aforo 0 solo cabe la lista de espera. Y fuera
  // de la ventana mínima: la que ya no admite reservas es, para ella, como pasada.
  const futuras = d.sesiones
    .filter(s => !s.cancelada && s.aforoMaximo > 0 && new Date(s.inicio).getTime() > now.getTime())
    .filter(s => puedeReservarPorVentanaMinima(
      s.inicio, now, heredaOverride(tipoDe(s)?.reservaVentanaMinimaMinutos, e.reservaVentanaMinimaMinutos ?? 0),
    ));
  if (futuras.length === 0) return no('SIN_CLASE_FUTURA');

  // 1-3 · Lo que depende de la FECHA. Cierre del centro: `reservar_plaza` la
  // rechaza (ESTUDIO_CERRADO), y una clase suelta en un día de cierre se crea sin
  // problema. Apertura suave: una alumna nueva no está en el grupo por definición
  // (no tiene etiqueta ni cuota de etapa), así que da igual que haya fundadoras.
  // Antelación máxima: el mismo instante que aplica el servidor.
  const cerrada = (s: SesionPuedeReservar) => Boolean(cierreDeFecha(diaEnEstudio(s.inicio), d.cierres));
  const inicioApertura = e.aperturaSuave && e.fechaApertura ? inicioDelDiaEstudio(e.fechaApertura) : null;
  const antesDeAbrir = (s: SesionPuedeReservar) => bloqueadaPorAperturaSuave(s.inicio, inicioApertura, e.aperturaSuave, false);
  const antelacion = (s: SesionPuedeReservar) =>
    heredaOverride(tipoDe(s)?.reservaAntelacionMaximaDias, e.reservaAntelacionMaximaDias);
  const enPlazo = (s: SesionPuedeReservar) => puedeReservarPorAntelacionMaxima(s.inicio, now, antelacion(s), e.reservaAntelacionHora);

  const hoy = futuras.filter(s => !cerrada(s) && !antesDeAbrir(s) && enPlazo(s));
  if (hoy.length > 0) return pasosDeLaAlumna(d, tipoDe, hoy).resultado;

  // ⚠️ Ninguna se puede reservar HOY por la fecha, pero eso no basta para
  // decirlo: un «no se podrá reservar hasta el 15» da a entender que el 15 sí, y
  // sin Stripe, sin plan que la cubra o solo para autorizadas tampoco se podrá.
  // Lo que no se arregla esperando se mira antes, sobre las mismas clases, y es
  // lo que se cuenta: es lo que la propietaria puede arreglar ahora. Si con
  // Stripe sin contestar no se sabe, se queda el motivo de fecha, que es seguro.
  const estructura = pasosDeLaAlumna(d, tipoDe, futuras);
  if (estructura.resultado.estado === 'NO') return estructura.resultado;

  // Y la fecha se cuenta de las clases que SÍ pasarán cuando llegue, no de una
  // que tampoco podría reservarse entonces.
  const clases = estructura.validas;
  const sinCierre = clases.filter(s => !cerrada(s));
  if (sinCierre.length === 0) return no('CIERRE');
  const publicas = sinCierre.filter(s => !antesDeAbrir(s));
  if (publicas.length === 0) return no('APERTURA_SUAVE', inicioApertura ? { abreEl: inicioApertura } : {});
  // Ninguna está en plazo, así que todas tienen antelación: la fecha que importa
  // es la de la primera que se abra.
  const aperturas = publicas.map(s => ({ dias: antelacion(s)!, abre: instanteDeApertura(s.inicio, antelacion(s)!, e.reservaAntelacionHora) }));
  const primera = aperturas.reduce((a, b) => (b.abre.getTime() < a.abre.getTime() ? b : a));
  return no('ANTELACION', { abreEl: primera.abre.toISOString(), antelacionDias: primera.dias });
}

// 4-6 · Lo que no depende del día: autorización, plan y Stripe. `validas`: las
// clases con las que el veredicto es sí (o lo sería si Stripe contestara).
function pasosDeLaAlumna(
  d: DatosPuedeReservar, tipoDe: (s: SesionPuedeReservar) => TipoPuedeReservar | undefined, lista: SesionPuedeReservar[],
): { resultado: ResultadoPuedeReservar; validas: SesionPuedeReservar[] } {
  // 4 · «Solo para alumnas autorizadas»: nadie la reserva hasta que se la abran
  // desde su ficha, y a una alumna nueva todavía no se la ha abierto nadie
  // (`evaluar_reserva`, NECESITA_AUTORIZACION).
  const abiertas = lista.filter(s => !tipoDe(s)?.requiereAutorizacion);
  if (abiertas.length === 0) return { resultado: no('NECESITA_AUTORIZACION'), validas: [] };

  // 5 · El plan. `exigePlanAlReservar` es la decisión ENTERA del gate (el ajuste
  // resuelto Y que haya algo que contratar), con las tarifas de todo el estudio;
  // si se exige, tiene que poder comprar uno que cubra la clase.
  const exige = (s: SesionPuedeReservar) =>
    exigePlanAlReservar(heredaOverride(tipoDe(s)?.reservaExigirPlan, d.estudio.reservaExigirPlan ?? true), d.planes);
  const vendibles = d.planes.filter(esVendibleDesdeElEnlace);
  const conSalida = abiertas.filter(s => !exige(s) || vendibles.some(p => planCubreTipoClase(p, s.tipoClaseId)));
  if (conSalida.length === 0) return { resultado: no('SIN_PLAN_QUE_CUBRA'), validas: [] };

  // 6 · Las que piden comprar algo solo se pueden reservar si Stripe cobra.
  const seguras = conSalida.filter(s => !exige(s) || d.stripe === 'PUEDE');
  if (seguras.length > 0) return { resultado: { estado: 'SI' }, validas: seguras };
  if (d.stripe === 'SIN_CUENTA') return { resultado: no('STRIPE_SIN_CUENTA'), validas: [] };
  if (d.stripe === 'NO_PUEDE') return { resultado: no('STRIPE_NO_PUEDE'), validas: [] };
  // SIN_RESPUESTA (con PUEDE, `seguras` no estaría vacía).
  return { resultado: { estado: 'SIN_COMPROBAR', motivo: 'STRIPE' }, validas: conSalida };
}

/**
 * El veredicto cuando da igual lo que conteste Stripe (cobre o no, sale lo
 * mismo), o `null` si su respuesta lo cambia y hay que preguntarle. Es lo que
 * deja al servidor no gastar hasta 2,5 s en Stripe sin necesidad.
 *
 * Se compara el resultado ENTERO, no solo si sale SIN_COMPROBAR: con la fecha
 * por medio, Stripe puede cambiar el motivo (ANTELACION o STRIPE_NO_PUEDE) sin
 * que ninguno de los dos sea un «sin comprobar».
 */
export function veredictoSinPreguntarAStripe(d: Omit<DatosPuedeReservar, 'stripe'>, now: Date): ResultadoPuedeReservar | null {
  const cobra = puedeReservarAlumnaNueva({ ...d, stripe: 'PUEDE' }, now);
  const noCobra = puedeReservarAlumnaNueva({ ...d, stripe: 'NO_PUEDE' }, now);
  // Objetos planos que solo construye `no()`/los literales de arriba, con las
  // claves siempre en el mismo orden: compararlos en JSON es compararlos enteros.
  return JSON.stringify(cobra) === JSON.stringify(noCobra) ? cobra : null;
}

// ─── Lo que llega al navegador ───────────────────────────────────────────────

/** La respuesta de `/api/onboarding/puede-reservar` tal como se lee: un motivo que no se conoce sigue siendo un NO. */
export type RespuestaPuedeReservar =
  | { estado: 'SI' }
  | ({ estado: 'NO'; motivo: string } & ExtraNo)
  /**
   * Con `motivo`, lo dice el servidor: sabe qué no ha podido comprobar (hoy,
   * solo si Stripe cobra). Sin él, no se ha podido ni preguntar: la red, un 500
   * o un cuerpo raro.
   */
  | { estado: 'SIN_COMPROBAR'; motivo?: string };

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
      ...(typeof r.conClave === 'boolean' ? { conClave: r.conClave } : {}),
    };
  }
  if (r.estado === 'SIN_COMPROBAR' && typeof r.motivo === 'string') return { estado: 'SIN_COMPROBAR', motivo: r.motivo };
  return SIN_COMPROBAR;
}

const NO_PUEDE_AUN = 'Una alumna nueva todavía no puede reservar desde tu página';
const DONDE_SE_ABRE = 'Para abrirla, ve a Configuración > Mi app y mi web > Ocultar tu página.';

// `undefined`: con lo que ha llegado no se puede escribir una frase cierta (un
// motivo nuevo, una fecha que falta) y manda el aviso de siempre. `null`: no hay
// nada que avisar.
const TEXTO_MOTIVO: Record<MotivoNoReserva, (r: ExtraNo) => string | null | undefined> = {
  // Lo que ve quien abre el enlace con la página oculta es el aviso de «la
  // estamos preparando», y reservar solo puede quien entra con la clave, si la hay.
  PAGINA_OCULTA: r => (r.conClave === true
    ? `Tu página está oculta: quien abra este enlace verá un aviso de que la estás preparando, y solo podrá reservar quien entre con tu clave. ${DONDE_SE_ABRE}`
    : r.conClave === false
      ? `Tu página está oculta y sin clave: quien abra este enlace verá un aviso de que la estás preparando, y desde fuera no puede reservar nadie. ${DONDE_SE_ABRE}`
      : `Tu página está oculta: quien abra este enlace verá un aviso de que la estás preparando. ${DONDE_SE_ABRE}`),
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
 * El SIN_COMPROBAR del servidor: todas las clases piden bono y Stripe no ha
 * contestado (o no hay clave para preguntarle). No se sabe si cobra, y eso es lo
 * que se dice: ni la promesa ni un «no cobra» que quizá no es verdad.
 */
const TEXTO_STRIPE_SIN_COMPROBAR = 'No hemos podido comprobar si Stripe ya puede cobrar, y pides bono para reservar: mientras no cobre, una alumna nueva no podrá comprarlo desde tu página. Míralo en Stripe o véndeselo tú en el mostrador.';

/**
 * El aviso que se pinta bajo «Tu estudio ya puede recibir reservas».
 * `avisoCliente` es el de `avisoVentaOnline`, que ya está en pantalla antes de
 * que conteste el servidor: se queda mientras espera y cuando no se ha podido
 * preguntar, y el servidor lo sustituye en cuanto sabe algo.
 */
export function avisoListo(srv: RespuestaPuedeReservar | null, avisoCliente: string | null): string | null {
  if (!srv) return avisoCliente;
  if (srv.estado === 'SI') return null;
  if (srv.estado === 'SIN_COMPROBAR') return srv.motivo === 'STRIPE' ? TEXTO_STRIPE_SIN_COMPROBAR : avisoCliente;
  if (!esMotivo(srv.motivo)) return avisoCliente;
  const texto = TEXTO_MOTIVO[srv.motivo](srv);
  return texto === undefined ? avisoCliente : texto;
}

/**
 * ¿Se puede decir «cualquiera con este enlace puede reservar»? Solo con el sí
 * del servidor, o si no se ha podido ni preguntar y tampoco hay nada que avisar
 * —que es justo lo que decía la pantalla antes, ni más ni menos—. Un
 * SIN_COMPROBAR DEL SERVIDOR no promete: sabe que el veredicto depende de
 * Stripe, y es justo el caso que esta pantalla prometía en falso. Mientras
 * espera, tampoco: una promesa que se pinta y luego se retira es peor que
 * esperar un segundo a pintarla.
 */
export function prometeReservas(srv: RespuestaPuedeReservar | null, avisoCliente: string | null): boolean {
  if (srv?.estado === 'SI') return true;
  return srv?.estado === 'SIN_COMPROBAR' && srv.motivo === undefined && !avisoCliente;
}

/**
 * Cómo termina el párrafo de debajo del titular. `null` mientras espera: ni
 * «abierta» ni la promesa hasta saberlo, porque con la página oculta «abierta»
 * es falso y se retiraría al llegar la respuesta. Con la página oculta tampoco
 * se dice nada aquí: lo cuenta el aviso.
 */
export function finalDelParrafo(srv: RespuestaPuedeReservar | null, avisoCliente: string | null): string | null {
  if (!srv) return null;
  if (prometeReservas(srv, avisoCliente)) return 'Tu página está abierta: cualquiera con este enlace puede reservar.';
  if (srv.estado === 'NO' && srv.motivo === 'PAGINA_OCULTA') return null;
  return 'Tu página está abierta.';
}

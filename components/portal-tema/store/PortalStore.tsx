"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from "react";
import { DATOS_DE_MUESTRA, EXERCISES, NOTIFICATIONS, buscarClase } from "@/components/portal-tema/data/studio";
import type { DatosPortal } from "@/lib/portal-tema/tipos";
import { mandaLaRuta, repartirDestino } from "@/lib/portal-tema/navegacion";
// La ÚNICA frase que `mensajeDeFalloAlGuardar` reserva para un fallo de red de
// verdad. Es lo que separa «vuelve a intentarlo» de «el estudio ha dicho que
// no» — ver el comentario de la hoja `errorReserva`.
import { ERROR_RED } from "@/lib/errores";

export type ScreenId =
  | "welcome" | "login" | "registro"
  | "inicio" | "clases" | "calendario" | "reservas" | "perfil" | "centro"
  | "bonos" | "checkout" | "detalle" | "sesion" | "videos" | "instructores"
  | "confirmada" | "comprar" | "info" | "misdatos" | "preferencias" | "progreso" | "invitar" | "avisos"
  | "historial"
  | "favoritas"
  | "compra";

// Las que pueden quedar marcadas en la barra. `bonos` y `centro` entran con la
// barra de cinco de Tentada; los otros temas no las usan como pestaña, y una
// pestaña de más en el tipo no pinta nada por sí sola.
export type TabId = "inicio" | "clases" | "reservas" | "perfil" | "bonos" | "centro";

export interface PortalState {
  screen: ScreenId;
  tab: TabId;
  day: number;
  filter: string;
  classId: string;
  /**
   * La plaza elegida en el detalle, o `null` si no ha elegido ninguna.
   *
   * ⚠️ Se limpia al ABRIR otra clase (`openClass`) y al reservar. Sin eso, la
   * plaza 3 elegida en la clase de las 10 viajaría a la de las 18, donde
   * puede estar ocupada — y el servidor la rechazaría con un mensaje que no
   * explica nada.
   */
  spotElegido: string | null;
  booked: string[];
  favourites: string[];
  loading: boolean;
  notifications: Record<string, boolean>;
  challenges: string[];
  exercise: number;
  seconds: number;
  running: boolean;
  toast: string;
  toastId: number;
  alertsSeen: boolean;
  plan: string;
  paying: boolean;
  authWorking: boolean;
  /**
   * Qué acaba de pasar al reservar, para la pantalla de confirmación. `null` =
   * no se viene de reservar, y entonces esa pantalla no tiene nada que contar.
   */
  ultimaReserva: { classId: string; estado: 'CONFIRMADA' | 'LISTA_ESPERA' | 'PENDIENTE_APROBACION' } | null;
  /** Pestaña abierta del horario: el día o la cola. Solo la usa `schedule_style: "tabs"`. */
  horarioTab: 'clases' | 'espera';
  /** Pestaña abierta en «Mis bonos». Solo la usa `passes_style: "cartera"`. */
  bonosTab: 'bonos' | 'historial';
  /**
   * Vista de la Agenda: semana, mes o lista. Solo la usa el tema que pide la
   * agenda con segmentado (Sereno); el resto siguen viendo la lista de siempre
   * y ni pintan el control.
   */
  agendaVista: 'semana' | 'mes' | 'lista';
  /**
   * Sus clases ya asistidas, para «Completadas».
   *
   * `null` = todavía no se han pedido (o no hay de quién pedirlas: la
   * previsualización corre sin sesión de socia). NO es lo mismo que `[]`, que
   * sí significa «no ha asistido a ninguna» — y por eso la sección solo se
   * pinta cuando hay array, no cuando hay elementos.
   *
   * Se piden EN DIFERIDO al abrir la lista, no al montar el portal: es la
   * única forma de tener historial sin meterlo en la carga de todo el mundo
   * (ver `fetchHistorialAsistidas`).
   */
  historial: Awaited<ReturnType<AlPedirHistorialPortal>> | null;
  historialCargando: boolean;
  /**
   * La bandeja de avisos. `null` = no se ha pedido todavía (o no hay de quién:
   * la previsualización corre sin sesión). Distinto de `[]`, que sí es «no
   * tienes ninguno» — y por eso el vacío solo se dice con array.
   */
  avisos: { id: string; tipo: string; texto: string; cuando: string; leido: boolean; accion: string | null }[] | null;
  avisosCargando: boolean;
  /** Qué sección abre «Información del centro». */
  infoKey: 'horario' | 'normas' | 'contacto' | 'privacidad';
  /**
   * La hoja abierta. `null` = ninguna.
   *
   * ⚠️ `cancelar` no es decorativa: hasta ahora el kit cancelaba una reserva
   * en el acto, sin preguntar. Es una acción IRREVERSIBLE —la plaza se libera
   * y puede irse a quien esté en la cola— y un toque de más en una lista se la
   * llevaba por delante.
   */
  hoja:
    | { tipo: 'cancelar'; classId: string; reservaId?: string }
    | { tipo: 'profesor'; id: string }
    | { tipo: 'espera'; classId: string }
    | { tipo: 'bono'; bonoId: string }
    | { tipo: 'pago' }
    /**
     * La reserva no salió. Antes esto era un TOAST y se iba solo en tres
     * segundos: la socia se quedaba sin saber si se había gastado un crédito
     * ni cómo volver a intentarlo. Es la única acción del portal que le cuesta
     * dinero, así que el fallo se queda en pantalla hasta que ella lo cierre.
     *
     * `reintentable` distingue «se cayó la conexión» de «el estudio ha dicho
     * que no» (sin bono, clase empezada, tope semanal…): ofrecer «Reintentar»
     * sobre un rechazo legítimo sería mandarla a repetir algo que va a volver
     * a fallar. Sale de comparar contra `ERROR_RED`, que es la ÚNICA frase que
     * `mensajeDeFalloAlGuardar` reserva para un fallo de red de verdad.
     */
    | { tipo: 'errorReserva'; classId: string; mensaje: string; reintentable: boolean }
    /**
     * El rechazo se explica solo: no tiene ningún bono ni plan activo, así que
     * no hay nada que reintentar — hay que comprar.
     *
     * ⚠️ NO es una comprobación PREVIA que le impida pulsar. Se decide DESPUÉS
     * de que el servidor haya dicho que no, y solo cuando su cartera está
     * vacía de verdad. Adivinarlo antes bloquearía a quien sí puede reservar:
     * un estudio puede tener `reserva_exigir_plan` desactivado, y un plan
     * ilimitado no cuenta sesiones. Aquí quien decide sigue siendo el servidor;
     * esto solo elige qué hoja lo cuenta.
     */
    | { tipo: 'sinCreditos'; classId: string }
    | null;
}

const STORAGE_KEY = "tentare-portal";

const initialState = (): PortalState => ({
  screen: "welcome",
  tab: "inicio",
  day: 4,
  filter: "todas",
  classId: "c1",
  spotElegido: null,
  booked: [],
  favourites: [],
  loading: false,
  notifications: NOTIFICATIONS.reduce<Record<string, boolean>>((acc, n) => ((acc[n.key] = n.on), acc), {}),
  challenges: [],
  exercise: 0,
  seconds: EXERCISES[0].seconds,
  running: false,
  toast: "",
  toastId: 0,
  alertsSeen: false,
  plan: "bono10",
  paying: false,
  authWorking: false,
  ultimaReserva: null,
  horarioTab: 'clases',
  bonosTab: 'bonos',
  // Semana primero: es la vista que responde «¿qué tengo esta semana?», que es
  // a lo que se entra en la agenda.
  agendaVista: 'semana',
  historial: null,
  historialCargando: false,
  avisos: null,
  avisosCargando: false,
  infoKey: 'horario',
  hoja: null,
});

type Action = { type: "patch"; patch: Partial<PortalState> } | { type: "reset" };

function reducer(state: PortalState, action: Action): PortalState {
  if (action.type === "reset") return initialState();
  return { ...state, ...action.patch };
}

/** Nunca restauramos estados transitorios: cargas, avisos ni cronómetro corriendo. */
function restore(): PortalState {
  const base = initialState();
  if (typeof window === "undefined") return base;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    // ⚠️ `day` NO se restaura: es el día del MES, así que el 4 guardado hace
    // dos semanas señala un día que ya no es el de esa semana. Con los datos de
    // muestra daba igual (el mes estaba congelado); con un estudio real, la
    // socia abría Clases en un día cualquiera del pasado.
    const { day: _descartado, ...guardado } = JSON.parse(raw) as Partial<PortalState>;
    // `ultimaReserva` tampoco se restaura: es el resultado de una acción que
    // acaba de ocurrir, no un estado. Restaurarlo abriría la app en «¡Reserva
    // confirmada!» días después de reservar.
    // La hoja tampoco se restaura: abrir la app con un «¿Cancelar esta
    // reserva?» de hace dos días sería, como poco, un susto.
    return { ...base, ...guardado, loading: false, toast: "", running: false, paying: false, authWorking: false, ultimaReserva: null, hoja: null };
  } catch {
    return base;
  }
}

export interface PortalActions {
  enter(): void;
  goTab(tab: TabId): void;
  goSchedule(): void;
  goBookings(): void;
  goPasses(): void;
  goVideos(): void;
  goCentro(): void;
  goTeachers(): void;
  goProfile(): void;
  goto(screen: ScreenId): void;
  openClass(id?: string): void;
  back(): void;
  reset(): void;
  selectDay(num: number): void;
  setFilter(key: string): void;
  setHorarioTab(tab: 'clases' | 'espera'): void;
  setBonosTab(tab: 'bonos' | 'historial'): void;
  setAgendaVista(vista: 'semana' | 'mes' | 'lista'): void;
  cargarHistorial(): void;
  cargarAvisos(): void;
  abrirAviso(id: string): void;
  goBuy(): void;
  goInfo(key: PortalState['infoKey']): void;
  goMisDatos(): void;
  abrirHoja(hoja: PortalState['hoja']): void;
  cerrarHoja(): void;
  goPrefs(): void;
  goProgress(): void;
  goInvitar(): void;
  logout(): void;
  guardarDatos(datos: Parameters<AlGuardarDatosPortal>[0]): void;
  /** `id` = reservar desde una fila del horario. Sin él, la clase abierta. */
  reserve(id?: string): void;
  /**
   * Elegir plaza en el detalle. Volver a pulsar la misma la suelta.
   *
   * ⚠️ Solo tiene sentido en un estudio que asigna sitio (reformers,
   * camillas). Donde no lo hace, `StudioClass.plazas` viene vacío, el detalle
   * no pinta la rejilla y esto no se llama nunca.
   */
  elegirPlaza(spotId: string | null): void;
  /** `reservaId` es lo que se manda al servidor; sin él solo se puede
   *  simular (la demo). Ver el comentario de `cancel` más abajo. */
  cancel(id: string, reservaId?: string): void;
  toggleFavourite(): void;
  showFavourites(): void;
  toggleChallenge(key: string): void;
  toggleNotification(key: string): void;
  alerts(): void;
  selectPlan(key: string): void;
  checkout(): void;
  pay(): void;
  authSubmit(): void;
  startSession(): void;
  exitSession(): void;
  playPause(): void;
  prevExercise(): void;
  nextExercise(): void;
}

/**
 * A dónde quiere ir el portal. Quien manda la navegación decide CÓMO se llega.
 *
 * El kit venía con la navegación dentro del store: pulsar "Clases" hacía
 * `set({ screen: 'clases' })`. Eso funciona en la demo, pero dentro de Tentare
 * manda `PortalShell` con las rutas de Next, y por dos motivos que no son de
 * gusto: las 7 pantallas que el kit no trae (`/progreso`, `/compras`,
 * `/preferencias`…) siguen siendo rutas, y una URL tiene que poder identificar
 * una clase — con la pantalla en el estado no se puede compartir ni guardar el
 * enlace de una clase, ni volver con el botón atrás del navegador.
 *
 * Por eso las doce acciones que navegaban pasan por aquí. Por defecto sigue
 * siendo el estado (la previsualización de temas se comporta igual que la
 * demo); el portal real pasa su propia función y empuja rutas.
 */
export interface DestinoPortal {
  screen: ScreenId;
  tab?: TabId;
  classId?: string;
  day?: number;
}

/**
 * Devuelve `true` si de verdad ha navegado. `false` = "esta pantalla no la
 * tengo como ruta", y entonces el store la abre él mismo.
 *
 * ⚠️ Antes esto devolvía `void` y el marco se limitaba a no hacer nada con lo
 * que no reconocía. El resultado era que tocar una clase —en el horario, en
 * Inicio o en "Ver clase" desde Reservas— no hacía absolutamente nada: el
 * detalle es la única pantalla desde la que se reserva, y no tenía ruta.
 */
export type NavegarPortal = (destino: DestinoPortal) => boolean;

/** Las cuatro pantallas que además son pestaña de la barra. */
const ES_PESTANA = (p: ScreenId): p is TabId =>
  p === "inicio" || p === "clases" || p === "reservas" || p === "perfil" ||
  p === "bonos" || p === "centro";

const StateCtx = createContext<PortalState | null>(null);
const ActionsCtx = createContext<PortalActions | null>(null);
const DatosCtx = createContext<DatosPortal>(DATOS_DE_MUESTRA);
const CromoDemoCtx = createContext(true);

export function useCromoDemo(): boolean {
  return useContext(CromoDemoCtx);
}

/**
 * `true` = esto es la maqueta del kit (la previsualización de temas), donde
 * las piezas que todavía no existen de verdad pueden enseñarse porque nadie
 * espera que funcionen. En el portal real es `false` y esas piezas no se
 * pintan: enseñar una "sesión guiada" que no reproduce nada, en una app por
 * la que una socia paga, es peor que no tenerla.
 */
const DemoCtx = createContext(true);

export function useEsDemo(): boolean {
  return useContext(DemoCtx);
}

/**
 * El interruptor día/noche, si quien monta el portal lo enchufa.
 *
 * `null` = no hay dónde guardarlo (la previsualización), y entonces la fila
 * «Aspecto» no se pinta. En el portal real sí, porque la socia ya la tiene.
 */
const AspectoCtx = createContext<AspectoPortal | null>(null);

export function useAspecto(): AspectoPortal | null {
  return useContext(AspectoCtx);
}

export interface CompraPortalVuelta { estado: 'ok' | 'cancelada'; planId: string | null }

const CompraCtx = createContext<CompraPortalVuelta | null>(null);

/** La vuelta de Stripe. `null` = no se viene de comprar nada. */
export function useCompra(): CompraPortalVuelta | null {
  return useContext(CompraCtx);
}

/**
 * Arranca el cobro real de un plan. Devuelve `null` si ya va camino de Stripe
 * (la pestaña se va) o el mensaje de error si no se pudo ni empezar.
 */
export type AlPagarPortal = (planId: string) => Promise<string | null>;

/**
 * Cancela una reserva de verdad. Devuelve `null` si el servidor lo confirmó, o
 * el mensaje de error si no — nunca se avisa de éxito sin esa confirmación.
 */
export type AlCancelarPortal = (reservaId: string) => Promise<string | null>;

/**
 * Pide el historial de clases asistidas de la socia. Devuelve `[]` si no hay
 * sesión o el servidor falla — la sección «Completadas» se calla en vez de
 * enseñar un error, porque es información de apoyo, no la razón de la
 * pantalla.
 *
 * Va inyectada como el resto de escrituras: el kit no sabe que existe Supabase.
 */
/**
 * Pide la bandeja de avisos de la socia, y marca la visita. Devuelve `[]` si
 * no hay sesión o el servidor falla.
 *
 * Inyectada como el resto: el kit no sabe que existe `/api/notifications`.
 */
export type AlPedirAvisosPortal = () => Promise<
  { id: string; tipo: string; texto: string; cuando: string; leido: boolean; accion: string | null }[]
>;

/** Abre un aviso: lo marca leído y navega a donde apunte. */
export type AlAbrirAvisoPortal = (id: string) => void;

/**
 * Marcar o desmarcar un TIPO de clase como favorito, contra el servidor.
 *
 * ⚠️ Por tipo de clase, no por sesión. El kit guardaba el id de la SESIÓN en
 * `localStorage` («el Reformer del martes a las 18») y el backend guarda
 * `tipo_clase_id` («Reformer»): el corazón se apagaba solo al cambiar de
 * semana y no llegaba nada al servidor. Devuelve el error si lo hubo.
 */
export type AlAlternarFavoritoPortal = (
  tipoClaseId: string,
  accion: 'marcar' | 'desmarcar',
) => Promise<string | null>;

export type AlPedirHistorialPortal = () => Promise<
  {
    reservaId: string; sesionId: string; inicio: string; nombre: string; instructora: string;
    /** Cómo acabó: asistió, la canceló, o no apareció. */
    estado: 'ASISTIDA' | 'CANCELADA' | 'NO_SHOW';
  }[]
>;

/**
 * Guarda los datos de la socia. Devuelve `null` si el servidor lo confirmó, o
 * el mensaje de error si no — nunca se avisa de «Guardado» sin esa respuesta.
 */
export type AlGuardarDatosPortal = (datos: {
  nombre: string; apellidos: string; email: string;
  telefono: string; fechaNacimiento: string; direccion: string;
}) => Promise<string | null>;

/**
 * El interruptor día/noche del portal (`lib/portal-modo`).
 *
 * ⚠️ Entra por prop y no lo lee el kit: es del portal de siempre, con su
 * `localStorage` y sus tokens, y el kit no debe conocerlo. Que sea opcional es
 * lo que hace que la fila «Aspecto» NO se pinte en la previsualización —donde
 * no hay dónde guardarlo— y SÍ en el portal real, que es donde la socia ya la
 * tiene hoy. Quitarla habría sido que el rediseño le costara un ajuste.
 */
export interface AspectoPortal { noche: boolean; toggle: () => void }

/**
 * Reserva de verdad.
 *
 * Devuelve el mensaje ya redactado en los dos casos, no un booleano: quien
 * sabe si la plaza quedó CONFIRMADA, en LISTA_ESPERA o PENDIENTE_APROBACION es
 * el servidor, y "Reservada. Te esperamos" no vale para las tres. Nunca se
 * dice nada sin esta respuesta (bug #500).
 */
export type AlReservarPortal = (sesionId: string, spotId?: string | null) => Promise<
  | {
      ok: true;
      /**
       * ⚠️ El ESTADO, no solo el mensaje. La pantalla de confirmación tiene que
       * decir la verdad —«confirmada», «en lista de espera» o «pendiente de
       * aprobación»— y adivinarlo parseando el texto sería reconstruir el dato
       * que el servidor ya devuelve. Es la misma lección del bug #500: quien
       * sabe qué pasó es la base de datos.
       */
      estado: 'CONFIRMADA' | 'LISTA_ESPERA' | 'PENDIENTE_APROBACION';
      mensaje: string;
    }
  | { ok: false; error: string }
>;

/**
 * `datos` es lo que cambia de un estudio a otro (clases, semana, planes, bono,
 * socia). Por defecto, los de muestra: así la previsualización de temas — donde
 * no hay estudio ni sesión — sigue funcionando sin pasar nada.
 */
export function PortalProvider({
  datos = DATOS_DE_MUESTRA,
  navegar,
  alPagar,
  alCancelar,
  alReservar,
  alGuardarDatos,
  alAlternarFavorito,
  alPedirHistorial,
  alPedirAvisos,
  alAbrirAviso,
  alSalir,
  aspecto,
  compra,
  pantalla,
  pantallasSinRuta,
  diaPorDefecto,
  cromoDemo = true,
  esDemo = true,
  children,
}: {
  datos?: DatosPortal;
  /**
   * La vuelta de Stripe tras comprar un bono, leída de la URL por quien monta
   * el portal. `null` = no se viene de comprar.
   *
   * ⚠️ `estado: 'ok'` es lo que dice STRIPE, no lo que dice nuestra base de
   * datos: quien entrega el bono es el webhook y puede tardar. Por eso viaja
   * también `planId` — la pantalla comprueba que el bono esté antes de
   * felicitar a nadie.
   */
  compra?: CompraPortalVuelta | null;
  /** Día del mes que sale seleccionado al abrir. Sin esto, el de la demo. */
  diaPorDefecto?: number;
  /** La barra de estado falsa y la isla dinámica del marco de teléfono. Van
   *  en la demo y en la previsualización; en el portal de verdad son un
   *  adorno que finge ser el sistema operativo, encima con la hora mal. */
  cromoDemo?: boolean;
  /** `false` en el portal real: apaga lo que todavía es maqueta. Ver `DemoCtx`. */
  esDemo?: boolean;
  /** Sin esto, navegar es cambiar el estado (el comportamiento de la demo). */
  navegar?: NavegarPortal;
  /** Sin esto, "Continuar al pago" abre la maqueta de tarjeta del kit en vez
   *  de cobrar. Solo lo pasa el portal real. */
  alPagar?: AlPagarPortal;
  /** Sin esto, "Cancelar" solo borra una fila de la pantalla. */
  alCancelar?: AlCancelarPortal;
  alAlternarFavorito?: AlAlternarFavoritoPortal;
  alPedirHistorial?: AlPedirHistorialPortal;
  alPedirAvisos?: AlPedirAvisosPortal;
  alAbrirAviso?: AlAbrirAvisoPortal;
  /** Sin esto, "Reservar mi plaza" es un `setTimeout`. */
  alReservar?: AlReservarPortal;
  alGuardarDatos?: AlGuardarDatosPortal;
  /** Sin esto, «Cerrar sesión» solo reinicia la maqueta. */
  alSalir?: () => void;
  aspecto?: AspectoPortal;
  /** La pantalla que manda desde fuera. Con `navegar` por rutas, el estado
   *  interno nunca cambia de pantalla: la dice la ruta. */
  pantalla?: ScreenId;
  /**
   * Las pantallas que este kit pinta SIN ruta propia (el detalle de una clase).
   * Solo esas gobiernan por encima de `pantalla`, o abrir una clase se desharía
   * en el mismo render. Cualquier otra cosa la manda la ruta — incluido el
   * estado inicial del store, que si entrara aquí dejaría el portal congelado
   * en `welcome`. Ver `mandaLaRuta`.
   */
  pantallasSinRuta?: readonly ScreenId[];
  children: React.ReactNode;
}) {
  const [state, dispatch] = useReducer(
    reducer,
    diaPorDefecto,
    (dia) => (dia === undefined ? initialState() : { ...initialState(), day: dia }),
  );

  // Los datos también por ref, y por el mismo motivo que el estado: las
  // acciones se construyen UNA vez. Si entraran en las dependencias del
  // `useMemo`, cada refresco de datos crearía acciones nuevas y volvería a
  // renderizar todo el portal para nada.
  const datosRef = useRef(datos);
  useEffect(() => {
    datosRef.current = datos;
  }, [datos]);


  // El espejo del estado para leerlo sin capturarlo en una clausura vieja: las
  // acciones se construyen una vez (`useMemo`) y el intervalo de la sesión
  // guiada corre fuera de React. Se actualiza en un efecto y no en el render
  // (`react-hooks/refs`): todos los que lo leen — manejadores de evento y el
  // callback del intervalo — corren después del commit, así que nunca ven un
  // valor viejo por esto.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const hydrated = useRef(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reserveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // El estado guardado se aplica después del primer render para que el HTML
  // del servidor y el del cliente coincidan.
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    dispatch({ type: "patch", patch: restore() });
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    // ⚠️ `historial` NO se persiste, y no es un descuido: son datos del
    // SERVIDOR, no estado de pantalla. Guardarlos dejaría a la socia abriendo
    // la app con el historial de la semana pasada —sin la clase de ayer— hasta
    // que algo lo refrescara, y encima metería sus clases en el
    // `localStorage` de un dispositivo compartido. Con `null` se vuelve a
    // pedir, que es barato y siempre cierto.
    // ⚠️ `favourites` tampoco se persiste, por el mismo motivo que `historial`:
    // desde que el corazón habla con `/api/public/favoritos`, la lista es del
    // SERVIDOR. Guardarla dejaría a la socia viendo en un móvil las favoritas
    // que quitó en otro, y encima ganando la copia vieja al llegar la buena.
    const { toast, toastId, loading, running, paying, authWorking, historial, historialCargando,
            avisos, avisosCargando, favourites: _favoritasDelServidor, ...rest } = state;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rest));
    } catch {
      /* almacenamiento lleno o bloqueado: el portal sigue funcionando */
    }
  }, [state]);

  const set = useCallback((patch: Partial<PortalState>) => dispatch({ type: "patch", patch }), []);

  // Las favoritas las manda el catálogo. El corazón las cambia de forma
  // optimista y `cargarPublico` re-sincroniza al terminar la escritura, así
  // que esto es lo que devuelve el servidor a la última — y si rechazó algo,
  // lo corrige solo.
  const favoritasDeDatos = datos.favoritas.join("|");
  useEffect(() => {
    set({ favourites: favoritasDeDatos ? favoritasDeDatos.split("|") : [] });
    // `favoritasDeDatos` es una CADENA a propósito: con el array, un catálogo
    // nuevo con las mismas favoritas dispararía esto en cada refresco.
  }, [favoritasDeDatos, set]);


  // Mismo motivo que `datosRef`: `navegar` cambia de identidad en cada render
  // del portal real (se construye con el router), y no puede reconstruir las
  // acciones cada vez.
  const navegarRef = useRef(navegar);
  useEffect(() => {
    navegarRef.current = navegar;
  }, [navegar]);

  const alPagarRef = useRef(alPagar);
  useEffect(() => {
    alPagarRef.current = alPagar;
  }, [alPagar]);

  const alAlternarFavoritoRef = useRef(alAlternarFavorito);
  useEffect(() => { alAlternarFavoritoRef.current = alAlternarFavorito; }, [alAlternarFavorito]);

  const alPedirHistorialRef = useRef(alPedirHistorial);
  useEffect(() => { alPedirHistorialRef.current = alPedirHistorial; }, [alPedirHistorial]);
  const alPedirAvisosRef = useRef(alPedirAvisos);
  useEffect(() => { alPedirAvisosRef.current = alPedirAvisos; }, [alPedirAvisos]);
  const alAbrirAvisoRef = useRef(alAbrirAviso);
  useEffect(() => { alAbrirAvisoRef.current = alAbrirAviso; }, [alAbrirAviso]);
  const alCancelarRef = useRef(alCancelar);
  useEffect(() => {
    alCancelarRef.current = alCancelar;
  }, [alCancelar]);

  const alSalirRef = useRef(alSalir);
  useEffect(() => {
    alSalirRef.current = alSalir;
  }, [alSalir]);

  const alGuardarDatosRef = useRef(alGuardarDatos);
  useEffect(() => {
    alGuardarDatosRef.current = alGuardarDatos;
  }, [alGuardarDatos]);

  const alReservarRef = useRef(alReservar);
  useEffect(() => {
    alReservarRef.current = alReservar;
  }, [alReservar]);

  const ir = useCallback((destino: DestinoPortal) => {
    const fuera = navegarRef.current;
    if (!fuera) return set(destino);

    // ⚠️ Solo la PANTALLA es ruta. El día elegido, la pestaña y la clase
    // abierta son estado de esta pantalla, y delegarlos enteros al navegador
    // de fuera los tiraba a la basura.
    //
    // Es el fallo que reportó el fundador: pulsar el día 7 en la tira manda
    // `{ screen: 'clases', day: 7 }`, el portal se quedaba solo con 'clases',
    // y como YA estaba en Clases el `router.push` no hacía nada. Resultado:
    // el día seleccionado no se movía y sus clases del 7 y del 8 —que existen
    // en la base de datos— parecían no existir.
    const { estado } = repartirDestino(destino);
    if (estado) set(estado);
    // Si fuera no sabe llevarla ahí, la abrimos aquí. La ruta sigue siendo la
    // de la sección (Clases), y el detalle vive dentro — igual que la hoja de
    // reserva del portal de siempre, que tampoco tiene URL propia.
    if (!fuera(destino)) set({ screen: destino.screen });
  }, [set]);

  const notify = useCallback(
    (text: string) => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
      set({ toast: text, toastId: stateRef.current.toastId + 1 });
      toastTimer.current = setTimeout(() => set({ toast: "" }), 2400);
    },
    [set],
  );

  // Un solo intervalo para todo el portal. Solo trabaja si la sesión corre.
  useEffect(() => {
    const id = setInterval(() => {
      const s = stateRef.current;
      if (!s.running || s.screen !== "sesion") return;
      if (s.seconds > 1) return set({ seconds: s.seconds - 1 });
      const next = s.exercise + 1;
      if (next < EXERCISES.length) return set({ exercise: next, seconds: EXERCISES[next].seconds });
      set({ running: false, seconds: 0 });
      notify("Sesión completada");
    }, 1000);
    return () => clearInterval(id);
  }, [set, notify]);

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
      if (reserveTimer.current) clearTimeout(reserveTimer.current);
    },
    [],
  );

  const actions = useMemo<PortalActions>(() => {
    const skip = (delta: number) => {
      const s = stateRef.current;
      const i = Math.min(EXERCISES.length - 1, Math.max(0, s.exercise + delta));
      set({ exercise: i, seconds: EXERCISES[i].seconds });
    };

    const self: PortalActions = {
      enter: () => ir({ screen: "inicio", tab: "inicio" }),
      goTab: (tab) => ir({ tab, screen: tab }),
      goSchedule: () => ir({ tab: "clases", screen: "clases" }),
      goBookings: () => ir({ tab: "reservas", screen: "reservas" }),
      // Bonos NO es una pestaña (`TabId` son cuatro) pero SÍ es pantalla y
      // ruta (`/portal/<slug>/bonos`, ver PANTALLA_A_RUTA en el marco): se
      // navega sin tocar `tab`, igual que `goto`. Existe como acción propia y
      // no como `goto("bonos")` suelto para que los bloques no tengan que
      // saber cómo se llama la pantalla.
      goPasses: () => ir({ tab: "bonos", screen: "bonos" }),
      goCentro: () => ir({ tab: "centro", screen: "centro" }),
      // Como Vídeos: es RUTA del portal (`/portal/<slug>/instructores`, la
      // sirve el portal de siempre) sin pantalla propia en el kit.
      goTeachers: () => ir({ screen: "instructores" }),
      // Vídeos es RUTA del portal (`/portal/<slug>/videos`, la sirve el portal
      // de siempre) pero el kit no tiene pantalla propia: en la
      // previsualización el `SCREENS[...] ?? Home` la deja en el Inicio, que
      // es lo honesto — no hay nada de vídeos que enseñar ahí.
      goVideos: () => ir({ screen: "videos" }),
      goProfile: () => ir({ tab: "perfil", screen: "perfil" }),
      goto: (screen) => ir({ screen }),
      openClass: (id) => {
        // ⚠️ La plaza es de UNA clase. Ver `spotElegido`.
        const destino = id || stateRef.current.classId;
        if (destino !== stateRef.current.classId) set({ spotElegido: null });
        ir({ screen: "detalle", classId: destino });
      },
      elegirPlaza: (spotId) =>
        set({ spotElegido: stateRef.current.spotElegido === spotId ? null : spotId }),
      back: () => {
        // El cronómetro se para aquí y no en el destino: si la navegación la
        // lleva una ruta, el store de esta pantalla se desmonta y nadie más
        // lo pararía.
        set({ running: false });
        ir({ screen: stateRef.current.tab });
      },
      reset: () => {
        if (toastTimer.current) clearTimeout(toastTimer.current);
        if (reserveTimer.current) clearTimeout(reserveTimer.current);
        dispatch({ type: "reset" });
      },

      selectDay: (num) => ir({ day: Number(num), tab: "clases", screen: "clases" }),
      setFilter: (key) => set({ filter: key }),
      setHorarioTab: (horarioTab) => set({ horarioTab }),
      setBonosTab: (bonosTab) => set({ bonosTab }),
      setAgendaVista: (agendaVista) => set({ agendaVista }),
      // Una sola vez por montaje: `historial !== null` ya significa «pedido».
      // Sin esa guarda, el efecto que la llama al abrir la lista dispararía una
      // petición por render.
      cargarAvisos: () => {
        const pedir = alPedirAvisosRef.current;
        const s = stateRef.current;
        if (!pedir || s.avisos !== null || s.avisosCargando) return;
        set({ avisosCargando: true });
        pedir()
          .then((avisos) => set({ avisos, avisosCargando: false, alertsSeen: true }))
          // Un fallo deja `avisos` en `null`, no en `[]`: «no he podido leer la
          // bandeja» y «no tienes avisos» son cosas distintas.
          .catch(() => set({ avisosCargando: false }));
      },
      abrirAviso: (id) => { alAbrirAvisoRef.current?.(id); },

      cargarHistorial: () => {
        const pedir = alPedirHistorialRef.current;
        const s = stateRef.current;
        if (!pedir || s.historial !== null || s.historialCargando) return;
        set({ historialCargando: true });
        pedir()
          .then((historial) => set({ historial, historialCargando: false }))
          // Un fallo deja `historial` en `null`, no en `[]`: `[]` diría «no has
          // asistido a ninguna», que es una afirmación distinta de «no lo he
          // podido cargar». Así la sección no se pinta en vez de mentir.
          .catch(() => set({ historialCargando: false }));
      },
      // Elegir el bono es un paso propio en Tentada; en los otros temas la
      // elección vive dentro de la pantalla de Bonos y `checkout` va directo.
      goBuy: () => ir({ screen: "comprar" }),
      goInfo: (infoKey) => { set({ infoKey }); ir({ screen: "info" }); },
      goMisDatos: () => ir({ screen: "misdatos" }),
      abrirHoja: (hoja) => set({ hoja }),
      cerrarHoja: () => set({ hoja: null }),
      // Avisos y Progreso son RUTAS del portal de siempre (`/preferencias`,
      // `/progreso`) y ahí se quedan: las dos tienen más de lo que dibuja el
      // prototipo —control por canal y push la primera, recompensas y créditos
      // la segunda— y el kit todavía no las cubre.
      goPrefs: () => ir({ screen: "preferencias" }),
      goProgress: () => ir({ screen: "progreso" }),
      goInvitar: () => ir({ screen: "invitar" }),
      // Cerrar sesión lo hace quien tiene la sesión, no el kit. Sin vía real
      // (la previsualización) vuelve a la bienvenida, como la demo.
      logout: () => { const f = alSalirRef.current; if (f) return f(); self.reset(); },
      guardarDatos: (campos) => {
        const guardar = alGuardarDatosRef.current;
        // Sin vía real esto es la previsualización: se dice, en vez de fingir
        // un «Guardado» que no guarda nada.
        if (!guardar) return notify("Vista previa: esto no se guarda de verdad");
        if (stateRef.current.loading) return;
        set({ loading: true });
        guardar(campos).then((error: string | null) => {
          set({ loading: false });
          // Nada de escritura optimista: el aviso sale con lo que respondió el
          // servidor, y solo se vuelve atrás si dijo que sí.
          if (error) return notify(error);
          notify("Datos guardados");
          self.back();
        });
      },

      reserve: (id) => {
        // Se llega también desde la hoja de lista de espera, que tiene que
        // cerrarse al confirmar — como hace `cancel`.
        set({ hoja: null });
        const s = stateRef.current;
        // La fila del horario reserva la SUYA, no la que quedara abierta antes.
        const classId = id ?? s.classId;
        const cls = buscarClase(datosRef.current, classId);
        // Sin clase no hay nada que reservar: la lista puede estar vacía de
        // verdad (semana sin programar) o la clase haberse cancelado mientras
        // la socia tenía la pantalla abierta.
        if (!cls) return;

        // La vía de verdad. El `setTimeout` de abajo es la maqueta del kit y
        // solo corre en la previsualización: aquí no se anuncia nada que el
        // servidor no haya confirmado (bug #500). Cancelar desde el detalle va
        // por `cancel`, que ya tiene su propio camino real.
        const reservar = alReservarRef.current;
        if (reservar) {
          const reservada = (datosRef.current.reservadas ?? []).find((r) => r.classId === classId);
          if (reservada) return self.cancel(classId, reservada.reservaId);
          if (s.loading) return;
          set({ loading: true, classId });
          // La plaza elegida solo vale para ESTA clase; si se reserva desde una
          // fila del horario (`id`), no hay ninguna elegida y va `null`.
          const plaza = id && id !== s.classId ? null : s.spotElegido;
          reservar(classId, plaza).then((r) => {
            if (!r.ok) {
              // ⚠️ La plaza elegida NO se suelta cuando la reserva falla: si se
              // cayó la conexión, «Reintentar» tiene que pedir el MISMO sitio.
              // Soltarla aquí convertía el segundo intento en «que me la
              // asignen», que no es lo que ella eligió.
              //
              // Y si su cartera está vacía, el rechazo tiene una salida mejor
              // que «reintentar»: comprar. La decisión la sigue tomando el
              // servidor —esto solo elige qué hoja lo explica— y se mira la
              // cartera ENTERA (`bonos`), no el bono contable: un plan
              // ilimitado no tiene sesiones que contar y `bono.total` sería 0
              // teniéndolo activo.
              const sinNada = datosRef.current.bonos.length === 0;
              return set({
                loading: false,
                hoja: sinNada
                  ? { tipo: 'sinCreditos', classId }
                  : { tipo: 'errorReserva', classId, mensaje: r.error, reintentable: r.error === ERROR_RED },
              });
            }
            set({ loading: false, spotElegido: null });
            // A la pantalla de confirmación con el desenlace que dio el
            // SERVIDOR. El aviso se queda igualmente: si la navegación la
            // lleva una ruta que aún no ha pintado, el mensaje ya está.
            set({ ultimaReserva: { classId, estado: r.estado } });
            notify(r.mensaje);
            ir({ screen: "confirmada" });
          });
          return;
        }

        if (s.booked.includes(classId)) {
          set({ booked: s.booked.filter((x) => x !== classId) });
          return notify("Reserva anulada");
        }
        // La maqueta del kit. Sin plazas simula la cola, no un fallo: es lo que
        // hace el servidor de verdad, y así la previsualización enseña también
        // ese desenlace en vez de solo el feliz.
        const estado = cls.seats ? "CONFIRMADA" as const : "LISTA_ESPERA" as const;
        set({ loading: true, classId });
        if (reserveTimer.current) clearTimeout(reserveTimer.current);
        reserveTimer.current = setTimeout(() => {
          const now = stateRef.current;
          set({
            loading: false,
            booked: estado === "CONFIRMADA" ? now.booked.concat([classId]) : now.booked,
            ultimaReserva: { classId, estado },
          });
          notify(estado === "CONFIRMADA"
            ? "Reservada · " + cls.time + " en " + cls.room
            : "Completa · estás en la lista de espera");
          ir({ screen: "confirmada" });
        }, 800);
      },
      // ⚠️ Esto anunciaba "Reserva cancelada" SIN hablar con el servidor: la
      // socia se iba tranquila, el estudio le seguía guardando la plaza y podía
      // acabar con un no-show. Es el patrón de fallo más caro de este repo
      // (#500), y aquí estaba en una pantalla que el portal real ya montaba.
      //
      // Con `alCancelar` (lo pasa el portal real) se cancela de verdad y solo
      // se avisa cuando el servidor lo confirma. Sin él —la previsualización,
      // donde no hay ninguna reserva que cancelar— se queda la maqueta.
      cancel: (id, reservaId) => {
        set({ hoja: null });
        const cancelar = alCancelarRef.current;
        if (!cancelar) {
          set({ booked: stateRef.current.booked.filter((x) => x !== id) });
          return notify("Reserva cancelada");
        }
        if (!reservaId || stateRef.current.loading) return;
        set({ loading: true });
        cancelar(reservaId).then((error) => {
          set({ loading: false });
          notify(error ?? "Reserva cancelada");
        });
      },
      /**
       * El corazón del detalle.
       *
       * ⚠️ Guarda el TIPO de clase, no la sesión abierta. Antes escribía
       * `classId` en `localStorage` y no llamaba a nadie: la socia marcaba «el
       * Reformer del martes», el corazón se apagaba solo al cambiar de semana
       * —porque la sesión ya era otra— y el servidor no se enteraba nunca. El
       * backend (`/api/public/favoritos`) siempre guardó `tipo_clase_id`.
       */
      toggleFavourite: () => {
        const s = stateRef.current;
        const cls = buscarClase(datosRef.current, s.classId);
        // Sin clase abierta no hay tipo que marcar.
        if (!cls) return;
        const tipo = cls.type;
        const dentro = s.favourites.includes(tipo);
        // Optimista, como el resto del portal: se ve al instante y el servidor
        // manda al final. Si dice que no, se deshace y se cuenta — nada de
        // dejar el corazón encendido sobre un favorito que no existe.
        set({ favourites: dentro ? s.favourites.filter((x) => x !== tipo) : s.favourites.concat([tipo]) });
        const alternar = alAlternarFavoritoRef.current;
        if (!alternar) return notify(dentro ? "Fuera de favoritas" : "Guardada en favoritas");
        alternar(tipo, dentro ? 'desmarcar' : 'marcar').then((error) => {
          if (!error) return notify(dentro ? "Fuera de favoritas" : "Guardada en favoritas");
          const ahora = stateRef.current.favourites;
          set({ favourites: dentro ? ahora.concat([tipo]) : ahora.filter((x) => x !== tipo) });
          notify(error);
        });
      },
      /** Antes esto era un AVISO con el número. Ahora lleva a su pantalla. */
      showFavourites: () => ir({ screen: "favoritas" }),

      toggleChallenge: (key) => {
        const s = stateRef.current;
        const inside = s.challenges.includes(key);
        set({ challenges: inside ? s.challenges.filter((x) => x !== key) : s.challenges.concat([key]) });
        notify(inside ? "Te has salido del reto" : "¡Dentro del reto!");
      },

      toggleNotification: (key) => {
        const s = stateRef.current;
        set({ notifications: { ...s.notifications, [key]: !s.notifications[key] } });
      },
      // ⚠️ Esto decía «Tienes 2 avisos sin leer» con el 2 escrito a mano en el
      // kit de diseño, sin mirar ninguna bandeja. Ahora abre la bandeja de
      // verdad; si el tema no la monta (los cuatro anteriores), se queda el
      // aviso flotante pero SIN inventarse una cifra.
      alerts: () => {
        if (alPedirAvisosRef.current) { ir({ screen: "avisos" }); return; }
        notify("Tus avisos están en el menú del portal");
        set({ alertsSeen: true });
      },

      selectPlan: (key) => set({ plan: key }),

      // ⚠️ "Continuar al pago" era un botón muerto en el portal de verdad, y
      // por dos motivos a la vez: `checkout` no tenía ruta (el `router.push`
      // no encontraba a dónde ir y no pasaba nada), y la pantalla a la que
      // apuntaba es el formulario de tarjeta DE MENTIRA del kit — pedía número
      // y CVC en nuestro propio DOM y no cobraba nada.
      //
      // Con `alPagar` (el portal real lo pasa) se va al Checkout alojado de
      // Stripe, que es donde se cobra de verdad y el único sitio donde puede
      // teclearse una tarjeta. Sin él —la previsualización de temas, donde no
      // hay estudio ni socia— se queda la maqueta de siempre.
      checkout: () => {
        const pagar = alPagarRef.current;
        if (!pagar) return ir({ screen: "checkout" });

        const s = stateRef.current;
        if (s.paying) return; // doble pulsación: un solo intento de cobro
        if (!s.plan) return notify("Elige antes un bono o un plan");

        set({ paying: true });
        // Nada de escritura optimista con dinero: el estado solo se suelta si
        // el servidor NO nos manda a Stripe. Si sí, la pestaña se va y dejar
        // `paying` puesto es lo correcto (el botón queda bloqueado hasta que
        // el navegador cambia de página).
        pagar(s.plan).then((error) => {
          if (!error) return;
          set({ paying: false });
          notify(error);
        });
      },
      pay: () => {
        if (stateRef.current.paying) return;
        set({ paying: true });
        setTimeout(() => {
          set({ paying: false, screen: "perfil", tab: "perfil" });
          notify("Pago confirmado · bono activado");
        }, 1100);
      },

      authSubmit: () => {
        if (stateRef.current.authWorking) return;
        set({ authWorking: true });
        setTimeout(() => {
          set({ authWorking: false });
          self.enter();
          notify("Hola de nuevo, Laura");
        }, 900);
      },

      startSession: () => {
        set({ exercise: 0, seconds: EXERCISES[0].seconds, running: true });
        ir({ screen: "sesion" });
      },
      exitSession: () => {
        set({ running: false });
        ir({ screen: "detalle" });
      },
      playPause: () => {
        const s = stateRef.current;
        if (!s.seconds) return set({ exercise: 0, seconds: EXERCISES[0].seconds, running: true });
        set({ running: !s.running });
      },
      prevExercise: () => skip(-1),
      nextExercise: () => skip(1),
    };
    return self;
  }, [set, notify, ir]);

  // Con la navegación por rutas, el estado interno nunca cambia de pantalla:
  // la dice quien monta el provider. Se pisa aquí y no en el reducer para que
  // el resto del estado (reservas, favoritas, filtro) siga siendo del store.
  // ⚠️ Arrastra también `tab`, no solo `screen`. Sin esto se navegaba a Clases
  // y la barra seguía marcando Inicio: `tab` vive en el store y con la
  // navegación por rutas nadie lo actualizaba.
  //
  // ⚠️ Y solo cuando la pantalla ABIERTA es una ruta. Si la socia ha abierto el
  // detalle de una clase —que no tiene ruta propia— pisarlo con la pantalla de
  // la ruta lo cerraría en el mismo render en el que se abre: el detalle
  // parpadearía y volvería al horario.
  const gobiernaLaRuta = mandaLaRuta(state.screen, pantallasSinRuta);
  const estado = pantalla && gobiernaLaRuta
    ? { ...state, screen: pantalla, ...(ES_PESTANA(pantalla) ? { tab: pantalla } : null) }
    : state;

  return (
    <DemoCtx.Provider value={esDemo}>
    <CromoDemoCtx.Provider value={cromoDemo}>
    <AspectoCtx.Provider value={aspecto ?? null}>
    <CompraCtx.Provider value={compra ?? null}>
    <DatosCtx.Provider value={datos}>
      <StateCtx.Provider value={estado}>
        <ActionsCtx.Provider value={actions}>{children}</ActionsCtx.Provider>
      </StateCtx.Provider>
    </DatosCtx.Provider>
    </CompraCtx.Provider>
    </AspectoCtx.Provider>
    </CromoDemoCtx.Provider>
    </DemoCtx.Provider>
  );
}

export function useDatos(): DatosPortal {
  return useContext(DatosCtx);
}

export function usePortal(): PortalState {
  const value = useContext(StateCtx);
  if (!value) throw new Error("usePortal fuera de <PortalProvider>");
  return value;
}

export function useActions(): PortalActions {
  const value = useContext(ActionsCtx);
  if (!value) throw new Error("useActions fuera de <PortalProvider>");
  return value;
}

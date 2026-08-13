"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from "react";
import { DATOS_DE_MUESTRA, EXERCISES, NOTIFICATIONS, buscarClase, plural } from "@/components/portal-tema/data/studio";
import type { DatosPortal } from "@/lib/portal-tema/tipos";
import { mandaLaRuta, repartirDestino } from "@/lib/portal-tema/navegacion";

export type ScreenId =
  | "welcome" | "login" | "registro"
  | "inicio" | "clases" | "calendario" | "reservas" | "perfil" | "centro"
  | "bonos" | "checkout" | "detalle" | "sesion" | "videos" | "instructores"
  | "confirmada" | "comprar" | "info" | "misdatos" | "preferencias" | "progreso" | "invitar";

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
    | null;
}

const STORAGE_KEY = "tentare-portal";

const initialState = (): PortalState => ({
  screen: "welcome",
  tab: "inicio",
  day: 4,
  filter: "todas",
  classId: "c1",
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
export type AlReservarPortal = (sesionId: string) => Promise<
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
  alSalir,
  aspecto,
  pantalla,
  pantallasDeRuta,
  diaPorDefecto,
  cromoDemo = true,
  esDemo = true,
  children,
}: {
  datos?: DatosPortal;
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
   * Qué pantallas SÍ son una ruta. Solo esas las manda `pantalla`; las que no
   * (el detalle de una clase) las gobierna el estado, o abrir una clase se
   * desharía en el mismo render.
   */
  pantallasDeRuta?: readonly ScreenId[];
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
    const { toast, toastId, loading, running, paying, authWorking, ...rest } = state;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rest));
    } catch {
      /* almacenamiento lleno o bloqueado: el portal sigue funcionando */
    }
  }, [state]);

  const set = useCallback((patch: Partial<PortalState>) => dispatch({ type: "patch", patch }), []);

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
      openClass: (id) => ir({ screen: "detalle", classId: id || stateRef.current.classId }),
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
          reservar(classId).then((r) => {
            set({ loading: false });
            if (!r.ok) return notify(r.error);
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
      toggleFavourite: () => {
        const s = stateRef.current;
        const inside = s.favourites.includes(s.classId);
        set({ favourites: inside ? s.favourites.filter((x) => x !== s.classId) : s.favourites.concat([s.classId]) });
        notify(inside ? "Fuera de favoritas" : "Guardada en favoritas");
      },
      showFavourites: () => {
        const n = stateRef.current.favourites.length;
        notify(n ? plural(n, "clase guardada", "clases guardadas") : "Aún no tienes favoritas");
      },

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
      alerts: () => {
        notify(stateRef.current.alertsSeen ? "Nada nuevo" : "Tienes 2 avisos sin leer");
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
  const gobiernaLaRuta = mandaLaRuta(state.screen, pantallasDeRuta);
  const estado = pantalla && gobiernaLaRuta
    ? { ...state, screen: pantalla, ...(ES_PESTANA(pantalla) ? { tab: pantalla } : null) }
    : state;

  return (
    <DemoCtx.Provider value={esDemo}>
    <CromoDemoCtx.Provider value={cromoDemo}>
    <AspectoCtx.Provider value={aspecto ?? null}>
    <DatosCtx.Provider value={datos}>
      <StateCtx.Provider value={estado}>
        <ActionsCtx.Provider value={actions}>{children}</ActionsCtx.Provider>
      </StateCtx.Provider>
    </DatosCtx.Provider>
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

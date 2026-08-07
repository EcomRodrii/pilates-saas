"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from "react";
import { DATOS_DE_MUESTRA, EXERCISES, NOTIFICATIONS, buscarClase, plural } from "@/components/portal-tema/data/studio";
import type { DatosPortal } from "@/lib/portal-tema/tipos";

export type ScreenId =
  | "welcome" | "login" | "registro"
  | "inicio" | "clases" | "calendario" | "reservas" | "perfil"
  | "bonos" | "checkout" | "detalle" | "sesion";

export type TabId = "inicio" | "clases" | "reservas" | "perfil";

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
    return { ...base, ...JSON.parse(raw), loading: false, toast: "", running: false, paying: false, authWorking: false };
  } catch {
    return base;
  }
}

export interface PortalActions {
  enter(): void;
  goTab(tab: TabId): void;
  goSchedule(): void;
  goBookings(): void;
  goProfile(): void;
  goto(screen: ScreenId): void;
  openClass(id?: string): void;
  back(): void;
  reset(): void;
  selectDay(num: number): void;
  setFilter(key: string): void;
  reserve(): void;
  cancel(id: string): void;
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

const StateCtx = createContext<PortalState | null>(null);
const ActionsCtx = createContext<PortalActions | null>(null);
const DatosCtx = createContext<DatosPortal>(DATOS_DE_MUESTRA);

/**
 * `datos` es lo que cambia de un estudio a otro (clases, semana, planes, bono,
 * socia). Por defecto, los de muestra: así la previsualización de temas — donde
 * no hay estudio ni sesión — sigue funcionando sin pasar nada.
 */
export function PortalProvider({
  datos = DATOS_DE_MUESTRA,
  children,
}: { datos?: DatosPortal; children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);

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
      enter: () => set({ screen: "inicio", tab: "inicio" }),
      goTab: (tab) => set({ tab, screen: tab }),
      goSchedule: () => set({ tab: "clases", screen: "clases" }),
      goBookings: () => set({ tab: "reservas", screen: "reservas" }),
      goProfile: () => set({ tab: "perfil", screen: "perfil" }),
      goto: (screen) => set({ screen }),
      openClass: (id) => set({ screen: "detalle", classId: id || stateRef.current.classId }),
      back: () => set({ screen: stateRef.current.tab, running: false }),
      reset: () => {
        if (toastTimer.current) clearTimeout(toastTimer.current);
        if (reserveTimer.current) clearTimeout(reserveTimer.current);
        dispatch({ type: "reset" });
      },

      selectDay: (num) => set({ day: Number(num), tab: "clases", screen: "clases" }),
      setFilter: (key) => set({ filter: key }),

      reserve: () => {
        const s = stateRef.current;
        const cls = buscarClase(datosRef.current, s.classId);
        // Sin clase no hay nada que reservar: la lista puede estar vacía de
        // verdad (semana sin programar) o la clase haberse cancelado mientras
        // la socia tenía la pantalla abierta.
        if (!cls) return;
        if (s.booked.includes(s.classId)) {
          set({ booked: s.booked.filter((x) => x !== s.classId) });
          return notify("Reserva anulada");
        }
        if (!cls.seats) return notify("Completa · te apunto a la lista de espera");
        set({ loading: true });
        if (reserveTimer.current) clearTimeout(reserveTimer.current);
        reserveTimer.current = setTimeout(() => {
          const now = stateRef.current;
          set({ loading: false, booked: now.booked.concat([now.classId]) });
          notify("Reservada · " + cls.time + " en " + cls.room);
        }, 800);
      },
      cancel: (id) => {
        set({ booked: stateRef.current.booked.filter((x) => x !== id) });
        notify("Reserva cancelada");
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
      checkout: () => set({ screen: "checkout" }),
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

      startSession: () => set({ screen: "sesion", exercise: 0, seconds: EXERCISES[0].seconds, running: true }),
      exitSession: () => set({ screen: "detalle", running: false }),
      playPause: () => {
        const s = stateRef.current;
        if (!s.seconds) return set({ exercise: 0, seconds: EXERCISES[0].seconds, running: true });
        set({ running: !s.running });
      },
      prevExercise: () => skip(-1),
      nextExercise: () => skip(1),
    };
    return self;
  }, [set, notify]);

  return (
    <DatosCtx.Provider value={datos}>
      <StateCtx.Provider value={state}>
        <ActionsCtx.Provider value={actions}>{children}</ActionsCtx.Provider>
      </StateCtx.Provider>
    </DatosCtx.Provider>
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

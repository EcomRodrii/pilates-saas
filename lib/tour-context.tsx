'use client';

// ─────────────────────────────────────────────────────────────────────────────
// El estado de la visita guiada (lib/tour/), para el marco del panel.
//
// Dos modos con las MISMAS pantallas:
//   · OBLIGATORIA — estudio nuevo, propietaria (lib/tour/aplica.ts). El progreso
//     vive en `studios.tour_progreso`: si cierras el ordenador a mitad del
//     capítulo 5 y abres el móvil mañana, sigues en el paso exacto. Sin «Salir».
//   · OPCIONAL — cualquier otra persona que pulse «Ver un tour del panel» en
//     Primeros pasos. Con «Salir», y el progreso en el navegador.
//
// ⚠️ useCore() y no useStudio(): esto vive en el marco de las 50 rutas del panel.
// Los datos que cierran un paso «hacer» (salas, clientas, tarifas…) viven en
// useStudio(), y los lee SOLO el detector que se monta mientras hay un paso así
// en pantalla (components/tour/detector-hecho.tsx). Si no, este provider se
// re-renderizaría con cualquiera de los ~90 campos del god-context.
//
// ⚠️ Guardar el progreso NUNCA bloquea la visita. Si la escritura falla, la
// visita sigue y se guarda una copia en el navegador (por estudio, para no
// mezclar cuentas); se reintenta con el paso siguiente. La copia existe SOLO
// mientras el servidor no tiene lo último: si se guardara siempre, ganaría al
// servidor y no se podría reiniciar la visita desde la base de datos.
// ─────────────────────────────────────────────────────────────────────────────

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useCore } from '@/lib/core-context';
import { usePermisos } from '@/lib/permisos';
import { esRutaCongelada } from '@/lib/frozen-features';
import { rutaFueraDelMenu } from '@/lib/nav-config';
import { capturarEvento } from '@/lib/posthog-cliente';
import { pasoAplica, visitaObligatoria } from '@/lib/tour/aplica';
import {
  PROGRESO_VACIO, abrirCapitulo, cerrarPaso, empezar, estadoVisita, parseProgreso, verCapitulo,
  type EstadoVisita, type ProgresoVisita,
} from '@/lib/tour/progreso';
import type { PasoVisita } from '@/lib/tour/capitulos';

const CLAVE_OPCIONAL = 'panel-tour-v2';
const CLAVE_RESPALDO = 'panel-tour-respaldo';
const PAUSA_GUARDADO_MS = 600;

interface TourValue {
  /** La visita está en marcha y hay algo que enseñar (o la pantalla de fin). */
  activo: boolean;
  /** No se puede cerrar: estudio nuevo, propietaria. */
  obligatoria: boolean;
  /** «Seguir otro día»: oculta el panel de la visita hasta recargar; queda la píldora. */
  pausada: boolean;
  estado: EstadoVisita;
  progreso: ProgresoVisita;
  escritorio: boolean;
  /** ¿Se le enseña este paso a esta persona ahora y aquí? */
  aplica: (paso: PasoVisita) => boolean;
  /** Para el botón «Ver un tour del panel» de Primeros pasos. */
  iniciarTour: () => void;
  empezarVisita: () => void;
  cerrar: (paso: PasoVisita, como: 'hecho' | 'aplazado') => void;
  cerrarCapitulo: (id: string, seguirOtroDia: boolean) => void;
  abrirCapitulo: (id: string) => void;
  reanudar: () => void;
  /** Solo la visita opcional. */
  salir: () => void;
  /** Termina la visita: la marca como completada en el servidor. */
  terminar: () => void;
}

const TourContext = createContext<TourValue | null>(null);

export function useTour(): TourValue {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error('useTour debe usarse dentro de TourProvider');
  return ctx;
}

function leerLocal(clave: string): ProgresoVisita | null {
  try {
    const bruto = localStorage.getItem(clave);
    return bruto === null ? null : parseProgreso(bruto);
  } catch { return null; }
}

function escribirLocal(clave: string, p: ProgresoVisita | null) {
  try {
    if (p === null) localStorage.removeItem(clave);
    else localStorage.setItem(clave, JSON.stringify(p));
  } catch { /* sin almacenamiento: la visita sigue igual */ }
}

const CERRADOS = (p: ProgresoVisita) => p.hechos.length + p.aplazados.length + p.vistos.length + p.abiertos.length + (p.inicio ? 1 : 0);

export function TourProvider({ children }: { children: React.ReactNode }) {
  const { studio, updateStudio } = useCore();
  const { rol, puedeVer } = usePermisos();

  const obligatoria = visitaObligatoria(studio, rol);

  // La visita opcional: encendida por el botón de Primeros pasos, con su progreso
  // en el navegador. `null` = no hay visita opcional en marcha.
  const [opcional, setOpcional] = useState<ProgresoVisita | null>(null);
  // Lo que ya se hidrató del servidor, para no volver a pisar el estado local.
  const [local, setLocal] = useState<ProgresoVisita | null>(null);
  const hidratado = useRef<string | null>(null);
  const [pausada, setPausada] = useState(false);
  const [escritorio, setEscritorio] = useState(true);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const act = () => setEscritorio(mq.matches);
    act();
    mq.addEventListener('change', act);
    return () => mq.removeEventListener('change', act);
  }, []);

  // La visita opcional sobrevive a cerrar el navegador.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage no existe en SSR: la lectura va en el efecto.
    setOpcional(leerLocal(CLAVE_OPCIONAL));
  }, []);

  // Hidrata la visita obligatoria del servidor, UNA vez por estudio. Si el servidor
  // va por detrás de la copia del navegador (una escritura que falló), gana la copia.
  const studioId = studio?.id ?? null;
  useEffect(() => {
    if (!obligatoria || !studioId || hidratado.current === studioId) return;
    hidratado.current = studioId;
    const servidor = parseProgreso(studio?.tourProgreso);
    const respaldo = leerLocal(`${CLAVE_RESPALDO}:${studioId}`);
    setLocal(respaldo && CERRADOS(respaldo) > CERRADOS(servidor) ? respaldo : servidor);
  }, [obligatoria, studioId, studio?.tourProgreso]);

  const progreso: ProgresoVisita = obligatoria ? (local ?? PROGRESO_VACIO) : (opcional ?? PROGRESO_VACIO);
  const hayVisita = obligatoria ? local !== null : opcional !== null;

  const aplica = useCallback(
    (paso: PasoVisita) => pasoAplica(paso, { puedeVer, esRutaCongelada, fueraDelMenu: rutaFueraDelMenu, escritorio }),
    [puedeVer, escritorio],
  );
  const estado = useMemo(() => estadoVisita(progreso, aplica), [progreso, aplica]);

  // ── Guardar ────────────────────────────────────────────────────────────────
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const guardarEnServidor = useCallback((p: ProgresoVisita, completada: boolean) => {
    if (!studioId) return;
    const clave = `${CLAVE_RESPALDO}:${studioId}`;
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => {
      const cambios = completada
        ? { tourProgreso: p, tourCompletadoEn: new Date().toISOString(), tourVistoEn: new Date().toISOString() }
        : { tourProgreso: p };
      // ⚠️ La copia del navegador existe SOLO si la escritura falló. Si se guardara siempre, una
      // copia vieja le ganaría al servidor al hidratar (CERRADOS(respaldo) > CERRADOS(servidor)) y
      // reiniciar la visita desde la base de datos no tendría efecto: pasó con la primera prueba.
      const fallo = () => escribirLocal(clave, p);
      Promise.resolve(updateStudio(cambios)).then(res => {
        if ((res as { ok?: boolean } | undefined)?.ok === false) fallo();
        else escribirLocal(clave, null);
      }).catch(fallo);
    }, completada ? 0 : PAUSA_GUARDADO_MS);
  }, [studioId, updateStudio]);

  useEffect(() => () => { if (temporizador.current) clearTimeout(temporizador.current); }, []);

  const aplicar = useCallback((siguiente: ProgresoVisita) => {
    if (obligatoria) { setLocal(siguiente); guardarEnServidor(siguiente, false); }
    else { setOpcional(siguiente); escribirLocal(CLAVE_OPCIONAL, siguiente); }
  }, [obligatoria, guardarEnServidor]);

  const value: TourValue = {
    activo: hayVisita,
    obligatoria,
    pausada,
    estado,
    progreso,
    escritorio,
    aplica,
    iniciarTour: () => {
      setPausada(false);
      const p = { ...PROGRESO_VACIO };
      setOpcional(p);
      escribirLocal(CLAVE_OPCIONAL, p);
      capturarEvento('tour_opcional_iniciado');
    },
    empezarVisita: () => { setPausada(false); aplicar(empezar(progreso)); capturarEvento('tour_iniciado', { obligatoria }); },
    cerrar: (paso, como) => {
      aplicar(cerrarPaso(progreso, paso.id, como));
      capturarEvento(como === 'hecho' ? 'tour_paso_completado' : 'tour_paso_aplazado', { paso: paso.id });
    },
    cerrarCapitulo: (id, seguirOtroDia) => {
      aplicar(verCapitulo(progreso, id));
      capturarEvento('tour_capitulo_completado', { capitulo: id });
      if (seguirOtroDia) setPausada(true);
    },
    abrirCapitulo: id => aplicar(abrirCapitulo(progreso, id)),
    reanudar: () => setPausada(false),
    salir: () => {
      if (obligatoria) return; // nunca
      setOpcional(null);
      escribirLocal(CLAVE_OPCIONAL, null);
    },
    terminar: () => {
      capturarEvento('tour_terminado', { obligatoria });
      if (obligatoria) { guardarEnServidor(progreso, true); setLocal(null); }
      else { setOpcional(null); escribirLocal(CLAVE_OPCIONAL, null); }
      setPausada(false);
    },
  };

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}

'use client';

// ─────────────────────────────────────────────────────────────────────────────
// El tutorial de cada pantalla (P1.1): cuál está abierto, cuándo se abre solo y
// qué se guarda al terminar. Se monta una vez en DashboardShell, dentro de
// TourProvider: con la visita guiada en marcha, el tutorial se calla (nunca dos
// guías a la vez; ni el «?» se pinta) y, si la visita arranca con uno abierto,
// se cierra.
//
// ⚠️ Salir de la pantalla cierra el tutorial SIN anotar nada. Quien dice «sigo
// en la pantalla» es su «?»: cada uno se apunta al montarse (`presente`) y se
// borra al desmontarse. Sin esto, la tarjeta de Paquetes seguía encima de
// Clientas, «perdía» cada control y acababa guardando un «completado» falso.
//
// La tarjeta (`components/tutorial/tutorial-de-pantalla.tsx`) llega con
// `dynamic()`: nada del tutorial viaja en el chunk inicial del panel. Lo único
// que se ve en cada pantalla es el «?» (`BotonTutorial`), y solo si su ficha de
// `lib/ayuda/pantallas.ts` lleva `tutorial`.
// ─────────────────────────────────────────────────────────────────────────────

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { useAuth } from '@/lib/auth-context';
import { useCore } from '@/lib/core-context';
import { usePermisos } from '@/lib/permisos';
import { useTour } from '@/lib/tour-context';
import { capturarEvento } from '@/lib/posthog-cliente';
import { tutorialDePantalla, type RutaConTutorial } from '@/lib/ayuda/pantallas';
import { anotar, claveProgreso, debeAbrirseSolo, guardarProgreso, leerProgreso, type ComoTermino } from '@/lib/ayuda/tutorial-progreso';
import { hayDialogoAbierto } from '@/components/tour/foco';
import type { IdEjemplo } from '@/lib/ayuda/ejemplos';

const TutorialDePantalla = dynamic(
  () => import('@/components/tutorial/tutorial-de-pantalla').then(m => m.TutorialDePantalla),
  { ssr: false },
);

export type OrigenTutorial = 'auto' | 'boton';

interface ValorTutorial {
  /** La pantalla cuyo tutorial está abierto. */
  abierto: RutaConTutorial | null;
  /** Con el «?»: cualquier rol que vea la pantalla. */
  abrir: (ruta: string) => void;
  /** Al llegar a la pantalla: solo si `debeAbrirseSolo`. */
  pedirAbrirSolo: (ruta: string) => void;
  /** El «?» de una pantalla se apunta mientras está montado; devuelve con qué borrarse. */
  presente: (ruta: string) => () => void;
  /** Con la visita guiada en marcha no hay tutoriales: el «?» no se pinta. */
  visitaActiva: boolean;
  /**
   * «Hazlo conmigo» (P1.3): el ejemplo pedido desde el tutorial, para que la
   * pantalla abra su formulario de siempre con él. Quien lo atiende lo suelta.
   */
  ejemplo: IdEjemplo | null;
  pedirEjemplo: (id: IdEjemplo) => void;
  soltarEjemplo: () => void;
}

const ContextoTutorial = createContext<ValorTutorial | null>(null);

/** `null` fuera del panel (no hay tutoriales): el «?» no se pinta. */
export function useTutorial(): ValorTutorial | null {
  return useContext(ContextoTutorial);
}

/** localStorage, o `null` si el navegador no deja tocarlo (el tutorial se ve igual). */
function almacen(): Storage | null {
  try { return window.localStorage; } catch { return null; }
}

export function TutorialProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { studio } = useCore();
  const { rol } = usePermisos();
  const tour = useTour();
  const [abierto, setAbierto] = useState<{ ruta: RutaConTutorial; version: number; origen: OrigenTutorial } | null>(null);
  const [ejemplo, setEjemplo] = useState<IdEjemplo | null>(null);
  const soltarEjemplo = useCallback(() => setEjemplo(null), []);
  const clave = user?.id && studio?.id ? claveProgreso(user.id, studio.id) : null;
  // Sin storage, esto evita reabrirlo en cada navegación de la misma sesión.
  // Por persona y estudio (la clave), no solo por ruta: cambiar de sede es otro tutorial.
  const vistosEnSesion = useRef(new Set<string>());
  const vistoEnSesion = useCallback((ruta: string) => `${clave ?? ''}|${ruta}`, [clave]);
  // Cuántos «?» de cada pantalla hay montados ahora mismo.
  const presentes = useRef(new Map<string, number>());

  const cerrar = useCallback(() => setAbierto(null), []);

  const presente = useCallback((ruta: string) => {
    presentes.current.set(ruta, (presentes.current.get(ruta) ?? 0) + 1);
    return () => {
      const n = (presentes.current.get(ruta) ?? 1) - 1;
      presentes.current.set(ruta, n);
      if (n > 0) return;
      // Un respiro: una cabecera que se vuelve a montar (otra vista de la misma
      // pantalla) no es salir de ella.
      window.setTimeout(() => {
        if ((presentes.current.get(ruta) ?? 0) > 0) return;
        setAbierto(prev => (prev?.ruta === ruta ? null : prev));
        setEjemplo(null);
      }, 400);
    };
  }, []);

  // Si la visita arranca con un tutorial abierto, la visita manda.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Reacciona a otra guía que acaba de empezar.
    if (tour.activo && abierto) setAbierto(null);
  }, [tour.activo, abierto]);

  const abrir = useCallback((ruta: string) => {
    const t = tutorialDePantalla(ruta);
    if (!t || tour.activo) return;
    setAbierto({ ...t, origen: 'boton' });
  }, [tour.activo]);

  const pedirAbrirSolo = useCallback((ruta: string) => {
    const t = tutorialDePantalla(ruta);
    if (!t || !clave || abierto) return;
    const abre = debeAbrirseSolo({
      rol, visitaActiva: tour.activo, visitaObligatoria: tour.obligatoria, dialogoAbierto: hayDialogoAbierto(),
      esSedeDeCadena: !!studio?.cadenaId, creadoEn: studio?.creadoEn, ruta: t.ruta, version: t.version,
      progreso: leerProgreso(almacen(), clave), vistoEnSesion: vistosEnSesion.current.has(vistoEnSesion(t.ruta)),
    });
    if (!abre) return;
    vistosEnSesion.current.add(vistoEnSesion(t.ruta));
    setAbierto({ ...t, origen: 'auto' });
  }, [clave, abierto, rol, tour.activo, tour.obligatoria, studio?.cadenaId, studio?.creadoEn, vistoEnSesion]);

  const terminar = useCallback((como: ComoTermino, paso: number) => {
    if (!abierto) return;
    vistosEnSesion.current.add(vistoEnSesion(abierto.ruta));
    if (clave) {
      const a = almacen();
      guardarProgreso(a, clave, anotar(leerProgreso(a, clave), abierto.ruta, abierto.version, como));
    }
    if (como === 'completado') capturarEvento('tutorial_completado', { pantalla: abierto.ruta, origen: abierto.origen });
    else capturarEvento('tutorial_saltado', { pantalla: abierto.ruta, paso, origen: abierto.origen });
    setAbierto(null);
  }, [abierto, clave, vistoEnSesion]);

  const valor = useMemo<ValorTutorial>(
    () => ({
      abierto: abierto?.ruta ?? null, abrir, pedirAbrirSolo, presente, visitaActiva: tour.activo,
      ejemplo, pedirEjemplo: setEjemplo, soltarEjemplo,
    }),
    [abierto?.ruta, abrir, pedirAbrirSolo, presente, tour.activo, ejemplo, soltarEjemplo],
  );

  return (
    <ContextoTutorial.Provider value={valor}>
      {children}
      {abierto && (
        <TutorialDePantalla
          key={abierto.ruta} ruta={abierto.ruta} escritorio={tour.escritorio} origen={abierto.origen}
          onTerminar={terminar} onCerrar={cerrar}
        />
      )}
    </ContextoTutorial.Provider>
  );
}

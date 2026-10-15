'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { duracionToast } from '@/lib/student/toast-duracion';

// `hooks/useToast.tsx` del paquete: aviso breve, arriba, con `apToast`.
//
// Dos diferencias con el fichero del paquete, las dos técnicas:
//
// 1. El temporizador se limpia al desmontar. El del paquete no lo hace, así que
//    si la pantalla se va antes de los 2,3 s el `setTimeout` sigue vivo e
//    intenta un `setState` sobre un componente que ya no está.
//
// 2. `useRef` se inicializa a `null`. Sin argumento, `useRef<T>()` da
//    `MutableRefObject<T | undefined>` y el `strict` de este repo lo rechaza.
//
// ⚠️ Un toast no sirve para dar una noticia importante: dura poco (de 2,3 a
// 7 s según lo largo que sea, `duracionToast`) y no se puede releer. La
// cancelación de una clase enseña su resultado AQUÍ y también
// en la propia lista, que es lo que queda cuando el aviso se va.

//
// Un fallo NO sale con el aspecto de un acierto (P0.3, 13-oct-2026): con
// `{ variant: 'error' }` el aviso usa el tono de peligro de la app (el mismo
// lenguaje que `.btn--danger`: fondo suave, texto oscuro y borde del color de
// peligro, que el estudio no cambia), es `role="alert"` y dura más: hay que
// decidir qué hacer, no solo leerlo. Sin opciones, todo sigue como antes.

export type VarianteToastAlumna = 'exito' | 'error';
export type AvisarAlumna = (mensaje: string, opciones?: { variant?: VarianteToastAlumna }) => void;

interface ValorToast { toast: AvisarAlumna }

const ContextoToast = createContext<ValorToast>({ toast: () => {} });

/** Un error se queda al menos 6 s: hay que leerlo y decidir. */
export const TOAST_ERROR_MIN_MS = 6000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [aviso, setAviso] = useState<{ texto: string; error: boolean } | null>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toast = useCallback<AvisarAlumna>((m, opciones) => {
    if (temporizador.current) clearTimeout(temporizador.current);
    const error = opciones?.variant === 'error';
    setAviso({ texto: m, error });
    const duracion = error ? Math.max(TOAST_ERROR_MIN_MS, duracionToast(m)) : duracionToast(m);
    temporizador.current = setTimeout(() => setAviso(null), duracion);
  }, []);

  useEffect(() => () => {
    if (temporizador.current) clearTimeout(temporizador.current);
  }, []);

  return (
    <ContextoToast.Provider value={{ toast }}>
      {children}
      {aviso && (
        <div
          role={aviso.error ? 'alert' : 'status'}
          aria-live={aviso.error ? 'assertive' : 'polite'}
          data-variante={aviso.error ? 'error' : 'exito'}
          style={{
            position: 'fixed', top: 'calc(14px + var(--safe-top))', left: 16, right: 16, zIndex: 95,
            display: 'flex', justifyContent: 'center', pointerEvents: 'none',
          }}
        >
          <div
            style={{
              ...(aviso.error
                ? {
                    background: 'var(--destructive-soft)', color: 'var(--destructive-foreground)',
                    border: '1px solid color-mix(in srgb, var(--destructive) 90%, transparent)',
                  }
                : { background: 'var(--primary)', color: 'var(--primary-foreground)' }),
              borderRadius: 999,
              padding: '10px 18px', fontSize: 'var(--t-small)', fontWeight: 700, boxShadow: 'var(--shadow-toast)',
              animation: 'apToast .35s var(--ease-spring) both',
            }}
          >
            {aviso.texto}
          </div>
        </div>
      )}
    </ContextoToast.Provider>
  );
}

export const useToast = () => useContext(ContextoToast);

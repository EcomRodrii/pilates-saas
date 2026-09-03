'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

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
// ⚠️ Un toast no sirve para dar una noticia importante: dura 2,3 s y no se
// puede releer. La cancelación de una clase enseña su resultado AQUÍ y también
// en la propia lista, que es lo que queda cuando el aviso se va.

interface ValorToast { toast: (mensaje: string) => void }

const ContextoToast = createContext<ValorToast>({ toast: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [mensaje, setMensaje] = useState<string | null>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toast = useCallback((m: string) => {
    if (temporizador.current) clearTimeout(temporizador.current);
    setMensaje(m);
    temporizador.current = setTimeout(() => setMensaje(null), 2300);
  }, []);

  useEffect(() => () => {
    if (temporizador.current) clearTimeout(temporizador.current);
  }, []);

  return (
    <ContextoToast.Provider value={{ toast }}>
      {children}
      {mensaje && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed', top: 'calc(14px + var(--safe-top))', left: 16, right: 16, zIndex: 95,
            display: 'flex', justifyContent: 'center', pointerEvents: 'none',
          }}
        >
          <div
            style={{
              background: 'var(--primary)', color: 'var(--primary-foreground)', borderRadius: 999,
              padding: '10px 18px', fontSize: 12.5, fontWeight: 700, boxShadow: 'var(--shadow-toast)',
              animation: 'apToast .35s var(--ease-spring) both',
            }}
          >
            {mensaje}
          </div>
        </div>
      )}
    </ContextoToast.Provider>
  );
}

export const useToast = () => useContext(ContextoToast);

'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check } from 'lucide-react';

export interface ToastAction {
  texto: string;
  onClick: () => void;
}

// `action` es opcional y aditivo (rediseño del Calendario, punto 4: cada
// decisión con nombre propio necesita su Deshacer) — los 6 llamadores
// existentes que solo pasan `message` siguen igual. Con acción, el toast dura
// más (el usuario necesita tiempo real para decidir deshacer, no solo leer).
export function Toast({
  message, onDismiss, action,
}: { message: string; onDismiss: () => void; action?: ToastAction }) {
  // Se queda montado un instante más al cerrar para que se vea la salida —
  // mismo patrón que DashboardDrawer (components/ui/dashboard-drawer.tsx):
  // sin esto, el toast desaparecía de golpe en vez de desvanecerse. El
  // temporizador dispara la SALIDA, no el desmontaje directo — el desmontaje
  // real llega de `onAnimationEnd` cuando `toast-out` termina.
  const [cerrando, setCerrando] = useState(false);
  const dismissConAnimacion = useCallback(() => setCerrando(true), []);

  useEffect(() => {
    const t = setTimeout(dismissConAnimacion, action ? 6000 : 3000);
    return () => clearTimeout(t);
  }, [dismissConAnimacion, action]);

  return (
    <div
      className={`fixed bottom-6 left-1/2 z-50 flex items-center gap-3 bg-brand text-brand-foreground text-[13px] font-medium px-4 py-2.5 rounded-xl shadow-lg ${cerrando ? 'toast-out' : 'toast-in'}`}
      onAnimationEnd={() => { if (cerrando) onDismiss(); }}
    >
      <span className="flex items-center gap-2 pointer-events-none">
        <Check size={14} className="text-[#34D399]" />
        {message}
      </span>
      {action && (
        <button
          type="button"
          onClick={() => { action.onClick(); dismissConAnimacion(); }}
          className="rounded-full bg-white/15 px-2.5 py-1 text-[12px] font-bold hover:bg-white/25 transition-colors"
        >
          {action.texto}
        </button>
      )}
    </div>
  );
}

export function useToast() {
  const [message, setMessage] = useState<string | null>(null);
  const [action, setAction] = useState<ToastAction | undefined>(undefined);
  const show = useCallback((msg: string, accion?: ToastAction) => { setMessage(msg); setAction(accion); }, []);
  const dismiss = useCallback(() => { setMessage(null); setAction(undefined); }, []);
  return { message, action, show, dismiss };
}

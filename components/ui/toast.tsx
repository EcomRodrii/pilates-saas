'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, AlertTriangle } from 'lucide-react';

export interface ToastAction {
  texto: string;
  onClick: () => void;
}

/**
 * `exito` es el valor por defecto para no tocar los llamadores existentes.
 *
 * ⚠️ Hasta la auditoría del 15-sep-2026 NO había variante: los mensajes de error
 * («No se han podido guardar los datos SEPA», «El NIF/CIF no es válido»…) salían
 * con el color de marca y un ✓ VERDE durante 3 segundos. Es el bug histórico de
 * este repo —anunciar éxito con el servidor diciendo que no— pero movido a la
 * capa de presentación: la lógica sí distinguía, la pantalla no.
 */
export type ToastVariante = 'exito' | 'error';

/**
 * Firma de la función que las pantallas pasan a sus secciones para avisar.
 *
 * El segundo parámetro es OPCIONAL a propósito: una función de este tipo sigue
 * siendo asignable a un prop declarado `(m: string) => void`, así que las
 * pantallas que aún no distinguen error de éxito no se rompen. Para que un
 * error se VEA como error hacen falta las dos mitades: llamar con
 * `{ variant: 'error' }` y que el `<Toast>` de esa pantalla reciba `variant`.
 */
export type MostrarToast = (mensaje: string, opciones?: { variant?: ToastVariante }) => void;

// `action` es opcional y aditivo (rediseño del Calendario, punto 4: cada
// decisión con nombre propio necesita su Deshacer) — los 6 llamadores
// existentes que solo pasan `message` siguen igual. Con acción, el toast dura
// más (el usuario necesita tiempo real para decidir deshacer, no solo leer).
export function Toast({
  message, onDismiss, action, variant = 'exito',
}: { message: string; onDismiss: () => void; action?: ToastAction; variant?: ToastVariante }) {
  // Se queda montado un instante más al cerrar para que se vea la salida —
  // mismo patrón que DashboardDrawer (components/ui/dashboard-drawer.tsx):
  // sin esto, el toast desaparecía de golpe en vez de desvanecerse. El
  // temporizador dispara la SALIDA, no el desmontaje directo — el desmontaje
  // real llega de `onAnimationEnd` cuando `toast-out` termina.
  const [cerrando, setCerrando] = useState(false);
  const dismissConAnimacion = useCallback(() => setCerrando(true), []);
  const esError = variant === 'error';

  useEffect(() => {
    // Un error necesita más tiempo del que cuesta leerlo: hay que decidir qué
    // hacer con él. 3 s bastan para «Guardado», no para «no se ha guardado».
    const t = setTimeout(dismissConAnimacion, action ? 6000 : esError ? 8000 : 3000);
    return () => clearTimeout(t);
  }, [dismissConAnimacion, action, esError]);

  return (
    <div
      // `bottom` esquiva la navegación del móvil (fixed bottom-0, 56 px), igual
      // que hace BarraGuardar: a `bottom-6` el toast caía justo encima de ella.
      className={`fixed bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px)+1rem)] lg:bottom-6 left-1/2 z-50 flex items-center gap-3 ${esError ? 'bg-destructive text-destructive-foreground' : 'bg-brand text-brand-foreground'} text-[13px] font-medium px-4 py-2.5 rounded-xl shadow-lg ${cerrando ? 'toast-out' : 'toast-in'}`}
      // Sin esto el toast no existe para un lector de pantalla: era la ÚNICA
      // señal de error de varias pantallas de Configuración, y era muda.
      role={esError ? 'alert' : 'status'}
      aria-live={esError ? 'assertive' : 'polite'}
      aria-atomic="true"
      onAnimationEnd={() => { if (cerrando) onDismiss(); }}
    >
      <span className="flex items-center gap-2 pointer-events-none">
        {esError
          ? <AlertTriangle size={14} aria-hidden />
          : <Check size={14} className="text-[#34D399]" aria-hidden />}
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
  const [variant, setVariant] = useState<ToastVariante>('exito');
  const show = useCallback((msg: string, accion?: ToastAction) => {
    setMessage(msg); setAction(accion); setVariant('exito');
  }, []);
  // `showError` es aditivo: quien no lo use se comporta exactamente igual que
  // antes. Para que el error se VEA como error, el `<Toast>` de esa pantalla
  // tiene que recibir además `variant={variant}`.
  const showError = useCallback((msg: string) => {
    setMessage(msg); setAction(undefined); setVariant('error');
  }, []);
  const dismiss = useCallback(() => { setMessage(null); setAction(undefined); setVariant('exito'); }, []);
  return { message, action, variant, show, showError, dismiss };
}

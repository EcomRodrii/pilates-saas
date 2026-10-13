'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, AlertTriangle } from 'lucide-react';
import { anfitrionPortal } from '@/lib/panel-portal';

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

  // Un error necesita más tiempo del que cuesta leerlo: hay que decidir qué
  // hacer con él. 3 s bastan para «Guardado», no para «no se ha guardado». Y un
  // texto largo («Clase cancelada · 2 sin avisar…») necesita lo que se tarda en
  // leerlo: ~60 ms por carácter, hasta 12 s.
  const duracion = Math.max(action ? 6000 : esError ? 8000 : 3000, Math.min(12_000, message.length * 60));
  useEffect(() => {
    const t = setTimeout(dismissConAnimacion, duracion);
    return () => clearTimeout(t);
  }, [dismissConAnimacion, duracion]);

  // En un portal y a z-[60] (P0.3): las hojas y los diálogos del panel también
  // son z-50 pero van en portal, después en el DOM, y tapaban el aviso — un
  // fallo al pasar lista en la ficha de la clase del móvil no se veía. Al
  // anfitrión del panel y no a `body`, para no perder el modo oscuro
  // (lib/panel-portal.ts).
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      // `bottom` esquiva la navegación del móvil (fixed bottom-0, 56 px), igual
      // que hace BarraGuardar: a `bottom-6` el toast caía justo encima de ella.
      // Centrado con márgenes (no con `left-1/2` + translate): así, en un móvil de
      // 390 px el texto tiene todo el ancho y no se queda en una columna de 160 px.
      className={`fixed inset-x-4 mx-auto w-fit max-w-md bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px)+1rem)] lg:bottom-6 z-[60] flex items-center gap-3 ${esError ? 'bg-destructive text-destructive-foreground' : 'bg-brand text-brand-foreground'} text-[13px] font-medium px-4 py-2.5 rounded-xl shadow-lg ${cerrando ? 'toast-out' : 'toast-in'}`}
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
    </div>,
    anfitrionPortal(),
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

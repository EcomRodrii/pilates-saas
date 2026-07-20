'use client';

import { useEffect, useRef } from 'react';

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Hoja/modal accesible para las páginas públicas (reserva, confirmación de
// cita). Es el mismo shell visual (backdrop con blur + hoja blanca, abajo en
// móvil / centrada en desktop) que ya usan reservar/[slug] y citas-publica,
// ahora con la semántica que le faltaba: `role="dialog"`, trampa de foco,
// cierre con Escape y devolución del foco a quien la abrió al cerrarla.
//
// No impone la estructura interna (título, cabecera, pasos) — cada caller
// sigue siendo dueño de su contenido; esto solo resuelve la parte tediosa y
// fácil de hacer mal si se repite a mano en cada modal.
export function PublicSheet({
  open,
  onClose,
  label,
  children,
  sheetClassName = 'bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl',
  sheetStyle,
  closeOnBackdropClick = true,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  children: React.ReactNode;
  sheetClassName?: string;
  sheetStyle?: React.CSSProperties;
  closeOnBackdropClick?: boolean;
}) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const disparadorRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    disparadorRef.current = document.activeElement as HTMLElement | null;
    const sheet = sheetRef.current;
    const primero = sheet?.querySelector<HTMLElement>(FOCUSABLE);
    (primero ?? sheet)?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !sheet) return;
      const focusables = Array.from(sheet.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      disparadorRef.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 sm:p-6"
      style={{ backgroundColor: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)' }}
      onClick={closeOnBackdropClick ? onClose : undefined}
    >
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={sheetClassName}
        style={sheetStyle}
        onClick={e => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

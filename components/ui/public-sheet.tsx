'use client';

import { useDialogA11y } from './use-dialog-a11y';

// Hoja/modal accesible para las páginas públicas (reserva, confirmación de
// cita). Es el mismo shell visual (backdrop con blur + hoja blanca, abajo en
// móvil / centrada en desktop) que ya usan reservar/[slug] y citas-publica,
// ahora con la semántica que le faltaba: `role="dialog"`, trampa de foco,
// cierre con Escape y devolución del foco a quien la abrió al cerrarla. La
// mecánica de accesibilidad vive en useDialogA11y (compartida con
// DashboardSheet, el equivalente para el dashboard con tema bg-card).
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
  const { sheetRef } = useDialogA11y({ open, onClose });

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

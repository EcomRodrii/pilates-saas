'use client';

import { createPortal } from 'react-dom';
import { useDialogA11y } from './use-dialog-a11y';

// Equivalente a PublicSheet (components/ui/public-sheet.tsx) para los
// modales hechos a mano del dashboard — mismo problema (sin role="dialog",
// sin trampa de foco), pero con el tema bg-card/border-border/text-foreground
// del dashboard en vez de los hex fijos de las páginas públicas. Comparte la
// mecánica de accesibilidad vía useDialogA11y.
//
// Los 27 modales que ya usan components/ui/dialog (Base UI) no necesitan
// esto — es solo para los que tienen su propio shell visual y no pueden
// migrar a ese primitivo sin cambiar de aspecto.
export function DashboardSheet({
  open,
  onClose,
  label,
  children,
  backdropClassName = 'fixed inset-0 z-50 flex items-center justify-center p-4',
  backdropStyle = { backgroundColor: 'rgba(0,0,0,0.45)' },
  sheetClassName = 'bg-card rounded-2xl w-full max-w-md shadow-2xl',
  sheetStyle,
  closeOnBackdropClick = true,
  portal = false,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  children: React.ReactNode;
  backdropClassName?: string;
  backdropStyle?: React.CSSProperties;
  sheetClassName?: string;
  sheetStyle?: React.CSSProperties;
  closeOnBackdropClick?: boolean;
  // `fixed` deja de posicionarse contra el viewport si algún ancestro tiene
  // transform/filter/backdrop-filter (crea un "containing block" nuevo —
  // p.ej. topbar.tsx usa backdrop-blur-sm). Cuando el caller vive dentro de
  // un árbol así, `portal` renderiza directo en document.body para escapar.
  portal?: boolean;
}) {
  const { sheetRef } = useDialogA11y({ open, onClose });

  if (!open) return null;

  const contenido = (
    <div
      className={backdropClassName}
      style={backdropStyle}
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

  return portal ? createPortal(contenido, document.body) : contenido;
}

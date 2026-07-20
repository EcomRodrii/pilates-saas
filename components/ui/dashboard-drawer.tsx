'use client';

import { useDialogA11y } from './use-dialog-a11y';

// Equivalente a DashboardSheet (components/ui/dashboard-sheet.tsx) para los
// paneles laterales del dashboard — mismo problema de accesibilidad, pero
// entra deslizándose desde el borde (flex justify-end, h-full) en vez de
// aparecer como hoja centrada/inferior. Comparte la mecánica vía
// useDialogA11y.
export function DashboardDrawer({
  open,
  onClose,
  label,
  children,
  backdropClassName = 'fixed inset-0 z-50 flex justify-end bg-foreground/20',
  backdropStyle,
  sheetClassName = 'relative w-full lg:w-[420px] bg-card h-full flex flex-col shadow-[-20px_0_60px_-20px_rgba(0,0,0,0.3)]',
  sheetStyle,
  closeOnBackdropClick = true,
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
}) {
  const { sheetRef } = useDialogA11y({ open, onClose });

  if (!open) return null;

  return (
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
}

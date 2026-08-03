'use client';

import { useEffect, useState } from 'react';
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

  // Se queda montado un instante más al cerrar, para que la animación de
  // salida se vea — con `if (!open) return null` a secas, el panel
  // desaparecía de golpe en vez de deslizarse. prefers-reduced-motion ya
  // acorta estas animaciones a ~0 vía globals.css, así que no hace falta
  // duplicar esa comprobación aquí.
  const [rendered, setRendered] = useState(open);
  const [cerrando, setCerrando] = useState(false);

  useEffect(() => {
    if (open) { setRendered(true); setCerrando(false); }
    else if (rendered) setCerrando(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!rendered) return null;

  return (
    <div
      className={`${backdropClassName} ${cerrando ? 'animate-drawer-backdrop-out' : 'animate-drawer-backdrop-in'}`}
      style={backdropStyle}
      onClick={closeOnBackdropClick ? onClose : undefined}
    >
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={`${sheetClassName} ${cerrando ? 'animate-drawer-sheet-out' : 'animate-drawer-sheet-in'}`}
        style={sheetStyle}
        onClick={e => e.stopPropagation()}
        onAnimationEnd={() => { if (cerrando) setRendered(false); }}
      >
        {children}
      </div>
    </div>
  );
}

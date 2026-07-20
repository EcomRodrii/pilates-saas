'use client';

import { useEffect, useRef, useState } from 'react';

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Mecánica de accesibilidad para diálogos hechos a mano (los que no pueden
// usar components/ui/dialog — Base UI — porque necesitan su propio shell
// visual: hoja pública con hex fijos, o modal del dashboard con bg-card).
// Resuelve trampa de foco, cierre con Escape y devolución del foco a quien
// abrió el diálogo. Usado por PublicSheet y DashboardSheet.
export function useDialogA11y({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const [disparador, setDisparador] = useState<HTMLElement | null>(null);
  const [openAnterior, setOpenAnterior] = useState(open);

  // Ajuste de estado durante el render (patrón oficial de React para
  // "capturar algo antes de que cambie", sin refs — este proyecto exige
  // reglas React Compiler-safe que prohíben leer/escribir refs durante el
  // render). Importa que se capture AQUÍ y no en un efecto: si el contenido
  // trae su propio `autoFocus` (p.ej. un <input> de login), React lo aplica
  // en el commit, antes de que corra cualquier useEffect — para cuando el
  // efecto de abajo se ejecutase, document.activeElement ya sería ese input
  // y no lo de fuera que abrió el diálogo.
  if (open !== openAnterior) {
    setOpenAnterior(open);
    if (open) setDisparador(document.activeElement as HTMLElement | null);
  }

  useEffect(() => {
    if (!open) return;
    const sheet = sheetRef.current;
    // Si el contenido ya se autoenfocó a sí mismo (autoFocus), se respeta —
    // solo se mueve el foco cuando nada dentro del diálogo lo tiene todavía.
    if (!sheet?.contains(document.activeElement)) {
      const primero = sheet?.querySelector<HTMLElement>(FOCUSABLE);
      (primero ?? sheet)?.focus();
    }

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
      disparador?.focus();
    };
  }, [open, onClose, disparador]);

  return { sheetRef };
}

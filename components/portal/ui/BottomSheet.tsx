'use client';

import type { ReactNode } from 'react';
import { sheetBottomPadding } from '@/lib/portal-tokens';
import { cristal, desenfoque } from '@/lib/portal-design';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

// El único tipo de overlay del portal — nunca un modal centrado de escritorio.
// A diferencia de los 4 bottom sheets que existían antes (uno por pantalla,
// cada uno reescrito a mano), este es el único que compensa el home indicator
// por defecto: quien lo usa no puede olvidarlo, porque no hay padding que fijar.
//
// Valores literales del sistema "Tentare Studio App" (CHEATSHEET-CSS.md,
// "Bottom sheet") — antes venían de `useModo()`, la paleta del diseño
// anterior ya sustituido ("Tentare App Cliente v2"). Sin animación de
// entrada/salida a propósito, a diferencia del sheet de reserva: este
// componente genérico se monta/desmonta con su condición (`if (!open) return
// null`), y varios de sus llamadores tienen e2e que asumen ese contrato
// síncrono (`getByText(...).toHaveCount(0)` justo tras cerrar) — el mismo
// motivo que ya documentan los sheets de "dar de baja plaza fija".
export function BottomSheet({ open, onClose, children }: BottomSheetProps) {
  if (!open) return null;
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'flex-end',
        background: 'rgba(15,15,15,.42)', ...cristal(desenfoque.backdrop, 120),
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', background: '#FAF9F5', borderRadius: '24px 24px 0 0',
          boxShadow: '0 -18px 50px rgba(15,15,15,.25)',
          padding: `10px 20px ${sheetBottomPadding}`,
          display: 'flex', flexDirection: 'column', gap: 14,
          maxHeight: '85vh', overflowY: 'auto',
        }}
      >
        <div style={{ width: 34, height: 4, borderRadius: 999, background: '#D9D6C9', margin: '6px auto 4px', flexShrink: 0 }} />
        {children}
      </div>
    </div>
  );
}

'use client';

import type { ReactNode } from 'react';
import { useModo } from '@/lib/portal-modo';
import { sheetBottomPadding } from '@/lib/portal-tokens';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

// El único tipo de overlay del portal — nunca un modal centrado de escritorio.
// A diferencia de los 4 bottom sheets que existían antes (uno por pantalla,
// cada uno reescrito a mano), este es el único que compensa el home indicator
// por defecto: quien lo usa no puede olvidarlo, porque no hay padding que fijar.
export function BottomSheet({ open, onClose, children }: BottomSheetProps) {
  const { t } = useModo();
  if (!open) return null;
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'flex-end', background: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', background: t.bg, borderRadius: '24px 24px 0 0',
          padding: `10px 20px ${sheetBottomPadding}`,
          display: 'flex', flexDirection: 'column', gap: 14,
          maxHeight: '85vh', overflowY: 'auto',
        }}
      >
        <div style={{ width: 36, height: 4, borderRadius: 999, background: t.line, margin: '6px auto 4px', flexShrink: 0 }} />
        {children}
      </div>
    </div>
  );
}

'use client';

import type { ReactNode } from 'react';
import { semantic } from '@/lib/portal-tokens';
import { Button } from './Button';

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  body: string;
  /** 'empty': nada que mostrar todavía. 'error': algo falló al cargar. */
  variant?: 'empty' | 'error';
  action?: { label: string; onClick: () => void };
}

// Un componente para vacío y error — antes cada pantalla improvisaba el suyo
// (o compartía el mismo texto genérico entre pestañas que no tenían nada que
// ver entre sí, como las 4 de "Mis reservas"). El copy siempre lo decide
// quien llama al componente, nunca es genérico por defecto.
// Valores literales del sistema "Tentare Studio App" — antes venían de
// `useModo()`, la paleta del diseño anterior ya sustituido.
export function EmptyState({ icon, title, body, variant = 'empty', action }: EmptyStateProps) {
  const isError = variant === 'error';
  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
        padding: '28px 16px', gap: 10, borderRadius: 18, background: '#FFFFFF',
      }}
    >
      <div
        style={{
          width: 44, height: 44, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: isError ? semantic.danger.soft : '#EFEDE4',
          color: isError ? semantic.danger.text : '#1A1A1A',
          fontSize: 18,
        }}
      >
        {icon}
      </div>
      <p style={{ fontSize: 14, fontWeight: 800, color: '#1A1A1A' }}>{title}</p>
      <p style={{ fontSize: 12.5, color: '#5A5A52', maxWidth: 240 }}>{body}</p>
      {action && (
        <Button variant={isError ? 'secondary' : 'primary'} size="small" onClick={action.onClick} style={{ marginTop: 6 }}>
          {action.label}
        </Button>
      )}
    </div>
  );
}

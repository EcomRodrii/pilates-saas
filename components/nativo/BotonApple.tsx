'use client';

import { useState } from 'react';
import { supabasePortal } from '@/lib/db/supabase-portal';
import { loginConApple } from '@/lib/nativo/puente';
import { useAppNativa } from '@/lib/nativo/use-app-nativa';

/**
 * «Iniciar sesión con Apple», solo dentro de la app de iOS (en la web no se pinta).
 *
 * La hoja es la nativa de iOS (lib/nativo/puente.ts → `loginConApple`) y la
 * sesión la abre Supabase con el identity token y el nonce en crudo, en el MISMO
 * cliente que el resto de la app de la alumna (`supabasePortal`). Cancelar la
 * hoja no es un error que enseñar.
 *
 * Estilo según las guías de Apple: negro, su logo, «Iniciar sesión con Apple».
 */
export function BotonApple({ onEntrado, onError, disabled }: {
  onEntrado: () => void;
  onError: (mensaje: string) => void;
  disabled?: boolean;
}) {
  const enApp = useAppNativa();
  const [abriendo, setAbriendo] = useState(false);
  if (!enApp) return null;

  const entrar = async () => {
    setAbriendo(true);
    try {
      const r = await loginConApple();
      if ('error' in r) {
        if (r.error !== 'cancelado') onError('No se ha podido iniciar sesión con Apple. Inténtalo de nuevo.');
        return;
      }
      const { error } = await supabasePortal.auth.signInWithIdToken({ provider: 'apple', token: r.idToken, nonce: r.nonce });
      if (error) { onError('No se ha podido iniciar sesión con Apple. Inténtalo de nuevo.'); return; }
      onEntrado();
    } finally {
      setAbriendo(false);
    }
  };

  return (
    <button
      type="button" onClick={() => void entrar()} disabled={disabled || abriendo} aria-busy={abriendo}
      data-testid="entrar-con-apple"
      style={{
        width: '100%', minHeight: 48, borderRadius: 999, border: 'none', background: '#000', color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontWeight: 700, fontSize: 16,
      }}
    >
      <svg width="16" height="19" viewBox="0 0 814 1000" aria-hidden focusable="false" fill="currentColor">
        <path d="M788 341c-6 4-108 62-108 190 0 148 130 200 134 201-1 3-21 72-69 142-43 62-88 124-156 124s-86-40-164-40c-76 0-104 41-166 41s-106-57-156-127C45 789 0 668 0 553 0 368 120 270 238 270c63 0 115 41 154 41 38 0 97-44 168-44 27 0 124 3 188 74zM535 168c29-35 50-83 50-131 0-7-1-14-2-19-48 2-104 32-138 72-27 31-52 79-52 128 0 7 1 15 2 17 3 1 8 1 13 1 43 0 97-29 127-68z" />
      </svg>
      {abriendo ? 'Abriendo…' : 'Iniciar sesión con Apple'}
    </button>
  );
}

'use client';

import { useState } from 'react';
import { supabasePortal } from '@/lib/db/supabase-portal';
import { entrarConGoogleEnLaApp } from '@/lib/nativo/google';
import { useAppNativa } from '@/lib/nativo/use-app-nativa';
import { traducirAuth } from '@/lib/student/auth-errores';
import { mensajeSeguro } from '@/lib/errores';

/** La marca de Google en SVG en línea: el CSP no admite imágenes de terceros. */
export function LogoGoogle() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden focusable="false">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.8-6.8C35.6 2.4 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.2C12.4 13.6 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-2.8-.4-4.1H24v8.3h12.6c-.3 2.1-1.6 5.2-4.6 7.3l7.7 6c4.5-4.2 6.4-10.1 6.4-17.5z" />
      <path fill="#FBBC05" d="M10.5 28.6A14.6 14.6 0 0 1 9.7 24c0-1.6.3-3.2.8-4.6l-7.9-6.2A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6.2z" />
      <path fill="#34A853" d="M24 48c6.2 0 11.5-2 15.7-5.9l-7.7-6c-2.1 1.4-4.8 2.4-8 2.4-6.3 0-11.6-4.1-13.5-9.9l-7.9 6.2C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}

/**
 * «Continuar con Google» de la entrada de la app (`/app`). Dentro de la app de
 * iOS, por el Safari de encima y PKCE (lib/nativo/google.ts); en la web, la
 * redirección de siempre, que vuelve a esta misma dirección (con su `?estudio=`,
 * si lo trae) y la recoge `detectSessionInUrl`.
 * Google vincula la cuenta que ya existiera con ese email: no crea otra.
 */
export function BotonGoogle({ onEntrado, onError, disabled }: {
  onEntrado: () => void;
  onError: (mensaje: string) => void;
  disabled?: boolean;
}) {
  const enApp = useAppNativa();
  const [abriendo, setAbriendo] = useState(false);

  const entrar = async () => {
    setAbriendo(true);
    if (!enApp) {
      const { error } = await supabasePortal.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}${window.location.pathname}${window.location.search}`, scopes: 'openid email profile' },
      });
      // Con éxito, la pestaña ya se ha ido a Google.
      if (error) { setAbriendo(false); onError(traducirAuth(error.message) ?? mensajeSeguro(error.message, 'No hemos podido abrir Google.')); }
      return;
    }
    try {
      const r = await entrarConGoogleEnLaApp();
      if ('ok' in r) onEntrado();
      else if ('error' in r) onError(r.error);
    } finally {
      setAbriendo(false);
    }
  };

  return (
    <button
      type="button" onClick={() => void entrar()} disabled={disabled || abriendo} aria-busy={abriendo}
      data-testid="entrar-con-google" className="btn btn--secondary" style={{ width: '100%', gap: 8 }}
    >
      <LogoGoogle />
      {abriendo ? 'Abriendo Google…' : 'Continuar con Google'}
    </button>
  );
}

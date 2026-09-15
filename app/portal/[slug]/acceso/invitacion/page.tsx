'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEstudio, usePortalHref } from '@/components/student/contexto';
import { useSesionStudent } from '@/lib/student/sesion';
import { guardarInvitacionApp } from '@/lib/student/invitacion-app';
import { tokenConForma } from '@/lib/student/invitacion-app-regla';
import { Button } from '@/components/student/ui/Button';

/**
 * Donde aterriza el correo de invitación de una INSTRUCTORA (15-sep-2026).
 *
 * Antes la invitación llevaba al panel de Tentare a «crear mi cuenta», aunque la
 * instructora trabaje en la app del estudio, y si ya tenía cuenta se quedaba en
 * «ya existe una cuenta con ese email». Ahora:
 *
 *   1. Se guarda el enlace (24 h) y se quita de la URL.
 *   2. Con sesión → a elegir cómo entra. Sin sesión → a entrar, con Google o con
 *      un enlace a su correo: sirve igual si ya tenía cuenta que si no.
 *   3. En `/acceso/elegir` pulsa «Como instructora» y el servidor la une con el
 *      enlace (`/api/portal/instructora/unirse`). Nada se une solo.
 */
function Invitacion() {
  const sp = useSearchParams();
  const r = useRouter();
  const { estudio, slug } = useEstudio();
  const href = usePortalHref();
  const { autenticado, isLoading } = useSesionStudent(slug);
  // Se lee una vez: justo después se quita de la URL.
  const [token] = useState(() => sp.get('token'));
  const valido = tokenConForma(token);

  useEffect(() => {
    if (!valido || !token) return;
    guardarInvitacionApp(slug, token);
    // Fuera de la URL: que no quede en el historial ni se comparta sin querer.
    window.history.replaceState(null, '', window.location.pathname);
  }, [valido, token, slug]);

  useEffect(() => {
    if (valido && !isLoading && autenticado) r.replace(href('/acceso/elegir'));
  }, [valido, isLoading, autenticado, href, r]);

  if (!valido) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <h2 className="t-h1">Esta invitación no vale</h2>
          <p className="t-meta" style={{ marginTop: 4, lineHeight: 1.5 }}>
            Abre de nuevo el enlace del correo, o pídele a {estudio.nombre} que te lo envíe otra vez.
          </p>
        </div>
      </div>
    );
  }

  if (isLoading || autenticado) {
    return <div aria-busy="true" style={{ minHeight: 220 }}><span className="sr-only">Cargando…</span></div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <h2 className="t-h1">Te han invitado al equipo</h2>
        <p className="t-meta" style={{ marginTop: 4, lineHeight: 1.5 }}>
          {estudio.nombre} te ha dado de alta como instructora. Entra con tu cuenta y elige «Como instructora».
        </p>
      </div>
      <p className="t-meta" style={{ margin: 0, lineHeight: 1.5 }}>
        ¿No tienes cuenta o no recuerdas la contraseña? En la siguiente pantalla usa «Continuar con Google» o «No tengo contraseña — mándame un enlace»: sirven igual si ya tenías cuenta que si no.
      </p>
      <Button full data-testid="invitacion-entrar" onClick={() => r.push(href('/acceso/login'))}>
        Entrar
      </Button>
    </div>
  );
}

export default function Page() {
  // `useSearchParams` exige Suspense en App Router.
  return <Suspense fallback={null}><Invitacion /></Suspense>;
}

'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LogoTentare } from '@/components/marca/logo-tentare';
import { useAuth } from '@/lib/auth-context';
import { authHeader } from '@/lib/api-client';

// Pantalla de consentimiento OAuth (Zapier u otra app de terceros). Vive
// FUERA de app/(dashboard) a propósito: no lleva sidebar, es una interrupción
// puntual, no una pantalla de trabajo. Reutiliza la sesión de staff ya
// existente (useAuth) — nada de un login paralelo para este flujo.

type EstadoConsentimiento =
  | { paso: 'cargando' }
  | { paso: 'error'; mensaje: string }
  | { paso: 'listo'; enviando: boolean; cliente: { nombre: string; descripcion: string | null; logoUrl: string | null }; estudioNombre: string; scopes: { scope: string; descripcion: string }[] };

// useSearchParams() exige un límite de Suspense alrededor (si no, Next
// desactiva la generación estática de toda la página en build) — el
// contenido real vive en el componente de dentro.
export default function OAuthAuthorizePage() {
  return (
    <Suspense fallback={null}>
      <OAuthAuthorizeContenido />
    </Suspense>
  );
}

function OAuthAuthorizeContenido() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading } = useAuth();
  const [estado, setEstado] = useState<EstadoConsentimiento>({ paso: 'cargando' });

  const qs = searchParams.toString();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace(`/login?next=${encodeURIComponent(`/oauth/authorize?${qs}`)}`);
      return;
    }
    let cancelado = false;
    (async () => {
      const headers = await authHeader();
      const res = await fetch(`/api/oauth/authorize?${qs}`, { headers });
      const data = await res.json();
      if (cancelado) return;
      if (!res.ok) {
        setEstado({ paso: 'error', mensaje: mensajeError(data?.error, data?.detalle) });
        return;
      }
      setEstado({ paso: 'listo', enviando: false, cliente: data.cliente, estudioNombre: data.estudioNombre, scopes: data.scopes });
    })();
    return () => { cancelado = true; };
  }, [loading, user, qs, router]);

  async function autorizar() {
    setEstado(prev => (prev.paso === 'listo' ? { ...prev, enviando: true } : prev));
    const headers = await authHeader();
    const res = await fetch('/api/oauth/authorize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({
        clientId: searchParams.get('client_id'),
        redirectUri: searchParams.get('redirect_uri'),
        scope: searchParams.get('scope'),
        state: searchParams.get('state') ?? undefined,
        codeChallenge: searchParams.get('code_challenge'),
        codeChallengeMethod: searchParams.get('code_challenge_method'),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setEstado({ paso: 'error', mensaje: mensajeError(data?.error, data?.detalle) });
      return;
    }
    window.location.href = data.redirectUrl;
  }

  function cancelar() {
    const redirectUri = searchParams.get('redirect_uri');
    const state = searchParams.get('state');
    if (!redirectUri) { router.replace('/dashboard'); return; }
    const url = new URL(redirectUri);
    url.searchParams.set('error', 'access_denied');
    if (state) url.searchParams.set('state', state);
    window.location.href = url.toString();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-sm bg-card border border-border rounded-2xl p-6 shadow-sm">
        <div className="flex justify-center mb-6">
          <LogoTentare alto={28} tinta="auto" />
        </div>

        {estado.paso === 'cargando' && (
          <p className="text-[13px] text-muted-foreground text-center">Cargando…</p>
        )}

        {estado.paso === 'error' && (
          <div className="text-center space-y-3">
            <p className="text-[13px] text-destructive">{estado.mensaje}</p>
          </div>
        )}

        {estado.paso === 'listo' && (
          <div className="space-y-4">
            <p className="text-[14px] text-foreground text-center">
              <strong>{estado.cliente.nombre}</strong> quiere conectarse a{' '}
              <strong>{estado.estudioNombre}</strong>
            </p>
            <div className="border border-border rounded-xl divide-y divide-border">
              {estado.scopes.map(s => (
                <div key={s.scope} className="px-3 py-2 text-[12px] text-foreground">
                  {s.descripcion}
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                onClick={cancelar}
                disabled={estado.enviando}
                className="flex-1 rounded-lg border border-border px-4 py-2 text-[13px] text-foreground hover:bg-muted transition-colors disabled:opacity-40"
              >
                Cancelar
              </button>
              <button
                onClick={autorizar}
                disabled={estado.enviando}
                className="flex-1 rounded-lg bg-brand text-brand-foreground px-4 py-2 text-[13px] font-medium hover:brightness-95 transition-colors disabled:opacity-40"
              >
                {estado.enviando ? 'Conectando…' : 'Autorizar'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function mensajeError(codigo: string | undefined, detalle: string | undefined): string {
  switch (codigo) {
    case 'access_denied': return detalle ?? 'Solo la propietaria o un manager pueden conectar aplicaciones.';
    case 'invalid_client': return 'Esta aplicación no está registrada.';
    case 'invalid_scope': return 'Esta aplicación pide permisos que no reconocemos.';
    case 'login_required': return 'Inicia sesión primero.';
    default: return detalle ?? 'No se pudo procesar la solicitud de conexión.';
  }
}

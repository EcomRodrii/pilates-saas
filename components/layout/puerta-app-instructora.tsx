'use client';

import { useEffect, useState } from 'react';
import { Smartphone } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { fetchMisEstudios } from '@/lib/supabase-data';
import { SedeActiva } from '@/components/layout/sede-activa';
import { PanelSkeleton } from '@/components/ui/panel-skeleton';
import {
  destinoInstructoraEnPanel, urlAppInstructora, type DestinoInstructoraEnPanel,
} from '@/lib/avisos/app-instructora';

// La puerta del panel para quien tiene rol INSTRUCTOR en la sede activa
// (retirada de Tentare Core, paso 2, 14-sep-2026). Sustituye el panel entero:
// ni menú ni páginas, que ya no son su sitio.
//
// Normalmente la manda a «Hoy» de la app de su estudio con `location.replace`
// (sin dejar el panel en el historial: «atrás» no la devuelve aquí). Solo si en
// otra sede gestiona le deja elegir, porque el selector de sede vive en el panel.
//
// La app tiene su propia sesión: la primera vez tendrá que iniciar sesión allí.
// Decisión expresa: no se traspasa la sesión (dos clientes con el mismo refresh
// token acaban cerrándose la sesión el uno al otro).

export function PuertaAppInstructora({ studioId, slug, nombre }: { studioId: string; slug: string | null; nombre: string }) {
  const { user } = useAuth();
  const [destino, setDestino] = useState<DestinoInstructoraEnPanel | null>(null);

  useEffect(() => {
    if (!user) return;
    let vivo = true;
    // Si falla, `fetchMisEstudios` devuelve [] y queda 'sin-confirmar': nadie
    // sale del panel por un fallo de lectura (ver `destinoInstructoraEnPanel`).
    void fetchMisEstudios().then((sedes) => { if (vivo) setDestino(destinoInstructoraEnPanel(sedes, studioId)); });
    return () => { vivo = false; };
  }, [user, studioId]);

  useEffect(() => {
    if (destino === 'app' && slug) window.location.replace(urlAppInstructora(slug));
  }, [destino, slug]);

  if (destino === null || (destino === 'app' && slug)) {
    return (
      <main className="min-h-dvh">
        <div className="max-w-[1320px] mx-auto px-4 lg:px-6 py-6 pt-14 lg:pt-6">
          <PanelSkeleton />
        </div>
      </main>
    );
  }

  if (destino === 'sin-confirmar') {
    // El panel la ve como instructora pero la BD no lo confirma: casi siempre un
    // fallo al leer el equipo. No se la saca (podría ser gerencia o recepción).
    return (
      <main className="min-h-dvh flex items-center justify-center px-4" data-testid="puerta-sin-confirmar">
        <div className="w-full max-w-sm space-y-3 text-center">
          <p className="text-[14px] font-medium text-foreground">No hemos podido comprobar tu acceso a {nombre}.</p>
          <p className="text-[13px] text-muted-foreground">Recarga la página. Si das clase aquí, tu trabajo está en la app del estudio.</p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex h-9 items-center rounded-lg bg-brand px-4 text-[13px] font-semibold text-brand-foreground"
            >
              Recargar
            </button>
            {slug && (
              <a href={urlAppInstructora(slug)} className="inline-flex h-9 items-center rounded-lg px-3 text-[13px] font-medium text-muted-foreground hover:bg-muted">
                Abrir la app del estudio
              </a>
            )}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh flex items-center justify-center px-4" data-testid="puerta-app-instructora">
      <div className="w-full max-w-sm space-y-4 text-center">
        <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-muted text-foreground">
          <Smartphone size={20} aria-hidden />
        </span>
        <div className="space-y-1">
          <h1 className="text-[16px] font-semibold text-foreground text-balance">
            En {nombre} tu trabajo está en la app del estudio
          </h1>
          <p className="text-[13px] text-muted-foreground">
            Tu agenda, pedir una baja, pasar lista, tus alumnas y los mensajes, desde el móvil.
          </p>
        </div>
        {slug ? (
          // <a> y no <Link>: la app del estudio es otra raíz de la aplicación.
          <a
            href={urlAppInstructora(slug)}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-brand px-5 text-[13px] font-semibold text-brand-foreground"
          >
            Abrir la app de {nombre}
          </a>
        ) : (
          <p className="text-[13px] text-foreground">Pide al estudio el enlace de su app.</p>
        )}
        {destino === 'elegir' && (
          <div className="space-y-2 border-t border-border pt-4">
            <p className="text-[12px] text-muted-foreground">¿Vienes a llevar otra sede? Cámbiala aquí:</p>
            <div className="flex justify-center">
              <SedeActiva variante="topbar" />
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

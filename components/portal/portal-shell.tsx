'use client';

// El armazón del portal de la clienta: puerta de sesión, transición entre
// pantallas y el menú de abajo.
//
// El menú viene del diseño "Tentare App Cliente v2": una cápsula de cristal con
// etiquetas de texto y una pastilla blanca que se desliza. Dos cambios respecto
// al menú anterior, y los dos son suyos:
//
//  · Etiquetas en vez de iconos. Un icono de "progreso" o de "mi plan" siempre
//    hay que adivinarlo; a este tamaño la palabra ocupa lo mismo y no se
//    adivina nada.
//  · Cuatro secciones y la primera es Inicio, no Clases. El diseño lo pide, y
//    además el Inicio es ahora la pantalla que resume todo — aterrizar en el
//    calendario se saltaba lo único que da contexto.
//
// "Progreso" sale del menú y pasa a ser una de las filas del Inicio, también
// como en el diseño. No se pierde: se llega igual, un toque más abajo.

import { useEffect, useState } from 'react';
import { usePathname, useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { usePortalAuth } from '@/lib/portal-auth';
import { useStudio } from '@/lib/studio-context';
import { portalThemeStyle } from '@/lib/portal-theme';
import { useModo } from '@/lib/portal-modo';
import { PORTAL_VIDEOS_CONGELADO } from '@/lib/frozen-features';
import { EASE, dur, sans, texto, radio, altura, sombra, cristal, desenfoque } from '@/lib/portal-design';
import { PushPrompt } from './push-prompt';

const ALL_NAV = [
  { seg: 'home', label: 'Inicio' },
  { seg: 'clases', label: 'Agenda' },
  { seg: 'mi-plan', label: 'Mi plan' },
  { seg: 'videos', label: 'Vídeos' },
  { seg: 'perfil', label: 'Perfil' },
];

// VOD congelado (feature-freeze PMF, independiente del flag de marketing): sin
// "Vídeos" en el portal de socias. Reactivar = PORTAL_VIDEOS_CONGELADO=false, y
// el menú se reparte solo — la pastilla mide `100/NAV.length`.
const NAV = PORTAL_VIDEOS_CONGELADO ? ALL_NAV.filter((n) => n.seg !== 'videos') : ALL_NAV;

export function PortalShell({ children }: { children: React.ReactNode }) {
  const { session, isLoading } = usePortalAuth();
  const { studio } = useStudio();
  const pathname = usePathname();
  const router = useRouter();
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const themeStyle = portalThemeStyle(studio?.temaPortal);
  const { t, noche } = useModo();

  const isLoginPage = pathname === `/portal/${slug}` || pathname === `/portal/${slug}/login` || pathname === `/portal/${slug}/acceso`;
  // /clave-nueva llega recién autenticada por magic link (o sin sesión válida
  // si el enlace caducó / el email no es de este centro): gestiona sus propios
  // estados (verificando / error / formulario) — el shell no debe redirigirla
  // ni bloquearla con el spinner genérico.
  const isClaveNueva = pathname === `/portal/${slug}/clave-nueva`;

  useEffect(() => {
    if (isLoading || isClaveNueva) return;
    if (!session && !isLoginPage) router.replace(`/portal/${slug}/login`);
    if (session && isLoginPage) router.replace(`/portal/${slug}/home`);
  }, [session, isLoading, isLoginPage, isClaveNueva, router, slug]); // eslint-disable-line react-hooks/exhaustive-deps

  // Transición entre pantallas del portal: la pantalla saliente se queda
  // montada (misma key, así React la conserva en vez de desmontarla) y se
  // superpone en absolute mientras se desvanece; la entrante hace fade-in
  // encima. Así nunca hay un instante sin nada pintado que deje ver el fondo
  // del shell.
  const [screen, setScreen] = useState<{ path: string; node: React.ReactNode }>({ path: pathname, node: children });
  const [leaving, setLeaving] = useState<{ path: string; node: React.ReactNode } | null>(null);
  if (screen.path !== pathname) {
    setLeaving(screen);
    setScreen({ path: pathname, node: children });
  } else if (screen.node !== children) {
    setScreen({ path: pathname, node: children });
  }
  useEffect(() => {
    if (!leaving) return;
    const id = setTimeout(() => setLeaving(null), 220);
    return () => clearTimeout(id);
  }, [leaving]);

  // El portal es una app de móvil, no un sitio responsive: en pantallas anchas
  // FRAME la limita al ancho de un teléfono y la centra, en vez de estirarla
  // borde a borde.
  const FRAME: React.CSSProperties = { maxWidth: 480, width: '100%', height: '100%', margin: '0 auto', position: 'relative', overflow: 'hidden', fontFamily: sans };

  if (isClaveNueva) {
    return (
      <div className="fixed inset-0" style={{ background: t.bg }}>
        <div style={{ ...FRAME, ...themeStyle }}>{children}</div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center" style={{ background: t.bg }}>
        <div className="w-8 h-8 rounded-full animate-spin" style={{ border: `3px solid ${t.line}`, borderTopColor: t.ink }} />
      </div>
    );
  }

  if (!session && !isLoginPage) return null;
  if (session && isLoginPage) return null;
  if (isLoginPage) {
    return (
      <div className="fixed inset-0" style={{ background: t.bg }}>
        <div style={{ ...FRAME, ...themeStyle }}>{children}</div>
      </div>
    );
  }

  const activeIndex = NAV.findIndex(({ seg }) => pathname.startsWith(`/portal/${slug}/${seg}`));

  return (
    <div className="fixed inset-0" style={{ background: t.bg }}>
      <div
        className="flex flex-col overflow-hidden"
        style={{ ...FRAME, paddingTop: 'env(safe-area-inset-top)', background: t.bg, ...themeStyle }}
      >
        <main className="flex-1 overflow-y-auto relative" style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
          {leaving && (
            <div key={leaving.path} className="absolute inset-0 portal-page-out" style={{ pointerEvents: 'none', background: t.bg }} aria-hidden>
              {leaving.node}
            </div>
          )}
          <div key={screen.path} className={leaving ? 'portal-page-in' : undefined}>
            {screen.node}
          </div>
          {/* Hueco bajo el contenido para que el menú flotante no tape la
              última fila. Vive aquí y no en cada pantalla porque el menú
              también vive aquí: si cambia de alto, esto cambia con él. */}
          <div style={{ height: `calc(${altura.tabbar + 38}px + env(safe-area-inset-bottom))` }} />
        </main>

        {/* Aviso de un toque para activar notificaciones al entrar. Se pinta
            solo si procede. */}
        <PushPrompt />

        <nav
          aria-label="Secciones"
          style={{
            position: 'absolute', left: 18, right: 18,
            bottom: 'calc(22px + env(safe-area-inset-bottom))',
            height: altura.tabbar, zIndex: 14, borderRadius: radio.tabbar,
            background: t.tabbar,
            ...cristal(desenfoque.tabbar, 170),
            border: `1px solid ${noche ? 'rgba(243,241,233,.10)' : 'rgba(255,255,255,.85)'}`,
            boxShadow: sombra.tabbar,
            display: 'flex', alignItems: 'center', padding: 6,
          }}
        >
          {/* La pastilla. Se mueve solo con `transform` — nunca con `left`, que
              obliga a recalcular disposición en cada frame y en Safari de iOS se
              nota. El ancho sale del número de secciones, así que si vuelve
              "Vídeos" no hay que tocar nada. */}
          {activeIndex >= 0 && (
            <span
              aria-hidden
              style={{
                position: 'absolute', left: 6, top: 6, bottom: 6,
                width: `calc((100% - 12px) / ${NAV.length})`,
                borderRadius: radio.pastilla, background: noche ? t.surface2 : '#FFFFFF',
                boxShadow: sombra.pastilla, pointerEvents: 'none',
                transform: `translateX(${activeIndex * 100}%)`,
                transition: `transform ${dur.tab}ms ${EASE}`,
                willChange: 'transform',
              }}
            />
          )}

          {NAV.map(({ seg, label }, i) => {
            const active = i === activeIndex;
            return (
              <Link
                key={seg}
                href={`/portal/${slug}/${seg}`}
                aria-current={active ? 'page' : undefined}
                style={{
                  position: 'relative', flex: 1, textAlign: 'center', ...texto.tab,
                  color: active ? t.ink : t.muted, textDecoration: 'none',
                  transition: 'color 350ms ease',
                }}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

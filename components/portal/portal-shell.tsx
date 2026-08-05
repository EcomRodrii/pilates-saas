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
import { usePortalAuth } from '@/lib/portal-auth';
import { useStudio } from '@/lib/studio-context';
import { useModo } from '@/lib/portal-modo';
import { sans, altura, radio } from '@/lib/portal-design';
import { NAV_DISPONIBLES, navItemsVisibles } from '@/lib/portal-nav';
import { PushPrompt } from './push-prompt';
import { PortalNav } from './portal-nav';

export function PortalShell({ children }: { children: React.ReactNode }) {
  const { session, isLoading } = usePortalAuth();
  const { dataLoaded, navPortal, barraClasica, variantes } = useStudio();
  const NAV = navItemsVisibles(navPortal, NAV_DISPONIBLES);
  const pathname = usePathname();
  const router = useRouter();
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const { t } = useModo();

  const isLoginPage = pathname === `/portal/${slug}` || pathname === `/portal/${slug}/login` || pathname === `/portal/${slug}/acceso`;
  // /clave-nueva llega recién autenticada por magic link (o sin sesión válida
  // si el enlace caducó / el email no es de este centro): gestiona sus propios
  // estados (verificando / error / formulario) — el shell no debe redirigirla
  // ni bloquearla con el spinner genérico.
  const isClaveNueva = pathname === `/portal/${slug}/clave-nueva`;
  // Sesión guiada: cronómetro a pantalla completa, sin la tab bar flotante
  // encima. Mismo criterio que isLoginPage/isClaveNueva — un pathname más
  // en la lista, no una gestión de overlay/z-index nueva.
  const isFullscreen = pathname.endsWith('/sesion-guiada');

  useEffect(() => {
    if (isLoading || isClaveNueva) return;
    if (!session && !isLoginPage) router.replace(`/portal/${slug}/login`);
    if (session && isLoginPage) router.replace(`/portal/${slug}/home`);
  }, [session, isLoading, isLoginPage, isClaveNueva, router, slug]);

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
        <div style={FRAME}>{children}</div>
      </div>
    );
  }

  // Sin este segundo gate, las pantallas del portal (Inicio, Clases...)
  // renderizaban de golpe con `socios`/`sesiones`/`reservas` a array vacío
  // mientras `cargarDatosPublicos` seguía en vuelo — "Mis reservas: Ninguna"
  // o "0 instructoras" se veían indistinguibles de un dato real vacío. Se
  // gatea aquí (login/clave-nueva quedan fuera: esas pantallas no necesitan
  // datos del estudio) en vez de en cada página, para no repetirlo.
  if (isLoading || (session && !isLoginPage && !isClaveNueva && !dataLoaded)) {
    return (
      <div className="fixed inset-0" style={{ background: t.bg }}>
        <div style={{ ...FRAME, padding: '28px 20px 0' }}>
          {/* Esqueleto genérico (no sabe qué pantalla se está cargando): un
              spinner solo, varios segundos, se lee como que la app se ha
              colgado — esto da la sensación de que ya hay algo ahí debajo. */}
          <div className="animate-pulse" style={{ height: 15, width: '55%', borderRadius: 7, background: t.surface2 }} />
          <div className="animate-pulse" style={{ height: 26, width: '75%', borderRadius: 8, background: t.surface2, marginTop: 10 }} />
          <div className="animate-pulse" style={{ height: 150, borderRadius: radio.card, background: t.surface2, marginTop: 22 }} />
          <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
            <div className="animate-pulse" style={{ flex: 1, height: 96, borderRadius: radio.card, background: t.surface2 }} />
            <div className="animate-pulse" style={{ flex: 1, height: 96, borderRadius: radio.card, background: t.surface2 }} />
            <div className="animate-pulse" style={{ flex: 1, height: 96, borderRadius: radio.card, background: t.surface2 }} />
          </div>
        </div>
      </div>
    );
  }

  if (!session && !isLoginPage) return null;
  if (session && isLoginPage) return null;
  if (isLoginPage) {
    return (
      <div className="fixed inset-0" style={{ background: t.bg }}>
        <div style={FRAME}>{children}</div>
      </div>
    );
  }

  // `/compras` es hija de Bonos: la píldora se queda en Bonos en vez de
  // apagarse (o saltar a Inicio, que es lo que hacía el prototipo).
  const segActual = pathname?.startsWith(`/portal/${slug}/compras`) ? 'bonos' : null;
  const activeIndex = NAV.findIndex(({ seg }) =>
    seg === segActual || pathname.startsWith(`/portal/${slug}/${seg}`));

  return (
    <div className="fixed inset-0" style={{ background: t.bg }}>
      <div
        className="flex flex-col overflow-hidden"
        style={{ ...FRAME, paddingTop: 'env(safe-area-inset-top)', background: t.bg }}
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
          {/* Hueco bajo el contenido para que el menú no tape la última fila.
              Vive aquí y no en cada pantalla porque el menú también vive
              aquí: si cambia de alto, esto cambia con él. Sin menú en
              pantalla completa, tampoco hace falta el hueco. Los +38px de
              aire son solo para la variante flotante (el espacio entre la
              cápsula y el borde de la pantalla) — la barra clásica no flota,
              así que solo necesita su propia altura. */}
          {!isFullscreen && (
            <div style={{ height: barraClasica
              ? `calc(${altura.tabbar}px + env(safe-area-inset-bottom))`
              : `calc(${altura.tabbar + 38}px + env(safe-area-inset-bottom))` }}
            />
          )}
        </main>

        {!isFullscreen && (
          <>
            {/* Aviso de un toque para activar notificaciones al entrar. Se
                pinta solo si procede. */}
            <PushPrompt />
            <PortalNav items={NAV} activeIndex={activeIndex} slug={slug} flotante={!barraClasica} etiquetas={variantes.barra} />
          </>
        )}
      </div>
    </div>
  );
}

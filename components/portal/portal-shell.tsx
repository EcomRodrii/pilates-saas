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
import { useCore } from '@/lib/core-context';
import { sans, altura } from '@/lib/portal-design';
import { NAV_DISPONIBLES, navItemsVisibles } from '@/lib/portal-nav';
import { PushPrompt } from './push-prompt';
import { PortalNav } from './portal-nav';
import { BuscarOverlay } from './buscar-overlay';

export function PortalShell({ children }: { children: React.ReactNode }) {
  const { session, isLoading } = usePortalAuth();
  // Auditoría integral 2026-08-21 (rendimiento, P0-2): useCore() en vez de
  // useStudio() — este marco se monta en TODAS las pantallas del portal, y
  // solo necesita estos 6 campos de tema/nav publicados, no los ~85 del
  // context gigante (ver lib/core-context.tsx).
  const { dataLoaded, navPortal, barraClasica, variantes } = useCore();
  const NAV = navItemsVisibles(navPortal, NAV_DISPONIBLES);
  const pathname = usePathname();
  const router = useRouter();
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

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
  // Overlay de Buscar desde la pestaña inferior — verificado en vivo contra
  // el diseño real: NO hay ninguna ruta `/buscar` (BuscarOverlay ya lo dice
  // en su propia cabecera, "NUNCA un push de ruta"). Vive aquí, no en cada
  // pantalla, porque la pestaña es del armazón, no de Inicio/Horario en
  // particular — antes de este estado esa pestaña era un `<Link>` a un 404.
  const [buscarAbierto, setBuscarAbierto] = useState(false);
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

  // ⚠️ Las pantallas de PUERTA (acceso/login/clave-nueva) cuelgan directas de
  // FRAME, que recorta con `overflow: hidden` y no tiene dónde rodar — las del
  // portal sí lo tienen, en su `<main className="overflow-y-auto">`. Mientras
  // la puerta fueron dos pasos cortos daba igual: cabían. Al unificarla en una
  // sola pantalla pasó a medir 863 px, y en un iPhone SE (667) el botón de
  // Google y «no tengo contraseña» quedaban FUERA y sin forma de llegar a
  // ellos. Medido: `scrollY` seguía en 0 tras rodar 600 px.
  //
  // Se abre solo el eje vertical: el horizontal sigue recortado a propósito,
  // que es lo que mantiene la app dentro del ancho de un teléfono.
  const MARCO_PUERTA: React.CSSProperties = {
    ...FRAME,
    overflowY: 'auto',
    WebkitOverflowScrolling: 'touch',
  } as React.CSSProperties;

  // `.portal-app`: activa app/portal/[slug]/portal-app.css — los valores
  // EXACTOS del diseño "Tentare Studio App" (--ap-*), literales, no
  // traducidos al sistema de temas. Pedido explícito tras varias rondas de
  // "no se ve igual": la traducción a tokens era donde se perdía la
  // fidelidad. En el raíz del shell para que cubra TODA pantalla del portal.
  // Sin `background: t.bg` inline en ningún div de aquí abajo: un style en
  // línea gana SIEMPRE a una clase de CSS externo, así que pisaría el
  // --ap-fondo literal sin que se notara por qué.
  if (isClaveNueva) {
    return (
      <div className="fixed inset-0 portal-app">
        <div style={MARCO_PUERTA}>{children}</div>
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
      <div className="fixed inset-0 portal-app">
        <div style={{ ...FRAME, padding: '28px 20px 0' }}>
          {/* Esqueleto genérico (no sabe qué pantalla se está cargando): un
              spinner solo, varios segundos, se lee como que la app se ha
              colgado — esto da la sensación de que ya hay algo ahí debajo. */}
          <div className="animate-pulse" style={{ height: 15, width: '55%', borderRadius: 7, background: '#EFEDE4' }} />
          <div className="animate-pulse" style={{ height: 26, width: '75%', borderRadius: 8, background: '#EFEDE4', marginTop: 10 }} />
          <div className="animate-pulse" style={{ height: 150, borderRadius: 16, background: '#EFEDE4', marginTop: 22 }} />
          <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
            <div className="animate-pulse" style={{ flex: 1, height: 96, borderRadius: 16, background: '#EFEDE4' }} />
            <div className="animate-pulse" style={{ flex: 1, height: 96, borderRadius: 16, background: '#EFEDE4' }} />
            <div className="animate-pulse" style={{ flex: 1, height: 96, borderRadius: 16, background: '#EFEDE4' }} />
          </div>
        </div>
      </div>
    );
  }

  if (!session && !isLoginPage) return null;
  if (session && isLoginPage) return null;
  if (isLoginPage) {
    return (
      <div className="fixed inset-0 portal-app">
        <div style={MARCO_PUERTA}>{children}</div>
      </div>
    );
  }

  // `/compras` es hija de Reservas (antes de la reconstrucción, de Bonos —
  // fusionado en la nueva pestaña única): la píldora se queda en Reservas en
  // vez de apagarse (o saltar a Inicio, que es lo que hacía el prototipo).
  const segActual = pathname?.startsWith(`/portal/${slug}/compras`) ? 'reservas' : null;
  const activeIndex = NAV.findIndex(({ seg }) =>
    seg === segActual || pathname.startsWith(`/portal/${slug}/${seg}`));

  return (
    <div className="fixed inset-0 portal-app">
      <div
        className="flex flex-col overflow-hidden"
        style={{ ...FRAME, paddingTop: 'env(safe-area-inset-top)' }}
      >
        <main className="flex-1 overflow-y-auto relative" style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
          {leaving && (
            <div key={leaving.path} className="absolute inset-0 portal-page-out" style={{ pointerEvents: 'none' }} aria-hidden>
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
          {/* ⚠️ SOLO cuando el menú flota. La barra clásica (Oliva, Noir) no
              flota: va en el flujo, al final de la columna, y ya ocupa su
              propio alto — el hueco de debajo no reservaba nada, sobraba. Eran
              ~90px de vacío al final de cada pantalla, y se notaba: bajabas
              del todo en el Inicio y después de los accesos rápidos venía un
              agujero. Lo reportó el fundador en los tres temas.

              Cuando SÍ flota (Bloom) el hueco es imprescindible: la cápsula va
              en `position: absolute` encima del contenido, así que sin él tapa
              la última fila. Su alto sale de la MISMA variable que usa la
              barra, no de la constante de JS — un tema puede subirla (Bloom la
              pone en 66) y el hueco se quedaba corto. */}
          {!isFullscreen && !barraClasica && (
            <div style={{ height: `calc(var(--portal-tabbar-height, ${altura.tabbar}px) + 38px + env(safe-area-inset-bottom))` }} />
          )}
        </main>

        {!isFullscreen && (
          <>
            {/* Aviso de un toque para activar notificaciones al entrar. Se
                pinta solo si procede. */}
            <PushPrompt />
            <PortalNav
              items={NAV} activeIndex={activeIndex} slug={slug} flotante={!barraClasica} etiquetas={variantes.barra}
              onBuscarClick={() => setBuscarAbierto(true)}
            />
          </>
        )}
      </div>
      <BuscarOverlay open={buscarAbierto} onClose={() => setBuscarAbierto(false)} />
    </div>
  );
}

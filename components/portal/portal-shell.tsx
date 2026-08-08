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
import { PortalTemaMarco, pantallaDeRuta } from './portal-tema-marco';
import { esTemaPortal } from '@/themes/registro';

export function PortalShell({ children }: { children: React.ReactNode }) {
  const { session, isLoading } = usePortalAuth();
  const { dataLoaded, navPortal, barraClasica, variantes, portalReact, themeIdPublicado, spots } = useStudio();
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

  // El portal en React (el kit de diseño), detrás de `studios.portal_react`.
  //
  // Se exige ADEMÁS que el tema instalado sea uno de los tres del kit: con
  // `classic` no hay juego de tokens que montar, y servirle a esa socia un
  // portal a medio tintar sería peor que dejarle el de siempre. Así, encender
  // la bandera en un estudio sin tema del kit no rompe nada: no pasa nada.
  //
  // ⚠️ TEMPORAL. Esta rama y el portal viejo se van juntos cuando acabe el
  // despliegue por fases; no dejar que eche raíces.
  //
  // Y solo en las CINCO rutas que el kit cubre: `/progreso`, `/compras`,
  // `/preferencias`, `/notificaciones`, `/invitar`, `/instructores` y
  // `/videos` no tienen pantalla equivalente y se quedan con el portal de
  // siempre. Encender la bandera no puede dejar a nadie sin esas pantallas.
  // ⚠️ Y no en Clases si el estudio asigna plaza fija. El detalle del kit
  // reserva sin elegir sitio (`spotId: null`): en un estudio de reformer eso
  // dejaría a la socia sin máquina asignada, que es justo lo que la hoja de
  // reserva de siempre le deja elegir. Un diseño nuevo no puede costar
  // funcionalidad — mientras el kit no tenga selector de plaza, esa pantalla
  // la sirve el portal completo. Los estudios sin `spots` (la mayoría) no
  // notan nada.
  const pantallaKit = pantallaDeRuta(pathname, slug);
  const kitCubre = pantallaKit && !(pantallaKit === 'clases' && spots.length > 0);

  if (portalReact && esTemaPortal(themeIdPublicado) && kitCubre) {
    return (
      <div className="fixed inset-0" style={{ background: t.bg }}>
        <div className="flex flex-col overflow-hidden" style={{ ...FRAME, paddingTop: 'env(safe-area-inset-top)' }}>
          <PortalTemaMarco />
          {/* ⚠️ El mismo componente que la rama de siempre, no una copia: es lo
              que avisa de "añade a pantalla de inicio para recibir avisos", y
              al montar el kit desapareció sin que nadie lo decidiera. Va aquí
              fuera del marco porque se posiciona contra la pantalla completa
              (`fixed`), no contra el lienzo de la pantalla activa. */}
          <PushPrompt />
        </div>
      </div>
    );
  }

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
            <PortalNav items={NAV} activeIndex={activeIndex} slug={slug} flotante={!barraClasica} etiquetas={variantes.barra} />
          </>
        )}
      </div>
    </div>
  );
}

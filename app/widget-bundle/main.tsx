// Punto de entrada del bundle embebible (Modo B, script+div sin iframe).
// Se compila aparte con esbuild (scripts/build-widget-bundle.mjs) a
// public/widget.js — NUNCA pasa por `next build`, así que aquí no hay Server
// Components, ni imports de rutas de API de servidor, ni nada que dependa del
// runtime de Next fuera del navegador.
//
// El estudio lo incrusta así en su propia web (dominio real: urlDe('/widget.js')
// en lib/seo/paginas.ts, servido desde el mismo origen que /reservar):
//   <div data-tentare-booking data-studio="mi-estudio"></div>
//   <script src=".../widget.js" async></script>
// `data-tentare-booking` (no un id fijo) porque un estudio puede querer más
// de un widget en la misma página (p. ej. una landing con dos secciones).
//
// Aislamiento de estilos: Shadow DOM (no CSS Modules/prefijos) — es lo único
// que garantiza que el CSS del estudio no toque el widget y viceversa, sin
// tener que auditar cada regla `!important` del lado del estudio. El bundle
// se compila con la MISMA hoja de Tailwind que <ReservaCalendario> ya usa
// (postcss.widget.config.mjs, alcance recortado a components/reserva/**), y
// esa hoja se inyecta como <style> DENTRO del shadow root, nunca en el
// <head> del documento anfitrión.
import { createRoot } from 'react-dom/client';
import { StrictMode, useCallback, useEffect, useRef, useState } from 'react';
import { ReservaCalendario, type ReservaSlot } from '@/components/reserva/reserva-calendario';
import { MODO_TOKENS, type ModoTokens } from '@/lib/portal-modo';
import { resolverConfigWidget, fuenteDeDataset, familiaCssDe, urlFuenteGoogle, CONFIG_WIDGET_POR_DEFECTO, type ConfigWidget } from '@/lib/reservar/config-widget';
import { luminancia } from '@/lib/reservar/apariencia-widget';
import type { FiltrosSlots } from '@/lib/reservar/construir-slots';
import { useDatosWidget } from '@/lib/widget/usar-datos-widget';
import { trackEventoWidget } from '@/lib/reservar/eventos';
import { FormularioAccesoWidget } from '@/components/widget/formulario-acceso';
import { MiCuenta, HojaCuentaWidget } from '@/components/cuenta-widget/mi-cuenta';
import type { PropsListaPlanesLazy } from '@/components/checkout-widget/checkout-lazy-mount';
import widgetCss from './widget.css';
import { canonicalizarOrigen } from '@/lib/legal-info';

// Tema base (modo día): el widget no lee el editor de Apariencia del panel —
// eso pinta /reservar/[slug] entero (fondo, tipografía, textos), un alcance
// mucho mayor que "un calendario embebido". La personalización viaja CONGELADA
// en los atributos del snippet (config-widget.ts): `data-color`/`data-marca`
// para el primario, `data-fondo`/`data-negro` que derivan un tema desde este,
// `data-fuente`/`data-fuente-display` para la tipografía (ver montarUno).
const TEMA = MODO_TOKENS.dia;

// ── Tipografía del bundle (P1) ───────────────────────────────────────────────
// ⚠️ `@font-face` DENTRO de un shadow root no carga de forma fiable: las
// fuentes se resuelven contra el documento. La vía que funciona es inyectar el
// `<link>` de Google Fonts en el <head> del ANFITRIÓN (la web del estudio) y
// referenciar la familia desde el CSS del shadow. Dedupe por href: dos widgets
// en la misma página (caso soportado, ver el comentario de data-tentare-booking)
// no deben pedir la misma hoja dos veces.
// La URL sale de `urlFuenteGoogle` (validación anti-XSS incluida) y ya lleva
// `display=swap`: la carga nunca bloquea el pintado — mientras llega se ve la
// pila de reserva.
function inyectarFuenteGoogle(nombre: string | null) {
  const url = urlFuenteGoogle(nombre);
  if (!url) return;
  if (document.head.querySelector(`link[href="${url}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = url;
  link.setAttribute('data-tentare-fuente', '');
  document.head.appendChild(link);
}

// Pilas base cuando el snippet NO nombra ninguna fuente. Decisión de
// rendimiento deliberada: el bundle no carga NINGUNA webfont que el estudio no
// haya pedido — 'Instrument Sans' solo resuelve si la web anfitriona ya la
// tiene; si no, system-ui (digno y gratis). Para titulares, Georgia: la serif
// del sistema que ya es el fallback del diseño de /reservar (portal-design.ts).
// Antes de esto las vars ni existían en el shadow → `var(--font-ui)` sin valor
// invalidaba la declaración entera y TODO caía a system-ui, titulares incluidos.
const FUENTE_UI_BASE = "'Instrument Sans', system-ui, sans-serif";
const FUENTE_DISPLAY_BASE = "'Instrument Serif', Georgia, serif";

// Fase 3 (Booking Engine — checkout embebido): opcional a propósito, mismo
// criterio que TURNSTILE_SITE_KEY en formulario-acceso.tsx — sin ella,
// <ListaPlanes> se queda sin renderizar el paso de pago (el resto del
// widget sigue funcionando).
const STRIPE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

// Origen de Tentare, capturado del propio <script src="https://.../widget.js">
// que está ejecutando este módulo — SÍNCRONO, a nivel de módulo: `document.
// currentScript` solo es fiable durante la ejecución inicial de un script
// clásico (incluido `async`), nunca dentro de un callback posterior (p. ej.
// un listener de DOMContentLoaded). Todas las rutas /api/public/... de este
// bundle son relativas por convención en el resto del repo porque las páginas
// que las llaman ya viven en tentare.app — aquí NO es así: el DOM anfitrión es
// la web del estudio, así que una ruta relativa resolvería contra SU origen.
const ORIGEN_TENTARE = (() => {
  try {
    const src = (document.currentScript as HTMLScriptElement | null)?.src;
    const origen = src ? new URL(src).origin : window.location.origin;
    // ⚠️ Sin canonicalizar, un snippet con el src en el apex (sin www) pinta
    // el widget y todas sus llamadas a la API mueren en silencio: el 308 del
    // apex lo siguen los <script>, pero un preflight CORS no. Encontrado en
    // la prueba de campo del 2026-08-20, no en ningún e2e — el panel genera
    // los snippets con www, pero recortar la URL a mano es un error natural.
    return canonicalizarOrigen(origen);
  } catch {
    return window.location.origin;
  }
})();

// `tema`/`config`/`filtros` llegan resueltos desde montarUno (una vez por
// montaje, así que son referencias estables — importa para el useMemo de
// `slots` en useDatosWidget, que tiene `filtros` en sus deps).
function WidgetApp({ slug, tema = TEMA, config = CONFIG_WIDGET_POR_DEFECTO, filtros }: {
  slug: string; tema?: ModoTokens; config?: ConfigWidget; filtros?: FiltrosSlots;
}) {
  const {
    slots, cargando, error, studioId, socia, autenticado, sesionCargando, refrescarSesion,
    politicaPrivacidad, terminosServicio, onReservar, onCancelar, onAceptarOferta,
    sesiones, tiposClase, salas, instructores, misReservas, suscripciones, planesTarifa, socio,
    stripeAccountId, onActualizarPerfil, logout, crearCheckoutEmbebido, comprarConBizum, recargar,
  } = useDatosWidget(slug, ORIGEN_TENTARE, filtros);
  // Cuántas columnas va a tener DE VERDAD el calendario, para que el esqueleto
  // reserve ese ancho y no siete siempre (ver el comentario de abajo).
  const columnasEsqueleto = config.vistaInicial === 'hoy' ? 1 : 7;
  const trackedRef = useRef(false);
  useEffect(() => {
    if (!studioId || trackedRef.current) return;
    trackedRef.current = true;
    trackEventoWidget(studioId, 'widget_loaded', { baseUrl: ORIGEN_TENTARE });
    trackEventoWidget(studioId, 'widget_viewed', { baseUrl: ORIGEN_TENTARE });
  }, [studioId]);

  // El formulario se pinta solo (sin toggle) cuando hay un JWT válido pero
  // sin ficha de socia todavía — walk-in que acaba de demostrar su email por
  // magic link/contraseña y solo le falta el alta (Fase 2, ver
  // docs/auth-widget-diseno.md §1). Sin sesión previa, un enlace "Iniciar
  // sesión" lo abre a demanda: no tapar el calendario a quien solo quiere
  // mirar horarios.
  const [accesoAbierto, setAccesoAbierto] = useState(false);
  const [cuentaAbierta, setCuentaAbierta] = useState(false);
  const [planesAbiertos, setPlanesAbiertos] = useState(false);
  // Auditoría de rendimiento (2026-08-31): `<ListaPlanes>` (Stripe incluido)
  // ya no va en ESTE bundle — ver components/checkout-widget/
  // checkout-lazy-mount.tsx. `checkoutMod` guarda el módulo una vez pedido
  // (nunca se vuelve a pedir en la misma carga de página, ni al cerrar y
  // reabrir "Planes"); `checkoutEstado` es solo para el spinner/aviso de
  // error de ESTE fetch, nunca de la compra en sí (`<ListaPlanes>` ya
  // maneja sus propios errores de pago).
  const [checkoutEstado, setCheckoutEstado] = useState<'idle' | 'cargando' | 'listo' | 'error'>('idle');
  const checkoutModRef = useRef<typeof import('./checkout-entry') | null>(null);
  const checkoutContainerRef = useRef<HTMLDivElement | null>(null);
  const walkInSinFicha = autenticado && !socia;
  // `&& !socia`: `accesoAbierto` solo se baja en tres sitios, y `onListo` solo
  // lo llama el REGISTRO — `onLoginPassword` no, confiando en un comentario que
  // dice que "el padre deja de mostrar este formulario solo". No lo hacía: al
  // entrar con contraseña, `socia` pasa a truthy y la cabecera cambia a la rama
  // "Mi cuenta", así que el botón «Ver clases sin iniciar sesión» —el único que
  // bajaba `accesoAbierto`— desaparecía y el formulario de acceso se quedaba
  // pintado para siempre encima del calendario, con la socia ya dentro. Es la
  // otra mitad de #1408 (la ficha y el login abiertos a la vez), en Modo B.
  const mostrarFormulario = walkInSinFicha || (accesoAbierto && !socia);

  // Petición explícita del fundador (2026-08-26, tras una queja real sobre
  // un estudio en producción): sin sesión, Modo B NO completa el flujo de
  // acceso dentro del propio widget — navega la página ENTERA (nunca
  // popup/pestaña nueva, `window.location.href` normal) a la ficha real en
  // Modo A (`/reservar/[slug]?sesion=`), que ya trae de fábrica el flujo
  // "pagar y reservar sin login previo" para clases de pago suelto
  // (`docs/reserva-sin-login-diseno.md` §2/§3, `openBooking()` en
  // `app/reservar/[slug]/page.tsx`) — reconstruir ese motor entero (guest
  // checkout, contrato, alta walk-in) DENTRO del bundle embebido habría
  // duplicado una lógica ya madura y probada. Solo se abre el formulario de
  // acceso interno de Modo B para el resto de casos que no reservan una
  // clase concreta (botón "Iniciar sesión" de la cabecera, "Mi cuenta").
  //
  // ⚠️ Va en `onAntesDeAbrir` (primer toque, la TARJETA de la clase), no en
  // `onReservar` (el botón DENTRO de la ficha): con el primer intento se
  // navegaba en el SEGUNDO toque — abrir la ficha embebida primero y solo
  // luego, al pulsar "Reservar" ahí dentro, disparar la redirección — un
  // paso intermedio inútil si de todas formas se va a salir del widget
  // (encontrado probando en el estudio real, no en un test). Con la
  // redirección en el primer toque, la ficha nunca llega a abrirse sin
  // sesión, así que `onReservar` solo se invoca ya autenticada — pasa
  // directo, sin envoltorio.
  const irAPaginaDeTentare = useCallback((slot: ReservaSlot) => {
    // `sesionCargando`: el bootstrap de sesión (localStorage → JWT →
    // /api/public/session) es asíncrono y corre en paralelo a la carga de
    // clases — nada garantiza que ya haya resuelto cuando la visitante toca
    // la PRIMERA tarjeta que carga. Sin esta comprobación, una socia YA
    // logueada que toca rápido vería `socia` todavía en `null` y la
    // sacaríamos del widget por error. Mientras no lo sabemos con certeza,
    // se deja abrir la ficha de siempre (fallback seguro) en vez de asumir
    // que no hay sesión.
    if (sesionCargando || socia?.socioId) return false;
    // Solo `sesion`: Modo A no tiene deep-link para el sitio elegido, se
    // vuelve a preguntar allí si la sala tiene reformers (mismo criterio
    // que si se llega desde cualquier otro enlace externo).
    // ⚠️ `directo=1` (2026-08-30, bug real con vídeo del fundador): sin él,
    // Modo A trataba este redirect interno igual que un enlace compartido
    // de verdad y abría la ficha "Te han invitado a esta clase" — el paso
    // intermedio que el comentario de arriba dice explícitamente que este
    // redirect NUNCA quiso tener. Con `directo=1`, Modo A entra derecho al
    // flujo de pagar-y-reservar-sin-login (`openBooking`).
    window.location.href = `${ORIGEN_TENTARE}/reservar/${slug}?sesion=${encodeURIComponent(slot.id)}&directo=1`;
    return true;
  }, [socia, sesionCargando, slug]);

  // Auditoría de rendimiento (2026-08-31): pide `widget-checkout.js` SOLO al
  // abrir "Planes" — nunca antes. `import()` con URL ABSOLUTA
  // (`ORIGEN_TENTARE`, no relativa): este script corre incrustado en la web
  // de un estudio, y una ruta relativa resolvería contra SU origen, no
  // contra tentare.app (mismo motivo que ya documenta `ORIGEN_TENTARE`
  // arriba para las llamadas a `/api/public/...`).
  // ⚠️ Depende SOLO de `planesAbiertos`, nunca de `checkoutEstado`: el
  // `setCheckoutEstado('cargando')` de aquí abajo es un cambio de estado
  // DENTRO del propio efecto — si `checkoutEstado` estuviera en las deps,
  // ese cambio dispara una segunda pasada del efecto, cuya limpieza pone
  // `cancelado = true` sobre la promesa de la PRIMERA pasada (la que de
  // verdad está en vuelo). Cuando esa promesa resuelve, `if (cancelado)
  // return` la descarta en silencio y la hoja se queda en "Cargando…" para
  // siempre — lo destapó el propio e2e de abajo (nunca llegaba a
  // "Planes y bonos"), no una lectura del código.
  const pidiendoCheckoutRef = useRef(false);
  useEffect(() => {
    if (!planesAbiertos || checkoutModRef.current || pidiendoCheckoutRef.current) return;
    pidiendoCheckoutRef.current = true;
    setCheckoutEstado('cargando');
    let cancelado = false;
    import(/* webpackIgnore: true */ `${ORIGEN_TENTARE}/widget-checkout.js`)
      .then((mod) => {
        if (cancelado) return;
        checkoutModRef.current = mod;
        setCheckoutEstado('listo');
      })
      .catch((e) => {
        if (cancelado) return;
        console.error('[widget] no se pudo cargar widget-checkout.js', e);
        setCheckoutEstado('error');
      })
      .finally(() => { pidiendoCheckoutRef.current = false; });
    return () => { cancelado = true; };
  }, [planesAbiertos]);

  // Monta/actualiza `<ListaPlanes>` en su propia raíz de React (independiente
  // de la de este bundle — ver el docblock de checkout-lazy-mount.tsx) cada
  // vez que cambian sus props, y la desmonta al cerrar "Planes" — nunca deja
  // el checkout de Stripe montado con la hoja cerrada.
  useEffect(() => {
    const mod = checkoutModRef.current;
    const contenedor = checkoutContainerRef.current;
    if (!planesAbiertos || checkoutEstado !== 'listo' || !mod || !contenedor) return;
    const props: PropsListaPlanesLazy = {
      t: tema, planes: planesTarifa, socioId: socia?.socioId ?? null,
      publishableKey: STRIPE_PUBLISHABLE_KEY ?? '', stripeAccountId,
      onCrearIntento: crearCheckoutEmbebido, onBizum: comprarConBizum,
      onCerrar: () => setPlanesAbiertos(false), onComprado: () => recargar({ silencioso: true }),
      onIniciarSesion: () => { setPlanesAbiertos(false); setAccesoAbierto(true); },
    };
    mod.mountListaPlanes(contenedor, props);
  });
  useEffect(() => {
    if (planesAbiertos) return;
    const mod = checkoutModRef.current;
    const contenedor = checkoutContainerRef.current;
    if (mod && contenedor) mod.unmountListaPlanes(contenedor);
  }, [planesAbiertos]);

  // 3DS forzado a salir (poco común, ver checkout-embebido.tsx): vuelve a la
  // MISMA página del estudio con este marcador — se lee una vez al montar y
  // se limpia de la URL para que un refresh no repita el aviso.
  const [avisoPago, setAvisoPago] = useState<'retorno' | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('tentare_pago') !== 'retorno') return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Lee la URL una vez al montar, no un dato derivado de un render anterior.
    setAvisoPago('retorno');
    params.delete('tentare_pago');
    const limpia = `${window.location.pathname}${params.toString() ? `?${params}` : ''}${window.location.hash}`;
    window.history.replaceState(null, '', limpia);
  }, []);

  const hayPlanesActivos = planesTarifa.some(p => p.activo);

  // Fase 4 del rediseño (docs/widget-reservas-fase4-brief-diseno.md, formato
  // 06): antes un fallo de carga sustituía TODO el widget por un párrafo
  // suelto, sin forma de reintentar salvo recargar la página del estudio
  // entera. Ahora usa el mismo patrón de error-con-reintentar que el resto
  // de formatos (en neutros fijos, vía `estiloDias="grid"` más abajo).
  if (cargando) {
    return (
      // ⚠️ El ancho mínimo se derivaba de siete columnas SIEMPRE, aunque el
      // snippet pidiera `vista=hoy` (una sola). El esqueleto medía 700px, el
      // calendario real medía una columna, y el layout pegaba un salto al
      // terminar de cargar. Ahora las columnas del esqueleto son las que de
      // verdad va a haber.
      <div style={{ padding: '52px 24px', display: 'grid', gridTemplateColumns: `repeat(${columnasEsqueleto}, minmax(96px, 1fr))`, gap: 8, minWidth: columnasEsqueleto * 100, overflowX: 'auto' }} aria-busy="true">
        {Array.from({ length: columnasEsqueleto }).map((_, i) => (
          <div key={i} style={{ height: 96, borderRadius: 8, background: 'linear-gradient(100deg, #ECECEC 40%, #E0E0E0 50%, #ECECEC 60%)', backgroundSize: '200% 100%', animation: 'widget-skeleton-shimmer 1.1s linear infinite' }} />
        ))}
      </div>
    );
  }
  return (
    <div>
      {avisoPago === 'retorno' && (
        <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 12, background: 'var(--portal-velo-suave)', fontSize: 12.5, color: tema.ink, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <span>Si has confirmado el pago con tu banco, en unos segundos verás el plan activo en Mi cuenta.</span>
          <button type="button" onClick={() => setAvisoPago(null)} aria-label="Cerrar aviso" style={{ background: 'none', border: 'none', color: tema.muted, cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 14, marginBottom: 10 }}>
        {hayPlanesActivos && (
          <button type="button" onClick={() => setPlanesAbiertos(true)} style={{ background: 'none', border: 'none', color: 'var(--portal-brand)', fontSize: 12.5, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3 }}>
            Planes
          </button>
        )}
        {socia ? (
          <button type="button" onClick={() => setCuentaAbierta(true)} style={{ background: 'none', border: 'none', color: 'var(--portal-brand)', fontSize: 12.5, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3 }}>
            Mi cuenta
          </button>
        ) : mostrarFormulario ? (
          !walkInSinFicha && (
            <button type="button" onClick={() => setAccesoAbierto(false)} style={{ background: 'none', border: 'none', color: tema.muted, fontSize: 12.5, cursor: 'pointer' }}>
              Ver clases sin iniciar sesión
            </button>
          )
        ) : (
          <button type="button" onClick={() => setAccesoAbierto(true)} style={{ background: 'none', border: 'none', color: 'var(--portal-brand)', fontSize: 12.5, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3 }}>
            Iniciar sesión
          </button>
        )}
      </div>
      {cuentaAbierta && socio && (
        <HojaCuentaWidget t={tema} onClose={() => setCuentaAbierta(false)}>
          <MiCuenta
            t={tema} socio={socio}
            reservas={misReservas} sesiones={sesiones} tiposClase={tiposClase} salas={salas} instructores={instructores}
            suscripciones={suscripciones} planesTarifa={planesTarifa}
            onCancelar={onCancelar} onAceptarOferta={onAceptarOferta}
            onActualizarPerfil={onActualizarPerfil}
            onLogout={() => { setCuentaAbierta(false); logout(); }}
          />
        </HojaCuentaWidget>
      )}
      {/* `onComprado` con `{silencioso:true}`: <ListaPlanes> hace
          `setEstado({fase:'exito'})` y acto seguido llama a esto. Con la recarga
          ruidosa, el esqueleto sustituye el árbol entero y la socia NO llega a
          ver la confirmación de una compra que ya está cobrada. Mismo fallo que
          en onReservar, en el camino donde además hay dinero. */}
      {planesAbiertos && (
        <HojaCuentaWidget t={tema} onClose={() => setPlanesAbiertos(false)}>
          {/* Auditoría de rendimiento (2026-08-31): `<ListaPlanes>` (Stripe
              incluido) se monta en su PROPIA raíz de React dentro de este
              `<div>`, cargada bajo demanda — ver checkout-lazy-mount.tsx.
              Este `<div>` SIEMPRE está en el árbol mientras `planesAbiertos`
              (nunca condicionado a `checkoutEstado`): el efecto de arriba
              necesita el nodo montado ANTES de poder pintar dentro de él. */}
          <div ref={checkoutContainerRef} />
          {checkoutEstado === 'cargando' && (
            <p style={{ textAlign: 'center', fontSize: 12.5, color: tema.muted, padding: '24px 0' }}>Cargando…</p>
          )}
          {checkoutEstado === 'error' && (
            <p style={{ textAlign: 'center', fontSize: 12.5, color: tema.muted, padding: '24px 0' }}>
              No hemos podido cargar la compra online. Comprueba tu conexión e inténtalo de nuevo.
            </p>
          )}
        </HojaCuentaWidget>
      )}
      {mostrarFormulario && (
        <div style={{ marginBottom: 16 }}>
          <FormularioAccesoWidget
            t={tema}
            slug={slug}
            baseUrl={ORIGEN_TENTARE}
            studioId={studioId ?? ''}
            autenticado={walkInSinFicha}
            politicaPrivacidad={politicaPrivacidad}
            terminosServicio={terminosServicio}
            onListo={() => { refrescarSesion(); setAccesoAbierto(false); }}
          />
        </div>
      )}
      <ReservaCalendario
        t={tema}
        slots={slots}
        onReservar={onReservar}
        onAntesDeAbrir={irAPaginaDeTentare}
        onCancelar={onCancelar}
        onAceptarOferta={onAceptarOferta}
        vacio={{ titulo: 'No hay clases disponibles', cuerpo: 'Vuelve a mirar más tarde.' }}
        // Fase 4 del rediseño, formato 06: rejilla de 7 columnas en neutros
        // fijos (ver comentario de `estiloDias` en reserva-calendario.tsx) en
        // vez de tira+un-día. `data-diseno="completo"` (config-widget.ts)
        // cambia a la tira+día de Modo A; sin atributo se queda la rejilla
        // de siempre — un snippet viejo se ve EXACTAMENTE igual que hoy.
        estiloDias={config.diseno === 'completo' ? 'dias' : 'grid'}
        vistaInicial={config.vistaInicial}
        ocultarPrecio={config.ocultarPrecio}
        ocultarNivel={config.ocultarNivel}
        ocultarSustituta={config.ocultarSustituta}
        error={error ? { onReintentar: recargar, titulo: 'No hemos podido cargar el horario' } : undefined}
        origenTentare={ORIGEN_TENTARE}
        // BUG del popup en Modo B: el rediseño "sin popup" (#1369) solo llegó
        // a Modo A (`estiloFicha="vista"` en app/reservar/[slug]/page.tsx) —
        // este bundle nunca pasaba la prop y caía al 'modal' de siempre, con
        // el backdrop de toda la vida. 'inline' es la variante pensada para
        // aquí: mismo "sin popup", pero sin `window.scrollTo` de página
        // completa (ver el docblock de `estiloFicha` en reserva-calendario.tsx)
        // — el widget vive a mitad de la web del estudio, no en una página
        // propia.
        estiloFicha="inline"
      />
    </div>
  );
}

function montarUno(host: HTMLElement) {
  const slug = host.dataset.studio?.trim();
  if (!slug) {
    console.error('[tentare-widget] Falta data-studio en el contenedor.');
    return;
  }
  // Vocabulario nuevo del snippet (config-widget.ts): data-tipos,
  // data-instructoras, data-salas, data-vista, data-ocultar-precio,
  // data-ocultar-nivel, data-ocultar-sustituta, data-diseno, data-fondo,
  // data-marca, data-negro. `data-color` sigue siendo el primario de siempre
  // (retrocompatible, sin validar, como estaba); `data-marca` gana si vienen
  // los dos porque pasa por el filtro anti-basura del parser.
  const config = resolverConfigWidget(fuenteDeDataset(host.dataset as Record<string, string | undefined>));
  const color = config.colorPrimario ?? host.dataset.color?.trim();
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = widgetCss;
  shadow.appendChild(style);
  const raiz = document.createElement('div');
  const marcaFinal = color || '#343825';
  raiz.style.setProperty('--portal-brand', marcaFinal);
  // Bug real en producción (2026-08-26): un estudio con data-marca="#ffffff"
  // (blanco) tenía este valor SIEMPRE fijo a un beige claro, sin mirar la
  // marca real — resultado, botón blanco con texto beige sobre página
  // blanca, invisible. Modo A (app/reservar/[slug]/page.tsx) ya calculaba
  // esto por luminancia; Modo B nunca lo hizo — dos implementaciones del
  // mismo dato que divergieron. Mismo criterio aquí: oscuro sobre marca
  // clara, claro sobre marca oscura.
  const l = luminancia(marcaFinal);
  raiz.style.setProperty('--portal-brand-foreground', l != null && l < 0.45 ? '#FFFFFF' : '#22261F');
  raiz.style.setProperty('--success', '#2F6B4F');
  raiz.style.setProperty('--warning', '#8F6215');
  raiz.style.setProperty('--destructive', '#A8442A');
  // Tipografía (P1): mismo contrato que Modo A (apariencia-widget) —
  // `fuente-display` a null hereda de `fuente`. Las vars se fijan SIEMPRE
  // (con la base como valor): `all: initial` en :host NO resetea custom
  // properties, así que sin esto un `--font-ui` de la web anfitriona se
  // colaría en el shadow — y sin ninguna definición, `var(--font-ui)`
  // invalidaba la declaración entera (el bug de "todo en system-ui").
  inyectarFuenteGoogle(config.fuente);
  if (config.fuenteDisplay !== config.fuente) inyectarFuenteGoogle(config.fuenteDisplay);
  const fuenteUi = config.fuente ? familiaCssDe(config.fuente) : FUENTE_UI_BASE;
  const fuenteDisplay = config.fuenteDisplay ? familiaCssDe(config.fuenteDisplay)
    : config.fuente ? familiaCssDe(config.fuente) : FUENTE_DISPLAY_BASE;
  raiz.style.setProperty('--font-ui', fuenteUi);
  raiz.style.setProperty('--font-display', fuenteDisplay);
  // `serif` (portal-design.ts) mira primero --portal-heading-font: se fija
  // también para que un valor heredado del anfitrión no gane a --font-display.
  raiz.style.setProperty('--portal-heading-font', fuenteDisplay);
  // El texto que HEREDA (sin fontFamily propio) también debe ver la pila:
  // la regla de :host queda por encima de raiz y no lee las vars de raiz.
  raiz.style.fontFamily = fuenteUi;
  // data-fondo pinta el lienzo del widget (por defecto es transparente y se ve
  // la web anfitriona, como siempre). data-negro cambia la tinta del tema.
  // No es un filtro CSS por encima: <ReservaCalendario> pinta por tokens
  // (`t=`), así que el override honesto es un tema derivado de MODO_TOKENS.dia
  // con esos dos tokens pisados — y el fondo del tema también, para que la
  // hoja de reserva no se quede con el blanco de siempre sobre un lienzo
  // oscuro.
  if (config.colorFondo) raiz.style.background = config.colorFondo;
  const tema: ModoTokens = {
    ...TEMA,
    ...(config.colorNegro ? { ink: config.colorNegro } : {}),
    ...(config.colorFondo ? { bg: config.colorFondo } : {}),
  };
  // Referencia estable a propósito (ver comentario de WidgetApp).
  const filtros: FiltrosSlots = { tipos: config.tipos, instructoras: config.instructoras, salas: config.salas };
  shadow.appendChild(raiz);
  createRoot(raiz).render(<StrictMode><WidgetApp slug={slug} tema={tema} config={config} filtros={filtros} /></StrictMode>);
}

// ⚠️ Bug real en producción (2026-08-30): un estudio con el snippet insertado
// dentro de un bloque de WordPress (builder de página / plugin de carga
// diferida) veía el widget completamente ausente — nunca un error, nunca un
// esqueleto, nada. Causa: cuando el HTML de un bloque se pinta con
// `elemento.innerHTML = "..."` (patrón habitual de esos plugins, en vez de
// dejar que el HTML llegue ya parseado con la página), CUALQUIER `<script>`
// dentro de ese HTML queda inerte — es una regla del propio navegador, sin
// excepción para `async`/`defer`, y no hay forma de detectarlo desde fuera:
// si `widget.js` nunca llega a ejecutarse, nada de lo que haga este fichero
// puede arreglarlo (verificado en vivo: cero peticiones de red al `<script
// src>` del snippet, aunque el tag estuviera presente en el HTML servido).
//
// Lo que SÍ está en nuestra mano es la otra mitad del problema, más común de
// lo que parece: el contenedor `[data-tentare-booking]` apareciendo en el DOM
// DESPUÉS de que `widget.js` ya se haya ejecutado una vez (contenido cargado
// por AJAX, pestañas/acordeones que montan su contenido tarde, sitios
// React/Vue del propio estudio) — hasta ahora `iniciar()` era un barrido
// ÚNICO al cargar, así que cualquier contenedor que llegara después se
// quedaba sin montar para siempre, sin ningún aviso. Un MutationObserver
// sigue vigilando el DOM mientras la página exista, sea cual sea el motivo
// por el que el contenedor llega tarde.
const montados = new WeakSet<HTMLElement>();
function montarSiNuevo(host: HTMLElement) {
  if (montados.has(host)) return;
  montados.add(host);
  montarUno(host);
}

function iniciar() {
  document.querySelectorAll<HTMLElement>('[data-tentare-booking]').forEach(montarSiNuevo);

  const observador = new MutationObserver((mutaciones) => {
    for (const mutacion of mutaciones) {
      for (const nodo of mutacion.addedNodes) {
        if (!(nodo instanceof HTMLElement)) continue;
        if (nodo.hasAttribute('data-tentare-booking')) montarSiNuevo(nodo);
        nodo.querySelectorAll<HTMLElement>('[data-tentare-booking]').forEach(montarSiNuevo);
      }
    }
  });
  observador.observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', iniciar);
} else {
  iniciar();
}

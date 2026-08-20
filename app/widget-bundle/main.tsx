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
import { resolverConfigWidget, fuenteDeDataset, CONFIG_WIDGET_POR_DEFECTO, type ConfigWidget } from '@/lib/reservar/config-widget';
import type { FiltrosSlots } from '@/lib/reservar/construir-slots';
import { useDatosWidget } from '@/lib/widget/usar-datos-widget';
import { trackEventoWidget } from '@/lib/reservar/eventos';
import { FormularioAccesoWidget } from '@/components/widget/formulario-acceso';
import { MiCuenta, HojaCuentaWidget } from '@/components/cuenta-widget/mi-cuenta';
import { ListaPlanes } from '@/components/checkout-widget/lista-planes';
import widgetCss from './widget.css';

// Tema base (modo día): el widget no lee el editor de Apariencia del panel —
// eso pinta /reservar/[slug] entero (fondo, tipografía, textos), un alcance
// mucho mayor que "un calendario embebido". La personalización viaja CONGELADA
// en los atributos del snippet (config-widget.ts): `data-color`/`data-marca`
// para el primario, `data-fondo`/`data-negro` que derivan un tema desde este
// (ver montarUno). Tipografía sigue fuera de este bundle.
const TEMA = MODO_TOKENS.dia;

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
    return src ? new URL(src).origin : window.location.origin;
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
    slots, cargando, error, studioId, socia, autenticado, refrescarSesion,
    politicaPrivacidad, terminosServicio, onReservar, onCancelar, onAceptarOferta,
    sesiones, tiposClase, salas, instructores, misReservas, suscripciones, planesTarifa, socio,
    stripeAccountId, onActualizarPerfil, logout, crearCheckoutEmbebido, comprarConBizum, recargar,
  } = useDatosWidget(slug, ORIGEN_TENTARE, filtros);
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
  const walkInSinFicha = autenticado && !socia;
  const mostrarFormulario = walkInSinFicha || accesoAbierto;

  // Modo A (page.tsx) recuerda la clase que se intentaba reservar cuando no
  // hay sesión (`bookingSesionId`) y la retoma sola tras el login. Modo B no
  // tenía equivalente: `onReservar` del hook devolvía "Inicia sesión para
  // reservar." como un aviso sin salida — cerraba la hoja y ahí se quedaba,
  // sin abrir el acceso ni recordar la clase (auditoría de esta sesión).
  // `pendienteReserva` es ese mismo recuerdo, solo que aquí no hay una hoja
  // reabrible desde fuera (el slot abierto es estado INTERNO de
  // <ReservaCalendario>) — en vez de reabrirla, la reserva se completa sola
  // en cuanto `socia` pasa a tener valor, y el resultado se avisa con un
  // banner (mismo patrón que `avisoPago` más abajo).
  const [pendienteReserva, setPendienteReserva] = useState<{ slot: ReservaSlot; spotId: string | null } | null>(null);
  const [avisoReservaPendiente, setAvisoReservaPendiente] = useState<'CONFIRMADA' | 'LISTA_ESPERA' | string | null>(null);
  const manejarReservar = useCallback(async (slot: ReservaSlot, spotId: string | null) => {
    if (!socia?.socioId) {
      setPendienteReserva({ slot, spotId });
      setAccesoAbierto(true);
      return; // Sin resultado → <ReservaCalendario> cierra la hoja (mismo contrato que Modo A).
    }
    return onReservar(slot, spotId);
  }, [socia, onReservar]);
  useEffect(() => {
    if (!socia?.socioId || !pendienteReserva) return;
    const { slot, spotId } = pendienteReserva;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Guarda contra doble envío: limpia el pendiente ANTES del await, no un dato derivado de un render anterior.
    setPendienteReserva(null);
    void onReservar(slot, spotId).then(r => {
      if (!r) return;
      setAvisoReservaPendiente(r.ok ? r.estado : r.error);
    });
  }, [socia, pendienteReserva, onReservar]);

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
      <div style={{ padding: '52px 24px', display: 'grid', gridTemplateColumns: 'repeat(7, minmax(96px, 1fr))', gap: 8, minWidth: 700, overflowX: 'auto' }} aria-busy="true">
        {Array.from({ length: 7 }).map((_, i) => (
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
      {avisoReservaPendiente && (
        <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 12, background: 'var(--portal-velo-suave)', fontSize: 12.5, color: tema.ink, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <span>
            {avisoReservaPendiente === 'CONFIRMADA' ? 'Reserva confirmada.'
              : avisoReservaPendiente === 'LISTA_ESPERA' ? 'Te hemos apuntado a la lista de espera.'
                : avisoReservaPendiente}
          </span>
          <button type="button" onClick={() => setAvisoReservaPendiente(null)} aria-label="Cerrar aviso" style={{ background: 'none', border: 'none', color: tema.muted, cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
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
      {planesAbiertos && (
        <HojaCuentaWidget t={tema} onClose={() => setPlanesAbiertos(false)}>
          <ListaPlanes
            t={tema} planes={planesTarifa} socioId={socia?.socioId ?? null}
            publishableKey={STRIPE_PUBLISHABLE_KEY ?? ''} stripeAccountId={stripeAccountId}
            onCrearIntento={crearCheckoutEmbebido} onBizum={comprarConBizum}
            onCerrar={() => setPlanesAbiertos(false)} onComprado={recargar}
            onIniciarSesion={() => { setPlanesAbiertos(false); setAccesoAbierto(true); }}
          />
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
        onReservar={manejarReservar}
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
  raiz.style.setProperty('--portal-brand', color || '#343825');
  raiz.style.setProperty('--portal-brand-foreground', '#D9C29E');
  raiz.style.setProperty('--success', '#2F6B4F');
  raiz.style.setProperty('--warning', '#8F6215');
  raiz.style.setProperty('--destructive', '#A8442A');
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

function iniciar() {
  const hosts = document.querySelectorAll<HTMLElement>('[data-tentare-booking]');
  hosts.forEach(montarUno);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', iniciar);
} else {
  iniciar();
}

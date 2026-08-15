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
import { StrictMode, useEffect, useRef, useState } from 'react';
import { ReservaCalendario } from '@/components/reserva/reserva-calendario';
import { MODO_TOKENS } from '@/lib/portal-modo';
import { useDatosWidget } from '@/lib/widget/usar-datos-widget';
import { trackEventoWidget } from '@/lib/reservar/eventos';
import { FormularioAccesoWidget } from '@/components/widget/formulario-acceso';
import { MiCuenta, HojaCuentaWidget } from '@/components/cuenta-widget/mi-cuenta';
import { ListaPlanes } from '@/components/checkout-widget/lista-planes';
import widgetCss from './widget.css';

// Tema fijo (modo día): el widget no lee el editor de Apariencia del panel —
// eso pinta /reservar/[slug] entero (fondo, tipografía, textos), un alcance
// mucho mayor que "un calendario embebido". Personalización de color mínima
// vía `data-color` (ver abajo) es lo que sí pide el brief ("colores del
// estudio"); tipografía/fondo/textos quedan fuera de este primer bundle.
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

function WidgetApp({ slug }: { slug: string }) {
  const {
    slots, cargando, error, studioId, socia, autenticado, refrescarSesion,
    politicaPrivacidad, terminosServicio, onReservar, onCancelar, onAceptarOferta,
    sesiones, tiposClase, salas, instructores, misReservas, suscripciones, planesTarifa, socio,
    stripeAccountId, onActualizarPerfil, logout, crearCheckoutEmbebido, comprarConBizum, recargar,
  } = useDatosWidget(slug, ORIGEN_TENTARE);
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

  if (error) {
    return <div style={{ padding: 24, textAlign: 'center', color: TEMA.muted, fontSize: 14 }}>{error}</div>;
  }
  if (cargando) {
    return <div style={{ padding: 24, textAlign: 'center', color: TEMA.muted, fontSize: 14 }}>Cargando clases…</div>;
  }
  return (
    <div>
      {avisoPago === 'retorno' && (
        <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 12, background: 'var(--portal-velo-suave)', fontSize: 12.5, color: TEMA.ink, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <span>Si has confirmado el pago con tu banco, en unos segundos verás el plan activo en Mi cuenta.</span>
          <button type="button" onClick={() => setAvisoPago(null)} aria-label="Cerrar aviso" style={{ background: 'none', border: 'none', color: TEMA.muted, cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
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
            <button type="button" onClick={() => setAccesoAbierto(false)} style={{ background: 'none', border: 'none', color: TEMA.muted, fontSize: 12.5, cursor: 'pointer' }}>
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
        <HojaCuentaWidget t={TEMA} onClose={() => setCuentaAbierta(false)}>
          <MiCuenta
            t={TEMA} socio={socio}
            reservas={misReservas} sesiones={sesiones} tiposClase={tiposClase} salas={salas} instructores={instructores}
            suscripciones={suscripciones} planesTarifa={planesTarifa}
            onCancelar={onCancelar} onAceptarOferta={onAceptarOferta}
            onActualizarPerfil={onActualizarPerfil}
            onLogout={() => { setCuentaAbierta(false); logout(); }}
          />
        </HojaCuentaWidget>
      )}
      {planesAbiertos && (
        <HojaCuentaWidget t={TEMA} onClose={() => setPlanesAbiertos(false)}>
          <ListaPlanes
            t={TEMA} planes={planesTarifa} socioId={socia?.socioId ?? null}
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
            t={TEMA}
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
        t={TEMA}
        slots={slots}
        onReservar={onReservar}
        onCancelar={onCancelar}
        onAceptarOferta={onAceptarOferta}
        vacio={{ titulo: 'No hay clases disponibles', cuerpo: 'Vuelve a mirar más tarde.' }}
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
  const color = host.dataset.color?.trim();
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
  shadow.appendChild(raiz);
  createRoot(raiz).render(<StrictMode><WidgetApp slug={slug} /></StrictMode>);
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

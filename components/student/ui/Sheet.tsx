'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useBloquearScrollFondo } from '@/components/ui/use-dialog-a11y';

/**
 * Bottom sheet del kit: handle 34×4, radio 24, entrada con spring, y cierre por
 * velo, Esc o arrastre de más de 90 px.
 *
 * El FOCO lo gestiona esta hoja, y el paquete no lo contempla: al abrirse, el
 * foco se quedaba en el botón que la había abierto —debajo del velo—, así que
 * con teclado Tab seguía recorriendo la página tapada y un lector de pantalla
 * anunciaba «diálogo» sin entrar en él. Ahora entra en la hoja, se queda dentro
 * mientras está abierta y VUELVE a donde estaba al cerrarse, que es lo que
 * espera quien navega sin ratón.
 *
 * Dos desviaciones respecto al fichero del paquete, las dos TÉCNICAS — la forma,
 * las medidas y el movimiento son idénticos:
 *
 * 1. El paquete resetea el arrastre con `useEffect(() => { if (!open) setDy(0) })`.
 *    El lint de este repo (React Compiler) lo rechaza, y tiene razón: es un
 *    `setState` síncrono dentro de un efecto, que provoca un render en cascada.
 *    Aquí el desplazamiento se DERIVA (`open ? dy : 0`) en vez de sincronizarse,
 *    así que no hacen falta ni el efecto ni el render de más.
 *
 * 2b. ⚠️ **Se pinta con un PORTAL a `document.body`, y esto no es estética.**
 *    `position: fixed` deja de referirse a la ventana en cuanto un ANCESTRO
 *    tiene `transform`, y en esta app eso pasa sin que se vea venir: `.a-up`
 *    —la animación de entrada que llevan medio Inicio y media ficha de clase—
 *    es `animation: apUp … both`, y aunque su último fotograma dice
 *    `transform: none`, el `fill-mode` deja el estilo calculado en
 *    `matrix(1, 0, 0, 1, 0, 0)`. Una matriz identidad SIGUE creando bloque
 *    contenedor.
 *
 *    Medido al abrir esta hoja desde el buscador de Inicio, que vive dentro de
 *    un `<form className="px a-up">`: el panel salía a `y=212` en vez de
 *    pegado abajo, y el velo —`inset: 0`— cubría solo la caja del formulario,
 *    así que la página de detrás ni se oscurecía. Con el portal, la hoja cuelga
 *    de un anfitrión propio, hermano de `<main>`, y no hay ancestro que la
 *    pueda mover. Mismo fallo que ya documentó `.panel-page-in` en el panel.
 *
 * 2. El paquete decide si hay transición leyendo `y0.current` DURANTE el render.
 *    Leer una ref en render es lo que prohíbe `react-hooks/refs`, y además no es
 *    fiable: una ref no provoca re-render, así que el valor leído puede ser el
 *    del render anterior. Se sustituye por un estado `arrastrando`, que es lo
 *    que de verdad tiene que repintar.
 */
/** No hay nada a lo que suscribirse: solo interesa servidor vs. cliente. */
const sinSuscripcion = () => () => {};

export function Sheet({ open, onClose, children, label }: {
  open: boolean; onClose: () => void; children: ReactNode; label: string;
}) {
  // M-7 (auditoría 58ª pasada): con la hoja abierta, `body` seguía en
  // `overflow: visible` — «scroll chaining» clásico, el gesto que llega al
  // final del contenido de la hoja arrastra la página de detrás. Mismo hook
  // ya usado por `PublicSheet`/`DashboardSheet` (components/ui/use-dialog-
  // a11y.ts), con su cuenta de hojas anidadas — no se reinventa aquí.
  useBloquearScrollFondo(open);

  const [dy, setDy] = useState(0);
  const [arrastrando, setArrastrando] = useState(false);
  const y0 = useRef<number | null>(null);
  const panel = useRef<HTMLDivElement>(null);

  // Lo que puede recibir foco DENTRO de la hoja, en orden de tabulación. Se
  // recalcula en cada Tab a propósito: el contenido cambia mientras está
  // abierta (la hoja de compra pasa de un botón a un formulario de tarjeta).
  const focosables = useCallback(() => Array.from(
    panel.current?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])',
    ) ?? [],
  ).filter((el) => el.offsetParent !== null || el.tagName === 'IFRAME'), []);

  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab') return;
      // Trampa de foco. Sin esto, Tab desde el último control de la hoja se
      // iba a la página de debajo —que está tapada por el velo— y no había
      // forma de volver sin ratón.
      //
      // Ojo: cuando el foco está DENTRO de un iframe (el bloque de tarjeta de
      // Stripe), sus eventos no llegan a este documento, así que este manejador
      // ni se ejecuta y el tabulado interno de Stripe funciona como siempre.
      const items = focosables();
      if (items.length === 0) { e.preventDefault(); panel.current?.focus(); return; }
      const primero = items[0];
      const ultimo = items[items.length - 1];
      const activo = document.activeElement;
      // El foco puede estar FUERA del panel sin que nadie haya tabulado hacia
      // afuera: basta con que desaparezca el control que lo tenía. Pasa en esta
      // misma app —al pulsar «Continuar al pago», ese botón se va del DOM y el
      // foco cae al <body>—, y desde ahí el siguiente Tab se iba a la página
      // tapada. Comprobar solo los extremos no lo cubría.
      if (!panel.current?.contains(activo)) {
        e.preventDefault();
        (e.shiftKey ? ultimo : primero).focus();
        return;
      }
      if (!e.shiftKey && activo === ultimo) { e.preventDefault(); primero.focus(); }
      else if (e.shiftKey && (activo === primero || activo === panel.current)) { e.preventDefault(); ultimo.focus(); }
    };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [open, onClose, focosables]);

  // Entrar al abrir y VOLVER al cerrar. El destino de vuelta se captura al
  // abrir: en ese momento `document.activeElement` sigue siendo el control que
  // la abrió.
  useEffect(() => {
    if (!open) return;
    const previo = document.activeElement as HTMLElement | null;
    // Al panel, no al primer botón: leer el título antes que la primera acción
    // es lo que hace un diálogo bien hecho, y evita disparar sin querer un
    // control con la barra espaciadora nada más abrir.
    panel.current?.focus({ preventScroll: true });
    return () => { previo?.focus?.({ preventScroll: true }); };
  }, [open]);

  // Derivado, no sincronizado: cerrada, el desplazamiento es 0 sin más.
  const desplazamiento = open ? dy : 0;

  const soltar = () => {
    // El umbral del kit: por debajo de 90 px vuelve a su sitio, por encima cierra.
    if (dy > 90) onClose();
    y0.current = null;
    setArrastrando(false);
    setDy(0);
  };

  // El portal solo existe tras montar: en el render del servidor no hay
  // `document`. Con `useSyncExternalStore` y no con un `useState` + efecto,
  // que es lo que rechaza el React Compiler de este repo (y con razón: sería
  // un render en cascada por cada hoja de la app). Mismo patrón que
  // `lib/use-atajo-buscar.ts`.
  const montado = useSyncExternalStore(sinSuscripcion, () => true, () => false);
  if (!montado) return null;

  return createPortal(
    <>
      <div
        onClick={onClose}
        aria-hidden
        style={{
          position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(15,15,15,.42)',
          opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none', transition: 'opacity .3s',
        }}
      />
      <div
        ref={panel}
        // Sin `tabIndex` un <div> no puede recibir foco, y sin foco dentro no
        // hay nada que atrapar: es lo que hace del diálogo el punto de partida.
        tabIndex={-1}
        role="dialog"
        aria-modal
        aria-label={label}
        // Cerrada solo está DESPLAZADA fuera de pantalla (para la animación de
        // salida): sin esto, Tab desde el CTA entraba en sus enlaces invisibles
        // y VoiceOver la leía como parte de la página.
        inert={!open}
        style={{
          position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 51, maxWidth: 640, margin: '0 auto',
          background: 'var(--background)',
          borderRadius: 'var(--radius-sheet) var(--radius-sheet) 0 0',
          boxShadow: 'var(--shadow-sheet)',
          paddingBottom: 'var(--safe-bottom)',
          transform: open ? `translateY(${desplazamiento}px)` : 'translateY(110%)',
          // Mientras se arrastra no hay transición: el panel tiene que seguir al
          // dedo. Al soltar vuelve el spring.
          transition: arrastrando ? 'none' : 'transform var(--dur-sheet) var(--ease-spring)',
          outline: 'none',
        }}
      >
        <div
          onPointerDown={(e) => { y0.current = e.clientY; setArrastrando(true); }}
          onPointerMove={(e) => { if (y0.current !== null) setDy(Math.max(0, e.clientY - y0.current)); }}
          onPointerUp={soltar}
          // Sin esto, soltar fuera del handle deja el panel pegado al dedo.
          onPointerCancel={soltar}
          // M-6 (auditoría 58ª): el padding de antes (9px arriba, 4px abajo)
          // dejaba una zona de arrastre de 17px de alto (9+4 del asa+4) —
          // menos de la mitad del mínimo táctil de 44px. El asa VISUAL (34×4)
          // no cambia; solo crece el área invisible que la rodea.
          style={{ padding: '20px 0 20px', touchAction: 'none', cursor: 'grab' }}
        >
          <div style={{ width: 34, height: 4, borderRadius: 99, background: 'var(--border-strong)', margin: '0 auto' }} />
        </div>
        {/* Tope de altura: con mucho contenido (bio larga + lista) el panel
            tapaba el velo y el handle quedaba fuera de pantalla — sin forma
            táctil de cerrar. */}
        <div style={{ padding: '10px 18px 26px', maxHeight: 'calc(100dvh - 120px)', overflowY: 'auto', overscrollBehavior: 'contain' }}>{children}</div>
      </div>
    </>,
    // ⚠️ El anfitrión va DENTRO de `.student-app` (lo pinta `StudentShell`).
    // A `document.body` la hoja sale bien colocada pero sin una sola regla del
    // kit encima: todo está scopeado en `.student-app`. El respaldo a `body`
    // es para las pantallas sueltas que no montan el shell — mejor descolocada
    // que no pintada.
    document.getElementById('student-portal-host') ?? document.body,
  );
}

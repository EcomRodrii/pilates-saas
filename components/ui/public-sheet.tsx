'use client';

import { useState } from 'react';
import { useDialogA11y } from './use-dialog-a11y';

// Hoja/modal accesible para las páginas públicas (reserva, confirmación de
// cita). Es el mismo shell visual (backdrop con blur + hoja blanca, abajo en
// móvil / centrada en desktop) que ya usan reservar/[slug] y citas-publica,
// ahora con la semántica que le faltaba: `role="dialog"`, trampa de foco,
// cierre con Escape y devolución del foco a quien la abrió al cerrarla. La
// mecánica de accesibilidad vive en useDialogA11y (compartida con
// DashboardSheet, el equivalente para el dashboard con tema bg-card).
//
// No impone la estructura interna (título, cabecera, pasos) — cada caller
// sigue siendo dueño de su contenido; esto solo resuelve la parte tediosa y
// fácil de hacer mal si se repite a mano en cada modal.
export function PublicSheet({
  open,
  onClose,
  label,
  children,
  sheetClassName = 'bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl',
  sheetStyle,
  overlayStyle,
  overlayClassName = '',
  closeOnBackdropClick = true,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  children: React.ReactNode;
  sheetClassName?: string;
  sheetStyle?: React.CSSProperties;
  /**
   * Clases extra en el backdrop (además de `p-4 sm:p-6`) — el único hueco que
   * `overlayStyle` no puede cubrir: es un `style` en línea, así que no puede
   * expresar "sin relleno solo en móvil". Pensado para el caller que quiera
   * una hoja a sangre en móvil (mismo borde a borde que `BookingSheet` de
   * `reserva-calendario.tsx`) en vez de la tarjeta flotante de siempre.
   */
  overlayClassName?: string;
  /**
   * Pisa el posicionamiento del backdrop (P0-3, widget embebido): dentro de un
   * <iframe> auto-dimensionado, `inset-0` + `items-end` anclan el modal al
   * FONDO del iframe entero — a ~1000px de lo que el usuario ve (medido). El
   * caller embebido pasa aquí la franja visible (`top`/`height`) o el anclaje
   * al top como fallback. Ojo: el `sm:items-center` de la clase mide el ancho
   * del IFRAME, no de la pantalla real — por eso esto va por style, que gana.
   */
  overlayStyle?: React.CSSProperties;
  closeOnBackdropClick?: boolean;
  /**
   * La acción principal, anclada abajo y SIEMPRE visible.
   *
   * ⚠️ Sin esto, el CTA era el último hijo de un contenedor con `maxHeight` y
   * scroll, y en el paso «datos» quedaba detrás del teclado: hay foto, título,
   * tres filas de datos, descripción, cuatro campos y una casilla obligatoria
   * por encima. Al enfocar el último campo, en iOS el teclado tapa la mitad
   * inferior del modal (el viewport de layout no encoge), así que no se veía ni
   * el botón ni la casilla que lo habilita — la persona veía un formulario sin
   * salida y sin saber por qué. Es exactamente el mismo defecto que ya se
   * arregló para la hoja de la ficha de clase, que sí tiene footer propio.
   *
   * Con `footer`, la hoja pasa a ser columna: el contenido scrollea y esto no.
   */
  footer?: React.ReactNode;
}) {
  const { sheetRef } = useDialogA11y({ open, onClose });

  // Se queda montada un instante más al cerrar, para que la animación de salida
  // se vea. Con `if (!open) return null` a secas, TODAS las hojas de este flujo
  // —reserva, acceso, registro, contrato, legales, citas— entraban animadas y
  // desaparecían de golpe: la asimetría que hacía que cerrar se sintiera como
  // un corte. El patrón es el mismo que ya usa `DashboardDrawer`, que resolvió
  // esto mismo en el panel; `prefers-reduced-motion` ya acorta las animaciones
  // a ~0 desde globals.css, así que no hay que comprobarlo aquí.
  const [rendered, setRendered] = useState(open);
  const [cerrando, setCerrando] = useState(false);

  // Ajuste durante el render y no en un efecto: con efecto, al abrir se pinta un
  // frame sin la hoja (`rendered` todavía en false) y la entrada arranca un
  // fotograma tarde. Es lo que documenta React para reaccionar a un cambio de
  // prop.
  const [abiertoPrevio, setAbiertoPrevio] = useState(open);
  if (open !== abiertoPrevio) {
    setAbiertoPrevio(open);
    if (open) { setRendered(true); setCerrando(false); }
    else if (rendered) setCerrando(true);
  }

  if (!rendered) return null;

  // Solo se reestructura cuando hay footer: sin él, la hoja se comporta
  // EXACTAMENTE igual que antes (el caller sigue mandando con `sheetStyle`).
  const cuerpo = footer
    ? <div style={{ overflowY: 'auto', overscrollBehavior: 'contain', flex: '1 1 auto', minHeight: 0 }}>{children}</div>
    : children;

  return (
    <div
      // z-60 y no z-50: el BookingSheet del calendario (la ficha de clase)
      // también usa 50, y esta hoja se abre ENCIMA de aquella. Empatados,
      // ganaba por orden de aparición en el DOM — funcionaba, pero por
      // casualidad: mover un bloque de JSX habría invertido el apilamiento sin
      // que nada lo delatara.
      className={`fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4 sm:p-6 ${overlayClassName} ${cerrando ? 'animate-sheet-backdrop-out' : 'animate-sheet-backdrop-in'}`}
      style={{ backgroundColor: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)', ...overlayStyle }}
      onClick={closeOnBackdropClick ? onClose : undefined}
    >
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={`${sheetClassName} ${cerrando ? 'animate-sheet-pop-out' : 'animate-sheet-pop-in'}`}
        // Desmontar al TERMINAR la salida, no por temporizador: un `setTimeout`
        // que no case con la duración real deja la hoja fantasma o la corta.
        onAnimationEnd={() => { if (cerrando) setRendered(false); }}
        style={footer
          // `overflow: hidden` en la hoja y el scroll en el cuerpo: si el
          // scroll se quedara aquí, el footer scrollearía con el contenido y no
          // serviría de nada.
          ? { ...sheetStyle, display: 'flex', flexDirection: 'column', overflow: 'hidden' }
          : sheetStyle}
        onClick={e => e.stopPropagation()}
      >
        {cuerpo}
        {footer && (
          <div style={{
            flexShrink: 0,
            // Una línea de pelo separa la acción del contenido que scrollea
            // por detrás — sin ella, el botón parece parte del formulario y no
            // se lee como «el paso siguiente».
            borderTop: '1px solid rgba(0,0,0,0.07)',
            // El aire propio del footer, más la barra de gestos del iPhone.
            // `env(safe-area-inset-bottom)` funciona aquí desde que el layout
            // de /reservar declara `viewportFit: 'cover'` — antes devolvía 0 y
            // este cálculo habría sido decorativo.
            padding: ' 14px 0 calc(env(safe-area-inset-bottom, 0px))',
            marginTop: 2,
          }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

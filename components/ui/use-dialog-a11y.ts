'use client';

import { useEffect, useRef, useState } from 'react';

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Mecánica de accesibilidad para diálogos hechos a mano (los que no pueden
// usar components/ui/dialog — Base UI — porque necesitan su propio shell
// visual: hoja pública con hex fijos, o modal del dashboard con bg-card).
// Resuelve trampa de foco, cierre con Escape y devolución del foco a quien
// abrió el diálogo. Usado por PublicSheet y DashboardSheet.
export function useDialogA11y({
  open,
  onClose,
  // `PublicSheet`'s modo `inline` (rediseño "sin popup"): sin backdrop ni
  // altura acotada, el contenido scrollea con la PÁGINA — bloquear
  // `body`/`documentElement` aquí (pensado para una hoja flotante con fondo
  // que proteger) deja contenido más alto que la pantalla inalcanzable, sin
  // ningún scroll posible. Por defecto `false`: el resto de callers
  // (DashboardSheet, hojas flotantes de siempre) no lo pasan y no ven ningún
  // cambio.
  inline = false,
}: {
  open: boolean;
  onClose: () => void;
  inline?: boolean;
}) {
  const sheetRef = useRef<HTMLDivElement>(null);
  // Ref para la versión más reciente de onClose: el efecto de abajo NO puede
  // depender del valor de `onClose` directamente. Casi todos los que llaman a
  // este hook pasan un callback inline (`onClose={() => setX(false)}`), que
  // cambia de identidad en CADA render del padre — incluida cada tecla
  // pulsada en un input de dentro del diálogo. Con `onClose` en el array de
  // dependencias, cada pulsación desmontaba y remontaba este efecto, y el
  // cleanup (línea de abajo) devolvía el foco a `disparador`, cerrando el
  // teclado virtual en móvil tras cada carácter (alta pública /reservar).
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  // Inicializador perezoso: cubre el caso — el más común en este código base —
  // en que el propio padre MONTA el diálogo condicionalmente
  // (`{cond && <Modal open .../>}`) en vez de mantenerlo montado y alternar
  // `open`. Ahí `open` nace ya en `true`, así que un ajuste basado en
  // "¿cambió respecto al render anterior?" nunca se dispara — se perdía la
  // devolución de foco al cerrar (caía a <body>, verificado en un caso real).
  const [disparador, setDisparador] = useState<HTMLElement | null>(() =>
    open ? (document.activeElement as HTMLElement | null) : null
  );
  const [openAnterior, setOpenAnterior] = useState(open);

  // Ajuste de estado durante el render (patrón oficial de React para
  // "capturar algo antes de que cambie", sin refs — este proyecto exige
  // reglas React Compiler-safe que prohíben leer/escribir refs durante el
  // render). Cubre el otro caso: el diálogo permanece montado y `open`
  // alterna internamente (p.ej. `open={cancelConfirm !== null}`). Importa
  // que se capture AQUÍ y no en un efecto: si el contenido trae su propio
  // `autoFocus` (p.ej. un <input> de login), React lo aplica en el commit,
  // antes de que corra cualquier useEffect — para cuando el efecto de abajo
  // se ejecutase, document.activeElement ya sería ese input y no lo de fuera
  // que abrió el diálogo.
  if (open !== openAnterior) {
    setOpenAnterior(open);
    if (open) setDisparador(document.activeElement as HTMLElement | null);
  }

  useEffect(() => {
    if (!open) return;
    const sheet = sheetRef.current;
    // Si el contenido ya se autoenfocó a sí mismo (autoFocus), se respeta —
    // solo se mueve el foco cuando nada dentro del diálogo lo tiene todavía.
    if (!sheet?.contains(document.activeElement)) {
      const primero = sheet?.querySelector<HTMLElement>(FOCUSABLE);
      (primero ?? sheet)?.focus();
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !sheet) return;
      const focusables = Array.from(sheet.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      disparador?.focus();
    };
  }, [open, disparador]);

  useBloquearScrollFondo(open && !inline);

  return { sheetRef };
}

/**
 * Bloquea el scroll de la página de fondo mientras hay una hoja abierta.
 *
 * ⚠️ Esto NO existía en ninguna hoja del flujo de reserva — medido en
 * producción: con la hoja de clase abierta, `body` seguía en
 * `overflow: visible`. El efecto en móvil es el «scroll chaining» clásico: al
 * llegar al final del contenido de la hoja el gesto no se para, sigue y
 * arrastra el listado de clases de detrás. La hoja parece despegarse y, al
 * cerrarla, el fondo ha viajado a otro sitio.
 *
 * Vive suelto (y no solo dentro de `useDialogA11y`) porque el `BookingSheet`
 * del calendario —la PRIMERA hoja que se abre, y la que más se usa— tiene su
 * propio shell y no pasa por ese hook.
 *
 * Se guarda y restaura el valor ANTERIOR en vez de escribir `''`: las hojas se
 * encadenan (la ficha de clase abre encima el modal de reserva) y la de dentro,
 * al cerrarse, desbloquearía el fondo con la de fuera todavía abierta.
 */
// Cuántas hojas hay abiertas ahora mismo, y qué había en el CSS antes de la
// primera. Ver el porqué del contador en `useBloquearScrollFondo`.
let hojasAbiertas = 0;
let overflowPrevio: { body: string; raiz: string } | null = null;

export function useBloquearScrollFondo(activo: boolean) {
  useEffect(() => {
    if (!activo) return;

    // ⚠️ Un contador, y no «guardo el valor anterior y lo restauro»: las hojas
    // de este flujo SE SOLAPAN —la ficha de clase abre encima el modal de
    // reserva y se desmonta— y al desmontarse restauraba el valor de antes,
    // desbloqueando el fondo con el modal todavía abierto. El e2e lo pilló
    // midiendo `scrollY`; leyendo el CSS parecía correcto.
    //
    // ⚠️ Y hacen falta LAS DOS raíces: con `overflow: hidden` solo en `body`,
    // quien scrollea de verdad en esta página es `documentElement` y el fondo
    // seguía moviéndose igual.
    if (hojasAbiertas === 0) {
      overflowPrevio = {
        body: document.body.style.overflow,
        raiz: document.documentElement.style.overflow,
      };
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
    }
    hojasAbiertas += 1;

    return () => {
      hojasAbiertas -= 1;
      if (hojasAbiertas === 0 && overflowPrevio) {
        document.body.style.overflow = overflowPrevio.body;
        document.documentElement.style.overflow = overflowPrevio.raiz;
        overflowPrevio = null;
      }
    };
    // A propósito NO se usa el truco de `position: fixed` + restaurar scroll,
    // que es el remedio habitual para iOS: aquí colapsaría la altura del
    // documento, y esa altura es justo la que se le anuncia al anfitrión por
    // `tentareEmbedAltura` — el iframe del estudio se encogería a nada al abrir
    // una hoja. El encadenamiento del gesto se corta aparte, con
    // `overscroll-behavior: contain` en el scroller de cada hoja.
  }, [activo]);
}

// Lógica pura (sin React) del bloqueo de scroll de fondo que usa
// components/ui/use-dialog-a11y.ts (`useBloquearScrollFondo`, PublicSheet y
// DashboardSheet). Separada de aquel fichero para poder probarla con
// `node --test` (lib/**/*.test.ts) — un hook con efectos no se puede.
//
// Bloquea el scroll de la página de fondo mientras hay una hoja abierta.
//
// ⚠️ Esto NO existía en ninguna hoja del flujo de reserva — medido en
// producción: con la hoja de clase abierta, `body` seguía en
// `overflow: visible`. El efecto en móvil es el «scroll chaining» clásico: al
// llegar al final del contenido de la hoja el gesto no se para, sigue y
// arrastra el listado de clases de detrás. La hoja parece despegarse y, al
// cerrarla, el fondo ha viajado a otro sitio.
//
// Se guarda y restaura el valor ANTERIOR en vez de escribir `''`: las hojas se
// encadenan (la ficha de clase abre encima el modal de reserva) y la de
// dentro, al cerrarse, desbloquearía el fondo con la de fuera todavía
// abierta. Por eso es un CONTADOR y no «guardo/restauro una vez».
//
// ⚠️ Bug real de producción (28-sep-2026): varios estudios sin poder deslizar
// en NINGÚN sitio del panel, sin ningún diálogo visible en pantalla — el
// síntoma exacto de que este contador se desincronizó (un efecto de limpieza
// que no llegó a correr) y se quedó por encima de 0 para siempre: como nunca
// vuelve solo a 0, ninguna hoja nueva puede ya desbloquear el scroll. Dos
// redes de seguridad, ambas en este fichero:
//   1. `adquirir()` no se fía del contador a ciegas: si al abrir la PRIMERA
//      hoja de esta tanda el fondo YA está bloqueado, es un residuo de una
//      fuga anterior — capturarlo como «el valor de antes» perpetuaría el
//      bloqueo en vez de arreglarlo, así que se asume la base correcta (sin
//      overflow en línea).
//   2. `reiniciar()`, para cuando cambia de RUTA (llamada desde
//      ProveedoresRaiz): ninguna hoja de este código base está pensada para
//      seguir abierta al navegar a otra página — su `open` vive en estado
//      local del componente de esa página, que se desmonta. En el caso sano
//      no cambia nada; en el desincronizado, lo repara.
let hojasAbiertas = 0;
let overflowPrevio: { body: string; raiz: string } | null = null;

type DocumentoBloqueable = {
  body: { style: { overflow: string } };
  documentElement: { style: { overflow: string } };
};

function doc(): DocumentoBloqueable | null {
  return typeof document === 'undefined' ? null : (document as unknown as DocumentoBloqueable);
}

/** Añade una hoja a la cuenta y bloquea el fondo si es la primera. Devuelve la función de liberación (llamar en el cleanup del efecto). */
export function adquirirBloqueoScroll(): () => void {
  const d = doc();
  if (d) {
    if (hojasAbiertas === 0) {
      const yaBloqueado = d.body.style.overflow === 'hidden' && d.documentElement.style.overflow === 'hidden';
      overflowPrevio = yaBloqueado ? { body: '', raiz: '' } : { body: d.body.style.overflow, raiz: d.documentElement.style.overflow };
      d.body.style.overflow = 'hidden';
      d.documentElement.style.overflow = 'hidden';
    }
    hojasAbiertas += 1;
  }
  let liberada = false;
  return () => {
    if (liberada) return; // el cleanup de un efecto de React no debería llamarse dos veces, pero una liberación no es idempotente sin esto: restaría dos veces si algún caller lo hiciera.
    liberada = true;
    hojasAbiertas = Math.max(0, hojasAbiertas - 1);
    if (hojasAbiertas === 0 && overflowPrevio) {
      const d2 = doc();
      if (d2) {
        d2.body.style.overflow = overflowPrevio.body;
        d2.documentElement.style.overflow = overflowPrevio.raiz;
      }
      overflowPrevio = null;
    }
  };
}

/** Red de seguridad: fuerza el contador a 0 y limpia el `overflow` en línea. Ver la nota de arriba. */
export function reiniciarBloqueoDeScroll(): void {
  hojasAbiertas = 0;
  overflowPrevio = null;
  const d = doc();
  if (!d) return;
  d.body.style.overflow = '';
  d.documentElement.style.overflow = '';
}

/** Solo para el test: cuántas hojas cree el módulo que hay abiertas ahora mismo. */
export function hojasAbiertasParaTest(): number {
  return hojasAbiertas;
}

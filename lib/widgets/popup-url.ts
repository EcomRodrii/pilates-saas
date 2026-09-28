// La puerta del runtime del popup (app/widget-bundle/popup.ts): qué URL de un
// `data-tentare-popup` se deja abrir. Aparte y sin efectos para poder
// probarla con `node --test` — el runtime toca `document` al cargar.
//
// ⚠️ Solo una vista de `/reservar/<slug>` en el MISMO origen que el script (el
// apex cuenta como `www`, que es adonde redirige: `canonicalizarOrigen`). Cualquier otra
// dirección se ignora: el script no puede convertirse en un visor de iframes
// de cualquier sitio pegado en la web de un estudio.
import { canonicalizarOrigen } from '../legal-info.ts';

export function urlPopupPermitida(cruda: string | null, origen: string): string | null {
  if (!cruda) return null;
  try {
    const u = new URL(cruda, origen);
    if (canonicalizarOrigen(u.origin) !== origen) return null;
    if (!/^\/reservar\/[A-Za-z0-9-]+$/.test(u.pathname)) return null;
    // Siempre la vista incrustada: la página completa trae su propia cabecera.
    u.searchParams.set('embed', '1');
    // Y marcada como ventana: el estilo de los widgets de su web no se funde
    // aquí, porque el marco del popup es blanco fijo y un widget fundido de
    // letra clara (el de una web oscura) no se leería encima
    // (lib/reservar/estilo-web.ts). Va en el script que sirve Tentare, no en
    // el código que se copia: los popups ya pegados lo llevan sin tocar nada.
    u.searchParams.set('ventana', '1');
    return `${origen}${u.pathname}?${u.searchParams.toString()}`;
  } catch {
    return null;
  }
}

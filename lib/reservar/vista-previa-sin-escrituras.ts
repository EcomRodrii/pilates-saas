// La vista previa del constructor de widgets NO reserva, ni compra, ni paga, ni
// da de alta, ni manda correos (01b-auditoría de widgets, hallazgo #4).
//
// La vista previa es la página de reservas de VERDAD (`/reservar/[slug]` con
// `vista-previa=1`) dentro de un iframe del panel. Hasta el 16-oct-2026 todo lo
// que se pulsaba ahí dentro pasaba de verdad: una reserva a nombre de quien
// escribiera su correo, un enlace de acceso a ese correo y, lo peor, un pago:
// `(window.top ?? window).location.href = <Stripe Checkout>` sacaba el PANEL
// ENTERO a Stripe, porque el iframe es del mismo origen, y el borrador del estilo
// (que solo vive en React) se perdía.
//
// El corte va en la FRONTERA de escritura y no pantalla a pantalla: en
// `postPublico` (lib/studio-context.tsx, por donde pasan reservar, cancelar,
// darse de alta, plaza fija, favoritos…), en `enviarEnlace`
// (lib/use-socia-session.ts) y en las llamadas directas de
// app/reservar/[slug]/page.tsx (el checkout embebido y los dos de Stripe). Cada
// una devuelve el camino de fallo que ya sabe enseñar su pantalla («el servidor
// dice que no», #992) con este mensaje, que no miente: no ha pasado nada.
// Lo vigila `vista-previa-sin-escrituras.test.ts`, que lee esos tres ficheros.
//
// Mismo marcador que ya usaban el formulario de contacto («En la vista previa no
// se envía») y el embudo (no cuenta la visita): `vista-previa=1`. El código que
// se copia en una web nunca lo lleva (lib/widgets/integracion.ts:`conVistaPrevia`),
// y «Abrir en una pestaña» abre la dirección sin él.

export const ESCRITURA_EN_VISTA_PREVIA = 'En la vista previa no se reserva de verdad: ni se paga ni se manda nada. En tu web, sí.';

/** ¿Es esta dirección la vista previa del panel? (`vista-previa=1`) */
export function esVistaPreviaDelPanel(busqueda: string | URLSearchParams): boolean {
  const p = typeof busqueda === 'string' ? new URLSearchParams(busqueda) : busqueda;
  return p.get('vista-previa') === '1';
}

// Una vez vista, se queda: una navegación interna de la página que reescriba la
// dirección (`?paso=`, `?clase=`) no puede devolver las escrituras de verdad
// dentro de la vista previa. Cada iframe es su propio documento, así que esto
// no se le pega a ninguna otra pestaña.
let vista = false;

/** En el navegador: ¿esta página es la vista previa del panel? */
export function enVistaPreviaDelPanel(): boolean {
  if (vista) return true;
  if (typeof window === 'undefined') return false;
  vista = esVistaPreviaDelPanel(window.location.search);
  return vista;
}

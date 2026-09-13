import { origenPermitido } from '@/lib/cors-widget';
import { nonceValido } from '@/lib/widget/puente-sesion';
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
// ⚠️ SEGURIDAD. Tres garantías, las tres necesarias:
//
// 1. Destino resuelto en SERVIDOR (auditoría 21/22-ago, C-1): `origenEstudio`
//    se valida contra `studios.widget_dominios_autorizados` (la misma lista
//    blanca que gobierna el CORS del widget, `lib/cors-widget.ts`). El cliente
//    nunca vuelve a leer la URL.
//
// 2. Solo sesiones NUEVAS. Esa lista blanca la escribe cada estudio, así que
//    por sí sola no basta para decidir que una sesión ya guardada en el
//    navegador puede salir hacia ese origen (la clave de sesión del portal es
//    común a todos los estudios). El puente solo reenvía una sesión cuyo
//    acceso por email ocurrió DESPUÉS de abrirse esta página — lo comprueba el
//    claim `amr` del token contra `abiertoEn`, que se fija aquí con el reloj
//    del servidor (`lib/widget/puente-sesion.ts`). Una sesión preexistente, o
//    una obtenida por contraseña/OAuth, nunca se reenvía.
//
// 3. Un intento, un nonce. El widget genera un nonce por intento, lo usa en
//    `window.open` y en `emailRedirectTo`, y solo acepta el mensaje que lo
//    trae. Sin nonce válido no hay destino.
//
// No se añade COOP: rompería `window.opener`, que es el transporte.
//
// Ver docs/auth-widget-diseno.md §2 para el diseño completo, incluido el
// spike pendiente de validar en Safari real con "Prevent Cross-Site
// Tracking" — este flujo no se ha probado todavía fuera de este repo.

// Reloj del servidor, no del dispositivo: se compara con la marca de tiempo
// que pone gotrue, y un móvil con la hora mal no debe decidir la frescura.
// Esta página es dinámica (lee searchParams), así que se evalúa por petición.
function marcaDeApertura(): number {
  return Date.now();
}

export default async function WidgetAuthRetorno({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const slug = typeof sp.slug === 'string' ? sp.slug : null;
  const origenEstudio = typeof sp.origenEstudio === 'string' ? sp.origenEstudio : null;
  const nonce = nonceValido(sp.nonce) ? sp.nonce : null;

  const destino = slug && origenEstudio && nonce ? await origenPermitido({ slug }, origenEstudio) : null;
  const abiertoEn = marcaDeApertura();

  return <WidgetAuthRetornoCliente destino={destino} nonce={destino ? nonce : null} abiertoEn={abiertoEn} />;
}

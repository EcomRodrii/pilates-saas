// ─────────────────────────────────────────────────────────────────────────────
// Datos legales del titular del sitio y servicios usados. FUENTE ÚNICA para las
// páginas públicas /legal, /privacidad, /terminos y /cookies.
//
// Titular = persona física (autónomo). Un autónomo NO tiene datos registrales
// (el Registro Mercantil es solo para sociedades), por eso ese campo no existe.
// El TEXTO legal de las páginas sigue siendo de plantilla y conviene que lo
// revise asesoría jurídica. Si en el futuro se constituye una S.L., actualizar
// titular/nif/domicilio y volver a añadir los datos registrales.
// ─────────────────────────────────────────────────────────────────────────────

export const LEGAL = {
  marca: 'Tentare',
  // ⚠️ CON www, y no es un capricho de estilo.
  //
  // El host que sirve el sitio de verdad es `www.tentare.app`: el ápice
  // (`tentare.app`) devuelve un 308 hacia él, en los dos sentidos que importan
  // —la home y cualquier ruta interna—. Medido el 2026-08-11.
  //
  // Mientras esto decía `tentare.app` a secas, TODAS las páginas declaraban un
  // canonical que apuntaba a una URL que redirige. Google lo resuelve siguiendo
  // el 308, pero es exactamente la señal que un canonical existe para evitar: la
  // página se sirve en un sitio y dice ser otro.
  //
  // Si algún día se quita el redirect y el ápice pasa a servir directamente,
  // esto vuelve a `https://tentare.app` — y con ese cambio se mueve el sitio
  // entero, porque de aquí salen canonicals, sitemap, robots y JSON-LD.
  dominio: 'www.tentare.app',
  url: 'https://www.tentare.app',
  // Fecha de última revisión del contenido legal (no la de render).
  actualizado: '23 de julio de 2026',

  // ── Identificación del titular (LSSI-CE art. 10) ────────────────────────────
  // Persona física (autónomo). Sin datos registrales (ver cabecera).
  titular: 'Marcos Roca Rodríguez',
  nif: '27361301H',
  domicilio: 'Barcelona',

  // ── Contacto ────────────────────────────────────────────────────────────────
  email: 'hola@tentare.app',
  emailPrivacidad: 'privacidad@tentare.app',
} as const;

// Encargados/subencargados del tratamiento realmente usados por el producto
// (RGPD art. 28). Se listan en la Política de Privacidad. Mantener en sync con
// las integraciones reales del código.
export const PROVEEDORES: { nombre: string; uso: string; ubicacion: string }[] = [
  { nombre: 'Supabase', uso: 'Base de datos, autenticación y almacenamiento', ubicacion: 'UE' },
  { nombre: 'Vercel', uso: 'Alojamiento y entrega de la aplicación', ubicacion: 'UE / EE. UU.' },
  { nombre: 'Stripe', uso: 'Procesamiento de pagos y facturación', ubicacion: 'UE / EE. UU.' },
  { nombre: 'Resend', uso: 'Envío de correos transaccionales', ubicacion: 'UE / EE. UU.' },
  { nombre: 'Cloudflare', uso: 'Almacenamiento de archivos (R2) y vídeo (Stream)', ubicacion: 'UE / EE. UU.' },
  { nombre: 'Sentry', uso: 'Monitorización de errores', ubicacion: 'UE / EE. UU.' },
  { nombre: 'Inngest', uso: 'Ejecución de tareas y automatizaciones', ubicacion: 'UE / EE. UU.' },
  { nombre: 'Google (opcional)', uso: 'Integración con Google Calendar / Gmail, si la activas', ubicacion: 'UE / EE. UU.' },
  { nombre: 'Zoom (opcional)', uso: 'Integración de videollamadas, si la activas', ubicacion: 'UE / EE. UU.' },
];

// ⚠️ El apex (`tentare.app` a secas) redirige 308 al host canónico con www —
// ver el comentario de `dominio` arriba. Un <script> sigue redirects, pero un
// preflight CORS NO: el bundle embebible cargado desde el apex se pintaba y
// todas sus llamadas a la API morían en silencio (prueba de campo 2026-08-20).
// Vive aquí y no en el bundle porque este fichero es la fuente ÚNICA del
// origen (hay un test que prohíbe escribir el dominio a mano en otro sitio);
// el apex se DERIVA del canónico quitando el prefijo www, nunca se escribe.
export function canonicalizarOrigen(origen: string): string {
  const canonico = new URL(LEGAL.url);
  const apex = canonico.hostname.replace(/^www\./, '');
  try {
    const u = new URL(origen);
    if (u.protocol === 'https:' && u.hostname === apex) return canonico.origin;
  } catch { /* origen raro: se devuelve tal cual */ }
  return origen;
}

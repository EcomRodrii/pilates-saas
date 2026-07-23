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
  dominio: 'tentare.app',
  url: 'https://tentare.app',
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

// Menú principal. También alimenta el `SiteNavigationElement` de
// components/OrganizationStructuredData.tsx, así que cambiar esta lista mueve
// las candidatas a sitelinks de Google — no es solo la barra de arriba.
//
// «Producto» y «Precio» apuntaban a anclas de la propia home (#recorrido,
// #precio). Ahora van a páginas reales: una ancla no es una URL para Google, y
// las dos consultas que traían («funcionalidades», «precio») merecen destino
// propio. `#faq` se queda como ancla porque su contenido sigue viviendo aquí.
export const NAV_LINKS = [
  { href: '/funcionalidades', label: 'Funcionalidades' },
  { href: '/funcionalidades/sustituciones', label: 'Sustituciones' },
  { href: '/precios', label: 'Precios' },
  { href: '#faq', label: 'FAQ' },
  { href: '/recursos', label: 'Recursos' },
];

// Solo integraciones CONECTABLES por el estudio hoy (auditoría 2026-07-23):
// Mailchimp/Brevo eran "próximamente" en el producto y "Google" a secas y
// Resend no eran conexiones del estudio — se anuncian como en camino o fuera.
export const INTEGRACIONES = [
  { group: 'Pagos', items: ['Stripe'] },
  { group: 'Email y mensajería', items: ['Gmail', 'WhatsApp Business', '+ Mailchimp y Brevo en camino'] },
  { group: 'Calendario y acceso', items: ['Google Calendar', 'Kisi'] },
  { group: 'Clases online', items: ['Zoom'] },
  { group: 'Datos', items: ['Excel · importar y exportar', '+ más en camino'] },
];

// Planes de la home. `cta` es el texto del botón; el de Cadena lleva a WhatsApp,
// no al alta (antes decía «Hablar con ventas» y llevaba a /crear-estudio).
// ⚠️ Nada que el código no respalde: «Soporte dedicado» salió el 23-sep porque
// no existe en los entitlements, y «EL MÁS ELEGIDO» también (0 estudios de pago).
export const PLANS = [
  {
    name: 'Base',
    price: '29€',
    desc: 'Para empezar. Hasta 150 alumnas.',
    features: ['Reservas y calendario', 'Cobros, bonos y facturas', 'Sustituciones asistidas'],
    cta: 'Probar 7 días gratis',
    dark: false,
    popular: false,
    contacto: false,
  },
  {
    name: 'Estudio',
    price: '59€',
    desc: 'El plan completo. Alumnas ilimitadas.',
    features: ['Todo lo de Base', 'Alumnas ilimitadas', 'Sustituciones autónomas', 'App con tu marca'],
    cta: 'Probar 7 días gratis',
    dark: true,
    popular: true,
    contacto: false,
  },
  {
    name: 'Cadena',
    price: '149€',
    desc: 'Varias sedes en un mismo panel.',
    features: ['Todo lo de Estudio', 'Varios centros', 'Un solo acceso para todas'],
    cta: 'Hablar con nosotros',
    dark: false,
    popular: false,
    contacto: true,
  },
];

// Las 8 preguntas de la home (rediseño 23-sep; eran 14). Alimentan también el
// JSON-LD FAQPage de StructuredData, así que lo que se lee aquí es lo que
// Google ve. Cada respuesta está cruzada con el código — registro de
// afirmaciones de la Fase 1: la prueba es del plan que eliges (no «todo
// abierto»), la migración no tiene plazo garantizado, WhatsApp solo con la
// cuenta de Meta del estudio y la exportación son CSV.
export const FAQ_ITEMS: { q: string; a: string }[] = [
  {
    q: '¿La prueba pide tarjeta?',
    a: 'No. Son 7 días gratis del plan que elijas y no te pedimos ningún dato de pago para empezar: creas tu estudio y entras. Cuando termina la prueba no se te cobra nada; si no eliges plan, se pausa y tus datos siguen ahí.',
  },
  {
    q: '¿Cuánto tarda ponerlo en marcha?',
    a: 'Tu horario y tu página de reservas quedan listos en tu primera sesión: el asistente te propone la semana con tus salas y tus clases, y tú la confirmas. Los cobros online se activan al conectar tu cuenta de Stripe, y el resto lo vas activando a tu ritmo.',
  },
  {
    q: '¿Puedo traer mis datos de otro programa?',
    a: 'Sí. El importador reconoce las exportaciones de Timp, Momence, bsport, Eversports y Mindbody, y también Excel: alumnas, bonos, reservas y clases. Te enseña un acta con los números para comprobar que todo cuadra y, si algo no te convence, lo deshaces con un botón. Si prefieres, lo hacemos contigo. Las tarjetas guardadas no se pueden pasar de una plataforma a otra: te ayudamos con ese paso.',
  },
  {
    q: '¿Mis alumnas tienen que descargar algo?',
    a: 'No. Reservan desde tu página de reservas o desde la app de tu estudio, que se añade a la pantalla de inicio del móvil con tu nombre y tu icono, sin pasar por la App Store. Reciben los avisos de cada cambio en el móvil y por email.',
  },
  {
    q: '¿Y si ninguna instructora acepta la sustitución?',
    a: 'Te avisa enseguida para que decidas: volver a buscar, reprogramar la clase, cancelarla avisando a las alumnas o buscar una instructora en Tentare Network. La clase nunca se cancela sola.',
  },
  {
    q: '¿Cómo cobro a mis alumnas?',
    a: 'Con Stripe: tarjeta, domiciliación SEPA y Bizum para pagos sueltos. Las cuotas se cobran solas y, si un cobro falla, se reintenta automáticamente. Tentare no se queda comisión de tus cobros. También puedes apuntar pagos en efectivo o por transferencia.',
  },
  {
    q: '¿Hay permanencia?',
    a: 'Ninguna. Pagas mes a mes y te vas cuando quieras. Tus datos son tuyos: exportas alumnas, reservas, suscripciones, recibos y pagos cuando lo necesites.',
  },
  {
    q: '¿Están seguros los datos de mi estudio y mis alumnas?',
    a: 'Cada estudio accede solo a sus datos, con la separación hecha en la propia base de datos, y la ficha de salud de cada alumna tiene permisos aparte. Tentare está diseñado con el RGPD en mente.',
  },
];

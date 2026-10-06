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
    id: 'BASE' as const,
    name: 'Founding Studio',
    price: '29€',
    desc: 'Para empezar. Hasta 150 alumnas.',
    features: ['Reservas y calendario', 'Cobros, bonos y facturas', 'App con tu marca', 'Sustituciones asistidas'],
    cta: 'Probar 7 días gratis',
    dark: false,
    popular: false,
    contacto: false,
  },
  {
    id: 'ESTUDIO' as const,
    name: 'Estudio',
    price: '59€',
    desc: 'El plan completo. Alumnas ilimitadas.',
    features: ['Todo lo de Founding Studio', 'Alumnas ilimitadas', 'Sustituciones autónomas', 'Centro de Control'],
    cta: 'Probar 7 días gratis',
    dark: true,
    popular: true,
    contacto: false,
  },
  {
    id: 'CADENA' as const,
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

// Las 10 preguntas de la home (6-oct-2026; eran 11, y antes 14). Alimentan
// también el JSON-LD FAQPage de StructuredData, así que lo que se lee aquí es
// lo que Google ve. Formato citable: la respuesta va PRIMERO y el matiz después.
// Cada respuesta está cruzada con el código:
//  · los precios y los topes salen de PLANS (arriba), no se escriben dos veces;
//  · el asistente (lib/asistente): consulta y PROPONE clases, salas, eventos y
//    citas, nada se crea sin confirmar; no cobra, no borra, no edita, no
//    escribe a nadie; lo usan propietaria y gerencia; límite mensual por plan;
//  · (va la última: no es lo que más busca un estudio) la sustitución espera el visto bueno en el modo por defecto (asistido) y
//    nunca cancela la clase sola; el autónomo es del plan Estudio;
//  · varias sedes = plan Cadena, un acceso con selector de sede, sin vista que
//    las sume; la prueba es del plan que eliges (no «todo abierto»); la
//    migración no tiene plazo garantizado; las tarjetas guardadas no se migran;
//    la exportación son CSV.
// Se quitaron las dos preguntas que nombraban otras marcas y la que repetía
// «Nº1»: la home habla a quien ya tiene programa sin compararse (la comparativa
// vive en /comparativa).
const PRECIOS_FAQ = PLANS.map((p) => `${p.name} (${p.price.replace('€', ' €')})`);

export const FAQ_ITEMS: { q: string; a: string }[] = [
  {
    q: '¿Qué programa necesito para gestionar un centro de Pilates o yoga?',
    a: 'Uno que lleve en un solo sitio las reservas por clase o por reformer con su lista de espera, los bonos y las cuotas, los cobros y el calendario. Tentare es un software hecho para estudios y centros de Pilates que reúne todo eso en un panel, con una app con tu marca para las alumnas. Interfaz y soporte en español.',
  },
  {
    q: '¿Puedo traer mis alumnas desde Excel u otro programa?',
    a: 'Sí. El importador reconoce las exportaciones de Timp, Momence, bsport, Eversports y Mindbody, y también Excel: alumnas, bonos, reservas y clases. Te enseña un acta con los números para comprobar que todo cuadra y, si algo no te convence, lo deshaces con un botón. Si prefieres, lo hacemos contigo; las tarjetas guardadas no se pueden pasar de una plataforma a otra y te ayudamos con ese paso.',
  },
  {
    q: '¿Cuánto cuesta Tentare?',
    a: `Desde ${PLANS[0].price.replace('€', ' €')} al mes con IVA. Hay tres planes públicos: ${PRECIOS_FAQ.join(', ')}; el de Cadena es para varias sedes. Pagas mes a mes, Tentare no se queda comisión de lo que cobras a tus alumnas y la prueba de 7 días no pide tarjeta.`,
  },
  {
    q: '¿Hay permanencia?',
    a: 'Ninguna. Pagas mes a mes y te vas cuando quieras. Tus datos son tuyos: exportas alumnas, reservas, suscripciones, recibos y pagos cuando lo necesites.',
  },
  {
    q: '¿Sirve también para estudios de yoga?',
    a: 'Sí. Las clases, las salas, las reservas con lista de espera, los bonos, las cuotas y los cobros funcionan igual para yoga, para Pilates o para un centro que combine las dos disciplinas: tú das nombre a cada tipo de clase. Lo que es propio del Pilates reformer, como el mapa para elegir máquina, es opcional y no hace falta en una sala de yoga.',
  },
  {
    q: '¿Mis alumnas tienen una app?',
    a: 'Sí: una app con el nombre, el logo y los colores de tu estudio. Se añade a la pantalla de inicio del móvil, y desde ella reservan, cancelan, ven su bono y pagan sus recibos; reciben los avisos en el móvil y por email. Si prefieren no instalar nada, también pueden reservar desde tu página de reservas.',
  },
  {
    q: '¿Cómo cobro a mis alumnas?',
    a: 'Con Stripe: tarjeta, domiciliación SEPA y Bizum para pagos sueltos. Las cuotas se cobran solas y, si un cobro falla, se reintenta automáticamente. También puedes apuntar pagos en efectivo o por transferencia, y cada cobro genera su recibo y su factura.',
  },
  {
    q: '¿Sirve para varios centros o sedes?',
    a: 'Sí, con el plan Cadena: varias sedes con un solo acceso y un selector de sede, y los datos de cada una separados. Todavía no hay una vista que sume todas las sedes a la vez.',
  },
  {
    q: '¿Están seguros los datos de mi estudio y mis alumnas?',
    a: 'Cada estudio accede solo a sus datos, con la separación hecha en la propia base de datos, y la ficha de salud de cada alumna tiene permisos aparte. Los datos se alojan en la Unión Europea y Tentare está diseñado con el RGPD en mente.',
  },
  {
    q: '¿Qué es «Pregúntale a Tentare»?',
    a: 'Es el asistente de Tentare: le preguntas por tu estudio —quién lleva semanas sin venir, qué clases tienen huecos— y responde con tus datos. También prepara clases, salas, eventos y citas, pero no crea nada hasta que tú lo confirmas; no cobra, no borra, no edita y no escribe a tus alumnas. Lo usan la propietaria y la gerencia, y viene en todos los planes con un límite de consultas al mes.',
  },
  {
    q: '¿Qué pasa si una instructora cancela su clase?',
    a: 'Tentare propone a quién avisar según su disponibilidad y su costumbre horaria y, en el modo por defecto, espera tu visto bueno antes de escribir a nadie. Cuando una candidata acepta, la clase queda cubierta. Si nadie acepta te avisa para que decidas —volver a buscar, reprogramar o cancelar avisando a las alumnas—: la clase nunca se cancela sola. El plan Estudio añade un modo autónomo.',
  },
];

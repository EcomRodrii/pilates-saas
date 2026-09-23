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

export const PLANS = [
  {
    name: 'Base',
    price: '29€',
    desc: 'Para empezar. Hasta 150 alumnas.',
    features: ['Reservas y calendario', 'Cobros, bonos y facturas', 'Sustituciones asistidas'],
    cta: 'Crear estudio',
    dark: false,
    popular: false,
  },
  {
    name: 'Estudio',
    price: '59€',
    desc: 'El plan completo. Alumnas ilimitadas.',
    features: ['Todo lo de Base', 'Alumnas ilimitadas', 'Sustituciones autónomas', 'App de marca'],
    cta: 'Crear mi estudio →',
    dark: true,
    popular: true,
  },
  {
    name: 'Cadena',
    price: '149€',
    desc: 'Varias sedes en un mismo panel.',
    features: ['Todo lo de Estudio', 'Varios centros', 'Soporte dedicado'],
    cta: 'Hablar con ventas',
    dark: false,
    popular: false,
  },
];

export const FAQ_ITEMS: { q: string; a: string }[] = [
  // La primera desde que Tentare está abierto al público: es lo que todo el
  // mundo pregunta antes que nada, y la respuesta («no, no pedimos tarjeta»)
  // es justo la que quita el freno para probarlo.
  {
    q: '¿La prueba pide tarjeta?',
    a: 'No. Son 7 días gratis con todo abierto y no te pedimos ningún dato de pago para empezar: creas tu estudio y entras. Cuando termina la prueba no se te cobra nada — si no eliges plan, simplemente se pausa y tus datos siguen ahí intactos.',
  },
  {
    q: '¿Sustituye a mi software actual o convive con él?',
    a: 'Lo sustituye del todo: reservas, cobros, calendario, alumnas e instructoras están dentro. Y la migración te la hacemos nosotros en 48h: nos mandas lo que puedas exportar (da igual el formato) y te entregamos el estudio montado, con un acta para comprobar que todo cuadra. Tu software actual sigue funcionando mientras tanto.',
  },
  {
    q: '¿Es difícil de aprender a usar?',
    a: 'No. Es lo primero que nos dicen las propietarias que lo prueban: si sabes usar WhatsApp, sabes usar Tentare. No hay formación que hacer ni manual que leer — la pantalla de inicio te enseña cada día lo que espera tu visto bueno. La mayoría de estudios ya están reservando y cobrando el primer día.',
  },
  {
    q: '¿Y si ninguna instructora acepta la sustitución?',
    a: 'Nunca te deja colgada. Si nadie puede, te avisa enseguida con las opciones sobre la mesa: volver a buscar, reprogramar la clase, cancelarla avisando a las alumnas o pedir una instructora de Tentare Network. Tú eliges.',
  },
  {
    q: '¿Tengo que dar de alta a mis instructoras?',
    a: 'Sí, das de alta a tu equipo una vez con su disponibilidad. A partir de ahí el sistema trabaja con esos datos: sabe quién puede cubrir cada clase sin que tengas que decírselo.',
  },
  {
    q: '¿Cómo avisáis a las alumnas?',
    a: 'Por el canal de cada alumna: la app del estudio, email o WhatsApp. Cuando cambia una clase, reciben el aviso al momento — sin que tengas que escribir nada.',
  },
  {
    q: '¿Hay permanencia?',
    a: 'Ninguna. Tus datos son tuyos: si te vas, exportas alumnas, historial y facturas cuando quieras. Nos quedamos porque funciona, no por un contrato.',
  },
  {
    q: '¿Cuánto tarda ponerlo en marcha?',
    a: 'Días, no semanas. Traes tus datos con asistentes de importación por CSV (alumnas, bonos, reservas, clases y citas) y te acompañamos en la puesta en marcha. Empiezas con lo básico y activas el resto a tu ritmo.',
  },
  {
    q: '¿Tengo que usar las sustituciones automáticas desde el principio?',
    a: 'No. Por defecto funcionan en modo asistido: Tentare te propone la candidata y no escribe a nadie sin tu visto bueno. Los modos autónomo y Vacaciones, que cubren la baja sin ti, los activas solo si quieres (plan Estudio o Cadena).',
  },
  {
    q: '¿Están seguros los datos de mi estudio y mis alumnas?',
    a: 'Tentare está diseñado con el RGPD en mente: cada estudio accede únicamente a sus propios datos y puedes exportarlos cuando quieras.',
  },
  {
    q: '¿Puedo gestionar varios centros?',
    a: 'Sí. El plan Cadena gestiona varios centros desde un mismo panel, con datos y permisos separados por sede.',
  },
  {
    q: '¿Pierdo datos o me quedo sin servicio al migrar?',
    a: 'No. Tu estudio sigue funcionando en tu sistema actual hasta que tú decidas arrancar, y cada migración deja un acta con los números para comprobar que no falta nada — si algo no cuadra, se deshace entera con un clic. Las tarjetas guardadas de tus alumnas no se transfieren solas entre plataformas: te ayudamos a gestionar ese paso para que nadie se quede sin cobrar.',
  },
  {
    q: '¿Me vais a subir el precio dentro de un año?',
    a: 'Nuestros precios son públicos y no jugamos a subirlos por sorpresa. Si algún día cambia una tarifa, te avisamos con antelación y respetamos tu plan.',
  },
  {
    q: '¿El soporte es de personas y en español?',
    a: 'Sí. Te atienden personas, en español, que conocen cómo funciona un estudio de pilates. Sin bots que te dan vueltas ni esperas eternas.',
  },
];

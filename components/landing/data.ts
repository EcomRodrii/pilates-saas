import { COMPLEMENTOS_CORTO, COMPLEMENTOS_DE_PAGO, CTA_ALTA, GRATIS_ALUMNAS, GRATIS_RESERVAS_MES, PRECIO_FOUNDING_PAGO, SI_PASAS_CON_COMPLEMENTOS, TODO_MENOS_SEDES, TOPE_GRATIS } from '@/lib/landing/founding-gratis';
import { PLAN_ENTITLEMENTS } from '@/lib/billing/entitlements';
import { MENU_PUBLICO } from '@/lib/seo/navegacion-publica';

// Los destinos de primer nivel de la isla (la navegación de toda la web
// pública), para el `SiteNavigationElement` de
// components/OrganizationStructuredData.tsx: cambiar esta lista mueve las
// candidatas a sitelinks de Google. Desde la fase 2.1 (19-oct-2026) sale de la
// misma lista que el menú (lib/seo/navegacion-publica.ts): antes llevaba `#faq`
// y `/funcionalidades/sustituciones`, que no estaban en ningún menú, y le
// faltaban Soluciones y Comparativa.
export const NAV_LINKS = MENU_PUBLICO;

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
// Founding Studio es GRATIS desde el 15-oct-2026 (lib/landing/founding-gratis.ts):
// todo menos varias sedes, con dos límites; si pasa de cualquiera, el mismo plan a
// 29 €, sin tope. Por eso Estudio ya no se vende por las sustituciones autónomas,
// el Centro de Control ni las alumnas ilimitadas: lo tiene Founding Studio. Lo que
// lo distinguirá es la app propia del estudio (decisión del fundador), que todavía
// no existe: hasta entonces, solo lo que es verdad hoy (las consultas al asistente).
export const PLANS = [
  {
    id: 'BASE' as const,
    name: 'Founding Studio',
    price: 'Gratis',
    desc: `Para empezar. ${TOPE_GRATIS}; ${SI_PASAS_CON_COMPLEMENTOS}.`,
    features: [TODO_MENOS_SEDES, 'Reservas y calendario', 'Cobros, bonos y facturas', 'App con tu marca'],
    cta: CTA_ALTA,
    dark: false,
    popular: false,
    contacto: false,
  },
  {
    id: 'ESTUDIO' as const,
    name: 'Estudio',
    price: '59€',
    desc: `Todo lo de Founding Studio, con ${COMPLEMENTOS_CORTO} incluidos.`,
    features: ['Todo lo de Founding Studio', `${COMPLEMENTOS_CORTO}, incluidos`, `${PLAN_ENTITLEMENTS.ESTUDIO.consultasAsistenteMes} consultas al mes al asistente`],
    cta: CTA_ALTA,
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
//    nunca cancela la clase sola; el autónomo está también en Founding Studio gratis;
//  · varias sedes = plan Cadena, un acceso con selector de sede, sin vista que
//    las sume; no hay prueba: se empieza en Founding Studio gratis (15-oct-2026);
//    la migración no tiene plazo garantizado; las tarjetas guardadas no se
//    migran; la exportación son CSV.
// Se quitaron las dos preguntas que nombraban otras marcas y la que repetía
// «Nº1»: la home habla a quien ya tiene programa sin compararse (la comparativa
// vive en /comparativa).
export const FAQ_ITEMS: { q: string; a: string }[] = [
  {
    q: '¿Qué programa necesito para gestionar un centro de Pilates o yoga?',
    a: 'Uno que lleve en un solo sitio las reservas por clase o por reformer con su lista de espera, los bonos y las cuotas, los cobros y el calendario. Tentare es un software hecho para estudios y centros de Pilates que reúne todo eso en un panel, con una app con tu marca para las alumnas. Interfaz y soporte en español.',
  },
  {
    q: '¿Puedo traer mis alumnas desde Excel u otro programa?',
    a: 'Sí. El importador lee los archivos CSV o Excel que exportas de cualquier programa: alumnas, bonos, reservas y clases. Te enseña un acta con los números para comprobar que todo cuadra y, si algo no te convence, lo deshaces con un botón. Las tarjetas guardadas no se pueden pasar de una plataforma a otra.',
  },
  {
    q: '¿Cuánto cuesta Tentare?',
    a: `Founding Studio es gratis hasta ${GRATIS_ALUMNAS} alumnas activas y ${GRATIS_RESERVAS_MES} reservas al mes, con todas las funcionalidades menos varias sedes; si pasas de ahí, cuesta ${PRECIO_FOUNDING_PAGO} € al mes con IVA, sin tope, y con ese plan ${COMPLEMENTOS_DE_PAGO} se contratan aparte. El plan ${PLANS[1].name} cuesta ${PLANS[1].price.replace('€', ' €')}, y ${PLANS[2].name}, para varias sedes, ${PLANS[2].price.replace('€', ' €')}. Pagas mes a mes y Tentare no se queda comisión de lo que cobras a tus alumnas.`,
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
    a: 'Con tarjeta a través de tu cuenta de Stripe, y Bizum para pagos sueltos. Con la tarjeta guardada, las cuotas se cobran solas y, si un cobro falla, se reintenta automáticamente. Si cobras por domiciliación, Tentare te prepara la remesa SEPA para que la presentes en tu banco. También puedes apuntar pagos en efectivo o por transferencia; cada cobro genera su recibo y, salvo el efectivo, su factura.',
  },
  {
    q: '¿Sirve para varios centros o sedes?',
    a: 'Sí, con el plan Cadena: varias sedes con un solo acceso y un selector de sede, y los datos de cada una separados. Todavía no hay una vista que sume todas las sedes a la vez.',
  },
  {
    q: '¿Están seguros los datos de mi estudio y mis alumnas?',
    a: 'Cada estudio accede solo a sus datos, con la separación hecha en la propia base de datos, y la ficha de salud de cada alumna tiene permisos aparte. La base de datos está en la Unión Europea; algunos proveedores tratan datos fuera de ella y están listados en la política de privacidad. Tentare está diseñado con el RGPD en mente.',
  },
  {
    q: '¿Qué es «Pregúntale a Tentare»?',
    a: 'Es el asistente de Tentare: le preguntas por tu estudio —quién lleva semanas sin venir, qué clases tienen huecos— y responde con tus datos. También prepara clases, salas, eventos y citas, pero no crea nada hasta que tú lo confirmas; no cobra, no borra, no edita y no escribe a tus alumnas. Lo usan la propietaria y la gerencia, y viene en todos los planes con un límite de consultas al mes.',
  },
];

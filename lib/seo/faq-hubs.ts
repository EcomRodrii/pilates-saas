// ─────────────────────────────────────────────────────────────────────────────
// Preguntas frecuentes de los dos índices comerciales: /funcionalidades y
// /soluciones (Ronda 1 de la revisión de la landing, 19-oct-2026).
//
// Las 17 páginas de función y las 4 de solución ya tienen la suya, con su
// marcado. Los dos ÍNDICES no la tenían, y son justo donde cae quien busca «qué
// incluye» o «sirve para mi tipo de estudio». Se escriben como las busca una
// dueña de estudio (cobros, WhatsApp, bono y cuota a la vez, migración, sedes,
// privacidad) y la respuesta va en las dos primeras frases.
//
// ⚠️ Cada respuesta repite una afirmación que YA consta en otra página del
// producto, que a su vez sale del código. La fuente de cada una está al lado;
// si un día deja de ser cierta, se corrige aquí y en su origen. Sin cifras
// nuevas: los números salen de las mismas constantes que /precios.
//
// ⚠️ Nada de testimonios, reseñas, «el más…», «el único…» ni integraciones
// apagadas o sin contrato (ClassPass, Wellhub, Urban Sports Club, Gmail) ni
// funciones congeladas. `faq-hubs.test.ts` lo vigila, con su control.
//
// Puro y con extensiones `.ts` explícitas: lo importa `npm test`.
// ─────────────────────────────────────────────────────────────────────────────

import { PLAN_INFO } from '../billing/entitlements.ts';
import { COMPLEMENTOS_DE_PAGO, LIMITES_GRATIS, PRECIO_FOUNDING_PAGO } from '../landing/founding-gratis.ts';
import type { PreguntaFaq } from './faq-jsonld.ts';

const PRECIO_ESTUDIO = PLAN_INFO.ESTUDIO.precioMes;
const PRECIO_CADENA = PLAN_INFO.CADENA.precioMes;

/** Rango que el test exige: ni una pregunta suelta ni un muro. */
export const FAQ_MIN = 4;
export const FAQ_MAX = 6;

export const FAQ_FUNCIONALIDADES: PreguntaFaq[] = [
  {
    // Fuente: lib/landing/founding-gratis.ts (TODO_MENOS_SEDES, COMPLEMENTOS_DE_PAGO) y
    // `ADDONS` en lib/billing/entitlements.ts (#2784: tres complementos en el Founding de pago).
    q: '¿Hay funciones que se pagan aparte?',
    a: `Mientras es gratis, no: Founding Studio incluye todas las funcionalidades menos varias sedes ${LIMITES_GRATIS}. Si pasas de ahí, cuesta ${PRECIO_FOUNDING_PAGO} €/mes, sin tope, y con ese plan ${COMPLEMENTOS_DE_PAGO} se contratan aparte; el plan Estudio los incluye. Varias sedes es lo que añade el plan Cadena, de ${PRECIO_CADENA} €/mes.`,
  },
  {
    // Fuente: /funcionalidades/bonos-y-membresias (primera pregunta) y
    // /soluciones/estudio-de-pilates-reformer (cobrar distinto reformer y mat).
    q: '¿Puede una alumna tener un bono y una cuota a la vez?',
    a: 'Sí, y es más común de lo que parece: la cuota mensual para el mat y un bono suelto para el reformer, por ejemplo. Cada plan cubre los tipos de clase que le digas y, al reservar, se usa el que corresponda.',
  },
  {
    // Fuente: /funcionalidades/cobros-recurrentes (comisión, Stripe y remesa
    // SEPA 19.14: «generarla no cobra el dinero, lo presenta tu banco»).
    q: '¿Puedo cobrar con tarjeta y por domiciliación SEPA? ¿Se lleva Tentare comisión?',
    a: 'Sí a las dos cosas, y Tentare no añade comisión propia. La tarjeta se cobra desde tu cuenta de Stripe, y lo único que pagas aparte es la comisión de Stripe. Para la domiciliación, Tentare genera la remesa SEPA (el cuaderno 19.14 de tu banco) con los recibos del periodo y guarda los mandatos de tus alumnas; la presentas tú en tu banco.',
  },
  {
    // Fuente: lib/notificaciones/recordatorio-clase.ts (24 h antes: app + email
    // + WhatsApp «si el estudio lo conectó», respetando la preferencia de la
    // alumna) y /funcionalidades/automatizaciones-y-avisos.
    q: '¿Los recordatorios de clase salen por WhatsApp?',
    a: 'Sí, si conectas tu propio número de WhatsApp Business desde Configuración. El recordatorio de clase va de serie y entonces sale también por WhatsApp a quien no lo haya desactivado; sin WhatsApp conectado sigue saliendo por email y por notificación en la app.',
  },
  {
    // Fuente: /funcionalidades/facturacion y lib/factura-automatica.ts: viene
    // ENCENDIDA (`facturar_automatico` true de serie, migr 20261008231750) y, sin
    // Veri*Factu —no activo en ningún estudio—, la factura sale sin huella ni QR
    // y sin envío (migr 20261002191517). El efectivo no emite la factura solo.
    q: '¿Emite Tentare las facturas por mí?',
    a: 'Sí, y viene encendido: con tu NIF, cada cobro, salvo el efectivo, genera su factura con numeración correlativa, y el cierre de año sale listo para tu gestoría. Si te las hace la gestoría, apágalo en Configuración → Cobros y facturas. Veri*Factu (la huella, el QR y el envío a la AEAT) todavía no está activo en ningún estudio.',
  },
  {
    // Fuente: /seguridad (base de datos en la UE, aislamiento por estudio,
    // proveedores listados en la política de privacidad), /funcionalidades/
    // ficha-de-clienta y puedeVerFichaClinica / semáforo en lib/permisos-reglas.ts.
    q: '¿Dónde se guardan los datos de mis alumnas y quién ve los de salud?',
    a: 'En la Unión Europea (Fráncfort), con cada estudio aislado de los demás en la propia base de datos. Los datos de salud se guardan con el consentimiento de la alumna: los ve la propietaria y, de sus alumnas, cada instructora; recepción y gerencia solo ven un semáforo de color. Los proveedores que pueden tratar datos fuera de la UE están listados en la política de privacidad.',
  },
];

export const FAQ_SOLUCIONES: PreguntaFaq[] = [
  {
    // Fuente: el entradilla de /soluciones («el mismo producto y el mismo precio
    // público») y la pregunta «¿Hay funciones pensadas solo para yoga?» de
    // /soluciones/estudio-de-yoga.
    q: '¿Cambia el programa o el precio según sea Pilates, reformer o yoga?',
    a: 'No. Es el mismo producto y el mismo precio público para todos los tipos de estudio. Lo que cambia es cómo lo configuras —tus tipos de clase, tus salas, tus bonos y tus reglas de reserva—, y cada página de esta sección cuenta Tentare desde lo que más le importa a ese estudio.',
  },
  {
    // Fuente: /soluciones/estudio-de-yoga y /soluciones/estudio-de-pilates-reformer
    // («cada disciplina es su propio tipo de clase»).
    q: '¿Sirve para un estudio que combina Pilates reformer, mat y yoga?',
    a: 'Sí, es lo más habitual. Cada disciplina es su propio tipo de clase, con su horario, su sala, su aforo, su precio y sus reglas de reserva, dentro del mismo estudio y la misma cuenta.',
  },
  {
    // Fuente: /precios y lib/landing/founding-gratis.ts; «con IVA» y «sin
    // permanencia» como en /soluciones/estudio-de-yoga y /precios.
    q: '¿Cuánto cuesta y hace falta tarjeta para empezar?',
    a: `Founding Studio es gratis ${LIMITES_GRATIS} con todas las funcionalidades menos varias sedes, y se empieza sin tarjeta; si pasas de ahí, ${PRECIO_FOUNDING_PAGO} €/mes, y con ese plan ${COMPLEMENTOS_DE_PAGO} van aparte. Estudio cuesta ${PRECIO_ESTUDIO} €/mes con IVA y Cadena, ${PRECIO_CADENA} €/mes. Todos sin permanencia.`,
  },
  {
    // Fuente: /soluciones/estudio-de-pilates-reformer y
    // /funcionalidades/app-para-alumnas («sin pasar por ninguna tienda»).
    q: '¿Mis alumnas tienen que descargarse una app?',
    a: 'No hace falta. Reservan desde el navegador del móvil con el enlace de tu estudio y, si quieren, la añaden a su pantalla de inicio: se comporta como una app, con tu nombre, tu icono y tus colores.',
  },
  {
    // Fuente: /soluciones/cambiar-de-software (acta, deshacer, tarjetas no se
    // migran) y /precios («la migración no se cobra aparte»).
    q: '¿Puedo traer mis alumnas y mis bonos desde otro programa?',
    a: 'Sí. El importador lee archivos CSV o Excel de cualquier programa y te enseña lo que va a traer antes de guardarlo. Puedes deshacer la importación con un botón y la migración no se cobra aparte. Las tarjetas guardadas no se migran: cada alumna introduce la suya una vez.',
  },
  {
    // Fuente: /funcionalidades/multi-centro (preguntas 1, 2 y 4) y /precios.
    q: '¿Y si tengo más de una sede?',
    a: `Con el plan Cadena, que cubre varios centros bajo la misma suscripción (${PRECIO_CADENA} €/mes) y un solo acceso. Trabajas en una sede cada vez y los datos de las alumnas de cada sede están separados; no hay un panel que sume las cifras de todos los centros.`,
  },
];

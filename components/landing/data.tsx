import { ACC_SOFT } from './theme';
import { IconAlert, IconCalendar, IconInvoice, IconUsers } from './icons';

export const NAV_LINKS = [
  { href: '#recorrido', label: 'Producto' },
  { href: '#sustituciones', label: 'Sustituciones' },
  { href: '#precio', label: 'Precio' },
  { href: '#faq', label: 'FAQ' },
  { href: '/recursos', label: 'Recursos' },
];

export const SPINE_SECTIONS = [
  { id: 'hero', label: 'Inicio' },
  { id: 'problema', label: 'El problema' },
  { id: 'antes-despues', label: 'Antes / después' },
  { id: 'recorrido', label: 'Producto' },
  { id: 'sustituciones', label: 'Sustituciones' },
  { id: 'centro-de-control', label: 'Centro de Control' },
  { id: 'precio', label: 'Precio' },
  { id: 'faq', label: 'FAQ' },
];

export const RECORRIDO_ITEMS = [
  {
    n: '01',
    eyebrow: 'Reservas de alumnas',
    title: 'Reservan solas, 24/7.',
    body: 'Tus alumnas reservan y cancelan desde su móvil. Cuando alguien deja hueco, la lista de espera lo llena automáticamente — sin que muevas un dedo.',
    chips: ['Lista de espera automática', 'Cancelaciones con reglas'],
  },
  {
    n: '02',
    eyebrow: 'Alumnas y comunicación',
    title: 'Cada alumna, en su ficha.',
    body: 'Historial, bonos y asistencia de cada persona en un solo lugar. Y los avisos salen solos: recordatorios, cambios de clase, felicitaciones — por su canal.',
    chips: ['CRM de socias', 'Avisos automáticos'],
  },
  {
    n: '03',
    eyebrow: 'Calendario de clases y salas',
    title: 'Tu semana, cuadrada.',
    body: 'Clases, salas y capacidad por reformer — no solo aforo. Ves los huecos de un vistazo y evitas que dos clases pisen la misma sala.',
    chips: ['Capacidad por reformer', 'Multi-sala'],
  },
  {
    n: '04',
    eyebrow: 'Cobros, bonos y facturación',
    title: 'Cobra sin perseguir a nadie.',
    body: 'Bonos, cuotas y membresías con cobro recurrente. Reintenta los pagos fallidos y emite facturas legales desde el primer euro. Sin comisión extra de Tentare.',
    chips: ['Pagos vía Stripe', 'Facturación legal'],
  },
  {
    n: '05',
    eyebrow: 'Instructoras y horas',
    title: 'Tu equipo, bajo control.',
    body: 'Disponibilidad, calendario y horas de cada instructora. El sistema sabe quién puede dar qué — y por eso puede cubrir las bajas solo (ya llegamos a eso).',
    chips: ['Disponibilidad', 'Registro de horas'],
  },
  {
    n: '06',
    eyebrow: 'Panel de control y métricas',
    title: 'Tu estudio, de un vistazo.',
    body: 'Ingresos, ocupación, reservas y renovaciones al día. El panel que ves en el móvil y en el ordenador — el mismo que abre tu estudio cada mañana.',
    chips: ['KPIs en vivo', 'Informes'],
  },
];

export const AUTONOMY_MODES = [
  {
    key: 'manual',
    tab: 'Manual',
    level: 'Nivel 1',
    levelColor: '#8E8E86',
    title: 'Manual',
    body: (
      <>
        El sistema te <strong style={{ color: '#fff' }}>propone</strong> a quién avisar y qué escribir. Tú das cada
        paso. Ideal para tus primeras semanas, mientras coges confianza.
      </>
    ),
  },
  {
    key: 'asistido',
    tab: 'Asistido',
    level: 'Nivel 2 · recomendado',
    levelColor: '#C08BE8',
    title: 'Asistido',
    body: (
      <>
        El sistema <strong style={{ color: '#fff' }}>contacta a las candidatas</strong> y gestiona los recordatorios.
        Cuando una acepta, tú lo <strong style={{ color: '#fff' }}>apruebas con un toque</strong> y él cierra todo lo
        demás.
      </>
    ),
  },
  {
    key: 'autonomo',
    tab: 'Autónomo',
    level: 'Nivel 3',
    levelColor: '#8E8E86',
    title: 'Autónomo',
    body: (
      <>
        Cuando la confianza es alta, <strong style={{ color: '#fff' }}>cubre la baja solo</strong> y te lo cuenta
        después. Ni un toque. Tú lees el resumen cuando te va bien.
      </>
    ),
  },
  {
    key: 'vacaciones',
    tab: 'Vacaciones',
    level: 'Modo Vacaciones',
    levelColor: '#8E8E86',
    title: 'Vacaciones 🌴',
    body: (
      <>
        Opera de principio a fin, <strong style={{ color: '#fff' }}>sin molestarte</strong>. Puedes estar en Cancún
        y el estudio funciona: bajas cubiertas, alumnas avisadas, calendario al día.
      </>
    ),
  },
] as const;

export const CENTRO_CARDS = [
  { title: 'Resumen ejecutivo', body: 'El estado de tu estudio en una frase, cada mañana.', bg: ACC_SOFT, fg: '#6D28D9' },
  { title: 'Prioridades que solo apruebas', body: 'Decisiones listas sobre la mesa. Tú dices sí o no.', bg: '#E7F3EC', fg: '#4E9E7F' },
  { title: 'Mientras dormías', body: 'Lo que se resolvió solo mientras no estabas.', bg: '#3A2E52', fg: '#C08BE8' },
  { title: 'Cada área, vigilada', body: 'Reservas, cobros, equipo y alumnas — controlados por separado.', bg: '#EDF3F4', fg: '#3E7C86' },
  { title: 'Riesgo de plantón', body: 'Te avisa si dependes demasiado de una sola instructora.', bg: '#FBEDE8', fg: '#C2503A' },
  { title: 'Accesos rápidos', body: 'Lo que más usas, siempre a un clic.', bg: '#F3ECF5', fg: '#8B4F9E' },
];

export const DAY_MOMENTS = [
  {
    t: '07:00',
    title: 'Suena el primer «reservado»',
    body: 'Una alumna coge el Reformer de las 9:00 desde la app, aún en pijama. Su plaza queda confirmada al instante. Tú sigues durmiendo.',
    tag: 'Reservas 24/7 · confirmación automática',
    highlight: false,
  },
  {
    t: '08:30',
    title: 'Una instructora no puede hoy',
    body: 'Marta avisa desde la app de su baja de las 18:00. Antes de que llegues a leer el mensaje, Tentare ya está contactando a las instructoras que pueden cubrirla.',
    tag: 'Sustitución automática en marcha',
    highlight: true,
    badge: '★ El corazón de Tentare',
  },
  {
    t: '10:15',
    title: 'Un bono a punto de agotarse',
    body: 'Nora entra a su última sesión del bono. Recibe un aviso amable con la opción de renovar en un toque — y renueva antes de salir de la sala.',
    tag: 'Retención · renovación de bonos',
    highlight: false,
  },
  {
    t: '13:00',
    title: 'Clase llena, lista de espera activa',
    body: 'Alguien cancela la clase de las 19:00. La primera de la lista de espera entra sola, recibe su confirmación y el hueco no se pierde.',
    tag: 'Lista de espera inteligente',
    highlight: false,
  },
  {
    t: '17:05',
    title: 'Sustitución cerrada',
    body: 'Lucía confirma la clase de las 18:00. Calendario actualizado, horas registradas y alumnas avisadas de quién les dará la clase. Tú solo lo apruebas.',
    tag: 'Clase cubierta · alumnas avisadas',
    highlight: false,
    good: true,
  },
  {
    t: '20:30',
    title: 'Cierre de caja, sin caja',
    body: 'Se cobran las cuotas del mes y se emiten las facturas automáticamente. Los pagos que fallan se reintentan solos. Nadie persigue a nadie.',
    tag: 'Cobros recurrentes · facturación',
    highlight: false,
  },
];

export const DISCIPLINAS = [
  { label: 'Gimnasio boutique', photo: '/disciplinas/boutique.jpg' },
  { label: 'Gyrotonic', photo: '/disciplinas/gyrotonic.jpg' },
  { label: 'EMS', photo: '/disciplinas/ems.jpg' },
  { label: 'Crioterapia', photo: '/disciplinas/crioterapia.jpg' },
  { label: 'Pilates', photo: '/disciplinas/pilates.jpg' },
  { label: 'Yoga', photo: '/disciplinas/yoga.jpg' },
  { label: 'Spinning', photo: '/disciplinas/spinning.jpg' },
  { label: 'Barre', photo: '/disciplinas/barre.jpg' },
  { label: 'Boxeo', photo: '/disciplinas/boxeo.jpg' },
  { label: 'HIIT', photo: '/disciplinas/hiit.jpg' },
  { label: 'Baile', photo: '/disciplinas/baile.jpg' },
];
export const INTEGRACIONES = [
  { group: 'Pagos', items: ['Stripe'] },
  { group: 'Email y mensajería', items: ['Mailchimp', 'Brevo', 'Resend', 'Gmail', 'WhatsApp Business'] },
  { group: 'Calendario y acceso', items: ['Google Calendar', 'Google', 'Kisi'] },
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
    desc: 'Multi-centro y white-label.',
    features: ['Todo lo de Estudio', 'Varios centros', 'Soporte dedicado'],
    cta: 'Hablar con ventas',
    dark: false,
    popular: false,
  },
];

export const FAQ_ITEMS: { q: string; a: string }[] = [
  {
    q: '¿Sustituye a mi software actual o convive con él?',
    a: 'Lo sustituye del todo: reservas, cobros, calendario, alumnas e instructoras están dentro. Importas tus datos con asistentes guiados por CSV —alumnas, bonos, reservas, clases y citas— con detección de duplicados, y te acompañamos en la puesta en marcha, sin cortar el servicio de tu estudio.',
  },
  {
    q: '¿Y si ninguna instructora acepta la sustitución?',
    a: 'Nunca te deja colgada. Si nadie puede, te avisa enseguida con las opciones sobre la mesa: reprogramar, cancelar avisando a las alumnas, o cubrir tú. Tú eliges; él ejecuta.',
  },
  {
    q: '¿Tengo que dar de alta a mis instructoras?',
    a: 'Sí, das de alta a tu equipo una vez con su disponibilidad. A partir de ahí el sistema trabaja con esos datos: sabe quién puede cubrir cada clase sin que tengas que decírselo.',
  },
  {
    q: '¿Cómo avisáis a las alumnas?',
    a: 'Por el canal de cada alumna: la app de marca, email o WhatsApp. Cuando cambia una clase, reciben el aviso al momento — sin que tengas que escribir nada.',
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
    a: 'No. Puedes empezar solo con reservas y cobros y activar las sustituciones cuando te sientas cómoda. Muchos estudios arrancan en modo Manual y suben de nivel con el tiempo.',
  },
  {
    q: '¿Están seguros los datos de mi estudio y mis alumnas?',
    a: 'Cumplimos el RGPD, cada estudio accede únicamente a sus propios datos y puedes exportarlos cuando quieras.',
  },
  {
    q: '¿Puedo gestionar varios centros?',
    a: 'Sí. El plan Cadena gestiona varios centros desde un mismo panel, con datos y permisos separados por sede.',
  },
  {
    q: '¿Pierdo datos o me quedo sin servicio al migrar?',
    a: 'No. Tu estudio sigue funcionando en tu sistema actual hasta que tú decidas arrancar. Importas por CSV con detección de duplicados y revisas los datos antes de empezar. Las tarjetas guardadas de tus alumnas no se transfieren solas entre plataformas: te ayudamos a gestionar ese paso para que nadie se quede sin cobrar.',
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

export const FLOW_STEPS = [
  { icon: IconAlert, title: 'Entra la baja', cap: 'Ana avisa desde la app · jue 19:00' },
  { icon: IconUsers, title: 'Busca y contacta', cap: '3 candidatas disponibles · avisadas' },
  { icon: IconCalendar, title: 'Confirma y cuadra', cap: 'Lucía acepta · calendario y horas al día' },
  { icon: IconInvoice, title: 'Avisa a las alumnas', cap: 'Cambio notificado por su canal' },
];

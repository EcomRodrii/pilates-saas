// Las secciones de Configuración y sus tarjetas: qué hay, cómo se llama y qué
// hace, en una sola frase.
//
// Configuración eran doce pestañas con nombres de código («API», «Campos de
// clienta», «Integraciones del negocio») y hasta cuatro niveles de
// sub-navegación. Ahora son once preguntas que se hace una propietaria —«cómo
// reservan mis alumnas», «cómo me comunico»— y cada respuesta es una lista de
// tarjetas. Esta lista es la ÚNICA fuente de esos nombres y frases: la pantalla
// los pinta de aquí, los enlaces antiguos se traducen contra ella
// (lib/configuracion/destino.ts) y los tests comprueban que cada id existe de
// verdad en algún componente.
//
// Cada tarjeta se pinta en su sección. Mientras se reordenaba (15-sep) algunas
// vivieron un tiempo en el componente de otra, con una fila que apuntaba allí;
// ya no queda ninguna. Si una tarjeta cambia de sección, basta con moverla
// aquí: su ancla la sigue sola, y los enlaces guardados no se rompen.
//
// Pura y sin imports: la ejecuta `node --test` directamente.

export type SeccionId =
  | 'estudio' | 'clases' | 'reservas' | 'cobros' | 'altas' | 'comunicacion'
  | 'equipo' | 'web' | 'motivacion' | 'conexiones' | 'datos';

/**
 * Cómo se guarda lo que hay dentro. Solo `al-pulsar` se anuncia en pantalla
 * (con «Se guarda al momento»): es el único que no espera a ningún botón.
 * - barra: espera a su botón «Guardar».
 * - al-pulsar: se guarda al tocarlo (o al salir del campo).
 * - catalogo: una lista con su propio alta y edición.
 * - accion: conectar, copiar, cambiarse… cada botón hace lo suyo.
 * - lectura: solo cuenta lo que hay.
 */
export type ModoGuardado = 'barra' | 'al-pulsar' | 'catalogo' | 'accion' | 'lectura';

export type RolConfiguracion = 'PROPIETARIO' | 'MANAGER' | 'RECEPCION' | 'INSTRUCTOR';

/** Tarjetas que solo existen en algunos estudios. */
export type CondicionTarjeta = 'multiSede' | 'cadena';

export interface TarjetaConfiguracion {
  readonly id: string;
  readonly titulo: string;
  readonly frase: string;
  readonly guardado: ModoGuardado;
  /** Tarjetas que necesitan sitio (catálogos en rejilla, el constructor de widgets). */
  readonly ancho?: 'amplio';
  readonly condicion?: CondicionTarjeta;
  /**
   * Otras palabras con las que la propietaria busca esto en el buscador del
   * inicio («nif», «no viene»). Solo si el ajuste está DE VERDAD en esta
   * tarjeta: un sinónimo que lleva a otra cosa es un enlace que miente.
   */
  readonly palabras?: readonly string[];
}

export interface SeccionConfiguracion {
  readonly id: SeccionId;
  readonly titulo: string;
  /** La línea corta de la lista, cuando no se sabe el valor de lo que hay dentro. */
  readonly resumen: string;
  /** Una sola frase: qué se decide aquí. */
  readonly frase: string;
  readonly roles: readonly RolConfiguracion[];
  readonly tarjetas: readonly TarjetaConfiguracion[];
  readonly palabras?: readonly string[];
}

const SOLO_PROPIETARIA = ['PROPIETARIO'] as const;

export const SECCIONES = [
  {
    id: 'estudio',
    titulo: 'Mi estudio',
    resumen: 'Datos, horario, salas y sedes',
    frase: 'Quién eres, dónde estás y cuándo abres: lo que ven tus alumnas y lo que usa la agenda.',
    roles: SOLO_PROPIETARIA,
    tarjetas: [
      { id: 'datos-y-contacto', titulo: 'Datos y contacto', frase: 'Nombre, teléfono, email, web y dirección. Salen en tu página de reservas y en el pie de tus correos.', guardado: 'barra', palabras: ['nombre', 'teléfono', 'email', 'dirección', 'web'] },
      { id: 'horario-y-cierres', titulo: 'Horario y cierres', frase: 'Cuándo abres cada semana y qué días cierras.', guardado: 'barra', palabras: ['apertura', 'abrir', 'cerrar', 'vacaciones', 'festivos'] },
      { id: 'salas', titulo: 'Salas', frase: 'Tus salas y cuántas personas caben: esa cifra es el tope de plazas de cada clase.', guardado: 'catalogo', ancho: 'amplio', palabras: ['aforo', 'capacidad', 'plazas', 'averías', 'máquinas'] },
      { id: 'sedes', titulo: 'Sedes', frase: 'Tus otras sedes: cámbiate a una o añade otra.', guardado: 'accion', condicion: 'multiSede' },
    ],
  },
  {
    id: 'clases',
    titulo: 'Mis clases y citas',
    resumen: 'Tipos de clase y citas individuales',
    frase: 'Lo que ofreces: los tipos de clase que programas en la agenda y las citas individuales.',
    roles: SOLO_PROPIETARIA,
    tarjetas: [
      { id: 'tipos-de-clase', titulo: 'Tipos de clase', frase: 'Reformer, Suelo, Embarazadas…: nombre, duración, plazas y, si quieres, sus propias reglas de reserva.', guardado: 'catalogo', ancho: 'amplio', palabras: ['reformer', 'suelo', 'mat', 'duración'] },
      { id: 'catalogo-de-la-cadena', titulo: 'Catálogo de la cadena', frase: 'Tipos de clase comunes a tus sedes. Se copian a cada sede al crearla o al pulsar «Aplicar catálogo».', guardado: 'catalogo', condicion: 'cadena' },
      { id: 'servicios-de-cita', titulo: 'Servicios de cita', frase: 'Sesiones individuales, como una clase privada o una valoración.', guardado: 'catalogo', ancho: 'amplio' },
      { id: 'horario-de-citas', titulo: 'Horario de citas', frase: 'Las horas en que cada instructora acepta citas.', guardado: 'barra', ancho: 'amplio' },
    ],
  },
  {
    id: 'reservas',
    titulo: 'Cómo reservan mis alumnas',
    resumen: 'Reservar, cancelar, lista de espera y faltas',
    frase: 'Las reglas de todo el estudio para reservar, cancelar y apuntarse a la lista de espera; cada tipo de clase puede cambiar algunas.',
    roles: SOLO_PROPIETARIA,
    tarjetas: [
      { id: 'politica-explicada', titulo: 'Cuando algo cambia, Tentare…', frase: 'Lo que pasa hoy con lo que tienes guardado. Si algo no es como quieres, cámbialo.', guardado: 'lectura' },
      { id: 'reservar', titulo: 'Reservar', frase: 'Quién puede reservar, con cuánta antelación y cuántas reservas a la vez.', guardado: 'barra', palabras: ['antelación', 'bono', 'plan', 'aprobar reservas', 'impago'] },
      { id: 'cancelar-y-recuperar', titulo: 'Cancelar y recuperar', frase: 'Hasta cuándo se cancela sin perder la sesión, qué pasa si se cancela una clase entera y cómo funcionan las recuperaciones.', guardado: 'barra', palabras: ['cancelación', 'plazo', 'recuperaciones', 'mínimo de asistentes'] },
      { id: 'lista-de-espera', titulo: 'Lista de espera', frase: 'Si una clase llena admite lista de espera y cuánto tiempo hay para aceptar una plaza que se libera.', guardado: 'barra', palabras: ['plaza libre', 'clase llena'] },
      { id: 'asistencia', titulo: 'Asistencia', frase: 'Si pasas lista en cada clase y si pides confirmación a quien suele faltar.', guardado: 'barra', palabras: ['pasar lista', 'check-in', 'qr'] },
      { id: 'si-cancela-tarde-o-no-viene', titulo: 'Si cancela tarde o no viene', frase: 'Un cargo fijo a su tarjeta guardada, si tiene una, cuando cancela tarde o no viene sin avisar.', guardado: 'barra', palabras: ['penalización', 'cargo', 'falta sin avisar'] },
      { id: 'ajuste-avisar-alumnas', titulo: 'Avisos a las alumnas', frase: 'Si por una baja una clase cambia de instructora, se mueve o se cancela, se lo contamos a sus alumnas por email y en su app.', guardado: 'al-pulsar', palabras: ['sustitución', 'cambio de instructora'] },
    ],
  },
  {
    id: 'cobros',
    titulo: 'Cobros y facturas',
    resumen: 'Datos fiscales, Stripe, domiciliaciones y devoluciones',
    frase: 'Cómo te pagan tus alumnas y qué sale en tus facturas.',
    roles: SOLO_PROPIETARIA,
    tarjetas: [
      { id: 'datos-fiscales', titulo: 'Datos fiscales e IVA', frase: 'Razón social, NIF e IVA de tus facturas. Cambiar el IVA solo afecta a las facturas nuevas.', guardado: 'barra', palabras: ['nif', 'cif', 'razón social', 'facturas', 'impuestos'] },
      { id: 'integracion-stripe', titulo: 'Cobro con tarjeta (Stripe)', frase: 'Conecta tu cuenta de Stripe para cobrar bonos y cuotas con tarjeta. El dinero entra directo en tu cuenta.', guardado: 'accion', palabras: ['pago online', 'tarjeta'] },
      { id: 'domiciliaciones', titulo: 'Domiciliaciones bancarias', frase: 'Los datos que pide tu banco para cobrar recibos domiciliados. Con ellos generas la remesa en Cobros.', guardado: 'barra', palabras: ['sepa', 'banco', 'remesa', 'recibos'] },
      { id: 'devoluciones', titulo: 'Devoluciones', frase: 'Permite devolver un cobro desde la ficha de la alumna; el dinero vuelve a su tarjeta.', guardado: 'barra', palabras: ['reembolso', 'devolver'] },
    ],
  },
  {
    id: 'altas',
    titulo: 'Alta de alumnas',
    resumen: 'Contrato, compra desde tu enlace, ficha y salud',
    frase: 'Lo que acepta y rellena una alumna nueva, y qué datos guardas de cada una.',
    roles: SOLO_PROPIETARIA,
    tarjetas: [
      { id: 'contrato-y-privacidad', titulo: 'Contrato y privacidad', frase: 'Los textos que acepta cada alumna al darse de alta. Queda guardado qué texto aceptó, cuándo y el nombre con el que lo aceptó.', guardado: 'barra', palabras: ['términos', 'condiciones', 'rgpd', 'firma'] },
      { id: 'compra-desde-tu-enlace', titulo: 'Compra desde tu enlace', frase: 'Si alguien que aún no es alumna compra un bono en tu página: que se registre antes de pagar o que pague directamente.', guardado: 'barra', palabras: ['registro', 'comprar un bono'] },
      { id: 'datos-extra-de-la-ficha', titulo: 'Datos extra de la ficha', frase: 'Preguntas tuyas, como su objetivo o cómo te conoció. Salen al darla de alta y en su ficha.', guardado: 'catalogo', palabras: ['campos', 'preguntas'] },
      { id: 'valoracion-inicial', titulo: 'Valoración inicial', frase: 'Tus alumnas te cuentan desde su app qué buscan y qué conviene tener en cuenta, antes de sus primeras clases.', guardado: 'al-pulsar', palabras: ['objetivos'] },
      { id: 'cuestionario-de-salud', titulo: 'Cuestionario de salud', frase: 'Preguntas de salud que rellenáis tú o tus instructoras en la ficha de cada alumna; ella no lo rellena.', guardado: 'catalogo', palabras: ['lesiones'] },
    ],
  },
  {
    id: 'comunicacion',
    titulo: 'Cómo me comunico',
    resumen: 'Correos, WhatsApp y Gmail',
    frase: 'Los correos que Tentare envía sola a tus alumnas y los canales conectados para escribirles.',
    roles: SOLO_PROPIETARIA,
    tarjetas: [
      { id: 'correos-automaticos', titulo: 'Correos automáticos', frase: 'Bienvenida, reserva, recordatorio, cancelación…: apaga los que no quieras o cambia lo que dicen.', guardado: 'catalogo', palabras: ['emails', 'recordatorio', 'bienvenida', 'plantillas'] },
      { id: 'integracion-resend', titulo: 'Nombre y respuesta de tus correos', frase: 'El nombre que ven tus alumnas como remitente y la dirección donde llegan sus respuestas.', guardado: 'catalogo', palabras: ['remitente', 'emails'] },
      { id: 'integracion-whatsapp', titulo: 'WhatsApp', frase: 'Recordatorios y avisos desde tu número de WhatsApp Business.', guardado: 'accion', palabras: ['mensajes'] },
      { id: 'integracion-gmail', titulo: 'Contactos de Gmail', frase: 'Trae los contactos de tu Gmail como alumnas nuevas. Los correos no salen desde tu Gmail.', guardado: 'accion' },
    ],
  },
  {
    id: 'motivacion',
    titulo: 'Motivación',
    resumen: 'Créditos, recompensas, logros y retos',
    frase: 'Premia la constancia de tus alumnas con créditos, logros, niveles y retos que ven en su app.',
    roles: SOLO_PROPIETARIA,
    palabras: ['gamificación', 'puntos'],
    tarjetas: [
      { id: 'reglas', titulo: 'Cómo funcionan tus créditos', frase: 'Cómo se llaman, cuánto duran, cuántas clases mantienen una racha y cuántos se ganan con cada cosa.', guardado: 'al-pulsar', palabras: ['racha', 'puntos'] },
      { id: 'recompensas', titulo: 'Recompensas', frase: 'Lo que tus alumnas pueden canjear con sus créditos.', guardado: 'catalogo', palabras: ['premios'] },
      { id: 'canjes', titulo: 'Canjes pendientes', frase: 'Recompensas pedidas que tienes que entregar.', guardado: 'accion' },
      { id: 'logros', titulo: 'Logros', frase: 'Lo que desbloquean tus alumnas al llegar a una cifra que eliges, como 10 clases.', guardado: 'catalogo', palabras: ['insignias'] },
      { id: 'niveles', titulo: 'Niveles', frase: 'El nivel sube con los créditos ganados en total; canjear nunca lo hace bajar.', guardado: 'catalogo' },
      { id: 'retos', titulo: 'Retos', frase: 'Objetivos con fecha de inicio y fin: solo cuenta lo que pasa dentro de ese periodo.', guardado: 'catalogo', palabras: ['desafíos'] },
    ],
  },
  {
    id: 'web',
    titulo: 'Mi app y mi web',
    resumen: 'Marca, textos, enlaces y widgets',
    frase: 'Cómo se ve tu estudio por fuera: la app de tus alumnas, tu página de reservas y tu web.',
    roles: SOLO_PROPIETARIA,
    tarjetas: [
      { id: 'marca', titulo: 'Marca', frase: 'Logo, favicon y el color de tu marca. El logo se guarda al subirlo; el favicon se ve al publicar en Apariencia.', guardado: 'al-pulsar', palabras: ['logo', 'favicon', 'color'] },
      { id: 'textos-de-tu-app', titulo: 'Textos de tu app', frase: 'Tu presentación, lema, frases de bienvenida y normas del centro. Lo que dejes vacío no se muestra.', guardado: 'barra', palabras: ['presentación', 'lema', 'normas'] },
      { id: 'direccion-y-enlaces', titulo: 'Dirección y enlaces', frase: 'La dirección de tu página de reservas y el enlace a la app de tus alumnas.', guardado: 'accion', palabras: ['enlace', 'página de reservas', 'url'] },
      { id: 'network', titulo: 'Aparecer en Tentare Network', frase: 'Tu estudio sale en el buscador de estudios de Tentare, aunque no tengan tu enlace.', guardado: 'al-pulsar', palabras: ['directorio', 'buscador de estudios'] },
      { id: 'contenido-de-tu-app', titulo: 'Contenido de tu app', frase: 'Tarjetas de «Descubre», mensaje destacado y avisos del tablón en el inicio de su app.', guardado: 'catalogo', ancho: 'amplio', palabras: ['descubre', 'tablón', 'mensaje destacado'] },
      { id: 'widgets', titulo: 'Widgets para tu web', frase: 'El horario, las citas o una clase concreta dentro de tu propia web, con un código para pegar.', guardado: 'accion', ancho: 'amplio', palabras: ['incrustar', 'código'] },
    ],
  },
  {
    id: 'equipo',
    titulo: 'Mi equipo',
    resumen: 'Qué pueden hacer tus instructoras',
    frase: 'Qué pueden hacer tus instructoras por su cuenta.',
    roles: SOLO_PROPIETARIA,
    tarjetas: [
      { id: 'ajuste-instructoras-crean-clases', titulo: 'Las instructoras crean sus clases', frase: 'Si pueden crear clases nuevas o solo dar las que tú les asignas; siempre pueden editar las suyas.', guardado: 'barra', palabras: ['profesoras', 'permisos'] },
    ],
  },
  {
    id: 'conexiones',
    titulo: 'Conexiones',
    resumen: 'Calendario, Zoom y otras apps',
    frase: 'Tentare conectado con otras herramientas que ya usas.',
    roles: SOLO_PROPIETARIA,
    tarjetas: [
      { id: 'integracion-google_calendar', titulo: 'Google Calendar', frase: 'Copia las clases de las próximas 4 semanas a tu calendario al pulsar «Sincronizar ahora»; no se actualiza solo.', guardado: 'accion', palabras: ['calendario'] },
      { id: 'integracion-zoom', titulo: 'Zoom', frase: 'Crea una reunión de Zoom para cada clase de los tipos marcados como online.', guardado: 'accion', palabras: ['online', 'videollamada'] },
      { id: 'aplicaciones-con-acceso', titulo: 'Aplicaciones con acceso', frase: 'Apps como Zapier con permiso para ver datos de tu estudio; puedes quitárselo.', guardado: 'accion', palabras: ['zapier', 'permisos'] },
      { id: 'mas-integraciones', titulo: 'Más integraciones', frase: 'Abrir la puerta con cada check-in (Kisi), llevar tus alumnas a tus listas de marketing (Klaviyo, Mailchimp) y conectar con otras apps (Zapier).', guardado: 'accion', palabras: ['kisi', 'puerta', 'klaviyo', 'mailchimp'] },
    ],
  },
  {
    id: 'datos',
    titulo: 'Datos y seguridad',
    resumen: 'Exportar tus datos',
    frase: 'Llévate una copia de los datos de tu estudio cuando quieras.',
    roles: SOLO_PROPIETARIA,
    tarjetas: [
      // La única forma de llevarte tus datos: «Exportar a Excel» se retiró el
      // 15-sep y su ancla vieja lleva aquí (lib/configuracion/destino.ts).
      { id: 'exportar', titulo: 'Exportar mis datos', frase: 'Un archivo CSV por tabla, que abre Excel: alumnas, reservas, suscripciones y bonos, recibos y pagos importados. No incluye ficha clínica ni notas de progreso.', guardado: 'accion', palabras: ['descargar', 'copia', 'csv', 'excel'] },
    ],
  },
] as const satisfies readonly SeccionConfiguracion[];

export type TarjetaId = (typeof SECCIONES)[number]['tarjetas'][number]['id'];

/** «Mi cuenta» no es una sección: es la última fila, que lleva a /mi-perfil. */
export const MI_CUENTA = { titulo: 'Mi cuenta', resumen: 'Tu nombre, tu foto y cómo entras.', href: '/mi-perfil' } as const;

export interface GrupoConfiguracion {
  readonly id: string;
  readonly titulo: string;
  readonly secciones: readonly SeccionId[];
  /** «Mi cuenta» va en su propio grupo: no es una sección, es otra pantalla. */
  readonly conMiCuenta?: true;
}

/**
 * Los grupos del inicio de Configuración, de lo que abre el estudio a lo que se
 * toca una vez. Once secciones seguidas no se leían: «Mi app y mi web»,
 * «Conexiones» y «Datos» quedaban bajo el pliegue sin nada que dijera qué eran.
 * `SECCIONES` va en este mismo orden, para que la columna de la izquierda y el
 * inicio no cuenten dos órdenes distintos.
 */
export const GRUPOS: readonly GrupoConfiguracion[] = [
  { id: 'lo-basico', titulo: 'Lo básico', secciones: ['estudio', 'clases', 'reservas', 'cobros'] },
  { id: 'tus-alumnas', titulo: 'Tus alumnas', secciones: ['altas', 'comunicacion', 'motivacion'] },
  { id: 'tu-imagen', titulo: 'Tu imagen', secciones: ['web'] },
  { id: 'equipo', titulo: 'Equipo', secciones: ['equipo'] },
  { id: 'conexiones-y-datos', titulo: 'Conexiones y datos', secciones: ['conexiones', 'datos'] },
  { id: 'tu-cuenta', titulo: 'Tu cuenta', secciones: [], conMiCuenta: true },
];

const SECCION_POR_ID = new Map<string, SeccionConfiguracion>(SECCIONES.map(s => [s.id, s]));
const TARJETA_POR_ID = new Map<string, { tarjeta: TarjetaConfiguracion; seccion: SeccionId }>(
  SECCIONES.flatMap(s => s.tarjetas.map(t => [t.id, { tarjeta: t as TarjetaConfiguracion, seccion: s.id }] as const)),
);

export function esSeccionId(v: string): v is SeccionId {
  return SECCION_POR_ID.has(v);
}

export function seccionPorId(id: SeccionId): SeccionConfiguracion {
  return SECCION_POR_ID.get(id)!;
}

export function tarjetaPorId(id: TarjetaId): TarjetaConfiguracion {
  return TARJETA_POR_ID.get(id)!.tarjeta;
}

export function esTarjetaId(v: string): v is TarjetaId {
  return TARJETA_POR_ID.has(v);
}

/** La sección donde se pinta la tarjeta. */
export function seccionDeTarjeta(id: TarjetaId): SeccionId {
  return TARJETA_POR_ID.get(id)!.seccion;
}

export function cumpleCondicion(
  condicion: CondicionTarjeta | undefined,
  ctx: { haySedes: boolean; esCadena: boolean },
): boolean {
  if (condicion === 'multiSede') return ctx.haySedes;
  if (condicion === 'cadena') return ctx.esCadena;
  return true;
}

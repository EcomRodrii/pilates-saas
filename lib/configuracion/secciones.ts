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
// ⚠️ `hospedadaEn`: el orden aprobado mueve tarjetas entre componentes. Mientras
// una tarjeta siga pintándose dentro del componente de otra sección, `hospedadaEn`
// dice DÓNDE está de verdad: el ancla lleva allí y en su sección definitiva se
// pinta una fila que apunta. Mover la tarjeta = borrar esta propiedad, y ningún
// enlace guardado se rompe. Desde el 15-sep solo quedan las dos que viven dentro
// de las reglas de reserva («Compra desde tu enlace» y «Las instructoras crean
// sus clases»); los datos fiscales, la marca, los textos, Stripe, WhatsApp,
// Gmail, el remitente, el catálogo de la cadena y las aplicaciones con acceso ya
// están en su sección.
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
  /** Dónde se pinta de verdad mientras no se mueva de componente (ver arriba). */
  readonly hospedadaEn?: SeccionId;
}

export interface SeccionConfiguracion {
  readonly id: SeccionId;
  readonly titulo: string;
  /** La línea corta de la lista. */
  readonly resumen: string;
  /** Una sola frase: qué se decide aquí. */
  readonly frase: string;
  readonly roles: readonly RolConfiguracion[];
  readonly tarjetas: readonly TarjetaConfiguracion[];
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
      { id: 'datos-y-contacto', titulo: 'Datos y contacto', frase: 'Nombre, teléfono, email, web y dirección. Salen en tu página de reservas y en el pie de tus correos.', guardado: 'barra' },
      { id: 'horario-y-cierres', titulo: 'Horario y cierres', frase: 'Cuándo abres cada semana y qué días cierras.', guardado: 'barra' },
      { id: 'salas', titulo: 'Salas', frase: 'Tus salas y cuántas personas caben: esa cifra es el tope de plazas de cada clase.', guardado: 'catalogo', ancho: 'amplio' },
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
      { id: 'tipos-de-clase', titulo: 'Tipos de clase', frase: 'Reformer, Suelo, Embarazadas…: nombre, duración, plazas y, si quieres, sus propias reglas de reserva.', guardado: 'catalogo', ancho: 'amplio' },
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
      { id: 'reglas-de-reserva', titulo: 'Reservar, cancelar y lista de espera', frase: 'Quién puede reservar y con cuánta antelación, hasta cuándo se cancela, la lista de espera, pasar lista y el cargo si alguien no viene.', guardado: 'barra' },
      { id: 'ajuste-avisar-alumnas', titulo: 'Avisos a las alumnas', frase: 'Si por una baja una clase cambia de instructora, se mueve o se cancela, se lo contamos a sus alumnas por email y en su app.', guardado: 'al-pulsar' },
    ],
  },
  {
    id: 'cobros',
    titulo: 'Cobros y facturas',
    resumen: 'Datos fiscales, Stripe, domiciliaciones y devoluciones',
    frase: 'Cómo te pagan tus alumnas y qué sale en tus facturas.',
    roles: SOLO_PROPIETARIA,
    tarjetas: [
      { id: 'datos-fiscales', titulo: 'Datos fiscales e IVA', frase: 'Razón social, NIF e IVA de tus facturas. Cambiar el IVA solo afecta a las facturas nuevas.', guardado: 'barra' },
      { id: 'integracion-stripe', titulo: 'Cobro con tarjeta (Stripe)', frase: 'Conecta tu cuenta de Stripe para cobrar bonos y cuotas con tarjeta. El dinero entra directo en tu cuenta.', guardado: 'accion' },
      { id: 'domiciliaciones', titulo: 'Domiciliaciones bancarias', frase: 'Los datos que pide tu banco para cobrar recibos domiciliados. Con ellos generas la remesa en Cobros.', guardado: 'barra' },
      { id: 'devoluciones', titulo: 'Devoluciones', frase: 'Permite devolver un cobro desde la ficha de la alumna; el dinero vuelve a su tarjeta.', guardado: 'barra' },
    ],
  },
  {
    id: 'altas',
    titulo: 'Alta de alumnas',
    resumen: 'Contrato, compra desde tu enlace, ficha y salud',
    frase: 'Lo que acepta y rellena una alumna nueva, y qué datos guardas de cada una.',
    roles: SOLO_PROPIETARIA,
    tarjetas: [
      { id: 'contrato-y-privacidad', titulo: 'Contrato y privacidad', frase: 'Los textos que acepta cada alumna al darse de alta. Queda guardado qué texto aceptó, cuándo y el nombre con el que lo aceptó.', guardado: 'barra' },
      { id: 'compra-desde-tu-enlace', titulo: 'Compra desde tu enlace', frase: 'Si alguien que aún no es alumna compra un bono en tu página: que se registre antes de pagar o que pague directamente.', guardado: 'barra', hospedadaEn: 'reservas' },
      { id: 'datos-extra-de-la-ficha', titulo: 'Datos extra de la ficha', frase: 'Preguntas tuyas, como su objetivo o cómo te conoció. Salen al darla de alta y en su ficha.', guardado: 'catalogo' },
      { id: 'valoracion-inicial', titulo: 'Valoración inicial', frase: 'Tus alumnas te cuentan desde su app qué buscan y qué conviene tener en cuenta, antes de sus primeras clases.', guardado: 'al-pulsar' },
      { id: 'cuestionario-de-salud', titulo: 'Cuestionario de salud', frase: 'Preguntas de salud que rellenáis tú o tus instructoras en la ficha de cada alumna; ella no lo rellena.', guardado: 'catalogo' },
    ],
  },
  {
    id: 'comunicacion',
    titulo: 'Cómo me comunico',
    resumen: 'Correos, WhatsApp y Gmail',
    frase: 'Los correos que Tentare envía sola a tus alumnas y los canales conectados para escribirles.',
    roles: SOLO_PROPIETARIA,
    tarjetas: [
      { id: 'correos-automaticos', titulo: 'Correos automáticos', frase: 'Bienvenida, reserva, recordatorio, cancelación…: apaga los que no quieras o cambia lo que dicen.', guardado: 'catalogo' },
      { id: 'integracion-resend', titulo: 'Nombre y respuesta de tus correos', frase: 'El nombre que ven tus alumnas como remitente y la dirección donde llegan sus respuestas.', guardado: 'catalogo' },
      { id: 'integracion-whatsapp', titulo: 'WhatsApp', frase: 'Recordatorios y avisos desde tu número de WhatsApp Business.', guardado: 'accion' },
      { id: 'integracion-gmail', titulo: 'Contactos de Gmail', frase: 'Trae los contactos de tu Gmail como alumnas nuevas. Los correos no salen desde tu Gmail.', guardado: 'accion' },
    ],
  },
  {
    id: 'equipo',
    titulo: 'Mi equipo',
    resumen: 'Qué pueden hacer tus instructoras',
    frase: 'Qué pueden hacer tus instructoras por su cuenta.',
    roles: SOLO_PROPIETARIA,
    tarjetas: [
      { id: 'ajuste-instructoras-crean-clases', titulo: 'Las instructoras crean sus clases', frase: 'Si pueden crear clases nuevas o solo dar las que tú les asignas; siempre pueden editar las suyas.', guardado: 'barra', hospedadaEn: 'reservas' },
    ],
  },
  {
    id: 'web',
    titulo: 'Mi app y mi web',
    resumen: 'Marca, textos, enlaces y widgets',
    frase: 'Cómo se ve tu estudio por fuera: la app de tus alumnas, tu página de reservas y tu web.',
    roles: SOLO_PROPIETARIA,
    tarjetas: [
      { id: 'marca', titulo: 'Marca', frase: 'Logo, favicon y el color de tu marca. El logo se guarda al subirlo; el favicon se ve al publicar en Apariencia.', guardado: 'al-pulsar' },
      { id: 'textos-de-tu-app', titulo: 'Textos de tu app', frase: 'Tu presentación, lema, frases de bienvenida y normas del centro. Lo que dejes vacío no se muestra.', guardado: 'barra' },
      { id: 'direccion-y-enlaces', titulo: 'Dirección y enlaces', frase: 'La dirección de tu página de reservas y el enlace a la app de tus alumnas.', guardado: 'accion' },
      { id: 'network', titulo: 'Aparecer en Tentare Network', frase: 'Tu estudio sale en el buscador de estudios de Tentare, aunque no tengan tu enlace.', guardado: 'al-pulsar' },
      { id: 'contenido-de-tu-app', titulo: 'Contenido de tu app', frase: 'Tarjetas de «Descubre», mensaje destacado y avisos del tablón en el inicio de su app.', guardado: 'catalogo', ancho: 'amplio' },
      { id: 'widgets', titulo: 'Widgets para tu web', frase: 'El horario, las citas o una clase concreta dentro de tu propia web, con un código para pegar.', guardado: 'accion', ancho: 'amplio' },
    ],
  },
  {
    id: 'motivacion',
    titulo: 'Motivación',
    resumen: 'Créditos, recompensas, logros y retos',
    frase: 'Premia la constancia de tus alumnas con créditos, logros, niveles y retos que ven en su app.',
    roles: SOLO_PROPIETARIA,
    tarjetas: [
      { id: 'reglas', titulo: 'Cómo funcionan tus créditos', frase: 'Cómo se llaman, cuánto duran, cuántas clases mantienen una racha y cuántos se ganan con cada cosa.', guardado: 'al-pulsar' },
      { id: 'recompensas', titulo: 'Recompensas', frase: 'Lo que tus alumnas pueden canjear con sus créditos.', guardado: 'catalogo' },
      { id: 'canjes', titulo: 'Canjes pendientes', frase: 'Recompensas pedidas que tienes que entregar.', guardado: 'accion' },
      { id: 'logros', titulo: 'Logros', frase: 'Lo que desbloquean tus alumnas al llegar a una cifra que eliges, como 10 clases.', guardado: 'catalogo' },
      { id: 'niveles', titulo: 'Niveles', frase: 'El nivel sube con los créditos ganados en total; canjear nunca lo hace bajar.', guardado: 'catalogo' },
      { id: 'retos', titulo: 'Retos', frase: 'Objetivos con fecha de inicio y fin: solo cuenta lo que pasa dentro de ese periodo.', guardado: 'catalogo' },
    ],
  },
  {
    id: 'conexiones',
    titulo: 'Conexiones',
    resumen: 'Calendario, Zoom y otras apps',
    frase: 'Tentare conectado con otras herramientas que ya usas.',
    roles: SOLO_PROPIETARIA,
    tarjetas: [
      { id: 'integracion-google_calendar', titulo: 'Google Calendar', frase: 'Copia las clases de las próximas 4 semanas a tu calendario al pulsar «Sincronizar ahora»; no se actualiza solo.', guardado: 'accion' },
      { id: 'integracion-zoom', titulo: 'Zoom', frase: 'Crea una reunión de Zoom para cada clase de los tipos marcados como online.', guardado: 'accion' },
      { id: 'aplicaciones-con-acceso', titulo: 'Aplicaciones con acceso', frase: 'Apps como Zapier con permiso para ver datos de tu estudio; puedes quitárselo.', guardado: 'accion' },
      { id: 'mas-integraciones', titulo: 'Más integraciones', frase: 'Abrir la puerta con cada check-in (Kisi), llevar tus alumnas a tus listas de marketing (Klaviyo, Mailchimp) y conectar con otras apps (Zapier).', guardado: 'accion' },
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
      { id: 'exportar', titulo: 'Exportar mis datos', frase: 'Un archivo CSV por tabla, que abre Excel: alumnas, reservas, suscripciones y bonos, recibos y pagos importados. No incluye ficha clínica ni notas de progreso.', guardado: 'accion' },
    ],
  },
] as const satisfies readonly SeccionConfiguracion[];

export type TarjetaId = (typeof SECCIONES)[number]['tarjetas'][number]['id'];

/** «Mi cuenta» no es una sección: es la fila de abajo, que lleva a /mi-perfil. */
export const MI_CUENTA = { titulo: 'Mi cuenta', resumen: 'Tu nombre, tu foto y cómo entras.', href: '/mi-perfil' } as const;

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

/** La sección donde está la tarjeta en su orden definitivo. */
export function seccionDeTarjeta(id: TarjetaId): SeccionId {
  return TARJETA_POR_ID.get(id)!.seccion;
}

/** La sección donde se pinta HOY: su casa, o la que la hospeda mientras tanto. */
export function seccionAnfitriona(id: TarjetaId): SeccionId {
  const { tarjeta, seccion } = TARJETA_POR_ID.get(id)!;
  return tarjeta.hospedadaEn ?? seccion;
}

/** Las tarjetas que se pintan de verdad en una sección (las suyas y las que hospeda). */
export function tarjetasPintadasEn(seccion: SeccionId): TarjetaConfiguracion[] {
  return SECCIONES.flatMap(s => s.tarjetas as readonly TarjetaConfiguracion[])
    .filter(t => seccionAnfitriona(t.id as TarjetaId) === seccion);
}

/** Las tarjetas de una sección que viven en otra y aquí son solo una fila que lleva allí. */
export function tarjetasDeFuera(seccion: SeccionId): TarjetaConfiguracion[] {
  return (seccionPorId(seccion).tarjetas as readonly TarjetaConfiguracion[]).filter(t => t.hospedadaEn);
}

export function cumpleCondicion(
  condicion: CondicionTarjeta | undefined,
  ctx: { haySedes: boolean; esCadena: boolean },
): boolean {
  if (condicion === 'multiSede') return ctx.haySedes;
  if (condicion === 'cadena') return ctx.esCadena;
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// La ruta de puesta en marcha de un estudio (20-nov-2026, `docs/guia-puesta-en-marcha.md`).
//
// Diez pasos, en el orden del camino a la primera reserva: el sitio (salas) → quién
// (instructoras) → qué (tipos de clase) → cuándo (horario) → a qué precio (tarifas)
// → cómo se cobra → que se vea suyo (marca) → traer gente (clientas) → compartir →
// primera reserva.
//
// Puro, sin `@/`. NO decide qué está hecho: lo dicen los datos reales del estudio
// (los pasa quien llama). Lo único que no son datos es «saltar», y saltar NO da un
// paso por hecho: solo deja de ofrecerlo como el siguiente.
//
// Un paso lleva: qué es (una frase), por qué importa (una frase) y cómo se hace
// (dos o tres líneas) — la pantalla enseña UNA pregunta por vez, no todo junto.
// ─────────────────────────────────────────────────────────────────────────────

export type IdPaso =
  | 'estudio' | 'salas' | 'instructoras' | 'tipos' | 'reglas-reserva' | 'reglas-cancelacion'
  | 'tarifas' | 'cobros' | 'horario' | 'alumnas' | 'marca' | 'lanzamiento';

export type IconoPaso =
  | 'estudio' | 'sala' | 'equipo' | 'clase' | 'reglas' | 'tarifa' | 'cobro' | 'calendario' | 'alumnas' | 'marca' | 'reserva';

export type BotonPaso = { label: string; href: string } | { label: string; abre: 'compartir' };

export interface PasoRuta {
  id: IdPaso;
  icono: IconoPaso;
  /** Corto, con verbo. */
  titulo: string;
  /** Una frase: qué es. */
  que: string;
  /** Una frase: por qué importa. */
  porque: string;
  /** Dos o tres líneas: cómo se hace. */
  como: readonly string[];
  /** Lo que hace el paso ahí mismo. */
  boton?: BotonPaso;
  /** Un segundo camino. */
  otro?: { label: string; href: string };
  minutos?: number;
  /** Se puede saltar sin que el estudio deje de poder recibir reservas. */
  saltable: boolean;
  /** Lo que se dice al saltarlo, si aplica. */
  siSaltas?: string;
  /** Qué pasos hacen falta ANTES (regla de oro: nunca pedir algo sin sus dependencias). */
  requiere?: readonly IdPaso[];
  /**
   * Un paso sin dato que lo diga hecho (las reglas de reserva y de cancelación tienen valores de
   * serie: no hay un «guardado»). Nunca cuenta como hecho: se revisa y, al terminar, se marca como
   * saltado en este navegador. Duda documentada en docs/guia-puesta-en-marcha.md.
   */
  revision?: boolean;
  /** Cómo se llama lo hecho. */
  hecho: string;
}

export const PASOS_RUTA: readonly PasoRuta[] = [
  {
    id: 'estudio', icono: 'estudio', titulo: 'Tus datos y tu horario', minutos: 3, saltable: true,
    que: 'El nombre, la dirección y los datos fiscales de tu estudio, y las horas a las que abres.',
    porque: 'Salen en tus facturas y en la página de reservas. Sin NIF no se puede facturar ningún cobro.',
    como: ['Revisa el nombre y la dirección que pusiste al crear el estudio.', 'Añade tu razón social y tu NIF.', 'Si tienes varias sedes, ábrelas después, desde tu suscripción.'],
    boton: { label: 'Poner mis datos', href: '/configuracion?tab=cobros#datos-fiscales' },
    siSaltas: 'Puedes recibir reservas sin NIF, pero no emitir facturas hasta ponerlo.',
    hecho: 'Ya tienes tus datos fiscales',
  },
  {
    id: 'salas', icono: 'sala', titulo: 'Crea tu sala', minutos: 2, saltable: false,
    que: 'Una sala es el espacio físico donde das clase. Cada una tiene un aforo: las plazas que caben.',
    porque: 'El aforo de la sala es el límite real de plazas de cada clase. Sin sala no se puede programar nada.',
    como: ['Ponle un nombre (por ejemplo «Sala Reformer»).', 'Di cuántas personas caben.', 'Un solo espacio, una sala. Si tienes varios, crea una por espacio.'],
    boton: { label: 'Crear mi sala', href: '/configuracion?tab=estudio&abrir=salas' },
    hecho: 'Ya tienes sala',
  },
  {
    id: 'instructoras', icono: 'equipo', titulo: 'Añade a quien da las clases', minutos: 2, saltable: false,
    que: 'Una instructora es la persona asignada a cada clase. Si das tú las clases, eres tú.',
    porque: 'Toda clase necesita a alguien asignado: así se sabe quién la da y se pueden gestionar sustituciones.',
    como: ['Escribe su nombre y su correo.', 'No hace falta que tenga cuenta para aparecer en el horario.', 'La recepción y los permisos de tu equipo se ven después, en Equipo.'],
    boton: { label: 'Añadir instructora', href: '/equipo?nuevo=1' },
    hecho: 'Ya tienes instructora',
  },
  {
    id: 'tipos', icono: 'clase', titulo: 'Crea tu primer tipo de clase', minutos: 2, saltable: false,
    que: 'Un tipo de clase es una plantilla (Reformer, Mat, Prenatal…), no una clase en el calendario.',
    porque: 'Se define una vez y sirve para todo el horario. Una clase del calendario será un tipo, un día, una hora, una sala y una instructora.',
    como: ['Dale nombre y duración.', 'Añade una frase de qué se trabaja.', 'Empieza con uno; luego creas los que quieras.'],
    boton: { label: 'Crear tipo de clase', href: '/configuracion?tab=clases&abrir=tipos-de-clase' },
    hecho: 'Ya tienes tipo de clase',
  },
  {
    id: 'reglas-reserva', icono: 'reglas', titulo: 'Decide cómo se reserva', minutos: 4, saltable: true, revision: true,
    que: 'Las reglas de reserva dicen quién puede reservar, con cuánta antelación y qué pasa si la clase se llena.',
    porque: 'Son las reglas con las que Tentare va a tratar a tus clientas. Mejor verlas ahora que enterarte con la primera reserva.',
    como: ['Mira si exiges un paquete activo para reservar.', 'Mira la lista de espera y su plazo para aceptar una plaza.', 'Cada tipo de clase puede tener sus propias reglas.'],
    boton: { label: 'Ver las reglas de reserva', href: '/configuracion?tab=reservas' },
    siSaltas: 'Se quedan los valores de serie del estudio. Puedes cambiarlos cuando quieras.',
    hecho: 'Reglas de reserva revisadas',
  },
  {
    id: 'reglas-cancelacion', icono: 'reglas', titulo: 'Decide cómo se cancela', minutos: 4, saltable: true, revision: true,
    que: 'Las reglas de cancelación dicen hasta cuándo se puede cancelar gratis y qué pasa si se cancela tarde.',
    porque: 'Cancelar a tiempo y cancelar tarde no se tratan igual. Conviene que lo decidas tú y no lo descubras con una queja.',
    como: ['Elige las horas de antelación para cancelar sin consecuencias.', 'Decide si una cancelación tardía devuelve la sesión del bono y la recuperación.', 'Los cargos por cancelar tarde o no presentarse se activan aparte.'],
    boton: { label: 'Ver las reglas de cancelación', href: '/configuracion?tab=reservas' },
    siSaltas: 'Se quedan los valores de serie del estudio. Puedes cambiarlos cuando quieras.',
    hecho: 'Reglas de cancelación revisadas',
  },
  {
    id: 'tarifas', icono: 'tarifa', titulo: 'Pon precio a tus clases', minutos: 4, saltable: true, requiere: ['tipos'],
    que: 'Un paquete es lo que paga tu clienta: una clase suelta (1 sesión), un bono de varias clases o una cuota que se renueva.',
    porque: 'Con paquetes, tu clienta compra desde su app y tú no vas cobrando clase a clase. Cada uno puede valer solo para ciertos tipos de clase.',
    como: ['Empieza por una clase suelta o un bono.', 'Elige para qué tipos de clase vale (vacío = todas).', 'Una cuota es para ingresos recurrentes; puedes crearla más tarde.'],
    boton: { label: 'Crear un paquete', href: '/productos' },
    siSaltas: 'Tus clientas podrán reservar, pero tendrás que cobrar y apuntar los pagos a mano.',
    hecho: 'Ya tienes paquetes',
  },
  {
    id: 'cobros', icono: 'cobro', titulo: 'Decide cómo cobras', minutos: 5, saltable: true,
    que: 'Puedes cobrar en el estudio (efectivo, datáfono, Bizum) o con tarjeta online conectando Stripe.',
    porque: 'Para recibir reservas NO hace falta Stripe. Solo si quieres que tus clientas paguen con tarjeta desde su app.',
    como: ['Si cobras en el estudio, salta este paso.', 'Si quieres cobrar online, conecta Stripe.', 'El dinero va a tu cuenta de Stripe.'],
    boton: { label: 'Conectar Stripe', href: '/configuracion?tab=conexiones#integracion-stripe' },
    siSaltas: 'Cobrarás en el estudio y lo apuntas en Tentare. Puedes conectar Stripe más adelante.',
    hecho: 'Ya cobras online',
  },
  {
    id: 'horario', icono: 'calendario', titulo: 'Programa tus clases', minutos: 3, saltable: false, requiere: ['salas', 'instructoras', 'tipos'],
    que: 'Una clase es un tipo de clase en un día y una hora, con una sala y una instructora.',
    porque: 'Sin clases en el calendario, la app de tus clientas no tiene nada que enseñar y nadie puede reservar.',
    como: ['Elige tipo, sala, instructora y hora.', 'Para lunes, miércoles y viernes a las 9:00 crea una sola clase semanal, no tres sueltas.', 'Con una semana programada ya puedes recibir reservas.'],
    boton: { label: 'Programar una clase', href: '/calendario?nueva=1' },
    otro: { label: 'Importar mi horario', href: '/calendario/importar' },
    hecho: 'Ya tienes clases en el calendario',
  },
  {
    id: 'alumnas', icono: 'alumnas', titulo: 'Trae a tus clientas', minutos: 3, saltable: true,
    que: 'Una ficha es una clienta: su correo, su teléfono y su historial. Puedes traerlas de tu programa anterior.',
    porque: 'Las clientas con ficha entran a la app con su correo. Si ya las tienes en otro programa, no empiezas de cero.',
    como: ['Importa el Excel o el archivo de tu programa anterior.', 'O dalas de alta una a una con su correo.', 'No hace falta que estén todas desde el primer día.'],
    boton: { label: 'Importar mis clientas', href: '/migracion' },
    otro: { label: 'Añadir una', href: '/clientas?nuevo=1' },
    siSaltas: 'Se apuntarán solas desde la app al reservar.',
    hecho: 'Ya tienes clientas',
  },
  {
    id: 'marca', icono: 'marca', titulo: 'La app de tus clientas', minutos: 2, saltable: true,
    que: 'La app con tu logo y tu color, y tu página de reservas, que puedes integrar en tu web.',
    porque: 'Es lo que ve tu clienta al reservar y pagar. La app es lo que le das por defecto; la página de reservas, para tu web.',
    como: ['Sube tu logo y elige tu color.', 'Mira cómo queda antes de guardar.', 'Comparte el enlace de la app por WhatsApp o con el QR.'],
    boton: { label: 'Personalizar mi app', href: '/configuracion?tab=marca' },
    siSaltas: 'Saldrá con los colores de serie. Puedes cambiarlos cuando quieras.',
    hecho: 'Ya es tu marca',
  },
  {
    id: 'lanzamiento', icono: 'reserva', titulo: 'Abre tus reservas', saltable: false, requiere: ['horario'],
    que: 'Cuando tienes sala, instructora, tipo de clase y una clase programada, ya puedes recibir reservas.',
    porque: 'La primera reserva real es la prueba de que todo funciona. Se marca sola cuando una clienta reserva desde tu app.',
    como: ['Comparte tu enlace o tu QR con tus clientas.', 'Pide a una amiga que pruebe a reservar.', 'Si algo no funciona, escríbenos: te responde una persona.'],
    boton: { label: 'Compartir mi enlace', abre: 'compartir' },
    hecho: 'Ya has recibido tu primera reserva',
  },
];

/** Los datos reales de los que sale qué está hecho: los pasa quien llama. */
export interface DatosRuta {
  estudio: boolean;
  salas: boolean;
  instructoras: boolean;
  tipos: boolean;
  tarifas: boolean;
  cobros: boolean;
  horario: boolean;
  alumnas: boolean;
  marca: boolean;
  /** La primera reserva real. */
  primeraReserva: boolean;
  /** Los pasos que saltó (solo vale en los saltables). */
  saltados?: readonly string[];
}

export type EstadoPaso = 'hecho' | 'ahora' | 'pendiente' | 'saltado' | 'bloqueado';

export interface PasoConEstado extends PasoRuta {
  estado: EstadoPaso;
  numero: number;
  /** Los pasos que faltan ANTES de este (vacío si no está bloqueado). */
  faltaAntes: PasoConEstado[];
}

export interface RutaPuestaEnMarcha {
  pasos: PasoConEstado[];
  hechos: number;
  total: number;
  terminada: boolean;
  /** El que se ofrece: el primero sin hacer, sin saltar y sin bloquear. */
  ahora: PasoConEstado | null;
  etiqueta: string;
  corto: string;
  /** ¿Falta alguna de las bases (sala, instructora, tipo de clase) para programar? */
  faltanBases: PasoConEstado[];
  /** «Tu estudio está listo para recibir reservas»: lo imprescindible hecho (los opcionales no bloquean). */
  listoParaAbrir: boolean;
  /** Lo imprescindible que falta para abrir. */
  faltaParaAbrir: PasoConEstado[];
}

/** Lo imprescindible para recibir una reserva. Pagos online y cuotas NO bloquean: son condicionales. */
const IMPRESCINDIBLES: readonly IdPaso[] = ['salas', 'instructoras', 'tipos', 'horario'];

export function rutaPuestaEnMarcha(d: DatosRuta): RutaPuestaEnMarcha {
  const hecho: Record<IdPaso, boolean> = {
    estudio: d.estudio, salas: d.salas, instructoras: d.instructoras, tipos: d.tipos,
    'reglas-reserva': false, 'reglas-cancelacion': false,
    tarifas: d.tarifas, cobros: d.cobros, horario: d.horario, alumnas: d.alumnas, marca: d.marca, lanzamiento: d.primeraReserva,
  };
  const saltados = new Set(d.saltados ?? []);
  const saltado = (p: PasoRuta) => !hecho[p.id] && p.saltable && saltados.has(p.id);
  const faltaAntes = (p: PasoRuta) => (p.requiere ?? []).filter(r => !hecho[r]);
  const idAhora = PASOS_RUTA.find(p => !hecho[p.id] && !saltado(p) && faltaAntes(p).length === 0)?.id ?? null;
  const base = PASOS_RUTA.map((p, i): PasoConEstado => ({
    ...p,
    numero: i + 1,
    faltaAntes: [],
    estado: hecho[p.id] ? 'hecho' : saltado(p) ? 'saltado' : p.id === idAhora ? 'ahora' : faltaAntes(p).length ? 'bloqueado' : 'pendiente',
  }));
  const pasos = base.map(p => ({ ...p, faltaAntes: faltaAntes(p).map(id => base.find(b => b.id === id)!) }));
  // Las revisiones nunca cuentan como hechas: el progreso son los pasos con dato.
  const contables = pasos.filter(p => !p.revision);
  const hechos = contables.filter(p => p.estado === 'hecho').length;
  const total = contables.length;
  const terminada = hechos === total;
  const ahora = pasos.find(p => p.estado === 'ahora') ?? null;
  const faltaParaAbrir = pasos.filter(p => IMPRESCINDIBLES.includes(p.id) && p.estado !== 'hecho');
  return {
    pasos,
    hechos,
    total,
    terminada,
    ahora,
    etiqueta: terminada ? `${total} de ${total} hechos` : `Paso ${(ahora?.numero ?? hechos + 1)} de ${pasos.length}`,
    corto: `${hechos}/${total}`,
    faltanBases: pasos.filter(p => (p.id === 'salas' || p.id === 'instructoras' || p.id === 'tipos') && p.estado !== 'hecho'),
    listoParaAbrir: faltaParaAbrir.length === 0,
    faltaParaAbrir,
  };
}

/** El paso que pide la dirección (`?paso=`), o el que toca. */
export function pasoPedido(ruta: RutaPuestaEnMarcha, id: string | null | undefined): PasoConEstado | null {
  return ruta.pasos.find(p => p.id === id) ?? ruta.ahora ?? ruta.pasos[ruta.pasos.length - 1] ?? null;
}

export const RUTA_GUIA = '/puesta-en-marcha';
export const hrefPaso = (id: IdPaso) => `${RUTA_GUIA}?paso=${id}`;

/** Para un estado vacío: qué base le falta a quien quiere programar una clase. `null` si ya tiene todo. */
export function siguienteBase(ruta: RutaPuestaEnMarcha): PasoConEstado | null {
  return ruta.faltanBases[0] ?? null;
}

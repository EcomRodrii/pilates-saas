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
  | 'salas' | 'instructoras' | 'tipos' | 'horario' | 'tarifas'
  | 'cobros' | 'marca' | 'alumnas' | 'compartir' | 'primera-reserva';

export type IconoPaso =
  | 'sala' | 'equipo' | 'clase' | 'calendario' | 'tarifa' | 'cobro' | 'marca' | 'alumnas' | 'compartir' | 'reserva';

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
  /** Lo que hace el paso ahí mismo. Sin botón, se marca solo (la primera reserva). */
  boton?: BotonPaso;
  /** Un segundo camino. */
  otro?: { label: string; href: string };
  /** Lo que se tarda. */
  minutos?: number;
  /** Se puede saltar sin que el estudio deje de poder recibir reservas. */
  saltable: boolean;
  /** Lo que se dice al saltarlo, si aplica. */
  siSaltas?: string;
  /** Cómo se llama lo hecho, para la lista («1 sala»). */
  hecho: string;
}

export const PASOS_RUTA: readonly PasoRuta[] = [
  {
    id: 'salas', icono: 'sala', titulo: 'Crea tu sala', minutos: 2, saltable: false,
    que: 'Una sala es el espacio donde das clase. Cada una tiene un aforo: las plazas que caben.',
    porque: 'El aforo de la sala es el límite de plazas de cada clase. Sin sala no se puede programar nada.',
    como: ['Ponle un nombre (por ejemplo «Sala Reformer»).', 'Di cuántas personas caben.', 'Si das clase en un solo espacio, con una sala vale.'],
    boton: { label: 'Crear mi sala', href: '/configuracion?tab=estudio&abrir=salas' },
    hecho: 'Ya tienes sala',
  },
  {
    id: 'instructoras', icono: 'equipo', titulo: 'Añade a quien da las clases', minutos: 2, saltable: false,
    que: 'Una instructora es la persona asignada a cada clase. Si das tú las clases, eres tú.',
    porque: 'Toda clase necesita a alguien asignado: así se sabe quién la da y se pueden avisar sustituciones.',
    como: ['Escribe su nombre y su correo.', 'No hace falta que tenga cuenta para aparecer en el horario.', 'Puedes invitarla a la app del equipo cuando quieras.'],
    boton: { label: 'Añadir instructora', href: '/equipo?nuevo=1' },
    hecho: 'Ya tienes instructora',
  },
  {
    id: 'tipos', icono: 'clase', titulo: 'Crea tu primer tipo de clase', minutos: 2, saltable: false,
    que: 'Un tipo de clase es una plantilla: Reformer, Mat, Prenatal… con su duración y su descripción.',
    porque: 'Se define una vez y sirve para todo el horario. Tu clienta ve su nombre y su descripción al reservar.',
    como: ['Dale nombre y duración.', 'Añade una frase de qué se trabaja.', 'Empieza con uno; luego creas los que quieras.'],
    boton: { label: 'Crear tipo de clase', href: '/configuracion?tab=clases&abrir=tipos-de-clase' },
    hecho: 'Ya tienes tipo de clase',
  },
  {
    id: 'horario', icono: 'calendario', titulo: 'Programa tus clases', minutos: 3, saltable: false,
    que: 'Una clase es un tipo de clase en un día y una hora, en una sala y con una instructora.',
    porque: 'Sin clases en el calendario, la app de tus clientas no tiene nada que enseñar y nadie puede reservar.',
    como: ['Elige tipo, sala, instructora y hora.', 'Márcala como «Clase semanal» para que se repita sola cada semana.', 'Con una semana programada ya puedes recibir reservas.'],
    boton: { label: 'Programar una clase', href: '/calendario?nueva=1' },
    otro: { label: 'Importar mi horario', href: '/calendario/importar' },
    hecho: 'Ya tienes clases en el calendario',
  },
  {
    id: 'tarifas', icono: 'tarifa', titulo: 'Pon precio a tus clases', minutos: 4, saltable: true,
    que: 'Una tarifa es lo que paga tu clienta: una clase suelta, un bono de varias clases o una cuota mensual.',
    porque: 'Con tarifas, tu clienta compra desde su app y tú no vas cobrando clase a clase.',
    como: ['Empieza por una clase suelta o por un bono de 10.', 'Una cuota mensual sirve si quieres ingresos recurrentes.', 'Puedes cambiar los precios cuando quieras.'],
    boton: { label: 'Crear una tarifa', href: '/productos' },
    siSaltas: 'Tus clientas podrán reservar, pero tendrás que cobrar y apuntar los pagos a mano.',
    hecho: 'Ya tienes tarifas',
  },
  {
    id: 'cobros', icono: 'cobro', titulo: 'Decide cómo cobras', minutos: 5, saltable: true,
    que: 'Puedes cobrar en el estudio (efectivo, datáfono, Bizum) o con tarjeta online conectando Stripe.',
    porque: 'Para recibir reservas NO hace falta Stripe. Solo si quieres que tus clientas paguen con tarjeta desde su app.',
    como: ['Si cobras en el estudio, salta este paso.', 'Si quieres cobrar online, conecta Stripe: tarda unos minutos.', 'Tentare no toca tu dinero: va a tu cuenta.'],
    boton: { label: 'Conectar Stripe', href: '/configuracion?tab=conexiones#integracion-stripe' },
    siSaltas: 'Cobrarás en el estudio y lo apuntas en Tentare. Puedes conectar Stripe más adelante.',
    hecho: 'Ya cobras online',
  },
  {
    id: 'marca', icono: 'marca', titulo: 'Pon tu logo y tu color', minutos: 2, saltable: true,
    que: 'Tu logo y tu color son lo que ve tu clienta en su app y en tu página de reservas.',
    porque: 'Una app con tu marca se siente de tu estudio, no de un programa. Genera confianza al reservar y pagar.',
    como: ['Sube tu logo.', 'Elige tu color principal.', 'Mira cómo queda en la vista previa antes de guardar.'],
    boton: { label: 'Personalizar mi app', href: '/configuracion?tab=marca' },
    siSaltas: 'Tu app saldrá con los colores de serie. Puedes cambiarlos cuando quieras.',
    hecho: 'Ya es tu marca',
  },
  {
    id: 'alumnas', icono: 'alumnas', titulo: 'Trae a tus clientas', minutos: 3, saltable: false,
    que: 'Una ficha es una clienta: su correo, su teléfono y su historial de clases.',
    porque: 'Las clientas con ficha entran a la app con su correo. Si ya las tienes en otro programa, no empiezas de cero.',
    como: ['Importa el Excel o el archivo de tu programa anterior.', 'O dalas de alta una a una con su correo.', 'No hace falta que todas estén desde el primer día.'],
    boton: { label: 'Importar mis clientas', href: '/migracion' },
    otro: { label: 'Añadir una', href: '/clientas?nuevo=1' },
    hecho: 'Ya tienes clientas',
  },
  {
    id: 'compartir', icono: 'compartir', titulo: 'Comparte el enlace de tu app', minutos: 2, saltable: false,
    que: 'Tu enlace lleva a la app de tu estudio: tus clientas la abren desde el móvil y reservan.',
    porque: 'Es lo que convierte todo lo anterior en reservas. Sin que lo sepan, nadie entra.',
    como: ['Mándalo por WhatsApp a tus clientas.', 'Ponlo en tu Instagram.', 'Deja el QR en recepción.'],
    boton: { label: 'Compartir mi enlace', abre: 'compartir' },
    hecho: 'Ya has compartido tu enlace',
  },
  {
    id: 'primera-reserva', icono: 'reserva', titulo: 'Recibe tu primera reserva', saltable: false,
    que: 'Se marca sola cuando una clienta reserve desde tu app.',
    porque: 'Es el momento en que Tentare empieza a trabajar por ti: avisos, listas, cobros.',
    como: ['Escribe a tus clientas con el enlace.', 'Pide a una amiga que pruebe a reservar.', 'Si algo no funciona, escríbenos: te responde una persona.'],
    hecho: 'Ya has recibido tu primera reserva',
  },
];

/** Los datos reales de los que sale qué está hecho: los pasa quien llama. */
export interface DatosRuta {
  salas: boolean;
  instructoras: boolean;
  tipos: boolean;
  horario: boolean;
  tarifas: boolean;
  cobros: boolean;
  marca: boolean;
  alumnas: boolean;
  compartir: boolean;
  primeraReserva: boolean;
  /** Los pasos que saltó (solo vale en los saltables). */
  saltados?: readonly string[];
}

export type EstadoPaso = 'hecho' | 'ahora' | 'pendiente' | 'saltado';

export interface PasoConEstado extends PasoRuta {
  estado: EstadoPaso;
  numero: number;
}

export interface RutaPuestaEnMarcha {
  pasos: PasoConEstado[];
  hechos: number;
  total: number;
  terminada: boolean;
  /** El que se ofrece: el primero sin hacer y sin saltar. */
  ahora: PasoConEstado | null;
  /** «Paso 4 de 10» / «10 de 10 hechos». */
  etiqueta: string;
  /** «4/10». */
  corto: string;
  /** ¿Falta alguna de las bases (sala, instructora, tipo de clase) para programar? */
  faltanBases: PasoConEstado[];
}

export function rutaPuestaEnMarcha(d: DatosRuta): RutaPuestaEnMarcha {
  const hecho: Record<IdPaso, boolean> = {
    salas: d.salas, instructoras: d.instructoras, tipos: d.tipos, horario: d.horario, tarifas: d.tarifas,
    cobros: d.cobros, marca: d.marca, alumnas: d.alumnas, compartir: d.compartir, 'primera-reserva': d.primeraReserva,
  };
  const saltados = new Set(d.saltados ?? []);
  const saltado = (p: PasoRuta) => !hecho[p.id] && p.saltable && saltados.has(p.id);
  const idAhora = PASOS_RUTA.find(p => !hecho[p.id] && !saltado(p))?.id ?? null;
  const pasos: PasoConEstado[] = PASOS_RUTA.map((p, i) => ({
    ...p,
    numero: i + 1,
    estado: hecho[p.id] ? 'hecho' : p.id === idAhora ? 'ahora' : saltado(p) ? 'saltado' : 'pendiente',
  }));
  const hechos = pasos.filter(p => p.estado === 'hecho').length;
  const total = pasos.length;
  const terminada = hechos === total;
  const ahora = pasos.find(p => p.estado === 'ahora') ?? null;
  return {
    pasos,
    hechos,
    total,
    terminada,
    ahora,
    etiqueta: terminada ? `${total} de ${total} hechos` : `Paso ${(ahora?.numero ?? hechos + 1)} de ${total}`,
    corto: `${hechos}/${total}`,
    faltanBases: pasos.filter(p => (p.id === 'salas' || p.id === 'instructoras' || p.id === 'tipos') && p.estado !== 'hecho'),
  };
}

/** El paso que pide la dirección (`?paso=`), o el que toca. */
export function pasoPedido(ruta: RutaPuestaEnMarcha, id: string | null | undefined): PasoConEstado | null {
  return ruta.pasos.find(p => p.id === id) ?? ruta.ahora ?? ruta.pasos[ruta.pasos.length - 1] ?? null;
}

export const RUTA_GUIA = '/puesta-en-marcha';
export const hrefPaso = (id: IdPaso) => `${RUTA_GUIA}?paso=${id}`;

/**
 * Para un estado vacío: qué le falta a quien quiere programar una clase y a dónde ir.
 * Devuelve `null` si ya tiene todo lo necesario.
 */
export function siguienteBase(ruta: RutaPuestaEnMarcha): PasoConEstado | null {
  return ruta.faltanBases[0] ?? null;
}

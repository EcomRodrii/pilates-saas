// Modelo de dominio de la Student PWA.
//
// LITERAL de `types/index.ts` del paquete de diseño: es el contrato que las 21
// pantallas dan por bueno, así que se copia sin retocar. Traducir de las filas
// reales de Supabase a ESTOS tipos es trabajo del adaptador (lib/student/datos.ts),
// no de las pantallas.
//
// Lo que NO está aquí y el backend sí tiene —recuperaciones, plazas fijas,
// penalizaciones, citas 1:1, retos, comunidad— se añade cuando su pantalla
// entre, no antes.

export type Disciplina = 'Pilates' | 'Yoga';

export interface StudioConfig {
  slug: string; nombre: string; ciudad: string; direccion: string;
  logoUrl: string | null; iconoUrl: string; fotoPortada: string;
  telefono: string; email: string; disciplinas: Disciplina[];
  politicaCancelacionHoras: number; soportaListaEspera: boolean;
  tema: Record<string, string>;
}

export interface Alumna { id: string; nombre: string; apellidos: string; email: string; telefono?: string; fotoUrl?: string | null; }

export interface Instructora {
  id: string; nombre: string; iniciales: string; fotoUrl: string | null; especialidades: string[];
  /** Media, solo con ≥5 votos (ver mapeo). */
  rating?: number;
  /** Cuántas valoraciones respaldan la media. */
  valoraciones?: number;
  bio?: string;
}

export type NivelClase = 'Todos' | 'Iniciación' | 'Medio' | 'Avanzado';

export interface Clase {
  id: string;
  /** Tipo de clase (Reformer, Mat…): es la unidad de «favorita». */
  tipoClaseId: string;
  /** Ventana de cancelación propia de este tipo de clase; `null` = la del estudio. */
  ventanaCancelacionHoras: number | null;
  fecha: string;            // ISO date YYYY-MM-DD
  hora: string;             // HH:mm
  duracionMin: number;
  nombre: string;
  tipo: string;             // Reformer · Mat · Yoga Flow…
  disciplina: Disciplina;
  nivel: NivelClase;
  instructoraId: string;
  sala: string;
  /**
   * Id de la sala. `sala` es solo su NOMBRE, y con un nombre no se pueden
   * buscar los huecos de esa sala: `spots` los cuelga de `salaId`.
   */
  salaId: string;
  capacidad: number;
  plazasLibres: number;
  precioSuelto: number;     // € si no hay bono
  /** `true` si el estudio NO vende clases sueltas — distinto de «cuesta 0 €». */
  sinPrecioSuelto?: boolean;
  /** Banner ancho de la cabecera. Hereda: sala → tipo de clase → estudio. */
  fotoUrl: string;
  /**
   * Logo CUADRADO del tipo de clase, para la fila del horario.
   *
   * No hereda de nada, a diferencia de `fotoUrl`: un logo identifica a la
   * clase, así que el del estudio o el de la sala no valdrían — se vería el
   * mismo icono en todas las filas, que es peor que no ver ninguno.
   * `undefined` = esta clase no tiene logo y la fila se pinta como siempre.
   */
  logoUrl?: string;
  descripcion?: string;
}

/** Disponibilidad tal y como la ve la alumna (derivada de Clase + sus reservas). */
export type Disponibilidad = 'disponible' | 'pocas' | 'completa' | 'lista-espera' | 'reservada' | 'no-disponible';

export type EstadoReserva = 'confirmada' | 'cancelada' | 'asistida' | 'no-asistida' | 'en-espera';

export interface Reserva {
  id: string; claseId: string; alumnaId: string; estado: EstadoReserva;
  creadaEn: string;
  bonoId?: string; posicionEspera?: number;
  /**
   * P-5 (auditoría 23ª pasada): si no es `undefined` y `estado === 'en-espera'`,
   * hay una oferta de plaza viva hasta esta hora ISO — hay que aceptarla o se
   * pierde el sitio entero (no se reordena "al final de la cola", lo decide el
   * servidor). `undefined` = en cola normal, sin oferta.
   */
  ofertaExpiraEn?: string;
}

export type EstadoBono = 'activo' | 'agotado' | 'expirado';
export interface Bono {
  id: string; nombre: string; creditosTotales: number; creditosUsados: number;
  compradoEn: string; expiraEn: string | null; estado: EstadoBono; precio: number;
  /** Tipos de clase que cubre. Vacío = todos (misma regla que el servidor). */
  tiposClaseIds?: string[];
}

/**
 * `pending` y `processing` NO son lo mismo, y colapsarlos mentía:
 *   · `pending`    — recibo emitido y todavía sin cobrar. Nadie está cobrando
 *                    nada; o lo cobra el estudio, o lo reintenta el dunning.
 *   · `processing` — adeudo EN VUELO (SEPA). El banco puede devolverlo.
 */
export type EstadoPago = 'pending' | 'processing' | 'success' | 'failed' | 'cancelled' | 'refunded';
export interface Pago { id: string; concepto: string; importe: number; fecha: string; estado: EstadoPago; metodo: string; bonoId?: string; }

export interface Notificacion { id: string; tipo: 'plaza-liberada' | 'recordatorio' | 'bono' | 'estudio' | 'valorar'; titulo: string; cuerpo: string; fecha: string; leida: boolean; enlace?: string; }

/** Todo lo que la alumna ve de gamificación (lib/student/gamificacion.ts). */
export interface GamificacionVista {
  /** `false` = el estudio no la usa: no se pinta nada. */
  hay: boolean;
  saldo: number; totalGanado: number; totalCanjeado: number;
  nivel: import('./gamificacion.ts').NivelVista;
  logros: import('./gamificacion.ts').LogroVista[];
  retos: import('./gamificacion.ts').RetoVista[];
  recompensas: import('./gamificacion.ts').RecompensaVista[];
}

/** Plaza fija vigente de la alumna, ya con nombres (F2). */
export interface PlazaFijaVista {
  diaSemana: number; hora: string; sala: string; tipo: string | null; estado: 'ACTIVA' | 'PAUSADA';
  proximaFecha: string | null; vigenciaHasta: string | null;
}
export interface RecuperacionesVista { disponibles: number; proximaCaducidad: string | null }
/** Publicación del tablón del estudio (`posts_comunidad`), ya filtrada por audiencia en el servidor. */
export interface Post {
  id: string; texto: string; imagenUrl: string | null; autorNombre: string; autorInicial: string;
  creadoEn: string; likes: number; tipo: 'TEXTO' | 'EVENTO';
  eventoFecha: string | null; eventoAforo: number | null; eventoLugar: string | null;
  /** Solo eventos: asistentes confirmadas. */
  totalAsistentes?: number;
  /** Solo eventos: si ESTA socia ya está apuntada. */
  apuntada: boolean;
  /** Si ESTA socia ya le ha dado a "me gusta". */
  likedByMe: boolean;
  comentariosCount: number;
}

/** Un comentario del hilo de un post (`comentarios_comunidad`). */
export interface ComentarioTablon {
  id: string; postId: string; autorNombre: string; autorInicial: string | null;
  texto: string; creadoEn: string; esMio: boolean;
}

/** Máquina de estados de reserva (ver lib/booking-machine.ts). */
export type BookingState =
  | 'idle' | 'reviewing' | 'submitting'
  | 'confirmed' | 'waitlisted'
  | 'full' | 'conflict' | 'duplicate' | 'session-expired' | 'offline' | 'error';

/** Estados de datos para cualquier vista. */
export type ViewState = 'loading' | 'ready' | 'empty' | 'error' | 'offline';

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

export interface Instructora { id: string; nombre: string; iniciales: string; fotoUrl: string | null; especialidades: string[]; rating?: number; bio?: string; }

export type NivelClase = 'Todos' | 'Iniciación' | 'Medio' | 'Avanzado';

export interface Clase {
  id: string;
  /** Tipo de clase (Reformer, Mat…): es la unidad de «favorita». */
  tipoClaseId: string;
  fecha: string;            // ISO date YYYY-MM-DD
  hora: string;             // HH:mm
  duracionMin: number;
  nombre: string;
  tipo: string;             // Reformer · Mat · Yoga Flow…
  disciplina: Disciplina;
  nivel: NivelClase;
  instructoraId: string;
  sala: string;
  capacidad: number;
  plazasLibres: number;
  precioSuelto: number;     // € si no hay bono
  /** `true` si el estudio NO vende clases sueltas — distinto de «cuesta 0 €». */
  sinPrecioSuelto?: boolean;
  fotoUrl: string;
  descripcion?: string;
}

/** Disponibilidad tal y como la ve la alumna (derivada de Clase + sus reservas). */
export type Disponibilidad = 'disponible' | 'pocas' | 'completa' | 'lista-espera' | 'reservada' | 'no-disponible';

export type EstadoReserva = 'confirmada' | 'cancelada' | 'asistida' | 'no-asistida' | 'en-espera';

export interface Reserva {
  id: string; claseId: string; alumnaId: string; estado: EstadoReserva;
  creadaEn: string; pagadaCon: 'bono' | 'suelto' | 'plan';
  bonoId?: string; posicionEspera?: number;
}

export type EstadoBono = 'activo' | 'agotado' | 'expirado';
export interface Bono {
  id: string; nombre: string; creditosTotales: number; creditosUsados: number;
  compradoEn: string; expiraEn: string | null; estado: EstadoBono; precio: number;
}

export type EstadoPago = 'processing' | 'success' | 'failed' | 'cancelled' | 'refunded';
export interface Pago { id: string; concepto: string; importe: number; fecha: string; estado: EstadoPago; metodo: string; bonoId?: string; }

export interface Notificacion { id: string; tipo: 'plaza-liberada' | 'recordatorio' | 'bono' | 'estudio' | 'valorar'; titulo: string; cuerpo: string; fecha: string; leida: boolean; enlace?: string; }

/** Máquina de estados de reserva (ver lib/booking-machine.ts). */
export type BookingState =
  | 'idle' | 'reviewing' | 'submitting'
  | 'confirmed' | 'waitlisted'
  | 'full' | 'conflict' | 'duplicate' | 'session-expired' | 'offline' | 'error';

/** Estados de datos para cualquier vista. */
export type ViewState = 'loading' | 'ready' | 'empty' | 'error' | 'offline';

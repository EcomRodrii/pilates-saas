// «Tus alumnas» de la instructora en la app del estudio: tipos y reglas PURAS
// (sin imports), compartidas por el servidor y las pantallas.
//
// Qué es «su alumna» NO se decide aquí: es `instructoraAtiendeSocia`
// (lib/datos-salud/acceso-instructora.ts), la misma regla que la salud, para
// que la ficha y los datos de salud nunca digan cosas distintas.
//
// Lo mínimo (decisión del 14-sep-2026): nombre e inicial del apellido, foto,
// sus clases con ELLA y si es su primera clase en el estudio. Nada de contacto,
// pagos, bonos, contrato ni clases con otras instructoras.

/** Cómo va una clase suya con esta alumna. */
export type EstadoClaseAlumna = 'viene' | 'en-espera' | 'pendiente' | 'asistio' | 'no-vino' | 'sin-marcar';

/**
 * Del estado de la reserva a lo que ve la instructora. `null` = no cuenta (la
 * canceló). Una CONFIRMADA de una clase que ya empezó y nadie marcó es
 * «sin marcar», no «viene».
 */
export function estadoClaseAlumna(estadoReserva: string, inicioIso: string, ahoraMs: number): EstadoClaseAlumna | null {
  switch (estadoReserva) {
    case 'CANCELADA': return null;
    case 'LISTA_ESPERA': return 'en-espera';
    case 'PENDIENTE_APROBACION': return 'pendiente';
    case 'ASISTIDA': return 'asistio';
    case 'NO_ASISTIO': return 'no-vino';
    case 'CONFIRMADA': return Date.parse(inicioIso) > ahoraMs ? 'viene' : 'sin-marcar';
    default: return null;
  }
}

export function textoEstadoClaseAlumna(estado: EstadoClaseAlumna): string {
  switch (estado) {
    case 'viene': return 'Viene';
    case 'en-espera': return 'En lista de espera';
    case 'pendiente': return 'Pendiente de aprobar';
    case 'asistio': return 'Vino';
    case 'no-vino': return 'No vino';
    case 'sin-marcar': return 'Sin marcar';
  }
}

export interface ClaseConAlumna {
  sesionId: string;
  inicio: string;
  fecha: string;
  hora: string;
  tipo: string;
  estado: EstadoClaseAlumna;
}

export interface AlumnaResumen {
  socioId: string;
  /** Nombre e inicial del apellido (`nombresParaLista`). */
  nombre: string;
  fotoUrl: string | null;
  /** Todavía no ha venido a ninguna clase del estudio. */
  primeraClase: boolean;
  /** Su próxima clase con esta instructora, si la hay. */
  proxima: ClaseConAlumna | null;
}

export interface FichaAlumna {
  socioId: string;
  nombre: string;
  fotoUrl: string | null;
  primeraClase: boolean;
  /** Si usa la app: sin cuenta no puede recibir mensajes. */
  tieneCuenta: boolean;
  /** Las que aún no han empezado, de la más próxima a la más lejana. */
  proximas: ClaseConAlumna[];
  /** Las que ya empezaron, de la más reciente a la más antigua. */
  pasadas: ClaseConAlumna[];
}

export function repartirClases(clases: readonly ClaseConAlumna[], ahoraMs: number): { proximas: ClaseConAlumna[]; pasadas: ClaseConAlumna[] } {
  const proximas = clases.filter((c) => Date.parse(c.inicio) > ahoraMs)
    .sort((a, b) => Date.parse(a.inicio) - Date.parse(b.inicio));
  const pasadas = clases.filter((c) => Date.parse(c.inicio) <= ahoraMs)
    .sort((a, b) => Date.parse(b.inicio) - Date.parse(a.inicio));
  return { proximas, pasadas };
}

/** Primero quien viene antes; quien no tiene clase próxima, al final y por nombre. */
export function ordenarAlumnas<T extends { nombre: string; proxima: { inicio: string } | null }>(alumnas: readonly T[]): T[] {
  return [...alumnas].sort((a, b) => {
    if (a.proxima && b.proxima) return Date.parse(a.proxima.inicio) - Date.parse(b.proxima.inicio);
    if (a.proxima) return -1;
    if (b.proxima) return 1;
    return a.nombre.localeCompare(b.nombre, 'es');
  });
}

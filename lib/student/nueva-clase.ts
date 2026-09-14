// «Nueva clase» de la instructora en la app del estudio: tipos y reglas PURAS
// (sin imports), compartidas por el servidor y la pantalla.
//
// Lo decide el estudio (`studios.instructoras_crean_clases`, migr
// 20260914104856): con el ajuste apagado la instructora solo tiene las clases que
// le asignan. Sus clases van siempre a su nombre, sueltas (sin serie) y sin
// precio puntual, igual que exige la RLS.

export interface TipoNuevaClase {
  id: string;
  nombre: string;
  color: string | null;
  duracionMin: number;
  /** Aforo que fija el tipo de clase; `null` = manda la sala. */
  aforo: number | null;
}

export interface SalaNuevaClase {
  id: string;
  nombre: string;
  capacidad: number | null;
}

export interface OpcionesNuevaClase {
  puedeCrear: boolean;
  tipos: TipoNuevaClase[];
  salas: SalaNuevaClase[];
}

export const NO_PUEDE_CREAR = 'Tu estudio asigna las clases: si necesitas una, pídesela al estudio.';

/**
 * Con cuánta antelación puede crear una clase. Sin tope, nada impedía llenar el
 * calendario de clases años hacia delante (cada una con su aviso a la
 * propietaria). Medio año cubre cualquier planificación real.
 */
export const MAX_DIAS_ANTELACION_NUEVA_CLASE = 180;

/**
 * Aforo de la clase nueva: el tipo de clase manda y, si no fija ninguno, la
 * sala. Espejo de `aforoPorDefectoDeSesion` (lib/aforo-logic.ts), que es el que
 * usa el servidor al crearla; aquí solo sirve para enseñarlo antes.
 */
export function aforoNuevaClase(tipo: { aforo: number | null }, sala: { capacidad: number | null }): number {
  return tipo.aforo ?? sala.capacidad ?? 8;
}

/**
 * Hora de fin ('HH:MM') sumando la duración del tipo, o `null` si terminaría a
 * medianoche o después. El panel la recortaba a las 23:59 sin avisar; aquí no se
 * crea una clase más corta de lo que dura.
 */
export function horaFinNuevaClase(hora: string, duracionMin: number): string | null {
  if (!/^\d{2}:\d{2}$/.test(hora) || !(duracionMin > 0)) return null;
  const [h, m] = hora.split(':').map(Number);
  const fin = h * 60 + m + duracionMin;
  if (fin >= 24 * 60) return null;
  return `${String(Math.floor(fin / 60)).padStart(2, '0')}:${String(fin % 60).padStart(2, '0')}`;
}

export function resumenNuevaClase(p: { duracionMin: number; horaFin: string | null; aforo: number }): string {
  if (!p.horaFin) return 'Terminaría pasada la medianoche: elige una hora antes.';
  return `${p.duracionMin} min · termina a las ${p.horaFin} · ${p.aforo} ${p.aforo === 1 ? 'plaza' : 'plazas'}`;
}

/**
 * Qué ha chocado, según la restricción que devuelve Postgres (23P01): la de la
 * instructora (0048) o la de la sala (0074). Sin reconocerla, un mensaje que no
 * culpa a ninguna de las dos.
 */
export function mensajeSolapeNuevaClase(detalle: string): string {
  if (detalle.includes('sesiones_instructor_sin_solape')) return 'Ya tienes una clase a esa hora. Elige otro hueco.';
  if (detalle.includes('sesiones_sala_sin_solape')) return 'La sala está ocupada a esa hora. Elige otra sala u otra hora.';
  return 'Esa hora choca con otra clase. Elige otro hueco.';
}

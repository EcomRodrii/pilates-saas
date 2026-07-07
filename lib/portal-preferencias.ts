import type { DiaSemana, FranjaHoraria, Disponibilidad, NivelSocio } from '@/lib/types';

export const DIAS_SEMANA: { id: DiaSemana; label: string }[] = [
  { id: 'lunes', label: 'Lunes' },
  { id: 'martes', label: 'Martes' },
  { id: 'miercoles', label: 'Miércoles' },
  { id: 'jueves', label: 'Jueves' },
  { id: 'viernes', label: 'Viernes' },
  { id: 'sabado', label: 'Sábado' },
  { id: 'domingo', label: 'Domingo' },
];

export const FRANJAS: { id: FranjaHoraria; label: string }[] = [
  { id: 'manana', label: 'Mañana' },
  { id: 'tarde', label: 'Tarde' },
  { id: 'noche', label: 'Noche' },
];

export const NIVELES: { id: NivelSocio; label: string }[] = [
  { id: 'PRINCIPIANTE', label: 'Principiante' },
  { id: 'INTERMEDIO', label: 'Intermedio' },
  { id: 'AVANZADO', label: 'Avanzado' },
];

export const DURACIONES = [30, 45, 60];

// Deja huecos vacíos (todo a false) cuando la socia todavía no ha guardado
// ninguna preferencia — así el grid siempre puede pintar las 21 casillas
// sin comprobaciones de undefined desperdigadas por el componente.
export function disponibilidadVacia(): Disponibilidad {
  return DIAS_SEMANA.reduce((acc, { id }) => {
    acc[id] = { manana: false, tarde: false, noche: false };
    return acc;
  }, {} as Disponibilidad);
}

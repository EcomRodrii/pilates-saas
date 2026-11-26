import { cn } from '@/lib/utils';
import { Hero3D, type Escena3D } from './hero-3d';

// ─────────────────────────────────────────────────────────────────────────────
// La imagen de un estado vacío (`EmptyState escena=…`, solo en el marco nuevo). Desde el 26-nov-2026 es la misma 3D
// que las pantallas vacías de los módulos (`hero-3d.tsx`): se retiraron los dibujos planos y las ilustraciones
// anteriores (decisión del fundador). Aquí solo se dice qué escena 3D corresponde a cada motivo.
// ─────────────────────────────────────────────────────────────────────────────

const ESCENAS = {
  /** Listas y tablas sin filas (salas…). */
  sinDatos: 'vacio',
  /** Búsqueda o filtro sin coincidencias. */
  busqueda: 'vacio',
  /** Imagen de relleno: foto, logo o portada sin subir. */
  relleno: 'vacio',
  permisos: 'vacio',
  /** Calendario, horario o bajas sin nada. */
  agenda: 'calendario',
  festivos: 'calendario',
  personas: 'clientes',
  /** Un gráfico o informe sin datos del periodo. */
  grafico: 'informes',
  /** Cobros, recibos o caja sin movimientos. */
  cobros: 'cobros',
  productos: 'paquetes',
  notificaciones: 'avisos',
  comunidad: 'mensajeria',
  resenas: 'mensajeria',
  automatizaciones: 'automatizaciones',
  integraciones: 'integraciones',
  /** Algo que no se ha podido cargar. */
  conexion: 'integraciones',
  error: 'integraciones',
} as const satisfies Record<string, Escena3D>;

export type NombreEscena = keyof typeof ESCENAS;

export function Escena({ nombre, className }: { nombre: NombreEscena; className?: string }) {
  return <Hero3D escena={ESCENAS[nombre]} className={cn('w-60 max-w-full shrink-0 max-md:w-64', className)} />;
}

import { Icono, type NombreIcono } from '@/components/student/ui/Icono';

/**
 * La baldosa de las filas con icono (Perfil, Ayuda; propuesta P15): 32 px con el
 * fondo `--muted` y el icono a 18 px en `--accent`, como las filas de Ajustes del
 * iPhone.
 *
 * ⚠️ Solo tokens, nunca un color fijo: la app es la del ESTUDIO, y sus ocho estilos
 * y el modo oscuro redefinen `--muted` y `--accent`. Un gris o un verde a mano se
 * vería bien en un estilo y desentonaría en los otros siete. Lo vigila
 * `lib/student/iconos-del-set.test.ts`.
 *
 * Es decorativa (`aria-hidden`): lo que la fila hace lo dice su texto.
 */
export function BaldosaIcono({ nombre }: { nombre: NombreIcono }) {
  return (
    <span
      aria-hidden
      data-baldosa={nombre}
      style={{
        width: 32, height: 32, borderRadius: 9, flexShrink: 0,
        background: 'var(--muted)', color: 'var(--accent)',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <Icono nombre={nombre} tamano={18} />
    </span>
  );
}

import { cn } from '@/lib/utils';
import type { Pieza } from '@/lib/calendario/tarjeta-clienta';

// Lo que la propietaria eligió ver debajo del nombre de cada alumna (P3.11):
// la MISMA pieza en la lista de la clase y en la vista previa de Configuración,
// para que lo que se ve al elegir sea lo que sale en el Calendario.
//
// Una etiqueta por dato: el texto de «con qué viene» ya lleva su propio «·»,
// así que separarlos con puntos los mezclaría. Texto siempre en `foreground`
// (el gris sobre gris no llega a AA a este tamaño); lo que hay que mirar antes
// de la clase va en negrita, con fondo de aviso y, para un lector de pantalla,
// con «Atención:» delante (el color solo no lo dice).

export function PiezasFila({ piezas, className }: { piezas: readonly Pieza[]; className?: string }) {
  if (piezas.length === 0) return null;
  return (
    <ul className={cn('mt-1 flex min-w-0 flex-wrap gap-1', className)} aria-label="Lo que conviene saber">
      {piezas.map(p => (
        <li
          key={p.clave}
          data-pieza={p.clave}
          title={p.texto}
          className={cn(
            'min-w-0 max-w-full break-words rounded-md border px-1.5 py-0.5 text-[12px] leading-snug text-foreground line-clamp-2',
            // En claro, `--muted` ya es beige: con solo un tinte de aviso, «Sin contestar» se
            // confundía con las demás (visto en captura a 375 px). El borde lo separa en los dos modos.
            p.aviso
              ? 'border-[color:color-mix(in_srgb,var(--warning)_55%,transparent)] bg-[color-mix(in_srgb,var(--warning)_20%,var(--card))] font-medium'
              : 'border-transparent bg-muted',
          )}
        >
          {p.aviso && <span className="sr-only">Atención: </span>}
          {p.texto}
        </li>
      ))}
    </ul>
  );
}

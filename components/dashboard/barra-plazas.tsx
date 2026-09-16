'use client';

// La comparten Inicio («Hoy en el estudio») y la ventana flotante del calendario:
// es la misma cifra, así que tiene que leerse igual en los dos sitios.

/** Aforo a golpe de vista. Con salas pequeñas (lo normal en pilates) una plaza
 *  por segmento se lee sin contar; a partir de 20 vuelve a ser una barra. */
export function BarraPlazas({ ocupadas, aforo }: { ocupadas: number; aforo: number }) {
  const lleno = aforo > 0 && ocupadas >= aforo;
  const color = lleno ? 'var(--brand)' : 'var(--brand-medio)';

  if (aforo > 0 && aforo <= 20) {
    return (
      <span className="mt-1.5 flex gap-[3px]" aria-hidden>
        {Array.from({ length: aforo }, (_, i) => (
          <span
            key={i}
            className="h-1.5 min-w-0 flex-1 rounded-[1px]"
            style={{ backgroundColor: i < ocupadas ? color : 'var(--muted)' }}
          />
        ))}
      </span>
    );
  }

  const pct = aforo > 0 ? Math.min(100, (ocupadas / aforo) * 100) : 0;
  return (
    <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
      <span className="block h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
    </span>
  );
}

'use client';

import { INSIGNIAS, insigniaOPorDefecto, resolverInsignia, type ClaveInsignia } from '@/lib/gamificacion/insignias';
import { cn } from '@/lib/utils';

// Las insignias 3D en el panel (lib/gamificacion/insignias.ts): la miniatura de
// una lista y el selector del formulario. Sustituye al campo de texto donde el
// estudio tecleaba un emoji, que cada móvil dibujaba a su manera.

/**
 * La insignia de un logro, reto o recompensa en su tarjeta. Con `porDefecto`, enseña lo MISMO que ve la alumna (un
 * emoji tecleado a mano cae a la insignia de su tipo); sin él, lo que no es insignia sale como texto.
 */
export function MiniaturaInsignia({ icono, porDefecto, tamano = 28 }: {
  icono: string | null | undefined; porDefecto?: ClaveInsignia; tamano?: number;
}) {
  const r = porDefecto ? insigniaOPorDefecto(icono, porDefecto) : resolverInsignia(icono);
  if (!r) return <span className="text-[18px] leading-none">{icono}</span>;
  // eslint-disable-next-line @next/next/no-img-element -- PNG estático servido desde /public
  return <img src={r.src} alt="" width={tamano} height={tamano} loading="lazy" decoding="async" className="object-contain" />;
}

const CLAVES = Object.keys(INSIGNIAS) as ClaveInsignia[];

/** Elegir la insignia. Si lo guardado era un emoji, queda marcada su equivalente (o ninguna). */
export function SelectorInsignia({ valor, onChange, etiqueta = 'Insignia' }: {
  valor: string;
  onChange: (clave: ClaveInsignia) => void;
  etiqueta?: string;
}) {
  const actual = resolverInsignia(valor)?.clave ?? null;
  return (
    <div role="radiogroup" aria-label={etiqueta} className="grid grid-cols-6 gap-1.5">
      {CLAVES.map((clave) => {
        const elegida = actual === clave;
        return (
          <button
            key={clave}
            type="button"
            role="radio"
            aria-checked={elegida}
            aria-label={INSIGNIAS[clave].nombre}
            title={INSIGNIAS[clave].nombre}
            onClick={() => onChange(clave)}
            className={cn(
              'flex size-11 items-center justify-center rounded-xl border transition-colors',
              elegida ? 'border-foreground bg-muted' : 'border-border hover:bg-muted/60',
            )}
          >
            <MiniaturaInsignia icono={clave} tamano={30} />
          </button>
        );
      })}
    </div>
  );
}

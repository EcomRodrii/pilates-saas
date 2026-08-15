'use client';

import { Lock } from 'lucide-react';
import { esBloqueFijo, esBloqueOcultable, getDefinicionBloque, type BloqueHome } from '@/lib/portal-home-bloques';
import { labelDe } from './portal-bloques-editor';

/**
 * El esquema de /reservar — el lienzo central cuando esa pantalla está
 * seleccionada en el editor a pantalla completa.
 *
 * Unificado con el constructor de bloques genérico (theme-editor-fullscreen.tsx,
 * `BloquesSeccionesList`/`BloquesConfigPanel` con `pantalla="reservar"`): el
 * reordenar/ocultar/añadir ya lo da ese editor, igual que en Inicio/Clases/
 * Bonos. Lo único propio de /reservar que sigue haciendo falta es ESTE
 * esquema, y por el mismo motivo que antes:
 *
 * NO es un iframe de `/reservar`: esa página enseñaría el orden PUBLICADO, y
 * mientras se edita aquí diría lo contrario de lo que se está haciendo. Un
 * esquema de la página no promete píxeles, pero lo que dice es cierto en todo
 * momento.
 */
export function ReservarEsquema({ bloques }: { bloques: BloqueHome[] }) {
  return (
    <div className="w-[360px] rounded-2xl border border-border bg-background p-4 space-y-2">
      <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Tu página de reservas</p>
      {bloques.map((b) => {
        const oculta = !!b.oculto;
        const fija = esBloqueFijo(b);
        const ocultable = esBloqueOcultable(b);
        const def = getDefinicionBloque(b.kind === 'sistema' ? b.sistemaId : b.kind);
        return (
          <div
            key={b.id}
            className={`rounded-xl px-3 py-3 border flex items-start gap-2 ${oculta
              ? 'border-dashed border-border bg-transparent'
              : fija ? 'border-dashed border-border bg-muted/40' : 'border-transparent bg-muted'}`}
          >
            {fija && <Lock size={13} className="flex-none text-muted-foreground mt-0.5" aria-hidden />}
            <div className="min-w-0">
              <p className={`text-[13px] font-semibold ${oculta ? 'text-muted-foreground/50 line-through' : 'text-foreground'}`}>
                {labelDe(b)}
              </p>
              <p className="text-[11px] text-muted-foreground/80">
                {oculta ? 'Oculta — no se ve' : fija ? (ocultable ? 'No cambia de sitio; se puede ocultar.' : 'Va siempre, y en su sitio.') : (def?.descripcion ?? '')}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

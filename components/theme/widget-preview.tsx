'use client';

// Vista previa del widget de reservas sobre un fondo claro y uno oscuro.
//
// ⚠️ Es el widget DE VERDAD, no una maqueta: un `<iframe>` a
// `/reservar/<slug>?embed=1` con los ajustes del BORRADOR pasados como
// parámetros. Los parámetros ya pisan lo guardado (ver `resolverApariencia`),
// así que se puede ver el cambio sin publicarlo — sin construir un canal de
// previsualización nuevo ni arriesgarse a que la maqueta y la página se
// separen, que es el fallo que este editor ya ha pagado una vez.
//
// Y sobre DOS fondos porque el ajuste que más importa es «transparente», y
// transparente no se puede juzgar contra un solo color: lo que se está
// decidiendo es si el widget funciona sobre la web del estudio, que puede ser
// clara u oscura.

import { useState } from 'react';

const FONDOS = [
  { id: 'claro', label: 'Claro', css: '#FFFFFF' },
  { id: 'oscuro', label: 'Oscuro', css: '#12131A' },
] as const;

export function WidgetPreview({
  slug, fondo, fuente, ocultarPie, soloPestana,
}: {
  slug: string | null | undefined;
  fondo: string | null;
  fuente: string | null;
  ocultarPie: boolean;
  soloPestana: boolean;
}) {
  const [cual, setCual] = useState<'claro' | 'oscuro'>('claro');

  if (!slug) return null;

  const p = new URLSearchParams({ embed: '1', tab: 'clases' });
  if (fondo) p.set('fondo', fondo);
  if (fuente) p.set('fuente', fuente);
  // Siempre explícitos: sin ellos, la vista previa enseñaría lo GUARDADO y no
  // lo que se está tocando. `pie` va invertido porque el parámetro se llama por
  // lo que se ve, no por la variable.
  p.set('pie', ocultarPie ? '0' : '1');
  p.set('solo-pestana', soloPestana ? '1' : '0');

  const activo = FONDOS.find((f) => f.id === cual)!;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Vista previa</span>
        <div className="flex rounded-lg border border-border overflow-hidden">
          {FONDOS.map((f) => (
            <button
              key={f.id} type="button" onClick={() => setCual(f.id)}
              aria-pressed={cual === f.id}
              className={`px-2.5 py-1 text-[11px] font-medium ${cual === f.id ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <div style={{ background: activo.css, borderRadius: 12, padding: 10, border: '1px solid var(--border)' }}>
        {/* `key` con la URL entera: al cambiar un ajuste hay que RECARGAR el
            iframe, y cambiar solo `src` no siempre lo hace remontar. Sin esto,
            la vista previa se queda en el estado anterior y miente. */}
        <iframe
          key={`${p.toString()}-${cual}`}
          src={`/reservar/${slug}?${p.toString()}`}
          title="Vista previa del widget"
          style={{ width: '100%', height: 320, border: 0, display: 'block' }}
        />
      </div>
      <p className="text-[11px] text-muted-foreground">
        Es el widget de verdad, con lo que estás tocando. Prueba los dos fondos: si eliges
        «transparente», aquí verás el de tu web.
      </p>
      {/* ⚠️ Este aviso lo destapó la propia vista previa el primer día que
          existió: con el fondo transparente el TEXTO del widget sigue siendo
          oscuro, así que sobre una web oscura no se lee. Falta un control de
          color de texto; hasta que exista, se dice en vez de dejar que lo
          descubra publicando. */}
      {fondo === 'transparente' && (
        <p className="text-[11px] text-amber-700 dark:text-amber-500 leading-snug">
          Si tu web tiene el fondo oscuro, míralo en «Oscuro» antes de publicar: el texto del
          widget es oscuro y ahí todavía no se lee. Estamos con ello — mientras tanto, para una
          web oscura elige «Un color» claro.
        </p>
      )}
    </div>
  );
}

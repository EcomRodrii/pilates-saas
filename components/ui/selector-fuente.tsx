'use client';

// El selector de tipografía del widget: las familias que sirve Tentare, cada
// una escrita en su propia letra.
//
// Antes era un `<input type="text">` con el placeholder «Space Grotesk». Eso
// obligaba a saberse de memoria el nombre EXACTO de una familia de Google
// Fonts y a escribirlo sin una errata: «Playfair display» en minúscula no
// carga, y no había forma de enterarse desde el panel — el campo se guardaba
// tan contento y la fuente simplemente no aparecía en el widget.
//
// Se conserva el texto libre de antes por debajo (`FUENTE_VALIDA` no cambia),
// así que un estudio con una familia ya guardada fuera de la lista la sigue
// viendo en su código: aparece al final como «la tuya», con lo que pasará con
// ella. Quitarla habría cambiado el código de un widget en producción sin
// avisar.
//
// ⚠️ Solo se ofrecen las del catálogo que sirve Tentare (`familiaServida`,
// lib/widget/fuentes-nativa.ts), en la página de reservas y sin marco: ninguna
// de las dos le pide ya nada a Google (le daba la IP de cada visitante de su
// web), así que Inter, DM Sans, Playfair Display y Fraunces no llegarían a
// verse. Las muestras salen de las fuentes de la app (`next/font`): tampoco se
// pide el catálogo a Google para enseñarlas.

import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FUENTES_WIDGET, fuenteDelCatalogo, type FuenteCatalogo } from '@/lib/reservar/fuentes-catalogo';
import { familiaServida, letraNativa } from '@/lib/widget/fuentes-nativa';

/** Las del catálogo que sirve Tentare: las únicas que se ven. */
const FUENTES_SERVIDAS = FUENTES_WIDGET.filter(f => familiaServida(f.familia));

/** La muestra de cada una: las fuentes de la app, las mismas que pinta la vista previa. */
const muestra = (f: FuenteCatalogo) => letraNativa(f.familia, 'app').pila;

interface Props {
  etiqueta: string;
  ayuda?: string;
  /** La familia guardada, o `null` = «la de Tentare». */
  valor: string | null;
  onChange: (v: string | null) => void;
  /** Texto de la opción que deja el valor sin fijar. */
  etiquetaPorDefecto?: string;
  /** Lo que se lee bajo esa opción. Sin ella, nada. */
  pistaPorDefecto?: string;
  /**
   * Para la integración sin marco: cambia lo que se dice de una letra que
   * Tentare no sirve (allí se ve si su web ya la carga; en la página, no).
   */
  sinMarco?: boolean;
}

export function SelectorFuente({ etiqueta, ayuda, valor, onChange, etiquetaPorDefecto = 'La de Tentare', pistaPorDefecto, sinMarco = false }: Props) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  const idLista = useId();

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false); };
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('keydown', esc);
    };
  }, [abierto]);

  const delCatalogo = fuenteDelCatalogo(valor);
  const enCatalogo = delCatalogo && FUENTES_SERVIDAS.includes(delCatalogo) ? delCatalogo : null;
  // Una familia guardada a mano que no está en la lista (o una de las del
  // catálogo que Tentare no sirve, elegida antes de que dejáramos de pedirlas a
  // Google): se respeta y se enseña, nunca se descarta en silencio.
  const propia: FuenteCatalogo | null = valor && !enCatalogo
    ? {
        ...(delCatalogo ?? { familia: valor, etiqueta: valor, categoria: 'sans' }),
        // Figtree o Libre Caslon Text, escritas a mano, no están en la lista
        // pero Tentare sí las sirve: esas se ven.
        pista: familiaServida(valor)
          ? 'La que escribiste antes a mano.'
          : sinMarco
            ? 'No la servimos: solo se verá si tu web ya la carga.'
            : 'No la servimos: en su lugar se verá una del sistema.',
      }
    : null;
  const opciones = [...FUENTES_SERVIDAS, ...(propia ? [propia] : [])];
  const actual = enCatalogo ?? propia;

  return (
    <div className="space-y-1" ref={caja}>
      <span className="block text-[13px] font-medium text-foreground">{etiqueta}</span>
      <div className="relative">
        <button
          type="button"
          onClick={() => setAbierto(v => !v)}
          // El nombre accesible es la etiqueta del campo, no el valor actual:
          // sin esto, el único nombre del control sería la fuente elegida, y
          // ni un lector de pantalla ni un test podrían decir de qué campo es.
          aria-label={etiqueta}
          aria-haspopup="listbox"
          aria-expanded={abierto}
          aria-controls={abierto ? idLista : undefined}
          className="flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2 text-left"
        >
          <span
            className="truncate text-[14px] text-foreground"
            style={actual ? { fontFamily: muestra(actual) } : undefined}
          >
            {actual ? actual.etiqueta : etiquetaPorDefecto}
          </span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </button>

        {abierto && (
          <div
            id={idLista}
            role="listbox"
            aria-label={etiqueta}
            className="absolute z-50 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-border bg-popover p-1 shadow-lg"
          >
            <Opcion
              seleccionada={!actual}
              onClick={() => { onChange(null); setAbierto(false); }}
              nombre={etiquetaPorDefecto}
              pista={pistaPorDefecto}
            />
            {opciones.map(f => (
              <Opcion
                key={f.familia}
                seleccionada={actual?.familia === f.familia}
                onClick={() => { onChange(f.familia); setAbierto(false); }}
                nombre={f.etiqueta}
                pista={f.pista}
                familiaCss={muestra(f)}
              />
            ))}
          </div>
        )}
      </div>
      {ayuda && <span className="block text-[11px] text-muted-foreground">{ayuda}</span>}
    </div>
  );
}

function Opcion({ seleccionada, onClick, nombre, pista, familiaCss }: {
  seleccionada: boolean;
  onClick: () => void;
  nombre: string;
  pista?: string;
  familiaCss?: string;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={seleccionada}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-accent',
        seleccionada && 'bg-accent',
      )}
    >
      <span className="min-w-0 flex-1">
        {/* La muestra: el nombre escrito con la propia familia — que es la
            única forma de elegir una tipografía sin abrir otra pestaña. */}
        <span className="block truncate text-[15px] text-foreground" style={familiaCss ? { fontFamily: familiaCss } : undefined}>
          {nombre}
        </span>
        {pista && <span className="block truncate text-[11px] text-muted-foreground">{pista}</span>}
      </span>
      {seleccionada && <Check className="size-4 shrink-0 text-foreground" aria-hidden />}
    </button>
  );
}

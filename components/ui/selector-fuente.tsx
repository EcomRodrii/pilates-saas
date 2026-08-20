'use client';

// El selector de tipografía del widget: diez familias reales, cada una escrita
// en su propia letra.
//
// Antes era un `<input type="text">` con el placeholder «Space Grotesk». Eso
// obligaba a saberse de memoria el nombre EXACTO de una familia de Google
// Fonts y a escribirlo sin una errata: «Playfair display» en minúscula no
// carga, y no había forma de enterarse desde el panel — el campo se guardaba
// tan contento y la fuente simplemente no aparecía en el widget.
//
// Se conserva el texto libre de antes por debajo (`FUENTE_VALIDA` no cambia),
// así que un estudio con una familia ya guardada fuera del catálogo la sigue
// viendo y usando: aparece al final de la lista como «la tuya». Quitarla
// habría cambiado la tipografía de un widget en producción sin avisar.

import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  FUENTES_WIDGET, familiaCssCatalogo, fuenteDelCatalogo, urlCatalogoGoogle,
  type FuenteCatalogo,
} from '@/lib/reservar/fuentes-catalogo';

/**
 * Carga UNA vez por documento la hoja con las diez familias, para que la
 * muestra de cada opción se vea de verdad. Va por `document.head` y no por un
 * `<link>` en el JSX porque el selector se usa dos veces en la misma pantalla
 * (texto y titulares) y no tiene sentido pedirlo dos veces; el `id` hace de
 * candado.
 */
function useCatalogoCargado() {
  useEffect(() => {
    const ID = 'tentare-catalogo-fuentes';
    if (document.getElementById(ID)) return;
    const link = document.createElement('link');
    link.id = ID;
    link.rel = 'stylesheet';
    link.href = urlCatalogoGoogle();
    document.head.appendChild(link);
  }, []);
}

interface Props {
  etiqueta: string;
  ayuda?: string;
  /** La familia guardada, o `null` = «la de Tentare». */
  valor: string | null;
  onChange: (v: string | null) => void;
  /** Texto de la opción que deja el valor sin fijar. */
  etiquetaPorDefecto?: string;
}

export function SelectorFuente({ etiqueta, ayuda, valor, onChange, etiquetaPorDefecto = 'La de Tentare' }: Props) {
  useCatalogoCargado();
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

  const enCatalogo = fuenteDelCatalogo(valor);
  // Una familia guardada a mano que no está en las diez: se respeta y se
  // enseña, nunca se descarta en silencio.
  const propia: FuenteCatalogo | null = valor && !enCatalogo
    ? { familia: valor, etiqueta: valor, categoria: 'sans', pesos: [400, 500, 600, 700], pista: 'La que escribiste antes a mano.' }
    : null;
  const opciones = [...FUENTES_WIDGET, ...(propia ? [propia] : [])];
  const actual = enCatalogo ?? propia;

  return (
    <div className="space-y-1" ref={caja}>
      <span className="block text-[13px] font-medium text-foreground">{etiqueta}</span>
      <div className="relative">
        <button
          type="button"
          onClick={() => setAbierto(v => !v)}
          aria-haspopup="listbox"
          aria-expanded={abierto}
          aria-controls={abierto ? idLista : undefined}
          className="flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2 text-left"
        >
          <span
            className="truncate text-[14px] text-foreground"
            style={actual ? { fontFamily: familiaCssCatalogo(actual) } : undefined}
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
              pista="Instrument Sans, la que trae el widget."
            />
            {opciones.map(f => (
              <Opcion
                key={f.familia}
                seleccionada={actual?.familia === f.familia}
                onClick={() => { onChange(f.familia); setAbierto(false); }}
                nombre={f.etiqueta}
                pista={f.pista}
                familiaCss={familiaCssCatalogo(f)}
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
  pista: string;
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
        <span className="block truncate text-[11px] text-muted-foreground">{pista}</span>
      </span>
      {seleccionada && <Check className="size-4 shrink-0 text-foreground" aria-hidden />}
    </button>
  );
}

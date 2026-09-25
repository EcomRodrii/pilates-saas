import { etiquetaFija, type Genero } from '@/lib/genero';

/**
 * «Clienta fija» / «Cliente fijo»: al lado del nombre de quien tiene una plaza
 * fija (una plaza que no esté dada de baja).
 *
 * Existe porque en la lista de Clientas no se veía: quien es fija era igual que
 * quien no lo es, y para saberlo había que abrir su ficha una a una.
 *
 * Con el texto escrito y no solo un color o un icono: es una etiqueta que se lee,
 * también con lector de pantalla. Los tokens `bg-brand/10` + `text-brand-secondary`
 * son los mismos que ya usa la ficha para sus badges, y `--brand-secondary` se
 * deriva para ser legible sobre ese tinte.
 */
export function EtiquetaFija({ genero }: { genero?: Genero | null }) {
  return (
    <span
      data-testid="etiqueta-fija"
      className="shrink-0 rounded-full bg-brand/10 px-2 py-0.5 text-[10.5px] font-semibold leading-none text-brand-secondary"
    >
      {etiquetaFija(genero)}
    </span>
  );
}

import Link from 'next/link';
import { ACC } from '@/components/landing/theme';

// El marcado mínimo de los artículos de /recursos escritos como datos:
// **negrita** y [enlace](/ruta) o [enlace](https://…). Nada de HTML crudo ni
// dangerouslySetInnerHTML: el texto se trocea y se pinta como nodos de React.
// Lo que no encaja en esos dos patrones sale tal cual, como texto.

const RE = /(\*\*[^*]+\*\*|\[[^\]]+\]\([^)\s]+\))/g;
const ENLACE = /^\[([^\]]+)\]\(([^)\s]+)\)$/;

const estiloEnlace = { color: ACC, textDecoration: 'underline', textUnderlineOffset: 3 } as const;

export function TextoMarcado({ texto }: { texto: string }) {
  const partes = texto.split(RE).filter((p) => p !== '');
  return (
    <>
      {partes.map((p, i) => {
        if (p.startsWith('**') && p.endsWith('**') && p.length > 4) return <strong key={i}>{p.slice(2, -2)}</strong>;
        const m = p.match(ENLACE);
        if (m) {
          const [, etiqueta, url] = m;
          if (url.startsWith('/')) {
            // Las plantillas descargables son ficheros, no páginas: <a> normal.
            if (url.startsWith('/recursos/plantillas/')) return <a key={i} href={url} download style={estiloEnlace}>{etiqueta}</a>;
            return <Link key={i} href={url} style={estiloEnlace}>{etiqueta}</Link>;
          }
          return <a key={i} href={url} target="_blank" rel="noopener noreferrer" style={estiloEnlace}>{etiqueta}</a>;
        }
        return <span key={i}>{p}</span>;
      })}
    </>
  );
}

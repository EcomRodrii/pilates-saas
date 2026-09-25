import { altoPortada, anchosPortada, rutaPortada, type FormatoPortada, type PortadaRecursos as Portada } from '@/lib/recursos/guias';

// La foto grande con la que abre un artículo de /recursos, con su crédito.
// Mismo criterio que PortadaRecursos (AVIF con WebP de respaldo, sin
// next/image), pero con todos los anchos que la portada pide: el cuerpo del
// artículo mide 720 px y en pantallas de doble densidad tira del de 1200.
// Es la imagen más grande del primer pantallazo: `eager` y prioridad alta.

const srcSet = (p: Portada, formato: FormatoPortada) =>
  anchosPortada(p).map((a) => `${rutaPortada(p, a, formato)} ${a}w`).join(', ');

const SIZES = '(max-width: 760px) calc(100vw - 40px), 720px';

export function PortadaCabecera({ portada }: { portada: Portada }) {
  const mayor = Math.max(...anchosPortada(portada));
  const { autor, fuente, url } = portada.credito;
  return (
    <figure style={{ margin: '0 0 28px' }}>
      <picture>
        <source type="image/avif" srcSet={srcSet(portada, 'avif')} sizes={SIZES} />
        <img
          src={rutaPortada(portada, mayor, 'webp')}
          srcSet={srcSet(portada, 'webp')}
          sizes={SIZES}
          width={mayor}
          height={altoPortada(portada, mayor)}
          alt={portada.alt}
          loading="eager"
          fetchPriority="high"
          style={{ display: 'block', width: '100%', height: 'auto', borderRadius: 16, background: '#E9EBDF' }}
        />
      </picture>
      <figcaption style={{ fontSize: 12, color: '#6B6B63', marginTop: 8 }}>
        Foto: {url ? <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit' }}>{autor}</a> : autor} en {fuente}
      </figcaption>
    </figure>
  );
}

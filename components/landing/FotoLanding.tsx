import { altoDe, rutaFoto, type FormatoFoto, type FotoRegistrada, type NombreRecorte, type RecorteFoto } from './fotos';

// Una foto de la home, servida tal cual la dejó `scripts/fotos-landing.mjs`.
//
// ⚠️ Con `<picture>` y no con `next/image`, a propósito:
//  · la cuota de optimización de Vercel Hobby son 5.000 transformaciones al mes
//    y, al pasarse, las imágenes nuevas devuelven 402 y se ve el `alt`; estas ya
//    vienen en AVIF y WebP a sus anchos, así que no hay nada que transformar;
//  · la dirección de arte —un recorte para escritorio y otro para móvil—
//    `next/image` solo la hace a mano, con `getImageProps` y dos llamadas.
//
// ESLint no pide `next/image` aquí: la regla `no-img-element` de Next ya da por
// bueno un <img> dentro de <picture>.
//
// ⚠️ Una sola foto `prioritaria` por página: la del primer pantallazo. Va
// `eager` + `fetchpriority="high"` y nada más (ni `preload` ni el `priority`
// obsoleto de Next 16): dentro de un `<picture>` React no inyecta el
// `<link rel="preload">` de las imágenes no perezosas, y es lo que queremos —
// ese preload pediría la WebP aunque el navegador acabe usando la AVIF.

interface Props {
  foto: FotoRegistrada;
  /** `sizes` real de cada recorte: lo que mide la foto en pantalla en cada caso. */
  sizes: { escritorio: string; movil?: string };
  /** Cuándo se usa el recorte móvil: la misma media query con la que cambia el layout. */
  mediaMovil: string;
  prioritaria?: boolean;
  className?: string;
}

function srcSet(foto: FotoRegistrada, nombre: NombreRecorte, recorte: RecorteFoto, formato: FormatoFoto): string {
  return recorte.anchos.map((a) => `${rutaFoto(foto, nombre, a, formato)} ${a}w`).join(', ');
}

/** El ancho de respaldo para `src`: el mayor que no pase de 1280, o el menor. */
function anchoRespaldo(recorte: RecorteFoto): number {
  const caben = recorte.anchos.filter((a) => a <= 1280);
  return caben.length ? Math.max(...caben) : Math.min(...recorte.anchos);
}

export function FotoLanding({ foto, sizes, mediaMovil, prioritaria = false, className }: Props) {
  const escritorio = foto.recortes.escritorio;
  const movil = foto.recortes.movil;
  const ancho = anchoRespaldo(escritorio);
  const anchoMovil = movil ? Math.max(...movil.anchos) : 0;

  return (
    <picture>
      {movil && (
        <>
          <source
            type="image/avif"
            media={mediaMovil}
            srcSet={srcSet(foto, 'movil', movil, 'avif')}
            sizes={sizes.movil ?? sizes.escritorio}
            width={anchoMovil}
            height={altoDe(movil, anchoMovil)}
          />
          <source
            type="image/webp"
            media={mediaMovil}
            srcSet={srcSet(foto, 'movil', movil, 'webp')}
            sizes={sizes.movil ?? sizes.escritorio}
            width={anchoMovil}
            height={altoDe(movil, anchoMovil)}
          />
        </>
      )}
      <source type="image/avif" srcSet={srcSet(foto, 'escritorio', escritorio, 'avif')} sizes={sizes.escritorio} />
      <img
        src={rutaFoto(foto, 'escritorio', ancho, 'webp')}
        srcSet={srcSet(foto, 'escritorio', escritorio, 'webp')}
        sizes={sizes.escritorio}
        width={ancho}
        height={altoDe(escritorio, ancho)}
        alt={foto.alt}
        className={className}
        loading={prioritaria ? 'eager' : 'lazy'}
        fetchPriority={prioritaria ? 'high' : undefined}
        decoding={prioritaria ? undefined : 'async'}
      />
    </picture>
  );
}

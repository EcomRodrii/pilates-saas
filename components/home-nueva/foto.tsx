// Una foto de las que dejó el fundador en el escritorio, ya derivadas (AVIF + WebP, dos tamaños) en public/landing-nueva/.
// Con `ancho`/`alto` la caja reserva su sitio antes de que llegue el fichero (sin saltos de maquetación).
const FOTOS = {
  hierba: { anchos: [1280, 1672, 2400], ancho: 1672, alto: 941 },
  alumna1: { archivo: 'alumna-1', anchos: [480, 800], ancho: 1170, alto: 1749 },
  alumna2: { archivo: 'alumna-2', anchos: [480, 800], ancho: 1170, alto: 1619 },
  alumna3: { archivo: 'alumna-3', anchos: [480, 761], ancho: 761, alto: 1280 },
  cobros: { anchos: [560, 960], ancho: 1058, alto: 1487 },
  postura: { anchos: [640, 1100], ancho: 1219, alto: 1290 },
  meditacion: { anchos: [800, 1400], ancho: 1672, alto: 941 },
  retrato: { anchos: [800, 1600], ancho: 1672, alto: 941 },
  panel: { archivo: 'panel-resumen', anchos: [900, 1600], ancho: 1600, alto: 1000 },
} as const;

export type NombreFoto = keyof typeof FOTOS;

export function Foto({ nombre, alt, sizes, prioridad, className }: { nombre: NombreFoto; alt: string; sizes: string; prioridad?: boolean; className?: string }) {
  const f = FOTOS[nombre];
  const base = 'archivo' in f ? f.archivo : nombre;
  const srcset = (ext: 'avif' | 'webp') => f.anchos.map(w => `/landing-nueva/${base}-${w}.${ext} ${w}w`).join(', ');
  const mayor = f.anchos[f.anchos.length - 1];
  return (
    <picture>
      <source type="image/avif" srcSet={srcset('avif')} sizes={sizes} />
      <source type="image/webp" srcSet={srcset('webp')} sizes={sizes} />
      <img
        src={`/landing-nueva/${base}-${mayor}.webp`}
        alt={alt}
        width={f.ancho}
        height={f.alto}
        className={className}
        loading={prioridad ? 'eager' : 'lazy'}
        fetchPriority={prioridad ? 'high' : undefined}
        decoding="async"
      />
    </picture>
  );
}

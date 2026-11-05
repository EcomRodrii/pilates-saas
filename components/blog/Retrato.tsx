import { AUTOR_BLOG } from '@/lib/blog/autor';

// La foto del autor, en AVIF y WebP (public/blog/). Provisional: cambiarla es cambiar esos ficheros y las medidas de
// `AUTOR_BLOG.foto`, no el diseño. `prioridad` para la que es lo primero que se ve (LCP de la página de autor).
export function Retrato({ ancho = 480, prioridad = false, sizes }: { ancho?: 480 | 800; prioridad?: boolean; sizes: string }) {
  const f = AUTOR_BLOG.foto;
  const srcSet = (ext: 'avif' | 'webp') => f.anchos.map((a) => `${f.base}-${a}.${ext} ${a}w`).join(', ');
  return (
    <picture>
      <source type="image/avif" srcSet={srcSet('avif')} sizes={sizes} />
      <img
        src={`${f.base}-${ancho}.webp`}
        srcSet={srcSet('webp')}
        sizes={sizes}
        width={f.ancho}
        height={f.alto}
        alt={f.alt}
        loading={prioridad ? 'eager' : 'lazy'}
        decoding="async"
        {...(prioridad ? { fetchPriority: 'high' as const } : {})}
      />
    </picture>
  );
}

/** El avatar redondo de la firma. Decorativo: el nombre ya está en el texto de al lado (alt vacío). */
export function Avatar() {
  const f = AUTOR_BLOG.foto;
  return (
    <span className="bl-avatar" aria-hidden="true">
      <picture>
        <source type="image/avif" srcSet={`${f.base}-480.avif`} />
        <img src={`${f.base}-480.webp`} width={f.ancho} height={f.alto} alt="" loading="lazy" decoding="async" />
      </picture>
    </span>
  );
}

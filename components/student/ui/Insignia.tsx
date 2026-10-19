import { resolverInsignia, type InsigniaResuelta } from '@/lib/gamificacion/insignias';

// La insignia 3D de un logro, reto, nivel o recompensa (lib/gamificacion/insignias.ts).
//
// Siempre decorativa (`alt` vacío): va al lado del nombre, que ya dice lo mismo.
// Con ancho y alto fijos para que no salte la tarjeta al cargar, y diferida: las
// imágenes pesan 20–47 KB y casi todas quedan por debajo del pliegue.
//
// Si lo guardado no es una insignia (un número de nivel, un emoji que el estudio
// tecleó a mano), se pinta el texto en el mismo hueco: nada desaparece.

export function Insignia({ icono, insignia, tamano = 40 }: {
  /** Lo guardado en `icono`. */
  icono?: string | null;
  /** Ya resuelta (p. ej. la de un nivel, que tiene su propia regla). Manda sobre `icono`. */
  insignia?: InsigniaResuelta | null;
  tamano?: number;
}) {
  const resuelta = insignia ?? resolverInsignia(icono);
  const caja = { width: tamano, height: tamano, flex: 'none' as const };
  if (resuelta) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- PNG estático de 188 px servido desde /public: next/image no aporta nada aquí.
      <img src={resuelta.src} alt="" width={tamano} height={tamano} loading="lazy" decoding="async" style={{ ...caja, objectFit: 'contain' }} data-insignia={resuelta.clave} />
    );
  }
  if (!icono) return null;
  return (
    <span aria-hidden style={{ ...caja, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: Math.round(tamano * 0.6), lineHeight: 1 }}>
      {icono}
    </span>
  );
}

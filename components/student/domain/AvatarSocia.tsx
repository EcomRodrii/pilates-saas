'use client';

import { iniciales } from '@/lib/mensajeria/presentacion';

/**
 * La cara de la alumna. UNA sola forma de pintarla en toda la app.
 *
 * ⚠️ Nace de un bug con nombre y apellidos: la foto que subía la alumna se veía
 * en «Datos personales» y NO en «Perfil». No era un problema de caché ni de
 * subida — es que `perfil/page.tsx` nunca leía `socia.fotoUrl`: pintaba a mano
 * un círculo con las iniciales y punto. `fotoUrl` viaja en el payload desde
 * siempre (`proyectarAlumna`, lib/student/mapeo.ts), y tenía UN solo
 * consumidor en toda la app.
 *
 * Así que la fuente de verdad no hacía falta crearla —ya existía— sino
 * EMPEZAR A LEERLA en los dos sitios. Lo que sí faltaba es esto: un componente
 * que decida una vez qué se enseña cuando hay foto y qué cuando no, para que la
 * siguiente pantalla que necesite la cara de la alumna no vuelva a escribir su
 * propio círculo con sus propias iniciales.
 *
 * Y ya iban tres: `perfil/page.tsx` tenía su `iniciales()`, `perfil/datos`
 * calculaba las suyas en línea con otra regla, y ninguna de las dos era la que
 * ya existía en `lib/mensajeria/presentacion.ts` — que es pura, está probada y
 * hace exactamente esto. Se reutiliza esa; no hay una cuarta.
 */
export function AvatarSocia({ nombre, apellidos, fotoUrl, size = 56, className = '' }: {
  nombre?: string | null;
  apellidos?: string | null;
  fotoUrl?: string | null;
  /** Lado en píxeles. `.avatar` deriva de aquí el tamaño de las iniciales. */
  size?: number;
  className?: string;
}) {
  const letras = iniciales(nombre ?? '', apellidos ?? undefined);

  return (
    <span
      // `aria-hidden`: el nombre va SIEMPRE escrito al lado en las pantallas que
      // usan esto, así que leerlo dos veces solo estorba.
      aria-hidden
      data-testid="avatar-socia"
      className={`avatar ${className}`.trim()}
      style={{
        ['--size' as string]: `${size}px`,
        // La foto va de fondo y no en un `<img>` a propósito: `.avatar` ya
        // recorta al círculo con `overflow: hidden`, y `cover` centra sin
        // deformar sea cual sea la proporción de lo que suba.
        ...(fotoUrl ? { backgroundImage: `url(${fotoUrl})` } : {}),
      }}
    >
      {/* Con foto no se pintan las iniciales debajo: si la imagen tarda o falla,
          se ve el fondo del token, no dos capas superpuestas. */}
      {!fotoUrl && letras}
    </span>
  );
}

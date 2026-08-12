// La foto de cabecera de una pantalla del portal (Clases, Bonos).
//
// Va ENCIMA del título, no detrás. Podría parecer más vistoso poner el texto
// sobre la imagen —como en la portada de acceso—, pero ahí el color del texto
// está fijado por ese diseño; aquí lo pone el tema del estudio, y un titular
// oscuro sobre una foto oscura no hay velo que lo salve. Una banda encima es
// tan bonita y no puede volverse ilegible con ninguna paleta.
//
// Respeta `--portal-foto-pos` (el encuadre arriba/centro/abajo que la
// propietaria elige para su foto), igual que la portada y la tarjeta grande:
// una foto vertical se recorta donde ella dijo, no donde caiga.

import { alFallarImagen, IMAGENES_POR_DEFECTO } from '@/lib/imagenes-por-defecto';

export function BandaFoto({ url, alto = 160 }: { url: string; alto?: number }) {
  return (
    <div
      style={{
        height: alto,
        margin: '0 24px 22px',
        borderRadius: 'var(--portal-radius-card, 26px)',
        overflow: 'hidden',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        // Decorativa: lo que dice la pantalla ya está en el titular de debajo.
        // Un alt repitiendo "Clases" sería ruido para quien use lector.
        alt=""
        // Una foto subida puede desaparecer de Storage; sin esto queda el icono
        // de imagen rota en el portal de las socias.
        onError={alFallarImagen(IMAGENES_POR_DEFECTO.banda[0])}
        style={{
          width: '100%', height: '100%', objectFit: 'cover',
          objectPosition: 'var(--portal-foto-pos, center center)', display: 'block',
        }}
      />
    </div>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import { DISPOSITIVOS, escalaParaCaber, altoOcupado, type DispositivoId } from '@/lib/theme/dispositivos';

// El marco de la vista previa, al tamaño REAL del dispositivo elegido.
//
// Un solo componente para los dos previews del editor (páginas y Ajustes),
// que se ven uno después del otro en el mismo hueco: con las clases
// duplicadas basta tocar una para que el marco cambie de tamaño delante de
// quien está editando. Ya pasó.
//
// ⚠️ El iframe se declara SIEMPRE al ancho real del dispositivo (390, 768) y
// se encoge con `transform: scale()`. Ponerle un `max-width` y dejar que se
// adapte sería más simple y sería MENTIRA: el contenido de dentro mira el
// ancho real del iframe para sus media queries, así que una "tablet" de 616 px
// renderizaría como un móvil ancho.

const RADIO: Record<DispositivoId, string> = {
  movil: 'rounded-[2rem]',
  tablet: 'rounded-[1.5rem]',
  completo: 'rounded-xl',
};

export function MarcoDispositivo({
  dispositivo, zoom = 1, vacio, children,
}: {
  dispositivo: DispositivoId;
  /** El zoom que elige la propietaria, encima del encogido automático. */
  zoom?: number;
  /** Texto a enseñar en vez del contenido, mientras no hay nada que enseñar. */
  vacio?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const contenedor = useRef<HTMLDivElement>(null);
  const [disponible, setDisponible] = useState(0);
  const def = DISPOSITIVOS[dispositivo];

  // Se mide el hueco, no se supone. El rail y el panel derecho son fijos, pero
  // la ventana no: sin medir, la tablet se saldría en pantallas pequeñas.
  useEffect(() => {
    const el = contenedor.current;
    if (!el) return;
    const ro = new ResizeObserver(([entrada]) => setDisponible(entrada.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const marco = `${RADIO[dispositivo]} overflow-hidden ${def.conMarco ? 'border-[6px] border-black/85 shadow-xl' : 'border border-border'}`;
  // ⚠️ Esqueleto, no una frase en medio de un rectángulo gris.
  //
  // Mientras la vista previa arrancaba, esto era una caja lisa con "La vista
  // previa aparecerá en un momento" — y la propietaria la miraba entre 4 y 7
  // segundos (medido en producción) en la pantalla cuyo único propósito es
  // ver. Un rectángulo vacío que no cambia se lee como colgado; unas siluetas
  // con la forma de lo que va a venir se leen como cargando. La frase se
  // queda debajo, para cuando el hueco no es una espera sino un estado
  // permanente (un estudio sin enlace de reservas, p.ej.).
  const contenido = vacio
    ? <div className="w-full h-full bg-muted flex flex-col gap-3 p-5" aria-busy="true">
        <div className="h-3 w-2/5 rounded bg-foreground/10 animate-pulse" />
        <div className="h-6 w-3/5 rounded bg-foreground/10 animate-pulse" />
        <div className="h-28 w-full rounded-xl bg-foreground/10 animate-pulse" />
        <div className="flex gap-2">
          <div className="h-16 flex-1 rounded-lg bg-foreground/10 animate-pulse" />
          <div className="h-16 flex-1 rounded-lg bg-foreground/10 animate-pulse" />
          <div className="h-16 flex-1 rounded-lg bg-foreground/10 animate-pulse" />
        </div>
        <p className="mt-auto text-[11.5px] text-muted-foreground text-center">{vacio}</p>
      </div>
    : children;

  // "Ancho completo" no escala nada: ocupa lo que haya, que es justo lo que
  // se quiere mirar.
  if (def.ancho === null || def.alto === null) {
    return (
      <div ref={contenedor} className="w-full">
        <div className={`${marco} w-full h-[70vh] bg-white`}>{contenido}</div>
      </div>
    );
  }

  const escala = escalaParaCaber(disponible, def.ancho) * zoom;

  return (
    <div ref={contenedor} className="w-full flex justify-center">
      {/* El contenedor reserva el alto YA ESCALADO. `transform` no cambia el
          hueco que el elemento ocupa en el layout, así que sin esto una tablet
          encogida dejaría un vacío enorme debajo. */}
      <div style={{ height: altoOcupado(def.alto, escala), width: Math.round(def.ancho * escala) }}>
        <div
          className={`${marco} bg-white`}
          style={{
            width: def.ancho,
            height: def.alto,
            transform: `scale(${escala})`,
            transformOrigin: 'top left',
          }}
        >
          {contenido}
        </div>
      </div>
    </div>
  );
}

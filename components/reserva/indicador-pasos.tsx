'use client';

// El «dónde estoy» del modal de reserva: unos segmentos y el nombre del paso.
//
// Se prefiere a un «Paso 1 de 2» suelto porque el nombre del siguiente paso es
// justo lo que quita la duda de si merece la pena seguir («¿me va a pedir la
// tarjeta ahora o después?»). Los segmentos dan la proporción de un vistazo,
// sin leer.

import { textoPaso, type Recorrido } from '@/lib/reservar/pasos-flujo';

export function IndicadorPasos({ recorrido }: { recorrido: Recorrido }) {
  return (
    <div
      // Una sola etiqueta para quien no ve los segmentos; los segmentos en sí
      // son decoración y se esconden del árbol de accesibilidad.
      role="group"
      aria-label={`${textoPaso(recorrido)}: ${recorrido.etiquetas[recorrido.actual]}`}
      style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}
    >
      <div aria-hidden="true" style={{ display: 'flex', gap: 4 }}>
        {recorrido.etiquetas.map((et, i) => (
          <span
            key={et}
            style={{
              height: 3, borderRadius: 999, width: 22,
              background: i <= recorrido.actual ? 'var(--portal-ink)' : 'var(--portal-line)',
              // Los pasos ya hechos y el actual se rellenan; el relleno crece
              // con una transición corta para que el cambio de paso se lea como
              // avance y no como un salto.
              transition: 'background .22s ease',
            }}
          />
        ))}
      </div>
      <p className="text-[10.5px] font-bold tracking-[0.14em] text-[var(--portal-muted)] uppercase truncate">
        {textoPaso(recorrido)} · {recorrido.etiquetas[recorrido.actual]}
      </p>
    </div>
  );
}

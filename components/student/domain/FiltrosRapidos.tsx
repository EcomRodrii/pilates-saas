'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sheet } from '@/components/student/ui/Sheet';

// El botón de filtros que va pegado al buscador de Inicio.
//
// ⚠️ Lo difícil aquí no era el botón, era decidir a qué filtra. En esta app los
// filtros no son un panel: son PÍLDORAS dentro del horario. Un botón que
// simplemente llevara a `/reservar` no filtraría nada —haría lo mismo que
// enviar el buscador vacío— y sería un adorno con forma de control.
//
// Así que hace lo único que tiene sentido: enseña los filtros que existen de
// verdad y abre el horario YA filtrado, con el mismo `?filtro=` que usa la
// baldosa de favoritas. Nada nuevo que mantener en dos sitios.
//
// Se ofrece SOLO lo que esta alumna puede usar: los tipos de clase que su
// estudio tiene de verdad, y «Favoritas» únicamente si ha guardado alguna —
// mismo criterio que la píldora del horario, donde un filtro que devuelve vacío
// para todo el mundo es ruido.

export function FiltrosRapidos({ tipos, conFavoritas, hrefReservar }: {
  /** Tipos de clase del estudio, tal y como los pinta el horario. */
  tipos: string[];
  conFavoritas: boolean;
  hrefReservar: string;
}) {
  const router = useRouter();
  const [abierta, setAbierta] = useState(false);

  const opciones = [
    ...(conFavoritas ? [{ valor: 'Favoritas', etiqueta: 'Mis favoritas' }] : []),
    { valor: 'Con hueco', etiqueta: 'Con plaza libre' },
    ...tipos.map((t) => ({ valor: t, etiqueta: t })),
  ];

  // Sin tipos y sin favoritas no queda nada que ofrecer: no se pinta el botón.
  // Un estudio recién abierto no tiene por qué enseñar un control vacío.
  if (opciones.length <= 1 && tipos.length === 0) return null;

  function ir(valor: string) {
    setAbierta(false);
    router.push(`${hrefReservar}?filtro=${encodeURIComponent(valor)}`);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierta(true)}
        aria-label="Filtrar clases"
        aria-haspopup="dialog"
        className="tap"
        style={{
          width: 48, height: 48, flexShrink: 0, borderRadius: 999,
          // ⚠️ Tinta de MARCA, no `--foreground`. En la guía del estudio este
          // botón es el único elemento en color de toda la fila del buscador, y
          // con `--foreground` salía negro: el mismo botón para los trece
          // estudios, que es justo lo contrario de una app de marca blanca.
          // `--accent`/`--accent-foreground` es la pareja del sistema, así que
          // el contraste va garantizado sea cual sea la marca.
          background: 'var(--accent)', color: 'var(--accent-foreground)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        {/* Los tres deslizadores de la guía: la línea cruza el mando de lado a
            lado y el mando va hueco, no macizo. */}
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
          <path d="M3 7h18M3 12h18M3 17h18" />
          <circle cx="16" cy="7" r="2.4" fill="var(--accent)" />
          <circle cx="8" cy="12" r="2.4" fill="var(--accent)" />
          <circle cx="16" cy="17" r="2.4" fill="var(--accent)" />
        </svg>
      </button>

      <Sheet open={abierta} onClose={() => setAbierta(false)} label="Filtrar clases">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <h2 className="t-h2" style={{ margin: 0 }}>Filtrar clases</h2>
            <p className="t-meta" style={{ margin: '3px 0 0' }}>Te lleva al horario ya filtrado.</p>
          </div>
          <ul style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: 0, padding: 0, listStyle: 'none' }}>
            {opciones.map((o) => (
              <li key={o.valor}>
                <button type="button" className="pill" onClick={() => ir(o.valor)}>{o.etiqueta}</button>
              </li>
            ))}
          </ul>
        </div>
      </Sheet>
    </>
  );
}

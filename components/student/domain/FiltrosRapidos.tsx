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
          background: 'var(--foreground)', color: 'var(--background)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden>
          <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h10M18 18h2" />
          <circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="16" cy="18" r="2" />
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

import Link from 'next/link';
import { Icono } from '@/components/student/ui/Icono';
import { trato } from '@/lib/genero';
import type { Genero } from '@/lib/genero';

// «Tu primera clase» (P03, 5-oct-2026): lo que ve en Inicio quien acaba de llegar y todavía no tiene nada —ni una reserva,
// ni un bono, ni una clase fija—, en lugar de «No tienes clases próximas» y «Tu ritmo» a cero. Quién es recién llegada lo
// decide UNA regla (`esRecienLlegada`), la misma que Perfil.
//
// ⚠️ La cifra es de los próximos 7 días y no «de esta semana»: un domingo por la noche, «esta semana» daría casi cero a
// quien tiene el horario lleno el lunes. Y es orientativa, como «Huecos de hoy»: el aforo real lo decide el servidor.
// ⚠️ Ni precio ni «solo la primera vez»: eso es otra pieza (la de pagar), y aquí no se promete lo que no se sabe.
export function PrimeraClaseCard({ estudio, genero, clasesConPlaza, soloConBono, hrefReservar, hrefPrecios }: {
  estudio: string;
  genero: Genero | null | undefined;
  /** Clases con plaza en los próximos 7 días (`clasesConPlazaProximas`). */
  clasesConPlaza: number;
  /** Todas las contadas se reservan solo con bono o cuota. */
  soloConBono: boolean;
  hrefReservar: string;
  /** La tienda, solo si el estudio vende algo (`getHayAlgoALaVenta`); `null` = sin «Ver precios». */
  hrefPrecios: string | null;
}) {
  return (
    <section
      className="card card--pad-lg a-up stack"
      aria-label="Tu primera clase"
      data-testid="primera-clase"
      style={{ ['--gap' as string]: 'var(--s-2)', borderRadius: 'var(--radius-hero)' }}
    >
      <p className="t-label" style={{ margin: 0 }}>Tu primera clase</p>
      <h2 className="t-title" style={{ margin: 0 }}>Bienvenid{trato(genero).fin} a {estudio}</h2>
      <p className="t-body t-dim" style={{ margin: 0 }} data-testid="primera-clase-cifra">
        {clasesConPlaza > 0
          ? `En los próximos 7 días hay ${clasesConPlaza} ${clasesConPlaza === 1 ? 'clase' : 'clases'} con plaza.`
          : 'Mira el horario y elige tu primera clase.'}
      </p>
      {soloConBono && (
        <p className="t-meta" style={{ margin: 0 }}>Para reservarlas hace falta un bono o una cuota.</p>
      )}
      <Link href={hrefReservar} className="btn btn--primary btn--full tap" style={{ marginTop: 'var(--s-2)' }}>
        Elegir mi primera clase
      </Link>
      {hrefPrecios && (
        <Link
          href={hrefPrecios}
          className="tap row"
          style={{ ['--gap' as string]: '4px', alignSelf: 'center', minHeight: 44, fontSize: 'var(--t-small)', fontWeight: 800, color: 'var(--accent)' }}
        >
          Ver precios
          <Icono nombre="chevron-derecha" tamano={16} />
        </Link>
      )}
    </section>
  );
}

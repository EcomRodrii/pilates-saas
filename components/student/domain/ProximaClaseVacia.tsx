import Link from 'next/link';
import { Ilustracion } from '@/components/student/ui/Ilustracion';

// «Tu próxima clase» cuando no hay ninguna.
//
// ⚠️ Componente propio y NO una variante de `EmptyState`. Aquel es el estado
// vacío genérico —disco o ilustración arriba, todo centrado— y lo usan ocho
// pantallas; este lleva rótulo, va en horizontal y es la primera tarjeta de
// Inicio. Bifurcar el compartido para un solo llamador habría dejado a las
// otras siete cargando con una opción que no usan.
//
// La composición es la de la maqueta: el texto manda a la izquierda y la
// ilustración acompaña a la derecha. Centrado ocupaba casi el doble de alto
// vertical para decir lo mismo, y empujaba «Tu ritmo» fuera de la pantalla.
//
// ⚠️ Lo que NO lleva es la frase manuscrita de la maqueta. Dos motivos: este
// repo no carga ninguna tipografía caligráfica —añadir una es una decisión con
// su coste de carga— y, sobre todo, esa frase sería texto inventado por
// nosotros en una app de MARCA BLANCA. Trece estudios distintos diciendo lo
// mismo es exactamente lo que ya se decidió no hacer con el lema y con la frase
// del héroe, que los escribe cada estudio.

export function ProximaClaseVacia({ huecosHoy, hrefReservar }: {
  /** Clases de hoy con plaza. El cuerpo cambia según haya o no. */
  huecosHoy: number;
  hrefReservar: string;
}) {
  return (
    // ⚠️ Sin `aria-label`. `NextClassCard` —la tarjeta de VERDAD— se llama
    // «Tu próxima clase» como región, y ponerle aquí el mismo nombre dejaba dos
    // regiones distintas llamadas igual: para un lector de pantalla, y para
    // cualquier test, «la próxima clase» pasaba a ser ambiguo. El rótulo ya se
    // lee dentro; una <section> sin nombre no es un landmark y no estorba.
    <section
      className="a-up"
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        border: '1.5px dashed var(--border-strong)',
        borderRadius: 'var(--radius-hero)',
        padding: 'var(--s-5)',
        overflow: 'hidden',
      }}
    >
      <div className="stack" style={{ ['--gap' as string]: 'var(--s-2)', minWidth: 0, flex: 1 }}>
        <p className="t-label" style={{ margin: 0 }}>Tu próxima clase</p>
        <p className="t-card-title" style={{ margin: 0 }}>No tienes clases próximas</p>
        <p className="t-small t-dim" style={{ margin: 0 }}>
          {huecosHoy > 0
            ? `Hay ${huecosHoy} ${huecosHoy === 1 ? 'clase' : 'clases'} hoy con plaza libre.`
            : 'Mira el horario para encontrar tu próxima clase.'}
        </p>
        <Link
          href={hrefReservar}
          className="btn btn--primary btn--sm tap"
          style={{ marginTop: 'var(--s-1)', alignSelf: 'flex-start', boxShadow: 'none' }}
        >
          Ver el horario →
        </Link>
      </div>

      {/* Decorativa y la PRIMERA que se cae: por debajo de 360 px de ancho el
          texto se queda con dos palabras por línea, y lo que hay que leer es el
          texto. `Ilustracion` ya va `aria-hidden`. */}
      <span className="solo-ancho" style={{ flexShrink: 0 }}>
        <Ilustracion nombre="postura" alto={112} />
      </span>
    </section>
  );
}

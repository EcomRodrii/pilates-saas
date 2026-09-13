import Link from 'next/link';
import { Icono, type NombreIcono } from '@/components/student/ui/Icono';

// Las cuatro cosas que hace una alumna, debajo del buscador.
//
// ⚠️ Dos de las cuatro repiten destino con la barra de abajo (Clases y Bonos),
// y es a propósito: la barra es para MOVERSE por la app y esto es la primera
// pantalla diciendo a qué se viene.
//
// ⚠️ La composición sale de la guía de marca del estudio, no de mi criterio:
// icono dentro de un disco, todo CENTRADO, y sin chevron. La primera versión
// las traía alineadas a la izquierda, con flecha, y la primera en tinta de
// marca para que destacara; la guía las enseña **las cuatro iguales**, y la
// tinta de marca reservada para una quinta pieza que es una cita, no un atajo.
// Se sigue la guía: quien decide cómo se ve su app es el estudio.
//
// Los iconos son del mismo set que la barra (HugeIcons stroke-rounded) y al
// mismo grosor. Mezclar familias en la misma pantalla se nota aunque no se
// sepa por qué.
//
// ⚠️ Tres de estos cuatro estaban dibujados a mano «a lo HugeIcons» y se
// notaba: el hombro de la segunda persona de Instructoras volvía sobre sí mismo
// y parecía un trazo duplicado, y el corazón tenía otra forma que el de la
// barra. Ahora salen de `ui/Icono.tsx`, copiados del paquete sin retocar.

type Acceso = { href: string; titulo: string; pie: string; icono: NombreIcono };

export function AccesosRapidos({ hrefReservar, hrefInstructoras, hrefBonos, hrefFavoritas }: {
  hrefReservar: string;
  hrefInstructoras: string;
  hrefBonos: string;
  hrefFavoritas: string;
}) {
  const accesos: Acceso[] = [
    {
      href: hrefReservar, titulo: 'Clases', pie: 'Reserva tu plaza',
      icono: 'calendario',
    },
    {
      href: hrefInstructoras, titulo: 'Instructoras', pie: 'Conoce al equipo',
      icono: 'instructoras',
    },
    {
      href: hrefBonos, titulo: 'Bonos', pie: 'Gestiona tus créditos',
      icono: 'bono',
    },
    {
      href: hrefFavoritas, titulo: 'Mis favoritos', pie: 'Tus clases guardadas',
      icono: 'favorito',
    },
  ];

  return (
    <nav className="px" style={{ marginTop: 14 }} aria-label="Accesos rápidos">
      <ul style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8, margin: 0, padding: 0, listStyle: 'none' }}>
        {accesos.map((a) => (
          // `display: flex` en el <li>: sin él la baldosa no estira hasta el
          // alto de la fila y la primera —cuyo título parte en dos líneas—
          // quedaba 9 px más alta que las otras tres.
          <li key={a.href + a.titulo} style={{ minWidth: 0, display: 'flex' }}>
            <Link
              href={a.href}
              className="tap a-up"
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, height: '100%',
                // ⚠️ `minWidth: 0` o la baldosa se sale de su celda. Medido:
                // «Instructoras» no cabe en los 63 px de contenido de una
                // columna de 83, y sin esto el <a> crecía a 92 y su texto se
                // pintaba ENCIMA de la baldosa de al lado. La rejilla no lo
                // impide: un flex/grid item no encoge por debajo de su
                // contenido mínimo si no se le dice.
                minWidth: 0,
                padding: '13px 5px 12px', borderRadius: 16,
                background: 'var(--card)', color: 'var(--foreground)',
                border: '1px solid var(--border)', boxShadow: 'var(--shadow-card)',
                textAlign: 'center',
                // ⚠️ Sin escalonar. Las cuatro baldosas son UNA pieza, no
                // cuatro cosas que llegan: con `i * 45` la fila tardaba 135 ms
                // en terminar de aparecer y se leía como un goteo. Medido en el
                // conjunto de la home, este era uno de los trece trozos que la
                // mantenían moviéndose 1,28 s después de entrar.
                animationDelay: '0ms',
              }}
            >
              {/* El disco del icono. En la guía es un gris muy claro, no la
                  tinta de marca: lo que tiñe la baldosa es el icono, no el
                  fondo. */}
              <span
                aria-hidden
                style={{
                  width: 38, height: 38, borderRadius: 999, flexShrink: 0,
                  background: 'var(--muted)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Icono nombre={a.icono} />
              </span>
              {/* Que pueda partirse con guion: el idioma va declarado en el
                  <html lang="es">, así que «Instruc-toras» parte donde toca. */}
              {/* 11,5 px y no 12: a cuatro columnas de 84, «Instructoras» a 12
                  medía 74 px en 74 de hueco y partía —«Instructo-ras», centrado,
                  que queda peor que pequeño—. A 11,5 entra de una pieza. El
                  guion se queda como red por si un estudio tiene un tipo de
                  clase con una palabra aún más larga. */}
              <span style={{ display: 'block', fontSize: 11.5, fontWeight: 800, letterSpacing: '-.015em', lineHeight: 1.15, hyphens: 'auto', overflowWrap: 'break-word' }}>{a.titulo}</span>
              {/* El pie se cae por debajo de 360 px de ancho: a cuatro columnas
                  no hay sitio para dos líneas de 10 px, y lo que se pierde es la
                  palabra que de verdad nombra el destino. */}
              <span className="solo-ancho t-dim" style={{ fontSize: 10, lineHeight: 1.2 }}>{a.pie}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

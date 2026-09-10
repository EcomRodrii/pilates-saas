import Link from 'next/link';

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

type Acceso = { href: string; titulo: string; pie: string; paths: string[] };

export function AccesosRapidos({ hrefReservar, hrefInstructoras, hrefBonos, hrefFavoritas }: {
  hrefReservar: string;
  hrefInstructoras: string;
  hrefBonos: string;
  hrefFavoritas: string;
}) {
  const accesos: Acceso[] = [
    {
      href: hrefReservar, titulo: 'Clases', pie: 'Reserva tu plaza',
      paths: [
        'M16 2V6M8 2V6',
        'M3 10H21',
        'M21 12V11C21 7.22876 21 5.34315 19.8284 4.17157C18.6569 3 16.7712 3 13 3H11C7.22876 3 5.34315 3 4.17157 4.17157C3 5.34315 3 7.22876 3 11V13C3 16.7712 3 18.6569 4.17157 19.8284C5.34315 21 7.22876 21 11 21H13C16.7712 21 18.6569 21 19.8284 19.8284C21 18.6569 21 16.7712 21 13V12Z',
      ],
    },
    {
      href: hrefInstructoras, titulo: 'Instructoras', pie: 'Conoce al equipo',
      paths: [
        'M14 8.5C14 10.433 12.433 12 10.5 12C8.567 12 7 10.433 7 8.5C7 6.567 8.567 5 10.5 5C12.433 5 14 6.567 14 8.5Z',
        'M17 19.5C17 16.7386 14.0899 14.5 10.5 14.5C6.91015 14.5 4 16.7386 4 19.5',
        'M17 11C18.6569 11 20 9.65685 20 8C20 6.34315 18.6569 5 17 5',
        'M18.5 18.5C18.5 16.6 17.7 15 16.5 14.1C18.9 14.5 20.5 16 20.5 18',
      ],
    },
    {
      href: hrefBonos, titulo: 'Bonos', pie: 'Gestiona tus créditos',
      paths: [
        'M15 4H9C5.70017 4 4.05025 4 3.02513 5.02513C2 6.05025 2 7.70017 2 11V13C2 16.2998 2 17.9497 3.02513 18.9749C4.05025 20 5.70017 20 9 20H15C18.2998 20 19.9497 20 20.9749 18.9749C22 17.9497 22 16.2998 22 13V11C22 7.70017 22 6.05025 20.9749 5.02513C19.9497 4 18.2998 4 15 4Z',
        'M21.5 8H11.5L12.5 9.5H21.5V8Z',
        'M10 11.5C10 12.8807 8.88072 14 7.5 14C6.11928 14 5 12.8807 5 11.5C5 10.1193 6.11928 9 7.5 9C8.88072 9 10 10.1193 10 11.5Z',
      ],
    },
    {
      href: hrefFavoritas, titulo: 'Mis favoritos', pie: 'Tus clases guardadas',
      paths: [
        'M12 20.5C11.4 20.5 3 15.6 3 9.9C3 7.2 5.1 5 7.7 5C9.5 5 11.1 6.1 12 7.6C12.9 6.1 14.5 5 16.3 5C18.9 5 21 7.2 21 9.9C21 15.6 12.6 20.5 12 20.5Z',
      ],
    },
  ];

  return (
    <nav className="px" style={{ marginTop: 14 }} aria-label="Accesos rápidos">
      <ul style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8, margin: 0, padding: 0, listStyle: 'none' }}>
        {accesos.map((a, i) => (
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
                animationDelay: `${i * 45}ms`,
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
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  {a.paths.map((d) => <path key={d} d={d} />)}
                </svg>
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

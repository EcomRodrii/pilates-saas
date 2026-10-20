'use client';

import type { MouseEvent } from 'react';
import Link from 'next/link';
import { Icono, type NombreIcono } from '@/components/student/ui/Icono';

// La fila de cuatro baldosas de la INSTRUCTORA (su «Hoy»). Las de la alumna en Inicio son `BaldosasInicio`, copia de la
// maqueta de oct-2026 (decisión del fundador del 19-oct, que sustituye a la fila Comunidad · Instructoras · Chat ·
// Favoritos del 7-oct).
//
// Los iconos son del mismo set que la barra (HugeIcons stroke-rounded) y al mismo grosor.

export type Acceso = {
  href: string; titulo: string; pie: string; icono: NombreIcono;
  /** Una baldosa que hace algo antes de navegar. Si no llama a `preventDefault`, vale `href`. */
  alPulsar?: (e: MouseEvent<HTMLAnchorElement>) => void;
  /** Mientras `alPulsar` espera al servidor. */
  ocupado?: boolean;
};

/**
 * La fila de cuatro baldosas. Una sola pieza para la alumna y para la
 * instructora (su «Hoy»), cada una con sus destinos: así las dos apps se ven
 * iguales y no hay dos sitios que sepan dibujar una baldosa.
 *
 * `enLinea`: dentro de un contenedor que ya pone el margen lateral y el hueco
 * entre bloques, sin repetirlos.
 */
export function FilaAccesos({ accesos, enLinea = false }: { accesos: Acceso[]; enLinea?: boolean }) {
  return (
    <nav className={enLinea ? undefined : 'px'} style={{ marginTop: enLinea ? 0 : 14 }} aria-label="Accesos rápidos">
      <ul style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8, margin: 0, padding: 0, listStyle: 'none' }}>
        {accesos.map((a) => (
          // `display: flex` en el <li>: sin él la baldosa no estira hasta el
          // alto de la fila y la primera —cuyo título parte en dos líneas—
          // quedaba 9 px más alta que las otras tres.
          <li key={a.href + a.titulo} style={{ minWidth: 0, display: 'flex' }}>
            <Link
              href={a.href}
              onClick={a.alPulsar}
              aria-busy={a.ocupado || undefined}
              className="tap a-up"
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, height: '100%',
                // `flex: 1`: el <li> es flex en fila, y sin esto la baldosa medía lo
                // que su texto. En el móvil casi no se nota; a 1280 px quedaban
                // cuatro baldosas de 90 px sueltas en columnas de 250.
                flex: 1,
                // ⚠️ `minWidth: 0` o la baldosa se sale de su celda. Medido:
                // «Instructoras» no cabe en los 63 px de contenido de una
                // columna de 83, y sin esto el <a> crecía a 92 y su texto se
                // pintaba ENCIMA de la baldosa de al lado. La rejilla no lo
                // impide: un flex/grid item no encoge por debajo de su
                // contenido mínimo si no se le dice.
                minWidth: 0,
                // 3 px a los lados y no 5: con 5, «Instructoras» seguía partiendo
                // («Instructo-ras») a 390 px, el ancho de un iPhone (auditoría del 6-oct).
                padding: '13px 3px 12px', borderRadius: 16,
                background: 'var(--card)', color: 'var(--foreground)',
                border: '1px solid var(--border)', boxShadow: 'var(--shadow-card)',
                textAlign: 'center',
                // ⚠️ Sin escalonar. Las cuatro baldosas son UNA pieza, no
                // cuatro cosas que llegan: con `i * 45` la fila tardaba 135 ms
                // en terminar de aparecer y se leía como un goteo. Medido en el
                // conjunto de la home, este era uno de los trece trozos que la
                // mantenían moviéndose 1,28 s después de entrar.
                animationDelay: '0ms',
                // Mientras abre el chat (una ida y vuelta): que se vea que el toque llegó.
                opacity: a.ocupado ? 0.6 : undefined,
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

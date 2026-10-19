'use client';

import Link from 'next/link';
import type { Clase, Instructora, Reserva } from '@/lib/student/tipos';
import { etiquetaDia, horaFin } from '@/lib/student/formato';
import { estaEnCurso } from '@/lib/student/estado-clase';
import { useAhoraMs } from '@/lib/student/use-ahora';
import { Icono } from '@/components/student/ui/Icono';
import { TRANSICION_ADELANTE } from '@/lib/student/transiciones';

/**
 * «Próxima clase» de Inicio, copia de la maqueta de los cuatro iPhones (fundador, 19-oct-2026: «copia exacta»): la foto
 * de la clase a sangre, la píldora, la hora enorme, el nombre, la fila de duración · sala · instructora y UN botón,
 * «Ver reserva». El QR, «Cómo llegar» y «+ Calendario» viven en la reserva, a un toque.
 *
 * Una sola tarjeta para hoy, mañana o cualquier día: la píldora dice cuándo si no es hoy (la maqueta pone solo «Próxima
 * clase» porque su clase es de hoy; con una de otro día, «18:30» a secas mentiría). El velo es negro (`.velo-foto`):
 * sobre una foto que sube cada estudio, lo que garantiza el contraste es oscurecer, no teñir.
 */
export function TarjetaProximaClase({ reserva, clase, instructora, hoy, href }: {
  reserva: Reserva; clase: Clase; instructora?: Instructora; hoy: string; href: (ruta: string) => string;
}) {
  const ahoraMs = useAhoraMs();
  const enCurso = estaEnCurso(clase, ahoraMs);
  const hrefReserva = href('/mis-reservas/' + reserva.id);
  const pildora = clase.fecha === hoy ? 'Próxima clase' : `Próxima clase · ${etiquetaDia(clase.fecha, hoy).toLowerCase()}`;
  return (
    <section
      aria-label={enCurso ? 'Tu clase de ahora' : 'Tu próxima clase'}
      data-testid="clase-del-momento"
      className="a-pop tarjeta-proxima"
    >
      {clase.fotoUrl && <div aria-hidden className="tarjeta-proxima__foto" style={{ backgroundImage: `url(${clase.fotoUrl})` }} />}
      <div aria-hidden className="velo-foto" />
      <div className="tarjeta-proxima__cuerpo">
        <Link href={hrefReserva} transitionTypes={TRANSICION_ADELANTE} className="tap tarjeta-proxima__texto">
          <span className="pildora-foto" role={enCurso ? 'status' : undefined} suppressHydrationWarning>
            {enCurso && <span aria-hidden style={{ width: 6, height: 6, borderRadius: 99, background: 'currentColor', animation: 'apPulse 1.6s infinite' }} />}
            {/* En curso, el rótulo de toda la app («Tu clase, en curso»), en su propia pieza, y cuánto queda. */}
            {enCurso ? <><span>Tu clase, en curso</span><span>· hasta las {horaFin(clase.hora, clase.duracionMin)}</span></> : pildora}
          </span>
          <span className="t-num tarjeta-proxima__hora">{clase.hora}</span>
          <span className="tarjeta-proxima__nombre">{clase.nombre}</span>
          <span className="fila-meta-foto">
            <span><Icono nombre="reloj" tamano={15} />{clase.duracionMin} min</span>
            {clase.sala && <span><Icono nombre="ubicacion" tamano={15} />{clase.sala}</span>}
            {instructora?.nombre && <span>{instructora.nombre}</span>}
          </span>
        </Link>
        <Link href={hrefReserva} transitionTypes={TRANSICION_ADELANTE} className="tap boton-foto">
          <span style={{ flex: 1, textAlign: 'center' }}>Ver reserva</span>
          <span aria-hidden className="boton-foto-flecha"><Icono nombre="flecha-derecha" tamano={18} /></span>
        </Link>
      </div>
    </section>
  );
}

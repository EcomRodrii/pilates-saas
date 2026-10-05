'use client';

import { useEstudio } from '@/components/student/contexto';
import { Icono } from '@/components/student/ui/Icono';
import { hoyISO } from '@/lib/student/formato';
import { enlaceCompartirClase, textoCompartirClase } from '@/lib/student/compartir-clase';
import { useCompartir } from '@/lib/student/use-compartir';
import type { Clase } from '@/lib/student/tipos';

/**
 * «Compartir esta clase» en la ficha: «¿Te vienes a Reformer el martes 7 a las
 * 18:00?» con el enlace a la página pública del estudio, donde la amiga ve el
 * horario y reserva aunque no tenga cuenta (no existe un enlace público a UNA
 * clase; ver `enlaceCompartirClase`).
 *
 * En la app y en móvil, la hoja de compartir del sistema; en escritorio, se
 * copia y se dice si de verdad se copió.
 */
export function CompartirClase({ clase }: { clase: Pick<Clase, 'nombre' | 'fecha' | 'hora'> }) {
  const { estudio } = useEstudio();
  const { hayHoja, compartir, copiado } = useCompartir();

  const alPulsar = () => {
    const url = enlaceCompartirClase(window.location.origin, estudio.slug);
    void compartir({ titulo: `${clase.nombre} · ${estudio.nombre}`, texto: textoCompartirClase(clase, hoyISO()), url });
  };

  return (
    <div className="stack" style={{ ['--gap' as string]: 'var(--s-2)' }}>
      <button type="button" className="btn btn--secondary btn--full" onClick={alPulsar} data-testid="compartir-clase">
        <Icono nombre="enviar" tamano={18} />
        {hayHoja ? 'Compartir esta clase' : 'Copiar el enlace de esta clase'}
      </button>
      {copiado !== null && (
        <p role="status" data-testid="compartir-clase-copiado" className={'note ' + (copiado ? 'note--ok' : 'note--warn')}>
          {copiado
            ? 'Copiado. Pégalo donde quieras para invitar a alguien.'
            : 'No hemos podido copiarlo. Inténtalo de nuevo.'}
        </p>
      )}
    </div>
  );
}

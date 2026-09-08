import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// El Orb de Tentare — la marca de «esto lo ha pensado Tentare».
//
// Se usa SOLO donde el producto está de verdad analizando, detectando,
// recomendando o automatizando. No es un adorno ni una etiqueta de «nuevo»:
// para eso ya está `Sparkles` (el changelog, `app/ayuda/novedades`), y era
// justamente el problema — el mismo icono significaba «novedad» en el menú e
// «inteligencia» en el panel de automatizaciones.
//
// El dibujo (preset «Iridescent Opal» y su paleta) vive en `app/globals.css`,
// junto al resto del motion de marca. Aquí solo está el componente, para que
// haya UN sitio al que llamar y el día que el Orb cambie no haya que buscar
// veinte pseudoelementos por el repo.
//
// Es un elemento decorativo: por defecto sale `aria-hidden`, porque siempre va
// pegado a un texto que ya dice lo mismo («Tentare ha encontrado…»). Solo si se
// le pasa `titulo` se anuncia como imagen con nombre.
// ─────────────────────────────────────────────────────────────────────────────

export interface TentareOrbProps {
  /** Lado en píxeles. Por debajo de ~16 px la iridiscencia deja de leerse. */
  tam?: number;
  /** `pensando` gira más deprisa: para mientras se está calculando algo. */
  estado?: 'reposo' | 'pensando';
  /** Si se pasa, el Orb deja de ser decorativo y se anuncia con este nombre. */
  titulo?: string;
  className?: string;
}

export function TentareOrb({ tam = 22, estado = 'reposo', titulo, className }: TentareOrbProps) {
  return (
    <span
      className={cn('orb-tentare', className)}
      data-estado={estado}
      style={{ width: tam, height: tam }}
      {...(titulo ? { role: 'img', 'aria-label': titulo } : { 'aria-hidden': true })}
    >
      <span className="orb-luz" />
    </span>
  );
}

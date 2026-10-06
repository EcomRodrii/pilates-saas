'use client';

import { useEstudio } from '@/components/student/contexto';
import { Icono } from '@/components/student/ui/Icono';
import { useToast } from '@/components/student/ui/Toast';
import { hoyISO } from '@/lib/student/formato';
import { enlaceCompartirClase, textoCompartirClase } from '@/lib/student/compartir-clase';
import { useCompartir } from '@/lib/student/use-compartir';
import type { Clase } from '@/lib/student/tipos';

type ClaseCompartida = Pick<Clase, 'id' | 'nombre' | 'fecha' | 'hora'>;

/**
 * Compartir ESTA clase: «¿Te vienes a Reformer el martes 7 a las 18:00?» con el enlace a esa clase en la página pública
 * del estudio (`?sesion=`), donde la amiga la ve y la reserva aunque no tenga cuenta, y con quién la invita (`invita=`).
 *
 * En la app y en móvil, la hoja de compartir del sistema; en escritorio, se copia y se dice SOLO si de verdad se copió
 * (`useCompartir` comprueba el portapapeles: «Copiado» con el portapapeles vacío ya salió mal en este repo).
 */
function useCompartirClase(clase: ClaseCompartida, socioId: string | null) {
  const { estudio } = useEstudio();
  const { hayHoja, compartir } = useCompartir();
  const { toast } = useToast();
  const alPulsar = async () => {
    const url = enlaceCompartirClase(window.location.origin, estudio.slug, { sesionId: clase.id, invita: socioId });
    const r = await compartir({ titulo: `${clase.nombre} · ${estudio.nombre}`, texto: textoCompartirClase(clase, hoyISO()), url });
    if (r === 'copiado') toast('Enlace copiado. Pégalo donde quieras.');
    else if (r === 'no-copiado') toast('No hemos podido copiarlo. Inténtalo de nuevo.');
  };
  return { hayHoja, alPulsar };
}

/** «Compartir esta clase» (P04): un icono sobre la foto, junto a la favorita. */
export function CompartirClase({ clase, socioId }: { clase: ClaseCompartida; socioId: string | null }) {
  const { hayHoja, alPulsar } = useCompartirClase(clase, socioId);
  return (
    <button
      type="button"
      // Redondo y suelto sobre la foto, como el corazón de al lado: crece en las dos direcciones.
      className="tap tap--icono"
      onClick={() => void alPulsar()}
      aria-label={hayHoja ? 'Compartir esta clase' : 'Copiar el enlace de esta clase'}
      data-testid="compartir-clase"
      style={{ width: 34, height: 34, border: 'none', borderRadius: 999, background: 'rgba(250,249,245,.92)', color: 'var(--foreground)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
    >
      <Icono nombre="compartir" tamano={18} />
    </button>
  );
}

/**
 * «Invita a una amiga a esta clase», con lo que gana (P04). Solo si el estudio premia invitar (`premioPorInvitar`), y
 * con la condición real en la frase: el premio llega si la amiga es nueva, crea su cuenta con ese enlace y viene a su
 * primera clase. El mismo enlace que el icono de compartir.
 *
 * ⚠️ Su nombre accesible no lleva «reservar»: las guardas de la ficha buscan el primer botón con esa palabra.
 */
export function InvitarAClaseFila({ clase, socioId, premio }: { clase: ClaseCompartida; socioId: string | null; premio: string }) {
  const { alPulsar } = useCompartirClase(clase, socioId);
  return (
    <button
      type="button"
      className="card card--tap"
      data-testid="invitar-a-clase"
      onClick={() => void alPulsar()}
      style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px', width: '100%', textAlign: 'left', font: 'inherit', color: 'inherit', cursor: 'pointer' }}
    >
      <span aria-hidden style={{ display: 'flex', flexShrink: 0, marginTop: 1, color: 'var(--accent)' }}><Icono nombre="compartir" tamano={20} /></span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span className="t-small" style={{ display: 'block', fontWeight: 800 }}>Invita a una amiga a esta clase</span>
        <span className="t-meta" style={{ display: 'block', marginTop: 2 }}>{premio}</span>
      </span>
      <span aria-hidden className="t-faint" style={{ display: 'flex', alignSelf: 'center' }}><Icono nombre="chevron-derecha" tamano={18} /></span>
    </button>
  );
}

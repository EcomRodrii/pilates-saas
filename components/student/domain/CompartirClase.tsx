'use client';

import { useEstudio } from '@/components/student/contexto';
import { Icono } from '@/components/student/ui/Icono';
import { useToast } from '@/components/student/ui/Toast';
import { hoyISO } from '@/lib/student/formato';
import { enlaceCompartirClase, textoCompartirClase } from '@/lib/student/compartir-clase';
import { useCompartir } from '@/lib/student/use-compartir';
import type { Clase } from '@/lib/student/tipos';

/**
 * «Compartir esta clase» (P04): un icono sobre la foto, junto a la favorita. Comparte «¿Te vienes a Reformer el martes 7
 * a las 18:00?» con el enlace a ESA clase en la página pública del estudio (`?sesion=`), donde la amiga la ve y la
 * reserva aunque no tenga cuenta, y lleva quién la invita (`invita=`).
 *
 * En la app y en móvil, la hoja de compartir del sistema; en escritorio, se copia y se dice SOLO si de verdad se copió
 * (`useCompartir` comprueba el portapapeles: «Copiado» con el portapapeles vacío ya salió mal en este repo).
 */
export function CompartirClase({ clase, socioId }: { clase: Pick<Clase, 'id' | 'nombre' | 'fecha' | 'hora'>; socioId: string | null }) {
  const { estudio } = useEstudio();
  const { hayHoja, compartir } = useCompartir();
  const { toast } = useToast();

  const alPulsar = async () => {
    const url = enlaceCompartirClase(window.location.origin, estudio.slug, { sesionId: clase.id, invita: socioId });
    const r = await compartir({ titulo: `${clase.nombre} · ${estudio.nombre}`, texto: textoCompartirClase(clase, hoyISO()), url });
    if (r === 'copiado') toast('Enlace copiado. Pégalo donde quieras.');
    else if (r === 'no-copiado') toast('No hemos podido copiarlo. Inténtalo de nuevo.');
  };

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

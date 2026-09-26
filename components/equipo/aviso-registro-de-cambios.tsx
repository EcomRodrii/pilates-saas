import { ScrollText } from 'lucide-react';
import { AVISO_AL_DAR_DE_ALTA, AVISO_EN_LA_PANTALLA_DE_EQUIPO } from '@/lib/auditoria/aviso-equipo';

/**
 * El aviso de que los cambios de dinero de quien trabaja en el panel quedan anotados
 * (libro `auditoria_estudio`, Cobros → «Cambios del equipo»).
 *
 * Lo da el estudio: es el responsable del tratamiento, y Tentare pone el sitio y el
 * texto. Llega a la propia persona por el correo de invitación
 * (lib/emails/tentare/equipo.ts); aquí se le recuerda a QUIEN invita, para que no
 * dé de alta a alguien sin saber que se anota lo que hace.
 *
 *  · `alta`: bajo el selector de rol, al dar de alta o editar a alguien que trabaja en el panel.
 *  · `pantalla`: nota fija de la pantalla de Equipo, solo para la propietaria (la única que ve el libro).
 */
export function AvisoRegistroDeCambios({ variante }: { variante: 'alta' | 'pantalla' }) {
  if (variante === 'alta') {
    return (
      <p data-testid="aviso-registro-alta" className="text-[11px] text-muted-foreground mt-2 flex items-start gap-1.5">
        <ScrollText size={12} className="shrink-0 mt-0.5" aria-hidden />
        {AVISO_AL_DAR_DE_ALTA}
      </p>
    );
  }
  return (
    <section
      data-testid="aviso-registro-equipo"
      aria-label="Registro de los cambios de dinero del equipo"
      className="rounded-2xl border border-border bg-card px-4 py-3 text-[12px] text-muted-foreground flex items-start gap-2.5"
    >
      <ScrollText size={14} className="shrink-0 mt-0.5" aria-hidden />
      <p>{AVISO_EN_LA_PANTALLA_DE_EQUIPO}</p>
    </section>
  );
}

import Link from 'next/link';
import { AyudaAntesDeEmpezar, AyudaResultado } from '@/components/ayuda/AyudaPasos';

export default function Contenido() {
  return (
    <>
      <AyudaAntesDeEmpezar>
        Esto describe el comportamiento por defecto. La penalización económica de la sección final solo aplica si
        tu estudio la ha activado explícitamente.
      </AyudaAntesDeEmpezar>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '24px 0 12px' }}>Cómo se marca un no-show</h2>
      <p>
        Cuando una clase termina, cualquier reserva que seguía CONFIRMADA sin que la alumna asistiera pasa sola a
        NO_ASISTIO — no hace falta que tú la marques a mano, aunque también puedes hacerlo desde la lista de
        asistentes de la clase si lo ves antes.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '28px 0 12px' }}>Cancelación tardía</h2>
      <p>
        Cada tipo de clase tiene su propia ventana de cancelación: cancelar dentro de ese margen antes del inicio se
        cuenta como tardía, igual que un no-show, a efectos de si el bono se devuelve o no.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '28px 0 12px' }}>Penalización económica (opcional)</h2>
      <p>
        Si tu estudio la ha activado, un no-show o una cancelación tardía puede generar un cargo a la tarjeta
        guardada de la alumna — con cobro automático o pendiente de tu aprobación, según cómo lo hayas configurado.
        No se cobra nunca sin que la alumna haya aceptado antes las condiciones que incluyen esa penalización.
        Una clase que cancela el propio estudio (por ejemplo, por mínimo de asistentes no alcanzado) nunca genera
        penalización a nadie.
      </p>

      <AyudaResultado>
        Un no-show no bloquea a la alumna para reservar de nuevo — es un registro en su historial, no una
        restricción automática. Si un cobro por penalización falla, sigue el mismo camino que cualquier otro cobro:
        ver <Link href="/ayuda/pagos/cobros-fallidos" style={{ color: 'inherit', textDecoration: 'underline' }}>cobros fallidos</Link>.
      </AyudaResultado>
    </>
  );
}

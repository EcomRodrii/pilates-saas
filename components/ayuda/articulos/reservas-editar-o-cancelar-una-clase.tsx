import Link from 'next/link';
import { AyudaCaptura } from '@/components/ayuda/AyudaCaptura';
import { AyudaAntesDeEmpezar, AyudaResultado } from '@/components/ayuda/AyudaPasos';

export default function Contenido() {
  return (
    <>
      <AyudaAntesDeEmpezar>
        Editar y cancelar viven en el mismo sitio: abre la clase desde el Calendario para las dos acciones.
      </AyudaAntesDeEmpezar>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '24px 0 12px' }}>Editar una clase</h2>
      <p>
        Desde el detalle de la clase (haz clic en ella en el Calendario), &ldquo;Editar&rdquo; abre este formulario:
        tipo de clase, sala, instructora, fecha, horario y aforo máximo.
      </p>
      <AyudaCaptura
        src="/help/reservas/editar-clase-form.png"
        alt="Formulario de edición de una clase existente, con los mismos campos que al crearla"
        caption="Editar clase — los mismos campos que al crearla."
      />
      <p>
        Si la clase forma parte de una serie recurrente, al guardar eliges &ldquo;Guardar solo esta clase&rdquo; o
        &ldquo;Guardar esta y las siguientes&rdquo;. Para cancelar pasa lo mismo: &ldquo;Cancelar&rdquo; quita solo
        esa clase y &ldquo;Cancelar serie&rdquo;, esa y las siguientes.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '28px 0 12px' }}>Cancelar una clase</h2>
      <p>
        Al cancelar, la clase se marca como cancelada y cada alumna con una reserva CONFIRMADA en ella recibe un
        aviso. Por defecto recuperan además la sesión en su bono; si prefieres que no, desactiva &ldquo;Devolver la
        sesión al cancelar una clase entera&rdquo; en Configuración &gt; Estudio &gt; Reservas y cancelaciones. Ese mismo
        ajuste decide qué pasa cuando una clase se cancela sola por no llegar al mínimo de asistentes o por un cierre
        del centro.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '28px 0 12px' }}>Qué NO cambia sola</h2>
      <p>
        Editar la hora de una clase no reordena su lista de espera ni fuerza nuevas reglas de antelación sobre
        reservas que ya existían — esas reglas se comprueban al reservar, no otra vez después.
      </p>

      <AyudaResultado>
        Cada alumna con reserva ve el cambio o la cancelación en su portal, con su notificación correspondiente. Si
        crees que a alguien no le ha llegado el aviso, revisa{' '}
        <Link href="/ayuda/problemas/no-llega-un-email" style={{ color: 'inherit', textDecoration: 'underline' }}>no llega un email</Link>.
      </AyudaResultado>
    </>
  );
}

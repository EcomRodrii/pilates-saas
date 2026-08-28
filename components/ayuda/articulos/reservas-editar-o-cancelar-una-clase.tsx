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
        Puedes cambiar hora, sala o instructora. Si la clase forma parte de una serie recurrente, se te pregunta el
        alcance del cambio: solo esa sesión, esa y las futuras, o toda la serie — igual que al cancelarla.
      </p>
      <AyudaCaptura alt="Selector de alcance al editar una clase de una serie" pendiente="modal de alcance de edición" />

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '28px 0 12px' }}>Cancelar una clase</h2>
      <p>
        Al cancelar, la clase se marca como cancelada y cada alumna con una reserva CONFIRMADA en ella recibe un
        aviso. La cancelación de una clase suelta o de una serie completa no devuelve el bono consumido salvo que lo
        hagas tú a mano desde la ficha de la clienta.
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

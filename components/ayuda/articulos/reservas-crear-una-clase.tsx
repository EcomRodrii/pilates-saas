import Link from 'next/link';
import { AyudaCaptura } from '@/components/ayuda/AyudaCaptura';
import { AyudaPaso, AyudaAntesDeEmpezar, AyudaResultado } from '@/components/ayuda/AyudaPasos';

// Verificado en vivo el 28-ago-2026 contra el panel real (Calendario > Nueva
// clase, cuenta de demostración).
export default function Contenido() {
  return (
    <>
      <AyudaAntesDeEmpezar>
        Necesitas al menos una sala y un tipo de clase creados en tu estudio, y si quieres asignarla a alguien, una{' '}
        <Link href="/ayuda/instructores/dar-de-alta-una-instructora" style={{ color: 'inherit', textDecoration: 'underline' }}>instructora dada de alta</Link>.
      </AyudaAntesDeEmpezar>

      <AyudaPaso numero={1} titulo="Abre el Calendario y crea una clase nueva">
        <p>Desde el panel, en Calendario, el botón &ldquo;Nueva clase&rdquo; abre este formulario.</p>
        <AyudaCaptura
          src="/help/reservas/calendario-nueva-clase.png"
          alt="Formulario de nueva clase: tipo, sala, instructora, fecha, horario, aforo máximo y repetición semanal"
          caption="El formulario real de Calendario &gt; Nueva clase."
        />
      </AyudaPaso>

      <AyudaPaso numero={2} titulo="Elige tipo de clase, sala e instructora">
        <p style={{ margin: 0 }}>
          El aforo máximo es un campo que tú fijas —normalmente igual a la capacidad de la sala, pero puedes bajarlo
          para una clase concreta (por ejemplo, si una máquina está averiada ese día). Al llenarse, las siguientes
          reservas entran en lista de espera; no se bloquean.
        </p>
      </AyudaPaso>

      <AyudaPaso numero={3} titulo="Clase suelta o serie recurrente">
        <p>
          El interruptor &ldquo;Repetir semanalmente&rdquo; convierte la clase en una serie. Editar o cancelar
          después una serie te deja elegir si el cambio afecta solo a esa sesión, a esa y las futuras, o a toda la
          serie — ver <Link href="/ayuda/reservas/editar-o-cancelar-una-clase" style={{ color: 'inherit', textDecoration: 'underline' }}>editar o cancelar una clase</Link>.
        </p>
      </AyudaPaso>

      <AyudaResultado>
        La clase aparece en tu Calendario y, si no está oculta, en tu portal de reservas públicas — al momento, sin
        publicar nada aparte.
      </AyudaResultado>
    </>
  );
}

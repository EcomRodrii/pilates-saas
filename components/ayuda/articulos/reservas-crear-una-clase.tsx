import Link from 'next/link';
import { AyudaCaptura } from '@/components/ayuda/AyudaCaptura';
import { AyudaPaso, AyudaAntesDeEmpezar, AyudaResultado } from '@/components/ayuda/AyudaPasos';

// Captura pendiente: mismo motivo que el resto de artículos de panel — sin
// forma de guardar a disco el PNG del navegador de vista previa en esta
// sesión. El contenido sigue el modelo real (sesiones/salas/tipos de clase),
// no una suposición.
export default function Contenido() {
  return (
    <>
      <AyudaAntesDeEmpezar>
        Necesitas al menos una sala y un tipo de clase creados en tu estudio, y si quieres asignarla a alguien, una{' '}
        <Link href="/ayuda/instructores/dar-de-alta-una-instructora" style={{ color: 'inherit', textDecoration: 'underline' }}>instructora dada de alta</Link>.
      </AyudaAntesDeEmpezar>

      <AyudaPaso numero={1} titulo="Abre el Calendario y crea una clase nueva">
        <p>Desde el panel, en Calendario, el botón de nueva clase abre el formulario con la fecha y hora que hayas seleccionado en la vista.</p>
        <AyudaCaptura alt="Calendario del panel con el formulario de nueva clase abierto" pendiente="vista de Calendario" />
      </AyudaPaso>

      <AyudaPaso numero={2} titulo="Elige tipo de clase, sala e instructora">
        <p style={{ margin: 0 }}>
          El aforo lo marca la capacidad de la sala que elijas, no un número que escribas a mano — si una sala tiene
          menos puestos disponibles ese día (por ejemplo, una máquina averiada), la capacidad de esa clase concreta
          baja sola.
        </p>
      </AyudaPaso>

      <AyudaPaso numero={3} titulo="Clase suelta o serie recurrente">
        <p>
          Puedes crear una única clase o una serie que se repite cada semana en el mismo horario. Editar o cancelar
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

import Link from 'next/link';
import { AyudaCaptura } from '@/components/ayuda/AyudaCaptura';
import { AyudaPaso, AyudaResultado } from '@/components/ayuda/AyudaPasos';

export default function Contenido() {
  return (
    <>
      <AyudaPaso numero={1} titulo="Ve a Configuración > Planes y tarifas">
        <p>Ahí ves todos tus planes activos, y el botón para crear uno nuevo.</p>
        <AyudaCaptura alt="Listado de planes en Configuración" pendiente="listado de planes" />
      </AyudaPaso>

      <AyudaPaso numero={2} titulo="Elige el tipo y complétalo">
        <p style={{ margin: 0 }}>
          Nombre, tipo (bono, cuota mensual o puntual — ver{' '}
          <Link href="/ayuda/bonos/tipos-de-bono" style={{ color: 'inherit', textDecoration: 'underline' }}>tipos de bono</Link>), precio, número de sesiones si aplica, y si quieres limitarlo a un tipo de clase concreto.
        </p>
      </AyudaPaso>

      <AyudaResultado>
        En cuanto lo guardas, el plan ya está disponible para asignar a una clienta o para que ella lo compre desde
        el checkout de tu portal.
      </AyudaResultado>
    </>
  );
}

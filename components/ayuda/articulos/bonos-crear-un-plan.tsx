import Link from 'next/link';
import { AyudaPaso, AyudaResultado } from '@/components/ayuda/AyudaPasos';

// Sin captura desde el 13-sep: la que había era de Configuración → Planes y
// tarifas, pantalla que se quitó al dejar las tarifas solo en Paquetes. Mejor
// ninguna imagen que una de una pantalla que ya no existe.
export default function Contenido() {
  return (
    <>
      <AyudaPaso numero={1} titulo="Ve a Paquetes">
        <p>
          En el menú, <strong>Paquetes</strong>. Ahí tienes tus tarifas separadas en Suscripciones, Bonos y Bajo
          demanda, y el botón <strong>Crear</strong> para una nueva.
        </p>
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

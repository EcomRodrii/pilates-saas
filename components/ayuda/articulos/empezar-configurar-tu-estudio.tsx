import Link from 'next/link';
import { AyudaResultado } from '@/components/ayuda/AyudaPasos';

export default function Contenido() {
  return (
    <>
      <p>
        En Configuración &gt; Estudio pones los datos que verán tus alumnas y los que necesitas para facturar
        correctamente: nombre, NIF, dirección, y el color y logo de tu marca.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '24px 0 12px' }}>Datos fiscales</h2>
      <p>
        Nombre fiscal, NIF y dirección — son los que aparecen en cada factura que genera un cobro. Merece la pena
        revisarlos antes de tu primer cobro real, porque cambiarlos después no corrige facturas ya emitidas.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '28px 0 12px' }}>Color y logo</h2>
      <p>
        El color de marca y el logo que subas aquí se usan en tu portal de reservas y en el widget — es lo primero
        que distingue tu estudio del de cualquier otra propietaria de Tentare.
      </p>

      <AyudaResultado>
        Ninguno de estos datos es obligatorio para empezar a usar Tentare — puedes completarlos poco a poco. Lo
        único que conviene tener listo antes de tu primer cobro es el NIF y la dirección fiscal. Sigue con{' '}
        <Link href="/ayuda/empezar/primera-semana-de-clases" style={{ color: 'inherit', textDecoration: 'underline' }}>preparar tu primera semana de clases</Link>.
      </AyudaResultado>
    </>
  );
}

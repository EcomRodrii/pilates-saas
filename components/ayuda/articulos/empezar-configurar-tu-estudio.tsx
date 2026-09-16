import Link from 'next/link';
import { AyudaResultado } from '@/components/ayuda/AyudaPasos';

export default function Contenido() {
  return (
    <>
      <p>
        En Configuración pones los datos que verán tus alumnas y los que necesitas para facturar correctamente: el
        nombre y la dirección en Mi estudio, el NIF en Cobros y facturas, y el color y el logo de tu marca en Marca.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '24px 0 12px' }}>Datos fiscales</h2>
      <p>
        Nombre fiscal, NIF y dirección — son los que aparecen en cada factura que genera un cobro. El nombre fiscal y el
        NIF están en Cobros y facturas, en «Datos fiscales e IVA». Merece la pena revisarlos antes de tu primer cobro
        real, porque cambiarlos después no corrige facturas ya emitidas.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '28px 0 12px' }}>Color y logo</h2>
      <p>
        El logo y el color están en Configuración &gt; Marca: el logo lo subes en «Logo y favicon», que se guarda al
        elegir el archivo, y el color lo pruebas en «El color de tu marca» antes de pulsar «Guardar».
        Los dos los ven tus alumnas en tu página de reservas y en su app — es lo
        primero que distingue tu estudio del de cualquier otra propietaria de Tentare.
      </p>

      <AyudaResultado>
        Ninguno de estos datos es obligatorio para empezar a usar Tentare — puedes completarlos poco a poco. Lo
        único que conviene tener listo antes de tu primer cobro es el NIF y la dirección fiscal. Sigue con{' '}
        <Link href="/ayuda/empezar/primera-semana-de-clases" style={{ color: 'inherit', textDecoration: 'underline' }}>preparar tu primera semana de clases</Link>.
      </AyudaResultado>
    </>
  );
}

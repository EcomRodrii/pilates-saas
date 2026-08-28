import Link from 'next/link';
import { AyudaResultado } from '@/components/ayuda/AyudaPasos';

export default function Contenido() {
  return (
    <>
      <p>
        En Configuración &gt; Estudio guardas el nombre fiscal, el NIF y la dirección de tu negocio — los datos que
        aparecen en cada factura que se genera.
      </p>
      <p>
        Revísalos antes de tu primer cobro: cambiarlos después no corrige las facturas que ya se hayan emitido con
        los datos anteriores.
      </p>
      <AyudaResultado>
        Relacionado: <Link href="/ayuda/pagos/facturas" style={{ color: 'inherit', textDecoration: 'underline' }}>facturas y Veri*Factu</Link>.
      </AyudaResultado>
    </>
  );
}

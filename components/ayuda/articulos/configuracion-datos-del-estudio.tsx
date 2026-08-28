import Link from 'next/link';
import { AyudaCaptura } from '@/components/ayuda/AyudaCaptura';
import { AyudaResultado } from '@/components/ayuda/AyudaPasos';

// Verificado en vivo el 28-ago-2026 contra Configuración > Estudio > General.
export default function Contenido() {
  return (
    <>
      <p>
        En Configuración &gt; Estudio &gt; General guardas los datos de tu negocio: nombre del estudio, razón
        social, NIF/CIF, teléfono, dirección, ciudad, código postal, web y un email de contacto.
      </p>

      <AyudaCaptura
        src="/help/configuracion/configuracion-estudio.png"
        alt="Configuración > Estudio > General: información del estudio, marca, facturación e impuestos, y recarga de datos"
        caption="Configuración &gt; Estudio — datos, IVA, marca (enlazada aparte) y sincronización."
      />

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '28px 0 12px' }}>Cómo te presentas y normas del centro</h2>
      <p>
        Dos campos de texto libre que salen directamente en tu página de reservas: una descripción de tu estudio, y
        las normas del centro (una por línea) que ven tus alumnas en su app, en «Mi centro». Si los dejas vacíos,
        esos bloques simplemente no se pintan — no hay texto de relleno.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '28px 0 12px' }}>Facturación e impuestos</h2>
      <p>
        El IVA general que se aplica a tus próximas facturas se fija aquí. Cambiarlo no toca las facturas ya
        emitidas y selladas con Veri*Factu — solo afecta a partir de ese momento.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '28px 0 12px' }}>Más pestañas dentro de Estudio</h2>
      <p>
        Además de General, esta misma sección tiene pestañas propias para Horario, Reservas y cancelaciones, Cobros,
        Enlaces y Legal — cada una con sus reglas, no mezcladas con los datos fiscales.
      </p>

      <AyudaResultado>
        Revisa el NIF y la dirección antes de tu primer cobro: cambiarlos después no corrige las facturas que ya se
        hayan emitido con los datos anteriores. Relacionado:{' '}
        <Link href="/ayuda/pagos/facturas" style={{ color: 'inherit', textDecoration: 'underline' }}>facturas y Veri*Factu</Link>.
      </AyudaResultado>
    </>
  );
}

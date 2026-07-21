import type { Metadata } from 'next';
import { LegalPage, H2 } from '@/components/marketing/legal-page';

export const metadata: Metadata = { title: 'Política de privacidad | Tentare' };

export default function Page() {
  return (
    <LegalPage titulo="Política de privacidad" actualizado="julio de 2026">
      <H2>1. Responsable del tratamiento</H2>
      <p>
        <code>[razón social — placeholder]</code>, CIF <code>[CIF — placeholder]</code>, es responsable del tratamiento de los datos personales
        que se recogen a través de este sitio y de la aplicación Tentare. Contacto: hola@tentare.es.
      </p>
      <H2>2. Qué datos tratamos</H2>
      <p>
        Según el uso que hagas del servicio: datos de la persona propietaria/staff del estudio (nombre, email, teléfono), datos de las socias
        que gestione el estudio (nombre, email, teléfono, historial de reservas y pagos) y datos técnicos de uso de la aplicación.
      </p>
      <H2>3. Finalidad</H2>
      <p>
        Prestar el servicio contratado (gestión del estudio), procesar pagos a través de Stripe, enviar comunicaciones transaccionales
        (confirmaciones, recordatorios, recibos) y, cuando el estudio lo active, comunicaciones de marketing a sus propias socias.
      </p>
      <H2>4. Base legal</H2>
      <p>Ejecución del contrato de servicio (relación estudio–Tentare) e interés legítimo para las comunicaciones estrictamente transaccionales.</p>
      <H2>5. Dónde se alojan los datos</H2>
      <p>
        Los datos se alojan en infraestructura dentro de la Unión Europea. Los pagos se procesan por Stripe, que actúa como encargado del
        tratamiento para esa función.
      </p>
      <H2>6. Tus derechos</H2>
      <p>
        Puedes ejercer tus derechos de acceso, rectificación, supresión, oposición, portabilidad y limitación escribiendo a hola@tentare.es.
        Un estudio cliente puede exportar o borrar los datos de sus socias en cualquier momento desde su cuenta.
      </p>
      <H2>7. Conservación</H2>
      <p>Se conservan mientras dure la relación de servicio y, después, el tiempo exigido por la normativa fiscal y contable aplicable.</p>
    </LegalPage>
  );
}

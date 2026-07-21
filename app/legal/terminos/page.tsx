import type { Metadata } from 'next';
import { LegalPage, H2 } from '@/components/marketing/legal-page';

export const metadata: Metadata = { title: 'Términos del servicio | Tentare' };

export default function Page() {
  return (
    <LegalPage titulo="Términos del servicio" actualizado="julio de 2026">
      <H2>1. Objeto del contrato</H2>
      <p>
        Estos términos regulan el uso de Tentare, un software de gestión (SaaS) para estudios de Pilates, prestado por{' '}
        <code>[razón social — placeholder]</code>.
      </p>
      <H2>2. Suscripción y precios</H2>
      <p>
        El servicio se contrata por suscripción mensual según el plan elegido (ver /#precios). Los precios pueden actualizarse; se avisará
        con antelación razonable de cualquier cambio.
      </p>
      <H2>3. Sin permanencia</H2>
      <p>
        No hay periodo de permanencia obligatorio. Puedes cancelar tu suscripción en cualquier momento desde tu cuenta; el acceso se
        mantiene hasta el final del periodo ya pagado.
      </p>
      <H2>4. Tus datos al cancelar</H2>
      <p>Puedes exportar los datos de tus socias, historial de asistencia y facturas en cualquier momento, te quedes o canceles.</p>
      <H2>5. Comisiones</H2>
      <p>
        Tentare no cobra comisión sobre los cobros que proceses a través de la plataforma. Los pagos se procesan por Stripe, que aplica su
        propia tarifa de procesamiento, ajena a Tentare.
      </p>
      <H2>6. Responsabilidad</H2>
      <p>
        El servicio se presta &ldquo;tal cual&rdquo; y con la disponibilidad razonable propia de un SaaS. No garantizamos disponibilidad ininterrumpida
        al 100%, aunque trabajamos para minimizar interrupciones.
      </p>
      <H2>7. Modificaciones</H2>
      <p>Podemos actualizar estos términos; los cambios relevantes se comunicarán a los estudios con cuenta activa.</p>
      <H2>8. Legislación y jurisdicción</H2>
      <p>Estos términos se rigen por la legislación española.</p>
    </LegalPage>
  );
}

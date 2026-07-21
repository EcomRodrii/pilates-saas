import type { Metadata } from 'next';
import { LegalPage, H2 } from '@/components/marketing/legal-page';

export const metadata: Metadata = { title: 'Seguridad | Tentare' };

export default function Page() {
  return (
    <LegalPage titulo="Seguridad" actualizado="julio de 2026">
      <H2>1. Cifrado</H2>
      <p>Toda la comunicación entre tu navegador y Tentare viaja cifrada (HTTPS/TLS). Los datos en reposo se almacenan cifrados.</p>
      <H2>2. Pagos</H2>
      <p>
        No almacenamos datos de tarjeta. Los pagos se procesan íntegramente por Stripe, certificado PCI-DSS de nivel 1 — Tentare nunca ve ni
        guarda el número completo de tu tarjeta.
      </p>
      <H2>3. Acceso y autenticación</H2>
      <p>
        El acceso a cada estudio está aislado por cuenta: el personal solo ve los datos de su propio estudio. Las cuentas de propietaria y
        equipo requieren verificación de email antes de poder operar.
      </p>
      <H2>4. Aislamiento de datos entre estudios</H2>
      <p>Cada consulta a la base de datos está acotada al estudio de la sesión — un estudio nunca puede ver ni modificar los datos de otro.</p>
      <H2>5. Reportar un problema de seguridad</H2>
      <p>
        Si detectas una vulnerabilidad, escríbenos a hola@tentare.es con el detalle técnico. Agradecemos y priorizamos los reportes
        responsables.
      </p>
    </LegalPage>
  );
}

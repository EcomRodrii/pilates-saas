import type { Metadata } from 'next';
import { LegalPage, H2 } from '@/components/marketing/legal-page';

export const metadata: Metadata = { title: 'Aviso legal | Tentare' };

export default function Page() {
  return (
    <LegalPage titulo="Aviso legal" actualizado="julio de 2026">
      <H2>1. Titular</H2>
      <p>
        En cumplimiento de la Ley 34/2002, de Servicios de la Sociedad de la Información y Comercio Electrónico (LSSI-CE), se informa de los
        siguientes datos: Titular: <code>[razón social — placeholder]</code>, CIF: <code>[CIF — placeholder]</code>, domicilio: <code>[dirección — placeholder]</code>,
        email de contacto: hola@tentare.es.
      </p>
      <H2>2. Objeto</H2>
      <p>
        Este sitio web y la aplicación Tentare ofrecen un servicio de software como servicio (SaaS) de gestión para estudios de Pilates:
        reservas, membresías, cobros, comunicación con socias y funciones asociadas.
      </p>
      <H2>3. Condiciones de uso</H2>
      <p>
        El acceso y uso de este sitio atribuye la condición de usuario e implica la aceptación de este aviso legal. El uso del producto como
        cliente registrado se rige además por los <a href="/legal/terminos" style={{ color: '#B57A8E' }}>Términos del servicio</a>.
      </p>
      <H2>4. Propiedad intelectual</H2>
      <p>
        El diseño, código, marca y contenidos de este sitio son propiedad de <code>[razón social — placeholder]</code> o se usan con la licencia
        correspondiente. No se autoriza su reproducción sin permiso expreso.
      </p>
      <H2>5. Legislación aplicable</H2>
      <p>Este aviso legal se rige por la legislación española.</p>
    </LegalPage>
  );
}

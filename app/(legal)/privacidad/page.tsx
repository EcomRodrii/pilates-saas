import type { Metadata } from 'next';
import { LEGAL, PROVEEDORES } from '@/lib/legal-info';

export const metadata: Metadata = {
  title: 'Política de privacidad · Tentare',
  description: 'Cómo Tentare trata los datos personales conforme al RGPD y la LOPDGDD.',
};

export default function Privacidad() {
  return (
    <>
      <h1>Política de privacidad</h1>
      <p className="lead">
        Cómo tratamos tus datos personales conforme al Reglamento (UE) 2016/679 (RGPD) y a la Ley Orgánica
        3/2018 (LOPDGDD).
      </p>

      <h2>1. Responsable del tratamiento</h2>
      <ul>
        <li><strong>Responsable:</strong> {LEGAL.titular} (NIF {LEGAL.nif})</li>
        <li><strong>Domicilio:</strong> {LEGAL.domicilio}</li>
        <li><strong>Contacto en materia de privacidad:</strong> <a href={`mailto:${LEGAL.emailPrivacidad}`}>{LEGAL.emailPrivacidad}</a></li>
      </ul>

      <h2>2. Roles: cuándo somos responsables y cuándo encargados</h2>
      <p>
        Respecto de los datos de las <strong>cuentas de estudio y su personal</strong> (registro, facturación,
        soporte), {LEGAL.marca} actúa como <strong>responsable</strong>. Respecto de los datos que cada estudio
        introduce sobre <strong>sus clientas</strong> para gestionar su actividad, {LEGAL.marca} actúa como{' '}
        <strong>encargado del tratamiento</strong> por cuenta del estudio, que es el responsable de esos datos;
        el marco de ese tratamiento se recoge en los <a href="/terminos">Términos y Condiciones</a> (acuerdo de
        encargo, art. 28 RGPD).
      </p>

      <h2>3. Datos que tratamos y finalidades</h2>
      <table>
        <thead>
          <tr><th>Datos</th><th>Finalidad</th><th>Base jurídica</th></tr>
        </thead>
        <tbody>
          <tr><td>Identificación y contacto (nombre, email)</td><td>Crear y gestionar tu cuenta y darte el servicio</td><td>Ejecución del contrato</td></tr>
          <tr><td>Datos de facturación y pago</td><td>Cobrar la suscripción y emitir facturas</td><td>Ejecución del contrato / obligación legal</td></tr>
          <tr><td>Datos de uso y registros técnicos</td><td>Seguridad, prevención del fraude y mejora del servicio</td><td>Interés legítimo</td></tr>
          <tr><td>Comunicaciones y soporte</td><td>Atender tus consultas e informarte del servicio</td><td>Ejecución del contrato / interés legítimo</td></tr>
          <tr><td>Comunicaciones comerciales</td><td>Enviarte novedades del producto</td><td>Consentimiento (revocable)</td></tr>
        </tbody>
      </table>
      <p>
        No se realizan decisiones automatizadas con efectos jurídicos significativos sobre las personas. No se
        tratan categorías especiales de datos de las cuentas; los datos de salud que un estudio pueda registrar
        sobre sus clientas se tratan por cuenta y bajo la responsabilidad del estudio, con acceso restringido.
      </p>

      <h2>4. Conservación</h2>
      <p>
        Conservamos los datos mientras la relación esté vigente y, después, durante los plazos legalmente
        exigibles (por ejemplo, la normativa mercantil y fiscal impone conservar la facturación). Cerrada la
        cuenta, los datos se suprimen o anonimizan una vez transcurridos dichos plazos.
      </p>

      <h2>5. Destinatarios y encargados</h2>
      <p>
        No vendemos tus datos. Para prestar el servicio recurrimos a proveedores que actúan como encargados o
        subencargados, con contrato conforme al art. 28 RGPD:
      </p>
      <table>
        <thead>
          <tr><th>Proveedor</th><th>Uso</th><th>Ubicación</th></tr>
        </thead>
        <tbody>
          {PROVEEDORES.map((p) => (
            <tr key={p.nombre}><td>{p.nombre}</td><td>{p.uso}</td><td>{p.ubicacion}</td></tr>
          ))}
        </tbody>
      </table>
      <p>
        Cuando algún proveedor implique transferencias internacionales fuera del Espacio Económico Europeo,
        estas se amparan en garantías adecuadas (decisiones de adecuación o cláusulas contractuales tipo de la
        Comisión Europea).
      </p>

      <h2>6. Tus derechos</h2>
      <p>
        Puedes ejercer los derechos de <strong>acceso, rectificación, supresión, oposición, limitación del
        tratamiento y portabilidad</strong>, así como retirar el consentimiento prestado, escribiendo a{' '}
        <a href={`mailto:${LEGAL.emailPrivacidad}`}>{LEGAL.emailPrivacidad}</a>. Si consideras que el
        tratamiento no se ajusta a la normativa, puedes reclamar ante la Agencia Española de Protección de
        Datos (<a href="https://www.aepd.es" target="_blank" rel="noopener noreferrer">aepd.es</a>). Si eres
        clienta de un estudio, dirige tu solicitud al estudio como responsable; te ayudaremos a canalizarla.
      </p>

      <h2>7. Seguridad</h2>
      <p>
        Aplicamos medidas técnicas y organizativas apropiadas (cifrado en tránsito, control de acceso por
        roles, aislamiento por estudio y registro de accesos a los datos sensibles) para proteger los datos
        frente a accesos no autorizados, pérdida o alteración.
      </p>

      <h2>8. Menores</h2>
      <p>
        El servicio se dirige a profesionales y no está destinado a menores de edad. No recabamos
        conscientemente datos de menores para la creación de cuentas.
      </p>

      <h2>9. Cambios</h2>
      <p>
        Podemos actualizar esta política para reflejar cambios legales o del servicio. Publicaremos la versión
        vigente en esta página, indicando su fecha de actualización.
      </p>

      <p style={{ marginTop: 24, fontSize: 13, color: '#767d85' }}>
        El texto de este documento es de plantilla y está pendiente de revisión por asesoría jurídica.
      </p>
    </>
  );
}

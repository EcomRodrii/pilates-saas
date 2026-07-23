import type { Metadata } from 'next';
import { LEGAL } from '@/lib/legal-info';

export const metadata: Metadata = {
  title: 'Términos y condiciones · Tentare',
  description: 'Condiciones de uso del servicio Tentare para estudios de Pilates.',
};

export default function Terminos() {
  return (
    <>
      <h1>Términos y condiciones</h1>
      <p className="lead">
        Condiciones que regulan la contratación y el uso de {LEGAL.marca}. Al registrarte y usar el servicio
        aceptas estos términos.
      </p>

      <h2>1. Objeto</h2>
      <p>
        {LEGAL.marca} es un software como servicio (SaaS) que permite a estudios de Pilates y actividades
        afines gestionar su operativa (reservas, clientas, cobros, calendario, equipo y funciones
        relacionadas). El titular del servicio es {LEGAL.titular} (empresario individual / autónomo).
      </p>

      <h2>2. Cuenta y registro</h2>
      <p>
        Para usar el servicio debes crear una cuenta con información veraz y mantener la confidencialidad de tus
        credenciales. Eres responsable de la actividad que se realice bajo tu cuenta y de las personas de tu
        equipo a las que des acceso.
      </p>

      <h2>3. Planes, precios y pagos</h2>
      <p>
        El servicio se presta mediante suscripción según el plan contratado y los precios publicados. Los pagos
        se procesan a través de nuestro proveedor de pagos (Stripe). Salvo indicación en contrario, la
        suscripción se renueva por periodos y puedes cancelarla en cualquier momento; la cancelación surte
        efecto al final del periodo ya abonado, sin permanencia. Los importes no incluyen impuestos cuando así
        se indique.
      </p>

      <h2>4. Uso aceptable</h2>
      <p>
        Te comprometes a no usar el servicio para fines ilícitos, a no vulnerar derechos de terceros, a no
        introducir código malicioso y a no intentar acceder de forma no autorizada a la plataforma o a datos de
        otros estudios. Podremos suspender cuentas que incumplan estas condiciones.
      </p>

      <h2>5. Datos de tus clientas</h2>
      <p>
        Los datos que introduces sobre tus clientas son de tu titularidad y responsabilidad; {LEGAL.marca} los
        trata por tu cuenta como encargado del tratamiento, conforme a la{' '}
        <a href="/privacidad">Política de Privacidad</a> y a la normativa de protección de datos. Eres
        responsable de contar con la base jurídica adecuada para tratarlos.
      </p>

      <h2>6. Disponibilidad</h2>
      <p>
        Trabajamos para ofrecer un servicio estable, pero no garantizamos una disponibilidad ininterrumpida.
        Podremos realizar tareas de mantenimiento e introducir mejoras o cambios en las funcionalidades.
      </p>

      <h2>7. Propiedad intelectual</h2>
      <p>
        El software, la marca y los contenidos de {LEGAL.marca} son titularidad del prestador. La contratación
        otorga un derecho de uso no exclusivo e intransferible mientras la suscripción esté vigente, sin
        transmitir la titularidad del software.
      </p>

      <h2>8. Limitación de responsabilidad</h2>
      <p>
        En la medida permitida por la ley, {LEGAL.marca} no responderá de daños indirectos o lucro cesante. Lo
        anterior no limita las responsabilidades que legalmente no puedan excluirse, en particular frente a
        personas consumidoras.
      </p>

      <h2>9. Duración, terminación y continuidad de tus datos</h2>
      <p>
        Puedes dar de baja tu cuenta cuando quieras. En caso de que decidiéramos discontinuar el servicio, te
        avisaríamos con una antelación mínima de <strong>90 días</strong>. En cualquier caso, mientras la cuenta
        esté activa y durante un periodo razonable tras su baja, dispondrás de una{' '}
        <strong>exportación legible de tus datos</strong> (clientas, reservas, cobros y facturación) para que
        nunca queden retenidos ni dependas de {LEGAL.marca} para conservarlos.
      </p>

      <h2>10. Modificaciones</h2>
      <p>
        Podremos modificar estos términos por motivos legales, técnicos o de negocio. Te informaremos de los
        cambios sustanciales y la versión vigente estará siempre publicada en esta página.
      </p>

      <h2>11. Ley aplicable y jurisdicción</h2>
      <p>
        Estos términos se rigen por la legislación española. Para cualquier controversia, y cuando la normativa
        lo permita, las partes se someten a los juzgados y tribunales del domicilio del titular, sin perjuicio
        del fuero que corresponda legalmente a las personas consumidoras.
      </p>

      <p style={{ marginTop: 24, fontSize: 13, color: '#767d85' }}>
        El texto de este documento es de plantilla y está pendiente de revisión por asesoría jurídica.
      </p>
    </>
  );
}

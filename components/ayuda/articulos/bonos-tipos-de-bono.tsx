import Link from 'next/link';
import { AyudaResultado } from '@/components/ayuda/AyudaPasos';

export default function Contenido() {
  return (
    <>
      <p>Tentare soporta tres tipos de plan, y puedes combinarlos: una alumna puede tener a la vez, por ejemplo, una cuota mensual y un bono suelto.</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, margin: '20px 0' }}>
        {[
          ['Bono de sesiones', 'Un número fijo de clases para consumir antes de una fecha de caducidad. Ideal para quien no viene cada semana.'],
          ['Cuota mensual', 'Acceso recurrente que se renueva y cobra solo cada mes, con o sin límite de clases.'],
          ['Puntual', 'Una sola clase suelta, sin plan detrás — para quien prueba tu estudio por primera vez.'],
        ].map(([tipo, texto]) => (
          <div key={tipo} style={{ border: '1px solid #E7E7E0', borderRadius: 14, padding: '14px 18px' }}>
            <p style={{ fontWeight: 700, fontSize: 15, margin: '0 0 4px' }}>{tipo}</p>
            <p style={{ fontSize: 14, lineHeight: 1.55, color: '#5A5A52', margin: 0 }}>{texto}</p>
          </div>
        ))}
      </div>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '28px 0 12px' }}>Limitar un plan a un tipo de clase</h2>
      <p>
        Cualquiera de los tres puede restringirse a un tipo de clase concreto (por ejemplo, un bono solo válido para
        &ldquo;Reformer&rdquo;) en vez de cubrir todas tus clases por igual.</p>

      <AyudaResultado>
        No hay un cuarto modelo de &ldquo;plaza fija con recuperaciones&rdquo; como plan separado — se construye combinando una
        cuota mensual con las reglas de reserva de ese tipo de clase. Sigue con{' '}
        <Link href="/ayuda/bonos/crear-un-plan" style={{ color: 'inherit', textDecoration: 'underline' }}>cómo crear un plan</Link>.
      </AyudaResultado>
    </>
  );
}

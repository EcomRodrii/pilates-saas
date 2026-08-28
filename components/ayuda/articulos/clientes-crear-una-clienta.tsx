import Link from 'next/link';
import { AyudaAntesDeEmpezar, AyudaResultado } from '@/components/ayuda/AyudaPasos';

export default function Contenido() {
  return (
    <>
      <AyudaAntesDeEmpezar>
        La mayoría de tus clientas no las das de alta tú: se apuntan solas al reservar por primera vez desde tu{' '}
        <Link href="/ayuda/portal/que-es-el-portal" style={{ color: 'inherit', textDecoration: 'underline' }}>portal de reservas</Link>.
      </AyudaAntesDeEmpezar>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '24px 0 12px' }}>Alta automática desde el portal</h2>
      <p>
        Cuando alguien reserva una clase desde tu página pública con un email que no reconocemos, Tentare crea su
        ficha de clienta sola, en el momento de esa primera reserva — no hace falta que tú hagas nada antes.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '28px 0 12px' }}>Alta manual desde el panel</h2>
      <p>
        Si prefieres crearla tú (por ejemplo, alguien que te escribe por WhatsApp antes de reservar), puedes darla de
        alta directamente en Clientas, con su nombre y email como mínimo. Puedes asignarle un plan o bono en el
        mismo momento o más tarde.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '28px 0 12px' }}>Si vienes de otro software</h2>
      <p>
        Para dar de alta a todas tus clientas de golpe al migrar, usa la{' '}
        <Link href="/ayuda/clientes/importar-clientes" style={{ color: 'inherit', textDecoration: 'underline' }}>importación por archivo</Link> en vez de crearlas una a una.
      </p>

      <AyudaResultado>
        En cuanto existe, su ficha ya está lista para reservas, bonos, notas y su acceso al portal — ver{' '}
        <Link href="/ayuda/clientes/ficha-de-clienta" style={{ color: 'inherit', textDecoration: 'underline' }}>la ficha de clienta</Link>.
      </AyudaResultado>
    </>
  );
}

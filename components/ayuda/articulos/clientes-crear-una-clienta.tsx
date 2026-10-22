import Link from 'next/link';
import { AyudaAntesDeEmpezar, AyudaResultado } from '@/components/ayuda/AyudaPasos';

export default function Contenido() {
  return (
    <>
      <AyudaAntesDeEmpezar>
        La mayoría de tus clientas no las das de alta tú: se apuntan solas al reservar por primera vez desde{' '}
        <Link href="/ayuda/portal/que-es-el-portal" style={{ color: 'inherit', textDecoration: 'underline' }}>la app de tus alumnas</Link>.
      </AyudaAntesDeEmpezar>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '24px 0 12px' }}>Alta automática desde la app</h2>
      <p>
        Cuando alguien entra en la app de tus alumnas con un email que no reconocemos, escribe el código que le llega y
        acepta las condiciones de tu estudio, Tentare crea su ficha de clienta sola — no hace falta que tú hagas nada
        antes. Si reserva desde tu web con el widget o con la página de reservas, su ficha se crea en esa primera
        reserva.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '28px 0 12px' }}>Alta manual desde el panel</h2>
      <p>
        Si prefieres crearla tú (por ejemplo, alguien que te escribe por WhatsApp antes de reservar), puedes darla de
        alta directamente en Clientas, con nombre y apellidos como mínimo (el email es opcional, aunque sin él no
        podrá entrar a su app). Si puedes cobrar, le asignas un plan o bono en el mismo momento o más tarde.
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

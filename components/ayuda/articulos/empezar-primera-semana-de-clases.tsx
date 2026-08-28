import Link from 'next/link';
import { AyudaPaso, AyudaResultado } from '@/components/ayuda/AyudaPasos';

export default function Contenido() {
  return (
    <>
      <AyudaPaso numero={1} titulo="Crea tus salas y tipos de clase">
        <p>Desde Configuración &gt; Clases y salas: cada sala con su capacidad real, y cada tipo de clase (Reformer, Mat, lo que dé tu estudio).</p>
      </AyudaPaso>

      <AyudaPaso numero={2} titulo="Da de alta a tu equipo, si lo tienes">
        <p>
          Ver <Link href="/ayuda/instructores/dar-de-alta-una-instructora" style={{ color: 'inherit', textDecoration: 'underline' }}>dar de alta a una instructora</Link>. Si trabajas sola, puedes saltarte este paso.
        </p>
      </AyudaPaso>

      <AyudaPaso numero={3} titulo="Monta tu horario">
        <p style={{ margin: 0 }}>
          Crea tus primeras clases, sueltas o en serie recurrente — ver{' '}
          <Link href="/ayuda/reservas/crear-una-clase" style={{ color: 'inherit', textDecoration: 'underline' }}>cómo crear una clase</Link>.
        </p>
      </AyudaPaso>

      <AyudaResultado>
        En cuanto tienes horario, tu portal de reservas ya tiene algo que mostrar — es el momento de compartir el
        enlace con tu primera alumna.
      </AyudaResultado>
    </>
  );
}

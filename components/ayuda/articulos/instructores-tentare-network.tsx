import Link from 'next/link';

import { AyudaAntesDeEmpezar, AyudaResultado } from '@/components/ayuda/AyudaPasos';

export default function Contenido() {
  return (
    <>
      <AyudaAntesDeEmpezar>
        Las <Link href="/ayuda/instructores/sustituciones" style={{ color: 'inherit', textDecoration: 'underline' }}>sustituciones</Link> buscan <strong>dentro</strong>: entre
        las instructoras que ya trabajan contigo. Tentare Network busca <strong>fuera</strong>, entre
        profesionales de Pilates y Yoga que están disponibles para dar clase en un estudio.
      </AyudaAntesDeEmpezar>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '24px 0 12px' }}>Buscar instructoras</h2>
      <p>
        El listado, con su experiencia, sus formaciones, su zona y cuándo puede dar clase cada una. Puedes
        comparar varias a la vez en vez de ir abriendo pestañas.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '28px 0 12px' }}>Vacantes</h2>
      <p>
        Al revés: publicas lo que necesitas —qué días, qué tipo de clase, dónde— y que te encuentren a ti. Sirve
        cuando no es una sustitución de un día sino una plaza que quieres cubrir.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '28px 0 12px' }}>Favoritas y mensajes</h2>
      <p style={{ margin: 0 }}>
        Guardas a quien te encaja aunque hoy no la necesites —la lista de a quién llamar el día que te haga
        falta— y hablas con ella desde aquí, sin dar tu teléfono personal.
      </p>

      <AyudaResultado>
        Contactar no es contratar. Cuando os pongáis de acuerdo, la das de alta en{' '}
        <Link href="/ayuda/instructores/dar-de-alta-una-instructora" style={{ color: 'inherit', textDecoration: 'underline' }}>Equipo</Link> como a cualquier otra, con su
        disponibilidad, su tarifa y sus permisos.
      </AyudaResultado>
    </>
  );
}

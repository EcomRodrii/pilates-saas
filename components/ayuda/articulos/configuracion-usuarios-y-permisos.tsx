import Link from 'next/link';
import { AyudaResultado } from '@/components/ayuda/AyudaPasos';

// La gestión de personas vive en Equipo, no dentro de las pestañas de
// Configuración — verificado contra app/(dashboard)/configuracion/page.tsx
// (sin pestaña "usuarios") y app/(dashboard)/equipo/page.tsx.
export default function Contenido() {
  return (
    <>
      <p>
        Quién tiene acceso a tu panel y con qué rol se gestiona desde Equipo, no dentro de Configuración — ahí
        invitas y das de baja a personas, y les asignas su rol.
      </p>

      <p>
        Los cuatro roles y lo que puede hacer cada uno están detallados en{' '}
        <Link href="/ayuda/instructores/permisos-por-rol" style={{ color: 'inherit', textDecoration: 'underline' }}>permisos por rol</Link> — se aplica igual a instructoras que a recepción o manager, no es exclusivo del equipo docente.
      </p>

      <AyudaResultado>
        Dar de baja a una persona no borra su historial: las clases que ha dado o las acciones que ha registrado se
        quedan, solo pierde el acceso a partir de ese momento.
      </AyudaResultado>
    </>
  );
}

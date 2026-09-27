import Link from 'next/link';
import { AyudaCaptura } from '@/components/ayuda/AyudaCaptura';
import { AyudaResultado } from '@/components/ayuda/AyudaPasos';

// La gestión de personas vive en Equipo, no dentro de las pestañas de
// Configuración — verificado contra app/(dashboard)/configuracion/page.tsx
// (sin pestaña "usuarios") y app/(dashboard)/equipo/page.tsx, y en vivo el
// 28-ago-2026.
export default function Contenido() {
  return (
    <>
      <p>
        Quién tiene acceso a tu panel y con qué rol se gestiona desde Equipo, no dentro de Configuración — ahí
        invitas y eliminas a personas, y les asignas su rol.
      </p>

      <AyudaCaptura
        src="/help/configuracion/equipo-lista-roles.png"
        alt="Pantalla de Equipo con la lista de miembros, filtro por rol (Propietaria, Responsable de sede, Recepción, Instructora) y botón Nuevo miembro"
        caption="Equipo — cada persona con su rol, su disponibilidad de la semana y sus clases."
      />

      <p>
        Los cuatro roles y lo que puede hacer cada uno están detallados en{' '}
        <Link href="/ayuda/instructores/permisos-por-rol" style={{ color: 'inherit', textDecoration: 'underline' }}>permisos por rol</Link> — se aplica igual a instructoras que a recepción o responsables de sede, no es exclusivo del equipo docente.
      </p>

      <p>
        <strong>Dar de baja</strong> a una persona (menú de su tarjeta) la saca del equipo y le quita el acceso a partir de
        ese momento. Sus clases pasadas y sus datos se quedan, y puedes reactivarla cuando quieras. Sus clases futuras no
        se cancelan: quedan marcadas para que decidas a quién pasarlas.
      </p>
      <p>
        Si la persona quiere que sus datos personales desaparezcan de tu estudio (o tú lo prefieres),{' '}
        <strong>solo la propietaria</strong> puede usar «Eliminar definitivamente» en el menú de alguien que <strong>ya está
        de baja</strong>. Se borran su nombre, email, teléfono, foto y cuenta de acceso (si no la usa en otro sitio), su
        disponibilidad, sus ausencias y motivos de baja. Lo que la ley obliga a guardar —sus jornadas, las clases que dio y
        sus liquidaciones— se conserva <strong>sin su nombre</strong>, a nombre de «Persona eliminada». Antes tiene que no
        tener clases ni citas por venir ni una liquidación confirmada sin pagar.
      </p>

      <AyudaResultado>
        Eliminar definitivamente <strong>no se puede deshacer</strong>. Si solo quieres que no aparezca en el equipo, déjala
        de baja.
      </AyudaResultado>
    </>
  );
}

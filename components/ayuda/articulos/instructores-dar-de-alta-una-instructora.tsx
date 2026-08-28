import Link from 'next/link';
import { AyudaCaptura } from '@/components/ayuda/AyudaCaptura';
import { AyudaPaso, AyudaAntesDeEmpezar, AyudaResultado } from '@/components/ayuda/AyudaPasos';

export default function Contenido() {
  return (
    <>
      <AyudaAntesDeEmpezar>
        Dar de alta a una instructora le crea un acceso propio a Tentare Core — no comparte usuario contigo ni con
        el resto del equipo.
      </AyudaAntesDeEmpezar>

      <AyudaPaso numero={1} titulo="Ve a Equipo y añade una persona nueva">
        <p>Su nombre, email y el rol que le corresponde: instructora, recepción o manager.</p>
        <AyudaCaptura alt="Formulario de alta de una persona del equipo" pendiente="alta desde Equipo" />
      </AyudaPaso>

      <AyudaPaso numero={2} titulo="Si ya trabaja en otra sede de tu cadena">
        <p style={{ margin: 0 }}>
          Con más de una sede, si esa persona ya tiene ficha activa en otra sede de tu misma cadena, se vincula a su
          cuenta existente directamente — no crea un usuario duplicado, y ella verá ambas sedes en su selector con el
          rol que le corresponda en cada una.
        </p>
      </AyudaPaso>

      <AyudaResultado>
        La instructora recibe su acceso y entra directamente a su propio panel (Tentare Core), donde configura su{' '}
        <Link href="/ayuda/instructores/disponibilidad-y-tarifas" style={{ color: 'inherit', textDecoration: 'underline' }}>disponibilidad</Link> y ve las clases que le asignes.
      </AyudaResultado>
    </>
  );
}

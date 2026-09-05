import Link from 'next/link';
import { AyudaPaso, AyudaResultado, AyudaAntesDeEmpezar } from '@/components/ayuda/AyudaPasos';

const enlace = { color: 'inherit', textDecoration: 'underline' } as const;
const h2 = { fontSize: 18, fontWeight: 700, margin: '28px 0 12px' } as const;

export default function Contenido() {
  return (
    <>
      <AyudaAntesDeEmpezar>
        Tienes clases a las que no debería apuntarse cualquiera: un avanzado, un grupo reducido con máquina, una
        clase con requisitos médicos. Puedes marcarlas y decidir tú quién entra.
      </AyudaAntesDeEmpezar>

      <AyudaPaso numero={1} titulo="Marca la clase">
        En <strong>Configuración → Clases y salas</strong>, edita el tipo de clase y activa{' '}
        <strong>«Solo para alumnas autorizadas»</strong>.
      </AyudaPaso>

      <AyudaPaso numero={2} titulo="Autoriza a quien corresponda">
        En la ficha de cada alumna aparece un bloque nuevo, <strong>«Clases con requisito»</strong>, con la lista
        de las que has marcado. Enciende las suyas. Mientras no lo hagas, no puede reservarlas.
      </AyudaPaso>

      <h2 style={h2}>Por qué no es un «nivel» de la alumna</h2>
      <p>
        Podríamos haber puesto un nivel del 1 al 3 en su ficha, pero eso da por hecho que tus clases se ordenan
        de menor a mayor. En un estudio real conviven <strong>Máquina, Suelo, Gyrotonic y Yoga</strong> además de
        gentil, intermedio y avanzado — y «autorizada a Gyrotonic» no es un escalón por encima de «autorizada a
        Suelo».
      </p>
      <p>
        Con una lista por alumna autorizas exactamente lo que quieres, sin que subir de nivel a alguien le abra
        de golpe clases que no tienen nada que ver.
      </p>

      <h2 style={h2}>Nada cambia hasta que marcas una clase</h2>
      <p>
        Si no activas la casilla en ninguna, el bloque de la ficha ni siquiera aparece y todo funciona como
        siempre. La regla existe solo donde la enciendes: el resto de tus clases las sigue reservando cualquiera
        con plan.
      </p>

      <h2 style={h2}>La regla vale también en mostrador</h2>
      <p>
        No es solo para la app: si intentas apuntar tú a alguien sin autorizar, Tentare te lo dice y no la
        apunta. Es a propósito — si recepción pudiera saltársela, creerías que la regla se cumple mientras la
        mitad de las reservas la esquivan. Para dejarla entrar, autorízala en su ficha y vuelve a apuntarla; así
        además queda constancia de quién lo decidió.
      </p>

      <h2 style={h2}>Si le retiras la autorización</h2>
      <p>
        Deja de poder reservar de inmediato. Si estaba en lista de espera de una de esas clases, se queda ahí
        pero <strong>ya no se la promociona</strong> cuando se libera una plaza: pasa a la siguiente. No se le
        cancela nada, y si vuelves a autorizarla recupera su turno.
      </p>

      <AyudaResultado>
        Esto no sustituye a{' '}
        <Link href="/ayuda/reservas/reglas-de-reserva-por-clase" style={enlace}>las reglas de reserva</Link> —
        antelación, plan obligatorio o aprobación manual—: se suma a ellas. Una clase puede pedir autorización y
        además exigir bono activo.
      </AyudaResultado>
    </>
  );
}

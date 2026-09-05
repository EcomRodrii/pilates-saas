import Link from 'next/link';
import { AyudaResultado, AyudaAntesDeEmpezar } from '@/components/ayuda/AyudaPasos';

const enlace = { color: 'inherit', textDecoration: 'underline' } as const;
const h2 = { fontSize: 18, fontWeight: 700, margin: '28px 0 12px' } as const;

export default function Contenido() {
  return (
    <>
      <AyudaAntesDeEmpezar>
        «Ana viene todos los martes a las 10». Eso es una plaza fija: su hueco reservado cada semana, sin que
        tenga que entrar a reservarlo ni tú apuntarla a mano.
      </AyudaAntesDeEmpezar>

      <h2 style={{ ...h2, marginTop: 4 }}>Cómo se asigna</h2>
      <p>
        En la ficha de la alumna, bloque <strong>«Plaza fija»</strong> → «Añadir». Eliges día de la semana, hora
        y sala, y opcionalmente el tipo de clase y hasta el sitio concreto (si tu sala tiene máquinas numeradas).
      </p>
      <p>
        La plaza se guarda como un <strong>hueco semanal</strong>, no como una lista de reservas. Cada noche,
        Tentare mira las seis semanas siguientes y crea las reservas que falten en ese hueco. Por eso una plaza
        recién asignada aparece en el calendario al día siguiente, no al instante.
      </p>

      <h2 style={h2}>Si cambias el horario de la clase</h2>
      <p>
        Cuando editas <strong>toda una serie</strong> desde una fecha —«guardar esta y las siguientes»— las
        plazas fijas de ese hueco se mueven con ella, conservando la antigüedad de cada alumna. Esa antigüedad
        importa: es lo que decide el turno cuando hay más plazas fijas que sitios.
      </p>
      <p>
        Mover <strong>una clase suelta</strong> no las mueve, y es a propósito: un cambio puntual es una
        excepción de esa semana, no un cambio de horario. La reserva ya creada viaja con la clase, y el
        calendario te avisa de que ese hueco tiene plazas fijas antes de que confirmes.
      </p>

      <h2 style={h2}>Cambiarle el hueco a una alumna</h2>
      <p>
        Desde su ficha puedes <strong>editar</strong> la plaza —día, hora, sala— sin borrarla y volver a
        crearla. Importa hacerlo así: al recrearla perdería su antigüedad.
      </p>

      <h2 style={h2}>Cuando una semana no puede venir</h2>
      <p>
        Que cancele esa clase desde su app como cualquier otra. Al ser plaza fija no se le devuelve sesión de
        bono —no se le había descontado ninguna—, sino que se le guarda una{' '}
        <Link href="/ayuda/bonos/recuperaciones" style={enlace}>recuperación</Link>. La semana siguiente su plaza
        sigue ahí.
      </p>

      <AyudaResultado>
        Si una plaza fija se queda sin clase a la que engancharse —porque cambió el horario y no se movió, o
        porque esa clase ya no existe— aparece en tu lista de «Para hoy» como plaza sin clase, en vez de dejar
        de funcionar en silencio.
      </AyudaResultado>
    </>
  );
}

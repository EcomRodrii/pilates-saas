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
        En la ficha de la alumna, bloque <strong>«Plaza fija»</strong> → «Añadir», o desde una clase del
        calendario con <strong>«Hacer fija»</strong> junto a su nombre. En los dos casos <strong>eliges la
        clase</strong> de tu horario a la que viene cada semana (y, si tu sala tiene máquinas numeradas, su
        sitio). Ves cuántas plazas fijas tiene ya cada clase.
      </p>
      <p>
        Hace falta que tenga una <strong>cuota</strong> activa que incluya esa clase. Con bono no se puede: las
        reservas de una plaza fija no descuentan sesiones, así que con bono se reserva clase a clase. Si la cuota
        tiene un máximo de clases por semana y ya tiene esas plazas fijas, te avisa antes y puedes asignarla
        igualmente.
      </p>
      <p>
        La plaza se guarda como un <strong>hueco semanal</strong>, no como una lista de reservas. Al guardarla ya
        se le reservan las clases de las seis semanas que vienen, y después Tentare sigue reservándolas cada noche.
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
        Desde su ficha puedes <strong>cambiarla</strong> a otra clase, o solo de sitio o de fechas, sin borrarla y
        volver a crearla. Importa hacerlo así: al recrearla perdería su antigüedad. Si la cambias de clase, las que
        ya tenía reservadas en la anterior se cancelan sin penalización y se le reservan las de la nueva.
      </p>

      <h2 style={h2}>Cuando una semana no puede venir</h2>
      <p>
        Que cancele esa clase desde su app como cualquier otra. Al ser plaza fija no se le devuelve sesión de
        bono —no se le había descontado ninguna—. Si cancela a tiempo y su plan le limita las clases por
        semana, se le guarda una{' '}
        <Link href="/ayuda/bonos/recuperaciones" style={enlace}>recuperación</Link>. La semana siguiente su plaza
        sigue ahí.
      </p>

      <h2 style={h2}>Si se va de vacaciones</h2>
      <p>
        En su ficha, pulsa <strong>pausar</strong> en la plaza y elige desde y hasta cuándo. Esas semanas no se le
        reserva la clase, pero <strong>no pierde la plaza ni su sitio</strong>, y al acabar la pausa vuelve sola, sin
        que tengas que acordarte de reanudarla.
      </p>
      <p>
        Las clases que ya tenía reservadas en esas fechas se cancelan sin penalización; si hay alguien en lista de
        espera, entra en su lugar. Las que empiezan dentro del plazo de cancelación se mantienen. Si vuelve antes,
        cambia las fechas o quita la pausa: las clases que quedan se le reservan al momento, si hay sitio.
      </p>

      <h2 style={h2}>Quitar una plaza fija</h2>
      <p>
        Con la papelera de la plaza, en su ficha. Deja de reservarle esa clase y <strong>cancela las que ya
        tenía apuntadas</strong> en ese horario, sin penalización; si hay alguien en lista de espera, entra en su
        lugar. Las que empiezan dentro del plazo de cancelación se mantienen: esas se cancelan desde el
        calendario, con las reglas de siempre.
      </p>

      <AyudaResultado>
        Si una plaza fija se queda sin clase a la que engancharse —porque cambió el horario y no se movió, o
        porque esa clase ya no existe— lo verás en su ficha («Sin clase en este horario») y en Centro de Control,
        dentro de «Ver todo el detalle», en vez de dejar de funcionar en silencio.
      </AyudaResultado>
    </>
  );
}

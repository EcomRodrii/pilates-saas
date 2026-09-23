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

      <h2 style={{ ...h2, marginTop: 4 }}>¿Cómo se marca una alumna en una clase fija?</h2>
      <p>
        Para que una alumna no tenga que reservar su clase cada semana, necesita una plaza fija en ella. Hay tres
        maneras de dársela:
      </p>
      <ul style={{ margin: '0 0 12px', paddingLeft: 22, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <li><strong>La das tú.</strong> Es lo que hay de serie, y se explica justo debajo: desde su ficha, desde la clase
          del calendario o desde la vista «Horario».</li>
        <li><strong>La pide ella.</strong> Si lo activas en Configuración → «Cómo reservan mis alumnas» → «Peticiones
          desde su app», le sale <strong>«Pedir plaza fija»</strong> en la ficha de cualquier clase que se repite cada
          semana y también justo al terminar de reservarla. Tú la apruebas en Resumen.</li>
        <li><strong>Al darle una cuota</strong>, te preguntamos si le das plaza fija.</li>
      </ul>
      <p>
        En los tres casos <strong>hace falta que tenga una cuota</strong> que incluya esa clase. Con un bono o con
        clases sueltas no hay plaza fija: se reserva clase a clase. Por eso a una alumna con bono no le sale el botón
        de pedirla en su app: le explicamos que la plaza fija es para quien tiene cuota.
      </p>

      <h2 style={h2}>Qué ve tu alumna</h2>
      <p>
        En su app se llama <strong>«clase fija»</strong>. En su tarjeta <strong>«Tu clase fija»</strong> lee, con su día y
        su hora, que <strong>su plaza está reservada automáticamente cada semana y que no necesita reservar esa clase</strong>.
        Debajo tiene sus <strong>próximas clases</strong> ya reservadas —las que el sistema le tiene apartadas—, cada una con
        un botón <strong>«No puedo asistir»</strong> que cancela solo esa semana: su clase fija sigue activa y la semana
        siguiente vuelve a tener su plaza. Si cancela a tiempo y su cuota le limita las clases por semana, se le guarda una{' '}
        <Link href="/ayuda/bonos/recuperaciones" style={enlace}>recuperación</Link>.
      </p>
      <p>
        Puede <strong>pedir una pausa</strong> (si lo has activado) desde esa misma tarjeta. Para dejarla del todo,
        reactivarla o cambiarla, <strong>te escribe</strong> desde el botón «Escribir al estudio» y lo haces tú desde su
        ficha: no puede quitársela ella sola. En la lista de una clase del calendario verás quién está por su clase fija
        (<strong>Fija</strong>), por una recuperación (<strong>Recuperación</strong>) o por una reserva de una vez
        (<strong>Reserva</strong>).
      </p>

      <h2 style={h2}>Cómo se asigna</h2>
      <p>
        En la ficha de la alumna, bloque <strong>«Plaza fija»</strong> → «Añadir»; desde una clase del
        calendario con <strong>«Hacer fija»</strong> junto a su nombre; o en la vista <strong>«Horario»</strong>
        del calendario con «+ Plaza fija» en la clase. En todos los casos <strong>eliges la
        clase</strong> de tu horario a la que viene cada semana (y, si tu sala tiene máquinas numeradas, su
        sitio). Ves cuántas plazas fijas tiene ya cada clase.
      </p>
      <p>
        Y al asignarle una <strong>cuota</strong> —desde su ficha, o al darla de alta o editarla con una cuota— te
        preguntamos si le das plaza fija, que es justo cuando sabes a qué clase viene: «Elegir su clase» abre el
        mismo diálogo y «Ahora no» no guarda nada. Con un bono, o si ya tiene plaza fija, no se pregunta.
      </p>
      <p>
        Hace falta que tenga una <strong>cuota</strong> activa que incluya esa clase. Con bono no se puede: las
        reservas de una plaza fija no descuentan sesiones, así que con bono se reserva clase a clase. Si la cuota
        tiene un máximo de clases por semana y ya tiene esas plazas fijas, te avisa antes y puedes asignarla
        igualmente.
      </p>
      <h2 style={h2}>Si se queda sin cuota</h2>
      <p>
        Cuando su cuota deja de estar activa —la cancelas, la pausas, termina tras darse de baja o se cancela porque no
        se pudo cobrar— su plaza fija <strong>sigue guardada con su sitio</strong> y ya no se le reservan clases nuevas.
        Qué pasa con las que ya tenía reservadas <strong>lo eliges tú</strong>, en Configuración → «Cómo reservan mis
        alumnas» → «Si se queda sin cuota»:
      </p>
      <ul style={{ margin: '0 0 12px', paddingLeft: 20 }}>
        <li>
          <strong>Como hasta ahora</strong> (si no eliges nada): conserva esas clases y se aplican tus reglas de
          siempre.
        </li>
        <li>
          <strong>Mantenerlas sin penalización</strong>: conserva esas clases, y si no viene o cancela tarde no se le
          cobra.
        </li>
        <li>
          <strong>Liberar sus clases</strong>: se cancelan todas sus reservas futuras de plaza fija, también las de
          dentro de tu plazo de cancelación, sin penalización; si hay alguien en lista de espera, entra en su lugar. Desde
          su ficha pasa al momento; si ocurre por otro lado, esa misma noche.
        </li>
      </ul>
      <p>
        Mientras solo esté <strong>pendiente de cobrar la renovación</strong>, su cuota sigue activa y no cambia nada.
        Las clases que ya pasaron no se tocan nunca, y cuando vuelva a tener cuota se le reservan otra vez.
      </p>
      <p>
        La plaza se guarda como un <strong>hueco semanal</strong>, no como una lista de reservas. Al guardarla ya
        se le reservan todas las clases que tienes programadas en ese horario, hasta unos seis meses por delante
        (menos las que ya empiezan dentro del plazo de cancelación: esas no se le apuntan solas, porque no podría
        cancelarlas sin coste). Después Tentare sigue reservándolas cada noche y, además, <strong>en el momento en
        que creas una clase nueva</strong> de ese horario: su sitio queda apartado desde que la clase existe, no
        cuando la clase se acerca, así que no se le puede llenar por delante.
      </p>
      <p>
        Hay cosas que Tentare <strong>no le reserva sola</strong>: una clase cancelada, una que su cuota no incluye,
        una en semanas de pausa o de cierre del estudio, y una a la misma hora que otra clase o cita que ya tiene.
        En esos casos, y si la clase está llena, la alumna recibe un aviso con el motivo. Tampoco se le vuelve a
        reservar una clase en la que ella misma canceló, aunque la cancelación fuera de una reserva hecha a mano.
      </p>

      <h2 style={h2}>Clases fijas con nombre: las ofreces tú</h2>
      <p>
        Además de dar plazas una a una, puedes armar una <strong>clase fija con nombre</strong> —«Reformer · martes y
        jueves»— para que tus clientas la pidan desde su app sin que tengas que ir clienta por clienta. Se crea en{' '}
        <strong>Calendario → Horario → «Crear clase fija»</strong>:
      </p>
      <ul style={{ margin: '0 0 12px', paddingLeft: 22, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <li>Le pones <strong>nombre y una descripción</strong> que verán ellas, y eliges <strong>qué clases incluye</strong>
          entre las que ya se repiten en tu horario (una o varias, como el martes y el jueves). No tecleas horas: la clase
          fija sigue sola a «editar esta y las siguientes» y a la renovación de la serie.</li>
        <li>Eliges <strong>cuánto tiempo se ofrece</strong> —de 1 mes a 2 años, hasta 6 opciones—. Cada clienta escoge una y
          ve hasta qué fecha llega.</li>
        <li>Puedes poner un <strong>tope de clientas</strong> por clase; vacío usa el aforo de cada una. Cuando la clase fija
          está completa, en su app ya no sale el botón.</li>
      </ul>
      <p>
        En la app de tus clientas aparece <strong>«Clases fijas»</strong> en el horario, con qué incluye, cuántas plazas
        quedan y un botón <strong>«Pedir clase fija»</strong>. <strong>Pedirla no la reserva:</strong> te llega a Resumen como
        una petición y hasta que la apruebas no cambia nada. Al aprobarla, la clienta recibe <strong>una plaza fija por cada
        clase</strong> hasta la fecha que eligió, y desde ahí funciona como cualquier otra plaza fija (se reserva sola
        y puede faltar una semana). Si aprobarla pasa del límite semanal de su cuota, o la clase fija está completa, te lo
        decimos antes y decides tú.
      </p>
      <p>
        Crear una clase fija ya es tu forma de abrirla: tus clientas la piden desde su app <strong>aunque «Peticiones
        desde su app» esté apagado</strong> (ese ajuste es solo para pedir plaza en una clase suelta).
        Como las plazas fijas, <strong>hace falta una cuota</strong> que incluya esas clases: con bono no se ofrece el botón.
        <strong> Cerrar</strong> una clase fija la deja de ofrecer, pero <strong>no toca las plazas que ya diste</strong>. Si una
        de sus clases se queda sin clases programadas (la serie se acabó y no se renovó), la clase fija dice «sin clases
        programadas» y nadie puede pedirla hasta que la renueves.
      </p>
      <p>
        Al crearla puedes marcar <strong>«Aprobar automáticamente»</strong>: si cabe y no pasa del límite semanal de
        su cuota, la petición de la clienta se resuelve al momento, sin pasar por tu bandeja de Resumen. Si no cabe
        en ese momento, se queda pendiente igual que si el ajuste estuviera apagado — nunca le sale un error nuevo.
        En la lista de tus clases fijas, las que lo tienen activo llevan la etiqueta <strong>«Automática»</strong>.
      </p>
      <p>
        Cuando a una clienta le quedan pocos días antes de que se le acabe, su app se lo dice sola y le deja{' '}
        <strong>ampliar</strong> el tiempo sin perder el sitio que ya tenía (nunca se le acorta lo que le quedaba).
        Esa ampliación es otra petición: te llega a la misma bandeja de Resumen, salvo que también tengas activada
        la aprobación automática de esa clase fija.
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
        Que pulse <strong>«No puedo asistir»</strong> en esa semana, en su tarjeta «Tu clase fija» o en «Mis clases». Solo se
        cancela esa clase; al ser plaza fija no se le devuelve sesión de bono —no se le había descontado ninguna—. Si
        cancela a tiempo y su plan le limita las clases por semana, se le guarda una{' '}
        <Link href="/ayuda/bonos/recuperaciones" style={enlace}>recuperación</Link>. La semana siguiente su plaza
        sigue ahí, y el sistema no vuelve a reservarle la que canceló.
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
      <p>
        Si prefieres que durante una pausa larga <strong>su sitio quede libre</strong> para otra alumna, actívalo en
        Configuración → «Cómo reservan mis alumnas» → «Si pausa su plaza fija». Vale para las pausas nuevas —las que ya
        tengas puestas siguen igual— y solo suelta el sitio en pausas de más de una semana. Una semana antes de que
        acabe, Tentare le devuelve la plaza si su sitio sigue libre y tiene cuota, o te lo pregunta en Resumen, según lo
        que elijas ahí. Si le dices que no vuelva, se le quita la plaza fija.
      </p>

      <h2 style={h2}>Si te la piden desde su app</h2>
      <p>
        De serie, las plazas fijas se dan en recepción y tus alumnas no pueden pedirlas. En Configuración → «Cómo
        reservan mis alumnas» → «Peticiones desde su app» puedes dejar que <strong>pidan</strong> una plaza fija desde la
        clase que están viendo o justo al terminar de reservarla, y una pausa de la suya. Son peticiones:{' '}
        <strong>hasta que las apruebas no cambia nada</strong>, y mientras tanto ella sigue reservando como siempre.
      </p>
      <p>
        En esa misma pantalla ves, debajo del interruptor, <strong>cómo lo ve tu alumna</strong>, con sus mismas
        palabras. Y en la vista «Horario» del calendario te recordamos si están encendidas o no; si eres la
        propietaria, desde ahí llegas al ajuste.
      </p>
      <p>
        Te llega un aviso y las decides en Resumen, en «{'Una petición de plaza fija espera tu respuesta'}». Si con esa
        plaza pasaría del límite de clases por semana de su cuota, te lo decimos ahí y decides tú. Ella ve tu respuesta
        en su app, con el motivo que escribas si no la apruebas.
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

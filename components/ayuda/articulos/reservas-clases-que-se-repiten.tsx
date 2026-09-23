import Link from 'next/link';
import { AyudaResultado, AyudaAntesDeEmpezar } from '@/components/ayuda/AyudaPasos';

// Verificado contra: app/(dashboard)/calendario/page.tsx (botones y diálogo),
// components/series/dialogo-renovar-serie.tsx (el diálogo «Renovar clase»),
// components/calendario/vista-horario.tsx, lib/series-renovacion.ts (topes y
// motivos de fecha omitida) y lib/series-avisos.ts (tramos del aviso).

const enlace = { color: 'inherit', textDecoration: 'underline' } as const;
const h2 = { fontSize: 18, fontWeight: 700, margin: '28px 0 12px' } as const;
const lista = { margin: '0 0 12px', paddingLeft: 20, lineHeight: 1.7 } as const;

export default function Contenido() {
  return (
    <>
      <AyudaAntesDeEmpezar>
        Casi todo tu horario son clases que se repiten: el Reformer de los martes a las 18:00, siempre en la misma
        sala. En Tentare eso es una <strong>serie</strong>: se crea una vez, se ve de un vistazo hasta cuándo llega y
        se alarga antes de que se acabe.
      </AyudaAntesDeEmpezar>

      <h2 style={{ ...h2, marginTop: 4 }}>Crear la clase de cada semana</h2>
      <p>
        En el <strong>Calendario</strong>, botón <strong>«Clase recurrente»</strong>. Se abre «Crear clases
        recurrentes»: eliges el tipo de clase, la instructora, la sala, la hora y la duración, marcas los{' '}
        <strong>días de la semana</strong> y pones fecha de inicio y de fin. Antes de confirmar te dice cuántas
        clases se van a crear, y te avisa si alguna se solapa con la sala o con la instructora.
      </p>
      <p>
        En las vistas de Día y Semana, las clases de una serie llevan el icono ↻ («Se repite cada semana»), y al
        abrir una verás hasta cuándo llega: «Se repite cada martes hasta el 05/10/2026».
      </p>

      <h2 style={h2}>La vista «Horario»</h2>
      <p>
        Es la cuarta vista del calendario, junto a Día, Semana y Mes, y está hecha para mirar el horario como
        horario y no como agenda: <strong>una columna por día y una tarjeta por serie</strong>, con su hora, su sala,
        su instructora, el aforo y hasta cuándo va.
      </p>
      <p>
        Cada tarjeta dice también cuántas <Link href="/ayuda/bonos/plazas-fijas" style={enlace}>plazas fijas</Link>{' '}
        tiene ese hueco y quiénes son, y si la serie <strong>se renueva sola</strong> o está marcada para no
        renovarse. Arriba tienes el resumen: cuántas clases se repiten, cuántas plazas fijas hay y cuántas series
        terminan en menos de un mes. Desde ahí mismo puedes renovar una o añadirle una plaza fija.
      </p>

      <h2 style={h2}>El aviso de que una serie se acaba</h2>
      <p>
        Una serie que llega a su fecha de fin deja ese hueco sin clase, y a quien tenga plaza fija sin reserva. Para
        que no pase por descuido, Tentare lo revisa una vez al día y te avisa <strong>en tres tiempos</strong>:
      </p>
      <ul style={lista}>
        <li><strong>Un mes antes</strong>: aparece en Resumen, entre lo que espera tu visto bueno. Sin notificación.</li>
        <li><strong>Dos semanas antes</strong>: además te llega un aviso a la app.</li>
        <li><strong>Una semana antes, y si termina sin renovar</strong>: aviso a la app y por email.</li>
      </ul>
      <p>
        En Resumen las ves juntas, con el nombre de cada clase, cuándo termina y cuántas alumnas tienen plaza fija
        ahí. Dos botones: <strong>«Revisar y renovar»</strong> o <strong>«No renovar»</strong>. Si dices que no, deja
        de recordártelo —y si cambias de idea, la renuevas desde la clase en el calendario—.
      </p>

      <h2 style={h2}>Renovar una serie</h2>
      <p>
        Desde Resumen, desde la clase en el calendario («Renovar serie») o desde la vista Horario. Los tres abren el
        mismo diálogo, <strong>«Renovar clase»</strong>, que no guarda nada hasta que confirmas: primero te enseña
        exactamente lo que va a pasar.
      </p>
      <p>
        Dices cuántas <strong>semanas más</strong> —de 1 a 104— y te responde con el número de clases que se crean y
        hasta qué fecha. La serie se alarga con <strong>la misma configuración</strong>: horario, sala, tipo de clase,
        instructora, aforo y las notas de su última clase. Lo que ya está en el calendario no se toca.
      </p>
      <p>Y te dice antes de confirmar lo que no va a salir redondo:</p>
      <ul style={lista}>
        <li>Las fechas que <strong>no</strong> se crean, con su motivo: la sala está ocupada a esa hora, ya hay una clase igual, o el centro está cerrado ese día.</li>
        <li>Las clases que quedarían <strong>sin instructora</strong>, porque la de siempre ya tiene otra clase a esa hora o porque ya no está en el equipo.</li>
        <li>Que las <strong>plazas fijas de ese hueco siguen</strong>: a esas alumnas se les reserva cada semana como hasta ahora, sin que tengas que hacer nada.</li>
      </ul>

      <h2 style={h2}>Que se renueve sola</h2>
      <p>
        En ese mismo diálogo hay una casilla: <strong>«Renovar sola cuando se vaya a acabar»</strong>. Se guarda al
        marcarla, aparte de renovar ahora, y es <strong>de esa serie</strong>: no es un ajuste del estudio, así que
        puedes tener el horario fijo renovándose solo y dejar a mano el taller que solo dura un trimestre.
      </p>
      <p>
        Viene <strong>apagada</strong>. Encendida, un mes antes del final la serie se alarga con las mismas semanas
        que la última vez y te avisamos de que se ha renovado sola. Si algo lo impide —esas fechas ya estaban en el
        calendario, la sala está ocupada o el centro está cerrado— no lo hace en silencio: te lo dice para que la
        revises tú.
      </p>

      <AyudaResultado>
        Una serie terminada no borra nada: las clases que ya se dieron siguen en el histórico. Lo que se pierde es lo
        que venía después, así que la señal a la que merece la pena hacer caso es la de Resumen — cuando avisa, todavía
        queda un mes.
      </AyudaResultado>
    </>
  );
}

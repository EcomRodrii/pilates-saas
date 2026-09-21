import Link from 'next/link';
import { AyudaResultado, AyudaAntesDeEmpezar } from '@/components/ayuda/AyudaPasos';

const enlace = { color: 'inherit', textDecoration: 'underline' } as const;
const h2 = { fontSize: 18, fontWeight: 700, margin: '28px 0 12px' } as const;
const lista = { paddingLeft: 20, lineHeight: 1.7 } as const;

export default function Contenido() {
  return (
    <>
      <AyudaAntesDeEmpezar>
        Tentare sabe cuándo trabaja tu equipo de dos maneras: la <strong>jornada</strong> (entrada y salida, lo que
        exige la ley a quien tiene contrato) y cada <strong>clase</strong> (si la dio y a qué hora empezó). No es la
        asistencia de las alumnas: es el control horario de la instructora.
      </AyudaAntesDeEmpezar>

      <h2 style={{ ...h2, marginTop: 4 }}>Primero, dile a Tentare cómo trabaja cada una</h2>
      <p>
        En <strong>Equipo → Liquidaciones</strong>, en la tarjeta de cada instructora, elige su <strong>Relación</strong>:
      </p>
      <ul style={lista}>
        <li>
          <strong>Contratada</strong> — ficha su jornada, entrada y salida, desde su app. Si empieza una clase sin
          haber fichado, Tentare le ficha la entrada y se lo dice. Las clases que caen dentro de su jornada cuentan
          como dadas sin que tenga que hacer nada.
        </li>
        <li>
          <strong>Autónoma</strong> — no ficha jornada, ni puede. Sus horas son las de las clases que da, y se le
          paga siempre por clases, liquide como liquide el estudio.
        </li>
        <li><strong>Sin definir</strong> — como hasta ahora: puede fichar si quiere, y sus clases se controlan igual.</li>
      </ul>

      <h2 style={h2}>Lo que hace la instructora</h2>
      <ul style={lista}>
        <li>
          En su <strong>Hoy</strong>, desde 15 minutos antes, le aparece <strong>«Empezar clase»</strong>. Un toque y
          queda anotada la hora. Pasar lista también cuenta.
        </li>
        <li>
          Al acabar no tiene que hacer nada: la clase <strong>termina sola a su hora</strong>. Si acabó antes, pulsa
          «Terminé antes» y pone la hora.
        </li>
        <li>
          Si se le olvida, al día siguiente su Hoy le pregunta <strong>«¿Diste esta clase?»</strong>: a su hora, con
          otro horario o no la dio. Tiene 14 días para contestarlo.
        </li>
      </ul>

      <h2 style={h2}>Lo que ves tú</h2>
      <p>
        En <strong>Equipo → Tiempo trabajado</strong>, cada instructora tiene sus jornadas y sus clases del mes. Lo
        que pide tu atención sale marcado:
      </p>
      <ul style={lista}>
        <li>
          <strong>Sin confirmar</strong> — terminó sin empezarla ni pasar lista. Se paga por su horario, pero su
          liquidación no se puede confirmar hasta saber si la dio. Si sabes que sí, «Dar por dadas» las confirma de
          una vez.
        </li>
        <li>
          <strong>Dijo no darla</strong> — no se le paga. Mira quién la dio y márcala como revisada; si en realidad
          sí la dio, corrígela. Mientras no la revises, sale en tu bandeja de Inicio.
        </li>
        <li>
          <strong>Fuera de jornada</strong> — una contratada dio la clase sin tener la jornada abierta. Corrige su
          jornada para que el registro cuadre.
        </li>
        <li><strong>Empezó tarde</strong> — se ve en cada clase y en el total del mes de su liquidación.</li>
      </ul>
      <p>
        Toda corrección pide un motivo, y queda en el historial de la clase quién cambió qué. Con{' '}
        <strong>CSV clases</strong> te llevas el mes clase a clase, con la hora real, para tu gestoría.
      </p>

      <h2 style={h2}>Y en la liquidación</h2>
      <ul style={lista}>
        <li>
          Una clase que empezó tarde se paga <strong>por su horario entero</strong>, y el retraso solo se enseña. Si
          prefieres pagar lo que duró de verdad, en Liquidaciones cambia «Cada clase dada se paga por» a «lo que
          duró». Lo cambia solo la propietaria.
        </li>
        <li>Las clases que dijo no dar no se pagan.</li>
        <li>
          A una contratada con{' '}
          <Link href="/ayuda/instructores/horas-y-contrato" style={enlace}>horas de contrato</Link> apuntadas, lo que
          fiche por encima se le enseña como horas de más, sin pagarse aparte.
        </li>
      </ul>

      <AyudaResultado>
        Las clases de antes del 22 de septiembre de 2026 no se preguntan: se pagan como siempre, por su horario.
        Cambiar un criterio no toca las liquidaciones ya confirmadas o pagadas; las que sigan en borrador, pulsa
        «Recalcular».
      </AyudaResultado>
    </>
  );
}

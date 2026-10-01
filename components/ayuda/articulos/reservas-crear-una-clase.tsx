import Link from 'next/link';
import { AyudaCaptura } from '@/components/ayuda/AyudaCaptura';
import { AyudaPaso, AyudaAntesDeEmpezar, AyudaResultado } from '@/components/ayuda/AyudaPasos';

// Verificado en vivo el 28-ago-2026 contra el panel real (Calendario > Nueva
// clase, cuenta de demostración).
export default function Contenido() {
  return (
    <>
      <AyudaAntesDeEmpezar>
        Necesitas al menos una sala y un tipo de clase creados en tu estudio, y si quieres asignarla a alguien, una{' '}
        <Link href="/ayuda/instructores/dar-de-alta-una-instructora" style={{ color: 'inherit', textDecoration: 'underline' }}>instructora dada de alta</Link>.
      </AyudaAntesDeEmpezar>

      <AyudaPaso numero={1} titulo="Abre el Calendario y crea una clase nueva">
        <p>Desde el panel, en Calendario, el botón &ldquo;Crear clase&rdquo; abre este formulario.</p>
        <AyudaCaptura
          src="/help/reservas/calendario-nueva-clase.png"
          alt="Formulario de nueva clase: tipo, sala, instructora, fecha, horario, aforo máximo y repetición semanal"
          caption="El formulario real de Calendario &gt; Nueva clase."
        />
      </AyudaPaso>

      <AyudaPaso numero={2} titulo="Elige tipo de clase, sala e instructora">
        <p style={{ margin: 0 }}>
          Las plazas son las del tipo de clase o, si no tiene, las de la sala; puedes bajarlas para una clase concreta
          (por ejemplo, si una máquina está averiada ese día). Debajo se lee qué pasa cuando se llena, con las reglas
          de ese tipo de clase: si tiene lista de espera, las siguientes entran en ella; si no, nadie más puede
          reservarla. La hora de fin sale de la duración del tipo de clase hasta que la cambias a mano, y si la clase
          cae fuera del horario de tu estudio ese día o en un cierre del centro te lo avisa, aunque puedes crearla
          igual. En &ldquo;Cómo se reserva esta clase&rdquo; ves sus reglas: cuándo se abre y se cierra la reserva,
          qué bono o plan hace falta, hasta cuándo se cancela sin perder la sesión y la lista de espera.
        </p>
      </AyudaPaso>

      <AyudaPaso numero={3} titulo="Clase suelta o serie recurrente">
        <p>
          El interruptor &ldquo;Se repite&rdquo; convierte la clase en una serie: marcas los días de la semana y hasta
          qué fecha, y te dice cuántas clases salen. Si alguna fecha choca con otra clase —la sala ocupada o la
          instructora dando otra— o cae en un cierre del centro, te la enseña con el motivo, se la salta y crea las
          demás. Al editar después una
          clase de la serie eliges si el cambio vale solo para esa clase o para esa y las siguientes, y en el
          &ldquo;⋯&rdquo; de la clase, &ldquo;Cancelar esta y las siguientes&rdquo; cancela esa clase y las que vienen detrás — ver <Link href="/ayuda/reservas/editar-o-cancelar-una-clase" style={{ color: 'inherit', textDecoration: 'underline' }}>editar o cancelar una clase</Link>.
          {' '}Una serie dura las semanas que elijas. Cuando le queda un mes aparece en Resumen para que la renueves (o
          digas que no), y también puedes renovarla cuando quieras desde la propia clase, en su &ldquo;⋯&rdquo; → &ldquo;Renovar serie&rdquo;:
          se alarga la misma clase con su horario, sala, tipo, instructora, aforo y notas, las clases que ya están en
          el calendario no se tocan, los días de cierre del centro se saltan y las alumnas con plaza fija siguen en su hueco. Si no la renuevas, te avisamos a
          las dos semanas y a la semana del final (y el último día, también por email). Y si prefieres no depender
          de acordarte, marca &ldquo;Renovar sola&rdquo; al renovarla: un mes antes del final se renueva con las mismas
          semanas y te avisa.
        </p>
        <p>
          Al abrir una clase de una serie, su ficha dice cada qué día se repite y hasta cuándo. Y la vista
          &ldquo;Horario&rdquo; (junto a Día y Semana) reúne todas las que se repiten por día de la semana:
          hasta cuándo va cada una, si se renueva sola y cuántas alumnas tienen plaza fija, con los botones para
          renovarla o dar una plaza fija a una clienta sin salir de ahí.
        </p>
      </AyudaPaso>

      <AyudaResultado>
        La clase aparece en tu Calendario y, si no está oculta, en tu portal de reservas públicas — al momento, sin
        publicar nada aparte.
      </AyudaResultado>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '28px 0 12px' }}>En el ordenador: ampliarlo o llevarlo en una ventana</h2>
      <p>
        Junto al título «Calendario» hay dos botones pequeños. El de las flechas lo{' '}
        <strong>amplía a toda la pantalla</strong>: esconde el menú y la barra de arriba para que quepan más horas y
        más días; con el mismo botón, o con <strong>Esc</strong>, vuelve a su tamaño. Ese mismo botón lo tienen
        Clientas, Cobros, Informes, Mensajería y Equipo.
      </p>
      <p>
        El otro saca la agenda del día a una <strong>ventana flotante</strong> que se queda a mano mientras vas a
        Clientas, Cobros o cualquier otra pantalla. La mueves arrastrándola por su barra y se queda donde la dejes,
        también si recargas. Desde la propia ventana cambias de día, la pliegas para que solo quede la barra, o pulsas
        una clase para abrirla en el Calendario; con sus flechas la agrandas para ver la semana entera sin que deje de flotar, y con las mismas vuelve a pequeña. Solo aparece en un ordenador, no en el móvil ni en la tablet.
      </p>
    </>
  );
}

import { AyudaPaso, AyudaAntesDeEmpezar, AyudaResultado } from '@/components/ayuda/AyudaPasos';

export default function Contenido() {
  return (
    <>
      <AyudaAntesDeEmpezar>
        Las clases son de grupo y se llenan solas desde el portal. Las <strong>Citas</strong> son lo otro: la
        valoración inicial, un fisio, un entrenamiento personal, una sesión online. Ocupan hueco en la agenda de
        quien la da, pero no viven en el calendario de clases.
      </AyudaAntesDeEmpezar>

      <AyudaPaso numero={1} titulo="Crea la cita">
        <p>
          Eliges el tipo —privada, evaluación, fisioterapia u online—, quién la da, el día, la hora y cuánto dura
          (30, 45, 60 o 90 minutos).
        </p>
        <p style={{ margin: 0 }}>
          Si esa persona ya tiene algo a esa hora, otra cita o una clase, te lo dice <strong>antes</strong> de
          guardar. Es el error que más cuesta deshacer, porque se descubre con las dos personas en la puerta.
        </p>
      </AyudaPaso>

      <AyudaPaso numero={2} titulo="Ponle precio si se cobra">
        <p>
          Una cita puede llevar precio y quedar marcada como cobrada. Solo lo ve quien puede ver dinero: para el
          resto del equipo la cita existe, pero sin importe.
        </p>
        <p style={{ margin: 0 }}>
          <strong>La fisioterapia es la excepción, y a propósito.</strong> Está exenta de IVA (art. 20.Uno.3º de
          la Ley del IVA) y hoy la facturación de Tentare no sabe emitir esa exención. Emitirla al tipo general
          sería una factura <em>incorrecta</em>, así que ahí solo se marca «pagado» como apunte, sin factura — y
          esa factura la haces por tu cuenta.
        </p>
      </AyudaPaso>

      <AyudaPaso numero={3} titulo="Sigue en qué estado está">
        <p style={{ margin: 0 }}>
          Pendiente cuando la has apuntado, Confirmada cuando ella lo ha dicho, y Completada al terminar. Si no
          viene, queda como Cancelada o No asistió — no se borra, porque saber cuántas se caen es justo lo que te
          dice si merece la pena seguir ofreciéndolas.
        </p>
      </AyudaPaso>

      <AyudaResultado>
        En «Próximas» solo salen las que aún no han pasado, no las pendientes de hace un mes. Y si vienes de otro
        programa, tus citas se traen con el importador — no hay que picarlas una a una.
      </AyudaResultado>
    </>
  );
}

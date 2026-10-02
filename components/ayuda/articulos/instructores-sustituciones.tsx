import Link from 'next/link';
import { AyudaAntesDeEmpezar, AyudaResultado } from '@/components/ayuda/AyudaPasos';

export default function Contenido() {
  return (
    <>
      <AyudaAntesDeEmpezar>
        Una instructora puede avisar de que no puede dar su clase desde la app del estudio — no tiene que buscar
        sustituta ella misma ni escribirte para que lo hagas tú.
      </AyudaAntesDeEmpezar>

      <p>
        En cuanto avisa, Tentare busca candidatas entre el resto de tu equipo según su disponibilidad y su afinidad
        con ese tipo de clase (quién suele dar clases similares, a horas parecidas) y las ordena. Según el modo,
        las contacta ella sola —y si una no responde a tiempo, pasa a la siguiente— o espera tu visto bueno para
        avisar a cada una, y si una no contesta o dice que no, te lo cuenta para que elijas a la siguiente.
      </p>

      <p>
        También puedes buscarla tú desde el <strong>Calendario</strong>: en la ficha de una clase sin cubrir,{' '}
        <strong>«Buscar sustituta»</strong> pone en marcha lo mismo (y antes de pulsar te dice a quién avisaría y en
        qué orden). Si ya sabes quién la da, <strong>«¿Ya sabes quién la da?»</strong> se la asigna directamente:
        queda registrada como sustitución, a ella le llega el aviso en la app del estudio y, si quieres, a las
        clientas apuntadas también. En una clase que sí tiene instructora, lo mismo está en su «⋯» →{' '}
        «Buscar sustituta».
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '24px 0 12px' }}>Niveles de autonomía</h2>
      <p>
        Tú decides cuánta autonomía tiene este proceso, en Sustituciones: Manual, Asistido (el que viene puesto, en
        el que cada sustitución espera tu visto bueno), Autónomo, en el que se resuelve sola de principio a fin, y
        Vacaciones. Autónomo y Vacaciones van incluidos desde el plan Estudio.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '28px 0 12px' }}>Qué le llega a la alumna</h2>
      <p>
        Si se cubre la clase, a ti te llega «Clase cubierta» y las alumnas con reserva reciben un aviso del cambio
        por email y en su app — la clase sigue en pie, no se cancela. Ese aviso viene encendido y se cambia en
        Configuración &gt; Cómo reservan mis alumnas, donde también ves qué pasa con todo lo demás. Si no queda
        nadie de tu equipo, puedes volver a buscar, reprogramar o cancelar.
      </p>

      <AyudaResultado>
        Confirmar una ausencia programada (vacaciones, baja médica) es distinto de avisar de que no puede dar una
        clase concreta hoy: lo primero solo afecta a cómo se valoran futuras candidatas, no dispara ninguna
        sustitución automática sobre clases ya en el calendario. Relacionado:{' '}
        <Link href="/ayuda/reservas/editar-o-cancelar-una-clase" style={{ color: 'inherit', textDecoration: 'underline' }}>editar o cancelar una clase</Link>.
      </AyudaResultado>
    </>
  );
}

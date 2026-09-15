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
        las contacta ella sola o espera tu visto bueno; si una no responde a tiempo, pasa a la siguiente.
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
        nadie de tu equipo, Tentare te propone profesionales de Tentare Network; también puedes volver a buscar,
        reprogramar o cancelar.
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

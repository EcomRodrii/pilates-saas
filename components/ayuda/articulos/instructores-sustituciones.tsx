import Link from 'next/link';
import { AyudaAntesDeEmpezar, AyudaResultado } from '@/components/ayuda/AyudaPasos';

export default function Contenido() {
  return (
    <>
      <AyudaAntesDeEmpezar>
        Una instructora puede avisar de que no puede dar su clase desde su propio panel — no tiene que buscar
        sustituta ella misma ni escribirte para que lo hagas tú.
      </AyudaAntesDeEmpezar>

      <p>
        En cuanto avisa, Tentare busca candidatas entre el resto de tu equipo según su disponibilidad y su afinidad
        con ese tipo de clase (quién suele dar clases similares, a horas parecidas), las contacta, y si nadie
        responde a tiempo, escala avisando al siguiente nivel.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '24px 0 12px' }}>Niveles de autonomía</h2>
      <p>
        Tú decides cuánta autonomía tiene este proceso: desde un modo asistido en el que cada sustitución espera tu
        visto bueno, hasta un modo autónomo en el que se resuelve sola de principio a fin. Puedes ajustarlo según
        cuánto confíes en el proceso.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '28px 0 12px' }}>Qué le llega a la alumna</h2>
      <p>
        Si se cubre la clase, las alumnas con reserva reciben un aviso con el cambio de instructora — la clase sigue
        en pie, no se cancela. Si no se encuentra sustituta a tiempo, es tu decisión mantenerla o cancelarla.
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

import Link from 'next/link';
import { AyudaResultado, AyudaAntesDeEmpezar } from '@/components/ayuda/AyudaPasos';

const enlace = { color: 'inherit', textDecoration: 'underline' } as const;
const h2 = { fontSize: 18, fontWeight: 700, margin: '28px 0 12px' } as const;

export default function Contenido() {
  return (
    <>
      <AyudaAntesDeEmpezar>
        Si tienes instructoras contratadas por horas, la pregunta de cada mes es la misma: ¿le estoy dando lo que
        le pago? Tentare te la responde sin que lleves una hoja aparte.
      </AyudaAntesDeEmpezar>

      <h2 style={{ ...h2, marginTop: 4 }}>Apunta sus horas de contrato</h2>
      <p>
        En <strong>Equipo</strong>, edita a la instructora y rellena «Horas semanales de contrato». Está justo
        debajo de su tarifa por hora, y como ella, solo la ven los roles que gestionan equipo — no aparece en la
        rejilla ni la ve el resto de compañeras.
      </p>
      <p>
        Si la dejas en blanco no pasa nada: simplemente no se compara nada. Es lo normal en una autónoma que
        factura por clase.
      </p>

      <h2 style={h2}>Mira el mes</h2>
      <p>
        En el menú de su tarjeta, <strong>«Horas del mes»</strong>. Verás tres cifras y, si tiene contrato, una
        cuarta línea con la diferencia:
      </p>
      <ul style={{ paddingLeft: 20, lineHeight: 1.7 }}>
        <li><strong>Asignadas</strong> — todo lo que tiene en el calendario ese mes, haya pasado o no.</li>
        <li><strong>Ya realizadas</strong> — lo que ya ocurrió a día de hoy.</li>
        <li><strong>Clases</strong> — cuántas son.</li>
        <li><strong>Contrato</strong> — sus horas semanales y su equivalente al mes, con cuánto le falta o le sobra.</li>
      </ul>

      <h2 style={h2}>Por qué 12 h/semana no son 48 h al mes</h2>
      <p>
        Un mes no son cuatro semanas justas. La equivalencia mensual se calcula con la convención de nómina de
        siempre —52 semanas repartidas en 12 meses—, así que 12 h/semana salen unas <strong>52 h al mes</strong>,
        no 48. Lo verás escrito debajo de la cifra para que cuadre con lo que espera tu gestoría.
      </p>
      <p>
        La diferencia se mide contra lo <strong>asignado</strong>, no contra lo ya dado: a mitad de mes lo que te
        interesa saber es a cuánto te has comprometido, no cuánto lleva impartido.
      </p>

      <h2 style={h2}>Un límite que conviene conocer</h2>
      <p>
        «Realizadas» significa que su clase ya pasó y no estaba cancelada. Tentare no tiene fichaje: si una clase
        no llegó a darse y nadie la canceló, seguirá contando. Para cuadrar una nómina, cruza esto con lo que
        sepas del mes.
      </p>

      <AyudaResultado>
        Puedes exportar el desglose clase a clase en CSV desde el mismo diálogo, para pasárselo a tu gestoría.
        Y si además le pagas por hora, lo tienes en{' '}
        <Link href="/ayuda/instructores/disponibilidad-y-tarifas" style={enlace}>tarifas y liquidación</Link>.
      </AyudaResultado>
    </>
  );
}

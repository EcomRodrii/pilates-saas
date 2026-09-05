import Link from 'next/link';
import { AyudaPaso, AyudaResultado, AyudaAntesDeEmpezar } from '@/components/ayuda/AyudaPasos';

const enlace = { color: 'inherit', textDecoration: 'underline' } as const;
const h2 = { fontSize: 18, fontWeight: 700, margin: '28px 0 12px' } as const;

export default function Contenido() {
  return (
    <>
      <AyudaAntesDeEmpezar>
        Cierras una semana por vacaciones, cae un puente o tienes que parar por obras. Nadie debería perder días
        de bono por eso, y no vas a entrar en cincuenta fichas de una en una.
      </AyudaAntesDeEmpezar>

      <AyudaPaso numero={1} titulo="Selecciona a quién afecta">
        En <strong>Clientas</strong>, marca las casillas de las alumnas a las que quieres ampliar. Si es a todas,
        la casilla de la cabecera las selecciona de golpe — y respeta el filtro que tengas puesto, así que puedes
        ampliar solo a las activas, o solo a las de una etiqueta.
      </AyudaPaso>

      <AyudaPaso numero={2} titulo="Pulsa «Ampliar caducidad» y di cuántos días">
        Aparece arriba, en la barra oscura que sale al seleccionar. Pon los días que estuviste cerrado (o los que
        quieras regalar) y confirma.
      </AyudaPaso>

      <AyudaPaso numero={3} titulo="Comprueba lo que se movió">
        Al terminar te dice exactamente cuántos bonos y cuántas recuperaciones ha ampliado. Si sale «no había
        nada en vigor que ampliar», es que esas alumnas no tenían bonos vivos — no es un error.
      </AyudaPaso>

      <h2 style={h2}>Qué se amplía y qué no</h2>
      <ul style={{ paddingLeft: 20, lineHeight: 1.7 }}>
        <li><strong>Sí:</strong> los bonos de sesiones en vigor y las recuperaciones sin usar.</li>
        <li><strong>No: las cuotas mensuales.</strong> En una mensualidad, esa fecha es la del próximo cobro — moverla no le regala días, le cambia cuándo se le cobra. Si quieres compensar a quien tiene mensual, es otra conversación (un mes gratis, un descuento), no esto.</li>
      </ul>

      <h2 style={h2}>Amplía antes de cerrar, no después</h2>
      <p>
        Lo que ya ha caducado <strong>no vuelve</strong>. Si cierras del 1 al 7 y a alguien le caducaba el bono el
        día 3, ampliar el día 8 no lo resucita. Hazlo antes de irte y no tendrás que ir persona por persona
        después.
      </p>

      <AyudaResultado>
        Es la operación pensada para vacaciones y festivos. Para el caso de una sola alumna que se va de viaje,
        tienes algo mejor: <Link href="/ayuda/bonos/caducidad-de-un-bono" style={enlace}>congelar su plan</Link>,
        que empuja su fecha exactamente los días que estuvo parada.
      </AyudaResultado>
    </>
  );
}

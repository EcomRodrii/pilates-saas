import Link from 'next/link';
import { AyudaResultado, AyudaAntesDeEmpezar } from '@/components/ayuda/AyudaPasos';

const enlace = { color: 'inherit', textDecoration: 'underline' } as const;
const h2 = { fontSize: 18, fontWeight: 700, margin: '28px 0 12px' } as const;

export default function Contenido() {
  return (
    <>
      <AyudaAntesDeEmpezar>
        Una recuperación es una clase que le debes a una alumna. No es una sesión de bono ni un plan: vive
        aparte, tiene su propia fecha de caducidad y se ve en su ficha.
      </AyudaAntesDeEmpezar>

      <h2 style={{ ...h2, marginTop: 4 }}>Cuándo nace una recuperación</h2>
      <p>Hay dos formas, y conviene distinguirlas:</p>
      <ul style={{ paddingLeft: 20, lineHeight: 1.7 }}>
        <li><strong>Se la concedes tú</strong> desde su ficha, con el botón «Dar recuperación». Es lo normal cuando avisa de que no puede venir y quieres compensarla.</li>
        <li><strong>Se genera sola</strong> cuando cancela una clase de su plaza fija desde la app. Ahí no se le devuelve sesión de bono, porque no se le había descontado ninguna: la recuperación es la compensación.</li>
      </ul>
      <p>
        Cancelar una clase normal a tiempo <strong>no</strong> genera recuperación: le devuelve la sesión a su
        bono, que es lo que esperaría. Puedes leer cómo funciona esa ventana en{' '}
        <Link href="/ayuda/reservas/reglas-de-reserva-por-clase" style={enlace}>reglas de reserva</Link>.
      </p>

      <h2 style={h2}>Cuánto duran</h2>
      <p>
        Lo decides tú en <strong>Configuración → Estudio → Reservas y cancelaciones</strong>, en el bloque
        «Recuperaciones». Tres opciones: al final del mes siguiente (lo que viene puesto), al final del mes en
        curso, o un número de días que elijas.
      </p>
      <p>
        Ese plazo se cuenta desde el día en que concedes la recuperación, <strong>no</strong> desde la clase que
        se perdió. Es una diferencia pequeña que se nota cuando concedes una recuperación de una clase de hace
        dos semanas.
      </p>

      <h2 style={h2}>Cuando un caso concreto necesita otra fecha</h2>
      <p>
        Al conceder una recuperación puedes ponerle una <strong>fecha de caducidad propia</strong>, solo para
        esa. Sirve para el caso de siempre: «se va tres meses y vuelve», y no quieres cambiar la política de
        todo el estudio para una persona. Si dejas la fecha en blanco, manda la política.
      </p>
      <p>
        Lo único que no se puede es ponerle una fecha ya pasada: nacería caducada y además ocuparía sitio en su
        cupo.
      </p>

      <h2 style={h2}>El tope de cuatro</h2>
      <p>
        Una alumna puede tener <strong>como máximo cuatro recuperaciones vivas a la vez</strong>. Al intentar
        darle la quinta te avisa y no la crea. No es un capricho: si alguien acumula cinco clases pendientes, el
        problema ya no se arregla con otra recuperación.
      </p>

      <AyudaResultado>
        Las recuperaciones vivas aparecen en la ficha de la alumna y en tu lista de «Para hoy» cuando les quedan
        menos de siete días — para que puedas avisarla antes de que la pierda. También se traen desde tu
        software anterior al{' '}
        <Link href="/ayuda/clientes/importar-clientes" style={enlace}>importar tus datos</Link>.
      </AyudaResultado>
    </>
  );
}

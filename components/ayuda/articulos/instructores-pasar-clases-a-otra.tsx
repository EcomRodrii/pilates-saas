import Link from 'next/link';
import { AyudaPaso, AyudaResultado, AyudaAntesDeEmpezar } from '@/components/ayuda/AyudaPasos';

const enlace = { color: 'inherit', textDecoration: 'underline' } as const;
const h2 = { fontSize: 18, fontWeight: 700, margin: '28px 0 12px' } as const;

export default function Contenido() {
  return (
    <>
      <AyudaAntesDeEmpezar>
        Una baja de tres semanas, un cambio de cuadrante, alguien que se va. Cuando ya sabes quién va a cubrir,
        no tiene sentido abrir clase por clase.
      </AyudaAntesDeEmpezar>

      <AyudaPaso numero={1} titulo="Abre el menú de su tarjeta">
        En <strong>Equipo</strong>, en el menú de tres puntos de la instructora que se ausenta:{' '}
        <strong>«Pasar sus clases a otra»</strong>.
      </AyudaPaso>

      <AyudaPaso numero={2} titulo="Elige quién las da y entre qué fechas">
        Solo aparecen instructoras activas. Al elegir las fechas te dice, antes de tocar nada, cuántas clases
        caen en ese periodo y cuántas alumnas hay apuntadas.
      </AyudaPaso>

      <AyudaPaso numero={3} titulo="Decide qué hacer si hay choques">
        Si la que recibe ya da otra clase a esa misma hora, tienes dos comportamientos. Con «saltar las que
        choquen» marcado, esas se quedan como están y el resto se mueve. Sin marcar, o se mueven todas o no se
        mueve ninguna — no queda a medias.
      </AyudaPaso>

      <h2 style={h2}>Las alumnas se enteran</h2>
      <p>
        Si hay gente apuntada, puedes avisarlas con la misma acción: reciben un email y un aviso en su app, uno
        por clase. Va marcado por defecto porque cambiar veinte clases en silencio es peor que no cambiarlas.
      </p>

      <h2 style={h2}>Esto no es una sustitución</h2>
      <p>
        Aquí decides tú quién las da. Si lo que necesitas es <strong>buscar</strong> a alguien —que Tentare mire
        quién está libre, las ordene por encaje y las contacte—, eso es el{' '}
        <Link href="/ayuda/instructores/sustituciones" style={enlace}>motor de sustituciones</Link>, y funciona
        clase a clase.
      </p>
      <p>
        Y ojo con esto: <strong>registrar una ausencia no reasigna nada</strong>. Cuando anotas unas vacaciones o
        una baja, Tentare te dice cuántas clases se quedan sin cubrir, pero no las mueve solo. Esa decisión es
        tuya, y esta es la herramienta para ejecutarla de una vez.
      </p>

      <AyudaResultado>
        Lo que no se puede todavía: elegir clases sueltas de aquí y de allá para moverlas juntas. El cambio va
        por instructora y rango de fechas.
      </AyudaResultado>
    </>
  );
}

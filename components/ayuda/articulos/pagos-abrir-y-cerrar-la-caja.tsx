import { AyudaPaso, AyudaAntesDeEmpezar, AyudaResultado } from '@/components/ayuda/AyudaPasos';

export default function Contenido() {
  return (
    <>
      <AyudaAntesDeEmpezar>
        Abrir caja no es un trámite: es lo único que hace que al final del día puedas comparar lo que{' '}
        <em>debería</em> haber en el cajón con lo que hay. Sin eso, el efectivo es una cifra que nadie puede
        cuadrar. Solo puede haber una caja abierta a la vez por sede.
      </AyudaAntesDeEmpezar>

      <AyudaPaso numero={1} titulo="Ábrela con el fondo con el que empiezas">
        <p style={{ margin: 0 }}>
          El fondo es el cambio que ya está en el cajón antes de la primera venta. Se teclea al abrir y queda
          apuntado como el primer movimiento del día.
        </p>
      </AyudaPaso>

      <AyudaPaso numero={2} titulo="Apunta lo que entra y sale y no es una venta">
        <p>
          Pagar al mensajero, sacar dinero para el banco, meter cambio a media tarde. Las ventas se apuntan solas;
          esto no, y es justo lo que descuadra un arqueo.
        </p>
        <p style={{ margin: 0 }}>
          <strong>Un movimiento no se borra.</strong> Si te equivocas, apuntas el contrario. Un libro que se puede
          editar hacia atrás no sirve para explicar nada.
        </p>
      </AyudaPaso>

      <AyudaPaso numero={3} titulo="Al cerrar, cuenta el efectivo">
        <p>
          Tentare te dice lo que debería haber y tú tecleas lo que has contado. La diferencia sale en pantalla.
        </p>
        <p style={{ margin: 0 }}>
          Ese «debería haber» sale del libro, sumando <strong>solo el efectivo</strong>: fondo inicial, ventas en
          efectivo y tus entradas y salidas. Un cobro con datáfono o Bizum es una venta, pero no pone un billete
          en el cajón, así que no cuenta aquí.
        </p>
      </AyudaPaso>

      <AyudaResultado>
        El arqueo queda guardado con las tres cifras: esperado, contado y diferencia. Una diferencia no es un
        fallo de Tentare ni algo que disimular — es el número que te dice si falta cambio, si alguien cobró fuera
        de la Caja o si hubo un despiste, que son tres conversaciones distintas.
      </AyudaResultado>
    </>
  );
}

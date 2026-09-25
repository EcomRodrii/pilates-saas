import Link from 'next/link';

import { AyudaAntesDeEmpezar, AyudaResultado } from '@/components/ayuda/AyudaPasos';

export default function Contenido() {
  return (
    <>
      <AyudaAntesDeEmpezar>
        Cobros responde a dos preguntas, que son las dos que se hace cualquiera que lleva un estudio:{' '}
        <strong>quién me debe</strong> y <strong>cuánto he cobrado</strong>. Todo lo demás de esta pantalla cuelga
        de ahí.
      </AyudaAntesDeEmpezar>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '24px 0 12px' }}>Quién me debe</h2>
      <p>
        Los recibos que están sin cobrar, con su importe y desde cuándo. Desde aquí cobras uno, o varios a la vez
        si tienes tarjetas guardadas, y ves qué suscripciones siguen activas.
      </p>
      <p>
        Si una tarjeta falló, el recibo sigue aquí marcado como «No se pudo cobrar». No hay que buscarlo en otro sitio: lo que no ha
        entrado se queda en esta lista hasta que entra.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '28px 0 12px' }}>Si se cancela una cuota</h2>
      <p>
        Una cuota cancelada —la cancelas tú, cambia de plan, termina tras darse de baja o se cancela porque no se pudo
        cobrar— <strong>no genera cobros nuevos</strong>. Qué pasa con el recibo que ya estaba pendiente lo eliges tú, en
        Configuración → «Cobros y facturas» → «Si se cancela una cuota»:
      </p>
      <ul style={{ margin: '0 0 12px', paddingLeft: 20 }}>
        <li>
          <strong>Sigue debiéndolo y se sigue intentando cobrar</strong> (si no eliges nada): se queda en esta lista y,
          si tenía cobros automáticos programados, se siguen intentando.
        </li>
        <li>
          <strong>Sigue debiéndolo, sin cobros automáticos</strong>: se queda en esta lista, pero solo se cobra si lo
          cobras tú o lo paga ella.
        </li>
        <li>
          <strong>Se anula</strong>: deja de deberlo y sale de esta lista (en «Todos los recibos» aparece como «Anulado al
          cancelar la cuota»). Si tenía un pago en marcha no se puede anular: se queda pendiente, sin cobros automáticos.
        </li>
      </ul>
      <p>
        Los recibos que fallaron o se devolvieron no cambian. Y cobrar la deuda de una cuota cancelada no la vuelve a
        activar: para eso está «Reactivar» en su ficha.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '28px 0 12px' }}>Lo que he cobrado</h2>
      <p>
        El dinero que ha entrado, con su fecha y su método. Sirve para cuadrar con el banco y para responder a la
        pregunta de siempre —«¿este mes ha ido mejor?»— sin abrir un informe.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '28px 0 12px' }}>Facturas</h2>
      <p style={{ margin: 0 }}>
        Está aparte porque no es una vista más: es una obligación fiscal. Cada cobro completado tiene la suya, y
        de aquí salen los PDF. El resumen para tu gestoría tiene su propia entrada en el menú,{' '}
        <Link href="/ayuda/pagos/cierre-de-ano" style={{ color: 'inherit', textDecoration: 'underline' }}>Cierre de año</Link>.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '28px 0 12px' }}>Eliminar un recibo</h2>
      <p>
        Solo se puede eliminar un recibo que aún <strong>no es dinero cobrado</strong>: uno pendiente, fallido o
        anulado, sin factura y sin un pago abierto (por ejemplo, un enlace de pago que la clienta aún puede completar).
        Al eliminarlo eliges un motivo —está duplicado, el importe estaba mal, se creó por error, la clienta se da de
        baja u otro motivo— y queda guardado, con quién lo eliminó y cuándo, en «Cambios del equipo».
      </p>
      <p>
        Un recibo <strong>cobrado, devuelto o en curso no se elimina</strong>: el dinero no desaparece, se devuelve. Si
        algo cobrado no debía estar ahí, regístralo como devuelto.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '28px 0 12px' }}>Cambios del equipo</h2>
      <p>
        Solo la propietaria la ve. Cada vez que alguien de tu equipo <strong>crea, cambia o borra</strong> un recibo,
        una cuota o bono o un plan, queda aquí: quién fue, cuándo, y qué valor había antes. Es lo que
        necesitas para explicar un descuadre sin preguntar a todo el mundo. Lo de una clienta concreta también sale en
        la pestaña «Pagos» de su ficha.
      </p>
      <p style={{ margin: 0 }}>
        Cuenta lo que se hace desde el panel, desde el día que se activó: no hay historial anterior. <strong>No incluye</strong>{' '}
        los cobros automáticos, los reintentos ni lo que confirma Stripe por su cuenta, porque no los hace una
        persona de tu equipo; y todavía no recoge los ingresos manuales, los reembolsos ni las devoluciones que se
        lanzan desde el panel. Los
        descuentos de una sola sesión de un bono se esconden por defecto para que no tapen lo importante, y puedes
        mostrarlos.
      </p>

      <AyudaResultado>
        La Caja no está aquí, y no es un olvido: se usa de pie y a pantalla completa, con alguien delante.
        Entrar en una pantalla de escritorio para atender a quien está en el mostrador no tenía sentido.
      </AyudaResultado>
    </>
  );
}

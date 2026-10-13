import Link from 'next/link';

import { AyudaAntesDeEmpezar, AyudaResultado } from '@/components/ayuda/AyudaPasos';
import { PLAZO_CONSERVACION_ANIOS } from '@/lib/auditoria/aviso-equipo';

export default function Contenido() {
  return (
    <>
      <AyudaAntesDeEmpezar>
        Cobros responde a dos preguntas, que son las dos que se hace cualquiera que lleva un estudio:{' '}
        <strong>quién me debe</strong> y <strong>cuánto he cobrado</strong>. Todo lo demás de esta pantalla cuelga
        de ahí, y arriba del todo tienes la respuesta corta: cuánto te deben, cuánto está en el banco y cuánto has
        cobrado este mes frente al anterior a estas alturas.
      </AyudaAntesDeEmpezar>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '24px 0 12px' }}>Quién me debe</h2>
      <p>
        Una fila por clienta, con lo que debe en total y desde cuándo. Al pulsarla se abre su ficha de deuda al lado:
        cada recibo, cómo se le puede cobrar (su tarjeta, su domiciliación o en el mostrador) y, si el cobro automático
        lo va a intentar solo, cuándo. Desde ahí cobras todo lo suyo de una vez o un recibo suelto. Para cobrar a varias
        clientas a la vez, «Seleccionar varias» y eliges cómo te han pagado.
      </p>
      <p>
        Si una tarjeta falló, el recibo sigue aquí marcado como «No se pudo cobrar». No hay que buscarlo en otro sitio: lo que no ha
        entrado se queda en esta lista hasta que entra. Debajo, «Próximas cuotas» te dice cómo se va a cobrar cada cuota
        que se renueva en los próximos 30 días (sola con su tarjeta, por el banco, a mano…).
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '28px 0 12px' }}>Nuevo cobro</h2>
      <p>
        Para cobrar algo que no tiene recibo todavía (un bono, un producto, una clase). Te pregunta si ya te lo ha
        pagado: si es ahora, eliges cómo y queda cobrado; si lo paga después, queda en «Quién me debe» con su fecha.
        Antes de cobrar te dice si se apunta en la caja y si sale factura. En efectivo no sale factura sola: si te la
        pide, marca «Hacerle factura». Si has apagado «Facturar automáticamente» (Configuración → Cobros y facturas),
        ninguna sale sola: la haces desde el recibo cobrado. Es el mismo diálogo que el «Nuevo cobro» de la ficha de la clienta.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '28px 0 12px' }}>Lo que está en el banco</h2>
      <p>
        «Preparar recibos para el banco» te enseña primero qué recibos entran (los pendientes de quien tiene la
        domiciliación firmada), cuáles se quedan fuera y por qué, y el día para el que se pedirá el cargo (el banco
        puede moverlo a un día hábil). Al generar el fichero, esos recibos pasan a «En el banco» y lo subes a la web de
        tu banco.
      </p>
      <p>
        Los recibos que mandas al banco en una remesa salen como «En el banco»: todavía no son deuda, porque el
        banco no ha contestado. Cuando lo haga, márcalo: <strong>«El banco lo ha cobrado»</strong> (queda cobrado y,
        si era una cuota, se renueva) o <strong>«El banco lo devolvió»</strong> (vuelve a deberlo). Un recibo que
        devolvió el banco puede volver a la próxima remesa con «Reintentar», si la clienta tiene la domiciliación vigente.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '28px 0 12px' }}>Devolver un cobro</h2>
      <p>
        No es lo mismo devolverle tú el dinero que te lo devuelva el banco, y cada cosa tiene su botón:
      </p>
      <ul style={{ margin: '0 0 12px', paddingLeft: 20 }}>
        <li>
          <strong>«Le he devuelto el dinero»</strong>: se lo devolviste tú (en efectivo, por Bizum, por transferencia o en
          el datáfono). Ya no lo debe, y si sale del cajón se apunta en la caja. Lo que compró no se le quita solo:
          si hay que quitárselo, desde su ficha.
        </li>
        <li>
          <strong>«El banco lo devolvió»</strong>: el banco devolvió el cargo (una tarjeta o una domiciliación). Vuelve a
          deberlo, y sale otra vez en «Quién me debe».
        </li>
      </ul>
      <p>
        Lo que se cobró por Stripe se devuelve por Stripe, desde la ficha de la clienta, y el recibo se marca solo.
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
          <strong>Se anula</strong>: deja de deberlo y sale de esta lista (en la pestaña «Pagos» de su ficha sigue
          apareciendo, como anulado). Si tenía un pago en marcha no se puede anular: se queda pendiente, sin cobros automáticos.
        </li>
      </ul>
      <p>
        Los recibos que fallaron o se devolvieron no cambian. Y cobrar la deuda de una cuota cancelada no la vuelve a
        activar: para eso está «Reactivar» en su ficha.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '28px 0 12px' }}>Lo que he cobrado</h2>
      <p>
        El dinero que ha entrado hoy, esta semana o este mes (con las flechas vas a los anteriores), ya restado lo
        devuelto y frente al mismo tramo del periodo anterior: responde a «¿este mes ha ido mejor?» sin abrir un
        informe. Al lado, cómo te han pagado (domiciliación, tarjeta, efectivo, Bizum…), para cuadrar la caja y el
        banco; y la lista de cobros por día, con la hora cuando la hay. «Descargar para la gestoría» baja lo cobrado
        del periodo que estás viendo: el mismo fichero que Informes y el cierre del año.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '28px 0 12px' }}>Facturas o «Para tu gestoría»</h2>
      <p>
        La pestaña «Facturas» enseña lo facturado este mes (base, IVA y total), los cobros en efectivo que se quedaron
        sin factura, y cada factura con su PDF. Con Veri*Factu activado, además, cada factura se sella con su huella al
        cobrarse.
      </p>
      <p style={{ margin: 0 }}>
        Si tus facturas las hace tu gestoría, la pestaña se llama «Para tu gestoría»: lo cobrado del trimestre anterior,
        el que va y el año anterior, cada uno con su descarga. El resumen del año tiene su propia entrada en el menú,{' '}
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
        algo cobrado no debía estar ahí y le has devuelto el dinero, usa «Le he devuelto el dinero».
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '28px 0 12px' }}>Cambios del equipo</h2>
      <p>
        Solo la propietaria la ve. Cada vez que alguien de tu equipo <strong>crea, cambia o borra</strong> un recibo,
        una cuota o bono, un plan o un ingreso manual, <strong>pide un reembolso</strong>, le devuelve a mano el dinero
        de un cobro, marca un recibo como devuelto por el banco o <strong>como cobrado a mano</strong> o por el banco,
        lo vuelve a pasar por el banco, <strong>lanza un cobro</strong> con el método de pago guardado, vende una clase suelta en el
        calendario, devuelve una venta de la caja, emite una factura rectificativa o aprueba cobrar una penalización, queda aquí: quién fue, cuándo, y qué valor había antes. Es lo que
        necesitas para explicar un descuadre sin preguntar a todo el mundo. Lo de una clienta concreta también sale en
        la pestaña «Pagos» de su ficha.
      </p>
      <p style={{ margin: 0 }}>
        Cuenta lo que se hace desde el panel, desde el día que se activó: no hay historial anterior. <strong>No incluye</strong>{' '}
        los cobros automáticos, los reintentos ni lo que confirma Stripe por su cuenta, porque no los hace una
        persona de tu equipo, ni un intento de cobro que el banco rechaza (no cambia ningún dato: eso lo ves en
        Stripe). Las ventas de la caja y sus entradas y salidas de efectivo llevan su propio registro, con quién las
        hizo, en la propia Caja. Todavía no recoge lo que se importa desde otra plataforma. Los descuentos de una sola
        sesión de un bono se esconden por defecto para que no tapen lo importante, y puedes mostrarlos.
      </p>
      <p style={{ margin: 0 }}>
        Cada entrada se guarda <strong>{PLAZO_CONSERVACION_ANIOS} años</strong> y después se borra sola.{' '}
        <strong>Tu equipo tiene que saber que se anota lo que hace</strong>: el correo de invitación de quien trabaja en
        el panel se lo cuenta, y al dar de alta a alguien en Equipo tienes el aviso delante. A quien ya trabajaba
        contigo antes, avísale tú.
      </p>

      <AyudaResultado>
        La Caja no está aquí, y no es un olvido: se usa de pie y a pantalla completa, con alguien delante.
        Entrar en una pantalla de escritorio para atender a quien está en el mostrador no tenía sentido.
      </AyudaResultado>
    </>
  );
}

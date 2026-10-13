import type { Capitulo } from './tipos.ts';
import { abrirCajon, abrirSeccion, cajon, cerrarCajon, fila, guardarYCerrar } from './ayudas.ts';

export const cobros: Capitulo = {
  id: 'cobros',
  titulo: 'Cobros y facturas',
  frase: 'Cómo te pagan tus alumnas y qué sale en tus facturas.',
  async guion(g, pos) {
    const { page } = g;
    await abrirSeccion(g, pos, 'cobros', 'Cobros y facturas', 'Cómo te pagan tus alumnas y qué sale en tus facturas.',
      'Cuarto capítulo: cobros y facturas. Aquí decides cómo te pagan tus alumnas y qué sale en tus facturas. Es la parte donde hay dinero de verdad, así que en este vídeo vamos a explicar lo que mueve dinero sin ejecutarlo.');

    // ── Datos fiscales ──
    g.momento('datos-fiscales');
    await g.mientras('Empezamos por los datos fiscales y el IVA, porque de ellos depende todo lo demás. La razón social, el NIF y el IVA de tus facturas.', async () => {
      await abrirCajon(g, 'datos-fiscales');
      await g.escribe(cajon(page).getByLabel('Razón social'), 'Estudio Aurora S.L.');
    });
    await g.mientras('El NIF o CIF. Tentare comprueba que sea válido: si no lo es, tus cobros se quedan sin factura, y la fila te avisa con una etiqueta. Aquí ponemos uno de ejemplo.', async () => {
      await g.escribe(cajon(page).getByLabel('NIF / CIF'), 'B40000002');
    });
    await g.mientras('El IVA general es el veintiuno por ciento. Tus precios llevan el IVA incluido, así que cambiarlo cambia el desglose de la factura, no lo que paga la alumna. Y solo afecta a las facturas nuevas. Guardamos.', async () => {
      await g.ir(cajon(page).getByLabel('IVA general'));
      await guardarYCerrar(g);
    });

    // ── Facturación ──
    g.momento('facturacion');
    await g.mientras('Facturación. Tentare puede emitir una factura en cada cobro, salvo en efectivo. Tienes dos opciones: facturas sin envío a la Agencia Tributaria, o facturas con Veri*Factu, que además llevan una huella encadenada a la anterior y se envían a la Agencia Tributaria.', async () => {
      await abrirCajon(g, 'facturacion');
      await g.ir(cajon(page).getByRole('radio', { name: /Veri\*Factu/ }));
    });
    await g.mientras('Esta decisión tiene consecuencias fiscales: si tu gestoría te la ha pedido, o si no sabes cuál te corresponde, consúltalo con ella antes de cambiarla. Dejamos la que viene, sin envío, y cerramos.', async () => {
      await g.ir(cajon(page).getByRole('radio', { name: /sin envío a la AEAT/ }));
      await cerrarCajon(g);
    });

    // ── Stripe y datáfono ──
    g.momento('integracion-stripe');
    await g.mientras('Cobro con tarjeta con Stripe. Cobras bonos y cuotas con tarjeta en tu propia cuenta de Stripe, y el dinero entra directo en ella. Aquí sale como no disponible: es un estudio de ejemplo y no vamos a conectar ninguna cuenta ni cobrar nada.', async () => {
      await g.ir(fila(page, 'integracion-stripe'));
    });
    g.momento('datafono');
    await g.mientras('El datáfono depende del cobro con tarjeta. Cuando Stripe está conectado, mandas el importe desde la Caja y la venta queda cobrada sola. Hoy funciona el de Stripe; otros, como SumUp o el de tu banco, están por llegar.', async () => {
      await g.ir(fila(page, 'datafono'));
    });

    // ── Cuándo se cobra la cuota ──
    g.momento('cuando-se-cobra-la-cuota');
    await g.mientras('Cuándo se cobra la cuota mensual. Cada alumna puede pagar en su aniversario, el mismo día del mes en que contrató; o todas el día uno de cada mes, y entonces cada cuota se realinea sola en su próxima renovación.', async () => {
      await abrirCajon(g, 'cuando-se-cobra-la-cuota');
      await g.ir(cajon(page).getByRole('radio', { name: /Todas el día 1/ }));
    });
    await g.mientras('Dejamos el aniversario, que es lo más habitual y no obliga a nadie a pagar de golpe a principios de mes. Cerramos.', async () => {
      await cerrarCajon(g);
    });

    // ── Domiciliaciones ──
    g.momento('domiciliaciones');
    await g.mientras('Domiciliaciones bancarias. Los datos que pide tu banco para cobrar recibos domiciliados: el identificador de acreedor, el IBAN de la cuenta del estudio y el titular. Con ellos generas la remesa en Cobros.', async () => {
      await abrirCajon(g, 'domiciliaciones');
      await g.escribe(cajon(page).getByLabel('Identificador de acreedor'), 'ES00000B40000002');
      await g.escribe(cajon(page).getByLabel('IBAN de la cuenta del estudio'), 'ES9121000418450200051332');
      await g.escribe(cajon(page).getByLabel('Titular de la cuenta'), 'Estudio Aurora S.L.');
    });
    await g.mientras('Todos los datos de este vídeo son de ejemplo, también este IBAN. Guardamos.', async () => {
      await guardarYCerrar(g);
    });

    // ── Devoluciones ──
    g.momento('devoluciones');
    await g.mientras('Devoluciones. Si lo activas, puedes devolver un cobro desde la ficha de la alumna, y el dinero vuelve a su tarjeta. Si está apagado, las devoluciones las haces desde Stripe. Depende del cobro con tarjeta, así que aquí la dejamos apagada.', async () => {
      await abrirCajon(g, 'devoluciones');
      await g.ir(cajon(page).getByRole('switch', { name: /Permitir devolver/ }));
    });
    await g.mientras('Cerramos sin cambios.', async () => {
      await cerrarCajon(g);
    });

    // ── Si se cancela una cuota ──
    g.momento('si-se-cancela-una-cuota');
    await g.mientras('Si se cancela una cuota. ¿Qué pasa con su recibo pendiente? Puede seguir debiéndolo y seguir intentando cobrarlo, seguir debiéndolo sin cobros automáticos, o anularse.', async () => {
      await abrirCajon(g, 'si-se-cancela-una-cuota');
      await g.ir(cajon(page).getByRole('radio', { name: /Se anula/ }));
    });
    await g.mientras('Y si la alumna puede renovar su cuota ella sola desde su app. Lo dejamos como viene y cerramos.', async () => {
      await g.ir(cajon(page).getByRole('switch', { name: /renueve ella/ }));
      await cerrarCajon(g);
    });

    await g.dice('Al final de la pantalla hay dos filas que llevan a otras pantallas: Paquetes, donde están tus planes, bonos y precios, y Cobros, donde ves quién te debe, lo cobrado y tus facturas. Se configuran allí porque es donde se usan.');
  },
};

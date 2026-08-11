import type { Metadata } from 'next';
import Link from 'next/link';
import { FeatureShell } from '@/components/funcionalidades/FeatureShell';
import { CierreCta, Entradilla, FeatureFaq, Limite, Rejilla, Seccion, Tabla } from '@/components/funcionalidades/bloques';
import { CadenaDeHuellas, DelCobroALaFactura, LoQueLlevaLaFactura } from '@/components/funcionalidades/visuales/facturacion';
import { paginaDe, urlDe } from '@/lib/seo/paginas';

const PATH = '/funcionalidades/facturacion';
const pagina = paginaDe(PATH)!;

export const metadata: Metadata = {
  title: pagina.titulo,
  description: pagina.descripcion,
  alternates: { canonical: urlDe(PATH) },
  openGraph: { type: 'website', locale: 'es_ES', title: pagina.titulo, description: pagina.descripcion, url: urlDe(PATH) },
};

const FAQ = [
  {
    q: '¿Tengo que emitir yo las facturas una a una?',
    a: 'No. Cada cobro genera su factura: la cuota mensual que se cobra sola, el bono que compra una alumna desde el portal, la venta de mostrador. Las que emites a mano son la excepción, no la norma.',
  },
  {
    q: '¿Qué pasa si me equivoco en una factura ya emitida?',
    a: 'No se edita — la ley precisamente lo impide. Se emite una rectificativa, que entra en la cadena como un registro más. Que una factura no se pueda tocar es la función, no una limitación.',
  },
  {
    q: '¿Esto vale para el País Vasco y Navarra?',
    a: 'Lo implementado es la vía común (AEAT). Los territorios forales tienen sus propios sistemas —TicketBAI y LROE en Bizkaia, entre otros— con endpoints distintos, y no están cubiertos. Si facturas desde un territorio foral, consúltalo antes.',
  },
  {
    q: '¿Puedo llevar mi contabilidad con esto?',
    a: 'No es un programa de contabilidad ni presenta impuestos. Lo que hace es emitir facturas que cumplen y prepararte el resumen anual de ingresos e IVA para que tu gestoría trabaje con datos, no con un Excel reconstruido en enero.',
  },
  {
    q: '¿Y si un cobro se devuelve después de emitir la factura?',
    a: 'La devolución queda registrada sobre el recibo, y la factura original sigue existiendo con su huella intacta. El histórico refleja lo que pasó de verdad, que es lo que pide una inspección.',
  },
];

export default function FacturacionPage() {
  return (
    <FeatureShell
      path={PATH}
      eyebrow="España · Ley Antifraude"
      h1={<>Facturas que cumplen, sin que tengas que saber cómo.</>}
      intro={<>Cada cobro genera su factura con número correlativo, huella encadenada y QR de verificación. Firmada y transmitida a la AEAT sin que abras nada.</>}
      chips={['Veri*Factu nativo', 'Numeración a prueba de carreras', 'Cierre anual para la gestoría']}
      gradient="linear-gradient(140deg,#141812 0%,#22251A 58%,#3A4030 100%)"
      visual={<LoQueLlevaLaFactura />}
    >
      <Seccion id="contexto" titulo="Qué cambió en España, en una página">
        <Entradilla>
          La Ley Antifraude (Real Decreto 1007/2023) exige que el software de facturación no pueda ocultar, modificar ni
          eliminar una venta después de emitirla. No es una recomendación: es un requisito sobre la herramienta, no sobre ti.
        </Entradilla>
        <p>
          Para un estudio de Pilates eso descarta de golpe lo que muchos siguen usando: una plantilla de Word, una hoja de
          cálculo con la numeración a mano, o un software extranjero que emite recibos pero no facturas españolas. Todos
          comparten el mismo defecto — se pueden editar después.
        </p>
        <p>
          Lo que resuelve Veri*Factu es exactamente eso: cada factura queda <strong>encadenada a la anterior</strong> mediante
          una huella criptográfica, y lleva un QR con el que cualquiera puede cotejarla en la sede electrónica de la AEAT. Si
          quieres el detalle normativo con fuentes, está en la guía{' '}
          <Link href="/recursos/facturacion-electronica-verifactu">facturación electrónica para estudios en España</Link>.
        </p>
      </Seccion>

      <Seccion id="flujo" titulo="Del cobro a la factura, sin pasos intermedios">
        <p>
          La relación entre <Link href="/funcionalidades/cobros-recurrentes">cobros</Link> y facturas es donde la mayoría de
          estudios pierde horas: se cobra en un sitio y se factura en otro, y a fin de mes hay que cuadrar los dos. Aquí es
          una sola cosa. Un recibo que pasa a cobrado dispara su factura.
        </p>
        <DelCobroALaFactura />
        <p>
          La reserva del número tiene más miga de la que parece. Dos cobros que caen en el mismo segundo —el webhook de un
          adeudo SEPA confirmado y una venta de mostrador, por ejemplo— podrían coger el mismo número o partir la cadena en
          dos. Por eso la numeración pasa por un bloqueo por estudio y una restricción de unicidad en la base de datos: el
          fallo no puede ocurrir, no es que sea improbable.
        </p>
      </Seccion>

      <Seccion id="cadena" titulo="Qué es exactamente la huella">
        <p>
          Es un SHA-256 calculado sobre los datos fiscales de la factura —NIF del emisor, número y serie, fecha, tipo, cuota
          de IVA, importe total— <strong>más la huella de la factura anterior</strong>, concatenados en el orden exacto que
          fija la AEAT. Ese orden no es un detalle de estilo: si cambias el orden de dos campos, el resultado deja de
          coincidir con el que Hacienda espera.
        </p>
        <CadenaDeHuellas />
        <p>
          La misma mecánica se aplica a las anulaciones, que también entran como registro encadenado. Anular no borra: deja
          constancia.
        </p>
      </Seccion>

      <Seccion id="aeat" titulo="Firma y envío a la AEAT">
        <p>
          Calcular la huella es la mitad. La otra mitad es <strong>firmar el registro con un certificado</strong> y
          transmitirlo. De eso se encarga Fiskaly SIGN ES, un proveedor especializado que gestiona el certificado, encadena
          por emisor y hace el envío.
        </p>
        <Tabla
          cabeceras={['Paso', 'Quién lo hace', 'Depende de configuración']}
          filas={[
            ['Numeración correlativa', 'Tentare', 'No — siempre'],
            ['Huella encadenada', 'Tentare', 'No — siempre'],
            ['QR de cotejo AEAT', 'Tentare', 'No — siempre'],
            ['Firma con certificado', 'Fiskaly SIGN ES', 'Sí — credenciales del entorno'],
            ['Transmisión a la AEAT', 'Fiskaly SIGN ES', 'Sí — credenciales del entorno'],
          ]}
        />
        <Limite titulo="Dónde está el límite, dicho claro">
          La numeración, la huella y el QR se generan siempre. La firma y la transmisión pasan por un proveedor externo y
          están condicionadas a que sus credenciales estén activas en el entorno; si esa llamada falla, la factura conserva
          su número y su huella y no se pierde nada, pero ese registro concreto no habrá llegado a la AEAT hasta que se
          reintente. Además, esto cubre la vía común: los territorios forales tienen sus propios sistemas y no están
          incluidos. Nada de esto es asesoramiento fiscal — el encaje con tu situación lo confirma tu asesoría.
        </Limite>
      </Seccion>

      <Seccion id="cierre" titulo="Y en enero, el cierre del año">
        <p>
          Facturar bien durante doce meses solo sirve si en enero puedes entregar algo. El cierre de año reúne los ingresos y
          el IVA del ejercicio en un resumen pensado para tu gestoría.
        </p>
        <Rejilla
          items={[
            { titulo: 'Ingresos del ejercicio', body: 'Lo cobrado de verdad, no lo facturado en teoría: las devoluciones se descuentan donde toca.' },
            { titulo: 'IVA repercutido', body: 'Desglosado, listo para cuadrar con los modelos que presenta tu asesoría.' },
            { titulo: 'Envío a la gestoría', body: 'El resumen sale por correo, sin que tengas que exportar y adjuntar a mano.' },
            { titulo: 'Lo que NO hace', body: 'No presenta impuestos ni sustituye a tu asesoría. Prepara los números; presentarlos sigue siendo suyo.' },
          ]}
        />
      </Seccion>

      <Seccion id="faq" titulo="Preguntas frecuentes">
        <FeatureFaq items={FAQ} />
      </Seccion>

      <CierreCta
        titulo="Deja de reconstruir el año en enero"
        body="Factura desde el primer euro con numeración, huella y QR, y llega a la gestoría con los números ya hechos."
      />
    </FeatureShell>
  );
}

import { AyudaPaso, AyudaAntesDeEmpezar, AyudaResultado } from '@/components/ayuda/AyudaPasos';

export default function Contenido() {
  return (
    <>
      <AyudaAntesDeEmpezar>
        Es lo que tu gestoría te pide cada trimestre y cada enero: cuánto has facturado y cuánto IVA has
        repercutido. Sale de tus facturas ya emitidas y selladas, así que no hay nada que rehacer ni ningún Excel
        que montar.
      </AyudaAntesDeEmpezar>

      <AyudaPaso numero={1} titulo="Mira el año, o el trimestre">
        <p style={{ margin: 0 }}>
          Arriba tienes las tres cifras: base imponible, IVA repercutido y total facturado. Debajo, el desglose{' '}
          <strong>por trimestre</strong> —porque el modelo 303 es trimestral, no anual— y el IVA separado por
          tipo.
        </p>
      </AyudaPaso>

      <AyudaPaso numero={2} titulo="Añade lo que cobraste fuera de Tentare">
        <p style={{ margin: 0 }}>
          ¿Un taller que cobraste por transferencia antes de usar Tentare, un alquiler de sala? Se apunta a mano
          con su fecha, concepto, NIF y tipo de IVA, y entra en los totales. Así el resumen es el de tu negocio,
          no el de una parte.
        </p>
      </AyudaPaso>

      <AyudaPaso numero={3} titulo="Mándaselo a tu gestoría">
        <p>
          Puedes descargarlo en CSV, imprimirlo o guardarlo en PDF, y enviarlo por correo desde aquí mismo —el año
          entero o solo un trimestre.
        </p>
        <p style={{ margin: 0 }}>
          Si dejas puesto el email de tu gestoría, cada trimestre se le manda solo el día 1 del mes siguiente, sin
          que tengas que volver a esta pantalla.
        </p>
      </AyudaPaso>

      <AyudaResultado>
        Un límite que conviene tener claro: esto es una recopilación de <strong>ingresos e IVA repercutido</strong>.
        No incluye tus gastos ni el IVA soportado, y no presenta ningún impuesto — eso lo sigue haciendo tu
        gestoría, con esto delante en vez de con una carpeta de papeles.
      </AyudaResultado>
    </>
  );
}

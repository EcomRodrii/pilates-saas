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
        Si una tarjeta falló, el recibo sigue aquí con el motivo. No hay que buscarlo en otro sitio: lo que no ha
        entrado se queda en esta lista hasta que entra.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '28px 0 12px' }}>Lo que he cobrado</h2>
      <p>
        El dinero que ha entrado, con su fecha y su método. Sirve para cuadrar con el banco y para responder a la
        pregunta de siempre —«¿este mes ha ido mejor?»— sin abrir un informe.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '28px 0 12px' }}>Facturas</h2>
      <p style={{ margin: 0 }}>
        Está aparte porque no es una vista más: es una obligación fiscal. Cada cobro completado tiene la suya, y
        de aquí salen los PDF y el <Link href="/ayuda/pagos/cierre-de-ano" style={{ color: 'inherit', textDecoration: 'underline' }}>cierre de año</Link>.
      </p>

      <AyudaResultado>
        La Caja no está aquí, y no es un olvido: se usa de pie y a pantalla completa, con alguien delante.
        Entrar en una pantalla de escritorio para atender a quien está en el mostrador no tenía sentido.
      </AyudaResultado>
    </>
  );
}

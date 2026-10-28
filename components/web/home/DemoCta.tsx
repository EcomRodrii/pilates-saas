import Link from 'next/link';

// «¿Quieres ver Tentare por dentro?» — la entrada a la demo personalizada
// (app/demo). Una sola idea y un solo botón, entre el producto por áreas y los
// momentos del día: justo cuando alguien ya ha visto qué hace Tentare y aún no
// ha decidido si le encaja.
//
// Solo se pinta si la demo está abierta a todos (lib/demo/interruptor.ts); con
// el interruptor apagado o en «prueba» la home no cambia ni un píxel.
//
// El texto es el pedido por el fundador. Lo que promete es lo que hace: Tenti
// pregunta lo mínimo y enseña, con datos de ejemplo, cómo se resolvería su caso.
export function DemoCta() {
  return (
    <section className="wh-seccion" aria-labelledby="wh-demo-h" data-demo-cta>
      <div className="wh-contenedor">
        <div className="wh-cabecera wh-cabecera-centro" style={{ marginBottom: 0 }}>
          <h2 id="wh-demo-h" className="wh-h2">¿Quieres ver Tentare por dentro?</h2>
          <p className="wh-lead">Cuéntanos qué necesitas resolver y descubre cómo funcionaría en tu estudio.</p>
          <div style={{ marginTop: 28 }}>
            <Link href="/demo" className="wh-boton wh-boton-demo" data-demo-cta-boton>DEMO PERSONALIZADA</Link>
          </div>
        </div>
      </div>
    </section>
  );
}

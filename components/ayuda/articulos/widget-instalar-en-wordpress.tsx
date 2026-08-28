import Link from 'next/link';
import { AyudaPaso, AyudaResultado } from '@/components/ayuda/AyudaPasos';

export default function Contenido() {
  return (
    <>
      <AyudaPaso numero={1} titulo="Genera tu código en Configuración > API > Widgets">
        <p style={{ margin: 0 }}>
          Elige el widget, personalízalo y pulsa «Copiar código» — ver{' '}
          <Link href="/ayuda/widget/instalar-con-html" style={{ color: 'inherit', textDecoration: 'underline' }}>instalar el widget con HTML</Link> para el detalle de esta pantalla.
        </p>
      </AyudaPaso>

      <AyudaPaso numero={2} titulo="Añade un bloque HTML personalizado">
        <p>En el editor de bloques de WordPress, añade un bloque «HTML personalizado» en la página donde quieras el widget — no hace falta instalar ningún plugin nuevo.</p>
      </AyudaPaso>

      <AyudaPaso numero={3} titulo="Pega el código y publica">
        <p style={{ margin: 0 }}>
          Pega el código copiado, publica, y si usas un plugin de caché (WP Rocket, W3 Total Cache…) vacíala después
          — si no, puede seguir sirviendo la versión antigua de la página sin el widget.
        </p>
      </AyudaPaso>

      <AyudaResultado>
        No hace falta ningún plugin de terceros para reservas: el widget de Tentare funciona con el bloque de HTML
        que ya trae WordPress de serie.
      </AyudaResultado>
    </>
  );
}

import Link from 'next/link';
import { AyudaCaptura } from '@/components/ayuda/AyudaCaptura';
import { AyudaResultado } from '@/components/ayuda/AyudaPasos';

// Reescrito el 28-ago-2026 tras verificar en vivo
// /configuracion/apariencia/editor: es un editor de secciones y bloques con
// vista previa móvil en directo, no solo un selector de color y tipografía
// (eso vive en la otra pestaña, "Ajustes del tema" — ver
// configuracion/marca).
export default function Contenido() {
  return (
    <>
      <p>
        Desde Configuración &gt; Estudio &gt; «Editar marca y apariencia» entras al editor de tema: a la izquierda,
        las secciones de cada pantalla del portal; a la derecha, una vista previa móvil en vivo que cambia con cada
        edición.
      </p>

      <AyudaCaptura
        src="/help/configuracion/apariencia-editor.png"
        alt="Editor de tema, pestaña Secciones: bloques del Inicio del portal de la socia, con vista previa móvil en directo"
        caption="Secciones del Inicio — arrastra para reordenar, oculta lo que no uses, añade bloques del catálogo."
      />

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '28px 0 12px' }}>Tres zonas distintas</h2>
      <ul style={{ margin: '0 0 20px', paddingLeft: 22, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 15, lineHeight: 1.6 }}>
        <li><strong>Portal de la socia</strong> — lo que ve tu clienta en su móvil: Inicio (con bloques como «Esta semana», «Accesos rápidos», «Progreso semanal», «Retos»…), Clases, Bonos, Bienvenida, Reservas y Perfil.</li>
        <li><strong>Página pública de reservas</strong> — la que enlazas desde tu web, la ve cualquiera sin cuenta.</li>
        <li><strong>Panel del equipo</strong> — lo que ves tú y tu equipo al entrar; no lo ve ninguna clienta.</li>
      </ul>

      <p>
        Dentro de Inicio, el saludo y la próxima clase se quedan siempre arriba — el resto de bloques los arrastras,
        ocultas o añades desde un catálogo, sin tocar código.
      </p>

      <AyudaResultado>
        Nada de esto se aplica hasta que pulsas «Publicar» — mientras tanto es un borrador que solo ves tú. Color,
        tipografía y el resto de la identidad visual viven en la otra pestaña del mismo editor: ver{' '}
        <Link href="/ayuda/configuracion/marca" style={{ color: 'inherit', textDecoration: 'underline' }}>tu marca: logo y color</Link>.
      </AyudaResultado>
    </>
  );
}

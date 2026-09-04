import Link from 'next/link';
import { AyudaCaptura } from '@/components/ayuda/AyudaCaptura';
import { AyudaResultado } from '@/components/ayuda/AyudaPasos';

// Reescrito el 28-ago-2026 tras verificar en vivo Configuración > API >
// Widgets: no es un único widget, son seis, generados y personalizados desde
// el panel, con vista previa en directo y el código ya listo para copiar.
export default function Contenido() {
  return (
    <>
      <p>
        Desde Configuración &gt; API tienes seis widgets distintos para tu web, cada uno para una cosa: un
        calendario en vivo, tus citas, «mis reservas» para clientas ya dadas de alta, la ficha de tu estudio, el
        enlace directo a una clase concreta, y una versión sin marco ni recuadro para quien quiera integrarlo del
        todo en su diseño.
      </p>

      <AyudaCaptura
        src="/help/widget/configuracion-api-dominios.png"
        alt="Configuración > API > Widgets: los seis tipos de widget disponibles, con vista previa en directo"
        caption="Configuración &gt; API &gt; Widgets — elige, personaliza y copia."
      />

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '28px 0 12px' }}>El más habitual: Horario y reserva de clases</h2>
      <p>
        Es el calendario en vivo de tu estudio, incrustado en tu web — tus alumnas reservan sin salir de tu dominio.
        Puedes elegir qué mostrar (tipos de clase, instructoras, salas, si se ve el precio o el nivel) y el color y
        tipo de diseño, con vista previa en directo antes de copiar nada.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '28px 0 12px' }}>Los otros cinco</h2>
      <ul style={{ margin: '0 0 20px', paddingLeft: 22, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 15, lineHeight: 1.6 }}>
        <li><strong>Citas</strong> — para servicios con hora concreta (valoraciones, sesiones 1 a 1…), usando los servicios de cita que ya tengas configurados.</li>
        <li><strong>Mis reservas</strong> — para clientas ya dadas de alta: ven y cancelan sus reservas sin entrar en la app completa.</li>
        <li><strong>El estudio</strong> — descripción, horario general y políticas, pensado para tu página «Sobre nosotras».</li>
        <li><strong>Reserva esta clase</strong> — apunta directo a una clase concreta, para un post, una story o una newsletter, en vez de al calendario entero.</li>
        <li><strong>Calendario embebido (integración directa)</strong> — el mismo calendario, pero sin marco ni recuadro, con tu tipografía alrededor. Requiere autorizar tu dominio primero.</li>
      </ul>

      <AyudaResultado>
        Los cinco primeros funcionan pegando el código tal cual, sin ningún paso previo — ver{' '}
        <Link href="/ayuda/widget/instalar-con-html" style={{ color: 'inherit', textDecoration: 'underline' }}>instalar el widget con HTML</Link>. Solo la integración directa exige autorizar tu dominio antes.
      </AyudaResultado>
    </>
  );
}

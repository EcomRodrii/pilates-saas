import Link from 'next/link';
import { AyudaCaptura } from '@/components/ayuda/AyudaCaptura';
import { AyudaResultado } from '@/components/ayuda/AyudaPasos';

export default function Contenido() {
  return (
    <>
      <p>
        La ficha de una clienta reúne todo lo que hay de ella en un sitio: sus datos, su plan o bono activo, el
        historial de clases a las que ha asistido o faltado, sus pagos y facturas, y las notas que tu equipo va
        dejando sobre su progreso.
      </p>

      <AyudaCaptura
        src="/help/clientes/ficha-de-clienta.png"
        alt="Ficha de una clienta: plan activo, plaza fija, recuperaciones y excepciones de automatizaciones"
        caption="La ficha de una clienta real — resumen, plan y las pestañas de reservas, salud, pagos, comunicaciones y documentos."
      />

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '28px 0 12px' }}>Notas de progreso</h2>
      <p>
        Sirven para dejar constancia de cómo va una alumna sesión a sesión — no son una valoración de la clienta,
        son un apunte de seguimiento pensado para que cualquiera de tu equipo retome el hilo sin preguntarte a ti.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '28px 0 12px' }}>Ficha de salud: quién la ve</h2>
      <p>
        Si usas la ficha de salud (lesiones, zonas y adaptaciones), es un dato sensible con visibilidad restringida a
        propósito: la propietaria y las instructoras ven el detalle completo; recepción solo ve el semáforo de color
        (si hay algo que tener en cuenta o no), nunca el motivo. No es un descuido de la interfaz — es la regla, y
        está igual de protegida en el servidor.
      </p>

      <AyudaResultado>
        Todo lo que ves en la ficha viene de acciones reales (reservas, cobros, notas que ha escrito tu equipo) —
        nada se calcula ni se estima. Relacionado:{' '}
        <Link href="/ayuda/bonos/tipos-de-bono" style={{ color: 'inherit', textDecoration: 'underline' }}>bonos y membresías</Link> y{' '}
        <Link href="/ayuda/instructores/permisos-por-rol" style={{ color: 'inherit', textDecoration: 'underline' }}>permisos por rol</Link>.
      </AyudaResultado>
    </>
  );
}

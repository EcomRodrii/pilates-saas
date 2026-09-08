import Link from 'next/link';

import { AyudaAntesDeEmpezar, AyudaResultado } from '@/components/ayuda/AyudaPasos';

export default function Contenido() {
  return (
    <>
      <AyudaAntesDeEmpezar>
        Mensajería junta en una pantalla las cuatro formas de hablar con tus alumnas —y de que el sistema hable
        por ti—, para no tenerlas repartidas por medio panel.
      </AyudaAntesDeEmpezar>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '24px 0 12px' }}>Notificaciones</h2>
      <p>
        Los avisos para <strong>tu equipo</strong>: una reserva que necesita tu visto bueno, un cobro que ha
        fallado, alguien que se ha dado de baja. Es lo mismo que ves en la campana de arriba, con sitio para
        leerlo con calma.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '28px 0 12px' }}>Comunidad</h2>
      <p>
        El <Link href="/ayuda/app/comunidad" style={{ color: 'inherit', textDecoration: 'underline' }}>tablón del estudio</Link>, el mismo que ven ellas en su portal. Está aquí
        además de en su propia sección para poder publicar sin cambiar de pantalla.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '28px 0 12px' }}>Conversaciones</h2>
      <p>
        Lo que te escriben, un hilo por persona, con su historial. Contestas desde aquí y queda registrado — no en
        tu WhatsApp personal, donde se pierde en cuanto cambias de teléfono.
      </p>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '28px 0 12px' }}>Enviar mensaje</h2>
      <p style={{ margin: 0 }}>
        Escribir tú a un grupo: a las que están en prueba, a las que llevan tiempo sin venir, a las que se han
        dado de baja. Las etapas son las mismas que ves en Clientas, así que lo que filtras aquí es exactamente
        lo que ves allí.
      </p>

      <AyudaResultado>
        Esto es lo que mandas <strong>tú</strong>. Lo que sale solo —recordatorios, avisos de bono a punto de
        acabar— se configura en{' '}
        <Link href="/ayuda/automatizaciones/recordatorios-automaticos" style={{ color: 'inherit', textDecoration: 'underline' }}>Automatizaciones</Link>, y lo que ya se ha
        enviado se comprueba en el{' '}
        <Link href="/ayuda/automatizaciones/registro-de-envios" style={{ color: 'inherit', textDecoration: 'underline' }}>registro de envíos</Link>.
      </AyudaResultado>
    </>
  );
}

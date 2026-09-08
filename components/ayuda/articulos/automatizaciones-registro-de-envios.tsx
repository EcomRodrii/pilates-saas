import Link from 'next/link';

import { AyudaAntesDeEmpezar, AyudaResultado } from '@/components/ayuda/AyudaPasos';

export default function Contenido() {
  return (
    <>
      <AyudaAntesDeEmpezar>
        Todo lo que Tentare ha enviado en tu nombre, con nombre y apellidos: a quién, cuándo, por qué canal y con
        qué resultado. Es la respuesta a «¿le llegó el recordatorio o no?», que hasta ahora solo se podía suponer.
      </AyudaAntesDeEmpezar>

      <p>
        Cada línea trae la fecha, la destinataria, de qué era el aviso y por dónde salió —email, WhatsApp, push—.
        Un mismo aviso puede ir por varios canales y que uno funcione y otro no: por eso el resultado se ve{' '}
        <strong>por canal</strong>, no como un «enviado» global que no distingue.
      </p>
      <p>
        Cuando algo falla, aparece el motivo tal cual lo devuelve quien lo tenía que entregar: correo rebotado,
        número que no existe, móvil sin la app. Con eso ya sabes si el problema es tuyo, suyo o de nadie.
      </p>
      <p>
        Y hay un botón de <strong>Reintentar</strong>. Si vuelve a fallar te lo dice, en vez de quedarse callado —
        un reintento silencioso es indistinguible de un botón que no hace nada.
      </p>

      <AyudaResultado>
        Si un aviso concreto no llega nunca y aquí figura como enviado, el problema está del otro lado: mira{' '}
        <Link href="/ayuda/problemas/no-llega-un-email" style={{ color: 'inherit', textDecoration: 'underline' }}>No llega un email</Link> o{' '}
        <Link href="/ayuda/problemas/no-llega-un-whatsapp" style={{ color: 'inherit', textDecoration: 'underline' }}>No llega un WhatsApp</Link>.
      </AyudaResultado>
    </>
  );
}

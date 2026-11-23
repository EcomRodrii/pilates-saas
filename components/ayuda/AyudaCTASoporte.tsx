import { SOPORTE_WHATSAPP } from '@/lib/soporte';
import { enlaceWhatsApp } from '@/lib/decision/mensajes-socia';

// «¿No encuentras lo que buscas?» con la forma sobria de Shopify: una caja gris clara, sin color de marca, con las dos vías a una persona.
export function AyudaCTASoporte({ titulo = '¿No encuentras lo que buscas?', texto = 'Escríbenos y te responde una persona, no un bot.' }: {
  titulo?: string; texto?: string;
}) {
  const chat = enlaceWhatsApp(SOPORTE_WHATSAPP, 'Hola, tengo una duda sobre Tentare:');
  return (
    <div className="ay-soporte">
      <div>
        <p className="ay-soporte-t">{titulo}</p>
        <p className="ay-soporte-s">{texto}</p>
      </div>
      <div className="ay-soporte-acciones">
        {chat && <a href={chat} target="_blank" rel="noreferrer">Chat humano</a>}
        <a href="mailto:soporte@tentare.app">Escribir un correo</a>
      </div>
    </div>
  );
}

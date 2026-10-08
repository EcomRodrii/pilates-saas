import type { Capitulo } from './tipos.ts';
import { abrirCajon, abrirSeccion, cerrarCajon, fila } from './ayudas.ts';

export const conexiones: Capitulo = {
  id: 'conexiones',
  titulo: 'Conexiones',
  frase: 'Tentare conectado con otras herramientas que ya usas.',
  async guion(g, pos) {
    const { page } = g;
    await abrirSeccion(g, pos, 'conexiones', 'Conexiones', 'Tentare conectado con otras herramientas.',
      'Undécimo capítulo: conexiones. Tentare conectado con otras herramientas que ya usas. En este vídeo no conectamos ninguna cuenta, porque todas piden credenciales de verdad; te explicamos qué hace cada una.');

    g.momento('integracion-google_calendar');
    await g.mientras('Google Calendar copia las clases de las próximas cuatro semanas a tu calendario al pulsar Sincronizar ahora. No se actualiza solo.', async () => {
      await g.ir(fila(page, 'integracion-google_calendar'));
    });
    g.momento('integracion-zoom');
    await g.mientras('Zoom crea una reunión para cada clase de los tipos que marques como online.', async () => {
      await g.ir(fila(page, 'integracion-zoom'));
    });
    g.momento('integracion-kisi');
    await g.mientras('Kisi abre la puerta de tu estudio sola con cada check-in de tus alumnas. Se conecta con una clave de API y, si tienes varias cerraduras, el identificador de la que quieres.', async () => {
      await abrirCajon(g, 'integracion-kisi');
    });
    await g.mientras('Cerramos sin escribir nada.', async () => {
      await cerrarCajon(g);
    });
    g.momento('integracion-klaviyo');
    await g.mientras('Klaviyo y Mailchimp llevan a tus listas de marketing a las alumnas que aceptaron recibir marketing, cada vez que pulsas Sincronizar ahora. Solo las que dieron su permiso.', async () => {
      await g.ir(fila(page, 'integracion-klaviyo'));
      await g.ir(fila(page, 'integracion-mailchimp'));
    });
    g.momento('plataformas-externas');
    await g.mientras('ClassPass, Urban Sports Club y Wellhub. Si vendes plazas en estas plataformas, apuntas sus reservas en la clase para no vender dos veces el mismo hueco. Cada una tiene su interruptor de Vendo aquí.', async () => {
      await g.ir(fila(page, 'plataformas-externas'));
    });
    g.momento('integracion-zapier');
    await g.mientras('Zapier conecta Tentare con miles de apps. La conexión se autoriza desde Zapier, no desde aquí, y las apps que tengan acceso aparecen justo debajo, con la opción de quitárselo.', async () => {
      await g.ir(fila(page, 'integracion-zapier'));
      await g.ir(fila(page, 'aplicaciones-con-acceso'));
    });
    g.momento('api-publica');
    await g.mientras('Por último, la API para tu contabilidad. Son claves para que tu programa de contabilidad, u otro, lea tus cobros, facturas y alumnas. Se activa por estudio; si la necesitas, escríbenos y la activamos.', async () => {
      await g.ir(fila(page, 'api-publica'));
    });
  },
};

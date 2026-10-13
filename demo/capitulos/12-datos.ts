import type { Capitulo } from './tipos.ts';
import { abrirSeccion, fila, interruptor } from './ayudas.ts';

export const datos: Capitulo = {
  id: 'datos',
  titulo: 'Datos y seguridad',
  frase: 'Llévate una copia de los datos de tu estudio y decide cómo se tratan.',
  async guion(g, pos) {
    const { page } = g;
    await abrirSeccion(g, pos, 'datos', 'Datos y seguridad', 'Una copia de tus datos y cómo se tratan.',
      'Duodécimo capítulo: datos y seguridad. Llévate una copia de los datos de tu estudio y decide cómo se tratan.');

    g.momento('exportar');
    await g.mientras('Exportar mis datos. Es la forma de llevarte una copia: un archivo CSV por tabla, que abre Excel. Alumnas, reservas, suscripciones y bonos, recibos, pagos importados, ficha de salud, notas y consentimientos. Los datos son tuyos, y siempre puedes llevártelos.', async () => {
      await g.ir(fila(page, 'exportar'));
    });
    await g.dice('Un aviso importante: la ficha de salud y las notas de progreso salen solo de las alumnas con consentimiento de salud vigente, y la descarga queda registrada. No la descargamos en este vídeo.');

    g.momento('doble-factor-equipo');
    await g.mientras('Verificación en dos pasos para todo el equipo. Si la exiges, quien entra al panel la activará con una app de autenticación y, al entrar, escribirá un código. Cada persona la activa en su perfil. Es una de las mejores protecciones para tu estudio, y la activamos.', async () => {
      await g.clic(interruptor(page, /Verificación en dos pasos/));
    });

    g.momento('redaccion-ia');
    await g.mientras('Redactar con IA. Las sugerencias del Centro de Control y los mensajes de tus automatizaciones se redactan con inteligencia artificial. Si lo apagas, salen con su texto de serie y no se envía ningún dato de tus alumnas a la IA. Es tu decisión: lo dejamos encendido.', async () => {
      await g.ir(interruptor(page, /Redactar con IA/));
    });
  },
};

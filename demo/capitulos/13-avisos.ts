import type { Capitulo } from './tipos.ts';
import { abrirSeccion, interruptor, volverDeHerramienta } from './ayudas.ts';

export const avisos: Capitulo = {
  id: 'avisos',
  titulo: 'Mis avisos',
  frase: 'Los avisos que te llegan a ti, no los de tus alumnas.',
  async guion(g, pos) {
    const { page } = g;
    await abrirSeccion(g, pos, 'avisos', 'Mis avisos', 'Los avisos que te llegan a ti.',
      'Decimotercer capítulo: mis avisos. Son los avisos que te llegan a ti, no los de tus alumnas.');

    g.momento('tus-avisos');
    await g.mientras('Tipos de aviso. Enciendes o apagas cada tipo de aviso, dentro del panel o como notificación push en el móvil. Entramos a la tabla.', async () => {
      await g.clic(page.locator('#fila-herramienta-tus-avisos'));
      await page.getByRole('heading', { name: 'Tipos de aviso', exact: true }).waitFor();
    });
    await g.mientras('Hay un tipo por cada cosa que pasa en tu estudio: reservas, clases, sustituciones, pagos y bonos, mensajes y el Centro de Control. Para cada uno, dos interruptores: uno para verlo dentro del panel y otro para recibirlo como notificación push.', async () => {
      await g.ir(interruptor(page, 'Reservas en la app'));
    });
    await g.mientras('Cada interruptor se guarda al tocarlo. Por ejemplo, no queremos notificaciones push de mensajes en el móvil: las apagamos.', async () => {
      await g.clic(interruptor(page, 'Mensajes push'));
    });
    await volverDeHerramienta(g, 'Mis avisos');
  },
};

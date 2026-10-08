import type { Capitulo } from './tipos.ts';
import { abrirCajon, abrirSeccion, cajon, cerrarCajon, interruptor } from './ayudas.ts';

export const panel: Capitulo = {
  id: 'panel',
  titulo: 'Tu panel',
  frase: 'Cómo se ordena tu panel: el menú y el Resumen los ve tu equipo; el modo oscuro, solo tú.',
  async guion(g, pos) {
    const { page } = g;
    await abrirSeccion(g, pos, 'panel', 'Tu panel', 'Cómo se ordena tu panel.',
      'Último capítulo: tu panel. Cómo se ordena: el menú y el Resumen los ve todo tu equipo; el modo oscuro, solo tú.');

    g.momento('menu-del-panel');
    await g.mientras('Tu menú. Ordenas los módulos dentro de su grupo y escondes los que no uses. Resumen, Configuración y Suscripción siempre se ven. Esconder un módulo no lo borra ni lo desactiva: solo lo quita del menú.', async () => {
      await abrirCajon(g, 'menu-del-panel');
    });
    await g.mientras('Cada módulo tiene un ojo para esconderlo. No vamos a esconder ninguno: cerramos sin guardar.', async () => {
      await g.ir(cajon(page).getByRole('button', { name: 'Ocultar Cierre de año' }));
      await cerrarCajon(g);
      await g.pausa(400);
    });
    await g.pausa(200);

    g.momento('inicio-del-panel');
    await g.mientras('Tu Resumen. Ordena y esconde las secciones de tu pantalla de inicio. Los avisos de estado van siempre arriba, porque son lo que más importa.', async () => {
      await abrirCajon(g, 'inicio-del-panel');
      await g.ir(cajon(page).getByRole('button', { name: 'Ocultar Gráficas personalizadas' }));
    });
    await g.mientras('Cerramos sin cambios.', async () => {
      await cerrarCajon(g);
    });

    g.momento('posicion-del-menu');
    await g.mientras('Dónde va el menú. A la izquierda, que es lo de siempre, o arriba, que gana alto para las tablas. En el móvil el menú no cambia. Lo dejamos a la izquierda.', async () => {
      await abrirCajon(g, 'posicion-del-menu');
      await g.ir(cajon(page).getByRole('button', { name: /Fijo arriba/ }));
    });
    await g.mientras('Cerramos.', async () => {
      await cerrarCajon(g);
    });

    g.momento('claro-u-oscuro');
    await g.mientras('Claro u oscuro. Es solo para ti y para este navegador: no cambia nada a nadie más de tu equipo. Lo encendemos para verlo.', async () => {
      await g.clic(interruptor(page, /Claro u oscuro|Modo oscuro/));
      await g.pausa(2500);
    });
    await g.mientras('Y lo volvemos a apagar.', async () => {
      await g.clic(interruptor(page, /Claro u oscuro|Modo oscuro/));
    });

    // ── Cierre ──
    await g.visita('configuracion');
    g.seccion('Demo');
    await g.dice('Y esto es todo: has recorrido las catorce secciones de Configuración. Si quieres repasar cualquier parte, en Configuración tienes el apartado Demo, con este vídeo y un índice para saltar al minuto que te interese.');
  },
};

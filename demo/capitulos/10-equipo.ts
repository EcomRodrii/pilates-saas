import type { Capitulo } from './tipos.ts';
import { abrirSeccion, fila, interruptor } from './ayudas.ts';

export const equipo: Capitulo = {
  id: 'equipo',
  titulo: 'Mi equipo',
  frase: 'Qué puede hacer cada persona de tu equipo, cómo se cubren las bajas y cómo les pagas.',
  async guion(g, pos) {
    const { page } = g;
    await abrirSeccion(g, pos, 'equipo', 'Mi equipo', 'Qué puede hacer cada persona y cómo se cubren las bajas.',
      'Décimo capítulo: mi equipo. Qué puede hacer cada persona de tu equipo, cómo se cubren las bajas y cómo les pagas.');

    g.momento('ajuste-instructoras-crean-clases');
    await g.mientras('Las instructoras crean sus clases. Si lo activas, pueden crear clases suyas desde su app; si no, solo dan las que tú les asignas. Se guarda al tocarlo, sin botón de guardar. Viene encendido y lo dejamos así.', async () => {
      await g.ir(interruptor(page, 'Las instructoras crean sus clases'));
    });

    g.momento('app-de-tus-instructoras');
    await g.mientras('La app de tus instructoras. Ellas no usan este panel: trabajan en una app propia, a la que entran con su cuenta, donde ven su agenda, avisan de una baja, ponen su disponibilidad y consultan a sus alumnas. Aquí tienes el enlace para dárselo, con un botón de copiar.', async () => {
      await g.ir(fila(page, 'app-de-tus-instructoras'));
    });
    await g.mientras('Más abajo, tres filas llevan a otras pantallas. Sustituciones: cuánto decide Tentare cuando alguien no puede dar su clase. Tarifas y liquidaciones: lo que cobra cada instructora y lo que le debes cada mes. Y Equipo: das de alta a cada persona y eliges su rol.', async () => {
      await g.ir(page.locator('#fila-sustituciones'));
      await g.ir(page.locator('#fila-liquidaciones'));
      await g.ir(page.locator('#fila-equipo'));
    });
    await g.dice('Y al final tienes en pocas líneas qué hace cada rol: la propietaria, la gerencia, recepción y las instructoras. Solo es una explicación, porque los roles se dan en la pantalla de Equipo.');
  },
};

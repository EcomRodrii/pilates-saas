import type { Capitulo } from './tipos.ts';
import { abrirCajon, abrirSeccion, cajon, guardarYCerrar } from './ayudas.ts';

export const marca: Capitulo = {
  id: 'marca',
  titulo: 'Marca',
  frase: 'Cómo te reconocen tus alumnas: tu logo, tu color y cómo te presentas en su app.',
  async guion(g, pos) {
    const { page } = g;
    await abrirSeccion(g, pos, 'marca', 'Marca', 'Tu logo, tu color y cómo te presentas.',
      'Octavo capítulo: marca. Cómo te reconocen tus alumnas: tu logo, tu color y cómo te presentas en su app.');

    g.momento('logo-y-favicon');
    await g.mientras('Logo y favicon. El favicon es tu icono en la pestaña del navegador y en la app de tus alumnas; el logo sale en tus correos. Se aplican al momento, sin botón de guardar, porque el archivo se sube en cuanto lo eliges. Pegamos el enlace del logo del Estudio Aurora.', async () => {
      await abrirCajon(g, 'logo-y-favicon');
      await g.clic(cajon(page).getByRole('button', { name: 'o pegar un enlace' }).first());
      await g.escribe(cajon(page).getByPlaceholder(/^https:\/\//), 'https://estudioaurora.example.com/logo-aurora.png');
      await g.clic(cajon(page).getByRole('button', { name: 'Usar este enlace' }).first());
    });
    await g.mientras('También puedes subir el archivo desde tu ordenador. Cerramos.', async () => {
      await g.pausa(800);
      await g.clic(cajon(page).getByRole('button', { name: 'Cerrar' }).first());
    });

    g.momento('textos-de-tu-app');
    await g.mientras('Cómo te presentas. Tu descripción, tu lema, tu año de apertura y las normas de tu centro: es lo que lee tu alumna en su app. Escribimos una descripción corta.', async () => {
      await abrirCajon(g, 'textos-de-tu-app');
      await g.escribe(cajon(page).getByLabel('Cómo te presentas', { exact: true }), 'Un estudio pequeño de Pilates reformer y suelo, con grupos reducidos y atención cercana.');
    });
    await g.mientras('El lema, el año en que abriste, y las normas del centro: por ejemplo, llegar cinco minutos antes y venir con calcetines antideslizantes. Guardamos.', async () => {
      await g.escribe(cajon(page).getByLabel('Tu lema'), 'Muévete con calma');
      await g.escribe(cajon(page).getByLabel('Año de apertura'), '2024');
      await g.escribe(cajon(page).getByLabel('Normas del centro'), 'Llega cinco minutos antes. Trae calcetines antideslizantes.');
      await guardarYCerrar(g);
    });

    g.momento('textos-de-bienvenida');
    await g.mientras('Textos de bienvenida. Las frases que lee tu alumna al abrir su app: bajo el saludo, en la portada y una frase a mano. Escribimos la primera.', async () => {
      await abrirCajon(g, 'textos-de-bienvenida');
      await g.escribe(cajon(page).getByLabel('Tu frase de bienvenida'), 'Qué alegría verte por aquí.');
    });
    await g.mientras('Las otras dos son opcionales. Guardamos.', async () => {
      await guardarYCerrar(g);
    });

    g.momento('color-de-marca');
    await g.mientras('Apariencia de tu app. Es una pantalla propia: el estilo, tu color, la tipografía y la portada de la app de tus alumnas, probados en un móvil antes de publicar. Entramos.', async () => {
      await g.clic(page.locator('#color-de-marca'));
      await page.getByRole('radio', { name: /Arena/ }).waitFor();
    });
    await g.mientras('Hay ocho estilos de base. Elegimos Arena, tostado y redondeado, muy acogedor. A la derecha ves cómo queda en un móvil.', async () => {
      await g.clic(page.getByRole('radio', { name: /Arena/ }));
    });
    await g.mientras('Debajo, tu color de marca: lo escribes en hexadecimal o lo eliges con el selector. Ponemos un naranja cálido, el del amanecer.', async () => {
      await g.escribe(page.getByLabel('Color de tu marca en hexadecimal'), '#C97B2E');
    });
    await g.mientras('Y la tipografía. Hay nueve combinaciones, desde moderna hasta romántica. Elegimos Serena, más delicada.', async () => {
      await g.clic(page.getByRole('radio', { name: /Serena/ }));
    });
    await g.mientras('Y la portada de la app, con su titular y su foto. Nada se ve en tus alumnas hasta que pulsas Publicar, así que puedes probar tranquilamente. Publicamos.', async () => {
      await g.ir(page.getByLabel('Titular de la entrada'));
      await g.clic(page.getByRole('button', { name: 'Publicar' }));
      await g.pausa(1200);
    });
  },
};

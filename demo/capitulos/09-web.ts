import type { Capitulo } from './tipos.ts';
import { abrirCajon, abrirSeccion, cajon, cerrarCajon, volverDeHerramienta } from './ayudas.ts';

export const web: Capitulo = {
  id: 'web',
  titulo: 'Mi app y mi web',
  frase: 'Cómo se ve tu estudio por fuera: la app de tus alumnas, tu página de reservas y tu web.',
  async guion(g, pos) {
    const { page } = g;
    await abrirSeccion(g, pos, 'web', 'Mi app y mi web', 'Cómo se ve tu estudio por fuera.',
      'Noveno capítulo: mi app y mi web. Cómo se ve tu estudio por fuera: la app de tus alumnas, tu página de reservas y tu web.');

    g.momento('direccion-y-enlaces');
    await g.mientras('Dirección y enlaces. Aquí está la dirección de tu página de reservas, el enlace a la app de tus alumnas y el código QR de cada uno, para imprimir y poner en el escaparate o en la recepción.', async () => {
      await abrirCajon(g, 'direccion-y-enlaces');
    });
    await g.mientras('La dirección se forma con el nombre corto de tu estudio. Si la cambias, la anterior sigue funcionando: lo que ya hayas repartido no se pierde. Con un botón copias el enlace; con otro, abres el código QR.', async () => {
      await g.ir(cajon(page).getByLabel('Dirección de tu página de reservas'));
      await g.clic(cajon(page).getByRole('button', { name: 'Copiar el enlace de tu página' }));
    });
    await g.mientras('El código QR se puede descargar como cartel, en PDF o en imagen, para imprimirlo, o solo el código. Cerramos.', async () => {
      await g.clic(cajon(page).getByRole('button', { name: 'Código QR' }).first());
      await g.pausa(3500);
      await page.keyboard.press('Escape');
      await g.pausa(500);
      await cerrarCajon(g);
    });

    g.momento('pagina-publica');
    await g.mientras('Ocultar tu página. Mientras la estás preparando, puedes hacer que tu página de reservas y la app de tus alumnas enseñen un aviso en vez de tus clases. Se puede proteger con una clave, para dejar pasar solo a quien tú quieras.', async () => {
      await abrirCajon(g, 'pagina-publica');
      await g.pausa(800);
    });
    await g.mientras('Con la página oculta nadie reserva, compra ni se da de alta desde fuera. Cuando la quieres abierta, la dejas visible, como la dejamos nosotros, y cerramos.', async () => {
      await cerrarCajon(g);
    });

    g.momento('contenido-de-tu-app');
    await g.mientras('Contenido de tu app. Las tarjetas de Descubre, un mensaje destacado y los avisos del tablón, en el inicio de la app de tus alumnas. Entramos.', async () => {
      await g.clic(page.locator('#fila-herramienta-contenido-de-tu-app'));
      await page.getByRole('heading', { name: 'Contenido de tu app', exact: true }).waitFor();
    });
    await g.mientras('El mensaje destacado es una frase que tus alumnas ven al abrir la app. Escribimos una novedad y la guardamos.', async () => {
      await g.escribe(page.getByPlaceholder(/estrenamos horario/), 'Este mes estrenamos clases de Reformer los sábados por la mañana.');
      await g.clic(page.getByRole('button', { name: 'Guardar mensaje' }));
      await g.pausa(900);
    });
    await g.mientras('Los banners y los avisos del tablón se crean con sus botones. Cada uno se puede dejar oculto mientras lo preparas y publicar cuando esté listo.', async () => {
      await g.clic(page.getByRole('button', { name: 'Añadir aviso' }));
      await g.pausa(1200);
    });
    await volverDeHerramienta(g, 'Mi app y mi web');

    g.momento('widgets');
    await g.mientras('Widgets para tu web. Tu horario, tus precios y la cuenta de tus alumnas dentro de tu propia web, con un código para pegar. Entramos al constructor.', async () => {
      await g.clic(page.locator('#fila-herramienta-widgets'));
      await page.getByRole('heading', { name: 'Widgets para tu web', exact: true }).first().waitFor();
    });
    await g.mientras('Lo primero que pregunta es dónde está tu web: WordPress, Wix, Squarespace, Webflow, otra hecha a mano, o ni siquiera tienes web. Según eso te explica cómo pegar el código en tu plataforma.', async () => {
      await g.clic(page.getByRole('radio', { name: /WordPress/ }));
      await g.pausa(800);
    });
    await g.dice('Después eliges qué widget quieres, lo personalizas con tu estilo, ves cómo queda y copias el código. Si te lo lleva una agencia, hay una opción para mandarle las instrucciones. Con esto, tu estudio ya se ve por fuera.');
  },
};

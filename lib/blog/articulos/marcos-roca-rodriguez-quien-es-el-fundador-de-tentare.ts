import type { ArticuloBlog } from '../tipos.ts';

// El primer artículo: la ficha de quién es el fundador. Solo hechos que constan en el propio sitio (aviso legal,
// /sobre-tentare) o que dio el fundador para esta página (edad y ciudad). No cuenta una historia que no está escrita:
// el relato de cómo y por qué nació Tentare es el borrador `por-que-decidi-construir-tentare`.

const articulo: ArticuloBlog = {
  estado: 'publicado',
  slug: 'marcos-roca-rodriguez-quien-es-el-fundador-de-tentare',
  titulo: 'Marcos Roca Rodríguez: quién es el fundador de Tentare',
  tituloSeo: 'Marcos Roca Rodríguez: quién es el fundador de Tentare',
  descripcion:
    'Quién es Marcos Roca Rodríguez, fundador de Tentare: un software de gestión para estudios de Pilates y yoga en España. Tiene 23 años y trabaja desde Barcelona.',
  resumen: 'Quién está detrás de Tentare, qué es y cómo trabaja: la ficha del fundador, con lo que se puede comprobar en la propia web.',
  categoria: 'construccion-de-tentare',
  publicado: '2026-11-05',
  destacado: true,
  entradilla:
    'Marcos Roca Rodríguez es el fundador de Tentare, un software de gestión para estudios de Pilates y yoga en España. Esta es la ficha de quién es y de qué hay detrás de la empresa.',
  secciones: [
    {
      id: 'en-una-frase',
      titulo: 'En una frase',
      bloques: [
        {
          t: 'p',
          texto:
            '**Marcos Roca Rodríguez** (Barcelona, 23 años) es el fundador de **Tentare**, un software de gestión para estudios de Pilates y yoga en España. Tentare la fundó y la mantiene él.',
        },
      ],
    },
    {
      id: 'quien-es',
      titulo: 'Quién es Marcos Roca Rodríguez',
      bloques: [
        {
          t: 'p',
          texto:
            'Marcos Roca Rodríguez tiene 23 años (a noviembre de 2026) y trabaja desde Barcelona. Es el titular de Tentare: su nombre consta como tal en el [aviso legal](/legal), que es donde la ley exige que figure quién está detrás de una web.',
        },
        {
          t: 'p',
          texto:
            'Además de construir el producto, firma las [guías de recursos](/recursos) de Tentare: los artículos sobre cómo abrir y gestionar un estudio de Pilates. Cómo se escriben y se comprueban está contado en [Sobre Tentare](/sobre-tentare#como-escribimos).',
        },
        {
          t: 'p',
          texto:
            'Este blog es su espacio personal. Aquí escribe sobre emprendimiento, tecnología, startups, SaaS, desarrollo de producto y negocios, y sobre cómo se construye Tentare.',
        },
      ],
    },
    {
      id: 'que-es-tentare',
      titulo: 'Qué es Tentare',
      bloques: [
        {
          t: 'p',
          texto:
            'Tentare es un software de gestión para estudios de Pilates y yoga en España: reservas, cobros, bonos y la gestión del equipo, en un solo panel y con una app con la marca de cada estudio para sus alumnas.',
        },
        {
          t: 'p',
          texto:
            'Se puede empezar gratis y sin tarjeta. Los [precios](/precios) están a la vista y el soporte lo atiende una persona. Quien quiera ver qué hace, tiene el recorrido por las [funcionalidades](/funcionalidades).',
        },
      ],
    },
    {
      id: 'como-trabaja',
      titulo: 'Cómo trabaja Tentare',
      bloques: [
        { t: 'p', texto: 'Cuatro principios que la empresa publica en [Sobre Tentare](/sobre-tentare) y que cualquiera puede comprobar:' },
        {
          t: 'lista',
          items: [
            '**Precio público.** Los planes cuestan lo que dice la página de precios, IVA incluido. No hay que pedir presupuesto.',
            '**Sin permanencia.** Se paga mes a mes, y si te vas puedes exportar tus datos.',
            '**Una persona al otro lado.** El soporte es por WhatsApp o por email, en español.',
            '**Lo que se dice, se cumple.** Cuando una función está en desarrollo se escribe así, y cuando algo no se hace, también.',
          ],
        },
      ],
    },
    {
      id: 'que-viene',
      titulo: 'Qué vas a encontrar aquí',
      bloques: [
        {
          t: 'p',
          texto:
            'Los próximos artículos irán contando cómo se construye Tentare y lo que se aprende emprendiendo desde Barcelona. Si quieres seguir el blog, tienes el [RSS](/blog/feed.xml) y la página del [autor](/blog/marcos-roca).',
        },
      ],
    },
  ],
  faq: [
    {
      q: '¿Quién es Marcos Roca Rodríguez?',
      a: 'Marcos Roca Rodríguez es el fundador de Tentare, un software de gestión para estudios de Pilates y yoga en España. Tiene 23 años y trabaja desde Barcelona.',
    },
    {
      q: '¿Qué es Tentare?',
      a: 'Un software de gestión para estudios de Pilates y yoga: reservas, cobros, bonos y la gestión del equipo en un solo panel, con una app con la marca de cada estudio para sus alumnas.',
    },
    {
      q: '¿Dónde está Tentare?',
      a: 'Tentare la mantiene Marcos Roca Rodríguez desde Barcelona (España), tal como consta en el aviso legal.',
    },
    {
      q: '¿Cuánto cuesta Tentare?',
      a: 'Se puede empezar gratis y sin tarjeta, y los precios de los planes de pago están publicados, con el IVA incluido. Se paga mes a mes, sin permanencia.',
    },
  ],
  enlaces: ['/sobre-tentare', '/precios', '/funcionalidades', '/recursos'],
};

export default articulo;

import type { Articulo } from './tipos.ts';

const articulo: Articulo = {
  slug: 'como-abrir-un-estudio-de-pilates',
  titulo: 'Cómo abrir un estudio de pilates: guía paso a paso, de la idea a la primera semana abierta',
  tituloSeo: 'Cómo abrir un estudio de pilates: guía paso a paso',
  descripcion: 'Los pasos para abrir un estudio de pilates en España: concepto, números, local, máquinas, trámites, precios, equipo y lanzamiento. Con checklist.',
  resumen: 'La guía completa para montar un estudio de pilates en España: concepto, números, local, reformers, trámites, precios, equipo, reservas y los primeros 90 días, con una checklist de todo el proceso.',
  categoria: 'abrir',
  seccion: 'Abrir un estudio',
  publicado: '2026-09-25',
  consultaPrincipal: 'cómo abrir un estudio de pilates',
  consultas: [
    'montar un estudio de pilates',
    'abrir un centro de pilates',
    'qué necesito para abrir un estudio de pilates',
    'pasos para abrir un estudio de pilates',
    'montar un negocio de pilates',
  ],
  respuesta: 'Para abrir un estudio de pilates, sigue este orden: decide el concepto (reformer, mat o mixto) y a quién te diriges; haz los números antes de firmar nada; busca un local donde quepan las máquinas y el ayuntamiento admita la actividad; elige el equipamiento; date de alta en Hacienda y en la Seguridad Social y tramita la licencia o declaración responsable; fija precios, bonos y normas de cancelación; prepara equipo, reservas y cobros; y lanza con preventa y clases de prueba.',
  entradilla: 'Cómo abrir un estudio de pilates sin tirar dinero: empezando por el concepto y los números, no por los reformers. Esta guía sigue el orden que evita los errores caros, con lo que cuesta cada paso, lo que exige la normativa y lo que conviene tener listo antes de abrir la puerta.',
  secciones: [
    {
      id: 'pasos-de-un-vistazo',
      titulo: 'Cómo abrir un estudio de pilates: los pasos de un vistazo',
      bloques: [
        {
          t: 'p',
          texto: 'Un paso hecho antes de tiempo sale caro: firmar un local donde el ayuntamiento no admite la actividad, comprar máquinas antes de saber cuántas caben o abrir sin saber cuánto tienes que vender para cubrir gastos. Esta es la secuencia completa:',
        },
        {
          t: 'tabla',
          cabecera: ['Fase', 'Lo que tienes que tener hecho', 'Más detalle'],
          filas: [
            ['1. Concepto', 'Formato (reformer, mat o mixto), público y horario tipo', 'Paso 1, abajo'],
            ['2. Números', 'Inversión inicial, gastos fijos del mes y plazas que necesitas vender', '[Cuánto cuesta abrir un estudio de pilates](/recursos/cuanto-cuesta-abrir-un-estudio-de-pilates)'],
            ['3. Local', 'Uso admitido por el ayuntamiento, metros para tus máquinas, techo, suelo, vestuario y aseos', 'Pasos 3 y 4, abajo'],
            ['4. Equipamiento', 'Máquinas elegidas, con plazo de entrega, montaje y garantía para uso profesional', 'Precios por marca en el artículo de costes'],
            ['5. Trámites', 'Altas en Hacienda y Seguridad Social, licencia o declaración responsable, seguro, datos y hojas de reclamaciones', '[Requisitos para abrir un estudio de pilates](/recursos/requisitos-para-abrir-un-estudio-de-pilates)'],
            ['6. Precios', 'Clase suelta, bonos, cuota, caducidad y política de cancelación', '[Precio de una clase de pilates](/recursos/precio-clase-de-pilates)'],
            ['7. Equipo y sistema', 'Instructoras contratadas, horario publicado, reservas y cobros online funcionando', '[Cuánto cobra una instructora de pilates](/recursos/cuanto-cobra-una-instructora-de-pilates)'],
            ['8. Lanzamiento', 'Preventa, clases de prueba, perfil en Google y redes, y las primeras semanas medidas', 'Paso 8, abajo'],
          ],
          nota: 'Orden recomendado. Las fases 3 y 5 se solapan: la consulta al ayuntamiento sobre el uso del local va antes de firmar el alquiler, y el alta en Hacienda, antes de pagar las máquinas.',
        },
      ],
    },
    {
      id: 'concepto',
      titulo: 'Paso 1: decide qué estudio vas a abrir (reformer, mat o mixto)',
      bloques: [
        {
          t: 'p',
          texto: 'El formato decide casi todo lo demás: cuánto inviertes, cuántos metros necesitas, cuántas alumnas caben por clase y cómo pones precio. Un estudio de mat se equipa con esterillas y accesorios; uno de reformer, con máquinas que cuestan miles de euros cada una y que fijan el aforo de cada clase.',
        },
        {
          t: 'tabla',
          cabecera: ['Formato', 'Equipamiento por plaza', 'Aforo de la clase', 'Lo que implica'],
          filas: [
            ['Mat', 'Una esterilla de estudio: 20,70 € la de 180 × 58 cm, 592,90 € la profesional con asas', 'Lo marcan los metros de la sala', 'Menos inversión; puedes ampliar la clase sin comprar máquinas'],
            ['Reformer', 'Un reformer profesional: de 2.891,90 € a 6.037,90 €', 'Una alumna por máquina', 'Más inversión y más metros por plaza; el precio tiene que pagar la máquina'],
            ['Mixto', 'Las dos cosas', 'Mat en una sala y máquinas en otra, o por turnos', 'Llenas franjas distintas con públicos distintos, con más horario que coordinar'],
          ],
          nota: 'Precios con IVA de la tienda oficial europea de Elina Pilates, consultados el 25 de septiembre de 2026. Más marcas y modelos, en el artículo de costes.',
        },
        {
          t: 'p',
          texto: 'Luego, el público. Demanda hay: en la encuesta de hábitos deportivos del CIS de marzo de 2024 (estudio 3447), la «gimnasia/actividad físico deportiva suave en centro deportivo (pilates, mantenimiento)» es la segunda actividad que más citan quienes hacen deporte, un 15,6 %, solo por detrás de andar (18,1 %). Pero se la reparten gimnasios, centros deportivos y estudios; lo que hará que te elijan es a quién te diriges:',
        },
        {
          t: 'lista',
          items: [
            '**Embarazo y posparto**: clases específicas y horarios compatibles con la crianza.',
            '**Mayores**: grupos reducidos y un ritmo más pausado.',
            '**Deportistas**: fuerza y movilidad para corredoras, ciclistas o jugadoras de pádel.',
            '**Espalda y postura**: quien llega por recomendación de su fisioterapeuta. Ojo: los tratamientos de rehabilitación son asistencia sanitaria, con otros trámites ([requisitos para abrir un estudio de pilates](/recursos/requisitos-para-abrir-un-estudio-de-pilates)).',
          ],
        },
        {
          t: 'p',
          texto: 'Con el concepto claro, escribe en una frase qué estudio eres y para quién: te guiará en el local, el horario y el nombre (hay ideas en [nombres para un estudio de pilates](/recursos/nombres-para-estudio-de-pilates)).',
        },
      ],
    },
    {
      id: 'numeros',
      titulo: 'Paso 2: los números de montar un estudio de pilates',
      bloques: [
        {
          t: 'p',
          texto: 'Antes de firmar nada, separa dos cifras: la **inversión inicial** (máquinas, obra, fianza, licencias, lanzamiento) y los **gastos fijos de cada mes** (alquiler, instructoras, seguros, software, cuota de autónoma). Los precios reales de cada partida, con un presupuesto de ejemplo para seis reformers, están en [cuánto cuesta abrir un estudio de pilates](/recursos/cuanto-cuesta-abrir-un-estudio-de-pilates).',
        },
        {
          t: 'p',
          texto: 'La pregunta que decide si el estudio se sostiene es cuántas plazas tienes que vender al mes para cubrir los gastos fijos:',
        },
        {
          t: 'lista',
          ordenada: true,
          items: [
            'Calcula el margen por plaza: lo que ingresas de media por alumna y clase, sin IVA, menos lo que te cuesta esa plaza (lo que pagas a la instructora por la clase dividido entre las plazas).',
            'Divide tus gastos fijos mensuales entre ese margen: son las plazas que necesitas vender al mes.',
            'Compáralo con tu capacidad: clases a la semana × plazas por clase × 4,33 semanas que tiene de media un mes.',
          ],
        },
        {
          t: 'nota',
          titulo: 'Ejemplo con cifras inventadas',
          texto: 'Si tus gastos fijos fueran 4.000 € al mes y cada plaza te dejara 10 € de margen, necesitarías vender 400 plazas al mes. Con 6 reformers son unas 67 clases llenas al mes, o 100 clases con dos tercios de ocupación. No son cifras de mercado: cámbialas por las tuyas.',
        },
        {
          t: 'p',
          texto: 'Si la cuenta solo sale con el estudio lleno a todas horas, no se arregla abriendo: cambia de local, de número de máquinas o de precios antes de comprometerte. Cómo se reparte ese margen entre clases y franjas lo tienes en [rentabilidad de un estudio de pilates](/recursos/rentabilidad-estudio-de-pilates).',
        },
      ],
    },
    {
      id: 'local-y-equipamiento',
      titulo: 'Pasos 3 y 4: qué necesitas en el local y qué máquinas comprar',
      bloques: [
        {
          t: 'p',
          texto: 'Antes de firmar un alquiler, pregunta en el ayuntamiento si ese local admite un uso deportivo y qué vía te tocará, declaración responsable o licencia. Es la comprobación más barata de todo el proceso. Y cuenta con la fianza: para un local es, por ley, de dos mensualidades (artículo 36 de la Ley de Arrendamientos Urbanos), y el propietario puede pedir además otras garantías, como un aval.',
        },
        {
          t: 'lista',
          items: [
            '**Superficie según las máquinas.** Un reformer mide unos 2,4-2,5 m de largo por 0,65-0,8 m de ancho (tabla de abajo), y alrededor necesitas paso para la instructora y sitio para brazos y piernas. Pide al fabricante el espacio libre que recomienda.',
            '**Altura de techo**, si usarás torre o ejercicios de pie: Merrithew indica, en su SPX Max, un techo mínimo de 2,48 m para los ejercicios de pie.',
            '**Suelo** nivelado y resistente: un reformer de estudio pesa unos 63-66 kg sin la alumna (fichas del Elina Nubium y del Align-Pilates C8 Pro).',
            '**Accesibilidad y evacuación**: el local tiene que cumplir el Código Técnico de la Edificación en accesibilidad y seguridad de utilización (DB-SUA) y en caso de incendio (DB-SI); si no, calcula la obra antes de firmar.',
            '**Vestuario, aseos y vecinos**: lo que exija tu ayuntamiento, lo que esperan tus alumnas y dónde no molestará la música a primera hora.',
          ],
        },
        {
          t: 'tabla',
          cabecera: ['Modelo', 'Largo', 'Ancho', 'Fuente'],
          filas: [
            ['Merrithew SPX Max', '252,7 cm (barra de pies abajo)', '66 cm', 'Ficha del fabricante'],
            ['Align-Pilates C8 Pro', '244 cm', '66 cm', 'Ficha del fabricante'],
            ['Elina Pilates Nubium', '246 cm', '78 cm', 'Ficha en tienda (fitnessdigital)'],
            ['Balanced Body Allegro 2', '239 cm', '79 cm con la barra de pies', 'Ficha del fabricante'],
          ],
          nota: 'Medidas publicadas por fabricantes y tiendas, consultadas el 25 de septiembre de 2026. La superficie de la sala es la de las máquinas más los pasillos que decidas dejar.',
        },
        {
          t: 'p',
          texto: '**Ejemplo de cálculo** (la holgura es una decisión tuya, no una norma): si reservas para cada reformer un rectángulo de 3,5 × 1,7 m, es decir, la máquina más un metro de holgura a lo largo y a lo ancho, cada puesto ocupa casi 6 m², y seis reformers piden unos 36 m² de sala, sin contar recepción, vestuarios ni aseos.',
        },
        {
          t: 'p',
          texto: 'Con el local medido, eliges máquinas: modelo (aluminio o madera, altura estándar o de fisioterapia), accesorios (torre, box, jumpboard) y nuevas o de segunda mano. El Align-Pilates C8 Pro cuesta 3.023,81 € con IVA en una tienda española; Balanced Body y Merrithew venden en España bajo presupuesto. Todas las marcas, comparadas en [cuánto cuesta un reformer de pilates](/recursos/cuanto-cuesta-abrir-un-estudio-de-pilates). Pregunta por plazo de entrega, transporte, montaje y garantía para uso profesional.',
        },
      ],
    },
    {
      id: 'tramites',
      titulo: 'Paso 5: los trámites para abrir un centro de pilates',
      bloques: [
        {
          t: 'p',
          texto: 'Son pocos, pero van en orden. El detalle de cada uno, con su norma, está en [requisitos para abrir un estudio de pilates](/recursos/requisitos-para-abrir-un-estudio-de-pilates). La secuencia:',
        },
        {
          t: 'pasos',
          items: [
            { titulo: 'Forma jurídica', texto: 'Autónoma o sociedad limitada. Desde la Ley 18/2022, una SL puede constituirse con 1 € de capital, con condiciones si baja de 3.000 €. Decídelo con tu gestoría según tus números.' },
            { titulo: 'Alta en Hacienda', texto: 'Modelo 036 (el 037 se suprimió en febrero de 2025), en el epígrafe 967.2 del IAE, «Escuelas y servicios de perfeccionamiento del deporte». Para la Agencia Tributaria la actividad empieza con la primera compra, pago o cobro: el alta va antes de pagar las máquinas.' },
            { titulo: 'Alta en la Seguridad Social', texto: 'Antes de empezar y como mucho 60 días antes. En tu primera alta como autónoma puedes pedir la cuota reducida, que la ley fijó en 80 € al mes durante 12 meses para 2023-2025; confirma la cuantía vigente al darte de alta.' },
            { titulo: 'Ayuntamiento', texto: 'Declaración responsable o licencia de actividad, según tu municipio, y el permiso de obra si reformas.' },
            { titulo: 'Seguro', texto: 'Responsabilidad civil para el estudio y para quien da clase: según el Consejo COLEF, la mayoría de las leyes autonómicas del deporte la exige a las profesionales.' },
            { titulo: 'Datos de salud', texto: 'Un cuestionario de salud contiene datos de categoría especial del RGPD: necesitas una excepción del artículo 9, como el consentimiento explícito de la alumna.' },
            { titulo: 'Hojas de reclamaciones y música', texto: 'Las hojas oficiales de tu comunidad y, si pones música grabada, las licencias de la SGAE y de Somos Música (AGEDI y AIE).' },
          ],
        },
        {
          t: 'nota',
          titulo: '¿Y si no eres instructora?',
          texto: 'Puedes ser la propietaria sin dar clases. Lo que tu comunidad puede exigir es la titulación de quien las da: diez comunidades tienen ley de profesiones del deporte, según el Consejo COLEF, y cada una decide qué títulos pide.',
        },
      ],
    },
    {
      id: 'precios-y-bonos',
      titulo: 'Paso 6: precios, bonos y normas de cancelación',
      bloques: [
        {
          t: 'p',
          texto: 'Fija los precios desde tus números, no desde los del estudio de enfrente: cada plaza tiene que pagar su parte de alquiler, de máquina y de instructora. Cómo ponerle precio a una clase, en [precio de una clase de pilates](/recursos/precio-clase-de-pilates); la diferencia entre reformer y mat, en [reformer vs. mat](/recursos/precios-reformer-mat). La oferta mínima para abrir:',
        },
        {
          t: 'lista',
          items: [
            '**Clase suelta**, para quien quiere probar sin compromiso.',
            '**Bonos** de varias sesiones con caducidad, que dan compromiso sin atar a nadie: cómo diseñarlos, en [bonos de pilates](/recursos/bonos-de-pilates).',
            '**Cuota mensual**, si buscas ingresos recurrentes.',
            '**Clase de prueba**, gratis o a precio reducido, con una fecha límite para pasar a bono.',
            '**Política de cancelación**: con cuántas horas se puede cancelar sin perder la sesión y qué pasa con quien no viene. Escríbela antes de abrir y aplícala a todas por igual; tienes ideas en [cómo reducir las cancelaciones de última hora](/recursos/reducir-cancelaciones-ultima-hora).',
          ],
        },
      ],
    },
    {
      id: 'equipo-reservas-y-cobros',
      titulo: 'Paso 7: equipo, reservas y cobros',
      bloques: [
        {
          t: 'p',
          texto: 'Si no vas a dar todas las clases tú, necesitas instructoras antes de publicar el horario, con la titulación que pida tu comunidad, su seguro y un contrato claro. Lo que cobran, en [cuánto cobra una instructora de pilates](/recursos/cuanto-cobra-una-instructora-de-pilates). Y decide desde el primer mes quién cubre una baja: [cómo cubrir una baja de instructora](/recursos/cubrir-baja-instructora).',
        },
        {
          t: 'p',
          texto: 'Después, el sistema. El primer día tus alumnas tienen que poder reservar y cancelar sin escribirte, la lista de espera tiene que funcionar sola y los bonos, descontarse y caducar sin hojas de cálculo. Y tienes que cobrar online: con Stripe, por ejemplo, la tarifa estándar en España es de un 1,5 % + 0,25 € por pago con tarjeta estándar del Espacio Económico Europeo y 0,35 € por adeudo SEPA, sin cuota mensual.',
        },
        {
          t: 'p',
          texto: 'Es lo que hace [Tentare](/funcionalidades/reservas-online): tus alumnas reservan y cancelan desde el móvil e instalan la app del estudio en su pantalla de inicio con tu nombre y tu icono; la lista de espera es automática; hay bonos con caducidad, cuotas mensuales y clases sueltas, con reglas por tipo de clase; y los cobros recurrentes con Stripe (tarjeta y SEPA) se reintentan tres veces si fallan y te avisan. Cuesta 29, 59 o 149 € al mes con IVA según el plan, sin permanencia ([precios](/precios)). Si ya tienes web, las reservas se ponen dentro con un widget: [reservas en tu web](/recursos/reservas-en-tu-web).',
        },
      ],
    },
    {
      id: 'lanzamiento-y-primeros-90-dias',
      titulo: 'Paso 8: lanzamiento y primeros 90 días',
      bloques: [
        {
          t: 'pasos',
          items: [
            { titulo: 'Preventa', texto: 'Bonos de fundadora a precio de apertura, con plazas y plazo limitados: caja para los primeros meses y alumnas desde el primer día.' },
            { titulo: 'Clases de prueba', texto: 'En las horas que prevés más flojas, y a cada alumna que prueba, una propuesta concreta para seguir.' },
            { titulo: 'Google y redes', texto: 'Perfil de empresa en Google con horario, fotos reales y enlace para reservar; en redes, la sala, el equipo y cómo es una clase.' },
            { titulo: 'Alianzas de barrio', texto: 'Fisioterapeutas, matronas, clubes y comercios cercanos: ofréceles una clase para su equipo o su público.' },
            { titulo: 'Semana de apertura', texto: 'Puertas abiertas, horario completo publicado y reservas online funcionando.' },
          ],
        },
        {
          t: 'p',
          texto: 'En los tres primeros meses, no cambies nada a ciegas: mira cada semana tres números.',
        },
        {
          t: 'lista',
          items: [
            '**Ocupación por franja**: qué horas se llenan y cuáles no. Las franjas flojas se trabajan antes de quitarlas: [cómo subir la ocupación de las clases valle](/recursos/ocupacion-clases-valle).',
            '**Conversión de la clase de prueba**: cuántas de las que prueban compran bono o cuota.',
            '**Cancelaciones tardías y ausencias**: si se disparan, la política no se está aplicando.',
          ],
        },
        {
          t: 'p',
          texto: 'Con esos datos, ajusta horario y oferta al final del primer mes y del tercero. Lo que conviene evitar es bajar precios tras una primera semana floja: primero llena franjas y convierte pruebas.',
        },
      ],
    },
  ],
  faq: [
    {
      q: '¿Qué necesito para abrir un estudio de pilates?',
      a: 'Un concepto claro, un local donde tu ayuntamiento admita la actividad y quepan las máquinas, el equipamiento, las altas en Hacienda (modelo 036, epígrafe 967.2) y en la Seguridad Social, la licencia o declaración responsable, un seguro de responsabilidad civil, instructoras con la titulación que pida tu comunidad y un sistema de reservas y cobros.',
    },
    {
      q: '¿Cuánto dinero hace falta para montar un estudio de pilates?',
      a: 'Depende del formato y del local. En reformer, las máquinas son la partida grande: en la tienda oficial de Elina Pilates, un reformer profesional cuesta de 2.891,90 € a 6.037,90 € con IVA, así que seis suman de 17.351,40 € a 36.227,40 €. Súmale fianza, obra, licencias, seguros y un colchón para los primeros meses.',
    },
    {
      q: '¿Hace falta ser instructora para abrir un centro de pilates?',
      a: 'No. Puedes ser la propietaria y contratar a quien dé las clases. Lo que puede exigir tu comunidad es la titulación de quien las imparte: diez tienen ley de profesiones del deporte, y cada una decide qué títulos pide.',
    },
    {
      q: '¿Necesito licencia para abrir un estudio de pilates?',
      a: 'Necesitas el visto bueno de tu ayuntamiento, pero no siempre una licencia previa: según el municipio y el local, basta una declaración responsable o hace falta licencia de actividad con proyecto técnico. Pregúntalo antes de firmar el alquiler.',
    },
    {
      q: '¿Cuántos reformers necesito para empezar?',
      a: 'Los que quepan con holgura en tu sala y los que tus números necesiten para cubrir gastos con una ocupación realista. Si la cuenta solo sale con todo lleno, necesitas otro local, otro número de máquinas u otros precios.',
    },
    {
      q: '¿Es rentable abrir un estudio de pilates?',
      a: 'Puede serlo, pero depende sobre todo de la ocupación: los gastos fijos se pagan igual con la sala llena que medio vacía. Calcula las plazas que necesitas vender antes de firmar nada y revisa la ocupación por franja cada semana desde que abras.',
    },
    {
      q: '¿Me doy de alta como autónoma o creo una sociedad?',
      a: 'Como autónoma el alta es más sencilla y, si es tu primera vez, puedes pedir la cuota reducida (80 € al mes durante 12 meses en 2023-2025; confirma la vigente). Una sociedad limitada puede crearse con 1 € de capital y limita tu responsabilidad, con condiciones por debajo de 3.000 €. Decídelo con tu gestoría según tus números.',
    },
  ],
  fuentes: [
    { titulo: 'CIS, estudio 3447: Hábitos deportivos en España (V), avance de resultados (marzo de 2024)', url: 'https://www.cis.es/documents/d/guest/es3447marMT_a', consultada: '2026-09-25' },
    { titulo: 'Elina Pilates, tienda oficial europea: reformers', url: 'https://www.elinapilates.com/eu/en/59-pilates-reformers', consultada: '2026-09-25' },
    { titulo: 'Elina Pilates, tienda oficial europea: esterillas', url: 'https://www.elinapilates.com/eu/en/69-mats', consultada: '2026-09-25' },
    { titulo: 'Aerobic y Fitness: Reformer Align-Pilates C8 Pro (IVA incluido)', url: 'https://www.aerobicyfitness.com/es/material-de-yoga-y-pilates/reformer-align-pilates-c8-pro-4078.html', consultada: '2026-09-25' },
    { titulo: 'Merrithew: SPX Max Reformer, medidas y altura de techo', url: 'https://www.merrithew.com/shop/ProductDetail/ST01077_Spx-Max-Reformer', consultada: '2026-09-25' },
    { titulo: 'Align-Pilates: C8-Pro Pilates Reformer, medidas', url: 'https://align-pilates.com/products/pilates-reformers/commercial-pilates-reformers/c8-pro-pilates-reformer/', consultada: '2026-09-25' },
    { titulo: 'fitnessdigital: Reformer Align Pilates C8 Pro, ficha y peso', url: 'https://www.fitnessdigital.com/reformer-align-pilates-c8-pro/p/10024021/', consultada: '2026-09-25' },
    { titulo: 'fitnessdigital: Reformer Elina Pilates Nubium, ficha y peso', url: 'https://www.fitnessdigital.com/reformer-elina-pilates-nubium-portes-gratis/p/10022988/', consultada: '2026-09-25' },
    { titulo: 'Balanced Body: Allegro 2 Reformer, medidas', url: 'https://www.pilates.com/products/allegro-2-pilates-reformer/', consultada: '2026-09-25' },
    { titulo: 'Balanced Body España: Reformer Allegro 2, precio bajo consulta', url: 'https://pilatesbalancedbody.es/productos/reformer-allegro-2/', consultada: '2026-09-25' },
    { titulo: 'Spain Pilates (distribuidor de Merrithew): precio bajo presupuesto', url: 'https://www.spainpilates.com/spx-max-plus-reformer', consultada: '2026-09-25' },
    { titulo: 'Ley de Arrendamientos Urbanos, artículo 36: fianza (Iberley)', url: 'https://www.iberley.es/legislacion/articulo-36-ley-arrendamientos-urbanos', consultada: '2026-09-25' },
    { titulo: 'Código Técnico de la Edificación: DB-SUA, seguridad de utilización y accesibilidad', url: 'https://www.codigotecnico.org/DocumentosCTE/SeguridadUtilizacionAccesibilidad.html', consultada: '2026-09-25' },
    { titulo: 'BOE: Ley 18/2022, de creación y crecimiento de empresas', url: 'https://www.boe.es/diario_boe/txt.php?id=BOE-A-2022-15818', consultada: '2026-09-25' },
    { titulo: 'Agencia Tributaria: Orden HAC/1526/2024, que modifica el 036 y suprime el 037', url: 'https://sede.agenciatributaria.gob.es/Sede/todas-noticias/2025/enero/9/orden-ministerial-modificacion-declaraciones-censales.html', consultada: '2026-09-25' },
    { titulo: 'Agencia Tributaria: plazo del alta en el censo (modelo 036)', url: 'https://sede.agenciatributaria.gob.es/Sede/ayuda/manuales-videos-folletos/manuales-practicos/guia-practica-cumplimentacion-modelo-censal-036/capitulo-01-cuestiones-generales/plazos-presentacion/declaracion-alta/alta-censo-empresarios-profesionales-retenedores-036.html', consultada: '2026-09-25' },
    { titulo: 'Dirección General de Tributos, consulta vinculante V2661-14 (clases de pilates), texto en Iberley', url: 'https://www.iberley.es/resoluciones/resolucion-vinculante-dgt-v2661-14-08-10-2014-704921', consultada: '2026-09-25' },
    { titulo: 'Seguridad Social: Boletín RED 7/2017, altas previas en el RETA', url: 'https://www.seg-social.es/descarga/en/229649', consultada: '2026-09-25' },
    { titulo: 'Seguridad Social: sistema de cotización de autónomos y cuota reducida', url: 'https://www.seg-social.es/wps/portal/wss/internet/HerramientasWeb/9d2fd4f1-ab0f-42a6-8d10-2e74b378ee24?changeLanguage=es', consultada: '2026-09-25' },
    { titulo: 'BOE: Real Decreto-ley 13/2022, nuevo sistema de cotización de autónomos (cuota reducida de 2023 a 2025)', url: 'https://www.boe.es/buscar/doc.php?id=BOE-A-2022-12482', consultada: '2026-09-25' },
    { titulo: 'Consejo COLEF: el seguro de responsabilidad civil de las profesionales del deporte', url: 'https://www.consejo-colef.es/post/src2024-2025', consultada: '2026-09-25' },
    { titulo: 'Consejo COLEF: regulaciones autonómicas del ejercicio profesional del deporte', url: 'https://www.consejo-colef.es/regulacion-autonomica', consultada: '2026-09-25' },
    { titulo: 'AEPD: bases de legitimación para tratar categorías especiales de datos', url: 'https://www.aepd.es/preguntas-frecuentes/2-tus-obligaciones-como-responsable-del-tratamiento/5-bases-legitimadoras-del-tratamiento/FAQ-0215-cuales-son-las-bases-de-legitimacion-para-el-tratamiento-de-las-categorias-especiales-de-datos', consultada: '2026-09-25' },
    { titulo: 'SGAE: licencia de gimnasios y academias de baile', url: 'https://www.sgae.es/licencia-de-gimnasios-y-academias-de-baile/', consultada: '2026-09-25' },
    { titulo: 'Somos Música (AGEDI y AIE): licencias de música para negocios', url: 'https://somos-musica.es/', consultada: '2026-09-25' },
    { titulo: 'Stripe: tarifas en España', url: 'https://stripe.com/es/pricing', consultada: '2026-09-25' },
  ],
  relacionadas: [
    '/recursos/cuanto-cuesta-abrir-un-estudio-de-pilates',
    '/recursos/requisitos-para-abrir-un-estudio-de-pilates',
    '/soluciones/estudio-de-pilates-reformer',
    '/recursos/precios-reformer-mat',
    '/precios',
  ],
  cta: {
    titulo: 'Abre con las reservas y los cobros resueltos',
    texto: 'Tentare deja listos las reservas, los bonos, la lista de espera y los cobros de tu estudio antes de la primera clase. Pruébalo 7 días gratis, sin tarjeta, con el plan que elijas.',
  },
  revision: [
    'Precios de reformers y esterillas (Elina Pilates, Aerobic y Fitness) consultados el 25-sep-2026: cambian a menudo, revisarlos antes de publicar.',
    'Dato de demanda del CIS de marzo de 2024 (estudio 3447): comprobar si hay una encuesta de hábitos deportivos más reciente con la categoría de pilates.',
    'Tarifa plana: la norma (RDL 13/2022) solo fija los 80 €/mes para 2023-2025 y remite 2026 a los Presupuestos; no se encontró la norma de 2026. Por eso el texto dice «confirma la vigente»; si aparece la norma, citarla y simplificar.',
  ],
};

export default articulo;

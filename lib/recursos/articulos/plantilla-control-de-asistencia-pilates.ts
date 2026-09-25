import type { Articulo } from './tipos.ts';

const articulo: Articulo = {
  slug: 'plantilla-control-de-asistencia-pilates',
  titulo: 'Plantilla de control de asistencia para clases de pilates (Excel gratis)',
  tituloSeo: 'Plantilla de control de asistencia para clases (Excel)',
  descripcion:
    'Descarga gratis la plantilla en Excel para llevar la asistencia y los bonos de tu estudio: cómo usarla paso a paso, qué calcula sola y dónde se queda corta.',
  resumen:
    'Una plantilla gratuita de Excel con alumnas, clases y asistencia que descuenta sola las sesiones de cada bono, con instrucciones paso a paso y sus límites dichos claro.',
  categoria: 'operacion',
  seccion: 'Operación',
  publicado: '2026-09-25',
  consultaPrincipal: 'plantilla de control de asistencia para clases',
  consultas: [
    'control de asistencia a clases en Excel',
    'Excel para controlar la asistencia de alumnos',
    'formato de control de asistencia a clases',
    'plantilla Excel para bonos de clases',
  ],
  respuesta:
    'Una plantilla de control de asistencia para clases es una hoja de cálculo donde apuntas quién reserva, quién viene y quién cancela tarde, y que descuenta sola las sesiones de cada bono. La que te dejamos aquí es gratuita, se abre en Excel o en Hojas de cálculo de Google y tiene cuatro pestañas (instrucciones, alumnas, clases y asistencia) con fórmulas para las sesiones restantes, el estado del bono y la ocupación de cada clase.',
  entradilla:
    'Si llevas la asistencia en una libreta o en las notas del móvil, esta plantilla de control de asistencia para clases te ordena lo básico: quién vino, cuántas sesiones le quedan a cada alumna y cómo de llenas van tus clases. Te explicamos cómo usarla y, con la misma claridad, dónde se queda corta.',
  secciones: [
    {
      id: 'descarga-la-plantilla',
      titulo: 'Descarga la plantilla de control de asistencia para clases',
      bloques: [
        {
          t: 'p',
          texto:
            'Aquí la tienes: [descarga la plantilla en Excel (.xlsx)](/recursos/plantillas/control-asistencia-pilates.xlsx). Es gratuita, se descarga sin registrarte y funciona en Excel y en Hojas de cálculo de Google, que abre y edita archivos .xlsx. Está pensada para un estudio de pilates, pero sirve para cualquier clase con aforo y bonos: yoga, barre o entrenamiento funcional.',
        },
        {
          t: 'p',
          texto:
            'Tiene cuatro hojas. Las columnas con la cabecera oliva las rellenas tú; las de cabecera gris son fórmulas y se calculan solas, así que no escribas encima: si lo haces, borras la fórmula y la hoja deja de cuadrar. La fila amarilla de cada hoja es un ejemplo; bórrala o sobrescríbela cuando empieces.',
        },
      ],
    },
    {
      id: 'que-incluye',
      titulo: 'Qué incluye: el formato de control de asistencia a clases',
      bloques: [
        {
          t: 'tabla',
          cabecera: ['Hoja', 'Lo que rellenas tú', 'Lo que se calcula solo'],
          filas: [
            ['Cómo usarla', 'Nada: son las instrucciones', '—'],
            ['Alumnas', 'Nombre, teléfono, email, tipo de bono, sesiones compradas, fecha de compra y caducidad', 'Sesiones usadas (las cuenta en «Asistencia» desde la fecha de compra), sesiones restantes y estado: Activo, Agotado o Caducado'],
            ['Clases', 'ID de la clase, fecha, hora, tipo, instructora, sala y aforo', 'Reservas, asistencias y ocupación en % (asistencias entre aforo)'],
            ['Asistencia', 'Fecha, ID de la clase, alumna y si asistió: Sí, No o Canceló tarde', 'Descuenta sesión: Sí cuando asistió o canceló tarde'],
          ],
          nota: 'Estructura de la plantilla descargable de este artículo.',
        },
        {
          t: 'p',
          texto:
            'La lógica es sencilla: cada fila de «Asistencia» es una alumna en una clase. De ahí salen las sesiones que ha gastado cada una y lo llena que va cada clase, sin que tengas que sumar nada.',
        },
      ],
    },
    {
      id: 'como-usarla-paso-a-paso',
      titulo: 'Cómo usar la plantilla paso a paso',
      bloques: [
        {
          t: 'pasos',
          items: [
            {
              titulo: 'Guarda tu copia',
              texto:
                'Descárgala y ábrela en Excel, o súbela a Google Drive y ábrela con Hojas de cálculo de Google si la vais a usar dos personas.',
            },
            {
              titulo: 'Da de alta a tus alumnas',
              texto:
                'Una fila por alumna y bono en «Alumnas»: nombre, tipo de bono, sesiones compradas, fecha de compra y caducidad. Escribe el nombre siempre igual; mejor aún, cópialo de esta hoja cada vez que lo necesites en otra.',
            },
            {
              titulo: 'Crea las clases de la semana',
              texto:
                'En «Clases», una fila por sesión, con un ID que no se repita: la plantilla propone juntar fecha, hora y tipo, como 2026-10-06-0900-REF. Pon el aforo real; en reformer, el número de máquinas que funcionan.',
            },
            {
              titulo: 'Apunta cada reserva',
              texto:
                'Cuando una alumna reserve, añade una fila en «Asistencia» con la fecha de la clase, su ID y el nombre de la alumna, escrito igual que en «Alumnas». No te saltes la fecha: el bono solo cuenta las sesiones desde su fecha de compra. Deja «Asistió» en blanco hasta que pase la clase.',
            },
            {
              titulo: 'Marca la asistencia al acabar',
              texto:
                'Sí si vino, Canceló tarde si avisó fuera de plazo y No si no vino. En los dos primeros casos «Descuenta sesión» se pone en Sí y esa sesión sale de su bono. Si alguien falta sin avisar y en tu estudio eso cuenta como sesión gastada, márcalo como Canceló tarde, porque «No» no descuenta. Si cancela a tiempo, borra su fila y la plaza queda libre.',
            },
            {
              titulo: 'Revisa las alumnas cada semana',
              texto:
                'En «Alumnas» verás las sesiones restantes y el estado de cada bono. Filtra por Agotado y Caducado y sabrás a quién escribir para renovar.',
            },
            {
              titulo: 'Mira la ocupación',
              texto:
                'En «Clases», la ocupación (asistencias entre aforo) te dice qué horarios se llenan de verdad y cuáles van flojos. Con unas semanas de datos puedes decidir mejor el horario; tienes ideas en [cómo llenar las clases de horas valle](/recursos/ocupacion-clases-valle).',
            },
          ],
        },
      ],
    },
    {
      id: 'bonos-y-caducidad',
      titulo: 'Plantilla Excel para bonos de clases: sesiones y caducidad',
      bloques: [
        {
          t: 'p',
          texto:
            'El estado del bono sale de dos datos: la fecha de caducidad y las sesiones restantes. Si ya pasó la fecha, está Caducado, aunque le queden sesiones; si no le quedan sesiones, Agotado; si no, Activo. Y solo cuentan las sesiones desde la fecha de compra del bono.',
        },
        {
          t: 'p',
          texto:
            'Un ejemplo: una alumna compra el 1 de octubre un bono de 8 sesiones que caduca el 31 de octubre. Viene 6 veces y cancela tarde una: la plantilla le descuenta 7 y le queda 1. Si pasa el 31 de octubre sin usarla, el bono aparece como Caducado.',
        },
        {
          t: 'nota',
          titulo: 'La cancelación tarde, según tu política',
          texto:
            'La plantilla descuenta la sesión cuando alguien cancela tarde. Si en tu estudio no cobras las cancelaciones tardías, márcalas como No, o cambia la regla de la columna «Descuenta sesión», como explica la propia plantilla. Lo importante es aplicar la misma regla a todas; tienes ideas en [cómo reducir las cancelaciones de última hora](/recursos/reducir-cancelaciones-ultima-hora).',
        },
        {
          t: 'p',
          texto:
            'Cuando una alumna renueve, añade otra fila en «Alumnas» con su mismo nombre, el bono nuevo y su fecha de compra: como cada fila solo cuenta desde su fecha de compra, el bono nuevo empieza de cero. Deja la fila anterior como historial, pero no la mires para saber lo que le queda, porque sigue sumando las clases nuevas. Si aún estás decidiendo qué bonos vender y a qué precio, lee [cómo plantear los bonos de pilates](/recursos/bonos-de-pilates).',
        },
      ],
    },
    {
      id: 'lo-que-no-hace',
      titulo: 'Excel para controlar la asistencia de alumnos: lo que no hace',
      bloques: [
        {
          t: 'p',
          texto:
            'Una hoja de cálculo ordena, pero no trabaja por ti. Antes de confiarle tu estudio, conoce sus límites:',
        },
        {
          t: 'lista',
          items: [
            '**No avisa a nadie.** Ni a la alumna cuyo bono caduca mañana ni a la siguiente de la lista cuando se libera una plaza. Los mensajes los mandas tú.',
            '**No cobra.** Puedes apuntar quién ha pagado, pero el cobro, el recibo y la factura van por otro lado.',
            '**No hay lista de espera.** Ves que una clase está llena comparando «Reservas» con el aforo, pero la hoja no guarda el orden de quién esperaba ni ofrece la plaza a nadie.',
            '**Se desincroniza si la usan dos personas.** Si recepción y una instructora trabajan cada una con su copia, acabaréis con dos versiones distintas. Compartirla en Hojas de cálculo de Google ayuda, porque editáis el mismo archivo, pero nada impide que dos personas den la misma última plaza a la vez.',
            '**Depende de que escribas igual.** Para una fórmula, «Lucía G.» y «Lucia G.» son dos alumnas distintas, y la sesión no se descuenta donde toca.',
            '**Tiene las filas contadas.** Las columnas grises traen la fórmula puesta en un número limitado de filas; cuando llegues al final, cópiala hacia abajo o empieza un archivo nuevo cada trimestre.',
          ],
        },
        {
          t: 'nota',
          titulo: 'Y los datos de tus alumnas',
          texto:
            'Nombre, teléfono y correo son datos personales: guarda el archivo con contraseña y no añadas columnas de salud (lesiones, embarazo, patologías). La AEPD ofrece Facilita RGPD, una herramienta gratuita para negocios que tratan datos de escaso riesgo; no sirve para datos de salud.',
        },
      ],
    },
    {
      id: 'cuando-pasar-a-un-software',
      titulo: 'Cuándo pasar de la hoja a un software',
      bloques: [
        {
          t: 'p',
          texto:
            'La plantilla aguanta bien mientras la lleve una sola persona y tus alumnas reserven por mensaje. Estas son las señales de que se te ha quedado corta:',
        },
        {
          t: 'lista',
          items: [
            'Actualizarla después de cada clase se te acumula.',
            'Hay más de una persona apuntando reservas.',
            'Te escriben para preguntar cuántas sesiones les quedan.',
            'Tienes lista de espera y se te escapan plazas.',
            'Cobras cuotas mensuales y cada mes persigues pagos.',
          ],
        },
        {
          t: 'p',
          texto:
            'En ese punto, un programa hace lo mismo sin que lo teclees. Tentare, por ejemplo, tiene [check-in y control de asistencia](/funcionalidades/control-de-asistencia), bonos con caducidad y lista de espera automática, y tus alumnas reservan y cancelan solas desde el móvil. Si ya tienes a tus alumnas en esta plantilla, su importador lee Excel. Y si todavía no quieres pagar, mira qué más puedes montar con [software de pilates gratis](/recursos/software-pilates-gratis).',
        },
      ],
    },
  ],
  faq: [
    {
      q: '¿Cómo se hace un control de asistencia a clases en Excel?',
      a: 'Con tres tablas relacionadas: las alumnas con su bono, las clases con su aforo y una fila por cada alumna en cada clase con si vino, no vino o canceló tarde. Con eso, una fórmula cuenta las sesiones gastadas y otra calcula la ocupación. Es lo que trae la plantilla de este artículo, lista para usar.',
    },
    {
      q: '¿La plantilla funciona en Google Sheets?',
      a: 'Sí. Hojas de cálculo de Google abre, edita y convierte archivos .xlsx. Si la vais a usar varias personas, súbela a Drive y compártela: así editáis todas el mismo archivo en lugar de copias distintas.',
    },
    {
      q: '¿Una cancelación tarde cuenta como asistencia?',
      a: 'En la plantilla, descuenta sesión: la columna «Descuenta sesión» se pone en Sí cuando la alumna asistió o canceló tarde. Si en tu estudio no cobras las cancelaciones tardías, márcalas como No.',
    },
    {
      q: '¿Puedo llevar los bonos de varias sesiones con esta plantilla?',
      a: 'Sí. Cada alumna tiene tipo de bono, sesiones compradas, fecha de compra y caducidad, y la hoja calcula las sesiones usadas, las restantes y si el bono está activo, agotado o caducado.',
    },
    {
      q: '¿Puedo guardar los datos de mis alumnas en un Excel?',
      a: 'Sí, cumpliendo la normativa de protección de datos: guarda solo lo necesario, protege el archivo y no incluyas datos de salud. La AEPD ofrece Facilita RGPD, gratuita, para negocios que tratan datos de escaso riesgo. Si tienes dudas, consulta con un asesor.',
    },
    {
      q: '¿Cada cuánto hay que actualizar la hoja de asistencia?',
      a: 'Después de cada clase. Si lo dejas para el final de la semana, olvidarás quién canceló tarde y los bonos dejarán de cuadrar.',
    },
  ],
  fuentes: [
    { titulo: 'Google Docs Editores: trabajar con archivos de Office en Hojas de cálculo de Google', url: 'https://support.google.com/docs/answer/6055139?hl=es', consultada: '2026-09-25' },
    { titulo: 'AEPD: Facilita RGPD', url: 'https://www.aepd.es/guias-y-herramientas/herramientas/facilita-rgpd', consultada: '2026-09-25' },
  ],
  relacionadas: [
    '/funcionalidades/control-de-asistencia',
    '/recursos/software-pilates-gratis',
    '/recursos/bonos-de-pilates',
    '/recursos/reducir-cancelaciones-ultima-hora',
  ],
  cta: {
    titulo: 'Cuando la hoja se te quede pequeña',
    texto:
      'Prueba Tentare 7 días gratis y sin tarjeta con el plan que elijas: check-in y control de asistencia, bonos con caducidad y lista de espera automática. Si vienes de esta plantilla, puedes importar tu Excel.',
  },
  revision: [
    'El texto se ha cotejado con public/recursos/plantillas/control-asistencia-pilates.xlsx tal como estaba el 25-sep-2026 (hojas, columnas, fórmulas de «Sesiones usadas», «Estado», «Reservas», «Asistencias», «Ocupación %» y «Descuenta sesión»). Si se regenera la plantilla, volver a cotejarlo.',
    'La plantilla trae fórmulas en las filas 2 a 301 de cada hoja (rangos de COUNTIFS hasta la 5.001); el texto no da la cifra para no quedarse desfasado.',
    'Tras renovar un bono, la fila del bono anterior sigue sumando las clases nuevas (cuenta desde su propia fecha de compra); el texto lo advierte.',
  ],
};

export default articulo;

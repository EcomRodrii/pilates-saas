import type { Articulo } from './tipos.ts';

const articulo: Articulo = {
  slug: 'politica-de-cancelacion-de-clases',
  titulo: 'Política de cancelación de clases: plantilla para tu estudio y lo que dice la ley',
  tituloSeo: 'Política de cancelación de clases: plantilla y ley',
  descripcion: 'Plantilla de política de cancelación para un estudio de pilates o yoga, cláusula a cláusula, con ventanas reales y lo que permite la ley sobre penalizaciones.',
  resumen: 'Qué tiene que decir la política de cancelación de tu estudio, cuántas horas piden estudios reales, qué permite la ley (penalizaciones y desistimiento) y una plantilla lista para adaptar.',
  categoria: 'operacion',
  seccion: 'Operación',
  publicado: '2026-09-25',
  consultaPrincipal: 'política de cancelación de clases',
  consultas: [
    'plantilla de política de cancelación para un estudio',
    'política de cancelación pilates',
    'se puede cobrar una clase no cancelada',
    'penalización por no asistir a clase',
    'derecho de desistimiento en un bono de clases',
  ],
  respuesta: 'Una política de cancelación de clases dice con cuántas horas se puede cancelar sin perder la sesión (entre 2 y 24 en los estudios españoles revisados), qué pasa si se cancela tarde o no se viene, cómo funcionan la lista de espera, las recuperaciones y las congelaciones, y qué ocurre si cancela el estudio. Para aplicarla, la alumna tiene que conocerla y aceptarla antes de pagar, y no puede incluir penalizaciones desproporcionadas: la ley de consumidores las declara abusivas.',
  entradilla: 'Tu política de cancelación de clases no es un cartel en la recepción: es parte del contrato con cada alumna. Aquí tienes lo que tiene que decir, las ventanas que usan estudios españoles, dónde pone la ley los límites y una plantilla, cláusula a cláusula, para tu estudio.',
  secciones: [
    {
      id: 'que-debe-decir',
      titulo: 'Qué tiene que decir una política de cancelación de clases',
      bloques: [
        {
          t: 'p',
          texto: 'Para que se cancele menos, tienes las tácticas en [cómo reducir las cancelaciones de última hora](/recursos/reducir-cancelaciones-ultima-hora). Esto va del texto que acepta tu alumna al comprar, que tiene que responder a estas preguntas:',
        },
        {
          t: 'lista',
          items: [
            '**Ventana:** con cuántas horas de antelación se cancela sin perder nada, y si cambia según el tipo de clase.',
            '**Qué se pierde:** qué pasa con la sesión del bono, de la cuota o con la clase suelta si se cancela tarde o no se viene.',
            '**Penalización:** si cobras algo más, cuánto y en qué casos. Es opcional.',
            '**Lista de espera:** qué pasa con la plaza liberada y cuánto tiempo tiene la siguiente para aceptarla.',
            '**Recuperaciones y congelaciones:** si se recuperan clases, en qué plazo y si se puede pausar la cuota.',
            '**Bonos y cuotas:** caducidad, si son personales y cómo se da de baja una cuota.',
            '**Fuerza mayor:** enfermedad o accidente, y qué justificante pides.',
            '**Cuando cancela el estudio:** qué recibe la alumna si se anula o cambia una clase.',
            '**Comunicación:** por dónde se cancela y por dónde avisas tú.',
          ],
        },
      ],
    },
    {
      id: 'ventanas-reales',
      titulo: 'Cuántas horas de antelación: lo que piden estudios de pilates y yoga',
      bloques: [
        { t: 'p', texto: 'Ninguna ley fija la ventana: la decide cada estudio. Estas son las que publican seis estudios de pilates y yoga:' },
        {
          t: 'tabla',
          cabecera: ['Estudio', 'Ventana', 'Qué dice su web'],
          filas: [
            ['True Pilates (Zaragoza)', '24 horas', 'Fuera de plazo, «la clase será contada»'],
            ['Estación Pilates (Madrid)', '12 horas', 'Más tarde, o sin aviso, se consume la clase del bono o de la mensualidad'],
            ['Olimpia (Madrid)', '6 horas para socias, 12 para el resto', 'Plazo para cancelar o cambiar la reserva'],
            ['Pilates Estudio (Madrid)', '4 horas', 'Con ese aviso, recuperas la clase hasta 6 meses después'],
            ['Corestudio (Sevilla)', '3 horas en grupo; 12 en individuales y en pareja', 'Recuperas con aviso previo y si hay hueco'],
            ['FIGA Yoga Studio (Barcelona)', '2 horas', 'Fuera de plazo, la sesión se da por usada y no se recupera'],
          ],
          nota: 'Condiciones publicadas en la web de cada estudio, consultadas el 25-sep-2026. Olimpia las publica en inglés; la traducción es nuestra.',
        },
        {
          t: 'p',
          texto: 'Ninguno de los seis anuncia en su web una multa: la consecuencia es perder la sesión. Una ventana larga deja tiempo para ocupar la plaza desde la lista de espera; una corta es más cómoda para la alumna. Cómo encaja con la caducidad de los bonos, en [bonos de pilates](/recursos/bonos-de-pilates).',
        },
      ],
    },
    {
      id: 'lo-que-dice-la-ley',
      titulo: 'Política de cancelación y ley: información previa y cláusulas abusivas',
      bloques: [
        {
          t: 'p',
          texto: 'Tu política es una condición general: la redactas tú y la alumna la acepta o no, sin negociarla. La regulan el texto refundido de la Ley General para la Defensa de los Consumidores y Usuarios (TRLGDCU) y la Ley de Condiciones Generales de la Contratación (LCGC). Lo que te exigen:',
        },
        {
          t: 'lista',
          items: [
            '**Informar antes de cobrar.** Antes de que la alumna quede vinculada le debes, con claridad, las condiciones jurídicas y económicas del contrato, incluidas su duración y las penalizaciones por baja (artículo 60 del TRLGDCU). Si reclama, tú tienes que probar que informaste.',
            '**Que la haya podido leer.** Una condición general solo forma parte del contrato si la alumna la aceptó y pudo conocerla entera al contratar (artículos 5 y 7 de la LCGC). Online, tiene que estar disponible antes de empezar la compra y poder guardarse (artículo 27.4 de la Ley 34/2002); en recepción, si no hay contrato escrito y entregas justificante de pago, basta un cartel visible o el texto en la documentación de la compra (artículo 5.3 de la LCGC).',
            '**Clara y de buena fe.** Las cláusulas no negociadas tienen que ser concretas, legibles y equilibradas (artículo 80), y ante la duda se interpretan a favor de la alumna.',
            '**Sin cláusulas abusivas.** Lo son, entre otras, las que imponen «una indemnización desproporcionadamente alta» a quien no cumple (artículo 85.6), las que te dejan cambiar el contrato a tu voluntad sin motivos válidos especificados en él (artículo 85.3) y las que te dejan quedarte con lo pagado por clases que no das cuando eres tú quien resuelve el contrato (artículo 87).',
            '**Bajas sin obstáculos.** En una cuota, la alumna puede darse de baja por la misma vía por la que se apuntó, sin perder lo pagado por adelantado ni pagar servicios no prestados, y el contrato tiene que explicar cómo hacerlo (artículo 62). Si pactas permanencia, la penalización por irse antes será proporcional a los días que falten.',
          ],
        },
        {
          t: 'p',
          texto: 'Qué es «desproporcionado» no lo fija ninguna cifra: se valora caso por caso (artículo 82.3) y la cláusula abusiva la anula un juez (artículo 83). Lo prudente es que la consecuencia normal sea perder la sesión, y que una penalización, si la pones, sea moderada y responda a un perjuicio real: la plaza que no pudiste ofrecer.',
        },
      ],
    },
    {
      id: 'derecho-de-desistimiento',
      titulo: 'Derecho de desistimiento en un bono de clases comprado online',
      bloques: [
        {
          t: 'p',
          texto: 'Quien contrata a distancia (en tu web o tu app, sin pasar por el estudio) tiene, en general, 14 días naturales desde la compra para desistir sin dar explicaciones (artículos 102 y 104 del TRLGDCU). La excepción que te afecta: no se aplica a los «servicios relacionados con actividades de esparcimiento, si los contratos prevén una fecha o un periodo de ejecución específicos» (artículo 103.l).',
        },
        {
          t: 'p',
          texto: 'La ley no dice si una clase de pilates o yoga es «esparcimiento». La Comisión Europea, en su guía de la directiva de la que sale ese artículo, pide interpretar la excepción de forma estricta: la justifica en reservas difíciles de volver a cubrir y no la aplica a actividades sin límite de aforo. Con esa lógica:',
        },
        {
          t: 'tabla',
          cabecera: ['Compra', 'Desistimiento de 14 días', 'Por qué'],
          filas: [
            ['Clase suelta online, para un día y una hora', 'Probablemente no', 'Tiene fecha concreta y ocupa una plaza limitada'],
            ['Bono online sin fechas', 'Probablemente sí', 'No prevé una fecha ni un periodo de ejecución concretos'],
            ['Cuota mensual online', 'Dudoso', 'Tiene un periodo, el mes, pero la excepción se interpreta en sentido estricto'],
            ['Compra en recepción', 'No, salvo que tú lo ofrezcas', 'La ley lo da en contratos a distancia o fuera del establecimiento'],
          ],
          nota: 'Lectura orientativa de los artículos 92, 102 y 103 del TRLGDCU y de la guía de la Comisión Europea (DO C 525 de 29-12-2021). No sustituye el criterio de una abogada ni de la oficina de consumo.',
        },
        {
          t: 'p',
          texto: 'Si el desistimiento se aplica, informa de él antes de la compra, con su formulario (artículo 97.1.j); si no, el plazo se alarga doce meses (artículo 105). Si la alumna quiere reservar dentro de esos 14 días, que lo pida de forma expresa (artículo 98.8): si luego desiste, paga la parte proporcional de lo que usó (artículo 108) y le devuelves el resto en 14 días (artículo 107). Si no se aplica, también debes decirlo antes (artículo 97.1.m). Para tu caso, pregunta en el [organismo de consumo de tu comunidad](https://cidoc.consumo.gob.es/directorio-mapas/organismos-consumo-administracion-autonomica) o a una abogada.',
        },
      ],
    },
    {
      id: 'plantilla',
      titulo: 'Plantilla de política de cancelación para un estudio',
      bloques: [
        {
          t: 'p',
          texto: 'Copia cada cláusula, cambia lo que va entre corchetes (los números son ejemplos para rellenar, no recomendaciones) y borra lo que no aplique. Revísala con tu asesoría antes de publicarla.',
        },
        { t: 'descarga', recurso: 'plantilla-politica-cancelacion' },
        {
          t: 'pasos',
          items: [
            {
              titulo: 'Ámbito',
              texto: 'Estas condiciones se aplican a todas las clases de [nombre del estudio] ([razón social y NIF], [dirección]), se reserven en la web, en la app o en recepción, y a sus bonos, cuotas y clases sueltas. Forman parte de las condiciones de compra.',
            },
            {
              titulo: 'Reserva',
              texto: 'Para asistir hay que reservar. La reserva es personal, queda confirmada cuando recibes el aviso y descuenta una sesión de tu bono o de tu cuota, o requiere pagar la clase suelta.',
            },
            {
              titulo: 'Cancelación a tiempo',
              texto: 'Puedes cancelar sin coste hasta [12] horas antes de la clase ([24] en [reformer / privadas]) desde [la app / la web]. La sesión vuelve a tu bono o a tu cuota y, si pagaste una clase suelta, [te devolvemos el importe / queda como saldo para otra].',
            },
            {
              titulo: 'Cancelación tardía y no presentarse',
              texto: 'Si cancelas con menos de [12] horas de antelación o no vienes sin avisar, la sesión se da por usada: se descuenta de tu bono o de tu cuota, y la clase suelta no se devuelve.',
            },
            {
              titulo: 'Penalización económica (opcional)',
              texto: 'Solo si la aceptas al comprar: por cada cancelación tardía cobraremos [5] € y por cada ausencia sin aviso, [8] €, a la tarjeta que tengas guardada, [a partir de la segunda vez en un mismo mes]. El importe nunca superará el precio de una clase suelta.',
            },
            {
              titulo: 'Lista de espera',
              texto: 'Si una clase está llena, puedes apuntarte a la lista de espera. Cuando se libera una plaza, se ofrece a la primera de la lista [y se confirma sola / y tiene [60] minutos para aceptarla]. Desde entonces se aplican las mismas reglas de cancelación.',
            },
            {
              titulo: 'Cancelación o cambios por parte del estudio',
              texto: 'Solo cancelaremos una clase o cambiaremos su horario o su instructora por [baja de la instructora sin sustituta / menos de [3] reservas [2] horas antes / avería o cierre obligado del local], y te avisaremos en cuanto lo sepamos por [canal]. Si cancelamos, recuperas la sesión [o te devolvemos lo pagado por esa clase]; si el cambio no te encaja, puedes cancelar sin coste.',
            },
            {
              titulo: 'Recuperaciones y congelaciones',
              texto: 'Las clases canceladas a tiempo se recuperan en [el mismo mes / las [4] semanas siguientes], según disponibilidad. Puedes congelar tu cuota [una vez al año, hasta [30] días], avisando con [15] días de antelación.',
            },
            {
              titulo: 'Bonos, cuotas y bajas',
              texto: 'Los bonos son personales y caducan a los [3] meses de la compra. La cuota se renueva cada [mes]; puedes darte de baja cuando quieras, por la misma vía por la que te apuntaste ([la app / la web / recepción]), y si lo haces antes del día [1], no se te cobra el mes siguiente.',
            },
            {
              titulo: 'Fuerza mayor y justificantes',
              texto: 'Si no puedes avisar a tiempo por enfermedad, accidente u otra causa de fuerza mayor, envíanos un justificante en los [2] días siguientes y te devolveremos la sesión [y anularemos la penalización].',
            },
            {
              titulo: 'Aceptación y cambios',
              texto: 'Al comprar un bono, una cuota o una clase aceptas estas condiciones, que tienes siempre disponibles en [enlace]. Si las cambiamos, te avisaremos con [15] días de antelación, y las nuevas se aplicarán a las compras y renovaciones posteriores, nunca a lo ya pagado.',
            },
          ],
        },
      ],
    },
    {
      id: 'como-aplicarla',
      titulo: 'Cómo aplicar tu política de cancelación sin discusiones',
      bloques: [
        {
          t: 'lista',
          items: [
            '**Publícala donde se compra:** en la web y en la app, junto a los precios, y en recepción, en un cartel visible.',
            '**Pide que la acepte al comprar:** una casilla sin marcar con el enlace al texto, guardando qué versión aceptó y cuándo. Sin eso, es su palabra contra la tuya.',
            '**Recuérdasela a tiempo:** en la confirmación de la reserva y en el recordatorio, con la hora límite para cancelar.',
            '**Aplícala igual a todas:** la excepción de hoy es la queja de mañana de quien sí cumplió. Si perdonas, que sea por fuerza mayor, no a ojo.',
          ],
        },
      ],
    },
    {
      id: 'con-tentare',
      titulo: 'Tu política de cancelación, aplicada sola en Tentare',
      bloques: [
        {
          t: 'p',
          texto: 'En Tentare, las alumnas cancelan solas desde el móvil, y las reglas se fijan por tipo de clase, entre ellas la antelación para cancelar sin perder la sesión (puedes cerrar el reformer antes que el mat). La plaza liberada pasa sola a la [lista de espera](/funcionalidades/lista-de-espera), al momento o con un plazo para aceptarla. Y si activas la penalización por cancelación tardía o por no venir, el estudio puede cobrarla a la tarjeta guardada de la alumna, de forma automática o cuando tú la apruebas, y solo si ella aceptó esa cláusula: [cancelaciones y políticas](/funcionalidades/cancelaciones-y-politicas).',
        },
      ],
    },
  ],
  faq: [
    {
      q: '¿Se puede cobrar una clase no cancelada?',
      a: 'Sí, si tu política lo decía y la alumna la aceptó antes de pagar: lo habitual es dar por usada la sesión. Cobrar además una penalización exige que la haya aceptado expresamente y que sea proporcional: la ley declara abusivas las indemnizaciones desproporcionadamente altas.',
    },
    {
      q: '¿Es legal una penalización por no asistir a clase?',
      a: 'Puede serlo si la alumna la conoce y la acepta antes de comprar, está redactada con claridad y el importe es moderado. Si es desproporcionada, un juez puede anularla (artículos 85.6 y 83 del TRLGDCU). Para tu caso, consulta a una abogada o al organismo de consumo de tu comunidad.',
    },
    {
      q: '¿Tiene derecho de desistimiento un bono de clases?',
      a: 'Si se compró online y no tiene fechas, probablemente sí: 14 días naturales desde la compra, pagando la parte ya usada si pidió empezar antes. Una clase con día y hora concretos probablemente entra en la excepción del ocio con fecha, y lo comprado en recepción no tiene este derecho por ley.',
    },
    {
      q: '¿Con cuántas horas de antelación se puede cancelar una clase?',
      a: 'Lo decide cada estudio. En los seis revisados va de 2 a 24 horas, y hay quien pide más antelación en las clases individuales: Corestudio (Sevilla) pide 3 horas en grupo y 12 en las individuales y en pareja.',
    },
    {
      q: '¿Qué pasa si el estudio cancela la clase?',
      a: 'Tu política tiene que decir qué recibe la alumna: recuperar la sesión o que se le devuelva lo pagado por esa clase. Quedarte con lo pagado por clases que no das cuando eres tú quien resuelve el contrato es abusivo (artículo 87).',
    },
    {
      q: '¿Puedo cambiar la política a alumnas que ya pagaron?',
      a: 'No sobre lo ya pagado: cambiar el contrato a tu voluntad sin motivos válidos recogidos en él es abusivo (artículo 85.3 del TRLGDCU). Avisa con antelación y aplica la nueva a las compras y renovaciones posteriores.',
    },
  ],
  fuentes: [
    { titulo: 'BOE: Real Decreto Legislativo 1/2007, texto refundido de la Ley General para la Defensa de los Consumidores y Usuarios (arts. 60, 62, 80, 82 a 87, 92 y 97 a 108)', url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2007-20555', consultada: '2026-09-25' },
    { titulo: 'BOE: Ley 7/1998, sobre condiciones generales de la contratación (arts. 5 y 7)', url: 'https://www.boe.es/buscar/act.php?id=BOE-A-1998-8789', consultada: '2026-09-25' },
    { titulo: 'BOE: Ley 34/2002, de servicios de la sociedad de la información y de comercio electrónico (art. 27)', url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2002-13758', consultada: '2026-09-25' },
    { titulo: 'Comisión Europea: Directrices sobre la interpretación y la aplicación de la Directiva 2011/83/UE (DO C 525 de 29-12-2021), apartado 5.11.6', url: 'https://eur-lex.europa.eu/legal-content/ES/TXT/HTML/?uri=CELEX%3A52021XC1229%2804%29', consultada: '2026-09-25' },
    { titulo: 'Centro Europeo del Consumidor en España: folleto sobre el derecho de desistimiento (julio de 2026)', url: 'https://portal-cec.consumo.gob.es/sites/default/files/documentos/FOLLETO_DERECHO_DESISTIMIENTO_JULIO_2026.pdf', consultada: '2026-09-25' },
    { titulo: 'CIDOC (Ministerio de Derechos Sociales, Consumo y Agenda 2030): organismos de consumo de las comunidades autónomas', url: 'https://cidoc.consumo.gob.es/directorio-mapas/organismos-consumo-administracion-autonomica', consultada: '2026-09-25' },
    { titulo: 'True Pilates Zaragoza: clases, tarifas y condiciones generales de venta', url: 'https://truepilateszaragoza.com/clases-y-tarifas/', consultada: '2026-09-25' },
    { titulo: 'Estación Pilates (Madrid): precios y cancelaciones', url: 'https://estacionpilates.es/precios/', consultada: '2026-09-25' },
    { titulo: 'Olimpia (Madrid): membresías y política de cancelación', url: 'https://olimpiatwc.com', consultada: '2026-09-25' },
    { titulo: 'Pilates Estudio (Madrid): clases y precios', url: 'https://pilatesestudio.es/clases-y-precios/', consultada: '2026-09-25' },
    { titulo: 'Corestudio (Sevilla): tarifas, cancelaciones y recuperaciones', url: 'https://corestudiopilates.es/tarifas/', consultada: '2026-09-25' },
    { titulo: 'FIGA Yoga Studio (Barcelona): precios y política de cancelaciones', url: 'https://figayogastudio.com/precios', consultada: '2026-09-25' },
  ],
  relacionadas: [
    '/recursos/reducir-cancelaciones-ultima-hora',
    '/funcionalidades/cancelaciones-y-politicas',
    '/recursos/bonos-de-pilates',
    '/funcionalidades/lista-de-espera',
    '/recursos/como-abrir-un-estudio-de-yoga',
  ],
  cta: {
    titulo: 'Que tu política se aplique sola, igual para todas',
    texto: 'Con Tentare, tus alumnas cancelan desde el móvil dentro de la ventana que fijas para cada tipo de clase, y la plaza pasa sola a la lista de espera. Pruébalo 7 días gratis, sin tarjeta, con el plan que elijas.',
  },
  revision: [
    'Parte legal (TRLGDCU, LCGC y LSSI): que la revise una abogada de consumo antes de publicar. La tabla de desistimiento es una lectura prudente de los artículos 102 y 103.l y de la guía de la Comisión Europea; no se ha encontrado resolución española sobre bonos o cuotas de clases comprados online.',
    'Ventanas de los seis estudios consultadas el 25-sep-2026: cambian a menudo. Olimpia publica su política en inglés («6 hour cancellation/modification window vs 12 hours for non-members»); la traducción es nuestra.',
    'Plantilla: las cifras entre corchetes (horas, importes, plazos) son ejemplos para rellenar, no recomendaciones ni datos de mercado.',
  ],
};

export default articulo;

// GENERADO por demo/montar.mjs — no se edita a mano (ver lib/configuracion/demo.ts).
import type { SeccionId, TarjetaId } from './secciones.ts';

export interface MomentoDemo {
  /** La tarjeta (o herramienta) de la que habla el vídeo en ese minuto. */
  readonly tarjeta: TarjetaId;
  readonly inicioSeg: number;
}

export interface CapituloDemo {
  readonly seccion: SeccionId;
  readonly inicioSeg: number;
  readonly momentos: readonly MomentoDemo[];
}

export const DURACION_DEMO_SEG: number | null = 1897;

export const CAPITULOS_DEMO: readonly CapituloDemo[] = [
  {
    seccion: 'estudio',
    inicioSeg: 0,
    momentos: [
      {
        tarjeta: 'nombre-y-direccion',
        inicioSeg: 26
      },
      {
        tarjeta: 'contacto',
        inicioSeg: 46
      },
      {
        tarjeta: 'horario',
        inicioSeg: 58
      },
      {
        tarjeta: 'cerrar-el-centro',
        inicioSeg: 83
      },
      {
        tarjeta: 'salas',
        inicioSeg: 119
      },
      {
        tarjeta: 'certificado',
        inicioSeg: 173
      }
    ]
  },
  {
    seccion: 'clases',
    inicioSeg: 197,
    momentos: [
      {
        tarjeta: 'tipos-de-clase',
        inicioSeg: 210
      },
      {
        tarjeta: 'servicios-de-cita',
        inicioSeg: 257
      },
      {
        tarjeta: 'horario-de-citas',
        inicioSeg: 280
      }
    ]
  },
  {
    seccion: 'reservas',
    inicioSeg: 305,
    momentos: [
      {
        tarjeta: 'reservar',
        inicioSeg: 335
      },
      {
        tarjeta: 'lista-de-espera',
        inicioSeg: 392
      },
      {
        tarjeta: 'cancelar-y-recuperar',
        inicioSeg: 413
      },
      {
        tarjeta: 'recuperaciones',
        inicioSeg: 438
      },
      {
        tarjeta: 'si-cancela-tarde-o-no-viene',
        inicioSeg: 458
      },
      {
        tarjeta: 'asistencia',
        inicioSeg: 482
      },
      {
        tarjeta: 'si-se-cancela-una-clase',
        inicioSeg: 502
      },
      {
        tarjeta: 'si-se-queda-sin-cuota',
        inicioSeg: 520
      },
      {
        tarjeta: 'plaza-fija-desde-la-app',
        inicioSeg: 535
      },
      {
        tarjeta: 'si-pausa-su-plaza-fija',
        inicioSeg: 552
      },
      {
        tarjeta: 'ajuste-avisar-alumnas',
        inicioSeg: 567
      }
    ]
  },
  {
    seccion: 'cobros',
    inicioSeg: 606,
    momentos: [
      {
        tarjeta: 'datos-fiscales',
        inicioSeg: 623
      },
      {
        tarjeta: 'facturacion',
        inicioSeg: 655
      },
      {
        tarjeta: 'integracion-stripe',
        inicioSeg: 683
      },
      {
        tarjeta: 'datafono',
        inicioSeg: 698
      },
      {
        tarjeta: 'cuando-se-cobra-la-cuota',
        inicioSeg: 711
      },
      {
        tarjeta: 'domiciliaciones',
        inicioSeg: 731
      },
      {
        tarjeta: 'devoluciones',
        inicioSeg: 749
      },
      {
        tarjeta: 'si-se-cancela-una-cuota',
        inicioSeg: 765
      }
    ]
  },
  {
    seccion: 'altas',
    inicioSeg: 812,
    momentos: [
      {
        tarjeta: 'contrato-y-privacidad',
        inicioSeg: 823
      },
      {
        tarjeta: 'compra-desde-tu-enlace',
        inicioSeg: 840
      },
      {
        tarjeta: 'datos-extra-de-la-ficha',
        inicioSeg: 860
      },
      {
        tarjeta: 'preguntas-en-su-app',
        inicioSeg: 882
      },
      {
        tarjeta: 'valoracion-inicial',
        inicioSeg: 893
      },
      {
        tarjeta: 'cuestionario-de-salud',
        inicioSeg: 904
      }
    ]
  },
  {
    seccion: 'comunicacion',
    inicioSeg: 922,
    momentos: [
      {
        tarjeta: 'correos-automaticos',
        inicioSeg: 933
      },
      {
        tarjeta: 'avisos-del-movil',
        inicioSeg: 983
      },
      {
        tarjeta: 'integracion-resend',
        inicioSeg: 1025
      },
      {
        tarjeta: 'integracion-whatsapp',
        inicioSeg: 1040
      }
    ]
  },
  {
    seccion: 'motivacion',
    inicioSeg: 1080,
    momentos: [
      {
        tarjeta: 'reglas',
        inicioSeg: 1095
      },
      {
        tarjeta: 'creditos-por-accion',
        inicioSeg: 1111
      },
      {
        tarjeta: 'recompensas',
        inicioSeg: 1139
      },
      {
        tarjeta: 'canjes',
        inicioSeg: 1166
      },
      {
        tarjeta: 'logros',
        inicioSeg: 1175
      },
      {
        tarjeta: 'niveles',
        inicioSeg: 1186
      },
      {
        tarjeta: 'retos',
        inicioSeg: 1196
      },
      {
        tarjeta: 'codigos-descuento',
        inicioSeg: 1206
      }
    ]
  },
  {
    seccion: 'marca',
    inicioSeg: 1231,
    momentos: [
      {
        tarjeta: 'logo-y-favicon',
        inicioSeg: 1243
      },
      {
        tarjeta: 'textos-de-tu-app',
        inicioSeg: 1264
      },
      {
        tarjeta: 'textos-de-bienvenida',
        inicioSeg: 1286
      },
      {
        tarjeta: 'color-de-marca',
        inicioSeg: 1298
      }
    ]
  },
  {
    seccion: 'web',
    inicioSeg: 1345,
    momentos: [
      {
        tarjeta: 'direccion-y-enlaces',
        inicioSeg: 1358
      },
      {
        tarjeta: 'pagina-publica',
        inicioSeg: 1391
      },
      {
        tarjeta: 'contenido-de-tu-app',
        inicioSeg: 1414
      },
      {
        tarjeta: 'widgets',
        inicioSeg: 1441
      }
    ]
  },
  {
    seccion: 'equipo',
    inicioSeg: 1490,
    momentos: [
      {
        tarjeta: 'ajuste-instructoras-crean-clases',
        inicioSeg: 1502
      },
      {
        tarjeta: 'app-de-tus-instructoras',
        inicioSeg: 1515
      }
    ]
  },
  {
    seccion: 'conexiones',
    inicioSeg: 1572,
    momentos: [
      {
        tarjeta: 'integracion-google_calendar',
        inicioSeg: 1589
      },
      {
        tarjeta: 'integracion-zoom',
        inicioSeg: 1597
      },
      {
        tarjeta: 'integracion-kisi',
        inicioSeg: 1601
      },
      {
        tarjeta: 'integracion-klaviyo',
        inicioSeg: 1613
      },
      {
        tarjeta: 'plataformas-externas',
        inicioSeg: 1623
      },
      {
        tarjeta: 'integracion-zapier',
        inicioSeg: 1635
      },
      {
        tarjeta: 'api-publica',
        inicioSeg: 1646
      }
    ]
  },
  {
    seccion: 'datos',
    inicioSeg: 1673,
    momentos: [
      {
        tarjeta: 'exportar',
        inicioSeg: 1683
      },
      {
        tarjeta: 'doble-factor-equipo',
        inicioSeg: 1715
      },
      {
        tarjeta: 'redaccion-ia',
        inicioSeg: 1731
      }
    ]
  },
  {
    seccion: 'avisos',
    inicioSeg: 1765,
    momentos: [
      {
        tarjeta: 'tus-avisos',
        inicioSeg: 1775
      }
    ]
  },
  {
    seccion: 'panel',
    inicioSeg: 1809,
    momentos: [
      {
        tarjeta: 'menu-del-panel',
        inicioSeg: 1821
      },
      {
        tarjeta: 'inicio-del-panel',
        inicioSeg: 1840
      },
      {
        tarjeta: 'posicion-del-menu',
        inicioSeg: 1851
      },
      {
        tarjeta: 'claro-u-oscuro',
        inicioSeg: 1862
      }
    ]
  }
];

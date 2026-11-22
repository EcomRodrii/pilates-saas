import AppIntents
import Foundation

/// Siri y Atajos: «¿cuándo es mi próxima clase?».
///
/// Lee lo mismo que el widget (`Compartido/ProximasClases.swift`, grupo de apps),
/// así que no pide red ni datos nuevos: responde al instante y también sin
/// conexión. Solo CONSULTA. Reservar o cancelar por voz no está: movería dinero
/// (bono, penalización) y necesita sesión, y un atajo no debe hacerlo sin que
/// la alumna lo vea en pantalla.
///
/// Los datos los refresca la app cada vez que se abre (`useWidgetProximasClases`);
/// si lleva días sin abrirse, Siri responde con lo último que guardó.

// MARK: - Texto de las respuestas (puro, sin AppIntents)

enum FraseClases {
    private static func formato(_ plantilla: String, _ locale: Locale) -> DateFormatter {
        let f = DateFormatter()
        f.locale = locale
        f.setLocalizedDateFormatFromTemplate(plantilla)
        return f
    }

    /// «hoy», «mañana» o «el viernes 27 de noviembre».
    static func dia(_ fecha: Date, ahora: Date, calendario: Calendar = .current, locale: Locale = Locale(identifier: "es_ES")) -> String {
        if calendario.isDate(fecha, inSameDayAs: ahora) { return "hoy" }
        if let manana = calendario.date(byAdding: .day, value: 1, to: ahora), calendario.isDate(fecha, inSameDayAs: manana) {
            return "mañana"
        }
        return "el " + formato("EEEEdMMMM", locale).string(from: fecha)
    }

    static func hora(_ fecha: Date, locale: Locale = Locale(identifier: "es_ES")) -> String {
        formato("Hm", locale).string(from: fecha)
    }

    /// Las clases que aún no han terminado, por orden de inicio.
    static func futuras(_ clases: [ClaseProxima], ahora: Date) -> [ClaseProxima] {
        clases.filter { $0.fin > ahora }.sorted { $0.inicio < $1.inicio }
    }

    static func descripcion(_ c: ClaseProxima, ahora: Date, calendario: Calendar = .current) -> String {
        var texto = "\(c.titulo) "
        if c.inicio <= ahora {
            texto += "que ya ha empezado"
        } else {
            texto += "\(dia(c.inicio, ahora: ahora, calendario: calendario)) a las \(hora(c.inicio))"
        }
        texto += " en \(c.estudio)"
        if let instructora = c.instructora, !instructora.isEmpty { texto += ", con \(instructora)" }
        return texto
    }

    static let sinClases = "No veo ninguna clase reservada. Abre la app para ver tu horario."

    static func proxima(_ clases: [ClaseProxima], ahora: Date = Date(), calendario: Calendar = .current) -> String {
        guard let primera = futuras(clases, ahora: ahora).first else { return sinClases }
        return "Tu próxima clase es \(descripcion(primera, ahora: ahora, calendario: calendario))."
    }

    static func varias(_ clases: [ClaseProxima], ahora: Date = Date(), calendario: Calendar = .current) -> String {
        let lista = futuras(clases, ahora: ahora)
        guard !lista.isEmpty else { return sinClases }
        if lista.count == 1 { return proxima(lista, ahora: ahora, calendario: calendario) }
        let lineas = lista.map { descripcion($0, ahora: ahora, calendario: calendario) }
        return "Tienes \(lista.count) clases reservadas: " + lineas.joined(separator: "; ") + "."
    }
}

// MARK: - Intents (iOS 16 o superior; la app sigue admitiendo iOS 15)

@available(iOS 16.0, *)
struct ProximaClaseIntent: AppIntent {
    static var title: LocalizedStringResource = "Mi próxima clase"
    static var description = IntentDescription("Te dice cuándo es tu próxima clase reservada.")
    static var openAppWhenRun: Bool = false

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let clases = ProximasClasesAlmacen.leer()?.clases ?? []
        let frase = FraseClases.proxima(clases)
        return .result(dialog: "\(frase)")
    }
}

@available(iOS 16.0, *)
struct MisProximasClasesIntent: AppIntent {
    static var title: LocalizedStringResource = "Mis próximas clases"
    static var description = IntentDescription("Te lee tus próximas clases reservadas.")
    static var openAppWhenRun: Bool = false

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let clases = ProximasClasesAlmacen.leer()?.clases ?? []
        let frase = FraseClases.varias(clases)
        return .result(dialog: "\(frase)")
    }
}

@available(iOS 16.0, *)
struct TentareAtajos: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: ProximaClaseIntent(),
            phrases: [
                "¿Cuándo es mi próxima clase en \(.applicationName)?",
                "Mi próxima clase en \(.applicationName)",
                "Próxima clase en \(.applicationName)"
            ],
            shortTitle: "Mi próxima clase",
            systemImageName: "calendar"
        )
        AppShortcut(
            intent: MisProximasClasesIntent(),
            phrases: [
                "¿Qué clases tengo en \(.applicationName)?",
                "Mis clases en \(.applicationName)"
            ],
            shortTitle: "Mis próximas clases",
            systemImageName: "list.bullet"
        )
    }
}

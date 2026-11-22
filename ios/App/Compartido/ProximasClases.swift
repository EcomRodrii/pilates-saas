import Foundation

/// Lo que la app y el widget comparten: las próximas clases de la alumna, tal
/// y como las guarda la app en el grupo de apps y las lee el widget.
///
/// Este fichero está en LOS DOS destinos (App y TentareWidget). Lo que se guarda
/// es lo mínimo para dibujar el widget: nombre de la clase, hora, estudio y,
/// si lo hay, instructora y sala. Nada de ids de alumna, correos ni pagos.
///
/// Lo escribe la web (`lib/nativo/widget-clases.ts`) vía `ProximaClasePlugin`;
/// el contrato (versión 1) lo fija ese fichero con sus pruebas.

/// Una clase reservada.
public struct ClaseProxima: Codable, Equatable, Identifiable {
    public let id: String
    public let titulo: String
    public let inicio: Date
    public let fin: Date
    public let estudio: String
    public let instructora: String?
    public let sala: String?
}

/// Lo guardado: hasta 3 clases ordenadas por inicio, y cuándo se guardó.
public struct ProximasClases: Codable, Equatable {
    public let version: Int
    public let actualizadoEn: Date
    public let clases: [ClaseProxima]
}

public enum ProximasClasesAlmacen {
    /// Versión del contrato con la web. Si cambia, el widget ignora lo viejo.
    public static let version = 1
    static let clave = "proximasClases.v1"
    /// Si lo guardado es más viejo que esto, el widget deja de enseñarlo: una
    /// clase de hace una semana en la pantalla de inicio sería peor que nada.
    static let caducidad: TimeInterval = 14 * 24 * 3600

    /// El grupo de apps (`group.<bundle id>`): lo escribe cada Info.plist con
    /// `TentareAppGroup`, para que la app de un estudio (otro bundle id) use el suyo.
    public static var grupo: String? {
        Bundle.main.object(forInfoDictionaryKey: "TentareAppGroup") as? String
    }

    private static var defaults: UserDefaults? {
        guard let grupo = grupo else { return nil }
        return UserDefaults(suiteName: grupo)
    }

    /// Fechas ISO 8601, con o sin fracción de segundo (lo que mande JS).
    static func decodificador() -> JSONDecoder {
        let d = JSONDecoder()
        let con = ISO8601DateFormatter()
        con.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let sin = ISO8601DateFormatter()
        sin.formatOptions = [.withInternetDateTime]
        d.dateDecodingStrategy = .custom { dec in
            let texto = try dec.singleValueContainer().decode(String.self)
            if let f = con.date(from: texto) ?? sin.date(from: texto) { return f }
            throw DecodingError.dataCorrupted(.init(codingPath: dec.codingPath, debugDescription: "Fecha no válida: \(texto)"))
        }
        return d
    }

    static func codificador() -> JSONEncoder {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .iso8601
        return e
    }

    /// Valida lo que manda la web y lo guarda. Devuelve `false` si no es válido.
    @discardableResult
    public static func guardar(json: String) -> Bool {
        guard let defaults = defaults,
              let datos = json.data(using: .utf8),
              let leido = try? decodificador().decode(ProximasClases.self, from: datos),
              leido.version == version
        else { return false }
        // Se vuelve a codificar nosotros: lo guardado siempre tiene la forma que lee el widget.
        guard let limpio = try? codificador().encode(leido) else { return false }
        defaults.set(limpio, forKey: clave)
        return true
    }

    public static func borrar() {
        defaults?.removeObject(forKey: clave)
    }

    /// Lo guardado, o `nil` si no hay nada, no es de esta versión o está caducado.
    public static func leer(ahora: Date = Date()) -> ProximasClases? {
        guard let defaults = defaults,
              let datos = defaults.data(forKey: clave),
              let leido = try? decodificador().decode(ProximasClases.self, from: datos),
              leido.version == version,
              ahora.timeIntervalSince(leido.actualizadoEn) < caducidad
        else { return nil }
        return leido
    }
}

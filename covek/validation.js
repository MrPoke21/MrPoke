// ============ VALIDATION & ERROR RECOVERY ============
// Input validáció és error recovery stratégiák

class ValidationService {
    // Shapefile input validáció
    static validateShapeFile(file) {
        const errors = [];

        // File létezik?
        if (!file) {
            errors.push('Nincs fájl kiválasztva');
            return { valid: false, errors };
        }

        // Fájl típus ellenőrzés - ZIP, .shp vagy .kml lehet
        const validExtensions = ['zip', 'shp', 'kml'];
        const fileExtension = file.name.split('.').pop().toLowerCase();
        
        if (!validExtensions.includes(fileExtension)) {
            errors.push(`Érvénytelen fájl típus: .${fileExtension}. Szükséges: .zip, .shp vagy .kml`);
        }

        // Fájl méret ellenőrzés (max 50 MB)
        const maxSize = 50 * 1024 * 1024; // 50 MB
        if (file.size > maxSize) {
            errors.push(`Fájl túl nagy: ${(file.size / 1024 / 1024).toFixed(2)} MB. Maximum: ${maxSize / 1024 / 1024}MB`);
        }

        // Minimum fájl méret (legalább 100 byte - csak az üres fájlok szűréséhez)
        if (file.size < 100) {
            errors.push('Fájl túl kicsi: valóban üres');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    // Koordináta érték validáció
    static validateCoordinate(value, coordType = 'any') {
        // Szám?
        if (typeof value !== 'number' || isNaN(value)) {
            return { valid: false, error: 'Koordináta nem szám' };
        }

        // Infinity vagy NaN?
        if (!isFinite(value)) {
            return { valid: false, error: 'Koordináta nem véges' };
        }

        // Típus-specifikus validáció
        if (coordType === 'latitude') {
            if (value < -90 || value > 90) {
                return { valid: false, error: `Szélességi fok tartomány: -90 és 90 között` };
            }
        } else if (coordType === 'longitude') {
            if (value < -180 || value > 180) {
                return { valid: false, error: `Hosszúsági fok tartomány: -180 és 180 között` };
            }
        } else if (coordType === 'eov') {
            // EOV Magyarország fölött kell lennie
            // Durva határok: 400000-900000 (X), 0-300000 (Y)
            if (value < -1000000 || value > 1000000) {
                return { valid: false, error: 'EOV érték valószínűleg hibás (túl nagy)' };
            }
        }

        return { valid: true };
    }

    // GeoJSON érvényesség
    static validateGeoJSON(data) {
        if (!data || typeof data !== 'object') {
            return { valid: false, error: 'GeoJSON nem objektum' };
        }

        if (!data.features || !Array.isArray(data.features)) {
            return { valid: false, error: 'GeoJSON nincs features tömb' };
        }

        if (data.features.length === 0) {
            return { valid: false, error: 'GeoJSON üres (0 feature)' };
        }

        return { valid: true };
    }
}

// Error recovery stratégiák
class ErrorRecovery {
    // Koordináta transform fallback
    static recoverCoordinateTransform(originalCoords, source, transformer) {
        Logger_Transform.warn('Transform hiba, fallback stratégia...', originalCoords);

        try {
            // Ha WGS84 volt és meghiúsult, próbáljunk egy biztos konverziót
            if (source === 'wgs84' && Array.isArray(originalCoords) && originalCoords.length >= 2) {
                // Dummy értékek - semmi transzformáció
                return {
                    lat: originalCoords[0],
                    lon: originalCoords[1],
                    fallback: true,
                    message: 'Fallback: eredeti koordináták'
                };
            }

            return {
                lat: null,
                lon: null,
                fallback: true,
                message: 'Fallback: konverzió sikertelen'
            };
        } catch (err) {
            Logger_Transform.error('Fallback transform is failed', err);
            return { lat: null, lon: null, fallback: true };
        }
    }

    // GeoJSON parsing fallback
    static recoverGeoJSONParsing(rawData) {
        Logger_Shapefile.warn('GeoJSON parsing meghiúsult, recovery...');

        try {
            // Ha string, próbáljuk JSON.parse
            if (typeof rawData === 'string') {
                try {
                    const parsed = JSON.parse(rawData);
                    if (parsed && parsed.features) {
                        return { data: parsed, recovered: true };
                    }
                } catch (parseErr) {
                    Logger_Shapefile.error('JSON parse fallback failed', parseErr);
                }
            }

            // Minimum valid GeoJSON struktúra
            return {
                data: {
                    type: 'FeatureCollection',
                    features: []
                },
                recovered: true,
                message: 'Üres GeoJSON szerkezet'
            };
        } catch (err) {
            Logger_Shapefile.error('GeoJSON recovery failed', err);
            return { data: null, recovered: false };
        }
    }

    // User-facing error message
    static getUserMessage(error) {
        if (!error) return 'Ismeretlen hiba';

        const errorMap = {
            'TypeError': 'Típus hiba - adatok formátum nem megfelelő',
            'RangeError': 'Tartomány hiba - érték túl nagy vagy kicsi',
            'SyntaxError': 'Szintaktikai hiba - adatok feldolgozása sikertelen',
            'NetworkError': 'Hálózati hiba - adatok letöltése sikertelen'
        };

        // Custom error message ha van
        if (error.message) {
            return error.message;
        }

        // Constructor név alapján
        if (error.constructor && errorMap[error.constructor.name]) {
            return errorMap[error.constructor.name];
        }

        return 'Valami hiba történt. Próbáld újra!';
    }
}

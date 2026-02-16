/**
 * ITRF20 → ETRS89 Coordinate Converter
 * User Interface and Interaction Handler
 */

// ============================================================================
// UI STATE AND INITIALIZATION
// ============================================================================

let lastTransformParams = null;
let lastInputEpoch = 2026.0;
let lastDetectedFormat = null;

// ============================================================================
// INPUT PARSING - FORMAT DETECTION
// ============================================================================

function parseCoordinateInput(inputStr) {
    if (!inputStr || inputStr.trim().length === 0) {
        throw new Error('Kérjük adja meg a koordináta értékeket!');
    }
    
    inputStr = inputStr.trim();
    
    // Try DMS format with degree/minute/second symbols (with N/S/E/W)
    const dmsRegex = /([\d.]+)°\s*([\d.]+)['′]\s*([\d.]+)["″]?\s+([NSEWnsew])\s+([\d.]+)°\s*([\d.]+)['′]\s*([\d.]+)["″]?\s+([NSEWnsew])\s+([\d.]+)?/i;
    const dmsMatch = inputStr.match(dmsRegex);
    if (dmsMatch) {
        return parseDmsFormat(dmsMatch);
    }
    
    // Try DMS format with degree/minute/second symbols (without N/S/E/W)
    const dmsBasicRegex = /([\d.]+)°\s*([\d.]+)['′]\s*([\d.]+)["″]?\s+([\d.]+)°\s*([\d.]+)['′]\s*([\d.]+)["″]?(?:\s+([\d.]+))?/;
    const dmsBasicMatch = inputStr.match(dmsBasicRegex);
    if (dmsBasicMatch) {
        return parseDmsBasicFormat(dmsBasicMatch);
    }
    
    // Try DMS format with words (N, S, E, W)
    const dmsWordRegex = /([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([NSEWnsew])\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([NSEWnsew])(?:\s+([\d.]+))?/i;
    const dmsWordMatch = inputStr.match(dmsWordRegex);
    if (dmsWordMatch) {
        return parseDmsWordFormat(dmsWordMatch);
    }
    
    // Try decimal degrees or Cartesian
    const numberMatch = inputStr.match(/([\d.+-]+)/g);
    if (!numberMatch || numberMatch.length < 3) {
        throw new Error('Nem értelmezhető formátum. Kérjük ellenőrizze az adatokat!');
    }
    
    const values = numberMatch.map(v => parseFloat(v));
    
    // Check if it's Cartesian (3 or 4 large numbers)
    if (values.length >= 3) {
        const allLarge = values.slice(0, 3).every(v => Math.abs(v) > 1000);
        if (allLarge) {
            return parseCartesianFormat(values);
        }
    }
    
    // Otherwise treat as decimal degrees
    return parseDecimalFormat(values);
}

function parseDmsFormat(match) {
    const lat = GeodesyLib.dmsToDecimal(
        parseFloat(match[1]),
        parseFloat(match[2]),
        parseFloat(match[3])
    );
    const latSign = match[4].toUpperCase() === 'S' ? -1 : 1;
    
    const lon = GeodesyLib.dmsToDecimal(
        parseFloat(match[5]),
        parseFloat(match[6]),
        parseFloat(match[7])
    );
    const lonSign = match[8].toUpperCase() === 'W' ? -1 : 1;
    
    const height = match[9] ? parseFloat(match[9]) : 0;
    
    lastDetectedFormat = 'DMS';
    return { lat: lat * latSign, lon: lon * lonSign, height, epoch: 2026.0 };
}

function parseDmsBasicFormat(match) {
    // Format: 46°38'56.33974" 20°12'3.56457" 130.560
    // Assumespositive latitude (N) and positive longitude (E)
    const lat = GeodesyLib.dmsToDecimal(
        parseFloat(match[1]),
        parseFloat(match[2]),
        parseFloat(match[3])
    );
    
    const lon = GeodesyLib.dmsToDecimal(
        parseFloat(match[4]),
        parseFloat(match[5]),
        parseFloat(match[6])
    );
    
    const height = match[7] ? parseFloat(match[7]) : 0;
    
    lastDetectedFormat = 'DMS (szimbólumokkal)';
    return { lat, lon, height, epoch: 2026.0 };
}

function parseDmsWordFormat(match) {
    const lat = GeodesyLib.dmsToDecimal(
        parseFloat(match[1]),
        parseFloat(match[2]),
        parseFloat(match[3])
    );
    const latSign = match[4].toUpperCase() === 'S' ? -1 : 1;
    
    const lon = GeodesyLib.dmsToDecimal(
        parseFloat(match[5]),
        parseFloat(match[6]),
        parseFloat(match[7])
    );
    const lonSign = match[8].toUpperCase() === 'W' ? -1 : 1;
    
    const height = match[9] ? parseFloat(match[9]) : 0;
    
    lastDetectedFormat = 'DMS (szavakkal)';
    return { lat: lat * latSign, lon: lon * lonSign, height, epoch: 2026.0 };
}

function parseDecimalFormat(values) {
    if (values.length < 3) {
        throw new Error('Tizedes fokozat formátumhoz legalább 3 érték szükséges (lat lon height)!');
    }
    
    const lat = values[0];
    const lon = values[1];
    const height = values[2] || 0;
    
    if (lat < -90 || lat > 90) {
        throw new Error('Szélesség -90° és +90° között kell legyen!');
    }
    if (lon < -180 || lon > 180) {
        throw new Error('Hosszúság -180° és +180° között kell legyen!');
    }
    
    lastDetectedFormat = 'Tizedes fokozat';
    return { lat, lon, height, epoch: 2026.0 };
}

function parseCartesianFormat(values) {
    if (values.length < 3) {
        throw new Error('Cartesian formátumhoz legalább 3 érték szükséges (X Y Z)!');
    }
    
    const x = values[0];
    const y = values[1];
    const z = values[2];
    const epoch = values[3] || 2026.0;
    
    // Convert Cartesian to geodetic
    const coords = GeodesyLib.cartesianToGeodetic(x, y, z, GeodesyLib.Ellipsoid.WGS84_GRS80);
    
    lastDetectedFormat = 'Cartesian (ITRF20)';
    return { lat: coords.lat, lon: coords.lon, height: coords.h, epoch };
}

// ============================================================================
// EXAMPLE DATA
// ============================================================================

function loadExampleCoords() {
    // Budapest Parliament example coordinates
    // Decimal: 47.5011611°N 19.0398778°E, Height: ~130.5 m
    document.getElementById('coordInput').value = '47.50116111 19.03982222 130.5';
}

// ============================================================================
// INPUT VALIDATION AND RETRIEVAL
// ============================================================================

function getInputCoordinates() {
    try {
        const inputStr = document.getElementById('coordInput').value;
        const coords = parseCoordinateInput(inputStr);
        
        // Validate ranges
        if (coords.lat < -90 || coords.lat > 90) {
            throw new Error('Szélesség -90° és +90° között kell legyen!');
        }
        if (coords.lon < -180 || coords.lon > 180) {
            throw new Error('Hosszúság -180° és +180° között kell legyen!');
        }
        if (isNaN(coords.height)) {
            coords.height = 0;
        }
        
        lastInputEpoch = coords.epoch;
        return coords;
        
    } catch (error) {
        showError(error.message);
        return null;
    }
}

// ============================================================================
// MAIN CONVERSION FUNCTION
// ============================================================================

function convertCoordinates() {
    try {
        // Get input
        const input = getInputCoordinates();
        if (!input) return;
        
        // Perform transformation
        const result = GeodesyLib.itrf20ToEtrs89(input.lat, input.lon, input.height, input.epoch);
        
        // Get transformation parameters for display
        lastTransformParams = GeodesyLib.getTransformationParams(input.epoch);
        
        // Calculate additional properties
        const utm = GeodesyLib.geodeticToUtm(result.lat, result.lon);
        const cartesian = GeodesyLib.geodeticToCartesian(result.lat, result.lon, result.height, GeodesyLib.Ellipsoid.ETRS89);
        const dmsLat = GeodesyLib.decimalToDms(result.lat);
        const dmsLon = GeodesyLib.decimalToDms(result.lon);
        
        // Calculate differences
        const latDiff = result.lat - input.lat;
        const lonDiff = result.lon - input.lon;
        const heightDiff = result.height - input.height;
        
        const planarDiffDeg = Math.sqrt(latDiff * latDiff + lonDiff * lonDiff);
        const planarDiffM = planarDiffDeg * 111320; // Approximate
        const dist3d = Math.sqrt(latDiff * latDiff + lonDiff * lonDiff + (heightDiff / 111320) * (heightDiff / 111320)) * 111320;
        
        // Update DMS results
        document.getElementById('resultLatDMS').textContent = GeodesyLib.formatDms(dmsLat, 'lat');
        document.getElementById('resultLonDMS').textContent = GeodesyLib.formatDms(dmsLon, 'lon');
        document.getElementById('resultHeightDMS').textContent = result.height.toFixed(4) + ' m';
        
        // Update decimal results
        document.getElementById('resultLatDec').textContent = result.lat.toFixed(10);
        document.getElementById('resultLonDec').textContent = result.lon.toFixed(10);
        document.getElementById('resultHeightDec').textContent = result.height.toFixed(4);
        
        // Update UTM results
        document.getElementById('resultZone').textContent = `${utm.zone}${utm.hemisphere}`;
        document.getElementById('resultEasting').textContent = utm.easting.toFixed(3);
        document.getElementById('resultNorthing').textContent = utm.northing.toFixed(3);
        document.getElementById('resultScaleFactor').textContent = (utm.scaleFactor * 1e6).toFixed(3);
        
        // Update Cartesian results
        document.getElementById('resultX').textContent = cartesian.X.toFixed(3);
        document.getElementById('resultY').textContent = cartesian.Y.toFixed(3);
        document.getElementById('resultZ').textContent = cartesian.Z.toFixed(3);
        
        // Update precision info
        document.getElementById('resultDiff').textContent =
            `ΔLat: ${(latDiff * 3600 * 10000).toFixed(6)} mas | ΔLon: ${(lonDiff * 3600 * 10000).toFixed(6)} mas | Δh: ${heightDiff.toFixed(4)} m`;
        
        document.getElementById('result3DDist').textContent =
            `${Math.sqrt(planarDiffM * planarDiffM + heightDiff * heightDiff).toFixed(4)}`;
        
        document.getElementById('resultEpoch').textContent = input.epoch.toFixed(1);
        
        // Update transformation parameters display
        updateTransformationParamsDisplay();
        
        // Show detected format
        if (lastDetectedFormat) {
            showSuccess(`Felismert formátum: ${lastDetectedFormat}`);
        }
        
        // Show results
        document.getElementById('resultsSection').style.display = 'block';
        
        // Scroll to results
        setTimeout(() => {
            document.getElementById('resultsSection').scrollIntoView({ behavior: 'smooth' });
        }, 100);
        
        showSuccess('Konverzió sikeresen elvégezve!');
        
    } catch (error) {
        showError('Hiba a konverzió során: ' + error.message);
    }
}

// ============================================================================
// DISPLAY AND FORMATTING
// ============================================================================

function updateTransformationParamsDisplay() {
    if (!lastTransformParams) return;
    
    // Convert from radians to milliarcseconds and meters
    const tx = lastTransformParams.tx * 1000;  // to mm
    const ty = lastTransformParams.ty * 1000;
    const tz = lastTransformParams.tz * 1000;
    
    const rx = lastTransformParams.rx * 180 / Math.PI * 3600 * 1000;  // to mas
    const ry = lastTransformParams.ry * 180 / Math.PI * 3600 * 1000;
    const rz = lastTransformParams.rz * 180 / Math.PI * 3600 * 1000;
    
    const scale = lastTransformParams.scale;
    
    document.getElementById('txValue').textContent = tx.toFixed(4);
    document.getElementById('tyValue').textContent = ty.toFixed(4);
    document.getElementById('tzValue').textContent = tz.toFixed(4);
    
    document.getElementById('rxValue').textContent = rx.toFixed(6);
    document.getElementById('ryValue').textContent = ry.toFixed(6);
    document.getElementById('rzValue').textContent = rz.toFixed(6);
    
    document.getElementById('scaleValue').textContent = (scale * 1e6).toFixed(3);
}

function copyToClipboard(format) {
    let text = '';
    
    try {
        if (format === 'dms') {
            text = `${document.getElementById('resultLatDMS').textContent}\n`;
            text += `${document.getElementById('resultLonDMS').textContent}\n`;
            text += `Magasság: ${document.getElementById('resultHeightDMS').textContent}`;
            
        } else if (format === 'decimal') {
            text = `φ = ${document.getElementById('resultLatDec').textContent}°\n`;
            text += `λ = ${document.getElementById('resultLonDec').textContent}°\n`;
            text += `h = ${document.getElementById('resultHeightDec').textContent} m`;
            
        } else if (format === 'utm') {
            text = `Zóna: ${document.getElementById('resultZone').textContent}\n`;
            text += `Easting: ${document.getElementById('resultEasting').textContent} m\n`;
            text += `Northing: ${document.getElementById('resultNorthing').textContent} m`;
            
        } else if (format === 'cartesian') {
            text = `X = ${document.getElementById('resultX').textContent} m\n`;
            text += `Y = ${document.getElementById('resultY').textContent} m\n`;
            text += `Z = ${document.getElementById('resultZ').textContent} m`;
        }
        
        navigator.clipboard.writeText(text).then(() => {
            showSuccess('Sikeresen másolva!');
        }).catch(err => {
            showError('Hiba a másolás során!');
        });
    } catch (error) {
        showError('Másolási hiba: ' + error.message);
    }
}

function clearFields() {
    document.getElementById('coordInput').value = '';
    document.getElementById('resultsSection').style.display = 'none';
    lastDetectedFormat = null;
}

// ============================================================================
// MESSAGE DISPLAY
// ============================================================================

function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = '⚠️ ' + message;
    
    const mainElement = document.querySelector('main');
    mainElement.insertBefore(errorDiv, mainElement.firstChild);
    
    setTimeout(() => {
        errorDiv.remove();
    }, 6000);
}

function showSuccess(message) {
    const successDiv = document.createElement('div');
    successDiv.className = 'success-message';
    successDiv.textContent = '✓ ' + message;
    
    const mainElement = document.querySelector('main');
    mainElement.insertBefore(successDiv, mainElement.firstChild);
    
    setTimeout(() => {
        successDiv.remove();
    }, 4000);
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================

document.addEventListener('DOMContentLoaded', function() {
    // Allow Ctrl+Enter to convert
    document.getElementById('coordInput').addEventListener('keypress', function(event) {
        if (event.key === 'Enter' && event.ctrlKey) {
            convertCoordinates();
        }
    });
    
    // Initialize transformation params display
    const params = GeodesyLib.getTransformationParams(2026.0);
    lastTransformParams = params;
    updateTransformationParamsDisplay();
});

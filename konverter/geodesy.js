/**
 * ITRF20 to ETRS89 Precise Coordinate Conversion Library
 * Based on EUREF/IERS standards and recommendations
 * 
 * References:
 * - IERS Technical Note No. 36 (2015)
 * - EUREF Technical Working Group Recommendations
 * - Altamimi et al., 2016 (ITRF2014 transformation parameters)
 */

// ============================================================================
// ELLIPSOID PARAMETERS (WGS84 / GRS80)
// ============================================================================

const Ellipsoid = {
    WGS84_GRS80: {
        name: 'WGS84 / GRS80',
        a: 6378137.0,              // Semi-major axis (meters) - exact
        f: 1.0 / 298.257223563,    // Flattening
        // Calculated parameters
        b: null,                   // Semi-minor axis
        e2: null,                  // First eccentricity squared
        ep2: null,                 // Second eccentricity squared
        n: null                    // Third flattening
    },
    
    ETRS89: {
        name: 'ETRS89 (GRS80)',
        a: 6378137.0,              // Semi-major axis (exact, same as WGS84)
        f: 1.0 / 298.257222101,    // Flattening (slightly different)
        // Calculated parameters
        b: null,
        e2: null,
        ep2: null,
        n: null
    }
};

// Calculate derived ellipsoid parameters
function initializeEllipsoid(ellipsoid) {
    const a = ellipsoid.a;
    const f = ellipsoid.f;
    
    ellipsoid.b = a * (1 - f);                           // Semi-minor axis
    ellipsoid.e2 = 2 * f - f * f;                        // First eccentricity squared
    ellipsoid.ep2 = f * (2 - f) / ((1 - f) * (1 - f));  // Second eccentricity squared
    ellipsoid.n = f / (2 - f);                           // Third flattening
    
    return ellipsoid;
}

// Initialize all ellipsoids
initializeEllipsoid(Ellipsoid.WGS84_GRS80);
initializeEllipsoid(Ellipsoid.ETRS89);

// ============================================================================
// TRANSFORMATION PARAMETERS (ITRF20 → ETRS89)
// ============================================================================
// Based on Altamimi et al. (2016) and EUREF recommendations
// Reference Epoch: 2000.0, Extrapolated to 2026.0

const TransformationParams = {
    // Reference epoch parameters (2000.0)
    epoch0: 2000.0,
    
    // Translation parameters at epoch 2000.0 (meters)
    tx0: 0.0031,
    ty0: -0.1019,
    tz0: 0.1301,
    
    // Rotation parameters at epoch 2000.0 (milliarcseconds)
    rx0: 0.0,
    ry0: 0.0,
    rz0: -4.78e-3,  // -4.78 milliarcseconds
    
    // Scale parameter at epoch 2000.0 (ppm)
    scale0: 0.0,
    
    // Velocity (rate of change per year)
    tx_rate: 0.0001,    // mm/year
    ty_rate: -0.0070,   // mm/year
    tz_rate: 0.0096,    // mm/year
    
    rx_rate: 0.0,       // mas/year
    ry_rate: 0.0,       // mas/year
    rz_rate: -2.2e-3,   // mas/year (-0.0022 mas/year)
    
    scale_rate: 0.0,    // ppm/year
};

// Calculate transformation parameters for a given epoch
function getTransformationParams(epoch) {
    const dt = epoch - TransformationParams.epoch0;
    
    return {
        tx: (TransformationParams.tx0 + TransformationParams.tx_rate * dt) / 1000.0,    // Convert mm to m
        ty: (TransformationParams.ty0 + TransformationParams.ty_rate * dt) / 1000.0,
        tz: (TransformationParams.tz0 + TransformationParams.tz_rate * dt) / 1000.0,
        
        rx: (TransformationParams.rx0 + TransformationParams.rx_rate * dt) / 1000.0 * (Math.PI / (180 * 3600)),  // Convert mas to rad
        ry: (TransformationParams.ry0 + TransformationParams.ry_rate * dt) / 1000.0 * (Math.PI / (180 * 3600)),
        rz: (TransformationParams.rz0 + TransformationParams.rz_rate * dt) / 1000.0 * (Math.PI / (180 * 3600)),
        
        scale: TransformationParams.scale0 + TransformationParams.scale_rate * dt,
    };
}

// ============================================================================
// BASIC MATHEMATICAL FUNCTIONS
// ============================================================================

/**
 * Convert degrees, minutes, seconds to decimal degrees
 */
function dmsToDecimal(deg, min, sec) {
    const sign = (deg < 0 || min < 0 || sec < 0) ? -1 : 1;
    return sign * (Math.abs(deg) + Math.abs(min) / 60.0 + Math.abs(sec) / 3600.0);
}

/**
 * Convert decimal degrees to degrees, minutes, seconds
 */
function decimalToDms(decimal) {
    const isNegative = decimal < 0;
    decimal = Math.abs(decimal);
    
    const degrees = Math.floor(decimal);
    const minutesDecimal = (decimal - degrees) * 60;
    const minutes = Math.floor(minutesDecimal);
    const seconds = (minutesDecimal - minutes) * 60;
    
    return {
        deg: isNegative ? -degrees : degrees,
        min: minutes,
        sec: parseFloat(seconds.toFixed(4))
    };
}

/**
 * Format DMS for display
 */
function formatDms(dms, type) {
    const absDir = Math.abs(dms.deg);
    const direction = (type === 'lat') ?
        (dms.deg >= 0 ? 'N' : 'S') :
        (dms.deg >= 0 ? 'E' : 'W');
    
    return `${absDir}° ${dms.min}' ${dms.sec.toFixed(4)}" ${direction}`;
}

// ============================================================================
// COORDINATE TRANSFORMATIONS: GEODETIC ↔ CARTESIAN
// ============================================================================

/**
 * Convert geodetic coordinates to Cartesian (X, Y, Z)
 * @param {number} lat - Latitude in degrees
 * @param {number} lon - Longitude in degrees
 * @param {number} h - Height above ellipsoid (meters)
 * @param {object} ellipsoid - Ellipsoid parameters
 * @returns {object} {X, Y, Z} in meters
 */
function geodeticToCartesian(lat, lon, h, ellipsoid) {
    const latRad = lat * Math.PI / 180;
    const lonRad = lon * Math.PI / 180;
    
    const sinLat = Math.sin(latRad);
    const cosLat = Math.cos(latRad);
    const sinLon = Math.sin(lonRad);
    const cosLon = Math.cos(lonRad);
    
    // Radius of curvature in prime vertical (N)
    const N = ellipsoid.a / Math.sqrt(1 - ellipsoid.e2 * sinLat * sinLat);
    
    const X = (N + h) * cosLat * cosLon;
    const Y = (N + h) * cosLat * sinLon;
    const Z = (N * (1 - ellipsoid.e2) + h) * sinLat;
    
    return { X, Y, Z };
}

/**
 * Convert Cartesian coordinates to geodetic (lat, lon, h)
 * Using iterative method (Helix method)
 * @param {number} X - Cartesian X coordinate
 * @param {number} Y - Cartesian Y coordinate
 * @param {number} Z - Cartesian Z coordinate
 * @param {object} ellipsoid - Ellipsoid parameters
 * @returns {object} {lat, lon, h} where lat/lon are in degrees
 */
function cartesianToGeodetic(X, Y, Z, ellipsoid) {
    const a = ellipsoid.a;
    const b = ellipsoid.b;
    const e2 = ellipsoid.e2;
    const ep2 = ellipsoid.ep2;
    
    const p = Math.sqrt(X * X + Y * Y);
    const theta = Math.atan2(Z * a, p * b);
    
    const sinTheta = Math.sin(theta);
    const cosTheta = Math.cos(theta);
    
    // Initial latitude approximation
    let lat = Math.atan2(Z + ep2 * b * sinTheta * sinTheta * sinTheta,
                         p - e2 * a * cosTheta * cosTheta * cosTheta);
    
    // Iterative refinement (typically converges in 2-3 iterations)
    for (let i = 0; i < 5; i++) {
        const sinLat = Math.sin(lat);
        const N = a / Math.sqrt(1 - e2 * sinLat * sinLat);
        const latNew = Math.atan2(Z + e2 * N * sinLat, p);
        
        // Check for convergence
        if (Math.abs(latNew - lat) < 1e-12) {
            lat = latNew;
            break;
        }
        lat = latNew;
    }
    
    const sinLat = Math.sin(lat);
    const N = a / Math.sqrt(1 - e2 * sinLat * sinLat);
    const h = p / Math.cos(lat) - N;
    
    const lon = Math.atan2(Y, X);
    
    return {
        lat: lat * 180 / Math.PI,
        lon: lon * 180 / Math.PI,
        h: h,
        height: h  // Alias for consistency
    };
}

// ============================================================================
// BURSA-WOLF TRANSFORMATION (7 PARAMETERS)
// ============================================================================

/**
 * Apply 7-parameter Bursa-Wolf transformation
 * Converts ITRF to ETRS89 reference frame
 * @param {number} X - Input X coordinate
 * @param {number} Y - Input Y coordinate
 * @param {number} Z - Input Z coordinate
 * @param {object} params - Transformation parameters
 * @returns {object} {X, Y, Z} - Transformed coordinates
 */
function applyBursaWolfTransform(X, Y, Z, params) {
    const scale = 1 + params.scale / 1e6;
    
    // Rotation matrix elements (small angle approximation)
    const rx = params.rx;
    const ry = params.ry;
    const rz = params.rz;
    
    // Transformation equations
    // [X'] = [1    -rz   ry ] [X]   [tx]
    // [Y'] = [rz    1   -rx ] [Y] + [ty]  * scale
    // [Z'] = [-ry  rx    1 ] [Z]   [tz]
    
    const dX = params.tx - rz * Y + ry * Z;
    const dY = rz * X + params.ty - rx * Z;
    const dZ = -ry * X + rx * Y + params.tz;
    
    const Xt = scale * X + dX;
    const Yt = scale * Y + dY;
    const Zt = scale * Z + dZ;
    
    return { X: Xt, Y: Yt, Z: Zt };
}

// ============================================================================
// ITRF20 → ETRS89 CONVERSION
// ============================================================================

/**
 * Main conversion function: ITRF20 → ETRS89
 * @param {number} lat - Latitude in degrees (ITRF20)
 * @param {number} lon - Longitude in degrees (ITRF20)
 * @param {number} h - Height above ellipsoid (ITRF20)
 * @param {number} epoch - Epoch (default: 2026.0)
 * @returns {object} {lat, lon, h} in ETRS89
 */
function itrf20ToEtrs89(lat, lon, h, epoch = 2026.0) {
    // Step 1: Convert geodetic to Cartesian in ITRF20
    const cartItrf = geodeticToCartesian(lat, lon, h, Ellipsoid.WGS84_GRS80);
    
    // Step 2: Get transformation parameters for the given epoch
    const transformParams = getTransformationParams(epoch);
    
    // Step 3: Apply Bursa-Wolf transformation
    const cartEtrs = applyBursaWolfTransform(
        cartItrf.X,
        cartItrf.Y,
        cartItrf.Z,
        transformParams
    );
    
    // Step 4: Convert back to geodetic in ETRS89
    const result = cartesianToGeodetic(
        cartEtrs.X,
        cartEtrs.Y,
        cartEtrs.Z,
        Ellipsoid.ETRS89
    );
    
    return result;
}

/**
 * Reverse conversion: ETRS89 → ITRF20 (if needed)
 */
function etrs89ToItrf20(lat, lon, h, epoch = 2026.0) {
    const cartEtrs = geodeticToCartesian(lat, lon, h, Ellipsoid.ETRS89);
    
    const transformParams = getTransformationParams(epoch);
    
    // Inverse transformation (negate all parameters)
    const inverseParams = {
        tx: -transformParams.tx,
        ty: -transformParams.ty,
        tz: -transformParams.tz,
        rx: -transformParams.rx,
        ry: -transformParams.ry,
        rz: -transformParams.rz,
        scale: -transformParams.scale
    };
    
    const cartItrf = applyBursaWolfTransform(
        cartEtrs.X,
        cartEtrs.Y,
        cartEtrs.Z,
        inverseParams
    );
    
    return cartesianToGeodetic(
        cartItrf.X,
        cartItrf.Y,
        cartItrf.Z,
        Ellipsoid.WGS84_GRS80
    );
}

// ============================================================================
// UTM PROJECTION (Universal Transverse Mercator)
// ============================================================================

/**
 * Convert geodetic coordinates to UTM
 * @param {number} lat - Latitude in degrees
 * @param {number} lon - Longitude in degrees
 * @param {object} ellipsoid - Ellipsoid parameters
 * @returns {object} {zone, easting, northing, hemisphere, convergence, scale}
 */
function geodeticToUtm(lat, lon, ellipsoid = Ellipsoid.ETRS89) {
    // Calculate UTM zone
    const zone = Math.floor((lon + 180) / 6) + 1;
    
    // Central meridian of the zone
    const lon0 = (zone - 1) * 6 - 180 + 3;
    
    const latRad = lat * Math.PI / 180;
    const lonRad = lon * Math.PI / 180;
    const lon0Rad = lon0 * Math.PI / 180;
    
    const k0 = 0.9996; // UTM scale factor
    const a = ellipsoid.a;
    const e2 = ellipsoid.e2;
    const ep2 = ellipsoid.ep2;
    
    const sinLat = Math.sin(latRad);
    const cosLat = Math.cos(latRad);
    const tanLat = Math.tan(latRad);
    
    const N = a / Math.sqrt(1 - e2 * sinLat * sinLat);
    const T = tanLat * tanLat;
    const C = ep2 * cosLat * cosLat;
    const A = cosLat * ((lonRad - lon0Rad) % (2 * Math.PI));
    
    // Calculate M (meridional arc)
    const n = (a - (a * (1 - e2) / Math.sqrt(1 - e2 * sinLat * sinLat))) /
              (a + a * (1 - e2) / Math.sqrt(1 - e2 * sinLat * sinLat));
    
    const n2 = n * n;
    const n3 = n2 * n;
    const n4 = n3 * n;
    const n5 = n4 * n;
    
    const M = a * (
        (1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 * e2 * e2 / 256) * latRad -
        (3 * e2 / 8 + 3 * e2 * e2 / 32 - 45 * e2 * e2 * e2 / 1024) * Math.sin(2 * latRad) +
        (15 * e2 * e2 / 256 - 45 * e2 * e2 * e2 / 1024) * Math.sin(4 * latRad) -
        (35 * e2 * e2 * e2 / 3072) * Math.sin(6 * latRad)
    );
    
    // Accurate UTM equations
    const easting = k0 * N * (A + A * A * A / 6 * (1 - T + C) +
        A * A * A * A * A / 120 * (5 - 18 * T + T * T + 72 * C - 58 * ep2));
    
    const northing = k0 * (M + N * tanLat * (
        A * A / 2 + A * A * A * A / 24 * (5 - T + 9 * C + 4 * C * C) +
        A * A * A * A * A * A / 720 * (61 - 58 * T + T * T + 600 * C - 330 * ep2)
    ));
    
    // False easting and northing
    const falseEasting = 500000;
    const falseNorthing = lat < 0 ? 10000000 : 0;
    
    // Grid convergence
    const convergence = Math.atan(tanLat * Math.sin((lonRad - lon0Rad))) * 180 / Math.PI;
    
    // Scale factor
    const scaleFactor = k0 * (1 + C * A * A / 2 + C * C * A * A * A * A / 24);
    
    return {
        zone: zone,
        easting: easting + falseEasting,
        northing: northing + falseNorthing,
        hemisphere: lat >= 0 ? 'N' : 'S',
        convergence: convergence,
        scaleFactor: scaleFactor
    };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Calculate the 3D distance between two coordinate sets
 */
function calculate3dDistance(lat1, lon1, h1, lat2, lon2, h2) {
    const cart1 = geodeticToCartesian(lat1, lon1, h1, Ellipsoid.ITRF20_GRS80);
    const cart2 = geodeticToCartesian(lat2, lon2, h2, Ellipsoid.ETRS89);
    
    const dx = cart2.X - cart1.X;
    const dy = cart2.Y - cart1.Y;
    const dz = cart2.Z - cart1.Z;
    
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Calculate planar distance between two points (in meters)
 */
function calculatePlanarDistance(lat1, lon1, lat2, lon2) {
    const lat1Rad = lat1 * Math.PI / 180;
    const lat2Rad = lat2 * Math.PI / 180;
    const dlat = (lat2 - lat1) * Math.PI / 180;
    const dlon = (lon2 - lon1) * Math.PI / 180;
    
    const a = Math.sin(dlat / 2) * Math.sin(dlat / 2) +
              Math.cos(lat1Rad) * Math.cos(lat2Rad) *
              Math.sin(dlon / 2) * Math.sin(dlon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    
    const R = 6371000; // Earth's mean radius in meters
    return R * c;
}

// Export functions
const GeodesyLib = {
    // Ellipsoids
    Ellipsoid,
    initializeEllipsoid,
    
    // DMS Conversion
    dmsToDecimal,
    decimalToDms,
    formatDms,
    
    // Coordinate transformations
    geodeticToCartesian,
    cartesianToGeodetic,
    
    // Transformations
    getTransformationParams,
    applyBursaWolfTransform,
    itrf20ToEtrs89,
    etrs89ToItrf20,
    
    // Projections
    geodeticToUtm,
    
    // Utilities
    calculate3dDistance,
    calculatePlanarDistance
};

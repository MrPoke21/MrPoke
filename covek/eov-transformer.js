/**
 * Cövek Library - EOV ↔ ETRF2000 Coordinate Transformation
 * 
 * Standalone JavaScript library for converting between Hungarian EOV and ETRF2000/WGS84 coordinates.
 * Uses Proj4.js for projection mathematics and HD72 grid correction via nadgrid.
 * 
 * @version 4.0
 * @author Cövek Project
 * @license MIT
 * 
 * Dependencies:
 *   - proj4: https://unpkg.com/proj4@2.12.0/dist/proj4.js (minimum 2.12.0 for nadgrid support)
 *   - GeoTIFF (optional): https://cdn.jsdelivr.net/npm/geotiff@2.1.3/dist-browser/geotiff.js
 *
 * Supported EPSG Codes:
 *   - EPSG:23700 (HD72/EOV + Helmert fallback) - Custom definition with nadgrid support
 *   - EPSG:23700_HELMERT (Helmert 7-parameter fallback) - For grid unavailability
 */

class EOVTransformer {
  constructor() {
    this.GRID_NAME = 'etrs2eov_notowgs.gsb';
    this.gridLoaded = false;
    this.proj4Ready = false;
    this.gridData = null;

    this.initProj4();
  }

  /**
   * Initialize Proj4 definitions
   */
  initProj4() {
    if (typeof proj4 === 'undefined') {
      throw new Error('Proj4.js library not loaded. Include: <script src="https://cdn.jsdelivr.net/npm/proj4@2.20.0/dist/proj4.js"></script>');
    }

    // ETRF2000 (European Terrestrial Reference Frame 2000)
    proj4.defs('ETRF2000', '+proj=longlat +ellps=GRS80 +no_defs');

    // ITRF2014 (International Terrestrial Reference Frame 2014)
    proj4.defs('ITRF2014',
      '+proj=longlat +ellps=GRS80' +
      ' +towgs84=0.0009,-0.0014,-0.0003,0.002114,-0.012789,0.020671,0.00034' +
      ' +no_defs'
    );

    // EPSG:23700 (Hungarian Unified National Projection with ETRS2EOV nadgrid)
    // Grid is optional - proj4 will use Helmert fallback if grid is not found
    proj4.defs('EPSG:23700',
      '+proj=somerc +lat_0=47.14439372222222 +lon_0=19.04857177777778' +
      ' +k_0=0.99993 +x_0=650000 +y_0=200000 +ellps=GRS67' +
      ` +nadgrids=@${this.GRID_NAME} +units=m +no_defs` +
      ' +type=crs'
    );

    // Fallback EPSG:23700 without nadgrids (Helmert transformation)
    proj4.defs('EPSG:23700_HELMERT',
      '+proj=somerc +lat_0=47.14439372222222 +lon_0=19.04857177777778' +
      ' +k_0=0.99993 +x_0=650000 +y_0=200000 +ellps=GRS67' +
      ' +towgs84=52.17,-71.82,-14.9,0,0,0,0' +
      ' +units=m +no_defs'
    );

    this.proj4Ready = true;
  }

  /**
   * Check if grid file is available and accessible
   * Load NADgrid (.gsb) file and register it with proj4.nadgrid
   * @param {string} [gridPath='etrs2eov_notowgs.gsb'] - Path to grid file
   * @returns {Promise<boolean>} - True if grid file is loaded successfully
   */
  async loadGridFromWeb(gridPath = 'etrs2eov_notowgs.gsb') {
    try {
      // Fetch the GeoTIFF file as ArrayBuffer
      const response = await fetch(gridPath);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      
      // Register grid with proj4 using ArrayBuffer
      await proj4.nadgrid(gridPath, arrayBuffer).ready;
      
      this.gridLoaded = true;
      return true;
    } catch (err) {
      // File not accessible or grid registration failed
    }
    
    this.gridLoaded = false;
    return false;
  }

  /**
   * Get grid status
   * @returns {Object} - Status info
   */
  getGridStatus() {
    return {
      loaded: this.gridLoaded,
      accuracy: this.gridLoaded ? '±10-50 mm (ETRS2EOV)' : '±200-500 cm (Helmert)',
      source: this.gridLoaded ? 'ETRS2EOV nadgrid (etrs2eov_notowgs.gsb)' : 'Helmert 7-parameter transformation'
    };
  }



  getGridStatus() {
    return {
      loaded: this.gridLoaded,
      accuracy: this.gridLoaded ? '±10-50 mm (ETRS2EOV)' : '±200-500 cm (Helmert)',
      source: this.gridLoaded ? 'ETRS2EOV nadgrid (etrs2eov_notowgs.gsb)' : 'Helmert 7-parameter transformation'
    };
  }

  /**
   * Convert EOV coordinates to ETRF2000 (WGS84)
   * @param {number} eovY - EOV Y (Easting) in meters
   * @param {number} eovX - EOV X (Northing) in meters
   * @returns {Object} - {lat, lon, accuracy}
   */
  eov2etrf2000(eovY, eovX) {
    if (!this.proj4Ready) {
      throw new Error('Proj4.js not initialized');
    }

    try {
      const targetProj = this.gridLoaded ? 'ETRF2000' : 'ETRF2000';
      const sourceProj = this.gridLoaded ? 'EPSG:23700' : 'EPSG:23700_HELMERT';

      const [lon, lat] = proj4(sourceProj, targetProj).forward([eovY, eovX]);

      return {
        lat: lat,
        lon: lon,
        accuracy: this.gridLoaded ? '±10-50 mm' : '±200-500 cm',
        gridUsed: this.gridLoaded
      };
    } catch (err) {
      throw new Error(`EOV to ETRF2000 conversion failed: ${err.message}`);
    }
  }

  /**
   * Convert ETRF2000 (WGS84) coordinates to EOV
   * @param {number} lat - Latitude in degrees
   * @param {number} lon - Longitude in degrees
   * @returns {Object} - {y, x, accuracy}
   */
  etrf2000_2eov(lat, lon) {
    if (!this.proj4Ready) {
      throw new Error('Proj4.js not initialized');
    }

    try {
      const sourceProj = this.gridLoaded ? 'ETRF2000' : 'ETRF2000';
      const targetProj = this.gridLoaded ? 'EPSG:23700' : 'EPSG:23700_HELMERT';

      const [eovY, eovX] = proj4(sourceProj, targetProj).forward([lon, lat]);

      return {
        y: eovY,
        x: eovX,
        accuracy: this.gridLoaded ? '±10-50 mm' : '±200-500 cm',
        gridUsed: this.gridLoaded
      };
    } catch (err) {
      throw new Error(`ETRF2000 to EOV conversion failed: ${err.message}`);
    }
  }

  /**
   * Convert WGS84 coordinates to EOV
   * @param {number} lat - Latitude in degrees
   * @param {number} lon - Longitude in degrees
   * @returns {Object} - {y, x, accuracy}
   */
  wgs84_2eov(lat, lon) {
    if (!this.proj4Ready) {
      throw new Error('Proj4.js not initialized');
    }

    try {
      const sourceProj = 'ITRF2014';
      const targetProj = this.gridLoaded ? 'EPSG:23700' : 'EPSG:23700_HELMERT';

      const [eovY, eovX] = proj4(sourceProj, targetProj).forward([lon, lat]);

      return {
        y: eovY,
        x: eovX,
        accuracy: this.gridLoaded ? '±10-50 mm' : '±200-500 cm',
        gridUsed: this.gridLoaded
      };
    } catch (err) {
      throw new Error(`WGS84 to EOV conversion failed: ${err.message}`);
    }
  }

  /**
   * Convert ETRF2000 coordinates to WGS84
   * @param {number} lat - Latitude in degrees (ETRF2000)
   * @param {number} lon - Longitude in degrees (ETRF2000)
   * @returns {Object} - {lat, lon}
   */
  etrf2000_2wgs84(lat, lon) {
    if (!this.proj4Ready) {
      throw new Error('Proj4.js not initialized');
    }

    try {
      const [wgs84Lon, wgs84Lat] = proj4('ETRF2000', 'ITRF2014').forward([lon, lat]);

      return {
        lat: wgs84Lat,
        lon: wgs84Lon
      };
    } catch (err) {
      throw new Error(`ETRF2000 to WGS84 conversion failed: ${err.message}`);
    }
  }

  /**
   * Convert WGS84 coordinates to ETRF2000
   * @param {number} lat - Latitude in degrees (WGS84)
   * @param {number} lon - Longitude in degrees (WGS84)
   * @returns {Object} - {lat, lon}
   */
  wgs84_2etrf2000(lat, lon) {
    if (!this.proj4Ready) {
      throw new Error('Proj4.js not initialized');
    }

    try {
      const [etrf2000Lon, etrf2000Lat] = proj4('ITRF2014', 'ETRF2000').forward([lon, lat]);

      return {
        lat: etrf2000Lat,
        lon: etrf2000Lon
      };
    } catch (err) {
      throw new Error(`WGS84 to ETRF2000 conversion failed: ${err.message}`);
    }
  }

  /**
   * Haversine distance between two geographic points
   * @param {number} lat1 - Latitude 1
   * @param {number} lon1 - Longitude 1
   * @param {number} lat2 - Latitude 2
   * @param {number} lon2 - Longitude 2
   * @returns {number} - Distance in meters
   */
  haversine(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Earth radius in meters
    const dφ = (lat2 - lat1) * Math.PI / 180;
    const dλ = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dφ / 2) ** 2 +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dλ / 2) ** 2;
    return R * 2 * Math.asin(Math.sqrt(a));
  }


  /**
   * Test conversion: ETRF2000 → EOV
   * Measures difference between calculated and expected result
   */
  testConversion() {
    const lat = 46.940890424;  // ETRF2000 latitude
    const lon = 19.234320340;  // ETRF2000 longitude
    
    const expectedY = 664226.871;  // Expected EOV Y
    const expectedX = 177424.263;  // Expected EOV X
    
    try {
      const result = this.etrf2000_2eov(lat, lon);
      
      const diffY = Math.abs(result.y - expectedY);
      const diffX = Math.abs(result.x - expectedX);
      const distDiff = Math.sqrt(diffY * diffY + diffX * diffX);
      
      return {
        calculated: { y: result.y, x: result.x },
        expected: { y: expectedY, x: expectedX },
        diff: { y: diffY, x: diffX },
        distance: distDiff,
        gridUsed: result.gridUsed
      };
    } catch (err) {
      return null;
    }
  }

}

// ============ KOORDINÁTA TRANSZFORMÁCIÓS FÜGGVÉNYEK ============

function convertFromSourceCoordinates(x, y) {
    if (!AppState.transformer) return;
    
    let etrf2000Lat, etrf2000Lon;
    let source;
    
    // Ha x és y null, akkor térkép középpontjából (screenCenter)
    if (x === null && y === null) {
        source = 'screenCenter';
    } else {
        // A gpsSource selectből olvassuk ki a forrást
        const gpsSourceElement = document.getElementById('gpsSource');
        source = gpsSourceElement ? gpsSourceElement.value : CONSTANTS.COORD_SYSTEMS.WGS84;
        
        // gpsSource értékek mapping
        if (source === CONSTANTS.COORD_SYSTEMS.RTK) {
            source = CONSTANTS.COORD_SYSTEMS.ETRF2000; // RTK → ETRF2000
        }
    }
    
    try {
        switch(source) {
            case CONSTANTS.COORD_SYSTEMS.WGS84:
                // WGS84 (lat, lon) → ETRF2000
                const etrf2000_from_wgs84 = AppState.transformer.wgs84_2etrf2000(x, y);
                etrf2000Lat = etrf2000_from_wgs84.lat;
                etrf2000Lon = etrf2000_from_wgs84.lon;
                break;
                
            case CONSTANTS.COORD_SYSTEMS.ETRF2000:
                // ETRF2000 már a megfelelő formátumban van
                etrf2000Lat = x;
                etrf2000Lon = y;
                break;
                
            case CONSTANTS.COORD_SYSTEMS.EOV:
                // EOV (x=easting, y=northing) → ETRF2000
                const etrf2000_from_eov = AppState.transformer.eov2etrf2000(y, x); // y=lon-like, x=lat-like
                etrf2000Lat = etrf2000_from_eov.lat;
                etrf2000Lon = etrf2000_from_eov.lon;
                AppState.currentEOVY = y;
                AppState.currentEOVX = x;
                break;
                
            case CONSTANTS.COORD_SYSTEMS.SCREEN_CENTER:
                // Térkép középpontja Leaflet-ből (már ETRF2000 síkban van)
                const center = AppState.map.getCenter();
                etrf2000Lat = center.lat;
                etrf2000Lon = center.lng;
                break;
                
            default:
                Logger_Transform.warn('Ismeretlen koordináta-rendszer', source);
                return;
        }
        
        // ETRF2000 értékek beállítása
        AppState.currentLatWGS84 = etrf2000Lat;  // Valójában ETRF2000!
        AppState.currentLonWGS84 = etrf2000Lon;  // Valójában ETRF2000!
        AppState.currentLatETRF2000 = etrf2000Lat;
        AppState.currentLonETRF2000 = etrf2000Lon;
        
        // ETRF2000 → EOV konverzió (ha még nem van EOV)
        if (source !== 'eov') {
            const eov = AppState.transformer.etrf2000_2eov(etrf2000Lat, etrf2000Lon);
            AppState.currentEOVY = eov.y;
            AppState.currentEOVX = eov.x;
        }
        
        // Távolságvonal frissítése ha van kijelölt pont (de nem auto zoom közben)
        if (!AppState.isAutoZoomInProgress) {
            updateDistanceLine();
        }
            
    } catch (err) {
        Logger_Transform.error(`Koordináta konverzió hiba (${source})`, err);
        
        // UI-ban megjelenítendő hiba
        if (typeof showErrorPanel === 'function') {
            showErrorPanel(
                '❌ Koordináta konverzió hiba',
                `Forrás: ${source} | Hiba: ${err.message}`,
                { bemenet: { x, y }, hibakód: err.toString() }
            );
        }
        
        // Error recovery - fallback keresés
        const coords = { x: x, y: y };
        const recovered = ErrorRecovery.recoverCoordinateTransform(coords, source, AppState.transformer);
        
        if (recovered.fallback) {
            Logger_Transform.warn('Fallback koordináták használva', recovered.message);
            AppState.currentLatWGS84 = recovered.lat;
            AppState.currentLonWGS84 = recovered.lon;
        } else {
            // Null-ázás hiba esetén
            if (source !== 'screenCenter') {
                AppState.currentLatWGS84 = null;
                AppState.currentLonWGS84 = null;
            }
            AppState.currentLatETRF2000 = null;
            AppState.currentLonETRF2000 = null;
            if (source !== 'eov') {
                AppState.currentEOVY = null;
                AppState.currentEOVX = null;
            }
        }
    }
}

function convertShapeToGeoJSON(shapeData, projection) {
    if (!AppState.transformer) {
        Logger_Shapefile.warn('Transformer nem inicializálva, GeoJSON konverzió kihagyva', projection);
        return shapeData;
    }
    
    // Validáció: van-e a shapeData a features tömb?
    if (!shapeData || !shapeData.features || !Array.isArray(shapeData.features)) {
        Logger_Shapefile.warn('ShapeData nem jó formátumban van', { type: typeof shapeData, keys: shapeData ? Object.keys(shapeData).slice(0, 3) : 'null' });
        return shapeData;
    }
    
    try {
        const converted = JSON.parse(JSON.stringify(shapeData));
        
        converted.features.forEach((feature) => {
            if (feature && feature.geometry && feature.geometry.coordinates) {
                convertCoordinates(feature, projection);
            }
        });
        
        Logger_Shapefile.debug(`${converted.features.length} feature konvertálva`, projection);
        return converted;
    } catch (err) {
        Logger_Shapefile.error('GeoJSON konverzió sikertelen', err);
        return shapeData; // Fallback
    }
}

function convertCoordinates(feature, projection) {
    if (!AppState.transformer) return;
    
    const geometryType = feature.geometry.type;
    
    if (geometryType === 'Point') {
        const coords = feature.geometry.coordinates;
        const converted = convertPoint(coords[0], coords[1], projection);
        
        // GeoJSON koordináták (WGS84)
        feature.geometry.coordinates[0] = converted.lon;
        feature.geometry.coordinates[1] = converted.lat;
        
        // EOV koordináták a properties-ben
        if (!feature.properties) {
            feature.properties = {};
        }
        feature.properties.eov_x = converted.eov_x;
        feature.properties.eov_y = converted.eov_y;
        
    } else if (geometryType === 'LineString' || geometryType === 'MultiPoint') {
        // Egyszerű koordináta konverzió
        const eovPoints = [];
        feature.geometry.coordinates.forEach(coord => {
            const converted = convertPoint(coord[0], coord[1], projection);
            coord[0] = converted.lon;
            coord[1] = converted.lat;
            eovPoints.push({ x: converted.eov_x, y: converted.eov_y });
        });
        
        // LineString esetén mentse a végpontok EOV koordinátáit
        if (geometryType === 'LineString' && eovPoints.length >= 2) {
            if (!feature.properties) {
                feature.properties = {};
            }
            feature.properties.eov_coords = {
                start: eovPoints[0],
                end: eovPoints[eovPoints.length - 1]
            };
        }
        
    } else if (geometryType === 'Polygon') {
        // Poligon: koordináta konverzió + terület számítás
        const eovCoordinates = [];
        const eovCorners = [];
        
        feature.geometry.coordinates.forEach(ring => {
            ring.forEach(coord => {
                const converted = convertPoint(coord[0], coord[1], projection);
                coord[0] = converted.lon;
                coord[1] = converted.lat;
                
                // EOV koordináták gyűjtése csak a külső határvonalhoz
                if (ring === feature.geometry.coordinates[0]) {
                    eovCoordinates.push([converted.eov_x, converted.eov_y]);
                    eovCorners.push({ x: converted.eov_x, y: converted.eov_y });
                }
            });
        });
        
        // Terület és sarokpontok elmentése
        if (!feature.properties) {
            feature.properties = {};
        }
        feature.properties.area_sqm = calculatePolygonArea(eovCoordinates);
        feature.properties.eov_corners = eovCorners;
        
    } else if (geometryType === 'MultiLineString') {
        // Egyszerű koordináta konverzió
        feature.geometry.coordinates.forEach(ring => {
            ring.forEach(coord => {
                const converted = convertPoint(coord[0], coord[1], projection);
                coord[0] = converted.lon;
                coord[1] = converted.lat;
            });
        });
        
    } else if (geometryType === 'MultiPolygon') {
        // MultiPolygon: koordináta konverzió
        feature.geometry.coordinates.forEach(polygon => {
            polygon.forEach(ring => {
                ring.forEach(coord => {
                    const converted = convertPoint(coord[0], coord[1], projection);
                    coord[0] = converted.lon;
                    coord[1] = converted.lat;
                });
            });
        });
    }
}

function convertPoint(lon, lat, projection) {
    try {
        // Input validáció - csak WGS84 koordinátákat validáljunk WGS84 tartományban
        if (projection === 'wgs84') {
            const latValidation = ValidationService.validateCoordinate(lat, 'latitude');
            const lonValidation = ValidationService.validateCoordinate(lon, 'longitude');
            
            if (!latValidation.valid || !lonValidation.valid) {
                Logger_Transform.warn('WGS84 pont validáció:', { lat: latValidation, lon: lonValidation });
            }
        } else if (projection === 'eov') {
            // EOV koordináták validációja (durva határok)
            const yValidation = ValidationService.validateCoordinate(lat, 'eov');
            const xValidation = ValidationService.validateCoordinate(lon, 'eov');
            
            if (!yValidation.valid || !xValidation.valid) {
                Logger_Transform.warn('EOV pont validáció:', { y: yValidation, x: xValidation });
            }
        }

        let etrf2000Lat = lat;
        let etrf2000Lon = lon;
        
        if (projection === 'eov') {
            const result = AppState.transformer.eov2etrf2000(lon, lat);
            etrf2000Lat = result.lat;
            etrf2000Lon = result.lon;
        } else if (projection === 'wgs84') {
            const result = AppState.transformer.wgs84_2etrf2000(lat, lon);
            etrf2000Lat = result.lat;
            etrf2000Lon = result.lon;
        }
        
        // EOV koordináták kiszámítása
        const eov = AppState.transformer.etrf2000_2eov(etrf2000Lat, etrf2000Lon);
        
        // ETRF2000 koordináták használata (WGS84 konverzió nélkül)
        return { 
            lon: etrf2000Lon,  // ETRF2000 longitude
            lat: etrf2000Lat,  // ETRF2000 latitude
            eov_x: eov.x,
            eov_y: eov.y
        };
    } catch (err) {
        Logger_Transform.error('Pont konvertálás sikertelen', err);
        Logger_Transform.debug('Fallback pont használva', { lon, lat });
        
        // UI-ban megjelenítendő hiba
        if (typeof showErrorPanel === 'function') {
            showErrorPanel(
                '❌ Pont konvertálás hiba',
                `Vetület: ${projection} | Hiba: ${err.message}`,
                { input: { lon, lat }, fallback: 'Eredeti koordináták használva' }
            );
        }
        
        return { 
            lon: lon,  // Original coordinate (ETRF2000 or input)
            lat: lat,  // Original coordinate (ETRF2000 or input)
            eov_x: null,
            eov_y: null
        };
    }
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = EOVTransformer;
}

// Global export
if (typeof window !== 'undefined') {
  window.EOVTransformer = EOVTransformer;
}

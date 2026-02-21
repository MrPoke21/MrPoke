/**
 * Cövek Library - EOV ↔ ETRF2000 Coordinate Transformation
 * 
 * Standalone JavaScript library for converting between Hungarian EOV and ETRF2000/WGS84 coordinates.
 * Uses Proj4.js for projection mathematics and optional GeoTIFF for HD72 grid correction.
 * 
 * @version 4.0
 * @author Cövek Project
 * @license MIT
 * 
 * Dependencies:
 *   - proj4: https://cdn.jsdelivr.net/npm/proj4@2.20.0/dist/proj4.js
 *   - geotiff (optional): https://cdn.jsdelivr.net/npm/geotiff@2.1.3/dist-browser/geotiff.js
 */

class EOVTransformer {
  constructor() {
    this.GRID_NAME = 'hu_bme_hd72corr.tif';
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

    // EOV (Hungarian Unified National Projection)
    proj4.defs('EOV',
      '+proj=somerc +lat_0=47.14439372222222 +lon_0=19.04857177777778' +
      ' +k_0=0.99993 +x_0=650000 +y_0=200000 +ellps=GRS67' +
      ` +nadgrids=${this.GRID_NAME} +units=m +no_defs`
    );

    // Fallback EOV without nadgrids (Helmert transformation)
    proj4.defs('EOV_HELMERT',
      '+proj=somerc +lat_0=47.14439372222222 +lon_0=19.04857177777778' +
      ' +k_0=0.99993 +x_0=650000 +y_0=200000 +ellps=GRS67' +
      ' +towgs84=-52.684,62.195,39.925,0.01851,-0.14143,-0.04625,1.1091' +
      ' +units=m +no_defs'
    );

    this.proj4Ready = true;
  }

  /**
   * Load HD72 grid from web (same server where HTML is located)
   * @param {string} [gridPath='hu_bme_hd72corr.tif'] - Path to grid file relative to HTML location
   * @returns {Promise<boolean>} - Success status
   */
  async loadGridFromWeb(gridPath = 'hu_bme_hd72corr.tif') {
    if (typeof GeoTIFF === 'undefined') {
      console.warn('GeoTIFF.js not loaded - grid support disabled');
      return false;
    }

    // Check if running on file:// protocol (CORS issue)
    if (window.location.protocol === 'file:') {
      console.warn('Cannot load grid from file:// protocol due to CORS restrictions. Please use a local web server or upload the file manually.');
      return false;
    }

    try {
      const response = await fetch(gridPath);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const buf = await response.arrayBuffer();

      // Load into Proj4
      const tiff = await GeoTIFF.fromArrayBuffer(buf);
      await proj4.nadgrid(this.GRID_NAME, tiff).ready;

      this.gridLoaded = true;
      console.log('Grid loaded from web successfully');
      return true;
    } catch (err) {
      console.warn(`Could not load grid from web (${gridPath}):`, err.message);
      return false;
    }
  }

  /**
   * Get grid status
   * @returns {Object} - Status info
   */
  getGridStatus() {
    return {
      loaded: this.gridLoaded,
      accuracy: this.gridLoaded ? '±0.1-0.5m (HD72 grid)' : '±2-5m (Helmert)',
      source: this.gridLoaded ? 'HD72 nadgrid (hu_bme_hd72corr.tif)' : 'Helmert 7-parameter transformation'
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
      const sourceProj = this.gridLoaded ? 'EOV' : 'EOV_HELMERT';

      const [lon, lat] = proj4(sourceProj, targetProj).forward([eovY, eovX]);

      return {
        lat: lat,
        lon: lon,
        accuracy: this.gridLoaded ? '±0.1-0.5m' : '±2-5m',
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
      const targetProj = this.gridLoaded ? 'EOV' : 'EOV_HELMERT';

      const [eovY, eovX] = proj4(sourceProj, targetProj).forward([lon, lat]);

      return {
        y: eovY,
        x: eovX,
        accuracy: this.gridLoaded ? '±0.1-0.5m' : '±2-5m',
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
      const targetProj = this.gridLoaded ? 'EOV' : 'EOV_HELMERT';

      const [eovY, eovX] = proj4(sourceProj, targetProj).forward([lon, lat]);

      return {
        y: eovY,
        x: eovX,
        accuracy: this.gridLoaded ? '±0.1-0.5m' : '±2-5m',
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
                AppState.currentLatWGS84 = x;
                AppState.currentLonWGS84 = y;
                break;
                
            case CONSTANTS.COORD_SYSTEMS.ETRF2000:
                // ETRF2000 már a megfelelő formátumban van
                etrf2000Lat = x;
                etrf2000Lon = y;
                // ETRF2000 (lat, lon) → WGS84
                const wgs84_from_etrf2000 = AppState.transformer.etrf2000_2wgs84(x, y);
                AppState.currentLatWGS84 = wgs84_from_etrf2000.lat;
                AppState.currentLonWGS84 = wgs84_from_etrf2000.lon;
                break;
                
            case CONSTANTS.COORD_SYSTEMS.EOV:
                // EOV (x=easting, y=northing) → ETRF2000
                const etrf2000_from_eov = AppState.transformer.eov2etrf2000(y, x); // y=lon-like, x=lat-like
                etrf2000Lat = etrf2000_from_eov.lat;
                etrf2000Lon = etrf2000_from_eov.lon;
                // ETRF2000 → WGS84
                const wgs84_from_eov = AppState.transformer.etrf2000_2wgs84(etrf2000Lat, etrf2000Lon);
                AppState.currentLatWGS84 = wgs84_from_eov.lat;
                AppState.currentLonWGS84 = wgs84_from_eov.lon;
                AppState.currentEOVY = y;
                AppState.currentEOVX = x;
                break;
                
            case CONSTANTS.COORD_SYSTEMS.SCREEN_CENTER:
                // Térkép középpontja (WGS84)
                const center = AppState.map.getCenter();
                AppState.currentLatWGS84 = center.lat;
                AppState.currentLonWGS84 = center.lng;
                // WGS84 → ETRF2000
                const etrf = AppState.transformer.wgs84_2etrf2000(AppState.currentLatWGS84, AppState.currentLonWGS84);
                etrf2000Lat = etrf.lat;
                etrf2000Lon = etrf.lon;
                break;
                
            default:
                Logger_Transform.warn('Ismeretlen koordináta-rendszer', source);
                return;
        }
        
        // ETRF2000 értékek beállítása
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
        
        // WGS84 visszakonvertálása a GeoJSON-hoz
        const wgs84 = AppState.transformer.etrf2000_2wgs84(etrf2000Lat, etrf2000Lon);
        
        return { 
            lon: wgs84.lon, 
            lat: wgs84.lat,
            eov_x: eov.x,
            eov_y: eov.y
        };
    } catch (err) {
        Logger_Transform.error('Pont konvertálás sikertelen', err);
        Logger_Transform.debug('Fallback pont használva', { lon, lat });
        
        return { 
            lon: lon, 
            lat: lat,
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

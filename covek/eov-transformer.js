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

// Export for ES6 modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = EOVTransformer;
}

// Global export
if (typeof window !== 'undefined') {
  window.EOVTransformer = EOVTransformer;
}

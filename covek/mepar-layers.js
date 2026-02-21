/**
 * MePAR Layers Manager - Leaflet Version
 * Handles MePAR WMS layer management using Leaflet (Ortofotó 2025 and HRSZ cadastral)
 * 
 * Based on OpenLayers mepar_map.html reference and MePAR WMS service specifications:
 * - URL: https://mepar.mvh.allamkincstar.gov.hu/api/proxy/iier-gs/wms
 * - Layers: iier:orto2025, iier:EK_HRSZ_POLY
 * - Projection: EPSG:23700 (EOV/HD72)
 * - VIEWPARAMS: Year-based dynamic parameters (VONEV, TOLDA, IGDAT)
 * 
 * @version 2.0 (Leaflet from OpenLayers reference)
 * @author Cövek Project
 * @license MIT
 * 
 * Dependencies:
 *   - Leaflet.js (L global object)
 *   - EOVTransformer class from eov-transformer.js
 *   - AppState object from script.js (with L.map instance)
 *   - Logger_Map, Logger_Transform loggers from script.js
 * 
 * Function Order:
 *   1. initTransformer() - Initialize EOVTransformer, load grid, then call initMePARLayers()
 *   2. initMePARLayers() - Add WMS layers (Ortofotó + HRSZ)
 *   3. addOrtofotoLayer() - Add Ortofotó 2025 base layer (JPEG, WMS 1.1.1)
 *   4. addHRSZLayer() - Add HRSZ cadastral overlay (PNG, WMS 1.3.0, dynamic VIEWPARAMS)
 */

/**
 * Initialize transformer and register EOV projection
 * Creates EOVTransformer instance, loads grid file, then initializes MePAR WMS layers
 * 
 * Requires AppState to be fully initialized with:
 *   - AppState.map (Leaflet L.map instance)
 *   - AppState.layerControl
 *   - AppState.baseMaps
 *   - AppState.overlayMaps
 * 
 * @returns {void}
 */
function initTransformer() {
    try {
        // EOVTransformer inicializálás
        AppState.transformer = new EOVTransformer();
        Logger_Transform.success('EOVTransformer inicializálva');
        
        // Update grid status display
        if (typeof updateGridStatusDisplay === 'function') {
            updateGridStatusDisplay();
        }
        
        // Load grid file asynchronously
        if (AppState.transformer && typeof AppState.transformer.loadGridFromWeb === 'function') {
            AppState.transformer.loadGridFromWeb('etrs2eov_notowgs.gsb')
                .then(success => {
                    Logger_Transform.info('Grid betöltés eredménye:', success);
                    if (typeof updateGridStatusDisplay === 'function') {
                        updateGridStatusDisplay();
                    }
                })
                .catch(err => {
                    Logger_Transform.warn('Grid betöltés sikertelen, Helmert fallback használva');
                    if (typeof updateGridStatusDisplay === 'function') {
                        updateGridStatusDisplay();
                    }
                });
        }
        
        // Initialize MePAR WMS layers
        if (AppState.map && AppState.layerControl) {
            try {
                initMePARLayers();
            } catch (meParErr) {
                Logger_Map.error('MePAR rétegek inicializálása sikertelen', meParErr.message);
            }
        }
        
    } catch (err) {
        Logger_Transform.error('EOVTransformer init sikertelen', err);
        if (typeof showStatus === 'function') {
            showStatus('Koordináta transzformátor hiba: ' + err.message, 'error');
        }
    }
}

/**
 * Initialize and add all MePAR WMS layers to Leaflet map
 * Adds Ortofotó 2025 and HRSZ cadastral layers from MePAR WMS service
 * 
 * Called by initTransformer() after EOVTransformer setup
 * 
 * Requires AppState to be fully initialized with:
 *   - AppState.map (Leaflet L.map instance)
 *   - AppState.baseMaps (for base layer registration)
 *   - AppState.overlayMaps (for overlay layer registration)
 *   - AppState.layerControl (Leaflet layer control)
 * 
 * @returns {void}
 */
function initMePARLayers() {
    try {
        if (!AppState.map || !AppState.layerControl || !AppState.baseMaps || !AppState.overlayMaps) {
            Logger_Map.warn('initMePARLayers: Szükséges AppState objektumok nem elérhető');
            return;
        }
        
        // Add HRSZ overlay layer
        addHRSZLayer();
        
        Logger_Map.success('MePAR rétegek inicializálva (HRSZ)');
        
    } catch (err) {
        Logger_Map.error('MePAR rétegek inicializálása sikertelen', err.message);
        console.error('❌ initMePARLayers HIBA:', err);
    }
}
/**
 * Create and add HRSZ cadastral overlay layer
 * WMS TileLayer with dynamic VIEWPARAMS from MePAR service (iier:EK_HRSZ_POLY)
 * 
 * Based on OpenLayers mepar_map.html configuration:
 *   - Format: image/png (transparent)
 *   - WMS Version: 1.3.0
 *   - Service: MePAR WMS proxy with GeoServer VIEWPARAMS
 *   - VIEWPARAMS: Dynamic year-based (VONEV:year, TOLDA:year0301, IGDAT:(year+1)0228)
 * 
 * Note: AppState.hrszLayerOffset (méter) elérhető az HRSZ geometriák kijelöléséhez
 *       A HRSZ réteg és AppState koordináták közötti eltolás kompenzációjához
 * 
 * @returns {L.TileLayer.WMS|null} - The created layer or null on error
 */
function addHRSZLayer() {
    try {
        if (!AppState.map || !AppState.layerControl || !AppState.overlayMaps) {
            Logger_Map.warn('addHRSZLayer: Szükséges objektumok nem elérhető');
            return null;
        }
        
        // Dynamic VIEWPARAMS based on current year (from mepar_map.html pattern)
        const currentYear = new Date().getFullYear();
        const viewParams = `VONEV:${currentYear};TOLDA:${currentYear}0301;IGDAT:${currentYear + 1}0228`;
        
        const hrszLayer = L.tileLayer.wms(
            'https://mepar.mvh.allamkincstar.gov.hu/api/proxy/iier-gs/wms',
            {
                layers: 'iier:EK_HRSZ_POLY',
                format: 'image/png',
                transparent: true,
                version: '1.3.0',
                attribution: '© MePAR HRSZ',
                uppercase: true,
                maxZoom: 28,
                maxNativeZoom: 20,
                tiled: true,
                // GeoServer-specific parameters
                serverType: 'geoserver',
                viewparams: viewParams
            }
        );
        
        // Add to overlay maps and layer control
        AppState.layerControl.addOverlay(hrszLayer, '📍 Helyrajzi szám (HRSZ)');
        AppState.overlayMaps['📍 Helyrajzi szám (HRSZ)'] = hrszLayer;
        
        // Display on map
        hrszLayer.addTo(AppState.map);
        
        Logger_Map.success('✓ HRSZ (Helyrajzi szám) réteg hozzáadva');
        return hrszLayer;
        
    } catch (err) {
        Logger_Map.error('HRSZ réteg hozzáadása sikertelen', err.message);
        console.error('❌ addHRSZLayer:', err);
        return null;
    }
}

// Export for module systems (if needed)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        initTransformer,
        initMePARLayers,
        addHRSZLayer
    };
}



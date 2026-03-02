/**
 * MePAR Layers Manager - OpenLayers Version
 * Handles MePAR WMS layer management using OpenLayers (HRSZ cadastral)
 *
 * Based on reverse-engineered Angular bundle (mepar/ directory) and MePAR WMS service:
 * - WMS URL : https://mepar.mvh.allamkincstar.gov.hu/api/proxy/iier-gs/wms
 * - Layer   : iier:EK_HRSZ_POLY
 * - Proj    : EPSG:23700 (EOV/HD72)
 * - VERSION : 1.3.0 + CRS=EPSG:23700 (bundle: v13_=true â†’ CRS param)
 *
 * VIEWPARAMS verziĂłkĂ¶vetĂ©s:
 *   A MePAR /fedveny/vonev_map API CORS miatt nem hĂ­vhatĂł bĂ¶ngĂ©szĹ‘bĹ‘l.
 *   LokĂˇlis szĂˇmĂ­tĂˇs: VONEV = aktuĂˇlis Ă©v, TOLDA = ${Ă©v}0301, IGDAT = ${Ă©v+1}0228
 *
 * @version 5.0 (OpenLayers 8, EPSG:23700 natĂ­v, TileWMS)
 * @author CĂ¶vek Project
 * @license MIT
 *
 * Dependencies:
 *   - ol.js (OpenLayers 8 global bundle)
 *   - AppState object from script.js (with ol.Map instance, overlayMaps)
 *   - RESOLUTIONS, MAP_EXTENT constants from script.js
 *   - Logger_Map from script.js
 */

const MEPAR_WMS_URL = 'https://mepar.mvh.allamkincstar.gov.hu/api/proxy/iier-gs/wms';

/**
 * Ismert vonev adatok a /fedveny/vonev_map API-bĂłl (CORS miatt statikusan beĂˇgyazva).
 * DĂˇtumformĂˇtum az API-ban: "YYYY-MM-DD" â†’ VIEWPARAMS-hoz kĂ¶tĹ‘jel nĂ©lkĂĽl: "YYYYMMDD"
 * FrissĂ­tendĹ‘, ha Ăşj kampĂˇnyĂ©v kerĂĽl a MePAR rendszerbe.
 */
const VONEV_MAP = {
    2013: { vonev: 2013, tolda: "2013-03-01", igdat: "2014-02-28" },
    2014: { vonev: 2014, tolda: "2014-03-01", igdat: "2015-02-28" },
    2015: { vonev: 2015, tolda: "2015-03-01", igdat: "2016-02-29" },
    2016: { vonev: 2016, tolda: "2016-03-01", igdat: "2017-02-28" },
    2017: { vonev: 2017, tolda: "2017-03-01", igdat: "2018-02-28" },
    2018: { vonev: 2018, tolda: "2018-03-01", igdat: "2019-02-28" },
    2019: { vonev: 2019, tolda: "2019-03-01", igdat: "2020-02-29" },
    2020: { vonev: 2020, tolda: "2020-03-01", igdat: "2021-02-28" },
    2021: { vonev: 2021, tolda: "2021-03-01", igdat: "2022-02-28" },
    2022: { vonev: 2022, tolda: "2022-03-01", igdat: "2023-02-28" },
    2023: { vonev: 2023, tolda: "2023-03-01", igdat: "2024-02-29" },
    2024: { vonev: 2024, tolda: "2024-03-01", igdat: "2025-02-28" },
    2025: { vonev: 2025, tolda: "2025-03-01", igdat: "2026-02-28" },
};

/**
 * AktuĂˇlis vonev adatok visszaadĂˇsa a statikus VONEV_MAP-bĹ‘l.
 * A legmagasabb Ă©vet veszi (= aktuĂˇlis kampĂˇnyĂ©v).
 * DĂˇtumokbĂłl eltĂˇvolĂ­tja a kĂ¶tĹ‘jeleket: "2025-03-01" â†’ "20250301"
 *
 * @returns {{vonev: string, tolda: string, igdat: string}}
 */
function getCurrentVonev() {
    const latestYear = Math.max(...Object.keys(VONEV_MAP).map(Number));
    const entry = VONEV_MAP[latestYear];
    return {
        vonev: String(entry.vonev),
        tolda: entry.tolda.replace(/-/g, ''),
        igdat: entry.igdat.replace(/-/g, '')
    };
}

/**
 * Initialize and add all MePAR WMS layers to OpenLayers map.
 *
 * Requires AppState to be fully initialized with:
 *   - AppState.map      (ol.Map instance)
 *   - AppState.overlayMaps  (overlay layer registry)
 *
 * @returns {void}
 */
function initMePARLayers() {
    if (!AppState.map || !AppState.overlayMaps) {
        Logger_Map.warn('initMePARLayers: SzĂĽksĂ©ges AppState objektumok nem elĂ©rhetĹ‘k');
        return;
    }

    try {
        addHRSZLayer(getCurrentVonev());
        Logger_Map.success('MePAR rĂ©tegek inicializĂˇlva (HRSZ)');
    } catch (err) {
        Logger_Map.error('MePAR rĂ©tegek inicializĂˇlĂˇsa sikertelen', err.message);
    }
}

/**
 * Create and add HRSZ cadastral overlay layer using OpenLayers TileWMS.
 *
 * Bundle forrĂˇs:
 *   - di[v13_ ? "CRS" : "SRS"] = Ze.getCode()  â†’ VERSION=1.3.0, CRS=EPSG:23700
 *   - maxResolution: P[3].resolution = 140 m/px
 *   - layer: "iier:EK_HRSZ_POLY"
 *
 * @param {{vonev: string, tolda: string, igdat: string}} vonevData
 * @returns {ol.layer.Tile|null}
 */
function addHRSZLayer(vonevData) {
    try {
        if (!AppState.map || !AppState.overlayMaps) {
            Logger_Map.warn('addHRSZLayer: SzĂĽksĂ©ges objektumok nem elĂ©rhetĹ‘k');
            return null;
        }

        const { vonev, tolda, igdat } = vonevData;
        const viewParams = `VONEV:${vonev};TOLDA:${tolda};IGDAT:${igdat}`;

        Logger_Map.debug('HRSZ VIEWPARAMS:', viewParams);

        // Tile grid â€“ bundle WMTS resolution-Ă¶kkel (RESOLUTIONS globĂˇlis a script.js-bĹ‘l)
        const tileGrid = new ol.tilegrid.TileGrid({
            extent: typeof MAP_EXTENT !== 'undefined' ? MAP_EXTENT : [227130, -159436, 1150289, 574373],
            resolutions: typeof RESOLUTIONS !== 'undefined' ? RESOLUTIONS : [1120, 560, 280, 140, 55.99, 27.99, 13.99, 5.6, 2.8, 1.4, 0.559, 0.28, 0.14, 0.056, 0.028],
            tileSize: 256
        });

        // TileWMS source â€“ bundle: v13_=true â†’ VERSION 1.3.0 + CRS=EPSG:23700 BBOX
        const hrszSource = new ol.source.TileWMS({
            url: MEPAR_WMS_URL,
            params: {
                'LAYERS': 'iier:EK_HRSZ_POLY',
                'FORMAT': 'image/png',
                'TRANSPARENT': true,
                'VERSION': '1.3.0',
                'TILED': true,
                'VIEWPARAMS': viewParams
            },
            projection: 'EPSG:23700',
            tileGrid: tileGrid,
            serverType: 'geoserver'
        });

        // OL layer â€“ maxResolution: P[3] = 140 m/px (bundle: csak rĂ©szletes zoomnĂˇl lĂˇthatĂł)
        const hrszLayer = new ol.layer.Tile({
            title: 'đź“Ť Helyrajzi szĂˇm (HRSZ)',
            source: hrszSource,
            maxResolution: 140,   // bundle: P[3].resolution = 140
            opacity: 1,
            visible: true,
            zIndex: 100
        });

        AppState.map.addLayer(hrszLayer);
        AppState.overlayMaps['đź“Ť Helyrajzi szĂˇm (HRSZ)'] = hrszLayer;

        // Layer control HTML frissĂ­tĂ©se (ha a setupLayerControl() mĂˇr lefutott)
        if (typeof updateLayerControlUI === 'function') {
            updateLayerControlUI();
        }

        Logger_Map.success(`âś“ HRSZ rĂ©teg hozzĂˇadva (VONEV:${vonev})`);
        return hrszLayer;

    } catch (err) {
        Logger_Map.error('HRSZ rĂ©teg hozzĂˇadĂˇsa sikertelen', err.message);
        return null;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { initMePARLayers, addHRSZLayer, getCurrentVonev };
}

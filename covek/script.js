// ============ KONSTANSOK ============
const CONSTANTS = {
    // Koordináta rendszerek
    COORD_SYSTEMS: {
        ETRF2000: 'etrf2000',
        EOV: 'eov',
        SCREEN_CENTER: 'screenCenter',
        RTK: 'rtk'  // RTK = ETRF2000 alias
    },
    // Színek
    COLORS: {
        PRIMARY_RED: '#ff0000',
        ORANGE: '#ff6b35',
        GREEN: '#00ff00',
        YELLOW: '#ffeb3b',
        BLACK: '#000',
        WHITE: '#fff',
        BLUE_ACCENT: 'rgba(74, 144, 226, 0.5)'
    },
    // UI elemek
    UI: {
        MOBILE_BREAKPOINT: 768,
        COORD_PANEL_SHADOW: '0 0 12px rgba(74, 144, 226, 0.5)',
        CLASS_CLOSED: 'closed',
        CLASS_ACTIVE: 'active'
    },
    // Geometria
    GEOMETRY: {
        POINT_RADIUS: 6,
        CORNER_MARKER_RADIUS: 6,
        LINE_WEIGHT: 2,
        SELECTED_LINE_WEIGHT: 6,
        MARKER_CIRCLE_RADIUS: 4,
        DISTANCE_LABEL_FONT_SIZE: '28px',
        EXTENDED_LINE_FACTOR: 0.5
    },
    // GPS
    GPS: {
        ENABLE_HIGH_ACCURACY: true,
        MAXIMUM_AGE: 5000
    },
    // Auto zoom
    AUTO_ZOOM: {
        DEFAULT_PADDING_PERCENT: 0.1,  // 10% per oldal = 20% total
        MAX_ZOOM: 20
    },
    // Mérés - távolság formázás
    DISTANCE: {
        CM_THRESHOLD: 1,  // 1m alatt centiméterben mutatunk
        DECIMAL_PLACES: 2
    }
};

// ============ APPSTATE - Centralizált alkalmazás státusz ============
const AppState = {
    // Map és transzformáció
    map: null,
    transformer: null,
    eovCRS: null,
    layerControl: null,
    shapeFileLayer: null,
    baseMaps: {},
    overlayMaps: {},
    
    // GPS
    gpsMarker: null,
    gpsWatchId: null,
    gpsOverlay: null,
    gpsAccuracy: null,          // position.coords.accuracy [m] – az eszköz által jelentett vízszintes pontosság
    
    // Térkép elemek - kiválasztás
    selectedLayer: null,
    selectedCornerMarker: null,
    selectedPolygon: null,
    allCornerMarkers: [],
    selectedPointEOV: { x: null, y: null },
    selectedPointOL: null,       // OL [easting, northing] – rajzoláshoz
    selectedLineEOV: { start: null, end: null },
    selectedPolygonEOV: [],
    selectedPolygonProperties: null,
    
    // Megjelenítés (távolság, segédvonalak)
    distanceLine: null,
    distanceLabel: null,
    perpendicularMarker: null,
    
    // Koordináták - ETRF2000
    currentLatETRF2000: null,
    currentLonETRF2000: null,
    currentEOVY: null,
    currentEOVX: null,
    
    // Feature flagok
    autoZoomEnabled: false,
    isAutoZoomInProgress: false,
    gpsFollowEnabled: false,
    
    // ===== GETTER/SETTER METHODS =====
    setMap(mapInstance) {
        this.map = mapInstance;
    },
    getMap() {
        return this.map;
    },
    
    setTransformer(transformerInstance) {
        this.transformer = transformerInstance;
    },
    getTransformer() {
        return this.transformer;
    },
    
    setGPSWatchId(id) {
        this.gpsWatchId = id;
    },
    getGPSWatchId() {
        return this.gpsWatchId;
    },
    
    setSelectedPoint(eovPoint) {
        this.selectedPointEOV = eovPoint || { x: null, y: null };
    },
    getSelectedPoint() {
        return { eov: this.selectedPointEOV };
    },
    
    setSelectedLine(eovLine) {
        this.selectedLineEOV = eovLine || { start: null, end: null };
    },
    getSelectedLine() {
        return { eov: this.selectedLineEOV };
    },
    
    setCurrentCoordinates(latETRF2000, lonETRF2000, eovY, eovX) {
        this.currentLatETRF2000 = latETRF2000;
        this.currentLonETRF2000 = lonETRF2000;
        this.currentEOVY = eovY;
        this.currentEOVX = eovX;
    },
    getCurrentCoordinates() {
        return {
            etrf2000: { lat: this.currentLatETRF2000, lon: this.currentLonETRF2000 },
            eov: { y: this.currentEOVY, x: this.currentEOVX }
        };
    },
    
    clearSelection() {
        this.selectedLayer = null;
        this.selectedCornerMarker = null;
        this.selectedPolygon = null;
        this.selectedPointEOV = { x: null, y: null };
        this.selectedPointOL = null;
        this.selectedLineEOV = { start: null, end: null };
        this.selectedPolygonEOV = [];
        this.selectedPolygonProperties = null;
    },
    
    clearVisualization() {
        this.distanceLine = null;
        this.distanceLabel = null;
        this.perpendicularMarker = null;
    },
    
    toggleAutoZoom(enabled) {
        this.autoZoomEnabled = enabled;
    },
    
    setAutoZoomInProgress(inProgress) {
        this.isAutoZoomInProgress = inProgress;
    }
};

// ============ HELPER FUNKCIÓK & CACHE ============
// DOM elemek cache-elése az ismételt lekérdezések elkerülésére
const DOMCache = {
    elements: {},
    
    get(id) {
        if (!this.elements[id]) {
            this.elements[id] = document.getElementById(id);
        }
        return this.elements[id];
    },
    
    clear() {
        this.elements = {};
    }
};
// Sarokpont marker ikon méretének számítása zoom alapján
function getCornerMarkerSize(zoomLevel) {
    // Zoom szint alapján növekvő méret: 5-nél 4px, 22-nél 20px
    const baseSize = 4;
    const minZoom = 5;
    const maxZoom = 22;
    const minSize = 4;
    const maxSize = 20;
    const clampedZoom = Math.max(minZoom, Math.min(maxZoom, zoomLevel));
    const size = minSize + (clampedZoom - minZoom) / (maxZoom - minZoom) * (maxSize - minSize);
    return Math.round(size);
}

// Sarokpont marker stílus generálása OL-hoz (szín és méret alapján)
function getCornerMarkerStyle(color = 'yellow', size = 12) {
    const fillColor = color === 'red' ? '#ff0000' : '#ffeb3b';
    return new ol.style.Style({
        image: new ol.style.Circle({
            radius: Math.max(2, size / 2),
            fill: new ol.style.Fill({ color: fillColor }),
            stroke: new ol.style.Stroke({ color: '#000000', width: 1 })
        })
    });
}

// Visszafelé-kompatibilis alias (régi hívási helyekhez)
const getCornerMarkerIcon = getCornerMarkerStyle;


// Távolság formázás helper (cm vagy m)
// Matematikai függvények a mathematics.js-ből betöltve
// createMinimalDBF -> file-handler.js

// Rétegek eltávolítása - helper funkció
// Megjelenítés - csak a meglévő értékeket jeleníti meg (ETRF2000)
function updateCoordinateDisplay() {
    document.getElementById('latETRF').textContent = AppState.currentLatETRF2000 ? AppState.currentLatETRF2000.toFixed(9) : '—';
    document.getElementById('lonETRF').textContent = AppState.currentLonETRF2000 ? AppState.currentLonETRF2000.toFixed(9) : '—';
    document.getElementById('eovY').textContent = AppState.currentEOVY ? AppState.currentEOVY.toFixed(2) : '—';
    document.getElementById('eovX').textContent = AppState.currentEOVX ? AppState.currentEOVX.toFixed(2) : '—';

    // Mozgatás mód: pont követi az aktuális pozíciót (point-editor.js)
    if (typeof updateMovingCorner === 'function' && typeof MoveState !== 'undefined' && MoveState.active) {
        updateMovingCorner();
    }
    // Rajzolás mód: gumiló vonal és távolság folyamatos frissítése
    if (typeof _updateDrawLiveLine === 'function' && typeof DrawState !== 'undefined' && DrawState.active) {
        _updateDrawLiveLine();
    }
}

// Egyeteme koordináta konverzió függvénye a mathematics.js-ből betöltve

// ============ OPENLAYERS – EPSG:23700 (EOV) TÉRKÉP KONFIGURÁCIÓ ============
// Forrás: MePAR Angular bundle (mepar/main.*.js) visszafejtve
//   srsDef  : +proj=somerc +lat_0=47.14439372222222 ...
//   P[]     : 15 zoom szint resolutions (1:4M → 1:100)
//   S       : [427130, 40564, 950289, 374373]  (Magyarország EOV bbox)
//   mapExtent: [S[0]-2e5, S[1]-2e5, S[2]+2e5, S[3]+2e5]
//   center  : bundle EPSG:3857 center → EOV bbox közép = [688709, 207468]

const EPSG23700_PROJ4 =
    '+proj=somerc +lat_0=47.14439372222222 +lon_0=19.04857177777778' +
    ' +k_0=0.99993 +x_0=650000 +y_0=200000 +ellps=GRS67' +
    ' +towgs84=52.17,-71.82,-14.9,0,0,0,0 +units=m +no_defs';

// Bundle P[] tömb – 21 felbontási szint (eredeti 15 + 6 extra közelről)
const RESOLUTIONS = [
    1120, 560, 280, 140,
    55.99999999, 27.9999999999, 13.9999999999,
    5.6, 2.8, 1.4, 0.559999999999,
    0.28, 0.14, 0.056, 0.028,
    0.014, 0.0056, 0.0028,
    0.0014
];

// S = startExtent (Magyarország EOV bbox)  ±200000 = mapExtent
const MAP_EXTENT = [227130, -159436, 1150289, 574373];

// S bbox közepének EOV koordinátái (easting, northing) = OL [x, y]
const CENTER_EOV = [688709, 207468];

/**
 * EPSG:23700 regisztráció proj4 + OL-hoz.
 * Ezt az initMap() hívja meg.
 */
function registerEPSG23700() {
    proj4.defs('EPSG:23700', EPSG23700_PROJ4);
    ol.proj.proj4.register(proj4);
    const proj23700 = ol.proj.get('EPSG:23700');
    if (proj23700) proj23700.setExtent(MAP_EXTENT);
}

// Térkép inicializálása
function initMap() {
    try {
        // EPSG:23700 regisztráció
        registerEPSG23700();

        // OSM alap réteg – OL natívan reprojectál EPSG:3857 → EPSG:23700
        const osmLayer = new ol.layer.Tile({
            title: 'OpenStreetMap',
            source: new ol.source.OSM(),
            visible: true,
            zIndex: 0
        });

        const osmGrayLayer = new ol.layer.Tile({
            title: 'Műhold',
            source: new ol.source.XYZ({
                url: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
                attributions: '© Google Satellite',
                maxZoom: 21
            }),
            visible: false,
            zIndex: 0
        });

        // Távolságvonal réteg (distance lines, perpendicular markers)
        AppState.distanceVectorSource = new ol.source.Vector();
        AppState.distanceLayer = new ol.layer.Vector({
            source: AppState.distanceVectorSource,
            zIndex: 1001 // Ensure above all polygons and lines
        });

        // GPS marker réteg
        AppState.gpsVectorSource = new ol.source.Vector();
        AppState.gpsLayer = new ol.layer.Vector({
            source: AppState.gpsVectorSource,
            zIndex: 500
        });

        // Corner markers réteg (shapefile polygon sarokpontok)
        AppState.cornerVectorSource = new ol.source.Vector();
        AppState.cornerLayer = new ol.layer.Vector({
            source: AppState.cornerVectorSource,
            zIndex: 300
        });

        // OL Map
        AppState.map = new ol.Map({
            target: 'map',
            controls: [],
            layers: [
                osmLayer, osmGrayLayer,
                AppState.distanceLayer,
                AppState.cornerLayer,
                AppState.gpsLayer
            ],
            view: new ol.View({
                projection: 'EPSG:23700',
                resolutions: RESOLUTIONS,
                resolution: RESOLUTIONS[3],     // P[3]=140 m/px = ~1:500,000
                center: CENTER_EOV,
                extent: MAP_EXTENT,
                constrainResolution: true
            })
        });

        AppState.baseMaps = { osmLayer, osmGrayLayer };
        AppState.overlayMaps = {};
        AppState.layerControl = null; // custom HTML, ld. setupLayerControl()

        // Rétegváltó HTML control
        setupLayerControl();
        updateScaleBar();

        // GPS Overlay marker (DOM-alapú, canvas-független – Chrome-on is működik)
        const gpsMarkerEl = document.createElement('div');
        gpsMarkerEl.id = 'gps-overlay-marker';
        AppState.gpsOverlay = new ol.Overlay({
            element: gpsMarkerEl,
            positioning: 'center-center',
            stopEvent: false
        });
        AppState.map.addOverlay(AppState.gpsOverlay);

        Logger_Map.success('OpenLayers map inicializálva (EPSG:23700 EOV)');

        // Zoom változáskor sarokpont méretek frissítése
        AppState.map.getView().on('change:resolution', () => {
            const zoom = AppState.map.getView().getZoom() || 10;
            const newSize = getCornerMarkerSize(zoom);
            updateScaleBar();
        });

        // Térkép mozgáskor középpont marker frissítése
        AppState.map.on('moveend', () => {
            updateMapCenter();
            updateScaleBar();
        });

        // Kattintás kezelés – feature kiválasztás
        AppState.map.on('singleclick', handleMapClick);

    } catch (err) {
        Logger_Map.error('Térkép inicializálás sikertelen', err);
        showStatus('Térkép betöltés hiba: ' + ErrorRecovery.getUserMessage(err), 'error');
    }
}

/**
 * Vonalas méretarány frissítése.
 * Az EOV vetület m-es egységű → resolution [m/px] közvetlenül használható.
 * Kerek értéket (1/2/5 × 10^n) keres, max 200 px szélességig.
 */
function updateScaleBar() {
    const line  = document.getElementById('scale-bar-line');
    const label = document.getElementById('scale-bar-label');
    if (!line || !label || !AppState.map) return;

    // Ensure label is appended to body for highest stacking
    if (label.parentElement && label.parentElement.id === 'scale-bar') {
        document.body.appendChild(label);
    }

    const res = AppState.map.getView().getResolution(); // m/px
    if (!res || res <= 0) return;

    // Célszélesség ~100 px, kerek méterérték (1/2/5 × 10^n)
    const targetPx = 100;
    const rawM = res * targetPx;
    const exp  = Math.floor(Math.log10(rawM));
    const base = Math.pow(10, exp);
    let niceM;
    const ratio = rawM / base;
    if      (ratio < 1.5) niceM = base;
    else if (ratio < 3.5) niceM = 2 * base;
    else if (ratio < 7.5) niceM = 5 * base;
    else                  niceM = 10 * base;

    const px = Math.round(niceM / res);

    line.style.width = px + 'px';
    label.textContent = niceM >= 1000 ? `${niceM / 1000} km` : `${niceM} m`;
    // Position label above the scale bar visually
    const scaleBar = document.getElementById('scale-bar');
    if (scaleBar) {
        const rect = scaleBar.getBoundingClientRect();
        label.style.position = 'fixed';
        label.style.left = `${rect.left + rect.width / 2 - label.offsetWidth / 2}px`;
        label.style.bottom = `${window.innerHeight - rect.bottom + 2}px`;
        label.style.zIndex = '9999';
        label.style.pointerEvents = 'none';
    }
}

/**
 * Rétegváltó HTML control az OL térkép felett.
 * Mimic-eli a Leaflet L.control.layers() megjelenését.
 */
function setupLayerControl() {
    if (!AppState.map) return;

    // A rétegválasztó a sidebarban van (lc-base-layers, lc-overlay-layers már az index.html-ben)
    updateLayerControlUI();
}

/**
 * Layer control HTML frissítése (base layers + overlays).
 */
function updateLayerControlUI() {
    const baseDiv = document.getElementById('lc-base-layers');
    const overlayDiv = document.getElementById('lc-overlay-layers');
    if (!baseDiv || !overlayDiv) return;

    const { osmLayer, osmGrayLayer } = AppState.baseMaps || {};

    baseDiv.innerHTML = '';
    if (osmLayer && osmGrayLayer) {
        [
            { layer: osmLayer, label: 'OpenStreetMap' },
            { layer: osmGrayLayer, label: 'Műhold' }
        ].forEach(({ layer, label }) => {
            const id = 'lc-base-' + label.replace(/\s/g, '_');
            const row = document.createElement('label');
            row.style.cssText = 'display:flex;align-items:center;gap:6px;margin:2px 0;cursor:pointer;';
            row.innerHTML = `<input type="radio" name="base-layer" id="${id}" style="cursor:pointer;">
                             <span>${label}</span>`;
            const radio = row.querySelector('input');
            radio.checked = layer.getVisible();
            radio.addEventListener('change', () => {
                osmLayer.setVisible(false);
                osmGrayLayer.setVisible(false);
                layer.setVisible(true);
            });
            baseDiv.appendChild(row);
        });
    }

    overlayDiv.innerHTML = '';
    Object.entries(AppState.overlayMaps || {}).forEach(([label, layer]) => {
        const id = 'lc-overlay-' + label.replace(/[^a-zA-Z0-9]/g, '_');
        const unavailable = layer.get('unavailable') === true;
        const row = document.createElement('label');
        row.style.cssText = `display:flex;align-items:center;gap:6px;margin:2px 0;${unavailable ? 'cursor:not-allowed;opacity:0.45;' : 'cursor:pointer;'}`;
        row.innerHTML = `<input type="checkbox" id="${id}" ${unavailable ? 'disabled' : ''} style="${unavailable ? 'cursor:not-allowed;' : 'cursor:pointer;'}">
                         <span>${label}${unavailable ? ' <em style="font-size:0.8em;font-style:italic">(Jelenleg nem elérhető)</em>' : ''}</span>`;
        if (!unavailable) {
            const cb = row.querySelector('input');
            cb.checked = layer.getVisible();
            cb.addEventListener('change', () => layer.setVisible(cb.checked));
        }
        overlayDiv.appendChild(row);
    });
}

/**
 * OL map kattintás kezelő – feature kiválasztás.
 * Leaflet per-feature click handlers helyett centralizált OL singleclick.
 */
function handleMapClick(e) {
    let hit = false;

    AppState.map.forEachFeatureAtPixel(e.pixel, (feature, layer) => {
        if (hit) return true; // stop iteration

        if (layer === AppState.cornerLayer) {
            // Sarokpont kiválasztása NEM törli a kijelölt polygont
            const wasSelected = AppState.selectedCornerMarker === feature;
            // Csak a sarokpont kijelölését frissítjük
            if (AppState.selectedCornerMarker && AppState.selectedCornerMarker !== feature) {
                // Sarokpont stílus visszaállítása
                const zoom = AppState.map?.getView()?.getZoom() || 10;
                const markerSize = getCornerMarkerSize(zoom);
                AppState.selectedCornerMarker.setStyle(getCornerMarkerStyle('yellow', markerSize));
            }
            if (!wasSelected) selectCornerMarker(feature);
            hit = true;
            return true;
        }

        if (layer === AppState.shapeFileLayer) {
            const geomType = feature.getGeometry().getType();
            if (geomType === 'LineString') {
                // Egyenes kiválasztása NEM törli a kijelölt polygont
                const wasSelected = AppState.selectedLayer === feature;
                if (AppState.selectedLayer && AppState.selectedLayer !== feature) {
                    updateShapefileFeatureStyle(AppState.selectedLayer);
                }
                if (!wasSelected) selectLine(feature);
            } else if (geomType === 'Polygon') {
                // Csak másik poligonra kattintáskor töröljük az előző kijelölést
                const wasSelected = AppState.selectedPolygon === feature;
                if (!wasSelected) {
                    if (AppState.selectedPolygon) {
                        updateShapefileFeatureStyle(AppState.selectedPolygon);
                    }
                    selectPolygon(feature);
                }
            } else if (geomType === 'Point') {
                // Pont feature a shapefile-ban (nem sarokpont)
                // kattintásra: ne töröljük a kijelölt polygont
            }
            hit = true;
            return true;
        }

        return false;
    }, { hitTolerance: 10 });

    if (!hit) {
        // Ha üres területre kattintunk, csak akkor törlünk minden kijelölést, ha nincs kijelölt poligon
        if (!AppState.selectedPolygon) {
            deselectAll();
        }
        // Ha van kijelölt poligon, ne töröljük a kijelölést
    }
}

/** Sarokpont marker kiválasztása */

function deselectLineAndCorner() {
    // Vonal felezőpont gomb elrejtése
    const lineAddBtn = document.getElementById('line-add-btn');
    if (lineAddBtn) lineAddBtn.style.display = 'none';
    // Sarokpont akció menü elrejtése
    const cornerMenu = document.getElementById('corner-action-menu');
    if (cornerMenu) cornerMenu.style.display = 'none';
    // Vonal deselektálása
    if (AppState.selectedLayer) {
        updateShapefileFeatureStyle(AppState.selectedLayer);
        AppState.selectedLayer = null;
        AppState.selectedLineEOV = { start: null, end: null };
    }
    // Sarokpont deselektálása
    if (AppState.selectedCornerMarker) {
        const zoom = AppState.map?.getView()?.getZoom() || 10;
        const markerSize = getCornerMarkerSize(zoom);
        AppState.selectedCornerMarker.setStyle(getCornerMarkerStyle('yellow', markerSize));
        AppState.selectedCornerMarker = null;
    }
    AppState.selectedPointEOV = { x: null, y: null };
    AppState.selectedPointOL = null;
    // Szerkesztő ablakok elrejtése (ha léteznek)
    const moveBar = document.getElementById('corner-move-confirm');
    if (moveBar) moveBar.style.display = 'none';
    const lineMenu = document.getElementById('line-action-menu');
    if (lineMenu) lineMenu.style.display = 'none';
    if (typeof hideCornerActionMenu === 'function') hideCornerActionMenu();
    if (typeof hideLineAddButton === 'function') hideLineAddButton();
    if (typeof MoveState !== 'undefined' && MoveState.active) cancelCornerMove();
}

function selectCornerMarker(feature) {
    deselectLineAndCorner();

    AppState.selectedCornerMarker = feature;
    const zoom = AppState.map.getView().getZoom() || 10;
    feature.setStyle(getCornerMarkerStyle('red', getCornerMarkerSize(zoom)));

    // _eovCoord: transformer által számított precíz EOV { x: northing, y: easting } – koordináta megjelenítéshez, távolságszámításhoz
    AppState.selectedPointEOV = feature.get('_eovCoord') || { x: null, y: null };

    // OL geometry koordináta [easting, northing] – vizuális vonalrajzoláshoz (proj4 reprojekció egyezik a markerrel)
    const olCoord = feature.getGeometry().getCoordinates();
    AppState.selectedPointOL = olCoord;

    const eov = AppState.selectedPointEOV;
    Logger_Map.info('Sarokpont kijelölve', {
        olCoord,
        eovY: eov?.y,
        eovX: eov?.x
    });

    updateDistanceLine();

    // Akció menü megjelenítése (point-editor.js)
    if (typeof showCornerActionMenu === 'function') showCornerActionMenu(feature);
}

/** Vonalszakasz kiválasztása */

function selectLine(feature) {
    deselectLineAndCorner();

    AppState.selectedLayer = feature;
    feature.setStyle(new ol.style.Style({
        stroke: new ol.style.Stroke({
            color: CONSTANTS.COLORS.GREEN,
            width: CONSTANTS.GEOMETRY.SELECTED_LINE_WEIGHT
        })
    }));

    // EOV koordináták a feature properties-ből
    const eovCoords = feature.get('eov_coords');
    AppState.selectedLineEOV = eovCoords || { start: null, end: null };

    updateDistanceLine();

    // Hozzáad gomb megjelenítése (point-editor.js)
    if (typeof showLineAddButton === 'function') showLineAddButton(feature);
}

/** Poligon kiválasztása */
function selectPolygon(feature) {
    // Ne töröljük a poligon kijelölést, csak a többi referenciát és UI-t
    // Sarokpont akció menü elrejtése
    const cornerMenu = document.getElementById('corner-action-menu');
    if (cornerMenu) cornerMenu.style.display = 'none';
    // Vonal felezőpont gomb elrejtése
    const lineAddBtn = document.getElementById('line-add-btn');
    if (lineAddBtn) lineAddBtn.style.display = 'none';
    // Mozgatás megerősítő sáv elrejtése
    const moveBar = document.getElementById('corner-move-confirm');
    if (moveBar) moveBar.style.display = 'none';
    // Ha van vonal kijelölve, annak stílusát visszaállítjuk
    if (AppState.selectedLayer) {
        updateShapefileFeatureStyle(AppState.selectedLayer);
        AppState.selectedLayer = null;
        AppState.selectedLineEOV = { start: null, end: null };
    }
    // Ha van sarokpont kijelölve, annak stílusát visszaállítjuk
    if (AppState.selectedCornerMarker) {
        const zoom = AppState.map?.getView()?.getZoom() || 10;
        const markerSize = getCornerMarkerSize(zoom);
        AppState.selectedCornerMarker.setStyle(getCornerMarkerStyle('yellow', markerSize));
        AppState.selectedCornerMarker = null;
    }
    AppState.selectedPointEOV = { x: null, y: null };
    AppState.selectedPointOL = null;

    // Előző poligonhoz tartozó referenciák törlése
    AppState.selectedCornerMarker = null;
    AppState.selectedPointEOV = { x: null, y: null };
    AppState.selectedPointOL = null;

    AppState.selectedPolygon = feature;
    feature.setStyle(new ol.style.Style({
        stroke: new ol.style.Stroke({ color: CONSTANTS.COLORS.GREEN, width: CONSTANTS.GEOMETRY.SELECTED_LINE_WEIGHT }),
        fill: new ol.style.Fill({ color: 'rgba(0,255,0,0.3)' })
    }));

    // Sarokpont markerek törlése
    if (AppState.cornerVectorSource) {
        AppState.cornerVectorSource.clear();
    }
    AppState.allCornerMarkers = [];

    let eovCorners = feature.get('eov_corners') || [];
    let olRing = feature.getGeometry().getCoordinates()[0];
    if (!eovCorners.length) {
        // EOV sarokpontok OL geom koordinátákból
        eovCorners = olRing.map(c => ({ x: c[1], y: c[0] })); // x=northing, y=easting
    }

    // Csak a kijelölt poligon sarokpontjait rajzoljuk meg
    const zoom = AppState.map.getView().getZoom() || 10;
    const markerSize = getCornerMarkerSize(zoom);
    olRing.forEach((olCoord, index) => {
        const cornerFeature = new ol.Feature({
            geometry: new ol.geom.Point(olCoord)
        });
        const eovCoord = eovCorners[index] || null;
        cornerFeature.set('_eovCoord', eovCoord);
        cornerFeature.setStyle(getCornerMarkerStyle('yellow', markerSize));
        AppState.cornerVectorSource.addFeature(cornerFeature);
        AppState.allCornerMarkers.push(cornerFeature);
    });

    AppState.selectedPolygonEOV = eovCorners;
    AppState.selectedPolygonProperties = Object.assign({}, feature.getProperties());
    delete AppState.selectedPolygonProperties.geometry;

    if (eovCorners.length >= 3) {
        displayPolygonInfo(eovCorners, AppState.selectedPolygonProperties);
    }
}

/** Shapefile feature stílusának visszaállítása (normál/deselected) */
function updateShapefileFeatureStyle(feature) {
    if (!feature) return;
    const geomType = feature.getGeometry().getType();
    if (geomType === 'Polygon') {
        feature.setStyle(new ol.style.Style({
            stroke: new ol.style.Stroke({ color: CONSTANTS.COLORS.ORANGE, width: CONSTANTS.GEOMETRY.LINE_WEIGHT }),
            fill: new ol.style.Fill({ color: 'rgba(255,107,53,0.5)' })
        }));
    } else if (geomType === 'LineString') {
        feature.setStyle(new ol.style.Style({
            stroke: new ol.style.Stroke({ color: CONSTANTS.COLORS.ORANGE, width: CONSTANTS.GEOMETRY.LINE_WEIGHT })
        }));
    } else if (geomType === 'Point') {
        feature.setStyle(new ol.style.Style({
            image: new ol.style.Circle({
                radius: CONSTANTS.GEOMETRY.CORNER_MARKER_RADIUS,
                fill: new ol.style.Fill({ color: CONSTANTS.COLORS.ORANGE }),
                stroke: new ol.style.Stroke({ color: CONSTANTS.COLORS.WHITE, width: 1 })
            })
        }));
    }
}

/** Távolságvizualizáció törlése (distanceVectorSource clear) */
function clearDistanceVisualization() {
    if (AppState.distanceVectorSource) {
        AppState.distanceVectorSource.clear();
    }
    AppState.distanceLine = null;
    AppState.distanceLabel = null;
    AppState.perpendicularMarker = null;
}



// Kiválasztott layer resetelése
function deselectAll() {
    // Vonal felezőpont hozzáadás gomb elrejtése
    const lineAddBtn = document.getElementById('line-add-btn');
    if (lineAddBtn) lineAddBtn.style.display = 'none';
    // Sarokpont akció menü elrejtése
    const cornerMenu = document.getElementById('corner-action-menu');
    if (cornerMenu) cornerMenu.style.display = 'none';
    // Vonal deselektálása
    if (AppState.selectedLayer) {
        updateShapefileFeatureStyle(AppState.selectedLayer);
    }
    
    // Sarokpont deselektálása
    if (AppState.selectedCornerMarker) {
        const zoom = AppState.map?.getView()?.getZoom() || 10;
        const markerSize = getCornerMarkerSize(zoom);
        AppState.selectedCornerMarker.setStyle(getCornerMarkerStyle('yellow', markerSize));
    }
    
    // Poligon deselektálása
    if (AppState.selectedPolygon) {
        updateShapefileFeatureStyle(AppState.selectedPolygon);
    }
    
    // Távolságvizualizáció törlése
    clearDistanceVisualization();
    
    // Poligon panel elrejtése
    const polygonInfoPanel = DOMCache.get('polygon-info-panel');
    if (polygonInfoPanel) {
        polygonInfoPanel.style.display = 'none';
    }
    
    AppState.clearSelection();

    // Sarokpont akció menü és mozgatás mód törlése (point-editor.js)
    if (typeof hideCornerActionMenu === 'function') hideCornerActionMenu();
    if (typeof hideLineAddButton === 'function') hideLineAddButton();
    if (typeof MoveState !== 'undefined' && MoveState.active) cancelCornerMove();

    // Szerkesztő ablakok elrejtése (ha léteznek)
    const lineMenu = document.getElementById('line-action-menu');
    if (lineMenu) lineMenu.style.display = 'none';
    const moveBar = document.getElementById('corner-move-confirm');
    if (moveBar) moveBar.style.display = 'none';
}

// Pont-vonal távolság számítása a mathematics.js-ből betöltve

// Távolságvonal rajzolása az aktuális pozícióból a kijelölt elemhez
function updateDistanceLine(skipAutoZoom = false) {
    // Ha mozgatás mód aktív, nem rajzolunk távolságvonalat
    if (typeof MoveState !== 'undefined' && MoveState.active) {
        if (typeof updateMovingCorner === 'function') updateMovingCorner();
        return;
    }

    // Ha nincs aktuális pozíció
    if (!AppState.currentEOVX || !AppState.currentEOVY) {
        clearDistanceVisualization();
        return;
    }

    // Aktuális pozíció OL koordinátában (EPSG:23700: easting=EOV-Y, northing=EOV-X)
    const currentOL = [AppState.currentEOVY, AppState.currentEOVX];

    let distance = null;
    let targetOL = null;           // OL [easting, northing]
    let projectionOL = null;       // merőleges vetület OL koordinátája
    let distanceResult = null;

    window.perpendicularPerpOL = null;
    window.perpendicularPerpDistance = null;

    // Sarokpont kiválasztva
    if (AppState.selectedPointEOV.x && AppState.selectedPointEOV.y) {
        distance = Math.sqrt(
            Math.pow(AppState.selectedPointEOV.x - AppState.currentEOVX, 2) +
            Math.pow(AppState.selectedPointEOV.y - AppState.currentEOVY, 2)
        );
        // Rajzoláshoz az OL geometry koordináta használatos (marker vizuális pozíciójával egyezik)
        targetOL = AppState.selectedPointOL || [AppState.selectedPointEOV.y, AppState.selectedPointEOV.x];
    }
    // Vonal kiválasztva
    else if (AppState.selectedLineEOV.start && AppState.selectedLineEOV.end) {
        distanceResult = calculatePointToLineDistance(
            { x: AppState.currentEOVX, y: AppState.currentEOVY },
            AppState.selectedLineEOV.start,
            AppState.selectedLineEOV.end
        );

        distance    = distanceResult.distance;
        projectionOL = [distanceResult.projection.y, distanceResult.projection.x];
        targetOL    = projectionOL;

        if (distanceResult.t < 0 || distanceResult.t > 1) {
            window.perpendicularPerpOL       = [distanceResult.originalProjection.y, distanceResult.originalProjection.x];
            window.perpendicularPerpDistance = distanceResult.perpDistance;
            window.distanceResultT           = distanceResult.t;
        } else {
            window.perpendicularPerpOL       = null;
            window.perpendicularPerpDistance = null;
            window.distanceResultT           = null;
        }
    } else {
        clearDistanceVisualization();
        return;
    }

    // Előző vizualizáció törlése, újrarajzolás
    AppState.distanceVectorSource.clear();

    // Fő távolságvonal
    const mainLine = new ol.Feature({
        geometry: new ol.geom.LineString([currentOL, targetOL])
    });
    mainLine.setStyle(new ol.style.Style({
        stroke: new ol.style.Stroke({
            color: CONSTANTS.COLORS.PRIMARY_RED,
            width: CONSTANTS.GEOMETRY.LINE_WEIGHT,
            lineDash: [5, 5]
        })
    }));
    AppState.distanceVectorSource.addFeature(mainLine);
    AppState.distanceLine = mainLine;

    // Merőleges vetület marker (vonal kiválasztásakor)
    if (AppState.selectedLineEOV.start && projectionOL) {
        const projMarker = new ol.Feature({ geometry: new ol.geom.Point(projectionOL) });
        projMarker.setStyle(new ol.style.Style({
            image: new ol.style.Circle({
                radius: CONSTANTS.GEOMETRY.MARKER_CIRCLE_RADIUS,
                fill: new ol.style.Fill({ color: CONSTANTS.COLORS.PRIMARY_RED }),
                stroke: new ol.style.Stroke({ color: CONSTANTS.COLORS.WHITE, width: 1 })
            })
        }));
        AppState.distanceVectorSource.addFeature(projMarker);
        AppState.perpendicularMarker = projMarker;
    }

    // Meghosszabbított vonal (ha merőleges kívül esik a végpontokon)
    if (AppState.selectedLineEOV.start && AppState.selectedLineEOV.end &&
        window.perpendicularPerpOL && distanceResult) {

        const dx = AppState.selectedLineEOV.end.x - AppState.selectedLineEOV.start.x;
        const dy = AppState.selectedLineEOV.end.y - AppState.selectedLineEOV.start.y;
        const ef = CONSTANTS.GEOMETRY.EXTENDED_LINE_FACTOR;

        const extStart = [
            AppState.selectedLineEOV.start.y - dy * ef,
            AppState.selectedLineEOV.start.x - dx * ef
        ];
        const extEnd = [
            AppState.selectedLineEOV.end.y + dy * ef,
            AppState.selectedLineEOV.end.x + dx * ef
        ];

        // Piros szaggatott: aktuális pozícióból a vonal végponti vetületig
        const extLine = new ol.Feature({
            geometry: new ol.geom.LineString([currentOL, window.perpendicularPerpOL])
        });
        extLine.setStyle(new ol.style.Style({
            stroke: new ol.style.Stroke({
                color: CONSTANTS.COLORS.PRIMARY_RED,
                width: CONSTANTS.GEOMETRY.LINE_WEIGHT,
                lineDash: [5, 5]
            })
        }));
        AppState.distanceVectorSource.addFeature(extLine);

        // Zöld szaggatott: meghosszabbított eredeti vonal
        const greenLine = new ol.Feature({
            geometry: new ol.geom.LineString([extStart, extEnd])
        });
        greenLine.setStyle(new ol.style.Style({
            stroke: new ol.style.Stroke({
                color: CONSTANTS.COLORS.GREEN,
                width: CONSTANTS.GEOMETRY.LINE_WEIGHT,
                lineDash: [5, 5]
            })
        }));
        AppState.distanceVectorSource.addFeature(greenLine);
    }

    // Távolság felirat az aktuális pozíció fölé (térkép layer)
    const labelText = window.perpendicularPerpDistance
        ? `${formatDistance(distance)} (vég)\n${formatDistance(window.perpendicularPerpDistance)} (⊥)`
        : formatDistance(distance);
    const posLabel = new ol.Feature({ geometry: new ol.geom.Point([...currentOL]) });
    posLabel.setStyle(new ol.style.Style({
        text: new ol.style.Text({
            text: labelText,
            offsetY: -32,
            font: 'bold 28px sans-serif',
            fill: new ol.style.Fill({ color: '#fff' }),
            stroke: new ol.style.Stroke({ color: '#000', width: 6 }),
            textAlign: 'center'
        })
    }));
    AppState.distanceVectorSource.addFeature(posLabel);

    if (!skipAutoZoom) performAutoZoom();
}

// Auto zoom funkció
function performAutoZoom() {
    if (!AppState.autoZoomEnabled || AppState.isAutoZoomInProgress) return;
    if (!AppState.currentEOVX || !AppState.currentEOVY) return;

    const currentOL = [AppState.currentEOVY, AppState.currentEOVX];
    let extent = ol.extent.createEmpty();
    ol.extent.extendCoordinate(extent, currentOL);

    // Kijelölt pont hozzáadása
    if (AppState.selectedPointEOV.x && AppState.selectedPointEOV.y) {
        ol.extent.extendCoordinate(extent, AppState.selectedPointOL || [AppState.selectedPointEOV.y, AppState.selectedPointEOV.x]);
    }
    // Kijelölt vonal hozzáadása
    else if (AppState.selectedLineEOV.start && AppState.selectedLineEOV.end) {
        ol.extent.extendCoordinate(extent, [AppState.selectedLineEOV.start.y, AppState.selectedLineEOV.start.x]);
        ol.extent.extendCoordinate(extent, [AppState.selectedLineEOV.end.y,   AppState.selectedLineEOV.end.x]);
    } else {
        return;
    }

    if (!ol.extent.isEmpty(extent)) {
        AppState.setAutoZoomInProgress(true);
        const mapSize = AppState.map.getSize(); // [width, height]
        const padding  = Math.max(mapSize[0], mapSize[1]) * CONSTANTS.AUTO_ZOOM.DEFAULT_PADDING_PERCENT;
        AppState.map.getView().fit(extent, {
            padding: [padding, padding, padding, padding],
            maxZoom: RESOLUTIONS.length - 1,
            duration: 500
        });
        AppState.map.once('moveend', () => {
            AppState.setAutoZoomInProgress(false);
            // Auto zoom végén: SCREEN_CENTER forrás esetén a view végleges centeréből frissítjük
            // a currentEOVY/X értékeket, hogy a vonal kezdőpontja pontosan a markerrel essen egybe.
            const gpsSourceEl = document.getElementById('gpsSource');
            if (gpsSourceEl && gpsSourceEl.value === CONSTANTS.COORD_SYSTEMS.SCREEN_CENTER) {
                const finalCenter = AppState.map.getView().getCenter();
                AppState.currentEOVY = finalCenter[0];
                AppState.currentEOVX = finalCenter[1];
            }
            updateDistanceLine(true);
        });
    }
}

// Poligon információ megjelenítése
function displayPolygonInfo(eovCorners, properties) {
    const polygonInfoPanel = DOMCache.get('polygon-info-panel');
    const polygonArea = DOMCache.get('polygon-area');
    const polygonPerimeter = DOMCache.get('polygon-perimeter');
    const polygonProperties = DOMCache.get('polygon-properties');
    
    if (!polygonInfoPanel) return;
    
    // Terület és kerület számítása
    let areaText = '—';
    let perimeterText = '—';
    try {
        if (Array.isArray(eovCorners) && eovCorners.length >= 3) {
            const validCorners = eovCorners.filter(corner => {
                if (!corner) return false;
                if (Array.isArray(corner)) return corner.length >= 2 && isFinite(corner[0]) && isFinite(corner[1]);
                if (typeof corner === 'object') return isFinite(corner.x) && isFinite(corner.y);
                return false;
            });
            
            if (validCorners.length >= 3) {
                const area = calculatePolygonArea(validCorners);
                areaText = formatArea(area);
                const perimeter = calculatePolygonPerimeter(validCorners);
                perimeterText = formatDistance(perimeter);
            } else {
                Logger_Map.warn('Nem elég valid EOV sarokpont a terület számításához', { total: eovCorners.length, valid: validCorners.length });
            }
        } else {
            Logger_Map.warn('eovCorners nem megfelelő formátumban', { isArray: Array.isArray(eovCorners), length: eovCorners?.length });
        }
    } catch (err) {
        Logger_Map.error('Poligon terület számítás sikertelen', err);
    }
    polygonArea.textContent = areaText;
    if (polygonPerimeter) polygonPerimeter.textContent = perimeterText;
    
    // Properties megjelenítése
    let propertiesHTML = '';
    if (properties && Object.keys(properties).length > 0) {
        for (const [key, value] of Object.entries(properties)) {
            // EOV sarokpontok elrejtése (nagy adat)
            if (key === 'eov_corners') continue;
            
            let displayValue = value;
            if (typeof value === 'object') {
                displayValue = JSON.stringify(value);
            }
            
            propertiesHTML += `<div><strong>${key}:</strong> ${displayValue}</div>`;
        }
    } else {
        propertiesHTML = '<div style="color: #999;">Nincs további adat</div>';
    }
    polygonProperties.innerHTML = propertiesHTML;
    
    // Panel megjelenítése
    polygonInfoPanel.style.display = 'block';

    // Törlés gomb eseménykezelő hozzáadása
    const deleteBtn = document.getElementById('polygon-delete-btn');
    if (deleteBtn) {
        deleteBtn.onclick = function() {
            if (window.confirm('Biztosan törölni szeretnéd a kijelölt poligont?')) {
                deleteSelectedPolygon();
            }
        };
    }
// ---

// Kijelölt poligon törlése
function deleteSelectedPolygon() {
    if (!AppState.selectedPolygon || !AppState.shapeFileLayer) return;
    const src = AppState.shapeFileLayer.getSource();
    // Mentsd el a törlendő poligon sarokpontjait
    const deletedCorners = AppState.selectedPolygon.get('eov_corners') || [];
    src.removeFeature(AppState.selectedPolygon);

    // Töröljük a poligonhoz tartozó vonalakat (LineString), amelyek eov_coords property-je egyezik a poligon sarokpontjaival
    const featuresToRemove = src.getFeatures().filter(f => {
        if (f.getGeometry().getType() !== 'LineString') return false;
        const coords = f.get('eov_coords');
        if (!coords || !coords.start || !coords.end) return false;
        // Ellenőrizzük, hogy a vonal kezdő és végpontja a törölt poligon sarokpontjai között van-e
        return deletedCorners.some(c => c.x === coords.start.x && c.y === coords.start.y) &&
               deletedCorners.some(c => c.x === coords.end.x && c.y === coords.end.y);
    });
    featuresToRemove.forEach(f => src.removeFeature(f));

    // Sarokpontok törlése
    if (AppState.cornerVectorSource) {
        AppState.cornerVectorSource.clear();
    }
    AppState.allCornerMarkers = [];

    // Távolságvonalak törlése (ha van külön réteg)
    if (AppState.distanceVectorSource) {
        AppState.distanceVectorSource.clear();
    }

    deselectAll();
    // Törlés után azonnal mentsük az állapotot
    if (typeof sessionSave === 'function') sessionSave();
}
}

function updateGridStatusDisplay() {
    if (!AppState.transformer || typeof AppState.transformer.getGridStatus !== 'function') {
        return;
    }
    
    const gridStatus = AppState.transformer.getGridStatus();
    const accuracyElement = document.getElementById('gridAccuracy');
    const sourceElement = document.getElementById('gridSource');
    
    if (accuracyElement) {
        accuracyElement.textContent = gridStatus.accuracy;
    }
    if (sourceElement) {
        sourceElement.textContent = gridStatus.source;
    }
    
    Logger_Transform.debug('Grid status frissítve', gridStatus);
}

// Térkép középpontja frissítése az oldalon megnyitáskor
// Csak akkor frissít, ha "Térkép középpontja" van kiválasztva
function updateMapCenter() {
    const gpsSourceElement = document.getElementById('gpsSource');
    const source = gpsSourceElement ? gpsSourceElement.value : CONSTANTS.COORD_SYSTEMS.RTK;
    
    // Csak akkor frissítünk, ha a Térkép középpontja van kiválasztva
    if (source === CONSTANTS.COORD_SYSTEMS.SCREEN_CENTER) {
        convertFromSourceCoordinates(null, null);
        updateCoordinateDisplay();
    } else if (!AppState.isAutoZoomInProgress) {
        // Minden más forrásnál is frissítjük a távolságvonalat térkép mozgáskor
        updateDistanceLine();
    }
    
    // X jelölés frissítése - átadjuk a forrást
    updateScreenCenterMarker(source);
}

// Térkép középpontjának megjelölése – CSS crosshair mutatása/rejtése
function updateScreenCenterMarker(source) {
    const el = document.getElementById('screen-center-crosshair');
    if (!el) return;
    el.style.display = (source === CONSTANTS.COORD_SYSTEMS.SCREEN_CENTER) ? 'block' : 'none';
}

// GPS engedély banner megjelenítése / elrejtése
function showGpsPermissionBanner() {
    const badge = document.getElementById('gps-accuracy-badge');
    if (badge) {
        badge.textContent = '🔒 GPS tiltva';
        badge.className = 'gps-accuracy-badge acc-denied';
    }
    const banner = document.getElementById('gps-permission-banner');
    if (banner) banner.style.display = 'flex';
}

function hideGpsPermissionBanner() {
    const banner = document.getElementById('gps-permission-banner');
    if (banner) banner.style.display = 'none';
}

// GPS nyomkövetés
function startGPSTracking() {
    if (!navigator.geolocation) {
        Logger_GPS.warn('Geolocation API nem elérhető');
        showGpsPermissionBanner();
        return;
    }

    const watchOptions = {
        enableHighAccuracy: CONSTANTS.GPS.ENABLE_HIGH_ACCURACY,
        maximumAge: CONSTANTS.GPS.MAXIMUM_AGE
    };

    const onPosition = (position) => {
        hideGpsPermissionBanner();
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;

        // Valós mérési pontosság (mock location esetén is átkerül az RTK eszköztől)
        AppState.gpsAccuracy = position.coords.accuracy ?? null;
        updateGpsAccuracyDisplay();

        // Koordináta konverzió (forrás alapján)
        convertFromSourceCoordinates(lat, lon);

        // GPS marker OL-ban – csak ha NEM screenCenter forrás (ott a + jelölő mutatja a pozíciót)
        const activeSource = document.getElementById('gpsSource')?.value;
        if (activeSource === CONSTANTS.COORD_SYSTEMS.SCREEN_CENTER) {
            // screenCenter módban a GPS markert elrejtjük
            if (AppState.gpsOverlay) AppState.gpsOverlay.setPosition(undefined);
            updateCoordinateDisplay();
            return;
        }

        // GPS marker – DOM Overlay (canvas-mentes, Chrome-kompatibilis)
        if (AppState.currentEOVY && AppState.currentEOVX) {
            const eovCoord = [AppState.currentEOVY, AppState.currentEOVX];
            if (AppState.gpsOverlay) AppState.gpsOverlay.setPosition(eovCoord);
            // Követés mód: térkép közép folyamatosan a pozícióra kerül
            if (AppState.gpsFollowEnabled) {
                AppState.map.getView().setCenter(eovCoord);
            }
        }

        updateCoordinateDisplay();
    };

    const onError = (err) => {
        Logger_GPS.error('GPS pozíció lekérési hiba', err);
        if (err.code === 1 /* PERMISSION_DENIED */) {
            showGpsPermissionBanner();
        } else {
            showStatus('GPS hiba: ' + err.message, 'error');
        }
    };

    function beginWatch() {
        if (AppState.gpsWatchId !== null) return;
        AppState.gpsWatchId = navigator.geolocation.watchPosition(onPosition, onError, watchOptions);
    }

    function handleDenied() {
        Logger_GPS.warn('GPS engedély megtagadva');
        showGpsPermissionBanner();
    }

    if (navigator.permissions) {
        navigator.permissions.query({ name: 'geolocation' }).then(permResult => {
            if (permResult.state === 'granted') {
                beginWatch();
            } else if (permResult.state === 'prompt') {
                // Engedélykérő panel megjelenítése getCurrentPosition-nel
                navigator.geolocation.getCurrentPosition(
                    () => beginWatch(),
                    (err) => {
                        if (err.code === 1) handleDenied();
                        else beginWatch(); // timeout vagy egyéb hiba – próbáljuk watchPosition-nel
                    },
                    { enableHighAccuracy: CONSTANTS.GPS.ENABLE_HIGH_ACCURACY, timeout: 15000 }
                );
            } else {
                // denied
                handleDenied();
            }

            // Figyelés: ha a felhasználó később megváltoztatja az engedélyt
            permResult.onchange = () => {
                if (permResult.state === 'granted') {
                    hideGpsPermissionBanner();
                    beginWatch();
                } else if (permResult.state !== 'granted') {
                    stopGPSTracking();
                    showGpsPermissionBanner();
                }
            };
        }).catch(() => {
            // Permissions API nem elérhető (pl. régebbi Safari) – próbáljuk közvetlenül
            navigator.geolocation.getCurrentPosition(
                () => beginWatch(),
                (err) => { if (err.code === 1) handleDenied(); else beginWatch(); },
                { enableHighAccuracy: CONSTANTS.GPS.ENABLE_HIGH_ACCURACY, timeout: 15000 }
            );
        });
    } else {
        // Nincs Permissions API – getCurrentPosition mindig megmutatja a dialógust, ha szükséges
        navigator.geolocation.getCurrentPosition(
            () => beginWatch(),
            (err) => { if (err.code === 1) handleDenied(); else beginWatch(); },
            { enableHighAccuracy: CONSTANTS.GPS.ENABLE_HIGH_ACCURACY, timeout: 15000 }
        );
    }
}


// GPS követés be/ki kapcsolása
function centerOnGPS() {
    AppState.gpsFollowEnabled = !AppState.gpsFollowEnabled;
    const btn = document.getElementById('center-on-gps-btn');
    if (btn) btn.classList.toggle('gps-follow-active', AppState.gpsFollowEnabled);

    if (AppState.gpsFollowEnabled) {
        // Azonnali ugrás, zoom nélkül
        if (AppState.currentEOVY && AppState.currentEOVX) {
            AppState.map.getView().animate({
                center: [AppState.currentEOVY, AppState.currentEOVX],
                duration: 300
            });
        }
    }
}


// GPS nyomkövetés leállítása
function stopGPSTracking() {
    if (AppState.gpsWatchId !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(AppState.gpsWatchId);
        AppState.gpsWatchId = null;
        Logger_GPS.info('GPS tracking leállítva');
    }
    if (AppState.gpsOverlay) AppState.gpsOverlay.setPosition(undefined);
    AppState.gpsAccuracy = null;
    updateGpsAccuracyDisplay();
}

function updateGpsAccuracyDisplay() {
    // Oldalpanel érték
    const elPanel = document.getElementById('gpsAccuracyValue');
    // Jobb felső sarok badge
    const badge = document.getElementById('gps-accuracy-badge');

    if (AppState.gpsAccuracy === null) {
        if (elPanel) elPanel.textContent = '—';
        if (badge) {
            badge.textContent = '📡 —';
            badge.className = 'gps-accuracy-badge';
        }
        return;
    }

    // RTK fix esetén ~0.01-0.05 m, DGNSS ~0.3-1 m, autonóm ~3-10 m
    const m = AppState.gpsAccuracy;
    const label = m < 1 ? `±${(m * 100).toFixed(0)} cm` : `±${m.toFixed(1)} m`;

    if (elPanel) elPanel.textContent = label;

    if (badge) {
        badge.textContent = `📡 ${label}`;
        if (m > 1.5) {
            badge.className = 'gps-accuracy-badge acc-red';
        } else if (m > 0.1) {
            badge.className = 'gps-accuracy-badge acc-yellow';
        } else {
            badge.className = 'gps-accuracy-badge acc-green';
        }
    }
}

// parseKML, parseKMLCoordinates, shapefile feltöltés handler, showStatus -> file-handler.js
// Inicializálás blokk a fájl legvégére helyezve

// --- IDE KERÜL A FÁJL VÉGÉRE ---

window.addEventListener('DOMContentLoaded', () => {
    Logger_App.info('📱 Alkalmazás inicializálása kezdete...');
    try {
        initMap();

        // Munkamenet visszatöltése (session-store.js)
        if (typeof sessionLoad === 'function') sessionLoad();

        // MePAR rétegek (HRSZ) hozzáadása – térkép és layerControl már kész
        if (typeof initMePARLayers === 'function') {
            initMePARLayers();
        }

        // EOVTransformer inicializálás
        try {
            AppState.transformer = new EOVTransformer();
            Logger_Transform.success('EOVTransformer inicializálva');
            if (typeof updateGridStatusDisplay === 'function') updateGridStatusDisplay();
            AppState.transformer.loadGridFromWeb('etrs2eov_notowgs.gsb')
                .then(() => { if (typeof updateGridStatusDisplay === 'function') updateGridStatusDisplay(); })
                .catch(() => { Logger_Transform.warn('Grid betöltés sikertelen, Helmert fallback használva'); });
        } catch (err) {
            Logger_Transform.error('EOVTransformer init sikertelen', err);
        }

        startGPSTracking();
        initMobileMenu();
        initCoordPanelDrag();
        initProjectionModal();
        initFileFormatModal();
        initSourceModal();
        initCoordinateCopyHandlers();
        
        Logger_App.success('✅ Alkalmazás inicializálása teljes');
    } catch (err) {
        Logger_App.error('Inicializálás sikertelen', err);
        console.error('initMap error:', err);
    }
});


// ============ EDIT MODE TOGGLE LOGIC ============
window.editMode = false;

function setEditMode(on) {
    window.editMode = !!on;
    const btn = document.getElementById('toggle-edit-btn');
    if (btn) {
        if (window.editMode) btn.classList.add('edit-on');
        else btn.classList.remove('edit-on');
    }
    // Show/hide edit UI if something is selected
    // Show if a line or corner is selected and editMode is ON
    if (window.editMode) {
        if (AppState.selectedLayer && typeof showLineAddButton === 'function') {
            showLineAddButton(AppState.selectedLayer);
        }
        if (AppState.selectedCornerMarker && typeof showCornerActionMenu === 'function') {
            showCornerActionMenu(AppState.selectedCornerMarker);
        }
    } else {
        // Hide edit UI
        if (typeof hideLineAddButton === 'function') hideLineAddButton();
        if (typeof hideCornerActionMenu === 'function') hideCornerActionMenu();
    }
}

window.addEventListener('DOMContentLoaded', () => {
    // ...existing code...
    // Add edit mode toggle button logic
    const editBtn = document.getElementById('toggle-edit-btn');
    if (editBtn) {
        editBtn.addEventListener('click', () => {
            setEditMode(!window.editMode);
        });
    }
    // Always start with edit mode OFF
    setEditMode(false);
});

// Window resize kezelés - sidebar becsukása asztali nézetre váltásnál
window.addEventListener('resize', () => {
    const sidebar = document.getElementById('sidebar');
    const hamburger = document.getElementById('hamburgerBtn');
    if (window.innerWidth > CONSTANTS.UI.MOBILE_BREAKPOINT) {
        if (sidebar) sidebar.classList.remove(CONSTANTS.UI.CLASS_CLOSED);
        if (hamburger) hamburger.classList.remove(CONSTANTS.UI.CLASS_ACTIVE);
    }
});

// Cleanup: GPS nyomkövetés leállítása oldal bezárásakor
window.addEventListener('beforeunload', () => {
    stopGPSTracking();
});

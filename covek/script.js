// ============ KONSTANSOK ============
const CONSTANTS = {
    // Koordináta rendszerek
    COORD_SYSTEMS: {
        WGS84: 'wgs84',
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
    
    // Térkép elemek
    screenCenterMarker: null,
    
    // Kiválasztás - ETRF2000 koordináták
    selectedLayer: null,
    selectedCornerMarker: null,
    selectedPolygon: null,
    allCornerMarkers: [],
    selectedPointEOV: { x: null, y: null },
    selectedPointETRF2000: { lat: null, lon: null },
    selectedLineEOV: { start: null, end: null },
    selectedLineETRF2000: { start: null, end: null },
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
    
    setSelectedPoint(eovPoint, etrf2000Point) {
        this.selectedPointEOV = eovPoint || { x: null, y: null };
        this.selectedPointETRF2000 = etrf2000Point || { lat: null, lon: null };
    },
    getSelectedPoint() {
        return { eov: this.selectedPointEOV, etrf2000: this.selectedPointETRF2000 };
    },
    
    setSelectedLine(eovLine, etrf2000Line) {
        this.selectedLineEOV = eovLine || { start: null, end: null };
        this.selectedLineETRF2000 = etrf2000Line || { start: null, end: null };
    },
    getSelectedLine() {
        return { eov: this.selectedLineEOV, etrf2000: this.selectedLineETRF2000 };
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
        this.selectedPointETRF2000 = { lat: null, lon: null };
        this.selectedLineEOV = { start: null, end: null };
        this.selectedLineETRF2000 = { start: null, end: null };
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

// Sarokpont marker ikon generálása (szín és zoom alapján)
function getCornerMarkerIcon(color = 'yellow', size = 12) {
    const colorMap = {
        'yellow': '%23ffeb3b',  // Normál: sárga
        'red': '%23ff0000'      // Kiválasztott: piros
    };
    const hexColor = colorMap[color] || colorMap['yellow'];
    const radius = Math.max(2, size / 2 - 1);
    const viewSize = size * 2;
    const svgUrl = `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewSize} ${viewSize}"><circle cx="${viewSize/2}" cy="${viewSize/2}" r="${radius}" fill="${hexColor}" stroke="%23000" stroke-width="1"/></svg>`;
    
    return L.icon({
        iconUrl: svgUrl,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
        className: 'corner-marker'
    });
}

// Távolság formázás helper (cm vagy m)
// Matematikai függvények a mathematics.js-ből betöltve

// Minimális érvényes DBF fájl létrehozása (csak header, terminator, 0 record)
function createMinimalDBF() {
    // DBF formátum: 32 byte header + field descriptor terminator (1 byte) + data records
    // Ez egy üres, de érvényes DBF fájl
    const buffer = new ArrayBuffer(33);
    const view = new Uint8Array(buffer);
    
    // Header (32 byte)
    view[0] = 0x03; // dBASE III file
    view[1] = 126; // Last update: 2026 - 1900 = 126
    view[2] = 2;   // Month: February
    view[3] = 21;  // Day
    
    // Number of records: 0 (4 bytes, little-endian)
    view[4] = 0; view[5] = 0; view[6] = 0; view[7] = 0;
    
    // Data offset: 32 + 1 = 33 (index a field descriptor terminátortól)
    view[8] = 33; view[9] = 0;
    
    // Record size: 1 (csak a delete flag) (2 bytes, little-endian)
    view[10] = 1; view[11] = 0;
    
    // Reserved bytes (12-31): all 0
    for (let i = 12; i < 32; i++) {
        view[i] = 0;
    }
    
    // Field descriptor terminator (byte 32)
    view[32] = 0x0D;
    
    return buffer;
}

// Rétegek eltávolítása - helper funkció
function removeMapLayer(layer) {
    if (layer && AppState.map) {
        try {
            AppState.map.removeLayer(layer);
        } catch (err) {
            Logger_Map.debug('Layer removal (már eltávolítva vagy nem hozzáadva)', err.message);
        }
    }
}

// Több réteg eltávolítása egyszerre
function removeMapLayers(...layers) {
    layers.forEach(layer => removeMapLayer(layer));
}

// Megjelenítés - csak a meglévő értékeket jeleníti meg (ETRF2000)
function updateCoordinateDisplay() {
    document.getElementById('latETRF').textContent = AppState.currentLatETRF2000 ? AppState.currentLatETRF2000.toFixed(9) : '—';
    document.getElementById('lonETRF').textContent = AppState.currentLonETRF2000 ? AppState.currentLonETRF2000.toFixed(9) : '—';
    document.getElementById('eovY').textContent = AppState.currentEOVY ? AppState.currentEOVY.toFixed(2) : '—';
    document.getElementById('eovX').textContent = AppState.currentEOVX ? AppState.currentEOVX.toFixed(2) : '—';
}

// Egyeteme koordináta konverzió függvénye a mathematics.js-ből betöltve

// Térkép inicializálása
function initMap() {
    try {
        AppState.map = L.map('map', { zoomControl: false }).setView([47.5, 19.0], 8);
        Logger_Map.success('Leaflet map inicializálva');
        
        // Zoom opciók általános térképekhez
        const zoomOptions = {
            maxZoom: 25,
            maxNativeZoom: 19
        };
    
    // Zoom opciók Esri WorldImagery-ához (magasabb natív zoom)
    const esriImageryOptions = {
        maxZoom: 28,
        maxNativeZoom: 18
    };
    
    // Alapértelmezett térképréteg
    const osmLayer = L.tileLayer.provider('OpenStreetMap.Mapnik', zoomOptions).addTo(AppState.map);
    
    // Alternatív térképrétegek - AppState-ben tárolva az addMePARLayers() számára
    AppState.baseMaps = {
        'OpenStreetMap': L.tileLayer.provider('OpenStreetMap.Mapnik', zoomOptions),
        'Esri Műholdkép': L.tileLayer.provider('Esri.WorldImagery', esriImageryOptions)
    };
    
    // Overlay (be-/kikapcsolható) rétegek - AppState-ben tárolva, az addMePARLayers() később hozzáadja a rétegeket
    AppState.overlayMaps = {};
    
    // Térképkontrol hozzáadása és mentése az AppState-ben
    AppState.layerControl = L.control.layers(AppState.baseMaps, AppState.overlayMaps, { position: 'topright' }).addTo(AppState.map);
    
    // Explicit pane-ok a layerek sorrendjéhez
    AppState.map.createPane('polygonPane');
    AppState.map.getPane('polygonPane').style.zIndex = 250;
    
    AppState.map.createPane('linePane');
    AppState.map.getPane('linePane').style.zIndex = 200;
    
    AppState.map.createPane('cornerPane');
    AppState.map.getPane('cornerPane').style.zIndex = 300;
    
    // Zoom változáskor frissítsük a sarokpont markerek méretét
    AppState.map.on('zoomend', function() {
        const currentZoom = AppState.map.getZoom();
        const newSize = getCornerMarkerSize(currentZoom);
        
        AppState.allCornerMarkers.forEach(marker => {
            const isSelected = marker === AppState.selectedCornerMarker;
            const color = isSelected ? 'red' : 'yellow';
            marker.setIcon(getCornerMarkerIcon(color, newSize));
        });
    });
    } catch (err) {
        Logger_Map.error('Térkép inicializálás sikertelen', err);
        showStatus('Térkép betöltés hiba: ' + ErrorRecovery.getUserMessage(err), 'error');
    }
}

// Kiválasztott layer resetelése
function deselectAll() {
    // Vonal deselektálása
    if (AppState.selectedLayer) {
        if (AppState.selectedLayer.setStyle) {
            AppState.selectedLayer.setStyle({
                color: CONSTANTS.COLORS.ORANGE,
                weight: CONSTANTS.GEOMETRY.LINE_WEIGHT,
                opacity: 0.8
            });
        }
    }
    
    // Sarokpont deselektálása
    if (AppState.selectedCornerMarker) {
        const currentZoom = AppState.map.getZoom();
        const markerSize = getCornerMarkerSize(currentZoom);
        AppState.selectedCornerMarker.setIcon(getCornerMarkerIcon('yellow', markerSize));
    }
    
    // Poligon deselektálása
    if (AppState.selectedPolygon) {
        AppState.selectedPolygon.setStyle({
            color: CONSTANTS.COLORS.ORANGE,
            weight: CONSTANTS.GEOMETRY.LINE_WEIGHT,
            opacity: 0.8,
            fillColor: CONSTANTS.COLORS.ORANGE,
            fillOpacity: 0.5
        });
        AppState.selectedPolygon.bringToBack(); // Vissza az eredeti helyére
        AppState.selectedPolygon = null;
    }
    
    // Távolságvonal és label eltávolítása
    if (AppState.distanceLine) {
        if (AppState.distanceLine.extendedLine) {
            removeMapLayer(AppState.distanceLine.extendedLine);
        }
        if (AppState.distanceLine.lineExtension) {
            removeMapLayer(AppState.distanceLine.lineExtension);
        }
        removeMapLayer(AppState.distanceLine);
    }
    removeMapLayers(AppState.distanceLabel, AppState.perpendicularMarker);
    
    // Mérési és poligon panelok elrejtése
    const distanceInfoPanel = DOMCache.get('distance-info-panel');
    const polygonInfoPanel = DOMCache.get('polygon-info-panel');
    if (distanceInfoPanel) {
        distanceInfoPanel.style.display = 'none';
    }
    if (polygonInfoPanel) {
        polygonInfoPanel.style.display = 'none';
    }
    
    AppState.clearSelection();
}

// Pont-vonal távolság számítása a mathematics.js-ből betöltve

// Távolságvonal rajzolása az aktuális pozícióból a kijelölt elemhez
function updateDistanceLine() {
    // Ha nincs aktuális pozíció
    if (!AppState.currentEOVX || !AppState.currentEOVY || !AppState.currentLatWGS84 || !AppState.currentLonWGS84) {
        removeMapLayers(AppState.distanceLine, AppState.distanceLabel, AppState.perpendicularMarker);
        const distanceInfoPanel = DOMCache.get('distance-info-panel');
        if (distanceInfoPanel) {
            distanceInfoPanel.style.display = 'none';
        }
        return;
    }
    
    let distance = null;
    let targetWGS84 = null;
    let projectionWGS84 = null;
    let distanceResult = null;  // Tárolni fogja a calculatePointToLineDistance() eredményét
    const distanceInfoPanel = DOMCache.get('distance-info-panel');
    const distanceTextElement = DOMCache.get('distance-text');
    
    // Segédvonalak nullázása, ha nincs vonal kiválasztva
    window.perpendicularPerpWGS84 = null;
    window.perpendicularPerpDistance = null;
    
    // Mérési panel elrejtése
    if (distanceInfoPanel) {
        distanceInfoPanel.style.display = 'none';
    }
    
    // Sarokpont kiválasztva
    if (AppState.selectedPointEOV.x && AppState.selectedPointEOV.y && AppState.selectedPointETRF2000.lat && AppState.selectedPointETRF2000.lon) {
        distance = Math.sqrt(
            Math.pow(AppState.selectedPointEOV.x - AppState.currentEOVX, 2) + 
            Math.pow(AppState.selectedPointEOV.y - AppState.currentEOVY, 2)
        );
        targetWGS84 = AppState.selectedPointETRF2000;
    }
    // Vonal kiválasztva
    else if (AppState.selectedLineEOV.start && AppState.selectedLineEOV.end && AppState.selectedLineETRF2000.start && AppState.selectedLineETRF2000.end) {
        // Computálás EOV-ben (hogy a távolság méterben legyen)
        distanceResult = calculatePointToLineDistance(
            { x: AppState.currentEOVX, y: AppState.currentEOVY },
            AppState.selectedLineEOV.start,
            AppState.selectedLineEOV.end
        );
        
        distance = distanceResult.distance;
        
        // Vetület pont konvertálása EOV-ből ETRF2000-be
        const etrf = AppState.transformer.eov2etrf2000(distanceResult.projection.y, distanceResult.projection.x);
        projectionWGS84 = { lat: etrf.lat, lon: etrf.lon };
        targetWGS84 = projectionWGS84;
        
        // Ha a merőleges vetület kívül esik a vonal végpontjain
        if (distanceResult.t < 0 || distanceResult.t > 1) {
            const etrf_original = AppState.transformer.eov2etrf2000(distanceResult.originalProjection.y, distanceResult.originalProjection.x);
            window.perpendicularPerpWGS84 = { lat: etrf_original.lat, lon: etrf_original.lon };
            window.perpendicularPerpDistance = distanceResult.perpDistance;
            window.distanceResultT = distanceResult.t;
        } else {
            window.perpendicularPerpWGS84 = null;
            window.perpendicularPerpDistance = null;
            window.distanceResultT = null;
        }
    } else {
        // Nincs kiválasztott elem
        if (AppState.distanceLine) {
            AppState.map.removeLayer(AppState.distanceLine);
            AppState.distanceLine = null;
        }
        if (AppState.distanceLabel) {
            AppState.map.removeLayer(AppState.distanceLabel);
            AppState.distanceLabel = null;
        }
        if (AppState.perpendicularMarker) {
            AppState.map.removeLayer(AppState.perpendicularMarker);
            AppState.perpendicularMarker = null;
        }
        return;
    }
    
    // Eltávolítjuk az előző vonalakat és markereket
    if (AppState.distanceLine) {
        if (AppState.distanceLine.extendedLine) {
            AppState.map.removeLayer(AppState.distanceLine.extendedLine);
        }
        if (AppState.distanceLine.lineExtension) {
            AppState.map.removeLayer(AppState.distanceLine.lineExtension);
        }
        AppState.map.removeLayer(AppState.distanceLine);
    }
    if (AppState.distanceLabel) {
        AppState.map.removeLayer(AppState.distanceLabel);
    }
    if (AppState.perpendicularMarker && AppState.selectedLineEOV.start) {
        AppState.map.removeLayer(AppState.perpendicularMarker);
    }
    
    // Új vonal rajzolása
    AppState.distanceLine = L.polyline(
        [[AppState.currentLatWGS84, AppState.currentLonWGS84], [targetWGS84.lat, targetWGS84.lon]],
        {
            color: CONSTANTS.COLORS.PRIMARY_RED,
            weight: CONSTANTS.GEOMETRY.LINE_WEIGHT,
            opacity: 0.8,
            dashArray: '5, 5',
            pane: 'linePane'
        }
    ).addTo(AppState.map);
    
    // Ha vonal kiválasztva, rajzoljunk egy markert a vetület ponton
    if (AppState.selectedLineEOV.start && projectionWGS84) {
        AppState.perpendicularMarker = L.circleMarker([projectionWGS84.lat, projectionWGS84.lon], {
            radius: CONSTANTS.GEOMETRY.MARKER_CIRCLE_RADIUS,
            fillColor: CONSTANTS.COLORS.PRIMARY_RED,
            color: CONSTANTS.COLORS.WHITE,
            weight: 1,
            opacity: 1,
            fillOpacity: 0.8,
            pane: 'linePane'
        }).addTo(AppState.map);
    }
    
    // Ha az egyenes meghosszabbítva van (merőleges kívül van a vonal végpontjain)
    if (AppState.selectedLineEOV.start && AppState.selectedLineEOV.end && window.perpendicularPerpWGS84 && distanceResult) {
        // EOV-ben meghosszabbított vonal végpontjai
        const dx = AppState.selectedLineEOV.end.x - AppState.selectedLineEOV.start.x;
        const dy = AppState.selectedLineEOV.end.y - AppState.selectedLineEOV.start.y;
        
        const extendFactor = CONSTANTS.GEOMETRY.EXTENDED_LINE_FACTOR;
        const extendedStart = {
            x: AppState.selectedLineEOV.start.x - dx * extendFactor,
            y: AppState.selectedLineEOV.start.y - dy * extendFactor
        };
        
        const extendedEnd = {
            x: AppState.selectedLineEOV.end.x + dx * extendFactor,
            y: AppState.selectedLineEOV.end.y + dy * extendFactor
        };
        
        // Konvertálás ETRF2000-be megjelenítéshez
        const etrf_start = AppState.transformer.eov2etrf2000(extendedStart.y, extendedStart.x);
        const etrf_end = AppState.transformer.eov2etrf2000(extendedEnd.y, extendedEnd.x);
        
        // Piros szaggatott vonal az aktuális pozícióból a merőleges vetület pontra
        const extendedLine = L.polyline(
            [[AppState.currentLatWGS84, AppState.currentLonWGS84], [window.perpendicularPerpWGS84.lat, window.perpendicularPerpWGS84.lon]],
            {
                color: CONSTANTS.COLORS.PRIMARY_RED,
                weight: CONSTANTS.GEOMETRY.LINE_WEIGHT,
                opacity: 0.6,
                dashArray: '5, 5',
                pane: 'linePane'
            }
        ).addTo(AppState.map);
        AppState.distanceLine.extendedLine = extendedLine;
        
        // Zöld szaggatott vonal az eredeti egyenes meghosszabbítva
        const lineExtension = L.polyline(
            [[etrf_start.lat, etrf_start.lon], [etrf_end.lat, etrf_end.lon]],
            {
                color: CONSTANTS.COLORS.GREEN,
                weight: CONSTANTS.GEOMETRY.LINE_WEIGHT,
                opacity: 0.6,
                dashArray: '5, 5',
                pane: 'linePane'
            }
        ).addTo(AppState.map);
        AppState.distanceLine.lineExtension = lineExtension;
    }
    
    // Label a távolsággal/távolságokkal (középpontban)
    const midLat = (AppState.currentLatWGS84 + targetWGS84.lat) / 2;
    const midLon = (AppState.currentLonWGS84 + targetWGS84.lon) / 2;
    
    // Távolság megjelenítése méterben vagy centiméterben
    let distanceText = formatDistance(distance);
    
    // Ha van merőleges távolság is, mutasd azt
    let fullText = distanceText;
    if (window.perpendicularPerpDistance) {
        let perpText = formatDistance(window.perpendicularPerpDistance);
        fullText = `${distanceText} (vég)<br>${perpText} (⊥)`;
    }
    
    // Távolság kiírása az alsó panelbe
    if (distanceInfoPanel && distanceTextElement) {
        distanceTextElement.innerHTML = fullText;
        distanceInfoPanel.style.display = 'block';
    }
    
    // Auto zoom ha engedélyezett
    performAutoZoom();
}

// Auto zoom funkció
function performAutoZoom() {
    if (!AppState.autoZoomEnabled) return;
    if (AppState.isAutoZoomInProgress) return; // Rekurzió megakadályozása
    
    // Aktuális pozíció
    if (!AppState.currentLatWGS84 || !AppState.currentLonWGS84) return;
    
    let bounds = L.latLngBounds([
        [AppState.currentLatWGS84, AppState.currentLonWGS84]
    ]);
    
    // Kijelölt pont hozzáadása
    if (AppState.selectedPointETRF2000.lat && AppState.selectedPointETRF2000.lon) {
        bounds.extend([AppState.selectedPointETRF2000.lat, AppState.selectedPointETRF2000.lon]);
    }
    // Kijelölt vonal hozzáadása
    else if (AppState.selectedLineETRF2000.start && AppState.selectedLineETRF2000.end) {
        bounds.extend([AppState.selectedLineETRF2000.start.lat, AppState.selectedLineETRF2000.start.lon]);
        bounds.extend([AppState.selectedLineETRF2000.end.lat, AppState.selectedLineETRF2000.end.lon]);
    } else {
        return;
    }
    
    // Zoom a bounds-ra 20% padding-gel
    if (bounds.isValid()) {
        AppState.setAutoZoomInProgress(true);
        const mapSize = AppState.map.getSize();
        const padding = Math.max(mapSize.x, mapSize.y) * CONSTANTS.AUTO_ZOOM.DEFAULT_PADDING_PERCENT; // 10% per oldal = 20% total
        const maxZoom = AppState.map.getMaxZoom(); // Aktuális térkép maxZoom-ját használni
        AppState.map.fitBounds(bounds, { padding: [padding, padding], maxZoom: maxZoom });
        
        // Animáció befejezése után resetelni
        AppState.map.once('moveend', () => {
            AppState.setAutoZoomInProgress(false);
        });
    }
}

// Poligon információ megjelenítése
function displayPolygonInfo(eovCorners, properties) {
    const polygonInfoPanel = DOMCache.get('polygon-info-panel');
    const polygonArea = DOMCache.get('polygon-area');
    const polygonProperties = DOMCache.get('polygon-properties');
    
    if (!polygonInfoPanel) return;
    
    // Terület számítása - biztonságos error handling-gel
    let areaText = '—';
    try {
        // Validáció: eovCorners legyen array
        if (Array.isArray(eovCorners) && eovCorners.length >= 3) {
            // Szűrés: csak valid elemek
            const validCorners = eovCorners.filter(corner => {
                if (!corner) return false;
                if (Array.isArray(corner)) return corner.length >= 2 && isFinite(corner[0]) && isFinite(corner[1]);
                if (typeof corner === 'object') return isFinite(corner.x) && isFinite(corner.y);
                return false;
            });
            
            if (validCorners.length >= 3) {
                const area = calculatePolygonArea(validCorners);
                areaText = formatArea(area);
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
    const source = gpsSourceElement ? gpsSourceElement.value : CONSTANTS.COORD_SYSTEMS.WGS84;
    
    // Csak akkor frissítünk, ha a Térkép középpontja van kiválasztva
    if (source === CONSTANTS.COORD_SYSTEMS.SCREEN_CENTER) {
        convertFromSourceCoordinates(null, null);
        updateCoordinateDisplay();
    }
    
    // X jelölés frissítése - átadjuk a forrást
    updateScreenCenterMarker(source);
}

// Térkép középpontjának megjelölése X-el
function updateScreenCenterMarker(source) {
    if (source === CONSTANTS.COORD_SYSTEMS.SCREEN_CENTER) {
        const center = AppState.map.getCenter();
        
        if (!AppState.screenCenterMarker) {
            // Létrehozzuk az X marker-t
            AppState.screenCenterMarker = L.marker(center, {
                icon: L.icon({
                    iconUrl: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none" stroke="red" stroke-width="3" stroke-linecap="round"><line x1="4" y1="16" x2="28" y2="16"/><line x1="16" y1="4" x2="16" y2="28"/></svg>',
                    iconSize: [32, 32],
                    iconAnchor: [16, 16]
                })
            }).addTo(AppState.map);
        } else {
            // Frissítjük az X pozícióját
            AppState.screenCenterMarker.setLatLng(center);
        }
    } else {
        // Eltávolítjuk az X-et
        if (AppState.screenCenterMarker) {
            AppState.map.removeLayer(AppState.screenCenterMarker);
            AppState.screenCenterMarker = null;
        }
    }
}

// GPS nyomkövetés
function startGPSTracking() {
    if (!navigator.geolocation) {
        showStatus('Geolocation not available', 'error');
        return;
    }

    AppState.gpsWatchId = navigator.geolocation.watchPosition(
        (position) => {
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;
            
            // Konvertálás a DOM-ból kio lvasott forrásból
            convertFromSourceCoordinates(lat, lon);

            // Marker frissítése
            if (!AppState.gpsMarker) {
                AppState.gpsMarker = L.marker([lat, lon], {
                    icon: L.icon({
                        iconUrl: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/></svg>',
                        iconSize: [32, 32],
                        iconAnchor: [16, 16]
                    })
                }).addTo(AppState.map);
            } else {
                AppState.gpsMarker.setLatLng([lat, lon]);
            }

            // Koordináták megjelenítése
            updateCoordinateDisplay();
        },
        (err) => {
            Logger_GPS.error('GPS pozícía lekrérhıhiba', err);
            showStatus('GPS hiba: ' + err.message, 'error');
        },
        { 
            enableHighAccuracy: CONSTANTS.GPS.ENABLE_HIGH_ACCURACY, 
            maximumAge: CONSTANTS.GPS.MAXIMUM_AGE 
        }
    );
}

// GPS nyomkövetés leállítása
function stopGPSTracking() {
    if (AppState.gpsWatchId !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(AppState.gpsWatchId);
        AppState.gpsWatchId = null;
        Logger_GPS.info('GPS tracking leállítva');
    }
}

// Shapefile konverzió függvények a mathematics.js-ből betöltve

// Poligon területének kiszámítása Shoelace formula használatával
// A koordináták EOV koordináták (méter egységben)

// KML parser - XML-t GeoJSON-né konvertál
function parseKML(xmlString) {
    Logger_Shapefile.debug('KML feldolgozása');
    
    try {
        // XML parsolása
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlString, 'text/xml');
        
        // Hibakezelés XML parsolásnál
        if (xmlDoc.getElementsByTagName('parsererror').length > 0) {
            throw new Error('KML XML formátum érvénytelen');
        }
        
        const geoJSON = {
            type: 'FeatureCollection',
            features: []
        };
        
        // Placemarkokat feldolgozása
        const placemarks = xmlDoc.getElementsByTagName('Placemark');
        
        for (let i = 0; i < placemarks.length; i++) {
            const placemark = placemarks[i];
            
            // Név és leírás lekérdezése
            const nameElement = placemark.getElementsByTagName('name');
            const descElement = placemark.getElementsByTagName('description');
            const name = nameElement.length > 0 ? nameElement[0].textContent : `Feature ${i + 1}`;
            const description = descElement.length > 0 ? descElement[0].textContent : '';
            
            // Point feldolgozása
            const points = placemark.getElementsByTagName('Point');
            if (points.length > 0) {
                const coordElement = points[0].getElementsByTagName('coordinates');
                if (coordElement.length > 0) {
                    const coords = parseKMLCoordinates(coordElement[0].textContent);
                    if (coords.length > 0) {
                        const [lon, lat] = coords[0];
                        geoJSON.features.push({
                            type: 'Feature',
                            geometry: {
                                type: 'Point',
                                coordinates: [lon, lat]
                            },
                            properties: { name, description }
                        });
                    }
                }
            }
            
            // LineString feldolgozása
            const lineStrings = placemark.getElementsByTagName('LineString');
            if (lineStrings.length > 0) {
                const coordElement = lineStrings[0].getElementsByTagName('coordinates');
                if (coordElement.length > 0) {
                    const coords = parseKMLCoordinates(coordElement[0].textContent);
                    if (coords.length > 0) {
                        geoJSON.features.push({
                            type: 'Feature',
                            geometry: {
                                type: 'LineString',
                                coordinates: coords
                            },
                            properties: { name, description }
                        });
                    }
                }
            }
            
            // Polygon feldolgozása
            const polygons = placemark.getElementsByTagName('Polygon');
            if (polygons.length > 0) {
                const polygon = polygons[0];
                const outerBoundary = polygon.getElementsByTagName('outerBoundaryIs');
                
                if (outerBoundary.length > 0) {
                    const linearRing = outerBoundary[0].getElementsByTagName('LinearRing');
                    if (linearRing.length > 0) {
                        const coordElement = linearRing[0].getElementsByTagName('coordinates');
                        if (coordElement.length > 0) {
                            const outerCoords = parseKMLCoordinates(coordElement[0].textContent);
                            
                            if (outerCoords.length > 0) {
                                const coordinates = [outerCoords];
                                
                                // Belső határok (holes) feldolgozása
                                const innerBoundaries = polygon.getElementsByTagName('innerBoundaryIs');
                                for (let j = 0; j < innerBoundaries.length; j++) {
                                    const innerRing = innerBoundaries[j].getElementsByTagName('LinearRing');
                                    if (innerRing.length > 0) {
                                        const innerCoord = innerRing[0].getElementsByTagName('coordinates');
                                        if (innerCoord.length > 0) {
                                            const innerCoords = parseKMLCoordinates(innerCoord[0].textContent);
                                            if (innerCoords.length > 0) {
                                                coordinates.push(innerCoords);
                                            }
                                        }
                                    }
                                }
                                
                                geoJSON.features.push({
                                    type: 'Feature',
                                    geometry: {
                                        type: 'Polygon',
                                        coordinates: coordinates
                                    },
                                    properties: { name, description }
                                });
                            }
                        }
                    }
                }
            }
        }
        
        Logger_Shapefile.debug(`KML feldolgozva: ${geoJSON.features.length} feature`);
        return geoJSON;
        
    } catch (err) {
        Logger_Shapefile.error('KML feldolgozás sikertelen', err);
        throw new Error('KML feldolgozás sikertelen: ' + err.message);
    }
}

// KML koordináták parsolása
// KML formátum: "lon,lat,elevation lon,lat,elevation ..."
// Vagy: "lon,lat lon,lat ..."
function parseKMLCoordinates(coordString) {
    const coordinates = [];
    
    if (!coordString || typeof coordString !== 'string') {
        return coordinates;
    }
    
    // Whitespace alapján szétválasztott koordináta párok
    const pairs = coordString.trim().split(/\s+/);
    
    for (const pair of pairs) {
        const parts = pair.split(',');
        if (parts.length >= 2) {
            const lon = parseFloat(parts[0]);
            const lat = parseFloat(parts[1]);
            
            if (isFinite(lon) && isFinite(lat)) {
                coordinates.push([lon, lat]);
            }
        }
    }
    
    return coordinates;
}

// Shapefile feltöltés
document.getElementById('shapeFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    // Input validáció
    const validation = ValidationService.validateShapeFile(file);
    if (!validation.valid) {
        Logger_Shapefile.error('Fájl validáció sikertelen', validation.errors);
        showStatus(validation.errors.join(', '), 'error');
        return;
    }

    Logger_Shapefile.info(`Fájl feltöltés kezdete: ${file.name} (${(file.size / 1024).toFixed(2)} KB)`);
    showStatus('⏳ Fájl feldolgozása...', 'info');
    
    try {
        // Fájl típus detektálás
        const fileExtension = file.name.split('.').pop().toLowerCase();
        const isShpFile = fileExtension === 'shp';
        const isKmlFile = fileExtension === 'kml';
        
        let geoJsonConverted;
        
        // KML feldolgozása
        if (isKmlFile) {
            Logger_Shapefile.info('KML fájl feldolgozása');
            showStatus('⏳ KML feldolgozása...', 'info');
            
            try {
                const xmlString = await file.text();
                const geojson = parseKML(xmlString);
                
                // GeoJSON validáció
                const geoValidation = ValidationService.validateGeoJSON(geojson);
                if (!geoValidation.valid) {
                    Logger_Shapefile.error('GeoJSON validáció sikertelen', geoValidation.error);
                    showStatus(`KML feldolgozás sikertelen: ${geoValidation.error}`, 'error');
                    return;
                }
                
                Logger_Shapefile.success(`KML konvertálva: ${geojson.features.length} feature`);
                showStatus('⏳ Geometria feldolgozása...', 'info');
                
                const projection = document.getElementById('shapeFileProjection').value;
                geoJsonConverted = convertShapeToGeoJSON(geojson, projection);
                
            } catch (kmlErr) {
                Logger_Shapefile.error('KML feldolgozás sikertelen', kmlErr);
                showStatus('KML feldolgozás hiba: ' + ErrorRecovery.getUserMessage(kmlErr), 'error');
                return;
            }
        }
        
        // Shapefile feldolgozása (ZIP + .shp)
        else {
            // ArrayBuffer betöltése
            Logger_Shapefile.debug('ArrayBuffer betöltése', { size: file.size });
            let processedBuffer = await file.arrayBuffer();
            
            if (isShpFile) {
                Logger_Shapefile.info('Tömörítetlen .shp fájl - dummy .dbf generálása és ZIP-be csomagolása...');
                showStatus('⏳ .shp fájl feldolgozása: ZIP-be csomagolás...', 'info');
                
                try {
                    // dummy .dbf fájl létrehozása
                    const dbfBuffer = createMinimalDBF();
                    const dbfFileName = file.name.replace('.shp', '.dbf');
                    
                    // ZIP létrehozása az .shp és dummy .dbf fájlokkal
                    const zip = new JSZip();
                    zip.file(file.name, processedBuffer);
                    zip.file(dbfFileName, dbfBuffer);
                    
                    // ZIP generálása ArrayBuffer-ként
                    const zipArrayBuffer = await zip.generateAsync({ type: 'arraybuffer' });
                    Logger_Shapefile.debug('ZIP generálva', { originalShape: file.name, dbfFile: dbfFileName, zipSize: zipArrayBuffer.byteLength });
                    
                    // ZIP-et ArrayBuffer-ként használjuk a feldolgozáshoz
                    processedBuffer = zipArrayBuffer;
                    Logger_Shapefile.info('ZIP-el ellátott .shp kész feldolgozásra');
                } catch (zipErr) {
                    Logger_Shapefile.error('ZIP generálás sikertelen', zipErr);
                    throw new Error('Nem sikerült ZIP-be csomagolni az .shp fájlt: ' + zipErr.message);
                }
            }
            
            // shp.load() hívása timeout-tal és enhanced error handling
            Logger_Shapefile.debug('shp.load() indítása');
            let shapeData;
            
            try {
                // Timeout promise-t létrehozunk
                const timeoutPromise = new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Shapefile parse timeout (15s)')), 15000)
                );
                
                // Próba 1: Normál shp() hívás
                Logger_Shapefile.debug('Módszer 1: shp() direkt hívása');
                shapeData = await Promise.race([
                    shp(processedBuffer),
                    timeoutPromise
                ]);
                
            } catch (parseError1) {
                const errMsg = String(parseError1.message || parseError1);
                Logger_Shapefile.warn('Módszer 1 sikertelen', errMsg.substring(0, 200));
                
                // Próba 2: .prj fájl eltávolítása és újra próbálás
                Logger_Shapefile.debug('Módszer 2: .prj fájl eltávolítása és újra');
                try {
                    const jszip = new JSZip();
                    const zip = await jszip.loadAsync(processedBuffer);
                    
                    let hasPrj = false;
                    const fileList = [];
                    const filesToCopy = [];
                    
                    // Fájlok gyűjtése
                    zip.forEach((path, file) => {
                        fileList.push(path);
                        if (path.toLowerCase().endsWith('.prj')) {
                            hasPrj = true;
                            Logger_Shapefile.debug('.prj fájl kihagyása', { name: path });
                        } else {
                            filesToCopy.push({ path, file });
                        }
                    });
                    
                    if (!hasPrj) {
                        throw new Error('Nincs .prj fájl eltávolítható - próba 2 kihagyása');
                    }
                    
                    Logger_Shapefile.debug('Új ZIP generálása .prj nélkül', { fileCount: filesToCopy.length });
                    const newZip = new JSZip();
                    
                    // Összes fájl másolása az új ZIP-be (a .prj-n kívül)
                    for (const { path, file } of filesToCopy) {
                        const data = await file.async('arraybuffer');
                        newZip.file(path, data);
                    }
                    
                    const newArrayBuffer = await newZip.generateAsync({ type: 'arraybuffer' });
                    
                    // Újra próba az új ZIP-pel
                    const timeoutPromise2 = new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('Shapefile parse timeout (15s) - módszer 2')), 15000)
                    );
                    
                    shapeData = await Promise.race([
                        shp(newArrayBuffer),
                        timeoutPromise2
                    ]);
                    Logger_Shapefile.success('Módszer 2 sikeres (.prj nélkül)');
                    
                } catch (prjErr) {
                    Logger_Shapefile.error('Módszer 2 sikertelen', String(prjErr.message).substring(0, 200));
                    throw parseError1; // Az eredeti hibát dobunk
                }
            }
            
            // ShapeData validáció
            if (!shapeData || !shapeData.features) {
                throw new Error('Shapefile feldolgozás sikertelen: érvénytelen formátum (nincs features)');
            }
            
            Logger_Shapefile.debug(`ShapeData feldolgozva: ${shapeData.features.length} feature`);
            
            const projection = document.getElementById('shapeFileProjection').value;
            geoJsonConverted = convertShapeToGeoJSON(shapeData, projection);
            
            // GeoJSON validáció
            const geoValidation = ValidationService.validateGeoJSON(geoJsonConverted);
            if (!geoValidation.valid) {
                Logger_Shapefile.error('GeoJSON validáció sikertelen', geoValidation.error);
                showStatus(`Shapefile feldolgozás sikertelen: ${geoValidation.error}`, 'error');
                return;
            }

            Logger_Shapefile.success(`GeoJSON konvertálva: ${geoJsonConverted.features.length} feature`);
        }
        
        showStatus('⏳ Geometria feldolgozása...', 'info');
        
        // Poligonok feldarabolása vonalakra (szegmentekre)
        const lineSegments = [];
        geoJsonConverted.features.forEach((feature) => {
            if (feature.geometry.type === 'Polygon') {
                const outerRing = feature.geometry.coordinates[0];
                const eovCorners = feature.properties?.eov_corners || [];
                // Minden szomszédos pont pár közé vonalat hozunk létre
                for (let i = 0; i < outerRing.length - 1; i++) {
                    const lineFeature = {
                        type: 'Feature',
                        geometry: {
                            type: 'LineString',
                            coordinates: [outerRing[i], outerRing[i + 1]]
                        },
                        properties: {
                            ...feature.properties,
                            // Az edge EOV koordinátái
                            eov_coords: eovCorners.length > i + 1 
                                ? { start: eovCorners[i], end: eovCorners[i + 1] }
                                : null
                        }
                    };
                    lineSegments.push(lineFeature);
                }
            }
        });
        geoJsonConverted.features.push(...lineSegments);
        
        if (AppState.shapeFileLayer) {
            AppState.map.removeLayer(AppState.shapeFileLayer);
            // Sarokpont markerek eltávolítása
            AppState.allCornerMarkers.forEach(marker => {
                AppState.map.removeLayer(marker);
            });
            AppState.allCornerMarkers = [];
            deselectAll();
        }
        
        showStatus('⏳ Térképre rajzolás...', 'info');
        
        AppState.shapeFileLayer = L.geoJSON(geoJsonConverted, {
            style: (feature) => {
                if (feature.geometry.type === 'Polygon') {
                    return {
                        color: CONSTANTS.COLORS.ORANGE,
                        weight: CONSTANTS.GEOMETRY.LINE_WEIGHT,
                        opacity: 0.8,
                        fillColor: CONSTANTS.COLORS.ORANGE,
                        fillOpacity: 0.5,
                        fill: true,
                        pane: 'polygonPane'
                    };
                } else {
                    return {
                        color: CONSTANTS.COLORS.ORANGE,
                        weight: CONSTANTS.GEOMETRY.LINE_WEIGHT,
                        opacity: 0.8,
                        pane: 'linePane'
                    };
                }
            },
            pointToLayer: (feature, latlng) => {
                const pointMarker = L.circleMarker(latlng, {
                    radius: CONSTANTS.GEOMETRY.CORNER_MARKER_RADIUS,
                    fillColor: CONSTANTS.COLORS.ORANGE,
                    color: CONSTANTS.COLORS.WHITE,
                    weight: CONSTANTS.GEOMETRY.LINE_WEIGHT,
                    opacity: 1,
                    fillOpacity: 0.8,
                    bubblingMouseEvents: false,
                    pane: 'linePane'
                });
                return pointMarker;
            },
            onEachFeature: (feature, layer) => {
                if (feature.geometry.type === 'LineString') {
                    // Láthatatlan, vastagabb polyline a kattintási területhez
                    const coords = feature.geometry.coordinates.map(c => [c[1], c[0]]);
                    const ghostPolyline = L.polyline(coords, {
                        color: 'transparent',
                        weight: 20,
                        opacity: 0,
                        lineJoin: 'round',
                        lineCap: 'round',
                        interactive: true,
                        pane: 'linePane'
                    }).addTo(AppState.map);
                    
                    // Ghost polyline click → eredeti layer-en
                    ghostPolyline.on('click', (e) => {
                        L.DomEvent.stopPropagation(e);
                        
                        // Ha ugyanazt a vonalat kattintjuk → kijelölés törlése
                        if (AppState.selectedLayer === layer) {
                            deselectAll();
                        } else {
                            // Vonal kiválasztása
                            AppState.selectedLayer = layer;
                            layer.setStyle({
                                color: CONSTANTS.COLORS.GREEN, // Zöld szín a kiválasztottnak
                                weight: CONSTANTS.GEOMETRY.SELECTED_LINE_WEIGHT,
                                opacity: 1.0
                            });
                            
                            // EOV és ETRF2000 koordináták már a properties-ben vannak
                            const lineCoords = feature.geometry.coordinates;
                            AppState.selectedLineETRF2000 = {
                                start: { lat: lineCoords[0][1], lon: lineCoords[0][0] },
                                end: { lat: lineCoords[1][1], lon: lineCoords[1][0] }
                            };
                            
                            // EOV koordináták a properties-ből
                            if (feature.properties && feature.properties.eov_coords) {
                                AppState.selectedLineEOV = feature.properties.eov_coords;
                            } else {
                                AppState.selectedLineEOV = { start: null, end: null };
                            }
                            
                            // Távolságvonal rajzolása
                            updateDistanceLine();
                            Logger_Map.debug('Vonal kiválasztva', feature.geometry.coordinates);
                        }
                    });
                    
                } else if (feature.geometry.type === 'Polygon') {
                    // Polygon kijelölés kezelése
                    layer.on('click', (e) => {
                        L.DomEvent.stopPropagation(e);
                        
                        // Ha ugyanazt a poligont kattintjuk → kijelölés törlése
                        if (AppState.selectedPolygon === layer) {
                            deselectAll();
                        } else {
                            // Előző kiválasztott resetelése
                            if (AppState.selectedPolygon) {
                                AppState.selectedPolygon.setStyle({
                                    color: CONSTANTS.COLORS.ORANGE,
                                    weight: CONSTANTS.GEOMETRY.LINE_WEIGHT,
                                    opacity: 0.8,
                                    fillColor: CONSTANTS.COLORS.ORANGE,
                                    fillOpacity: 0.5
                                });
                            }
                            
                            // Poligon kiválasztása - zöld stílus
                            AppState.selectedPolygon = layer;
                            layer.setStyle({
                                color: CONSTANTS.COLORS.GREEN,
                                weight: CONSTANTS.GEOMETRY.SELECTED_LINE_WEIGHT,
                                opacity: 1.0,
                                fillColor: CONSTANTS.COLORS.GREEN,
                                fillOpacity: 0.5
                            });
                            
                            // EOV koordináták a properties-ből, fallback: WGS84-ből konvertálva
                            let eovCorners = feature.properties?.eov_corners || [];
                            
                            // Ha nincs eov_corners, konvertáljuk a WGS84 koordinátákat
                            if (!eovCorners || eovCorners.length === 0) {
                                const outerRing = feature.geometry.coordinates[0];
                                eovCorners = outerRing.map(coord => {
                                    try {
                                        const etrf = AppState.transformer.wgs84_2etrf2000(coord[1], coord[0]);
                                        const eov = AppState.transformer.etrf2000_2eov(etrf.lat, etrf.lon);
                                        return { x: eov.x, y: eov.y };
                                    } catch (err) {
                                        Logger_Map.warn('EOV konverzió sikertelen koordinátához', { coord });
                                        return null;
                                    }
                                }).filter(c => c !== null);
                            }
                            
                            AppState.selectedPolygonEOV = eovCorners;
                            AppState.selectedPolygonProperties = feature.properties || {};
                            
                            // Poligon info megjelenítése
                            if (eovCorners.length >= 3) {
                                displayPolygonInfo(eovCorners, feature.properties);
                            } else {
                                Logger_Map.warn('Poligon terület számítás sikertelen - nincs elég EOV koordináta');
                            }
                        }
                    });
                    
                    // Polygon esetén sarokpontok megjelenítése
                    const outerRing = feature.geometry.coordinates[0];
                    outerRing.forEach((coord, index) => {
                        // Fixed-size SVG marker azért, hogy nem nagyít fel zoom-nál
                        const currentZoom = AppState.map.getZoom();
                        const markerSize = getCornerMarkerSize(currentZoom);
                        const cornerMarker = L.marker([coord[1], coord[0]], {
                            icon: getCornerMarkerIcon('yellow', markerSize),
                            pane: 'cornerPane'
                        });
                        
                        cornerMarker.on('click', (e) => {
                            L.DomEvent.stopPropagation(e);
                            
                            // Ha ugyanazt a pontot kattintjuk → kijelölés törlése
                            if (AppState.selectedCornerMarker === cornerMarker) {
                                deselectAll();
                            } else {
                                // Előző kiválasztott resetelése
                                // (A deselectAll() már csinálta)
                                
                                // Sarokpont kiválasztása
                                AppState.selectedCornerMarker = cornerMarker;
                                const currentZoom = AppState.map.getZoom();
                                const markerSize = getCornerMarkerSize(currentZoom);
                                cornerMarker.setIcon(getCornerMarkerIcon('red', markerSize));
                                
                                // ETRF2000 és EOV koordináták már a properties-ben vannak (a corner index alapján)
                                AppState.selectedPointETRF2000 = { lat: coord[1], lon: coord[0] };
                                
                                if (feature.properties && feature.properties.eov_corners) {
                                    AppState.selectedPointEOV = feature.properties.eov_corners[index];
                                } else {
                                    AppState.selectedPointEOV = { x: null, y: null };
                                }
                                
                                // Távolságvonal rajzolása
                                updateDistanceLine();
                                Logger_Map.debug('Sarokpont kiválasztva', { coord, index, eov: AppState.selectedPointEOV, etrf2000: AppState.selectedPointETRF2000 });
                            }
                        });
                        
                        cornerMarker.addTo(AppState.map);
                        AppState.allCornerMarkers.push(cornerMarker);
                    });
                }
            }
        }).addTo(AppState.map);
        
        const bounds = AppState.shapeFileLayer.getBounds();
        if (bounds.isValid()) {
            AppState.map.fitBounds(bounds);
        }
        
        showStatus(`✓ ${geoJsonConverted.features.length} geometria betöltve`, 'status');
    } catch (err) {
        Logger_Shapefile.error('Shapefile feldolgozás hiba', err);
        const userMsg = ErrorRecovery.getUserMessage(err);
        showStatus(`Shapefile betöltés sikertelen: ${userMsg}`, 'error');
    }
});

function showStatus(message, type = 'status') {
    const elem = document.getElementById('shapeFileStatus');
    elem.textContent = message;
    elem.className = type === 'error' ? 'status error' : (type === 'warning' ? 'status warning' : 'status');
}

// Inicializálás
window.addEventListener('DOMContentLoaded', () => {
    Logger_App.info('📱 Alkalmazás inicializálása kezdete...');
    
    try {
        initMap();
        initTransformer();
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
    }
    
    // Map kattintás → kiválasztás törlése (ha nem feature-re kattint)
    AppState.map.on('click', () => {
        deselectAll();
    });
    
    // Térkép mozgatáskor a koordináták frissítése (folyamatosan, nem csak mozgatás végén)
    AppState.map.on('move', updateMapCenter);
    updateMapCenter();
    
    // gpsSource select change event
    const gpsSourceElement = document.getElementById('gpsSource');
    if (gpsSourceElement) {
        gpsSourceElement.addEventListener('change', () => {
            const newSource = gpsSourceElement.value;
            if (newSource === 'screenCenter') {
                convertFromSourceCoordinates(null, null);
                updateCoordinateDisplay();
            }
            updateScreenCenterMarker(newSource);
        });
    }
    
    // Auto zoom checkbox event
    const autoZoomCheckbox = document.getElementById('autoZoomEnable');
    if (autoZoomCheckbox) {
        autoZoomCheckbox.addEventListener('change', () => {
            AppState.autoZoomEnabled = autoZoomCheckbox.checked;
            if (AppState.autoZoomEnabled) {
                performAutoZoom();
            }
        });
    }
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

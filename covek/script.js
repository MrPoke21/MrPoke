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
    shapeFileLayer: null,
    
    // GPS
    gpsMarker: null,
    gpsWatchId: null,
    
    // Térkép elemek
    screenCenterMarker: null,
    
    // Kiválasztás
    selectedLayer: null,
    selectedCornerMarker: null,
    allCornerMarkers: [],
    selectedPointEOV: { x: null, y: null },
    selectedPointWGS84: { lat: null, lon: null },
    selectedLineEOV: { start: null, end: null },
    selectedLineWGS84: { start: null, end: null },
    
    // Megjelenítés (távolság, segédvonalak)
    distanceLine: null,
    distanceLabel: null,
    perpendicularMarker: null,
    
    // Koordináták
    currentLatWGS84: null,
    currentLonWGS84: null,
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
    
    setSelectedPoint(eovPoint, wgs84Point) {
        this.selectedPointEOV = eovPoint || { x: null, y: null };
        this.selectedPointWGS84 = wgs84Point || { lat: null, lon: null };
    },
    getSelectedPoint() {
        return { eov: this.selectedPointEOV, wgs84: this.selectedPointWGS84 };
    },
    
    setSelectedLine(eovLine, wgs84Line) {
        this.selectedLineEOV = eovLine || { start: null, end: null };
        this.selectedLineWGS84 = wgs84Line || { start: null, end: null };
    },
    getSelectedLine() {
        return { eov: this.selectedLineEOV, wgs84: this.selectedLineWGS84 };
    },
    
    setCurrentCoordinates(latWGS84, lonWGS84, latETRF2000, lonETRF2000, eovY, eovX) {
        this.currentLatWGS84 = latWGS84;
        this.currentLonWGS84 = lonWGS84;
        this.currentLatETRF2000 = latETRF2000;
        this.currentLonETRF2000 = lonETRF2000;
        this.currentEOVY = eovY;
        this.currentEOVX = eovX;
    },
    getCurrentCoordinates() {
        return {
            wgs84: { lat: this.currentLatWGS84, lon: this.currentLonWGS84 },
            etrf2000: { lat: this.currentLatETRF2000, lon: this.currentLonETRF2000 },
            eov: { y: this.currentEOVY, x: this.currentEOVX }
        };
    },
    
    clearSelection() {
        this.selectedLayer = null;
        this.selectedCornerMarker = null;
        this.selectedPointEOV = { x: null, y: null };
        this.selectedPointWGS84 = { lat: null, lon: null };
        this.selectedLineEOV = { start: null, end: null };
        this.selectedLineWGS84 = { start: null, end: null };
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

// Távolság formázás helper (cm vagy m)
function formatDistance(distanceInMeters) {
    if (distanceInMeters < CONSTANTS.DISTANCE.CM_THRESHOLD) {
        return (distanceInMeters * 100).toFixed(CONSTANTS.DISTANCE.DECIMAL_PLACES) + ' cm';
    } else {
        return distanceInMeters.toFixed(CONSTANTS.DISTANCE.DECIMAL_PLACES) + ' m';
    }
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

// Megjelenítés - csak a meglévő értékeket jeleníti meg
function updateCoordinateDisplay() {
    document.getElementById('lat').textContent = AppState.currentLatWGS84 ? AppState.currentLatWGS84.toFixed(8) : '—';
    document.getElementById('lon').textContent = AppState.currentLonWGS84 ? AppState.currentLonWGS84.toFixed(8) : '—';
    document.getElementById('latETRF').textContent = AppState.currentLatETRF2000 ? AppState.currentLatETRF2000.toFixed(8) : '—';
    document.getElementById('lonETRF').textContent = AppState.currentLonETRF2000 ? AppState.currentLonETRF2000.toFixed(8) : '—';
    document.getElementById('eovY').textContent = AppState.currentEOVY ? AppState.currentEOVY.toFixed(2) : '—';
    document.getElementById('eovX').textContent = AppState.currentEOVX ? AppState.currentEOVX.toFixed(2) : '—';
}

// Univerzális koordináta konverzió függvény
// x, y: bemeneti koordináták
// A forrás koordináta-rendszert a DOM-ból olvassa ki (gpsSource select)
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
    
    // Alternatív térképrétegek
    const baseMaps = {
        'OpenStreetMap': L.tileLayer.provider('OpenStreetMap.Mapnik', zoomOptions),
        'Esri Műholdkép': L.tileLayer.provider('Esri.WorldImagery', esriImageryOptions)
    };
    
    // Térképkontrol hozzáadása
    L.control.layers(baseMaps, null, { position: 'topright' }).addTo(AppState.map);
    
    // Explicit pane-ok a layerek sorrendjéhez
    AppState.map.createPane('polygonPane');
    AppState.map.getPane('polygonPane').style.zIndex = 100;
    
    AppState.map.createPane('linePane');
    AppState.map.getPane('linePane').style.zIndex = 200;
    
    AppState.map.createPane('cornerPane');
    AppState.map.getPane('cornerPane').style.zIndex = 300;
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
        AppState.selectedCornerMarker.setStyle({
            fillColor: CONSTANTS.COLORS.YELLOW
        });
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
    
    // Mérési panel elrejtése
    const distanceInfoPanel = DOMCache.get('distance-info-panel');
    if (distanceInfoPanel) {
        distanceInfoPanel.style.display = 'none';
    }
    
    AppState.clearSelection();
}

// Pont-vonal távolság számítása és a merőleges vetület megtalálása
// Koordináták EOV-ban
function calculatePointToLineDistance(pointEOV, lineStartEOV, lineEndEOV) {
    const px = pointEOV.x;
    const py = pointEOV.y;
    const x1 = lineStartEOV.x;
    const y1 = lineStartEOV.y;
    const x2 = lineEndEOV.x;
    const y2 = lineEndEOV.y;
    
    // Vonal vektora
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lineLengthSq = dx * dx + dy * dy;
    
    // Floating point precision: 1e-10 alatt tekintjük 0-nak
    if (Math.abs(lineLengthSq) < 1e-10) {
        // A vonal egy pont, vissza az első ponthoz
        const dpx = px - x1;
        const dpy = py - y1;
        return { 
            distance: Math.sqrt(dpx * dpx + dpy * dpy), 
            projection: { x: x1, y: y1 },
            t: 0,
            perpDistance: Math.sqrt(dpx * dpx + dpy * dpy),
            originalProjection: { x: x1, y: y1 }
        };
    }
    
    // Pont vetítésének paramétere a vonalon (nem korlátozottá)
    const dpx = px - x1;
    const dpy = py - y1;
    const t_original = (dpx * dx + dpy * dy) / lineLengthSq;
    
    // Vetület pont az eredeti egyenesen (nem korlátozott)
    const projX_original = x1 + t_original * dx;
    const projY_original = y1 + t_original * dy;
    
    // Merőleges távolság az egyeneshez
    const perpDistX = px - projX_original;
    const perpDistY = py - projY_original;
    const perpDistance = Math.sqrt(perpDistX * perpDistX + perpDistY * perpDistY);
    
    // Korlátozás [0, 1] sorra (a végpontok közé)
    const t_clamped = Math.max(0, Math.min(1, t_original));
    
    // Vetület pont a vonal végpontjai között
    const projX = x1 + t_clamped * dx;
    const projY = y1 + t_clamped * dy;
    
    // Távolság a legközelebb végponthoz
    const distX = px - projX;
    const distY = py - projY;
    const distance = Math.sqrt(distX * distX + distY * distY);
    
    return { 
        distance, 
        projection: { x: projX, y: projY },
        t: t_original,
        perpDistance: perpDistance,
        originalProjection: { x: projX_original, y: projY_original }
    };
}

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
    if (AppState.selectedPointEOV.x && AppState.selectedPointEOV.y && AppState.selectedPointWGS84.lat && AppState.selectedPointWGS84.lon) {
        distance = Math.sqrt(
            Math.pow(AppState.selectedPointEOV.x - AppState.currentEOVX, 2) + 
            Math.pow(AppState.selectedPointEOV.y - AppState.currentEOVY, 2)
        );
        targetWGS84 = AppState.selectedPointWGS84;
    }
    // Vonal kiválasztva
    else if (AppState.selectedLineEOV.start && AppState.selectedLineEOV.end && AppState.selectedLineWGS84.start && AppState.selectedLineWGS84.end) {
        const result = calculatePointToLineDistance(
            { x: AppState.currentEOVX, y: AppState.currentEOVY },
            AppState.selectedLineEOV.start,
            AppState.selectedLineEOV.end
        );
        
        distance = result.distance;
        
        // Vetület pont WGS84-re konvertálása
        const etrf = AppState.transformer.eov2etrf2000(result.projection.y, result.projection.x);
        projectionWGS84 = AppState.transformer.etrf2000_2wgs84(etrf.lat, etrf.lon);
        targetWGS84 = projectionWGS84;
        
        // Ha a merőleges vetület kívül esik a vonal végpontjain, tárolom az eredeti vetületet
        if (result.t < 0 || result.t > 1) {
            const etrf_original = AppState.transformer.eov2etrf2000(result.originalProjection.y, result.originalProjection.x);
            const perpWGS84 = AppState.transformer.etrf2000_2wgs84(etrf_original.lat, etrf_original.lon);
            window.perpendicularPerpWGS84 = perpWGS84;
            window.perpendicularPerpDistance = result.perpDistance;
        } else {
            window.perpendicularPerpWGS84 = null;
            window.perpendicularPerpDistance = null;
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
    // Ezt csak vonal kiválasztása esetén kell megjelenítem
    if (AppState.selectedLineEOV.start && AppState.selectedLineEOV.end && window.perpendicularPerpWGS84) {
        // Piros szaggatott vonal az eredeti merőleges vetületig
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
        
        // Konvertálás WGS84-re
        const etrf_start = AppState.transformer.eov2etrf2000(extendedStart.y, extendedStart.x);
        const wgs84_start = AppState.transformer.etrf2000_2wgs84(etrf_start.lat, etrf_start.lon);
        
        const etrf_end = AppState.transformer.eov2etrf2000(extendedEnd.y, extendedEnd.x);
        const wgs84_end = AppState.transformer.etrf2000_2wgs84(etrf_end.lat, etrf_end.lon);
        
        const lineExtension = L.polyline(
            [[wgs84_start.lat, wgs84_start.lon], [wgs84_end.lat, wgs84_end.lon]],
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
    if (AppState.selectedPointWGS84.lat && AppState.selectedPointWGS84.lon) {
        bounds.extend([AppState.selectedPointWGS84.lat, AppState.selectedPointWGS84.lon]);
    }
    // Kijelölt vonal hozzáadása
    else if (AppState.selectedLineWGS84.start && AppState.selectedLineWGS84.end) {
        bounds.extend([AppState.selectedLineWGS84.start.lat, AppState.selectedLineWGS84.start.lon]);
        bounds.extend([AppState.selectedLineWGS84.end.lat, AppState.selectedLineWGS84.end.lon]);
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
function initTransformer() {
    try {
        AppState.transformer = new EOVTransformer();
        Logger_Transform.success('EOVTransformer inicializálva');
    } catch (err) {
        Logger_Transform.error('EOVTransformer init sikertelen', err);
        showStatus('Koordináta transzformátor hiba: ' + ErrorRecovery.getUserMessage(err), 'error');
    }
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

// Shapefile konvertálása
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
        // Input validáció
        const latValidation = ValidationService.validateCoordinate(lat, 'latitude');
        const lonValidation = ValidationService.validateCoordinate(lon, 'longitude');
        
        if (!latValidation.valid || !lonValidation.valid) {
            Logger_Transform.warn('Pont koordináta validáció:', { lat: latValidation, lon: lonValidation });
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

// Poligon területének kiszámítása Shoelace formula használatával
// A koordináták EOV koordináták (méter egységben)
function calculatePolygonArea(eovCoordinates) {
    if (!eovCoordinates || eovCoordinates.length < 3) return 0;
    
    let area = 0;
    for (let i = 0; i < eovCoordinates.length; i++) {
        const [x1, y1] = eovCoordinates[i];
        const [x2, y2] = eovCoordinates[(i + 1) % eovCoordinates.length];
        area += (x1 * y2) - (x2 * y1);
    }
    
    return Math.abs(area) / 2; // m²-ben
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

    Logger_Shapefile.info(`Shapefile feltöltés kezdete: ${file.name} (${(file.size / 1024).toFixed(2)} KB)`);
    
    try {
        const arrayBuffer = await file.arrayBuffer();
        const shapeData = await shp(arrayBuffer);
        
        const projection = document.getElementById('shapeFileProjection').value;
        const geoJsonConverted = convertShapeToGeoJSON(shapeData, projection);
        
        // GeoJSON validáció
        const geoValidation = ValidationService.validateGeoJSON(geoJsonConverted);
        if (!geoValidation.valid) {
            Logger_Shapefile.error('GeoJSON validáció sikertelen', geoValidation.error);
            showStatus(`Shapefile feldolgozás sikertelen: ${geoValidation.error}`, 'error');
            return;
        }

        Logger_Shapefile.success(`GeoJSON konvertálva: ${geoJsonConverted.features.length} feature`);
        
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
        
        AppState.shapeFileLayer = L.geoJSON(geoJsonConverted, {
            style: (feature) => {
                if (feature.geometry.type === 'Polygon') {
                    return {
                        color: CONSTANTS.COLORS.ORANGE,
                        weight: CONSTANTS.GEOMETRY.LINE_WEIGHT,
                        opacity: 0.8,
                        fillOpacity: 0.3,
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
                            // Előző kiválasztott resetelése
                            deselectAll();
                            
                            // Vonal kiválasztása
                            AppState.selectedLayer = layer;
                            layer.setStyle({
                                color: CONSTANTS.COLORS.GREEN, // Zöld szín a kiválasztottnak
                                weight: CONSTANTS.GEOMETRY.SELECTED_LINE_WEIGHT,
                                opacity: 1.0
                            });
                            
                            // EOV és WGS84 koordináták már a properties-ben vannak
                            const lineCoords = feature.geometry.coordinates;
                            AppState.selectedLineWGS84 = {
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
                    // Polygon esetén sarokpontok megjelenítése
                    const outerRing = feature.geometry.coordinates[0];
                    outerRing.forEach((coord, index) => {
                        const cornerMarker = L.circleMarker([coord[1], coord[0]], {
                        radius: CONSTANTS.GEOMETRY.CORNER_MARKER_RADIUS,
                        fillColor: CONSTANTS.COLORS.YELLOW,
                        color: CONSTANTS.COLORS.BLACK,
                        weight: CONSTANTS.GEOMETRY.LINE_WEIGHT,
                        opacity: 0.9,
                        fillOpacity: 0.9,
                        pane: 'cornerPane'
                    });
                        
                        cornerMarker.on('click', (e) => {
                            L.DomEvent.stopPropagation(e);
                            
                            // Ha ugyanazt a pontot kattintjuk → kijelölés törlése
                            if (AppState.selectedCornerMarker === cornerMarker) {
                                deselectAll();
                            } else {
                                // Előző kiválasztott resetelése
                                deselectAll();
                                
                                // Sarokpont kiválasztása
                                AppState.selectedCornerMarker = cornerMarker;
                                cornerMarker.setStyle({
                                    fillColor: CONSTANTS.COLORS.PRIMARY_RED // Piros a kiválasztott sarokpontnak
                                });
                                
                                // WGS84 és EOV koordináták már a properties-ben vannak (a corner index alapján)
                                AppState.selectedPointWGS84 = { lat: coord[1], lon: coord[0] };
                                
                                if (feature.properties && feature.properties.eov_corners) {
                                    AppState.selectedPointEOV = feature.properties.eov_corners[index];
                                } else {
                                    AppState.selectedPointEOV = { x: null, y: null };
                                }
                                
                                // Távolságvonal rajzolása
                                updateDistanceLine();
                                Logger_Map.debug('Sarokpont kiválasztva', { coord, index, eov: AppState.selectedPointEOV, wgs84: AppState.selectedPointWGS84 });
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
        
        showStatus(`✓ ${shapeData.features.length} polygon betöltve`, 'status');
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
        initSourceModal();
        
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

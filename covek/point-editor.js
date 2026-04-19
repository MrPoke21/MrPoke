// ============ PONT SZERKESZTŐ ============
// Tartalmaz vonalszakasz „Hozzáad" logikát is:
//   Ha vonal van kijelölve, megjelenik egy „+ Hozzáad" gomb a vonal közepén.
//   Kattintásra a vonal felezőpontjára új sarokpont kerül a poligonba.
// Sarokpont kiválasztásakor megjelenő akció menü:
//   Mérés | Törlés | Mozgatás
// Törlés: eltávolítja a pontot a poligonból, újrarajzolja a geometriát
// Mozgatás: a pont a pillanatnyi koordinátára kerül, OK/Mégse megerősítéssel

// ── Mozgatás állapot ─────────────────────────────────────────────────────────
const MoveState = {
    active: false,
    feature: null,          // a mozgatott sarokpont OL Feature
    polygon: null,          // a szülő poligon OL Feature
    cornerIndex: -1,        // a sarokpont indexe a ring-ben (0-alapú, N+1-es zárt ring)
    originalOLCoord: null,  // [easting, northing] – visszavonáshoz
    originalEOVCoord: null  // {x: northing, y: easting} – visszavonáshoz
};

// ── Akció menü megjelenítése ──────────────────────────────────────────────────

function showCornerActionMenu(feature) {

    if (!window.editMode) return;
    const menu = document.getElementById('corner-action-menu');
    if (!menu || !AppState.map) return;
// Vonal felezőpont gomb megjelenítése csak szerkesztés módban
function showLineAddButton(feature) {
    if (!window.editMode) return;
    const btn = document.getElementById('line-add-btn');
    if (!btn) return;
    // Pozícionálás, megjelenítés logika (ha van)
    btn.style.display = 'flex';
}

    // A marker pixel pozíciója a térképen
    const olCoord = feature.getGeometry().getCoordinates();
    const pixel = AppState.map.getPixelFromCoordinate(olCoord);
    if (!pixel) return;

    // Elhelyezés (jobb felső sarokba, viewport határon clampelve)
    const mapEl = document.getElementById('map');
    const maxX = mapEl.offsetWidth;
    const maxY = mapEl.offsetHeight;
    const menuW = 160;   // becsült menü-szélesség
    const menuH = 110;   // becsült menü-magasság

    const left = Math.min(Math.max(pixel[0] + 12, 4), maxX - menuW - 4);
    const top  = Math.min(Math.max(pixel[1] - menuH / 2, 4), maxY - menuH - 4);

    menu.style.left = left + 'px';
    menu.style.top  = top  + 'px';
    menu.style.display = 'flex';
}

function hideCornerActionMenu() {
    const menu = document.getElementById('corner-action-menu');
    if (menu) menu.style.display = 'none';
}

// ── Menü gombok ───────────────────────────────────────────────────────────────

/** "Törlés" – eltávolítja a sarokpontot a poligonból */
function onCornerActionDelete() {
    hideCornerActionMenu();
    const feature = AppState.selectedCornerMarker;
    if (!feature) return;
    deleteCorner(feature);
}

/** "Mozgatás" – a pont a pillanatnyi GPS/képernyő-koordinátára mozdul */
function onCornerActionMove() {
    hideCornerActionMenu();
    const feature = AppState.selectedCornerMarker;
    if (!feature) return;
    startCornerMove(feature);
}

// ── Sarokpont törlés ──────────────────────────────────────────────────────────

function deleteCorner(cornerFeature) {
    if (!AppState.shapeFileLayer) return;

    const polyFeature = findPolygonForCorner(cornerFeature);
    if (!polyFeature) {
        Logger_Map.warn('Törlés: nem található szülő poligon ehhez a ponthoz');
        deselectAll();
        return;
    }

    const ring = polyFeature.getGeometry().getCoordinates()[0]; // zárt ring, N+1 elem
    const uniqueCount = ring.length - 1; // valódi sarokpontok száma

    if (uniqueCount <= 3) {
        // 3 pontos (háromszög) poligon – egész poligon törlése
        const src = AppState.shapeFileLayer.getSource();
        // Távolítsuk el a poligonhoz tartozó vonalakat is
        src.getFeatures()
            .filter(f => f.getGeometry().getType() !== 'Polygon')
            .forEach(f => src.removeFeature(f));
        src.removeFeature(polyFeature);

        // Sarokpont markerek törlése
        AppState.cornerVectorSource.clear();
        // Maradék poligonok vonalait újraépítjük
        rebuildLayerFromPolygons();
        deselectAll();
        Logger_Map.info('Háromszög poligon törölve (nem lehet 2 pontra csökkenteni)');
        return;
    }

    const idx = findCornerIndexInPolygon(cornerFeature, polyFeature);
    if (idx === -1) {
        Logger_Map.warn('Törlés: sarokpont indexe nem található');
        deselectAll();
        return;
    }

    // Egyedi pontok (záró duplikátum nélkül)
    const unique = ring.slice(0, ring.length - 1);
    const newUnique = unique.filter((_, i) => i !== idx);

    // eov_corners frissítése (szintén N+1, de eltávolítjuk az idx-et és frissítjük zárást)
    const oldEovCorners = polyFeature.get('eov_corners') || [];
    const eovUnique = oldEovCorners.slice(0, oldEovCorners.length > 1 ? oldEovCorners.length - 1 : oldEovCorners.length);
    const newEovUnique = eovUnique.filter((_, i) => i !== idx);

    // Zárt ring = egyedi + első pont ismét
    const newRing = [...newUnique, newUnique[0]];
    const newEovCorners = [...newEovUnique, newEovUnique[0]];

    // Poligon geometria és tulajdonságok frissítése
    polyFeature.getGeometry().setCoordinates([newRing]);
    polyFeature.set('eov_corners', newEovCorners);
    polyFeature.set('area_sqm', calculatePolygonArea(newEovUnique));

    rebuildLayerFromPolygons();
    deselectAll();
    Logger_Map.info('Sarokpont törölve', { idx, maradó: newUnique.length });
}

// ── Mozgatás ──────────────────────────────────────────────────────────────────

function startCornerMove(cornerFeature) {
    const polyFeature = findPolygonForCorner(cornerFeature);
    if (!polyFeature) {
        Logger_Map.warn('Mozgatás: nem található szülő poligon');
        return;
    }
    // Távolságmérő egyenes eltüntetése
    if (typeof clearDistanceVisualization === 'function') clearDistanceVisualization();

    const idx = findCornerIndexInPolygon(cornerFeature, polyFeature);
    if (idx === -1) {
        Logger_Map.warn('Mozgatás: sarokpont indexe nem található');
        return;
    }

    // Állapot mentése visszavonáshoz
    MoveState.active = true;
    MoveState.feature = cornerFeature;
    MoveState.polygon = polyFeature;
    MoveState.cornerIndex = idx;
    MoveState.originalOLCoord = [...cornerFeature.getGeometry().getCoordinates()];
    MoveState.originalEOVCoord = Object.assign({}, cornerFeature.get('_eovCoord'));

    // Marker pirosra vált "mozgatás" módban
    const zoom = AppState.map.getView().getZoom() || 10;
    cornerFeature.setStyle(getCornerMarkerStyle('red', getCornerMarkerSize(zoom)));

    showMoveConfirmBar();
    updateMovingCorner(); // azonnal a jelenlegi pozícióra ugrik
    Logger_Map.info('Mozgatás mód elkezdve', { idx, poly: polyFeature });
}

/** Hívódik minden koordináta frissítéskor (AppState.currentEOVY/X változásakor) */
function updateMovingCorner() {
    if (!MoveState.active || !MoveState.feature) return;
    if (!AppState.currentEOVY || !AppState.currentEOVX) return;

    // OL koordináta: [easting, northing]
    const newOL = [AppState.currentEOVY, AppState.currentEOVX];
    MoveState.feature.getGeometry().setCoordinates(newOL);

    const newEOV = { y: AppState.currentEOVY, x: AppState.currentEOVX };
    MoveState.feature.set('_eovCoord', newEOV);

    applyMovedCornerToPolygon(newOL, newEOV);
}

function applyMovedCornerToPolygon(newOL, newEOV) {
    const polyFeature = MoveState.polygon;
    const idx = MoveState.cornerIndex;
    if (!polyFeature || idx === -1) return;

    const ring = polyFeature.getGeometry().getCoordinates()[0];
    const newRing = ring.map((c, i) => i === idx ? newOL : c);

    // Zárt ring: ha idx=0, az utolsó pont is ugyanaz
    if (idx === 0) newRing[newRing.length - 1] = newOL;
    // Ha idx az utolsó (ami = az első), az első pontot is frissítjük
    if (idx === ring.length - 1) newRing[0] = newOL;

    polyFeature.getGeometry().setCoordinates([newRing]);

    const eovCorners = [...(polyFeature.get('eov_corners') || [])];
    if (eovCorners.length > idx) {
        eovCorners[idx] = newEOV;
        if (idx === 0 && eovCorners.length > 1) eovCorners[eovCorners.length - 1] = newEOV;
        if (idx === eovCorners.length - 1) eovCorners[0] = newEOV;
    }
    polyFeature.set('eov_corners', eovCorners);

    // Vonalszakaszok azonnali frissítése (live preview)
    rebuildAllLineSegments();

    // Terület/kerület kijelzés frissítése
    if (typeof displayPolygonInfo === 'function') {
        // EOV sarokpontok
        const eovCorners = polyFeature.get('eov_corners') || [];
        // Poligon tulajdonságok (geometry nélkül)
        const properties = Object.assign({}, polyFeature.getProperties());
        delete properties.geometry;
        displayPolygonInfo(eovCorners, properties);
    }
}

function commitCornerMove() {
    if (!MoveState.active) return;
    rebuildLayerFromPolygons(); // teljeskörű újraépítés a végleges geometriából
    MoveState.active = false;
    MoveState.feature = null;
    MoveState.polygon = null;
    MoveState.cornerIndex = -1;
    MoveState.originalOLCoord = null;
    MoveState.originalEOVCoord = null;
    hideMoveConfirmBar();
    deselectAll();
    Logger_Map.info('Mozgatás elfogadva');
}

function cancelCornerMove() {
    if (!MoveState.active) return;

    // Eredeti geometria visszaállítása
    MoveState.feature.getGeometry().setCoordinates(MoveState.originalOLCoord);
    MoveState.feature.set('_eovCoord', MoveState.originalEOVCoord);
    applyMovedCornerToPolygon(MoveState.originalOLCoord, MoveState.originalEOVCoord);

    MoveState.active = false;
    MoveState.feature = null;
    MoveState.polygon = null;
    MoveState.cornerIndex = -1;
    MoveState.originalOLCoord = null;
    MoveState.originalEOVCoord = null;
    hideMoveConfirmBar();
    deselectAll();
    Logger_Map.info('Mozgatás megszakítva');
}

// ── Confirm bar (OK / Mégse) ─────────────────────────────────────────────────

function showMoveConfirmBar() {
    const bar = document.getElementById('corner-move-confirm');
    if (bar) bar.style.display = 'flex';
}

function hideMoveConfirmBar() {
    const bar = document.getElementById('corner-move-confirm');
    if (bar) bar.style.display = 'none';
}

// ── Koordináta keresők ────────────────────────────────────────────────────────

/**
 * Megkeresi azt a poligon OL Feature-t, amelynek egyik sarokpontja
 * egybeesik a megadott corner Feature koordinátájával.
 * Megpróbálja először a tárolt `_polygon` tulajdonságot, aztán koordináta-alapú keresést.
 */
function findPolygonForCorner(cornerFeature) {
    if (cornerFeature.get('_polygon')) return cornerFeature.get('_polygon');
    if (!AppState.shapeFileLayer) return null;

    const [cx, cy] = cornerFeature.getGeometry().getCoordinates();
    const src = AppState.shapeFileLayer.getSource();

    for (const f of src.getFeatures()) {
        if (f.getGeometry().getType() !== 'Polygon') continue;
        const ring = f.getGeometry().getCoordinates()[0];
        for (const [rx, ry] of ring) {
            if (Math.abs(rx - cx) < 0.01 && Math.abs(ry - cy) < 0.01) {
                return f;
            }
        }
    }
    return null;
}

/**
 * A sarokpont indexét adja vissza a poligon zárt ring-jében.
 * Ha MoveState.originalOLCoord van (mozgatás közbeni visszavonáshoz), azt is figyelembe veszi.
 */
function findCornerIndexInPolygon(cornerFeature, polyFeature, overrideOLCoord) {
    if (!polyFeature) return -1;

    const [cx, cy] = overrideOLCoord || cornerFeature.getGeometry().getCoordinates();
    const ring = polyFeature.getGeometry().getCoordinates()[0];

    for (let i = 0; i < ring.length; i++) {
        if (Math.abs(ring[i][0] - cx) < 0.01 && Math.abs(ring[i][1] - cy) < 0.01) {
            return i;
        }
    }

    // Ha MoveState aktív, az eredeti koordinátával próbálkozunk
    if (MoveState.active && MoveState.originalOLCoord) {
        const [ox, oy] = MoveState.originalOLCoord;
        for (let i = 0; i < ring.length; i++) {
            if (Math.abs(ring[i][0] - ox) < 0.01 && Math.abs(ring[i][1] - oy) < 0.01) {
                return i;
            }
        }
    }
    return -1;
}

// ── Geometria újraépítő segédfüggvények ───────────────────────────────────────

/**
 * Minden poligon kiindulásából újragenerálja a vonalszakasz feature-öket.
 * A meglévő LineString feature-öket törli, majd az aktuális poligon-geometriából építi vissza.
 */
function rebuildAllLineSegments() {
    if (!AppState.shapeFileLayer) return;
    const src = AppState.shapeFileLayer.getSource();

    // LineString feature-ök törlése
    src.getFeatures()
        .filter(f => f.getGeometry().getType() === 'LineString')
        .forEach(f => src.removeFeature(f));

    // Minden poligon minden éléhez vonal
    src.getFeatures()
        .filter(f => f.getGeometry().getType() === 'Polygon')
        .forEach(polyFeature => {
            const ring = polyFeature.getGeometry().getCoordinates()[0];
            const eovCorners = polyFeature.get('eov_corners') || [];

            for (let i = 0; i < ring.length - 1; i++) {
                const lineFeature = new ol.Feature({
                    geometry: new ol.geom.LineString([ring[i], ring[i + 1]])
                });
                lineFeature.set('eov_coords',
                    eovCorners.length > i + 1
                        ? { start: eovCorners[i], end: eovCorners[i + 1] }
                        : null
                );
                lineFeature.setStyle(new ol.style.Style({
                    stroke: new ol.style.Stroke({
                        color: CONSTANTS.COLORS.ORANGE,
                        width: CONSTANTS.GEOMETRY.LINE_WEIGHT
                    })
                }));
                src.addFeature(lineFeature);
            }
        });
}

/**
 * Sarokpont marker-eket törli és az aktuális poligon-geometriából újraépíti.
 * Minden marker kap `_polygon` és `_cornerIndex` referenciát.
 */
function rebuildCornerMarkers() {
    if (!AppState.shapeFileLayer) return;
    const src = AppState.shapeFileLayer.getSource();
    const zoom = AppState.map ? (AppState.map.getView().getZoom() || 10) : 10;
    const markerSize = getCornerMarkerSize(zoom);

    AppState.cornerVectorSource.clear();
    // Sarokpont markerek csak a kijelölt poligonhoz tartoznak, ne rajzoljunk minden poligonhoz!
}

/**
 * Teljes újraépítés a jelenlegi poligon-geometriatartalmából:
 * vonalszakaszok + sarokpont markerek.
 */
function rebuildLayerFromPolygons() {
    rebuildAllLineSegments();
    rebuildCornerMarkers();
    // Automatikus mentés (session-store.js)
    if (typeof sessionSave === 'function') sessionSave();
}

// ============ POLIGON RAJZOLÁS ============

const DrawState = {
    active: false,
    olPoints: [],    // [[easting, northing], ...]
    eovPoints: [],   // [{y: easting, x: northing}, ...]
    previewSource: null,
    previewLayer: null,
    lastSegmentDist: null,  // m, legutóbbi szegmens hossza
    liveSource: null,       // folyamatosan frissülő gumiló vonal + távolság label
    liveLayer: null
};

/** Szülő shapeFileLayer létrehozása ha még nem létezik */
function _ensureShapeLayer() {
    if (AppState.shapeFileLayer) return;

    const src = new ol.source.Vector();

    function shapeStyleFn(feature) {
        const t = feature.getGeometry().getType();
        if (t === 'Polygon') {
            return new ol.style.Style({
                stroke: new ol.style.Stroke({ color: CONSTANTS.COLORS.ORANGE, width: CONSTANTS.GEOMETRY.LINE_WEIGHT }),
                fill: new ol.style.Fill({ color: 'rgba(255,107,53,0.35)' })
            });
        }
        if (t === 'LineString') {
            return new ol.style.Style({
                stroke: new ol.style.Stroke({ color: CONSTANTS.COLORS.ORANGE, width: CONSTANTS.GEOMETRY.LINE_WEIGHT })
            });
        }
        return null;
    }

    AppState.shapeFileLayer = new ol.layer.Vector({
        source: src,
        style: shapeStyleFn,
        zIndex: 250
    });
    AppState.map.addLayer(AppState.shapeFileLayer);
}

/** Preview réteg lazán inicializálva */
function _ensureDrawPreviewLayer() {
    if (DrawState.previewSource) return;
    DrawState.previewSource = new ol.source.Vector();
    DrawState.previewLayer = new ol.layer.Vector({
        source: DrawState.previewSource,
        zIndex: 300
    });
    AppState.map.addLayer(DrawState.previewLayer);
}

/** "Gumiló" vonal réteg (folyamatosan frissül az aktuális pozícióra) */
function _ensureDrawLiveLayer() {
    if (DrawState.liveSource) return;
    DrawState.liveSource = new ol.source.Vector();
    DrawState.liveLayer = new ol.layer.Vector({
        source: DrawState.liveSource,
        zIndex: 301
    });
    AppState.map.addLayer(DrawState.liveLayer);
}

/**
 * Frissíti a gumiló vonalat és a távolság felirati elemet az aktuális pozíció alapján.
 * Mindig az utolsó lerakott pont és az aktuális EOV pozíció között.
 */
function _updateDrawLiveLine() {
    if (!DrawState.active) return;
    _ensureDrawLiveLayer();
    DrawState.liveSource.clear();

    const n = DrawState.olPoints.length;
    if (n === 0) return;
    if (!AppState.currentEOVY || !AppState.currentEOVX) return;

    const lastPt  = DrawState.olPoints[n - 1];          // [easting, northing]
    const curPt   = [AppState.currentEOVY, AppState.currentEOVX];
    const lastEov = DrawState.eovPoints[n - 1];          // {y, x}
    const dist    = Math.hypot(curPt[0] - lastPt[0], curPt[1] - lastPt[1]);

    // Gumiló vonal
    const line = new ol.Feature({
        geometry: new ol.geom.LineString([lastPt, curPt])
    });
    line.setStyle(new ol.style.Style({
        stroke: new ol.style.Stroke({ color: '#ffeb3b', width: 2, lineDash: [8, 5] })
    }));
    DrawState.liveSource.addFeature(line);

    // Távolság felirat az aktuális pozíció fölé
    const label = new ol.Feature({ geometry: new ol.geom.Point([...curPt]) });
    label.setStyle(new ol.style.Style({
        image: new ol.style.Circle({
            radius: 5,
            fill: new ol.style.Fill({ color: '#ffeb3b' }),
            stroke: new ol.style.Stroke({ color: '#333', width: 1.5 })
        }),
        text: new ol.style.Text({
            text: formatDistance(dist),
            offsetY: -18,
            font: 'bold 13px sans-serif',
            fill: new ol.style.Fill({ color: '#ffeb3b' }),
            stroke: new ol.style.Stroke({ color: '#000', width: 3 })
        })
    }));
    DrawState.liveSource.addFeature(label);

    // Státuszsort is frissítjük a live távolsággal
    DrawState.lastSegmentDist = dist;
    _updateDrawStatus();
}

/** Rajzolás állapot megjelenítése a preview rétegen */
function _updateDrawPreview() {
    _ensureDrawPreviewLayer();
    DrawState.previewSource.clear();

    const pts = DrawState.olPoints;
    if (pts.length === 0) return;

    // Pontok – kis fehér kör
    pts.forEach((coord, i) => {
        const f = new ol.Feature({ geometry: new ol.geom.Point([...coord]) });
        f.setStyle(new ol.style.Style({
            image: new ol.style.Circle({
                radius: 5,
                fill: new ol.style.Fill({ color: i === 0 ? '#00e676' : '#fff' }),
                stroke: new ol.style.Stroke({ color: '#333', width: 1.5 })
            })
        }));
        DrawState.previewSource.addFeature(f);
    });

    // Vonalak az eddigi pontok között
    if (pts.length >= 2) {
        const lineCoords = [...pts];
        const line = new ol.Feature({ geometry: new ol.geom.LineString(lineCoords) });
        line.setStyle(new ol.style.Style({
            stroke: new ol.style.Stroke({ color: '#fff', width: 2, lineDash: [6, 4] })
        }));
        DrawState.previewSource.addFeature(line);
    }

    // Záró vonal (ha ≥3 pont) – visszakötés az elsőre
    if (pts.length >= 3) {
        const close = new ol.Feature({
            geometry: new ol.geom.LineString([pts[pts.length - 1], pts[0]])
        });
        close.setStyle(new ol.style.Style({
            stroke: new ol.style.Stroke({ color: 'rgba(255,255,255,0.4)', width: 1.5, lineDash: [4, 6] })
        }));
        DrawState.previewSource.addFeature(close);
    }

    // Pont sorszámok kijelzése
    pts.forEach((coord, i) => {
        const label = new ol.Feature({ geometry: new ol.geom.Point([...coord]) });
        label.setStyle(new ol.style.Style({
            text: new ol.style.Text({
                text: String(i + 1),
                offsetX: 10, offsetY: -10,
                font: 'bold 12px sans-serif',
                fill: new ol.style.Fill({ color: '#fff' }),
                stroke: new ol.style.Stroke({ color: '#000', width: 3 })
            })
        }));
        DrawState.previewSource.addFeature(label);
    });
}

/** Rajzolás mód indítása */
function startDrawPolygon() {
    if (!AppState.map) return;
    deselectAll();
    DrawState.active = true;
    DrawState.olPoints = [];
    DrawState.eovPoints = [];
    _ensureDrawPreviewLayer();
    DrawState.previewSource.clear();

    document.getElementById('map').classList.add('draw-active');
    _showDrawBar();
    _updateDrawStatus();
    Logger_Map.info('Poligon rajzolás elkezdve');
}

/** Térkép kattintás kezelése rajzolás módban – ELTÁVOLÍTVA, pontot csak gombbal lehet hozzáadni */

/** A pillanatnyi pozíció (AppState.currentEOVY/X) alapján ad hozzá egy pontot */
function addCurrentPositionPoint() {
    if (!DrawState.active) return;
    if (!AppState.currentEOVY || !AppState.currentEOVX) {
        alert('Nincs elérhető pozíció! Kérlek várj, amíg a koordináták megjelennek.');
        return;
    }

    const olCoord  = [AppState.currentEOVY, AppState.currentEOVX];
    const eovCoord = { y: AppState.currentEOVY, x: AppState.currentEOVX };

    DrawState.olPoints.push([...olCoord]);
    DrawState.eovPoints.push(eovCoord);

    // Távolság az előző ponttól
    const n = DrawState.eovPoints.length;
    if (n >= 2) {
        const prev = DrawState.eovPoints[n - 2];
        const curr = DrawState.eovPoints[n - 1];
        const dist = Math.hypot(curr.y - prev.y, curr.x - prev.x);
        DrawState.lastSegmentDist = dist;
    } else {
        DrawState.lastSegmentDist = null;
    }

    _updateDrawPreview();
    _updateDrawStatus();
    Logger_Map.info('Rajzolás: pont hozzáadva (pillanatnyi pozíció)', { olCoord, eovCoord, db: DrawState.olPoints.length });
}

/** Utolsó pont visszavonása */
function undoDrawPoint() {
    if (DrawState.olPoints.length === 0) return;
    DrawState.olPoints.pop();
    DrawState.eovPoints.pop();
    // Visszavonás után újraszámítjuk az előző szegmens hosszát
    const n = DrawState.eovPoints.length;
    if (n >= 2) {
        const prev = DrawState.eovPoints[n - 2];
        const curr = DrawState.eovPoints[n - 1];
        DrawState.lastSegmentDist = Math.hypot(curr.y - prev.y, curr.x - prev.x);
    } else {
        DrawState.lastSegmentDist = null;
    }
    _updateDrawPreview();
    _updateDrawStatus();
    Logger_Map.info('Rajzolás: visszavonás', { maradó: DrawState.olPoints.length });
}

/** Poligon lezárása és véglegesítése */
function finishDrawPolygon() {
    if (DrawState.olPoints.length < 3) {
        alert('Legalább 3 pont szükséges a poligon létrehozásához!');
        return;
    }

    _ensureShapeLayer();

    const olPts   = DrawState.olPoints;
    const eovPts  = DrawState.eovPoints;

    // Zárt ring
    const ring       = [...olPts, olPts[0]];
    const eovCorners = [...eovPts, eovPts[0]];

    // Poligon feature
    const polyFeature = new ol.Feature({
        geometry: new ol.geom.Polygon([ring])
    });
    polyFeature.set('eov_corners', eovCorners);
    polyFeature.set('area_sqm', calculatePolygonArea(eovPts));
    polyFeature.setStyle(new ol.style.Style({
        stroke: new ol.style.Stroke({ color: CONSTANTS.COLORS.ORANGE, width: CONSTANTS.GEOMETRY.LINE_WEIGHT }),
        fill: new ol.style.Fill({ color: 'rgba(255,107,53,0.35)' })
    }));

    const src = AppState.shapeFileLayer.getSource();
    src.addFeature(polyFeature);

    // Vonalszakasz feature-ök
    for (let i = 0; i < ring.length - 1; i++) {
        const lineF = new ol.Feature({ geometry: new ol.geom.LineString([ring[i], ring[i + 1]]) });
        lineF.set('eov_coords', { start: eovCorners[i], end: eovCorners[i + 1] });
        lineF.setStyle(new ol.style.Style({
            stroke: new ol.style.Stroke({ color: CONSTANTS.COLORS.ORANGE, width: CONSTANTS.GEOMETRY.LINE_WEIGHT })
        }));
        src.addFeature(lineF);
    }

    // Sarokpont markerek
    const zoom = AppState.map.getView().getZoom() || 10;
    const markerSize = getCornerMarkerSize(zoom);
    ring.forEach((olCoord, idx) => {
        const mf = new ol.Feature({ geometry: new ol.geom.Point([...olCoord]) });
        mf.set('_eovCoord', eovCorners[idx]);
        mf.set('_polygon', polyFeature);
        mf.set('_cornerIndex', idx);
        mf.setStyle(getCornerMarkerStyle('yellow', markerSize));
        AppState.cornerVectorSource.addFeature(mf);
        AppState.allCornerMarkers.push(mf);
    });

    Logger_Map.info('Poligon létrehozva', { pontok: olPts.length, terület: polyFeature.get('area_sqm') });
    // Automatikus mentés (session-store.js)
    if (typeof sessionSave === 'function') sessionSave();
    _exitDrawMode();
}

/** Rajzolás megszakítása */
function cancelDrawPolygon() {
    _exitDrawMode();
    Logger_Map.info('Poligon rajzolás megszakítva');
}

/** Belső: rajzolás mód kilépés */
function _exitDrawMode() {
    DrawState.active = false;
    DrawState.olPoints = [];
    DrawState.eovPoints = [];
    DrawState.lastSegmentDist = null;
    if (DrawState.previewSource) DrawState.previewSource.clear();
    if (DrawState.liveSource) DrawState.liveSource.clear();
    document.getElementById('map').classList.remove('draw-active');
    _hideDrawBar();
}

/** Státusz szöveg frissítése */
function _updateDrawStatus() {
    const el = document.getElementById('draw-status-text');
    if (!el) return;
    const n = DrawState.olPoints.length;
    let txt;
    if (n === 0) {
        txt = 'Nyomd a „Pont hozzáadása” gombot az első pont lehelyezéséhez';
    } else if (n < 3) {
        txt = `${n} pont – még ${3 - n} kell a záráshoz`;
    } else {
        txt = `${n} pont – „Kész” gombbal zárható`;
    }
    if (DrawState.lastSegmentDist !== null) {
        txt += `  |  ⇐ ${formatDistance(DrawState.lastSegmentDist)}`;
    }
    el.textContent = txt;

    const finishBtn = document.getElementById('draw-finish-btn');
    if (finishBtn) finishBtn.disabled = n < 3;
    const undoBtn = document.getElementById('draw-undo-btn');
    if (undoBtn) undoBtn.disabled = n === 0;
}

function _showDrawBar() {
    const bar = document.getElementById('draw-polygon-bar');
    if (bar) bar.style.display = 'flex';
}

function _hideDrawBar() {
    const bar = document.getElementById('draw-polygon-bar');
    if (bar) bar.style.display = 'none';
}


// ── Vonal „Hozzáad" gomb ──────────────────────────────────────────────────────

/**
 * Megjeleníti a „+ Hozzáad" gombot a kiválasztott vonal felezőpontjánál.
 */
function showLineAddButton(lineFeature) {
    const btn = document.getElementById('line-add-btn');
    if (!btn || !AppState.map) return;

    const coords = lineFeature.getGeometry().getCoordinates();
    if (coords.length < 2) return;

    // Felezőpont OL koordinátája
    const midOL = [
        (coords[0][0] + coords[1][0]) / 2,
        (coords[0][1] + coords[1][1]) / 2
    ];
    const pixel = AppState.map.getPixelFromCoordinate(midOL);
    if (!pixel) return;

    const mapEl = document.getElementById('map');
    const maxX = mapEl.offsetWidth;
    const maxY = mapEl.offsetHeight;
    const btnW = 100;
    const btnH = 34;

    const left = Math.min(Math.max(pixel[0] - btnW / 2, 4), maxX - btnW - 4);
    const top  = Math.min(Math.max(pixel[1] - btnH - 10, 4), maxY - btnH - 4);

    btn.style.left = left + 'px';
    btn.style.top  = top  + 'px';
    btn.style.display = 'block';
}

function hideLineAddButton() {
    const btn = document.getElementById('line-add-btn');
    if (btn) btn.style.display = 'none';
}

/**
 * Felezőpontot szúr be a kiválasztott vonalszakasz közepére.
 * Megkeresi a szülő poligont, és az érintett ring-pozícióba beilleszt egy új sarokpontot.
 */
function insertMidpointOnLine() {
    const lineFeature = AppState.selectedLayer;
    if (!lineFeature || lineFeature.getGeometry().getType() !== 'LineString') return;

    const coords = lineFeature.getGeometry().getCoordinates();
    if (coords.length < 2) return;

    // Felezőpont
    const midOL  = [(coords[0][0] + coords[1][0]) / 2, (coords[0][1] + coords[1][1]) / 2];
    const eovCoords = lineFeature.get('eov_coords') || {};
    const startEOV = eovCoords.start || { x: coords[0][1], y: coords[0][0] };
    const endEOV   = eovCoords.end   || { x: coords[1][1], y: coords[1][0] };
    const midEOV   = { x: (startEOV.x + endEOV.x) / 2, y: (startEOV.y + endEOV.y) / 2 };

    // Szülő poligon keresése a kezdőpont koordinátája alapján
    if (!AppState.shapeFileLayer) return;
    const src = AppState.shapeFileLayer.getSource();
    let polyFeature = null;
    let insertIdx = -1;

    for (const f of src.getFeatures()) {
        if (f.getGeometry().getType() !== 'Polygon') continue;
        const ring = f.getGeometry().getCoordinates()[0];
        for (let i = 0; i < ring.length - 1; i++) {
            const matchStart = Math.abs(ring[i][0]     - coords[0][0]) < 0.01 &&
                               Math.abs(ring[i][1]     - coords[0][1]) < 0.01;
            const matchEnd   = Math.abs(ring[i + 1][0] - coords[1][0]) < 0.01 &&
                               Math.abs(ring[i + 1][1] - coords[1][1]) < 0.01;
            if (matchStart && matchEnd) {
                polyFeature = f;
                insertIdx = i + 1; // az új pont i és i+1 közé kerül
                break;
            }
        }
        if (polyFeature) break;
    }

    if (!polyFeature || insertIdx === -1) {
        Logger_Map.warn('Hozzáad: nem található szülő poligon a kiválasztott vonalhoz');
        return;
    }

    // Poligon ring frissítése
    const ring = polyFeature.getGeometry().getCoordinates()[0];
    const unique = ring.slice(0, ring.length - 1);
    unique.splice(insertIdx, 0, midOL);
    const newRing = [...unique, unique[0]];
    polyFeature.getGeometry().setCoordinates([newRing]);

    // eov_corners frissítése
    const oldEov = polyFeature.get('eov_corners') || [];
    const eovUnique = oldEov.slice(0, oldEov.length > 1 ? oldEov.length - 1 : oldEov.length);
    eovUnique.splice(insertIdx, 0, midEOV);
    polyFeature.set('eov_corners', [...eovUnique, eovUnique[0]]);

    Logger_Map.info('Új sarokpont hozzáadva a vonal felezőpontján', { insertIdx, midEOV });

    rebuildLayerFromPolygons();
    hideLineAddButton();
    deselectAll();
}


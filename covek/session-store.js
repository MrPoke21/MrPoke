// ============ SESSION STORE – automatikus localStorage mentés ============
// Minden geometria-változtatás után elmenti az összes poligont.
// Oldalak újratöltésekor visszaállítja az utolsó állapotot.

const SESSION_KEY     = 'covek_session';
const SESSION_VERSION = 1;

// ── Toast értesítő ────────────────────────────────────────────────────────────

let _saveToastTimer = null;

function _showSaveToast(msg) {
    const toast = document.getElementById('session-save-toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('visible');
    clearTimeout(_saveToastTimer);
    _saveToastTimer = setTimeout(() => toast.classList.remove('visible'), 2000);
}

// ── Mentés ────────────────────────────────────────────────────────────────────

function sessionSave() {
    if (!AppState.shapeFileLayer) return;

    const polygons = [];

    AppState.shapeFileLayer.getSource().getFeatures().forEach(f => {
        if (f.getGeometry().getType() !== 'Polygon') return;

        const eovCorners = f.get('eov_corners');
        if (!eovCorners || eovCorners.length < 4) return; // N+1, háromszöghöz min 4

        // Csak sima (serializálható) tulajdonságokat mentünk
        const props = {};
        const allProps = f.getProperties();
        Object.keys(allProps).forEach(k => {
            if (k === 'geometry') return;
            if (k.startsWith('_')) return; // belső referenciák (_polygon, stb.)
            props[k] = allProps[k];
        });

        polygons.push({ eov_corners: eovCorners, properties: props });
    });

    const data = { v: SESSION_VERSION, polygons, saved: Date.now() };

    try {
        localStorage.setItem(SESSION_KEY, JSON.stringify(data));
        _showSaveToast(`💾 Mentve  (${polygons.length} poligon)`);
        Logger_Map.info('Munkamenet mentve', { polygonok: polygons.length });
    } catch (e) {
        if (e.name === 'QuotaExceededError') {
            _showSaveToast('⚠️ Tárhely tele – mentés sikertelen');
            Logger_Map.warn('localStorage kvóta elfogyott');
        } else {
            Logger_Map.warn('Munkamenet mentés hiba', e);
        }
    }
}

// ── Betöltés ──────────────────────────────────────────────────────────────────

function sessionLoad() {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return;

    let data;
    try {
        data = JSON.parse(raw);
    } catch (e) {
        Logger_Map.warn('Munkamenet adat sérült', e);
        return;
    }

    if (!data || data.v !== SESSION_VERSION || !Array.isArray(data.polygons) || data.polygons.length === 0) return;

    _ensureShapeLayer(); // point-editor.js

    const src        = AppState.shapeFileLayer.getSource();
    const zoom       = AppState.map ? (AppState.map.getView().getZoom() || 10) : 10;
    const markerSize = getCornerMarkerSize(zoom);

    data.polygons.forEach(({ eov_corners, properties }) => {
        if (!eov_corners || eov_corners.length < 4) return;

        // OL ring: [easting, northing] = [c.y, c.x]  (eov_corners N+1 zárt)
        const ring = eov_corners.map(c => [c.y, c.x]);

        // ── Poligon feature ──
        const polyFeature = new ol.Feature({ geometry: new ol.geom.Polygon([ring]) });
        if (properties) {
            Object.keys(properties).forEach(k => polyFeature.set(k, properties[k]));
        }
        polyFeature.set('eov_corners', eov_corners);
        polyFeature.setStyle(new ol.style.Style({
            stroke: new ol.style.Stroke({ color: CONSTANTS.COLORS.ORANGE, width: CONSTANTS.GEOMETRY.LINE_WEIGHT }),
            fill:   new ol.style.Fill({ color: 'rgba(255,107,53,0.35)' })
        }));
        src.addFeature(polyFeature);

        // ── Vonalszakasz feature-ök ──
        for (let i = 0; i < ring.length - 1; i++) {
            const lineF = new ol.Feature({
                geometry: new ol.geom.LineString([ring[i], ring[i + 1]])
            });
            lineF.set('eov_coords', { start: eov_corners[i], end: eov_corners[i + 1] });
            lineF.setStyle(new ol.style.Style({
                stroke: new ol.style.Stroke({ color: CONSTANTS.COLORS.ORANGE, width: CONSTANTS.GEOMETRY.LINE_WEIGHT })
            }));
            src.addFeature(lineF);
        }

        // ── Sarokpont markerek ──
        ring.forEach((olCoord, idx) => {
            const mf = new ol.Feature({ geometry: new ol.geom.Point([...olCoord]) });
            mf.set('_eovCoord',    eov_corners[idx]);
            mf.set('_polygon',     polyFeature);
            mf.set('_cornerIndex', idx);
            mf.setStyle(getCornerMarkerStyle('yellow', markerSize));
            AppState.cornerVectorSource.addFeature(mf);
            AppState.allCornerMarkers.push(mf);
        });
    });

    // Ránagyítás a betöltött geometriákra
    const extent = src.getExtent();
    if (extent && !ol.extent.isEmpty(extent) && AppState.map) {
        AppState.map.getView().fit(extent, { padding: [40, 40, 40, 40], duration: 600 });
    }

    _showSaveToast(`📂 ${data.polygons.length} poligon visszaállítva`);
    Logger_Map.info('Munkamenet betöltve', { polygonok: data.polygons.length });
}

// ── Munkamenet törlése ────────────────────────────────────────────────────────

function sessionClear() {
    localStorage.removeItem(SESSION_KEY);
    _showSaveToast('🗑️ Munkamenet törölve');
    Logger_Map.info('Munkamenet törölve');
}

/**
 * Teljes reset: törli a mentett munkamenetet és
 * eltávolítja az összes geometriát a térképről.
 */
function sessionReset() {
    if (!confirm('Biztosan törölöd az összes geometriát és a mentett munkamenetet?')) return;

    // Térkép geometriák törlése
    if (AppState.shapeFileLayer) {
        AppState.shapeFileLayer.getSource().clear();
    }
    if (AppState.cornerVectorSource) {
        AppState.cornerVectorSource.clear();
    }
    AppState.allCornerMarkers = [];

    // Kijelölés és panelok nullazása
    if (typeof deselectAll === 'function') deselectAll();

    // localStorage törlése
    localStorage.removeItem(SESSION_KEY);

    _showSaveToast('🗑️ Munkamenet törölve');
    Logger_Map.info('Munkamenet és geometriák törölve');
}

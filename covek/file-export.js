// ============ FÁJL EXPORT ============
// Poligonok exportálása SHP (ZIP) vagy KML formátumba, EOV vagy ETRF2000 koordinátákkal

// ── Segédosztály bináris íráshoz ─────────────────────────────────────────────
class BinWriter {
    constructor(size) {
        this.buffer = new ArrayBuffer(size);
        this.view = new DataView(this.buffer);
        this.pos = 0;
    }
    writeInt32BE(v)    { this.view.setInt32(this.pos, v, false); this.pos += 4; }
    writeInt32LE(v)    { this.view.setInt32(this.pos, v, true);  this.pos += 4; }
    writeUint8(v)      { this.view.setUint8(this.pos, v);        this.pos += 1; }
    writeUint16LE(v)   { this.view.setUint16(this.pos, v, true); this.pos += 2; }
    writeUint32LE(v)   { this.view.setUint32(this.pos, v, true); this.pos += 4; }
    writeFloat64LE(v)  { this.view.setFloat64(this.pos, v, true); this.pos += 8; }
    writeBytes(arr)    {
        new Uint8Array(this.buffer, this.pos, arr.length).set(arr);
        this.pos += arr.length;
    }
    writeZeros(n)      { this.pos += n; } // ArrayBuffer is zeroed by default
    result()           { return this.buffer; }
}

// ── Polygon feature-ek lekérdezése ───────────────────────────────────────────

/**
 * Az aktív shapefile réteg összes polygon feature-ét adja vissza.
 */
function getPolygonFeaturesForExport() {
    if (!AppState.shapeFileLayer) return [];
    const source = AppState.shapeFileLayer.getSource();
    return source.getFeatures().filter(f => f.getGeometry().getType() === 'Polygon');
}

/**
 * Egy polygon OL feature koordinátáit adja vissza a választott CRS-ben.
 * eov_corners struktúra: { x: northing, y: easting }
 *
 * Visszatér: [[X1, Y1], [X2, Y2], ...] ahol:
 *   EOV:    X=easting, Y=northing
 *   ETRF2000: X=longitude, Y=latitude
 */
function getFeatureRingCoords(olFeature, crs) {
    const eovCorners = olFeature.get('eov_corners');
    const olRing = olFeature.getGeometry().getCoordinates()[0]; // EPSG:23700 [easting, northing]

    if (crs === 'eov') {
        if (eovCorners && eovCorners.length > 0) {
            return eovCorners.map(c => [c.y, c.x]); // [easting, northing]
        }
        return olRing.map(c => [c[0], c[1]]);
    } else {
        // ETRF2000: EOV → ETRF2000 transzformáció
        if (eovCorners && eovCorners.length > 0) {
            return eovCorners.map(c => {
                const r = AppState.transformer.eov2etrf2000(c.y, c.x);
                return [r.lon, r.lat];
            });
        }
        return olRing.map(c => {
            const r = AppState.transformer.eov2etrf2000(c[0], c[1]);
            return [r.lon, r.lat];
        });
    }
}

/** Egy ring lezárása, ha az utolsó pont nem egyezik az elsővel */
function closeRing(ring) {
    if (ring.length < 2) return ring;
    const first = ring[0], last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
        return [...ring, [...first]];
    }
    return ring;
}

// ── KML export ────────────────────────────────────────────────────────────────

function escapeXML(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * GeoJSON Feature Collection-ből KML XML string-et épít.
 * EOV esetén az easting,northing,0 koordinátákat írja ki (nem szabványos KML, de
 * tervező szoftverekben használható).
 * ETRF2000 esetén a szabványos lon,lat,0 formát alkalmazza.
 */
function buildKML(features, crs) {
    const encoder = new TextEncoder();

    const placemarks = features.map((feature, idx) => {
        const ring = closeRing(getFeatureRingCoords(feature, crs));
        const props = feature.getProperties();
        const name = escapeXML(
            props.name || props.NAME || props.PARCELLA || ('Poligon ' + (idx + 1))
        );
        const desc = escapeXML(props.description || props.DESCR || '');

        const coordStr = ring
            .map(c => `${c[0].toFixed(8)},${c[1].toFixed(8)},0`)
            .join(' ');

        return `  <Placemark>
    <name>${name}</name>
    <description>${desc}</description>
    <Polygon>
      <outerBoundaryIs>
        <LinearRing>
          <coordinates>${coordStr}</coordinates>
        </LinearRing>
      </outerBoundaryIs>
    </Polygon>
  </Placemark>`;
    });

    const crsComment = crs === 'eov'
        ? '<!-- Koordináták: EOV EPSG:23700 (easting,northing) – nem szabványos KML vetület -->'
        : '<!-- Koordináták: ETRF2000 (longitude,latitude) –  szabványos KML -->';

    return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Export (${crs.toUpperCase()})</name>
    ${crsComment}
${placemarks.join('\n')}
  </Document>
</kml>`;
}

// ── SHP / SHX export ──────────────────────────────────────────────────────────

/**
 * SHP + SHX bináris ArrayBuffer-eket épít egy polygon kollekcióból.
 * Shapefile (ESRI) Polygon típus (type 5), egyszeres ring (csak külső határvonal).
 */
function buildSHPandSHX(features, crs) {
    // Koordináták és ring méretek előkiszámítása
    const rings = features.map(f => closeRing(getFeatureRingCoords(f, crs)));

    // Rekord tartalom hossza 16-bites szavakban (fejléc nélkül):
    // 4 (ShapeType) + 32 (BBox4) + 4 (NumParts) + 4 (NumPoints) + 4*1 (Parts[0]) + 16*N (Points)
    // = (48 + 16*N) byte → / 2 szó
    const contentWords = rings.map(r => 24 + 8 * r.length);

    // Globális bounding box
    let xMin = Infinity, yMin = Infinity, xMax = -Infinity, yMax = -Infinity;
    rings.forEach(ring => {
        ring.forEach(([x, y]) => {
            if (x < xMin) xMin = x;
            if (y < yMin) yMin = y;
            if (x > xMax) xMax = x;
            if (y > yMax) yMax = y;
        });
    });

    // SHP méret: 100 (fájlfejléc) + ∑(8 bájt rekord fejléc + rekord tartalom)
    const shpBodySize = rings.reduce((sum, _, i) => sum + 8 + contentWords[i] * 2, 0);
    const shpTotalBytes = 100 + shpBodySize;
    const shpTotalWords = shpTotalBytes / 2;

    // SHX méret: 100 (fájlfejléc) + 8 * N rekord
    const shxTotalBytes = 100 + features.length * 8;
    const shxTotalWords = shxTotalBytes / 2;

    // SHP writer
    const shp = new BinWriter(shpTotalBytes);
    writeSHPFileHeader(shp, shpTotalWords, xMin, yMin, xMax, yMax);

    // SHX writer
    const shx = new BinWriter(shxTotalBytes);
    writeSHPFileHeader(shx, shxTotalWords, xMin, yMin, xMax, yMax);

    let shpOffsetWords = 50; // fejléc = 100 bájt = 50 szó

    rings.forEach((ring, idx) => {
        const n = ring.length;
        const cl = contentWords[idx];

        // SHP rekord fejléc
        shp.writeInt32BE(idx + 1);   // rekord sorszám (1-alapú)
        shp.writeInt32BE(cl);        // tartalom hossza szóban

        // SHP rekord tartalom
        let rxMin = Infinity, ryMin = Infinity, rxMax = -Infinity, ryMax = -Infinity;
        ring.forEach(([x, y]) => {
            if (x < rxMin) rxMin = x;
            if (y < ryMin) ryMin = y;
            if (x > rxMax) rxMax = x;
            if (y > ryMax) ryMax = y;
        });
        shp.writeInt32LE(5);            // Shape type: Polygon
        shp.writeFloat64LE(rxMin);
        shp.writeFloat64LE(ryMin);
        shp.writeFloat64LE(rxMax);
        shp.writeFloat64LE(ryMax);
        shp.writeInt32LE(1);            // NumParts = 1
        shp.writeInt32LE(n);            // NumPoints
        shp.writeInt32LE(0);            // Parts[0] = 0 (első pont indexe)
        ring.forEach(([x, y]) => {
            shp.writeFloat64LE(x);
            shp.writeFloat64LE(y);
        });

        // SHX rekord (offset + tartalom hossza, mindkettő szóban)
        shx.writeInt32BE(shpOffsetWords);
        shx.writeInt32BE(cl);

        shpOffsetWords += 4 + cl; // 4 szó fejléc + cl szó tartalom
    });

    return { shp: shp.result(), shx: shx.result() };
}

/** Közös SHP/SHX fájl fejléc írása (100 bájt) */
function writeSHPFileHeader(writer, fileWords, xMin, yMin, xMax, yMax) {
    writer.writeInt32BE(9994);       // Fájl kód
    writer.writeZeros(20);           // Foglalt (5 × 4 bájt)
    writer.writeInt32BE(fileWords);  // Fájl hossza szóban (big-endian)
    writer.writeInt32LE(1000);       // Verzió
    writer.writeInt32LE(5);          // Shape type: Polygon
    writer.writeFloat64LE(xMin);
    writer.writeFloat64LE(yMin);
    writer.writeFloat64LE(xMax);
    writer.writeFloat64LE(yMax);
    writer.writeFloat64LE(0); writer.writeFloat64LE(0); // Zmin, Zmax
    writer.writeFloat64LE(0); writer.writeFloat64LE(0); // Mmin, Mmax
}

// ── DBF export ────────────────────────────────────────────────────────────────

/**
 * Egyszerű DBF fájl egy NAME szöveges mezővel (max. 50 karakter).
 * dBASE III+ formátum.
 */
function buildDBF(features) {
    const NUM_FIELDS = 1;
    const FIELD_NAME = 'NAME';
    const FIELD_LEN = 50;

    const numRecords = features.length;
    // Fejléc: 32 bájt + (32 bájt/mező × NUM_FIELDS) + 1 bájt lezáró
    const headerSize = 32 + 32 * NUM_FIELDS + 1;
    // Rekord: 1 törlés flag + FIELD_LEN
    const recordSize = 1 + FIELD_LEN;
    // Teljes méret: fejléc + rekordok + 1 EOF jel
    const totalBytes = headerSize + numRecords * recordSize + 1;

    const w = new BinWriter(totalBytes);

    // ---- Fájl fejléc (32 bájt) ----
    w.writeUint8(0x03);               // dBASE III
    w.writeUint8(126);                // Év (2026 - 1900)
    w.writeUint8(3);                  // Hónap
    w.writeUint8(5);                  // Nap
    w.writeUint32LE(numRecords);      // Rekordok száma
    w.writeUint16LE(headerSize);      // Fejléc mérete bájtban
    w.writeUint16LE(recordSize);      // Rekord mérete bájtban
    w.writeZeros(20);                 // Foglalt

    // ---- Mező leíró: NAME (32 bájt) ----
    const enc = new TextEncoder();
    const nameBytes = enc.encode(FIELD_NAME);
    const fieldNameArr = new Uint8Array(11);
    fieldNameArr.set(nameBytes.slice(0, 11));   // legfeljebb 11 bájt, maradék null
    w.writeBytes(fieldNameArr);
    w.writeUint8(0x43);               // Típus: 'C' (karakter)
    w.writeZeros(4);                  // Foglalt
    w.writeUint8(FIELD_LEN);          // Mező hossza
    w.writeUint8(0);                  // Tizedes helyek
    w.writeZeros(14);                 // Foglalt

    // ---- Mező leíró lezáró ----
    w.writeUint8(0x0D);

    // ---- Rekordok ----
    features.forEach((f, idx) => {
        const props = f.getProperties();
        const raw = String(
            props.name || props.NAME || props.PARCELLA || ('Polygon ' + (idx + 1))
        ).substring(0, FIELD_LEN);
        const padded = raw.padEnd(FIELD_LEN, ' ');
        const encoded = enc.encode(padded);
        const fieldBytes = new Uint8Array(FIELD_LEN);
        fieldBytes.set(encoded.slice(0, FIELD_LEN));

        w.writeUint8(0x20);    // Nem törölt rekord
        w.writeBytes(fieldBytes);
    });

    // ---- EOF jelölő ----
    w.writeUint8(0x1A);

    return w.result();
}

// ── PRJ fájl ─────────────────────────────────────────────────────────────────

function getPRJContent(crs) {
    if (crs === 'eov') {
        return (
            'PROJCS["HD72 / EOV",' +
            'GEOGCS["HD72",' +
            'DATUM["Hungarian_Datum_1972",' +
            'SPHEROID["GRS 1967",6378160,298.247167427,AUTHORITY["EPSG","7042"]],' +
            'AUTHORITY["EPSG","6237"]],' +
            'PRIMEM["Greenwich",0,AUTHORITY["EPSG","8901"]],' +
            'UNIT["degree",0.0174532925199433,AUTHORITY["EPSG","9122"]],' +
            'AUTHORITY["EPSG","4237"]],' +
            'PROJECTION["Hotine_Oblique_Mercator_Azimuth_Center"],' +
            'PARAMETER["latitude_of_center",47.14439372222222],' +
            'PARAMETER["longitude_of_center",19.04857177777778],' +
            'PARAMETER["azimuth",90],' +
            'PARAMETER["rectified_grid_angle",90],' +
            'PARAMETER["scale_factor",0.99993],' +
            'PARAMETER["false_easting",650000],' +
            'PARAMETER["false_northing",200000],' +
            'UNIT["metre",1,AUTHORITY["EPSG","9001"]],' +
            'AUTHORITY["EPSG","23700"]]'
        );
    } else {
        return (
            'GEOGCS["ETRF2000",' +
            'DATUM["European_Terrestrial_Reference_Frame_2000",' +
            'SPHEROID["GRS 1980",6378137,298.257222101,AUTHORITY["EPSG","7019"]],' +
            'AUTHORITY["EPSG","6896"]],' +
            'PRIMEM["Greenwich",0,AUTHORITY["EPSG","8901"]],' +
            'UNIT["degree",0.0174532925199433,AUTHORITY["EPSG","9122"]],' +
            'AUTHORITY["EPSG","9067"]]'
        );
    }
}

// ── Letöltés helper ───────────────────────────────────────────────────────────

function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ── Export státusz ────────────────────────────────────────────────────────────

function setExportStatus(message, type = 'info') {
    const el = document.getElementById('exportStatus');
    if (!el) return;
    el.textContent = message;
    el.className = 'status' +
        (type === 'error'   ? ' error'   :
         type === 'warning' ? ' warning' :
         type === 'success' ? ' success' : '');
    el.hidden = false;
}

// ── Fő export belépési pont ───────────────────────────────────────────────────

function exportGeometries() {
    const formatEl = document.getElementById('exportFormat');
    const crsEl    = document.getElementById('exportCRS');
    if (!formatEl || !crsEl) return;

    const format = formatEl.value;  // 'shp' | 'kml'
    const crs    = crsEl.value;     // 'eov' | 'etrf2000'

    const features = getPolygonFeaturesForExport();
    if (!features.length) {
        setExportStatus('Nincs exportálható poligon. Először tölts fel geometriát!', 'error');
        return;
    }

    if (!AppState.transformer) {
        setExportStatus('A koordináta-transzformátor nem elérhető. Kérlek, frissítsd az oldalt!', 'error');
        return;
    }

    const crsLabel = crs === 'eov' ? 'EOV' : 'ETRF2000';
    setExportStatus('⏳ Exportálás folyamatban...', 'info');

    try {
        if (format === 'kml') {
            // ---- KML export ----
            const kmlStr = buildKML(features, crs);
            const blob = new Blob([kmlStr], { type: 'application/vnd.google-earth.kml+xml' });
            triggerDownload(blob, `export_${crsLabel}.kml`);
            setExportStatus(
                `✓ ${features.length} poligon exportálva → KML (${crsLabel})`,
                'success'
            );
        } else {
            // ---- SHP (ZIP) export ----
            const { shp, shx } = buildSHPandSHX(features, crs);
            const dbf = buildDBF(features);
            const prj = getPRJContent(crs);

            const zip = new JSZip();
            zip.file('export.shp', shp);
            zip.file('export.shx', shx);
            zip.file('export.dbf', dbf);
            zip.file('export.prj', prj);

            zip.generateAsync({ type: 'blob' }).then(blob => {
                triggerDownload(blob, `export_${crsLabel}_shapefile.zip`);
                setExportStatus(
                    `✓ ${features.length} poligon exportálva → SHP ZIP (${crsLabel})`,
                    'success'
                );
            }).catch(err => {
                Logger_Shapefile.error('ZIP generálás hiba', err);
                setExportStatus('ZIP generálás hiba: ' + err.message, 'error');
            });
        }
    } catch (err) {
        Logger_Shapefile.error('Export hiba', err);
        setExportStatus('Export hiba: ' + err.message, 'error');
    }
}

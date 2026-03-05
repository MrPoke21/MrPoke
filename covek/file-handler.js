// ============ FÁJL KEZELÉS ============
// Shapefile, KML feltöltés és feldolgozás

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
        const projection = document.getElementById('shapeFileProjection').value;
        
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
            
            // A vetületet mindig a menüből vesszük – a .prj-t minden esetben eltávolítjuk,
            // hogy az shpjs ne reprojectálja a saját (hiányos/eltérő) definíciójával.
            const projectionSelected = document.getElementById('shapeFileProjection').value;
            try {
                const jszip = new JSZip();
                const zip = await jszip.loadAsync(processedBuffer);
                let hasPrj = false;
                const filesToCopy = [];
                zip.forEach((path, zipEntry) => {
                    if (path.toLowerCase().endsWith('.prj')) {
                        hasPrj = true;
                        Logger_Shapefile.debug('.prj fájl eltávolítása – vetület a menüből: ' + projectionSelected, { name: path });
                    } else {
                        filesToCopy.push({ path, zipEntry });
                    }
                });
                if (hasPrj) {
                    const newZip = new JSZip();
                    for (const { path, zipEntry } of filesToCopy) {
                        const data = await zipEntry.async('arraybuffer');
                        newZip.file(path, data);
                    }
                    processedBuffer = await newZip.generateAsync({ type: 'arraybuffer' });
                    Logger_Shapefile.info('.prj eltávolítva, koordináták nyers formátumban kerülnek feldolgozásra');
                }
            } catch (prjStripErr) {
                Logger_Shapefile.warn('.prj eltávolítás sikertelen, folytatás eredeti bufferyel', prjStripErr.message);
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
            // Sarokpont markerek törlése
            if (AppState.cornerVectorSource) {
                AppState.cornerVectorSource.clear();
            }
            AppState.allCornerMarkers = [];
            deselectAll();
        }
        
        showStatus('⏳ Térképre rajzolás...', 'info');

        // ── OL VectorLayer a shapefile adatokból ──────────────────────────────
        // Minden esetben EPSG:23700 (EOV) koordináták a geometriában – nincs kettős konverzió.
        const dataProj = 'EPSG:23700';
        const shapeSource = new ol.source.Vector({
            features: new ol.format.GeoJSON().readFeatures(geoJsonConverted, {
                dataProjection: dataProj,
                featureProjection: 'EPSG:23700'
            })
        });

        // Stílus függvény típus szerint
        function shapefileStyleFn(feature) {
            const geomType = feature.getGeometry().getType();
            if (geomType === 'Polygon') {
                return new ol.style.Style({
                    stroke: new ol.style.Stroke({ color: CONSTANTS.COLORS.ORANGE, width: CONSTANTS.GEOMETRY.LINE_WEIGHT }),
                    fill: new ol.style.Fill({ color: 'rgba(255,107,53,0.5)' })
                });
            } else if (geomType === 'LineString') {
                return new ol.style.Style({
                    stroke: new ol.style.Stroke({ color: CONSTANTS.COLORS.ORANGE, width: CONSTANTS.GEOMETRY.LINE_WEIGHT })
                });
            } else {
                return new ol.style.Style({
                    image: new ol.style.Circle({
                        radius: CONSTANTS.GEOMETRY.CORNER_MARKER_RADIUS,
                        fill: new ol.style.Fill({ color: CONSTANTS.COLORS.ORANGE }),
                        stroke: new ol.style.Stroke({ color: CONSTANTS.COLORS.WHITE, width: 1 })
                    })
                });
            }
        }

        AppState.shapeFileLayer = new ol.layer.Vector({
            source: shapeSource,
            style: shapefileStyleFn,
            zIndex: 250
        });
        AppState.map.addLayer(AppState.shapeFileLayer);

        // Sarokpont markerek az összes polygon csúcsánhoz
        const zoom = AppState.map.getView().getZoom() || 10;
        const markerSize = getCornerMarkerSize(zoom);

        shapeSource.getFeatures().forEach(olFeature => {
            if (olFeature.getGeometry().getType() !== 'Polygon') return;

            const eovCorners = olFeature.get('eov_corners') || [];
            const olRing     = olFeature.getGeometry().getCoordinates()[0]; // EPSG:23700

            olRing.forEach((olCoord, index) => {
                const cornerFeature = new ol.Feature({
                    geometry: new ol.geom.Point(olCoord)
                });

                // EOV koordináta a sarokponthoz (transformer által számított, pontos)
                const eovCoord = eovCorners[index] || null;
                cornerFeature.set('_eovCoord', eovCoord);

                cornerFeature.setStyle(getCornerMarkerStyle('yellow', markerSize));
                AppState.cornerVectorSource.addFeature(cornerFeature);
                AppState.allCornerMarkers.push(cornerFeature);
            });
        });

        // Zoom a réteg kiterjedésére
        const layerExtent = shapeSource.getExtent();
        if (layerExtent && !ol.extent.isEmpty(layerExtent)) {
            AppState.map.getView().fit(layerExtent, { padding: [40, 40, 40, 40], duration: 500 });
        }
        
        showStatus(`✓ ${geoJsonConverted.features.length} geometria betöltve`, 'status');
        // Automatikus mentés (session-store.js)
        if (typeof sessionSave === 'function') sessionSave();
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

// ============ MATEMATIKAI MŰVELETEK ============

function formatDistance(distanceInMeters) {
    if (distanceInMeters < CONSTANTS.DISTANCE.CM_THRESHOLD) {
        return (distanceInMeters * 100).toFixed(CONSTANTS.DISTANCE.DECIMAL_PLACES) + ' cm';
    } else {
        return distanceInMeters.toFixed(CONSTANTS.DISTANCE.DECIMAL_PLACES) + ' m';
    }
}

function calculatePolygonArea(eovCorners) {
    if (!eovCorners || eovCorners.length < 3) {
        return 0;
    }
    
    let area = 0;
    for (let i = 0; i < eovCorners.length - 1; i++) {
        const corner = eovCorners[i];
        const nextCorner = eovCorners[i + 1];
        
        // Robusztus koordináta kinyerés
        let x1, y1, x2, y2;
        
        // corner lehet: {x: ..., y: ...} vagy [x, y]
        if (Array.isArray(corner)) {
            x1 = corner[0];
            y1 = corner[1];
        } else if (typeof corner === 'object' && corner !== null) {
            x1 = corner.x;
            y1 = corner.y;
        } else {
            continue; // Hibás adatot skippolunk
        }
        
        // nextCorner feldolgozása
        if (Array.isArray(nextCorner)) {
            x2 = nextCorner[0];
            y2 = nextCorner[1];
        } else if (typeof nextCorner === 'object' && nextCorner !== null) {
            x2 = nextCorner.x;
            y2 = nextCorner.y;
        } else {
            continue;
        }
        
        // Számokon belüli validáció
        if (!isFinite(x1) || !isFinite(y1) || !isFinite(x2) || !isFinite(y2)) {
            continue;
        }
        
        area += x1 * y2 - x2 * y1;
    }
    
    // Záró oldal
    if (eovCorners.length >= 2) {
        const lastCorner = eovCorners[eovCorners.length - 1];
        const firstCorner = eovCorners[0];
        
        let x1, y1, x2, y2;
        
        if (Array.isArray(lastCorner)) {
            x1 = lastCorner[0];
            y1 = lastCorner[1];
        } else if (typeof lastCorner === 'object' && lastCorner !== null) {
            x1 = lastCorner.x;
            y1 = lastCorner.y;
        }
        
        if (Array.isArray(firstCorner)) {
            x2 = firstCorner[0];
            y2 = firstCorner[1];
        } else if (typeof firstCorner === 'object' && firstCorner !== null) {
            x2 = firstCorner.x;
            y2 = firstCorner.y;
        }
        
        if (isFinite(x1) && isFinite(y1) && isFinite(x2) && isFinite(y2)) {
            area += x1 * y2 - x2 * y1;
        }
    }
    
    return Math.abs(area) / 2; // m²
}

function formatArea(areaInSquaremeters) {
    if (areaInSquaremeters < 10000) {
        // m²-ben
        return areaInSquaremeters.toFixed(2) + ' m²';
    } else if (areaInSquaremeters < 1000000) {
        // Hektár (10000 m²)
        return (areaInSquaremeters / 10000).toFixed(2) + ' ha';
    } else {
        // km²
        return (areaInSquaremeters / 1000000).toFixed(2) + ' km²';
    }
}

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

// Merőleges vetítés az ETRF2000 (lat/lon) síkban - kisebb távolságoknál pontosabb
function calculatePointToLineDistanceETRF2000(pointETRF2000, lineStartETRF2000, lineEndETRF2000) {
    const px = pointETRF2000.lon;  // lon (x)
    const py = pointETRF2000.lat;  // lat (y)
    const x1 = lineStartETRF2000.lon;
    const y1 = lineStartETRF2000.lat;
    const x2 = lineEndETRF2000.lon;
    const y2 = lineEndETRF2000.lat;
    
    // Vonal vektora
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lineLengthSq = dx * dx + dy * dy;
    
    // Floating point precision: 1e-15 alatt tekintjük 0-nak (ETRF2000 koordináta-rendszer)
    if (Math.abs(lineLengthSq) < 1e-15) {
        const dpx = px - x1;
        const dpy = py - y1;
        return { 
            distance: Math.sqrt(dpx * dpx + dpy * dpy), 
            projection: { lat: y1, lon: x1 },
            t: 0,
            perpDistance: Math.sqrt(dpx * dpx + dpy * dpy),
            originalProjection: { lat: y1, lon: x1 }
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
        projection: { lat: projY, lon: projX },
        t: t_original,
        perpDistance: perpDistance,
        originalProjection: { lat: projY_original, lon: projX_original }
    };
}

// Koordináta-transzformációs függvények az eov-transformer.js-ben

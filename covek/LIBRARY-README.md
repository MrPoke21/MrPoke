# Cövek Library - Dokumentáció

Standalone JavaScript könyvtár EOV ↔ ETRF2000 koordináta-transzformációhoz.

## Telepítés

Másold az `eov-transformer.js` fájlt a projektedbe.

## Függőségek

```html
<!-- Proj4.js (szükséges) -->
<script src="https://cdn.jsdelivr.net/npm/proj4@2.20.0/dist/proj4.js"></script>

<!-- GeoTIFF.js (opcionális, HD72 rácshöz) -->
<script src="https://cdn.jsdelivr.net/npm/geotiff@2.1.3/dist-browser/geotiff.js"></script>

<!-- Cövek Library -->
<script src="eov-transformer.js"></script>
```

## Használat

### Alapvetö inicializálás

```javascript
const cövek = new EOVTransformer();

// EOV → ETRF2000
const result = cövek.eov2etrf2000(738878, 145995);
console.log(result);  // {lat: 46.652..., lon: 20.208..., accuracy: "±2-5m", gridUsed: false}

// ETRF2000 → EOV
const eov = cövek.etrf2000_2eov(46.652377675, 20.208615734);
console.log(eov);  // {y: 738878, x: 145995, accuracy: "±2-5m", gridUsed: false}
```

### HD72 rács betöltése (pontosság javulás)

```javascript
const cövek = new EOVTransformer();

// File input-ból betöltés
document.getElementById('gridFile').addEventListener('change', async (e) => {
  const success = await cövek.loadGridFile(e.target.files[0]);
  if (success) {
    console.log('Grid sikeresen betöltve!');
    console.log(cövek.getGridStatus());  // {loaded: true, accuracy: "±0.1-0.5m", ...}
  }
});

// Automatikus betöltés LocalStorage-ból
await cövek.loadGridFromStorage();
```

### Grid státusz ellenőrzése

```javascript
const status = cövek.getGridStatus();
console.log(status);
// {
//   loaded: true,
//   accuracy: "±0.1-0.5m (HD72 grid)",
//   source: "HD72 nadgrid (hu_bme_hd72corr.tif)"
// }
```

### Távolság kiszámítása (validáció)

```javascript
const expectedLat = 46.652377675;
const expectedLon = 20.208615734;

const result = cövek.eov2etrf2000(738878, 145995);

const distanceMeters = EOVTransformer.haversine(
  result.lat, result.lon,
  expectedLat, expectedLon
);

console.log(`Eltérés: ${distanceMeters.toFixed(2)}m`);
```

## API Referencia

### `new EOVTransformer()`
Inicializálja a könyvtárat és a Proj4 definíciókat.

### `eov2etrf2000(eovY, eovX) -> Object`
EOV-ből ETRF2000-be konvertál.
- **Paraméterek**: 
  - `eovY`: EOV Y koordináta (méter)
  - `eovX`: EOV X koordináta (méter)
- **Visszatérés**: `{lat, lon, accuracy, gridUsed}`

### `etrf2000_2eov(lat, lon) -> Object`
ETRF2000-ből EOV-be konvertál.
- **Paraméterek**:
  - `lat`: Szélesség (fok)
  - `lon`: Hosszúság (fok)
- **Visszatérés**: `{y, x, accuracy, gridUsed}`

### `loadGridFile(file) -> Promise<boolean>`
HD72 rácsfájlt betölt FileReader API-ból.
- **Paraméter**: `File` objektum (hu_bme_hd72corr.tif)
- **Mellékhatás**: Tárol LocalStorage-ban Base64-ként
- **Visszatérés**: `true` siker, `false` hiba

### `loadGridFromStorage() -> Promise<boolean>`
Automatikusan betölti a rácsot LocalStorage-ból ha létezik.

### `getGridStatus() -> Object`
Aktuális grid státuszát adja vissza.
- **Visszatérés**: `{loaded, accuracy, source}`

### `static haversine(lat1, lon1, lat2, lon2) -> number`
Haversine-képlettel kiszámítja két pont közötti távolságot.
- **Paraméterek**: Szélességek és hosszúságok (fok)
- **Visszatérés**: Távolság méterben

### `clearGridStorage()`
Törli a LocalStorage-ban tárolt rácsfájlt.

## Pontosság

- **HD72 gridpel**: ±0.1-0.5m
- **Helmert transzformáció (fallback)**: ±2-5m

## ES6 Module Import

```javascript
import EOVTransformer from './eov-transformer.js';

const cövek = new EOVTransformer();
```

## Node.js/CommonJS

```javascript
const EOVTransformer = require('./eov-transformer.js');

const cövek = new EOVTransformer();
```

## Teszt Eset

```javascript
const cövek = new EOVTransformer();

// Ismert koordináta-páros (HD72 grid betöltése után)
const result = cövek.eov2etrf2000(738878, 145995);
// Várható: lat ≈ 46.652377675, lon ≈ 20.208615734

const distance = EOVTransformer.haversine(
  result.lat, result.lon,
  46.652377675, 20.208615734
);

console.log(`Eltérés: ${distance.toFixed(1)}m`);
// Grid nélkül: ~2000-5000m
// Grid-del: ~100-500m
```

## Licencia

MIT

## Szerzői jog

Cövek Project 2025

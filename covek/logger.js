// ============ LOGGER UTILITY ============
// Strukturált loggolás fejlesztés és production-hoz

class Logger {
    constructor(moduleName = 'App') {
        this.moduleName = moduleName;
        this.isDev = true; // Fejlesztési mód
    }

    // Szint: INFO (zöld)
    info(message, data = null) {
        const timestamp = this._getTimestamp();
        const prefix = `[${timestamp}] [${this.moduleName}] ℹ️`;
        console.log(`%c${prefix} ${message}`, 'color: #00aa00; font-weight: bold;', data || '');
    }

    // Szint: WARNING (sárga)
    warn(message, data = null) {
        const timestamp = this._getTimestamp();
        const prefix = `[${timestamp}] [${this.moduleName}] ⚠️`;
        console.warn(`%c${prefix} ${message}`, 'color: #ff9900; font-weight: bold;', data || '');
    }

    // Szint: ERROR (vörös) - hiba
    error(message, error = null) {
        const timestamp = this._getTimestamp();
        const prefix = `[${timestamp}] [${this.moduleName}] ❌`;
        
        // Error object stringifyelés
        let errorStr = '';
        if (error) {
            if (typeof error === 'string') {
                errorStr = error;
            } else if (error.message) {
                errorStr = error.message;
            } else {
                errorStr = String(error);
            }
        }
        
        console.error(`%c${prefix} ${message}`, 'color: #ff0000; font-weight: bold;', errorStr || '');
        
        // Stack trace development módban
        if (this.isDev && error && error.stack) {
            console.error(error.stack);
        }
    }

    // Szint: DEBUG (kék) - csak dev módban
    debug(message, data = null) {
        if (!this.isDev) return;
        const timestamp = this._getTimestamp();
        const prefix = `[${timestamp}] [${this.moduleName}] 🔧`;
        console.debug(`%c${prefix} ${message}`, 'color: #0066ff; font-weight: bold;', data || '');
    }

    // Szint: SUCCESS (zöld, nagy)
    success(message, data = null) {
        const timestamp = this._getTimestamp();
        const prefix = `[${timestamp}] [${this.moduleName}] ✅`;
        console.log(`%c${prefix} ${message}`, 'color: #00cc00; font-weight: bold; font-size: 14px;', data || '');
    }

    // Helper: timestamp formátum (HH:MM:SS.mmm)
    _getTimestamp() {
        const now = new Date();
        const h = String(now.getHours()).padStart(2, '0');
        const m = String(now.getMinutes()).padStart(2, '0');
        const s = String(now.getSeconds()).padStart(2, '0');
        const ms = String(now.getMilliseconds()).padStart(3, '0');
        return `${h}:${m}:${s}.${ms}`;
    }

    // Helper: háttér színes message
    coloredMessage(message, color = '#00aa00') {
        return `%c${message}`;
    }

    // Helper: grouped logs (fejlesztéshez)
    group(label) {
        console.group(`%c${label}`, 'color: #0066ff; font-weight: bold; font-size: 16px;');
    }

    groupEnd() {
        console.groupEnd();
    }
}

// Globális loggerek
const Logger_App = new Logger('App');
const Logger_Transform = new Logger('Transform');
const Logger_Map = new Logger('Map');
const Logger_GPS = new Logger('GPS');
const Logger_Shapefile = new Logger('Shapefile');
const Logger_UI = new Logger('UI');

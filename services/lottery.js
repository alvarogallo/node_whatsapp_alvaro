// services/lottery.js
// Servicio para manejar la caché de lotería y validación de claves

const axios = require('axios');

// Caché en memoria
const lotteryCache = new Map();

// URL de la API de lotería
const LOTTERY_API_URL = 'https://apisbotman.unatecla.com/api/loterias';

/**
 * Obtener fecha en formato YYYYMMDD
 */
function getDateString() {
    try {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        return `${year}${month}${day}`;
    } catch (error) {
        console.error('[LOTTERY] ❌ Error obteniendo fecha:', error);
        return null;
    }
}

/**
 * Generar nombre de clave de caché
 */
function getCacheKey() {
    try {
        const dateString = getDateString();
        if (!dateString) {
            throw new Error('No se pudo obtener la fecha');
        }
        return `clave_hoy_${dateString}`;
    } catch (error) {
        console.error('[LOTTERY] ❌ Error generando clave de caché:', error);
        return `clave_hoy_${Date.now()}`; // Fallback
    }
}

/**
 * Obtener datos de lotería desde la API
 */
async function fetchLotteryData() {
    try {
        console.log('[LOTTERY] 🎲 Obteniendo datos de lotería desde API...');
        
        const response = await axios.get(LOTTERY_API_URL, {
            timeout: 15000, // 15 segundos timeout
            headers: {
                'User-Agent': 'WhatsApp-Bot/1.0',
                'Accept': 'application/json'
            },
            validateStatus: function (status) {
                return status >= 200 && status < 300; // Solo 2xx son válidos
            }
        });

        // Validar estructura de respuesta
        if (!response.data) {
            throw new Error('Respuesta vacía de la API');
        }

        if (!response.data.lot_unatecla) {
            throw new Error('Campo lot_unatecla no encontrado en la respuesta');
        }

        console.log('[LOTTERY] ✅ Datos de lotería obtenidos exitosamente:', response.data);
        return response.data;

    } catch (error) {
        if (error.code === 'ECONNABORTED') {
            console.error('[LOTTERY] ❌ Timeout conectando a la API de lotería');
            throw new Error('Timeout conectando a la API de lotería');
        } else if (error.response) {
            console.error('[LOTTERY] ❌ Error HTTP de la API:', error.response.status, error.response.statusText);
            throw new Error(`Error HTTP ${error.response.status}: ${error.response.statusText}`);
        } else if (error.request) {
            console.error('[LOTTERY] ❌ No se pudo conectar a la API de lotería');
            throw new Error('No se pudo conectar a la API de lotería');
        } else {
            console.error('[LOTTERY] ❌ Error procesando respuesta de lotería:', error.message);
            throw error;
        }
    }
}

/**
 * Obtener datos de lotería del día (con caché de 24 horas)
 */
async function getTodayLotteryData() {
    try {
        const cacheKey = getCacheKey();
        if (!cacheKey) {
            throw new Error('No se pudo generar clave de caché');
        }

        const cached = lotteryCache.get(cacheKey);
        
        // Verificar si existe caché válido
        if (cached && cached.expiresAt > Date.now()) {
            console.log(`[LOTTERY] 📦 Usando datos desde caché: ${cached.data.lot_unatecla}`);
            return cached.data;
        }

        // Obtener nuevos datos de la API
        const lotteryData = await fetchLotteryData();
        
        // Calcular tiempo de expiración (24 horas desde ahora)
        const expiresAt = Date.now() + (24 * 60 * 60 * 1000);
        
        // Guardar en caché
        lotteryCache.set(cacheKey, {
            data: lotteryData,
            expiresAt: expiresAt,
            createdAt: Date.now()
        });
        
        console.log(`[LOTTERY] 💾 Datos guardados en caché por 24h: ${lotteryData.lot_unatecla}`);
        
        return lotteryData;

    } catch (error) {
        console.error('[LOTTERY] ❌ Error obteniendo datos de lotería:', error.message);
        
        // Intentar usar caché expirado como fallback
        const cacheKey = getCacheKey();
        if (cacheKey) {
            const cached = lotteryCache.get(cacheKey);
            if (cached) {
                console.log('[LOTTERY] ⚠️  Usando caché expirado como fallback');
                return cached.data;
            }
        }
        
        throw error;
    }
}

/**
 * Validar si una clave es correcta para hoy
 */
async function validateTodayKey(providedKey) {
    try {
        // Validar parámetro de entrada
        if (!providedKey || typeof providedKey !== 'string') {
            return {
                isValid: false,
                error: 'Clave proporcionada inválida o vacía',
                providedKey: providedKey
            };
        }

        const todayData = await getTodayLotteryData();
        
        if (!todayData || !todayData.lot_unatecla) {
            return {
                isValid: false,
                error: 'No se pudieron obtener datos de lotería',
                providedKey: providedKey
            };
        }

        const isValid = providedKey.trim() === todayData.lot_unatecla.trim();
        
        console.log(`[LOTTERY] 🔐 Validando clave: ${providedKey} ${isValid ? '✅' : '❌'}`);
        
        return {
            isValid: isValid,
            providedKey: providedKey,
            expectedKey: todayData.lot_unatecla,
            lotteryData: todayData
        };

    } catch (error) {
        console.error('[LOTTERY] ❌ Error validando clave:', error.message);
        return {
            isValid: false,
            error: error.message,
            providedKey: providedKey
        };
    }
}

/**
 * Obtener información del caché actual (con carga automática)
 */
async function getCacheInfo(autoLoad = false) {
    try {
        const cacheKey = getCacheKey();
        const dateString = getDateString();
        
        if (!cacheKey) {
            return {
                exists: false,
                error: 'Error generando clave de caché',
                dateString: dateString
            };
        }

        let cached = lotteryCache.get(cacheKey);
        
        // Si no existe caché y se solicita carga automática, intentar cargar
        if (!cached && autoLoad) {
            try {
                console.log('[LOTTERY] 🔄 Caché vacío, cargando automáticamente...');
                await getTodayLotteryData();
                cached = lotteryCache.get(cacheKey);
            } catch (error) {
                console.error('[LOTTERY] ❌ Error en carga automática:', error.message);
                return {
                    exists: false,
                    cacheKey: cacheKey,
                    dateString: dateString,
                    totalCacheEntries: lotteryCache.size,
                    autoLoadError: error.message
                };
            }
        }
        
        if (!cached) {
            return {
                exists: false,
                cacheKey: cacheKey,
                dateString: dateString,
                totalCacheEntries: lotteryCache.size
            };
        }
        
        const now = Date.now();
        const timeUntilExpiry = cached.expiresAt - now;
        
        return {
            exists: true,
            cacheKey: cacheKey,
            dateString: dateString,
            isExpired: timeUntilExpiry <= 0,
            expiresIn: Math.max(0, Math.floor(timeUntilExpiry / 1000)), // segundos
            expiresInHours: Math.max(0, Math.floor(timeUntilExpiry / (1000 * 60 * 60))), // horas
            createdAt: new Date(cached.createdAt).toISOString(),
            expiresAt: new Date(cached.expiresAt).toISOString(),
            data: cached.data,
            totalCacheEntries: lotteryCache.size
        };

    } catch (error) {
        console.error('[LOTTERY] ❌ Error obteniendo info de caché:', error);
        return {
            exists: false,
            error: error.message,
            totalCacheEntries: lotteryCache.size
        };
    }
}

/**
 * Limpiar caché expirado
 */
function cleanExpiredCache() {
    try {
        const now = Date.now();
        let cleaned = 0;
        
        for (const [key, value] of lotteryCache.entries()) {
            if (value.expiresAt <= now) {
                lotteryCache.delete(key);
                cleaned++;
                console.log(`[LOTTERY] 🗑️  Eliminado caché expirado: ${key}`);
            }
        }
        
        if (cleaned > 0) {
            console.log(`[LOTTERY] 🧹 Limpiado ${cleaned} entrada(s) de caché expirada(s)`);
        }
        
        return cleaned;

    } catch (error) {
        console.error('[LOTTERY] ❌ Error limpiando caché:', error);
        return 0;
    }
}

/**
 * Forzar actualización de caché
 */
async function refreshCache() {
    try {
        const cacheKey = getCacheKey();
        if (cacheKey) {
            lotteryCache.delete(cacheKey);
            console.log('[LOTTERY] 🔄 Caché eliminado, forzando actualización...');
        }
        
        return await getTodayLotteryData();

    } catch (error) {
        console.error('[LOTTERY] ❌ Error refrescando caché:', error);
        throw error;
    }
}

/**
 * Obtener todas las claves de caché (para debugging)
 */
function getAllCacheKeys() {
    try {
        return Array.from(lotteryCache.keys());
    } catch (error) {
        console.error('[LOTTERY] ❌ Error obteniendo claves de caché:', error);
        return [];
    }
}

// Limpiar caché expirado cada hora
const cleanupInterval = setInterval(cleanExpiredCache, 60 * 60 * 1000);

// Limpiar interval al cerrar la aplicación
process.on('SIGINT', () => {
    clearInterval(cleanupInterval);
});

process.on('SIGTERM', () => {
    clearInterval(cleanupInterval);
});

// Log inicial
console.log(`[LOTTERY] 🚀 Servicio de lotería iniciado - Fecha: ${getDateString()}`);

module.exports = {
    getTodayLotteryData,
    validateTodayKey,
    getCacheInfo,
    cleanExpiredCache,
    refreshCache,
    getAllCacheKeys,
    getDateString
};
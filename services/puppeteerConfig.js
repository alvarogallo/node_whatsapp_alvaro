// services/puppeteerConfig.js
// Configuración optimizada de Puppeteer para WhatsApp Web.js

// Argumentos optimizados para Chrome/Puppeteer
const OPTIMIZED_CHROME_ARGS = [
    // Seguridad y sandbox
    '--no-sandbox',
    '--disable-setuid-sandbox',
    
    // Memoria y performance
    '--disable-dev-shm-usage',           // Usar /tmp en lugar de /dev/shm
    '--memory-pressure-off',             // Desactivar gestión de presión de memoria
    '--max_old_space_size=512',          // Límite de heap V8 (512MB)
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    
    // GPU y gráficos (reducir uso de memoria)
    '--disable-gpu',
    '--disable-gpu-sandbox',
    '--disable-software-rasterizer',
    '--disable-accelerated-2d-canvas',
    '--disable-accelerated-jpeg-decoding',
    '--disable-accelerated-mjpeg-decode',
    '--disable-accelerated-video-decode',
    
    // Extensiones y plugins
    '--disable-extensions',
    '--disable-plugins',
    '--disable-default-apps',
    '--disable-background-mode',
    
    // Web features innecesarios
    '--disable-web-security',
    '--disable-features=TranslateUI',
    '--disable-features=VizDisplayCompositor',
    '--disable-ipc-flooding-protection',
    
    // Otros
    '--no-first-run',
    '--disable-logging',
    '--silent',
    '--no-default-browser-check',
    '--disable-prompt-on-repost'
];

// Configuración específica para desarrollo vs producción
function getPuppeteerConfig(isDevelopment = false) {
    const baseConfig = {
        headless: true,
        args: [...OPTIMIZED_CHROME_ARGS], // Usar spread para copiar el array
        ignoreDefaultArgs: ['--disable-extensions'],
        defaultViewport: {
            width: 1280,
            height: 720
        }
    };
    
    if (isDevelopment) {
        // En desarrollo, más estabilidad (no usar single-process)
        baseConfig.devtools = false;
        console.log('[PUPPETEER] 🛠️  Modo desarrollo: configuración estable');
    } else {
        // En producción, máximo ahorro de memoria
        baseConfig.args.push(
            '--single-process',              // Solo en producción
            '--disable-dev-tools',
            '--disable-sync',
            '--disable-translate',
            '--hide-scrollbars',
            '--mute-audio'
        );
        console.log('[PUPPETEER] 🚀 Modo producción: configuración optimizada para memoria');
    }
    
    return baseConfig;
}

// Función para obtener configuración optimizada para WhatsApp Web.js
function getWhatsAppClientConfig(sessionId, isDevelopment = false) {
    return {
        authStrategy: new (require('whatsapp-web.js').LocalAuth)({
            clientId: sessionId,
            dataPath: `./sessions/${sessionId}`
        }),
        puppeteer: getPuppeteerConfig(isDevelopment),
        
        // Configuraciones adicionales de WhatsApp Web.js
        qrMaxRetries: 3,
        authTimeoutMs: 60000, // 1 minuto
        restartOnAuthFail: true,
        
        // Configuración de User Agent
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        
        // Configuración de sesión
        session: undefined, // Usar LocalAuth en su lugar
        
        // Configuración de timeouts
        takeoverOnConflict: false,
        takeoverTimeoutMs: 0
    };
}

// Función para monitorear procesos de Chrome
function monitorChromeProcesses() {
    const { exec } = require('child_process');
    
    return new Promise((resolve) => {
        exec('pgrep -f chrome', (error, stdout) => {
            if (error) {
                resolve({ count: 0, pids: [] });
                return;
            }
            
            const pids = stdout.trim().split('\n').filter(pid => pid);
            resolve({
                count: pids.length,
                pids: pids
            });
        });
    });
}

// Función para limpiar procesos zombie de Chrome
async function cleanupZombieProcesses() {
    try {
        const processes = await monitorChromeProcesses();
        
        if (processes.count > 10) { // Si hay demasiados procesos Chrome
            console.warn(`[PUPPETEER] ⚠️  Detectados ${processes.count} procesos Chrome, algunos pueden ser zombies`);
            
            // Intentar limpieza suave
            const { exec } = require('child_process');
            exec('pkill -f "chrome.*--type=renderer"', (error) => {
                if (!error) {
                    console.log('[PUPPETEER] 🧹 Procesos renderer de Chrome limpiados');
                }
            });
        }
        
        return processes;
        
    } catch (error) {
        console.error('[PUPPETEER] ❌ Error monitoreando procesos Chrome:', error.message);
        return { count: 0, pids: [] };
    }
}

// Función para optimizar sesión existente
function optimizeExistingSession(client) {
    try {
        console.log('[PUPPETEER] ⚙️  Optimizando sesión existente...');
        
        // Configurar timeouts más agresivos
        if (client.pupPage) {
            client.pupPage.setDefaultTimeout(30000);
            client.pupPage.setDefaultNavigationTimeout(30000);
        }
        
        // Limpiar caché periódicamente (cada 10 minutos)
        if (client.pupBrowser) {
            const cleanupInterval = setInterval(async () => {
                try {
                    const pages = await client.pupBrowser.pages();
                    for (const page of pages) {
                        await page.evaluate(() => {
                            // Limpiar localStorage y sessionStorage
                            if (typeof localStorage !== 'undefined') localStorage.clear();
                            if (typeof sessionStorage !== 'undefined') sessionStorage.clear();
                            
                            // Forzar garbage collection si está disponible
                            if (window.gc) window.gc();
                        });
                    }
                    console.log('[PUPPETEER] 🧹 Caché del navegador limpiado');
                } catch (error) {
                    console.warn('[PUPPETEER] ⚠️  Error limpiando caché:', error.message);
                }
            }, 10 * 60 * 1000); // Cada 10 minutos
            
            // Limpiar interval cuando se cierre la sesión
            client.on('disconnected', () => {
                clearInterval(cleanupInterval);
                console.log('[PUPPETEER] 🔄 Limpieza de caché deshabilitada para sesión desconectada');
            });
        }
        
        console.log('[PUPPETEER] ✅ Sesión optimizada correctamente');
        
    } catch (error) {
        console.error('[PUPPETEER] ❌ Error optimizando sesión:', error.message);
    }
}

// Función para obtener estadísticas de Chrome
async function getChromeStats() {
    try {
        const processes = await monitorChromeProcesses();
        
        return {
            chromeProcesses: processes.count,
            pids: processes.pids,
            memoryOptimized: true,
            configType: process.env.NODE_ENV === 'development' ? 'development' : 'production'
        };
        
    } catch (error) {
        return {
            chromeProcesses: 0,
            pids: [],
            memoryOptimized: false,
            error: error.message
        };
    }
}

module.exports = {
    getPuppeteerConfig,
    getWhatsAppClientConfig,
    monitorChromeProcesses,
    cleanupZombieProcesses,
    optimizeExistingSession,
    getChromeStats,
    OPTIMIZED_CHROME_ARGS
};
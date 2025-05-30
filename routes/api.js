// routes/api.js
// Rutas públicas de la API (no requieren autenticación)

const express = require('express');
const router = express.Router();
const { createSession, getSession, destroySession } = require('../services/whatsapp');

const path = require('path');

// Importar servicio de lotería con manejo de errores
let lotteryService;
try {
    lotteryService = require('../services/lottery');
    console.log('[API] ✅ Servicio de lotería cargado correctamente');
} catch (error) {
    console.error('[API] ❌ Error cargando servicio de lotería:', error);
    lotteryService = null;
}

// Middleware para verificar si el servicio de lotería está disponible
function checkLotteryService(req, res, next) {
    if (!lotteryService) {
        return res.status(503).json({
            success: false,
            error: 'Servicio de lotería no disponible',
            message: 'El sistema de validación de claves está temporalmente fuera de servicio'
        });
    }
    next();
}

// Información del sistema - PÚBLICA
router.get('/system-info', (req, res) => {
    try {
        const memoryUsage = process.memoryUsage();
        const uptime = process.uptime();
        
        // Convertir bytes a MB
        const formatBytes = (bytes) => (bytes / 1024 / 1024).toFixed(2);
        
        // Formatear tiempo de actividad
        const formatUptime = (seconds) => {
            const days = Math.floor(seconds / 86400);
            const hours = Math.floor((seconds % 86400) / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            const secs = Math.floor(seconds % 60);
            
            if (days > 0) return `${days}d ${hours}h ${minutes}m`;
            if (hours > 0) return `${hours}h ${minutes}m`;
            if (minutes > 0) return `${minutes}m ${secs}s`;
            return `${secs}s`;
        };
        
        const systemInfo = {
            memory: {
                rss: formatBytes(memoryUsage.rss), // RAM total usada
                heapUsed: formatBytes(memoryUsage.heapUsed), // Heap usado por V8
                heapTotal: formatBytes(memoryUsage.heapTotal), // Heap total asignado
                external: formatBytes(memoryUsage.external), // Memoria externa (C++)
                arrayBuffers: formatBytes(memoryUsage.arrayBuffers || 0)
            },
            process: {
                uptime: formatUptime(uptime),
                uptimeSeconds: Math.floor(uptime),
                pid: process.pid,
                version: process.version,
                platform: process.platform,
                arch: process.arch
            },
            services: {
                lottery: !!lotteryService
            },
            timestamp: new Date().toISOString()
        };
        
        console.log(`[API] 📊 System info requested - RAM: ${systemInfo.memory.rss}MB, Uptime: ${systemInfo.process.uptime}`);
        
        res.json({
            success: true,
            data: systemInfo
        });
        
    } catch (error) {
        console.error('[API] ❌ Error obteniendo system-info:', error);
        res.status(500).json({
            success: false,
            error: 'Error obteniendo información del sistema: ' + error.message
        });
    }
});

// Cliente WhatsApp - Servir página HTML
router.get('/cliente', (req, res) => {
    try {
        res.sendFile(path.join(__dirname, '..', 'public', 'cliente_whatsapp.html'));
    } catch (error) {
        console.error('[API] ❌ Error sirviendo cliente:', error);
        res.status(500).json({
            success: false,
            error: 'Error sirviendo página del cliente'
        });
    }
});

// Ruta para obtener información de la clave del día
router.get('/lottery-info', checkLotteryService, async (req, res) => {
    try {
        // Intentar carga automática si no hay caché
        const cacheInfo = await lotteryService.getCacheInfo(true);
        
        if (!cacheInfo.exists) {
            if (cacheInfo.autoLoadError) {
                return res.status(503).json({
                    success: false,
                    message: 'Error cargando datos de lotería automáticamente',
                    error: cacheInfo.autoLoadError,
                    cache: cacheInfo,
                    fallback: 'Use POST /api/lottery-refresh para intentar cargar manualmente'
                });
            }
            
            return res.json({
                success: false,
                message: 'No hay datos de lotería en caché. Use POST /api/lottery-refresh para cargar.',
                cache: cacheInfo,
                allCacheKeys: lotteryService.getAllCacheKeys ? lotteryService.getAllCacheKeys() : []
            });
        }
        
        res.json({
            success: true,
            message: 'Información de lotería del día',
            cache: cacheInfo,
            hint: cacheInfo.isExpired ? 'Caché expirado, se actualizará en la próxima consulta' : 'Caché válido',
            todayKey: cacheInfo.data ? cacheInfo.data.lot_unatecla : null
        });
        
    } catch (error) {
        console.error('[API] ❌ Error obteniendo info de lotería:', error);
        res.status(500).json({
            success: false,
            error: 'Error obteniendo información: ' + error.message
        });
    }
});

// Ruta para refrescar caché manualmente (útil para testing)
router.post('/lottery-refresh', checkLotteryService, async (req, res) => {
    try {
        console.log('[API] 🔄 Solicitando actualización de caché de lotería...');
        const newData = await lotteryService.refreshCache();
        
        res.json({
            success: true,
            message: 'Caché de lotería actualizado',
            data: newData,
            newKey: newData.lot_unatecla
        });
        
    } catch (error) {
        console.error('[API] ❌ Error refrescando caché:', error);
        res.status(500).json({
            success: false,
            error: 'Error actualizando caché: ' + error.message
        });
    }
});

// CREAR SESIÓN CON VALIDACIÓN DE CLAVE DEL DÍA - ÚNICA RUTA POST /session
router.post('/session', checkLotteryService, async (req, res) => {
    try {
        const { sessionId, clave_hoy, customName } = req.body;
        
        // Validar campos requeridos
        if (!sessionId || !clave_hoy) {
            return res.status(400).json({
                success: false,
                error: 'sessionId y clave_hoy son requeridos',
                example: {
                    sessionId: "mi_sesion_123",
                    clave_hoy: "0705934",
                    customName: "Mi WhatsApp Bot" // opcional
                },
                hint: "Obtenga la clave del día desde GET /api/lottery-info"
            });
        }
        
        // Validar formato de sessionId
        if (typeof sessionId !== 'string' || sessionId.trim().length === 0) {
            return res.status(400).json({
                success: false,
                error: 'sessionId debe ser una cadena válida no vacía'
            });
        }
        
        // Validar clave del día
        console.log(`[API] 🔐 Validando clave_hoy para sesión ${sessionId}: ${clave_hoy}`);
        const keyValidation = await lotteryService.validateTodayKey(clave_hoy);
        
        if (!keyValidation.isValid) {
            return res.status(403).json({
                success: false,
                error: 'clave_hoy incorrecta',
                provided: keyValidation.providedKey,
                expected: keyValidation.expectedKey || 'Error obteniendo clave',
                message: 'Use GET /api/lottery-info para obtener la clave correcta',
                validation: keyValidation
            });
        }
        
        // Verificar si la sesión ya existe
        const existingSession = getSession(sessionId);
        if (existingSession) {
            return res.status(409).json({
                success: false,
                error: 'La sesión ya existe',
                sessionId: sessionId,
                status: existingSession.status,
                createdAt: existingSession.createdAt,
                message: 'Use GET /api/qr/:sessionId para obtener el QR'
            });
        }
        
        // Crear nueva sesión
        console.log(`[API] 🔧 clave_hoy válida ✅ Creando sesión: ${sessionId}`);
        const newSession = await createSession(sessionId);
        
        console.log(`[API] ✅ Sesión ${sessionId} creada exitosamente con clave_hoy del día`);
        
        // Esperar a que se genere el código QR (máximo 30 segundos)
        let qrCode = null;
        let attempts = 0;
        const maxAttempts = 60; // 30 segundos (500ms * 60)
        
        console.log(`[API] ⏳ Esperando generación de QR para sesión ${sessionId}...`);
        
        while (!qrCode && attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 500)); // Esperar 500ms
            attempts++;
            
            const currentSession = getSession(sessionId);
            if (currentSession && currentSession.qrCode) {
                qrCode = currentSession.qrCode;
                console.log(`[API] 📱 QR generado para sesión ${sessionId} en ${attempts * 0.5}s`);
                break;
            }
        }
        
        // Preparar respuesta
        const response = {
            success: true,
            sessionId: sessionId,
            status: newSession.status,
            message: 'Sesión creada exitosamente',
            createdAt: newSession.createdAt,
            lastActivity: newSession.lastActivity,
            customName: customName || null,
            lottery: {
                clave_hoy_used: keyValidation.providedKey,
                lot_unatecla: keyValidation.expectedKey,
                lotteryDate: keyValidation.lotteryData.fecha,
                lotteryTime: keyValidation.lotteryData.hora_nace
            },
            next_steps: {
                check_status: `GET /api/status/${sessionId}`,
                delete_session: `DELETE /api/session/${sessionId}`
            }
        };
        
        // Incluir QR si se generó
        if (qrCode) {
            response.qrCode = qrCode;
            response.qr_status = 'generated';
            response.generated_in = `${attempts * 0.5}s`;
            response.message += ' - QR código generado';
        } else {
            response.qr_status = 'timeout';
            response.message += ' - QR código no generado (timeout)';
            response.next_steps.get_qr = `GET /api/qr/${sessionId}`;
            response.retry_qr_after = 3;
        }
        
        res.status(201).json(response);
        
    } catch (error) {
        console.error('[API] ❌ Error creando sesión:', error);
        res.status(500).json({
            success: false,
            error: 'Error interno del servidor: ' + error.message
        });
    }
});

// Ruta alternativa con sessionId en la URL (también con validación)
router.post('/session/:sessionId', checkLotteryService, async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { clave_hoy, customName } = req.body;
        
        // Validar sessionId del parámetro
        if (!sessionId || typeof sessionId !== 'string' || sessionId.trim().length === 0) {
            return res.status(400).json({
                success: false,
                error: 'sessionId en la URL debe ser válido'
            });
        }
        
        // Validar clave requerida
        if (!clave_hoy) {
            return res.status(400).json({
                success: false,
                error: 'clave_hoy es requerido',
                example: {
                    clave_hoy: "0705934",
                    customName: "Mi WhatsApp Bot" // opcional
                },
                hint: "Obtenga la clave del día desde GET /api/lottery-info"
            });
        }
        
        // Validar clave del día
        console.log(`[API] 🔐 Validando clave_hoy para sesión ${sessionId}: ${clave_hoy}`);
        const keyValidation = await lotteryService.validateTodayKey(clave_hoy);
        
        if (!keyValidation.isValid) {
            return res.status(403).json({
                success: false,
                error: 'clave_hoy incorrecta',
                provided: keyValidation.providedKey,
                expected: keyValidation.expectedKey || 'Error obteniendo clave',
                sessionId: sessionId,
                validation: keyValidation
            });
        }
        
        // Verificar si la sesión ya existe
        const existingSession = getSession(sessionId);
        if (existingSession) {
            return res.status(409).json({
                success: false,
                error: 'La sesión ya existe',
                sessionId: sessionId,
                status: existingSession.status,
                createdAt: existingSession.createdAt
            });
        }
        
        // Crear nueva sesión
        console.log(`[API] 🔧 clave_hoy válida ✅ Creando sesión: ${sessionId}`);
        const newSession = await createSession(sessionId);
        
        console.log(`[API] ✅ Sesión ${sessionId} creada exitosamente con clave_hoy del día`);
        
        // Esperar a que se genere el código QR (máximo 30 segundos)
        let qrCode = null;
        let attempts = 0;
        const maxAttempts = 60; // 30 segundos (500ms * 60)
        
        console.log(`[API] ⏳ Esperando generación de QR para sesión ${sessionId}...`);
        
        while (!qrCode && attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 500)); // Esperar 500ms
            attempts++;
            
            const currentSession = getSession(sessionId);
            if (currentSession && currentSession.qrCode) {
                qrCode = currentSession.qrCode;
                console.log(`[API] 📱 QR generado para sesión ${sessionId} en ${attempts * 0.5}s`);
                break;
            }
        }
        
        // Preparar respuesta
        const response = {
            success: true,
            sessionId: sessionId,
            status: newSession.status,
            message: 'Sesión creada exitosamente',
            createdAt: newSession.createdAt,
            customName: customName || null,
            lottery: {
                clave_hoy_used: keyValidation.providedKey,
                lot_unatecla: keyValidation.expectedKey,
                lotteryDate: keyValidation.lotteryData.fecha
            },
            next_steps: {
                check_status: `GET /api/status/${sessionId}`,
                delete_session: `DELETE /api/session/${sessionId}`
            }
        };
        
        // Incluir QR si se generó
        if (qrCode) {
            response.qrCode = qrCode;
            response.qr_status = 'generated';
            response.generated_in = `${attempts * 0.5}s`;
            response.message += ' - QR código generado';
        } else {
            response.qr_status = 'timeout';
            response.message += ' - QR código no generado (timeout)';
            response.next_steps.get_qr = `GET /api/qr/${sessionId}`;
            response.retry_qr_after = 3;
        }
        
        res.status(201).json(response);
        
    } catch (error) {
        console.error(`[API] ❌ Error creando sesión ${req.params.sessionId}:`, error);
        res.status(500).json({
            success: false,
            error: 'Error interno del servidor: ' + error.message
        });
    }
});

// Obtener token QR - PÚBLICA (no requiere autenticación)
router.get('/qr/:sessionId', async (req, res) => {
    const { sessionId } = req.params;
    const { wait } = req.query; // ?wait=true para esperar hasta 30 segundos
    
    try {
        // Si la sesión no existe, la creamos automáticamente
        let session = getSession(sessionId);
        
        if (!session) {
            session = await createSession(sessionId);
            
            // Si no se solicita esperar, devolver inmediatamente
            if (!wait) {
                return res.json({
                    success: false,
                    sessionId: sessionId,
                    status: 'initializing',
                    message: 'Sesión creada. Generando QR...',
                    retry_after: 3
                });
            }
        }

        // Si se solicita esperar y no hay QR aún, esperar hasta 30 segundos
        if (wait === 'true' && !session.qrCode && session.status === 'initializing') {
            let attempts = 0;
            const maxAttempts = 60; // 30 segundos (500ms * 60)
            
            const checkQR = () => {
                return new Promise((resolve) => {
                    const interval = setInterval(() => {
                        attempts++;
                        const currentSession = getSession(sessionId);
                        
                        if (currentSession && currentSession.qrCode) {
                            clearInterval(interval);
                            resolve({
                                success: true,
                                sessionId: sessionId,
                                qrCode: currentSession.qrCode,
                                status: currentSession.status,
                                generated_in: `${attempts * 0.5}s`
                            });
                        } else if (attempts >= maxAttempts) {
                            clearInterval(interval);
                            resolve({
                                success: false,
                                sessionId: sessionId,
                                status: currentSession ? currentSession.status : 'unknown',
                                message: 'Timeout esperando QR. Intenta nuevamente.',
                                retry_after: 5
                            });
                        }
                    }, 500); // Verificar cada 500ms
                });
            };
            
            return checkQR().then(result => res.json(result));
        }
        
        // Respuesta inmediata
        if (!session.qrCode && (session.status === 'initializing' || session.status === 'waiting_qr')) {
            return res.json({
                success: false,
                sessionId: sessionId,
                status: session.status,
                message: 'Generando QR... Intenta en unos segundos',
                retry_after: 3
            });
        }

        if (!session.qrCode) {
            return res.json({
                success: false,
                sessionId: sessionId,
                status: session.status,
                message: `QR no disponible. Estado: ${session.status}`,
                retry_after: session.status === 'connected' ? null : 5
            });
        }

        res.json({
            success: true,
            sessionId: sessionId,
            qrCode: session.qrCode,
            status: session.status
        });

    } catch (error) {
        console.error(`[API] ❌ Error obteniendo QR para sesión ${sessionId}:`, error);
        res.status(500).json({
            success: false,
            error: 'Error creando sesión: ' + error.message
        });
    }
});

// Estado de sesión - PÚBLICA
router.get('/status/:sessionId', (req, res) => {
    try {
        const { sessionId } = req.params;
        
        const session = getSession(sessionId);
        
        if (!session) {
            return res.status(404).json({
                success: false,
                message: 'Sesión no encontrada'
            });
        }

        res.json({
            success: true,
            sessionId: sessionId,
            status: session.status,
            createdAt: session.createdAt,
            lastActivity: session.lastActivity,
            messageCount: session.messages ? session.messages.length : 0,
            hasQR: !!session.qrCode
        });

    } catch (error) {
        console.error(`[API] ❌ Error obteniendo estado de sesión ${req.params.sessionId}:`, error);
        res.status(500).json({
            success: false,
            error: 'Error obteniendo estado de sesión: ' + error.message
        });
    }
});

// Borrar sesión - PÚBLICA
router.delete('/session/:sessionId', async (req, res) => {
    const { sessionId } = req.params;
    
    try {
        await destroySession(sessionId);
        console.log(`[API] ✅ Sesión ${sessionId} eliminada exitosamente`);
        
        res.json({
            success: true,
            message: `Sesión ${sessionId} eliminada exitosamente`,
            sessionId: sessionId
        });

    } catch (error) {
        console.error(`[API] ❌ Error eliminando sesión ${sessionId}:`, error);
        
        if (error.message.includes('no encontrada')) {
            return res.status(404).json({
                success: false,
                error: 'Sesión no encontrada',
                sessionId: sessionId
            });
        } else {
            return res.status(500).json({
                success: false,
                error: 'Error eliminando sesión: ' + error.message,
                sessionId: sessionId
            });
        }
    }
});

module.exports = router;
// routes/api.js
// Rutas públicas de la API (no requieren autenticación)

const express = require('express');
const router = express.Router();
const { createSession, getSession, destroySession, cleanOrphanedSessionFolders } = require('../services/whatsapp');
const { getSessionsStats, recoverAllSessions, recoverSession, cleanInvalidSessions } = require('../services/sessionRecovery');

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

// Función auxiliar para validar formato de sessionId de cliente
function validateClientSessionId(sessionId) {
    // Validar formato básico
    if (!sessionId || typeof sessionId !== 'string' || sessionId.trim().length === 0) {
        return {
            isValid: false,
            error: 'sessionId debe ser una cadena válida no vacía'
        };
    }
    
    // Validar longitud mínima y caracteres permitidos
    const cleanSessionId = sessionId.trim();
    if (cleanSessionId.length < 3) {
        return {
            isValid: false,
            error: 'sessionId debe tener al menos 3 caracteres'
        };
    }
    
    // Permitir letras, números, guiones y guiones bajos
    const validPattern = /^[a-zA-Z0-9_-]+$/;
    if (!validPattern.test(cleanSessionId)) {
        return {
            isValid: false,
            error: 'sessionId solo debe contener letras, números, guiones (-) y guiones bajos (_)'
        };
    }
    
    return {
        isValid: true,
        cleanSessionId: cleanSessionId
    };
}
async function getDynamicExample(includeSessionId = true) {
    let currentKey = 'XXXXXXX';
    let currentDate = new Date().toISOString().split('T')[0];
    
    try {
        if (lotteryService) {
            const cacheInfo = await lotteryService.getCacheInfo(true);
            if (cacheInfo.exists && cacheInfo.data) {
                currentKey = cacheInfo.data.lot_unatecla;
            }
        }
    } catch (error) {
        console.warn('[API] ⚠️  No se pudo obtener clave actual para ejemplo');
    }
    
    const example = {
        clave_hoy: currentKey
    };
    
    if (includeSessionId) {
        // SessionId es un identificador fijo del cliente, no temporal
        example.sessionId = "cliente_12345678"; // Ejemplo de ID fijo de cliente
    }
    
    return {
        example,
        currentDate,
        note: "La clave_hoy cambia diariamente. Use GET /api/lottery-info para obtener la clave actual",
        sessionId_note: "El sessionId debe ser un identificador único y fijo de su cliente (ej: nati_20256776)"
    };
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

const memoryOptimizer = require('../services/memoryOptimization');

// CREAR SESIÓN CON VALIDACIÓN DE CLAVE DEL DÍA - ÚNICA RUTA POST /session
router.post('/session', 
    checkLotteryService,
    async (req, res) => {
    try {
        const { sessionId, clave_hoy, customName } = req.body;
        
        // Validar campos requeridos
        if (!sessionId || !clave_hoy) {
            // Obtener la clave actual para el ejemplo
            let currentKey = 'XXXXXXX';
            try {
                const cacheInfo = await lotteryService.getCacheInfo(true);
                if (cacheInfo.exists && cacheInfo.data) {
                    currentKey = cacheInfo.data.lot_unatecla;
                }
            } catch (error) {
                console.warn('[API] ⚠️  No se pudo obtener clave actual para ejemplo');
            }
            
            return res.status(400).json({
                success: false,
                error: 'sessionId y clave_hoy son requeridos',
                example: {
                    sessionId: "nati_20256776", // Ejemplo de ID real de cliente
                    clave_hoy: currentKey,
                    customName: "WhatsApp Bot de Nati" // opcional
                },
                hint: "Obtenga la clave actual del día desde GET /api/lottery-info",
                current_date: new Date().toISOString().split('T')[0],
                notes: {
                    sessionId: "Use un identificador único y fijo para cada cliente (ej: nati_20256776, juan_87654321)",
                    clave_hoy: "Esta clave cambia diariamente y debe obtenerse desde /api/lottery-info"
                }
            });
        }
        
        // Validar formato de sessionId
        const sessionValidation = validateClientSessionId(sessionId);
        if (!sessionValidation.isValid) {
            return res.status(400).json({
                success: false,
                error: sessionValidation.error,
                provided: sessionId,
                examples: {
                    valid: ["nati_20256776", "juan_87654321", "cliente123", "bot-maria"],
                    invalid: ["", "ab", "cliente@123", "sesión con espacios"]
                }
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
                message: 'Use GET /api/lottery-info para obtener la clave correcta del día de hoy',
                validation: keyValidation,
                current_date: new Date().toISOString().split('T')[0],
                help: {
                    step1: "GET /api/lottery-info - para obtener la clave actual",
                    step2: "POST /api/session - usar la clave obtenida en el paso 1"
                }
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

router.get('/memory-stats', (req, res) => {
    try {
        const stats = memoryOptimizer.getDetailedStats();
        
        res.json({
            success: true,
            message: 'Estadísticas de memoria del servidor',
            stats: stats,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('[API] ❌ Error obteniendo estadísticas de memoria:', error);
        res.status(500).json({
            success: false,
            error: 'Error obteniendo estadísticas: ' + error.message
        });
    }
});

// Configurar límites de memoria - PÚBLICA
router.post('/memory-limits', (req, res) => {
    try {
        const { 
            maxMessagesPerSession, 
            maxTotalSessions, 
            memoryWarningMB, 
            memoryCriticalMB,
            sessionTimeoutHours 
        } = req.body;
        
        // Actualizar límites si se proporcionan
        if (maxMessagesPerSession) memoryOptimizer.MEMORY_LIMITS.MAX_MESSAGES_PER_SESSION = maxMessagesPerSession;
        if (maxTotalSessions) memoryOptimizer.MEMORY_LIMITS.MAX_TOTAL_SESSIONS = maxTotalSessions;
        if (memoryWarningMB) memoryOptimizer.MEMORY_LIMITS.MEMORY_WARNING_MB = memoryWarningMB;
        if (memoryCriticalMB) memoryOptimizer.MEMORY_LIMITS.MEMORY_CRITICAL_MB = memoryCriticalMB;
        if (sessionTimeoutHours) memoryOptimizer.MEMORY_LIMITS.SESSION_TIMEOUT_HOURS = sessionTimeoutHours;
        
        console.log('[API] ⚙️  Límites de memoria actualizados');
        
        res.json({
            success: true,
            message: 'Límites de memoria actualizados',
            currentLimits: memoryOptimizer.MEMORY_LIMITS,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('[API] ❌ Error configurando límites:', error);
        res.status(500).json({
            success: false,
            error: 'Error configurando límites: ' + error.message
        });
    }
});

// Forzar limpieza de memoria - PÚBLICA
router.post('/memory-cleanup', async (req, res) => {
    try {
        console.log('[API] 🧹 Limpieza manual de memoria solicitada...');
        
        const result = await memoryOptimizer.checkMemoryLimits();
        
        res.json({
            success: true,
            message: 'Limpieza de memoria completada',
            before: result.memory,
            actionsPerformed: result.actionsPerformed,
            status: result.status,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('[API] ❌ Error en limpieza manual:', error);
        res.status(500).json({
            success: false,
            error: 'Error en limpieza: ' + error.message
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
                error: 'sessionId en la URL debe ser válido',
                example_url: '/api/session/nati_20256776/groups',
                note: 'Use un identificador único y fijo para cada cliente'
            });
        }
        
        // Validar clave requerida
        if (!clave_hoy) {
            const dynamicExample = await getDynamicExample(false);
            
            return res.status(400).json({
                success: false,
                error: 'clave_hoy es requerido',
                ...dynamicExample,
                hint: "Obtenga la clave actual del día desde GET /api/lottery-info"
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
        // Verificar si la sesión existe antes de eliminar
        const session = getSession(sessionId);
        const sessionExists = !!session;
        const sessionStatus = session ? session.status : 'not_found';
        
        await destroySession(sessionId);
        console.log(`[API] ✅ Sesión ${sessionId} eliminada exitosamente (incluye carpeta)`);
        
        res.json({
            success: true,
            message: `Sesión ${sessionId} eliminada completamente`,
            sessionId: sessionId,
            details: {
                session_closed: sessionExists,
                folder_deleted: true,
                previous_status: sessionStatus
            },
            note: 'Se eliminó la sesión de memoria y su carpeta de datos del disco',
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error(`[API] ❌ Error eliminando sesión ${sessionId}:`, error);
        
        if (error.message.includes('no encontrada')) {
            return res.status(404).json({
                success: false,
                error: 'Sesión no encontrada',
                sessionId: sessionId,
                note: 'Use POST /api/clean-orphaned-folders para limpiar carpetas huérfanas'
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

router.post('/close-inactive-sessions', async (req, res) => {
    try {
        console.log('[API] ⏰ Cerrando sesiones inactivas...');
        
        const closedCount = await memoryOptimizer.closeInactiveSessions();
        const memoryAfter = memoryOptimizer.getMemoryUsage();
        
        res.json({
            success: true,
            message: 'Sesiones inactivas cerradas',
            closedSessions: closedCount,
            currentMemory: `${memoryAfter.rss}MB`,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('[API] ❌ Error cerrando sesiones inactivas:', error);
        res.status(500).json({
            success: false,
            error: 'Error cerrando sesiones: ' + error.message
        });
    }
});

// Estadísticas de sesiones - PÚBLICA
router.get('/sessions-stats', (req, res) => {
    try {
        const stats = getSessionsStats();
        
        res.json({
            success: true,
            message: 'Estadísticas de sesiones',
            stats: stats,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('[API] ❌ Error obteniendo estadísticas de sesiones:', error);
        res.status(500).json({
            success: false,
            error: 'Error obteniendo estadísticas: ' + error.message
        });
    }
});

// Recuperar todas las sesiones manualmente - PÚBLICA
router.post('/recover-sessions', async (req, res) => {
    try {
        console.log('[API] 🔄 Solicitud manual de recuperación de sesiones...');
        const results = await recoverAllSessions();
        
        res.json({
            success: true,
            message: 'Proceso de recuperación completado',
            results: results,
            summary: `${results.recovered}/${results.total} sesiones recuperadas`,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('[API] ❌ Error en recuperación manual:', error);
        res.status(500).json({
            success: false,
            error: 'Error en recuperación: ' + error.message
        });
    }
});

// Recuperar una sesión específica - PÚBLICA
router.post('/recover-session/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        
        console.log(`[API] 🔄 Solicitud de recuperación de sesión específica: ${sessionId}`);
        const result = await recoverSession(sessionId);
        
        if (result.success) {
            res.json({
                success: true,
                message: `Sesión ${sessionId} recuperada exitosamente`,
                session: {
                    sessionId: result.session.sessionId,
                    status: result.session.status,
                    createdAt: result.session.createdAt
                },
                timestamp: new Date().toISOString()
            });
        } else {
            res.status(400).json({
                success: false,
                error: `No se pudo recuperar la sesión ${sessionId}`,
                reason: result.reason,
                details: result.error
            });
        }
        
    } catch (error) {
        console.error(`[API] ❌ Error recuperando sesión ${req.params.sessionId}:`, error);
        res.status(500).json({
            success: false,
            error: 'Error en recuperación: ' + error.message
        });
    }
});

// Obtener grupos de una sesión - PÚBLICA (con validación de clave)
router.post('/session/:sessionId/groups', checkLotteryService, async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { clave_hoy } = req.body;
        
        // Validar sessionId del parámetro
        if (!sessionId || typeof sessionId !== 'string' || sessionId.trim().length === 0) {
            return res.status(400).json({
                success: false,
                error: 'sessionId en la URL debe ser válido'
            });
        }
        
        // Validar clave requerida
        if (!clave_hoy) {
            const dynamicExample = await getDynamicExample(false);
            
            return res.status(400).json({
                success: false,
                error: 'clave_hoy es requerido',
                ...dynamicExample,
                hint: "Use POST /api/session/:sessionId/groups para obtener los IDs de grupos"
            });
        }
        
        // Validar clave del día
        console.log(`[API] 🔐 Validando clave_hoy para obtener grupos de ${sessionId}: ${clave_hoy}`);
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
        
        // Verificar si la sesión existe
        const session = getSession(sessionId);
        if (!session) {
            return res.status(404).json({
                success: false,
                error: 'Sesión no encontrada',
                sessionId: sessionId,
                message: 'Use POST /api/session para crear una sesión primero'
            });
        }
        
        // Verificar si la sesión está conectada
        if (session.status !== 'connected') {
            return res.status(400).json({
                success: false,
                error: 'Sesión no está conectada',
                sessionId: sessionId,
                currentStatus: session.status,
                message: 'La sesión debe estar conectada para obtener grupos'
            });
        }
        
        console.log(`[API] 📱 Obteniendo grupos de la sesión ${sessionId}...`);
        
        // Obtener todos los chats de la sesión
        const chats = await session.client.getChats();
        
        // Filtrar solo los grupos
        const groups = chats.filter(chat => chat.isGroup);
        
        // Formatear información de los grupos
        const groupsInfo = await Promise.all(groups.map(async (group) => {
            try {
                // Obtener participantes del grupo
                const participants = await group.participants;
                
                return {
                    id: group.id._serialized,
                    name: group.name,
                    description: group.description || '',
                    participantCount: participants ? participants.length : 0,
                    isAdmin: group.participants ? group.participants.some(p => 
                        p.id._serialized === session.client.info.wid._serialized && p.isAdmin
                    ) : false,
                    createdAt: group.createdAt ? new Date(group.createdAt * 1000).toISOString() : null,
                    lastMessage: group.lastMessage ? {
                        timestamp: new Date(group.lastMessage.timestamp * 1000).toISOString(),
                        body: group.lastMessage.body || '',
                        from: group.lastMessage.from
                    } : null,
                    unreadCount: group.unreadCount || 0,
                    archived: group.archived || false,
                    pinned: group.pinned || false
                };
            } catch (error) {
                console.error(`[API] ⚠️  Error obteniendo detalles del grupo ${group.name}:`, error.message);
                return {
                    id: group.id._serialized,
                    name: group.name,
                    description: group.description || '',
                    participantCount: 0,
                    isAdmin: false,
                    error: 'Error obteniendo detalles'
                };
            }
        }));
        
        console.log(`[API] ✅ Obtenidos ${groupsInfo.length} grupos de la sesión ${sessionId}`);
        
        res.json({
            success: true,
            sessionId: sessionId,
            message: `Grupos obtenidos exitosamente de la sesión ${sessionId}`,
            totalGroups: groupsInfo.length,
            groups: groupsInfo,
            sessionInfo: {
                status: session.status,
                lastActivity: session.lastActivity
            },
            lottery: {
                clave_hoy_used: keyValidation.providedKey,
                lot_unatecla: keyValidation.expectedKey
            },
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error(`[API] ❌ Error obteniendo grupos de sesión ${req.params.sessionId}:`, error);
        res.status(500).json({
            success: false,
            error: 'Error obteniendo grupos: ' + error.message,
            sessionId: req.params.sessionId
        });
    }
});

// Ruta alternativa para obtener grupos (con sessionId en el body)
router.post('/groups', checkLotteryService, async (req, res) => {
    try {
        const { sessionId, clave_hoy } = req.body;
        
        // Validar campos requeridos
        if (!sessionId || !clave_hoy) {
            const dynamicExample = await getDynamicExample(true);
            
            return res.status(400).json({
                success: false,
                error: 'sessionId y clave_hoy son requeridos',
                ...dynamicExample,
                hint: "Use POST /api/groups para obtener los IDs de grupos disponibles"
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
        console.log(`[API] 🔐 Validando clave_hoy para obtener grupos de ${sessionId}: ${clave_hoy}`);
        const keyValidation = await lotteryService.validateTodayKey(clave_hoy);
        
        if (!keyValidation.isValid) {
            return res.status(403).json({
                success: false,
                error: 'clave_hoy incorrecta',
                provided: keyValidation.providedKey,
                expected: keyValidation.expectedKey || 'Error obteniendo clave',
                validation: keyValidation
            });
        }
        
        // Verificar si la sesión existe
        const session = getSession(sessionId);
        if (!session) {
            return res.status(404).json({
                success: false,
                error: 'Sesión no encontrada',
                sessionId: sessionId,
                message: 'Use POST /api/session para crear una sesión primero'
            });
        }
        
        // Verificar si la sesión está conectada
        if (session.status !== 'connected') {
            return res.status(400).json({
                success: false,
                error: 'Sesión no está conectada',
                sessionId: sessionId,
                currentStatus: session.status,
                message: 'La sesión debe estar conectada para obtener grupos'
            });
        }
        
        console.log(`[API] 📱 Obteniendo grupos de la sesión ${sessionId}...`);
        
        // Obtener todos los chats de la sesión
        const chats = await session.client.getChats();
        
        // Filtrar solo los grupos
        const groups = chats.filter(chat => chat.isGroup);
        
        // Formatear información de los grupos
        const groupsInfo = await Promise.all(groups.map(async (group) => {
            try {
                // Obtener participantes del grupo
                const participants = await group.participants;
                
                return {
                    id: group.id._serialized,
                    name: group.name,
                    description: group.description || '',
                    participantCount: participants ? participants.length : 0,
                    isAdmin: group.participants ? group.participants.some(p => 
                        p.id._serialized === session.client.info.wid._serialized && p.isAdmin
                    ) : false,
                    createdAt: group.createdAt ? new Date(group.createdAt * 1000).toISOString() : null,
                    lastMessage: group.lastMessage ? {
                        timestamp: new Date(group.lastMessage.timestamp * 1000).toISOString(),
                        body: group.lastMessage.body || '',
                        from: group.lastMessage.from
                    } : null,
                    unreadCount: group.unreadCount || 0,
                    archived: group.archived || false,
                    pinned: group.pinned || false
                };
            } catch (error) {
                console.error(`[API] ⚠️  Error obteniendo detalles del grupo ${group.name}:`, error.message);
                return {
                    id: group.id._serialized,
                    name: group.name,
                    description: group.description || '',
                    participantCount: 0,
                    isAdmin: false,
                    error: 'Error obteniendo detalles'
                };
            }
        }));
        
        console.log(`[API] ✅ Obtenidos ${groupsInfo.length} grupos de la sesión ${sessionId}`);
        
        res.json({
            success: true,
            sessionId: sessionId,
            message: `Grupos obtenidos exitosamente de la sesión ${sessionId}`,
            totalGroups: groupsInfo.length,
            groups: groupsInfo,
            sessionInfo: {
                status: session.status,
                lastActivity: session.lastActivity
            },
            lottery: {
                clave_hoy_used: keyValidation.providedKey,
                lot_unatecla: keyValidation.expectedKey
            },
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('[API] ❌ Error obteniendo grupos:', error);
        res.status(500).json({
            success: false,
            error: 'Error obteniendo grupos: ' + error.message
        });
    }
});

// Enviar mensaje a un grupo específico - PÚBLICA (con validación de clave)
router.post('/session/:sessionId/send-group-message', checkLotteryService, async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { clave_hoy, groupId, message } = req.body;
        
        // Validar sessionId del parámetro
        if (!sessionId || typeof sessionId !== 'string' || sessionId.trim().length === 0) {
            return res.status(400).json({
                success: false,
                error: 'sessionId en la URL debe ser válido'
            });
        }
        
        // Validar campos requeridos
        if (!clave_hoy || !groupId || !message) {
            const dynamicExample = await getDynamicExample(false);
            dynamicExample.example.groupId = "120363025463049711@g.us";
            dynamicExample.example.message = "¡Hola grupo! 👋";
            
            return res.status(400).json({
                success: false,
                error: 'clave_hoy, groupId y message son requeridos',
                ...dynamicExample,
                hint: "Use POST /api/session/:sessionId/groups para obtener los IDs de grupos"
            });
        }
        
        // Validar formato del mensaje
        if (typeof message !== 'string' || message.trim().length === 0) {
            return res.status(400).json({
                success: false,
                error: 'El mensaje debe ser una cadena válida no vacía'
            });
        }
        
        // Validar clave del día
        console.log(`[API] 🔐 Validando clave_hoy para enviar mensaje al grupo desde ${sessionId}: ${clave_hoy}`);
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
        
        // Verificar si la sesión existe
        const session = getSession(sessionId);
        if (!session) {
            return res.status(404).json({
                success: false,
                error: 'Sesión no encontrada',
                sessionId: sessionId,
                message: 'Use POST /api/session para crear una sesión primero'
            });
        }
        
        // Verificar si la sesión está conectada
        if (session.status !== 'connected') {
            return res.status(400).json({
                success: false,
                error: 'Sesión no está conectada',
                sessionId: sessionId,
                currentStatus: session.status,
                message: 'La sesión debe estar conectada para enviar mensajes'
            });
        }
        
        console.log(`[API] 📱 Enviando mensaje al grupo ${groupId} desde sesión ${sessionId}...`);
        
        // Verificar que el grupo existe y es accesible
        try {
            const chat = await session.client.getChatById(groupId);
            
            if (!chat.isGroup) {
                return res.status(400).json({
                    success: false,
                    error: 'El ID proporcionado no corresponde a un grupo',
                    groupId: groupId,
                    chatType: 'individual'
                });
            }
            
            // Enviar el mensaje al grupo
            await session.client.sendMessage(groupId, message);
            
            console.log(`[API] ✅ Mensaje enviado exitosamente al grupo ${chat.name} (${groupId})`);
            
            // Registrar el mensaje enviado en la sesión
            if (!session.messages) session.messages = [];
            session.messages.push({
                to: groupId,
                toName: chat.name,
                body: message,
                timestamp: new Date(),
                type: 'sent',
                messageType: 'group',
                groupInfo: {
                    name: chat.name,
                    participantCount: chat.participants ? chat.participants.length : 0
                }
            });
            session.lastActivity = new Date();
            
            res.json({
                success: true,
                sessionId: sessionId,
                message: 'Mensaje enviado exitosamente al grupo',
                sentMessage: {
                    groupId: groupId,
                    groupName: chat.name,
                    message: message,
                    timestamp: new Date().toISOString(),
                    participantCount: chat.participants ? chat.participants.length : 0
                },
                sessionInfo: {
                    status: session.status,
                    lastActivity: session.lastActivity,
                    totalMessages: session.messages.length
                },
                lottery: {
                    clave_hoy_used: keyValidation.providedKey,
                    lot_unatecla: keyValidation.expectedKey
                }
            });
            
        } catch (error) {
            if (error.message.includes('Chat not found')) {
                return res.status(404).json({
                    success: false,
                    error: 'Grupo no encontrado',
                    groupId: groupId,
                    message: 'Verifique que el ID del grupo sea correcto y que tenga acceso a él'
                });
            } else {
                throw error; // Re-lanzar otros errores
            }
        }
        
    } catch (error) {
        console.error(`[API] ❌ Error enviando mensaje al grupo desde sesión ${req.params.sessionId}:`, error);
        res.status(500).json({
            success: false,
            error: 'Error enviando mensaje al grupo: ' + error.message,
            sessionId: req.params.sessionId
        });
    }
});

// Ruta alternativa para enviar mensaje a grupo (con sessionId en el body)
router.post('/send-group-message', checkLotteryService, async (req, res) => {
    try {
        const { sessionId, clave_hoy, groupId, message } = req.body;
        
        // Validar campos requeridos
        if (!sessionId || !clave_hoy || !groupId || !message) {
            const dynamicExample = await getDynamicExample(true);
            dynamicExample.example.groupId = "120363025463049711@g.us";
            dynamicExample.example.message = "¡Hola grupo! 👋";
            
            return res.status(400).json({
                success: false,
                error: 'sessionId, clave_hoy, groupId y message son requeridos',
                ...dynamicExample,
                hint: "Use POST /api/groups para obtener los IDs de grupos disponibles"
            });
        }
        
        // Validar formatos
        if (typeof sessionId !== 'string' || sessionId.trim().length === 0) {
            return res.status(400).json({
                success: false,
                error: 'sessionId debe ser una cadena válida no vacía'
            });
        }
        
        if (typeof message !== 'string' || message.trim().length === 0) {
            return res.status(400).json({
                success: false,
                error: 'El mensaje debe ser una cadena válida no vacía'
            });
        }
        
        // Validar clave del día
        console.log(`[API] 🔐 Validando clave_hoy para enviar mensaje al grupo desde ${sessionId}: ${clave_hoy}`);
        const keyValidation = await lotteryService.validateTodayKey(clave_hoy);
        
        if (!keyValidation.isValid) {
            return res.status(403).json({
                success: false,
                error: 'clave_hoy incorrecta',
                provided: keyValidation.providedKey,
                expected: keyValidation.expectedKey || 'Error obteniendo clave',
                validation: keyValidation
            });
        }
        
        // Verificar si la sesión existe
        const session = getSession(sessionId);
        if (!session) {
            return res.status(404).json({
                success: false,
                error: 'Sesión no encontrada',
                sessionId: sessionId,
                message: 'Use POST /api/session para crear una sesión primero'
            });
        }
        
        // Verificar si la sesión está conectada
        if (session.status !== 'connected') {
            return res.status(400).json({
                success: false,
                error: 'Sesión no está conectada',
                sessionId: sessionId,
                currentStatus: session.status,
                message: 'La sesión debe estar conectada para enviar mensajes'
            });
        }
        
        console.log(`[API] 📱 Enviando mensaje al grupo ${groupId} desde sesión ${sessionId}...`);
        
        // Verificar que el grupo existe y es accesible
        try {
            const chat = await session.client.getChatById(groupId);
            
            if (!chat.isGroup) {
                return res.status(400).json({
                    success: false,
                    error: 'El ID proporcionado no corresponde a un grupo',
                    groupId: groupId,
                    chatType: 'individual'
                });
            }
            
            // Enviar el mensaje al grupo
            await session.client.sendMessage(groupId, message);
            
            console.log(`[API] ✅ Mensaje enviado exitosamente al grupo ${chat.name} (${groupId})`);
            
            // Registrar el mensaje enviado en la sesión
            if (!session.messages) session.messages = [];
            session.messages.push({
                to: groupId,
                toName: chat.name,
                body: message,
                timestamp: new Date(),
                type: 'sent',
                messageType: 'group',
                groupInfo: {
                    name: chat.name,
                    participantCount: chat.participants ? chat.participants.length : 0
                }
            });
            session.lastActivity = new Date();
            
            res.json({
                success: true,
                sessionId: sessionId,
                message: 'Mensaje enviado exitosamente al grupo',
                sentMessage: {
                    groupId: groupId,
                    groupName: chat.name,
                    message: message,
                    timestamp: new Date().toISOString(),
                    participantCount: chat.participants ? chat.participants.length : 0
                },
                sessionInfo: {
                    status: session.status,
                    lastActivity: session.lastActivity,
                    totalMessages: session.messages.length
                },
                lottery: {
                    clave_hoy_used: keyValidation.providedKey,
                    lot_unatecla: keyValidation.expectedKey
                }
            });
            
        } catch (error) {
            if (error.message.includes('Chat not found')) {
                return res.status(404).json({
                    success: false,
                    error: 'Grupo no encontrado',
                    groupId: groupId,
                    message: 'Verifique que el ID del grupo sea correcto y que tenga acceso a él'
                });
            } else {
                throw error; // Re-lanzar otros errores
            }
        }
        
    } catch (error) {
        console.error('[API] ❌ Error enviando mensaje al grupo:', error);
        res.status(500).json({
            success: false,
            error: 'Error enviando mensaje al grupo: ' + error.message
        });
    }
});

// Limpiar sesiones inválidas - PÚBLICA
router.post('/clean-invalid-sessions', (req, res) => {
    try {
        console.log('[API] 🧹 Solicitud de limpieza de sesiones inválidas...');
        const cleaned = cleanInvalidSessions();
        
        res.json({
            success: true,
            message: 'Limpieza de sesiones completada',
            cleaned: cleaned,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('[API] ❌ Error limpiando sesiones:', error);
        res.status(500).json({
            success: false,
            error: 'Error en limpieza: ' + error.message
        });
    }
});

// Limpiar carpetas huérfanas de sesiones - PÚBLICA
router.post('/clean-orphaned-folders', (req, res) => {
    try {
        console.log('[API] 🧹 Solicitud de limpieza de carpetas huérfanas...');
        const cleaned = cleanOrphanedSessionFolders();
        
        res.json({
            success: true,
            message: 'Limpieza de carpetas huérfanas completada',
            cleaned: cleaned,
            note: 'Se eliminaron carpetas de sesiones que no tienen una sesión activa',
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('[API] ❌ Error limpiando carpetas huérfanas:', error);
        res.status(500).json({
            success: false,
            error: 'Error en limpieza de carpetas: ' + error.message
        });
    }
});

// Información de ayuda sobre manejo de clientes y sessionIDs - PÚBLICA
router.get('/client-help', async (req, res) => {
    try {
        // Obtener clave actual
        let currentKey = 'XXXXXXX';
        let cacheStatus = 'not_available';
        
        try {
            const cacheInfo = await lotteryService.getCacheInfo(true);
            if (cacheInfo.exists && cacheInfo.data) {
                currentKey = cacheInfo.data.lot_unatecla;
                cacheStatus = 'available';
            }
        } catch (error) {
            console.warn('[API] ⚠️  No se pudo obtener clave actual');
        }
        
        res.json({
            success: true,
            message: 'Guía para manejo de clientes en la API',
            current_date: new Date().toISOString().split('T')[0],
            current_key: {
                clave_hoy: currentKey,
                status: cacheStatus,
                source: 'GET /api/lottery-info'
            },
            client_management: {
                sessionId_concept: "El sessionId es un identificador único y fijo para cada cliente",
                sessionId_examples: [
                    "nati_20256776",
                    "juan_87654321", 
                    "maria_11223344",
                    "cliente_premium_001"
                ],
                sessionId_rules: [
                    "Debe ser único para cada cliente",
                    "Se mantiene fijo para el mismo cliente",
                    "Solo letras, números, guiones (-) y guiones bajos (_)",
                    "Mínimo 3 caracteres"
                ]
            },
            workflow: {
                step1: {
                    action: "GET /api/lottery-info",
                    purpose: "Obtener la clave_hoy actual",
                    response: `{"todayKey": "${currentKey}"}`
                },
                step2: {
                    action: "POST /api/session",
                    purpose: "Crear sesión para cliente específico",
                    body: {
                        sessionId: "nati_20256776",
                        clave_hoy: currentKey,
                        customName: "WhatsApp Bot de Nati"
                    }
                },
                step3: {
                    action: "GET /api/qr/:sessionId ó usar qrCode de step2",
                    purpose: "Obtener QR para que cliente escanee",
                    note: "El QR se incluye automáticamente en step2"
                },
                step4: {
                    action: "POST /api/session/:sessionId/groups",
                    purpose: "Obtener grupos del cliente",
                    body: {
                        clave_hoy: currentKey
                    }
                },
                step5: {
                    action: "POST /api/session/:sessionId/send-group-message",
                    purpose: "Enviar mensajes a grupos",
                    body: {
                        clave_hoy: currentKey,
                        groupId: "120363025463049711@g.us",
                        message: "¡Hola grupo!"
                    }
                }
            },
            data_persistence: {
                sessions: "Las sesiones se guardan en ./sessions/[sessionId]",
                recovery: "Al reiniciar el servidor, las sesiones se recuperan automáticamente",
                client_data: "Puedes relacionar sessionId con tus datos de cliente en tu aplicación"
            },
            examples: {
                multiple_clients: {
                    nati: {
                        sessionId: "nati_20256776",
                        your_app_data: {
                            name: "Natalia",
                            phone: "+57300123456",
                            plan: "premium",
                            groups_allowed: 10
                        }
                    },
                    juan: {
                        sessionId: "juan_87654321",
                        your_app_data: {
                            name: "Juan Carlos",
                            phone: "+57311987654",
                            plan: "basic",
                            groups_allowed: 5
                        }
                    }
                }
            }
        });
        
    } catch (error) {
        console.error('[API] ❌ Error generando ayuda de clientes:', error);
        res.status(500).json({
            success: false,
            error: 'Error generando información de ayuda: ' + error.message
        });
    }
});

module.exports = router;
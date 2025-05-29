// routes/api.js
// Rutas públicas de la API (no requieren autenticación)

const express = require('express');
const router = express.Router();
const { createSession, getSession, destroySession } = require('../services/whatsapp');

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
                        
                        if (currentSession.qrCode) {
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
                                status: currentSession.status,
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
        console.error(`Error obteniendo QR para sesión ${sessionId}:`, error);
        res.status(500).json({
            success: false,
            error: 'Error creando sesión: ' + error.message
        });
    }
});

// Estado de sesión - PÚBLICA
router.get('/status/:sessionId', (req, res) => {
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
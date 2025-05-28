// routes/api.js
// Rutas públicas de la API (no requieren autenticación)

const express = require('express');
const router = express.Router();
//const { createSession, getSession } = require('../services/whatsapp');
const { createSession, getSession, destroySession } = require('../services/whatsapp');

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

module.exports = router;
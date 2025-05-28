// routes/dashboard.js
// Rutas protegidas del dashboard (requieren autenticación)

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { createSession, sendMessage, destroySession, getSession, getAllSessions } = require('../services/whatsapp');

// Aplicar middleware de autenticación a todas las rutas
router.use(requireAuth);

// Dashboard principal
router.get('/', (req, res) => {
    const sessions = getAllSessions();

    res.render('dashboard', { 
        token: req.session.token,
        sessions: sessions,
        totalSessions: sessions.length,
        query: req.query  // Para mostrar mensajes de éxito/error
    });
});

// Crear nueva sesión
router.post('/create-session', async (req, res) => {
    const { sessionId } = req.body;
    
    if (!sessionId) {
        return res.redirect('/dashboard?error=session_id_required');
    }

    try {
        await createSession(sessionId);
        console.log(`[DASHBOARD] ✅ Sesión ${sessionId} creada exitosamente`);
        res.redirect('/dashboard?success=session_created');

    } catch (error) {
        console.error(`[DASHBOARD] ❌ Error creando sesión ${sessionId}:`, error);
        res.redirect('/dashboard?error=creation_failed');
    }
});

// Ver detalles de una sesión
router.get('/session/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    
    const session = getSession(sessionId);
    
    if (!session) {
        return res.redirect('/dashboard?error=session_not_found');
    }
    
    res.render('session-detail', {
        session: session,
        messages: session.messages || [],
        query: req.query  // Para mostrar mensajes de éxito/error
    });
});

// Enviar mensaje desde dashboard
router.post('/session/:sessionId/send', async (req, res) => {
    const { sessionId } = req.params;
    const { number, message } = req.body;
    
    try {
        await sendMessage(sessionId, number, message);
        console.log(`[DASHBOARD] ✅ Mensaje enviado desde sesión ${sessionId}`);
        res.redirect(`/dashboard/session/${sessionId}?success=message_sent`);

    } catch (error) {
        console.error(`[DASHBOARD] ❌ Error enviando mensaje en sesión ${sessionId}:`, error);
        
        if (error.message.includes('no encontrada')) {
            return res.redirect(`/dashboard?error=session_not_found`);
        } else if (error.message.includes('no está conectada')) {
            return res.redirect(`/dashboard/session/${sessionId}?error=not_connected`);
        } else {
            return res.redirect(`/dashboard/session/${sessionId}?error=send_failed`);
        }
    }
});

// Eliminar sesión - Ruta DELETE para AJAX
router.delete('/session/:sessionId', async (req, res) => {
    const { sessionId } = req.params;
    
    try {
        await destroySession(sessionId);
        console.log(`[DASHBOARD] ✅ Sesión ${sessionId} eliminada exitosamente`);
        res.json({ 
            success: true, 
            message: `Sesión ${sessionId} eliminada exitosamente`,
            sessionId: sessionId
        });

    } catch (error) {
        console.error(`[DASHBOARD] ❌ Error eliminando sesión ${sessionId}:`, error);
        
        if (error.message.includes('no encontrada')) {
            return res.status(404).json({ 
                success: false,
                error: 'Sesión no encontrada',
                sessionId: sessionId 
            });
        } else {
            return res.status(500).json({ 
                success: false,
                error: error.message,
                sessionId: sessionId 
            });
        }
    }
});

// Eliminar sesión - Ruta GET para redirección (alternativa)
router.get('/session/:sessionId/delete', async (req, res) => {
    const { sessionId } = req.params;
    
    try {
        await destroySession(sessionId);
        console.log(`[DASHBOARD] ✅ Sesión ${sessionId} eliminada exitosamente`);
        res.redirect('/dashboard?success=session_deleted');

    } catch (error) {
        console.error(`[DASHBOARD] ❌ Error eliminando sesión ${sessionId}:`, error);
        
        if (error.message.includes('no encontrada')) {
            return res.redirect('/dashboard?error=session_not_found');
        } else {
            return res.redirect('/dashboard?error=delete_failed');
        }
    }
});

module.exports = router;
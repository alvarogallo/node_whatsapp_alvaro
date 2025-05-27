const express = require('express');
const session = require('express-session');
const { Client, LocalAuth } = require('whatsapp-web.js');
const fs = require('fs');
const app = express();

app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Sesión
app.use(session({
  secret: 'clave_secreta',
  resave: false,
  saveUninitialized: true
}));

// Almacenar las sesiones activas de WhatsApp
const activeSessions = new Map();

// Crear directorio de sesiones si no existe
if (!fs.existsSync('./sessions')) {
    fs.mkdirSync('./sessions', { recursive: true });
}

// Middleware para verificar autenticación
function requireAuth(req, res, next) {
    if (req.session.token) {
        next();
    } else {
        res.redirect('/');
    }
}

// Función para crear una nueva sesión de WhatsApp
function createWhatsAppSession(sessionId) {
    const client = new Client({
        authStrategy: new LocalAuth({
            clientId: sessionId,
            dataPath: `./sessions/${sessionId}`
        }),
        puppeteer: {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--no-first-run',
                '--single-process'
            ]
        }
    });

    // Configurar eventos de la sesión
    client.on('qr', (qr) => {
        console.log(`[${sessionId}] Nuevo QR generado`);
        
        const session = activeSessions.get(sessionId);
        if (session) {
            session.qrCode = qr;
            session.status = 'waiting_qr';
            session.lastActivity = new Date();
        }
    });

    client.on('ready', () => {
        console.log(`[${sessionId}] Cliente conectado exitosamente`);
        
        const session = activeSessions.get(sessionId);
        if (session) {
            session.status = 'connected';
            session.qrCode = null;
            session.lastActivity = new Date();
        }
    });

    client.on('authenticated', () => {
        console.log(`[${sessionId}] Autenticación exitosa`);
        
        const session = activeSessions.get(sessionId);
        if (session) {
            session.status = 'authenticated';
            session.lastActivity = new Date();
        }
    });

    client.on('auth_failure', (msg) => {
        console.error(`[${sessionId}] Error de autenticación:`, msg);
        
        const session = activeSessions.get(sessionId);
        if (session) {
            session.status = 'auth_failed';
            session.error = msg;
            session.lastActivity = new Date();
        }
    });

    client.on('message', async (message) => {
        console.log(`[${sessionId}] Mensaje recibido:`, message.body);
        
        const session = activeSessions.get(sessionId);
        if (session) {
            if (!session.messages) session.messages = [];
            session.messages.push({
                from: message.from,
                body: message.body,
                timestamp: new Date(),
                type: 'received'
            });
            session.lastActivity = new Date();
        }
    });

    return client;
}

// ========== RUTAS DE AUTENTICACIÓN ==========

// Ruta principal
app.get('/', (req, res) => {
    if (req.session.token) {
        res.render('home', { token: req.session.token });
    } else {
        res.render('login', { error: null });
    }
});

// Procesar login
app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    console.log("Intentando login con:", email, password);
      
    try {
        if (email === 'alvarogallo@hotmail.com' && password === 'colombia') {
            console.log("Credenciales correctas");
            req.session.token = 'fake-token-123456';
            return res.redirect('/dashboard');
        } else {
            console.log("Credenciales incorrectas");
            return res.render('login', { error: 'Credenciales inválidas' });
        }
    } catch (error) {
        console.error("Error en el login:", error);
        return res.render('login', { error: 'Login inválido' });
    }
});

// Logout
app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/');
    });
});

// ========== RUTAS PROTEGIDAS (DASHBOARD) ==========

// Dashboard principal - protegido
app.get('/dashboard', requireAuth, (req, res) => {
    const sessions = [];
    
    for (const [sessionId, session] of activeSessions.entries()) {
        sessions.push({
            sessionId: sessionId,
            status: session.status,
            createdAt: session.createdAt,
            lastActivity: session.lastActivity,
            messageCount: session.messages ? session.messages.length : 0
        });
    }

    res.render('dashboard', { 
        token: req.session.token,
        sessions: sessions,
        totalSessions: sessions.length
    });
});

// Crear nueva sesión - protegido
app.post('/dashboard/create-session', requireAuth, async (req, res) => {
    const { sessionId } = req.body;
    
    if (!sessionId) {
        return res.redirect('/dashboard?error=session_id_required');
    }

    try {
        // Verificar si la sesión ya existe
        if (activeSessions.has(sessionId)) {
            return res.redirect('/dashboard?error=session_exists');
        }

        // Crear nueva sesión
        const client = createWhatsAppSession(sessionId);
        
        // Almacenar información de la sesión
        activeSessions.set(sessionId, {
            client: client,
            sessionId: sessionId,
            status: 'initializing',
            qrCode: null,
            createdAt: new Date(),
            lastActivity: new Date(),
            messages: []
        });

        // Inicializar el cliente
        await client.initialize();

        res.redirect('/dashboard?success=session_created');

    } catch (error) {
        console.error(`Error creando sesión ${sessionId}:`, error);
        res.redirect('/dashboard?error=creation_failed');
    }
});

// Ver detalles de una sesión - protegido
app.get('/dashboard/session/:sessionId', requireAuth, (req, res) => {
    const { sessionId } = req.params;
    
    if (!activeSessions.has(sessionId)) {
        return res.redirect('/dashboard?error=session_not_found');
    }

    const session = activeSessions.get(sessionId);
    
    res.render('session-detail', {
        session: session,
        messages: session.messages || []
    });
});

// Enviar mensaje desde dashboard - protegido
app.post('/dashboard/session/:sessionId/send', requireAuth, async (req, res) => {
    const { sessionId } = req.params;
    const { number, message } = req.body;
    
    if (!activeSessions.has(sessionId)) {
        return res.redirect(`/dashboard?error=session_not_found`);
    }

    const session = activeSessions.get(sessionId);
    
    if (session.status !== 'connected') {
        return res.redirect(`/dashboard/session/${sessionId}?error=not_connected`);
    }

    try {
        const chatId = number.includes('@c.us') ? number : `${number}@c.us`;
        await session.client.sendMessage(chatId, message);
        
        // Guardar mensaje enviado
        if (!session.messages) session.messages = [];
        session.messages.push({
            to: chatId,
            body: message,
            timestamp: new Date(),
            type: 'sent'
        });
        session.lastActivity = new Date();

        res.redirect(`/dashboard/session/${sessionId}?success=message_sent`);

    } catch (error) {
        console.error(`Error enviando mensaje en sesión ${sessionId}:`, error);
        res.redirect(`/dashboard/session/${sessionId}?error=send_failed`);
    }
});

// Cerrar sesión - protegido
app.delete('/dashboard/session/:sessionId', requireAuth, async (req, res) => {
    const { sessionId } = req.params;
    
    if (!activeSessions.has(sessionId)) {
        return res.status(404).json({ error: 'Sesión no encontrada' });
    }

    try {
        const session = activeSessions.get(sessionId);
        await session.client.destroy();
        activeSessions.delete(sessionId);

        res.json({ success: true, message: 'Sesión cerrada exitosamente' });

    } catch (error) {
        console.error(`Error cerrando sesión ${sessionId}:`, error);
        res.status(500).json({ error: error.message });
    }
});

// ========== RUTAS PÚBLICAS (API) ==========

// Obtener token QR - PÚBLICA (no requiere autenticación)
app.get('/api/qr/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const { wait } = req.query; // ?wait=true para esperar hasta 30 segundos
    
    // Si la sesión no existe, la creamos automáticamente
    if (!activeSessions.has(sessionId)) {
        try {
            const client = createWhatsAppSession(sessionId);
            
            activeSessions.set(sessionId, {
                client: client,
                sessionId: sessionId,
                status: 'initializing',
                qrCode: null,
                createdAt: new Date(),
                lastActivity: new Date(),
                messages: []
            });

            client.initialize();
            
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
            
        } catch (error) {
            return res.status(500).json({
                success: false,
                error: 'Error creando sesión: ' + error.message
            });
        }
    }

    const session = activeSessions.get(sessionId);
    
    // Si se solicita esperar y no hay QR aún, esperar hasta 30 segundos
    if (wait === 'true' && !session.qrCode && session.status === 'initializing') {
        let attempts = 0;
        const maxAttempts = 60; // 30 segundos (500ms * 60)
        
        const checkQR = () => {
            return new Promise((resolve) => {
                const interval = setInterval(() => {
                    attempts++;
                    const currentSession = activeSessions.get(sessionId);
                    
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
});

// Estado de sesión - PÚBLICA
app.get('/api/status/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    
    if (!activeSessions.has(sessionId)) {
        return res.status(404).json({
            success: false,
            message: 'Sesión no encontrada'
        });
    }

    const session = activeSessions.get(sessionId);
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

app.listen(3000, () => {
    console.log('Servidor corriendo en http://localhost:3000');
    console.log('\n=== RUTAS DISPONIBLES ===');
    console.log('🔐 PROTEGIDAS (requieren login):');
    console.log('   GET  /dashboard                     - Panel de control');
    console.log('   POST /dashboard/create-session      - Crear sesión');
    console.log('   GET  /dashboard/session/:id         - Detalles de sesión');
    console.log('   POST /dashboard/session/:id/send    - Enviar mensaje');
    console.log('');
    console.log('🌍 PÚBLICAS (no requieren login):');
    console.log('   GET  /api/qr/:sessionId             - Obtener token QR');
    console.log('   GET  /api/status/:sessionId         - Estado de sesión');
    console.log('');
    console.log('📱 Ejemplo de uso público:');
    console.log('   http://localhost:3000/api/qr/ses_1234567');
});
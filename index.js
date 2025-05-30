// Cargar variables de entorno al inicio
require('dotenv').config();

const express = require('express');
const session = require('express-session');
const fs = require('fs');
const path = require('path');

const app = express();

// ===== CONFIGURACIÓN BÁSICA =====
app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Servir archivos estáticos desde la carpeta 'public'
app.use('/public', express.static(path.join(__dirname, 'public')));

// ===== HABILITAR CORS =====
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    
    // Responder a preflight requests
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
});

// Configuración de sesiones con variable de entorno
app.use(session({
  secret: process.env.SESSION_SECRET || 'clave_secreta_fallback',
  resave: false,
  saveUninitialized: true
}));

// Crear directorios necesarios si no existen
if (!fs.existsSync('./sessions')) {
    fs.mkdirSync('./sessions', { recursive: true });
}

if (!fs.existsSync('./public')) {
    fs.mkdirSync('./public', { recursive: true });
}

// ===== IMPORTAR RUTAS =====
const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const apiRoutes = require('./routes/api');

// ===== USAR RUTAS =====
app.use('/', authRoutes);           // /, /login, /logout
app.use('/dashboard', dashboardRoutes);  // /dashboard/*
app.use('/api', apiRoutes);         // /api/*

// ===== SERVIDOR =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    const memoryUsage = process.memoryUsage();
    const formatBytes = (bytes) => (bytes / 1024 / 1024).toFixed(2);
    
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
    console.log(`🌍 Accesible desde cualquier IP en puerto ${PORT}`);
    console.log('\n=== CONFIGURACIÓN ===');
    console.log(`📧 Admin Email: ${process.env.ADMIN_EMAIL || 'alvarogallo@hotmail.com'}`);
    console.log(`🔐 Variables de entorno cargadas: ${process.env.NODE_ENV || 'development'}`);
    console.log('\n=== MEMORIA INICIAL ===');
    console.log(`💾 RAM Total: ${formatBytes(memoryUsage.rss)} MB`);
    console.log(`🧠 Heap Usado: ${formatBytes(memoryUsage.heapUsed)} MB`);
    console.log(`📊 Heap Total: ${formatBytes(memoryUsage.heapTotal)} MB`);
    console.log('\n=== RUTAS DISPONIBLES ===');
    console.log('🔐 AUTENTICACIÓN:');
    console.log('   GET  /                    - Página principal');
    console.log('   POST /login              - Procesar login');
    console.log('   GET  /logout             - Cerrar sesión');
    console.log('');
    console.log('🛡️  PROTEGIDAS (requieren login):');
    console.log('   GET  /dashboard          - Panel de control');
    console.log('   POST /dashboard/create-session');
    console.log('   GET  /dashboard/session/:id');
    console.log('   POST /dashboard/session/:id/send');
    console.log('   DELETE /dashboard/session/:id');
    console.log('');
    console.log('🌍 PÚBLICAS (API sin login):');
    console.log('   GET  /api/cliente           - Cliente WhatsApp HTML');
    console.log('   GET  /api/qr/:sessionId     - Obtener token QR');
    console.log('   GET  /api/status/:sessionId - Estado de sesión');
    console.log('   DELETE /api/session/:sessionId - Borrar sesión');
    console.log('   GET  /api/system-info        - Info del sistema');
    console.log('');
    console.log('📱 Ejemplos:');
    console.log('   http://localhost:3000/api/cliente');
    console.log('   http://localhost:3000/api/qr/ses_1234567');
    
    // En la sección de rutas públicas, agregar:
    console.log('   GET  /api/lottery-info       - Información clave del día');
    console.log('   POST /api/lottery-refresh    - Refrescar caché lotería');
    console.log('   POST /api/session            - Crear sesión (requiere clave del día)');

    // Mostrar información de memoria cada 5 minutos
    setInterval(() => {
        const mem = process.memoryUsage();
        console.log(`\n💾 [${new Date().toLocaleString()}] Memoria: RAM=${formatBytes(mem.rss)}MB, Heap=${formatBytes(mem.heapUsed)}MB`);
    }, 5 * 60 * 1000);
});

// Agregar al final de index.js - Sistema de cierre correcto

// ===== MANEJO DE CIERRE CORRECTO =====
let isShuttingDown = false;

// Agregar al final de index.js, antes del gracefulShutdown

// ===== RECUPERACIÓN AUTOMÁTICA DE SESIONES =====
async function startupRecovery() {
    try {
        console.log('\n🔄 INICIANDO RECUPERACIÓN DE SESIONES...');
        const { recoverAllSessions, getSessionsStats } = require('./services/sessionRecovery');
        
        // Mostrar estadísticas antes de recuperar
        const statsBefore = getSessionsStats();
        console.log(`📊 Estadísticas iniciales:`);
        console.log(`   📁 Total en carpeta: ${statsBefore.total}`);
        console.log(`   ✅ Válidas: ${statsBefore.valid}`);
        console.log(`   ❌ Inválidas: ${statsBefore.invalid}`);
        console.log(`   🟢 Activas: ${statsBefore.active}`);
        
        if (statsBefore.valid > 0) {
            console.log(`\n🚀 Recuperando ${statsBefore.valid} sesión(es)...`);
            
            // Mostrar progreso
            const startTime = Date.now();
            const results = await recoverAllSessions();
            const endTime = Date.now();
            
            console.log(`\n📋 RESULTADOS DE RECUPERACIÓN:`);
            console.log(`   ⏱️  Tiempo total: ${((endTime - startTime) / 1000).toFixed(1)}s`);
            console.log(`   ✅ Recuperadas: ${results.recovered}/${results.total}`);
            console.log(`   ❌ Fallidas: ${results.failed}`);
            
            if (results.sessions.length > 0) {
                console.log(`\n📄 DETALLE DE SESIONES:`);
                results.sessions.forEach(session => {
                    if (session.status === 'recovered') {
                        console.log(`   ✅ ${session.sessionId} - Estado: ${session.session.status}`);
                    } else {
                        console.log(`   ❌ ${session.sessionId} - Error: ${session.reason}`);
                    }
                });
            }
            
        } else {
            console.log('📝 No hay sesiones válidas para recuperar');
        }
        
        console.log('✅ Recuperación de sesiones completada\n');
        
    } catch (error) {
        console.error('❌ Error durante recuperación de sesiones:', error);
    }
}

// Llamar a la recuperación después de que el servidor esté listo
app.listen(PORT, '0.0.0.0', async () => {
    const memoryUsage = process.memoryUsage();
    const formatBytes = (bytes) => (bytes / 1024 / 1024).toFixed(2);
    
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
    console.log(`🌍 Accesible desde cualquier IP en puerto ${PORT}`);
    console.log('\n=== CONFIGURACIÓN ===');
    console.log(`📧 Admin Email: ${process.env.ADMIN_EMAIL || 'alvarogallo@hotmail.com'}`);
    console.log(`🔐 Variables de entorno cargadas: ${process.env.NODE_ENV || 'development'}`);
    console.log('\n=== MEMORIA INICIAL ===');
    console.log(`💾 RAM Total: ${formatBytes(memoryUsage.rss)} MB`);
    console.log(`🧠 Heap Usado: ${formatBytes(memoryUsage.heapUsed)} MB`);
    console.log(`📊 Heap Total: ${formatBytes(memoryUsage.heapTotal)} MB`);
    
    // ⭐ NUEVA SECCIÓN: Recuperación de sesiones
    await startupRecovery();
    
    console.log('\n=== RUTAS DISPONIBLES ===');
    console.log('🔐 AUTENTICACIÓN:');
    console.log('   GET  /                    - Página principal');
    console.log('   POST /login              - Procesar login');
    console.log('   GET  /logout             - Cerrar sesión');
    console.log('');
    console.log('🛡️  PROTEGIDAS (requieren login):');
    console.log('   GET  /dashboard          - Panel de control');
    console.log('   POST /dashboard/create-session');
    console.log('   GET  /dashboard/session/:id');
    console.log('   POST /dashboard/session/:id/send');
    console.log('   DELETE /dashboard/session/:id');
    console.log('');
    console.log('🌍 PÚBLICAS (API sin login):');
    console.log('   GET  /api/cliente           - Cliente WhatsApp HTML');
    console.log('   GET  /api/lottery-info      - Información clave del día');
    console.log('   POST /api/lottery-refresh   - Refrescar caché lotería');
    console.log('   POST /api/session           - Crear sesión (requiere clave_hoy)');
    console.log('   GET  /api/qr/:sessionId     - Obtener token QR');
    console.log('   GET  /api/status/:sessionId - Estado de sesión');
    console.log('   DELETE /api/session/:sessionId - Borrar sesión');
    console.log('   GET  /api/system-info       - Info del sistema');
    console.log('   GET  /api/sessions-stats    - Estadísticas de sesiones'); // Nueva ruta
    console.log('   POST /api/recover-sessions  - Recuperar sesiones manualmente'); // Nueva ruta
    console.log('');
    console.log('📱 Ejemplos:');
    console.log('   http://localhost:3000/api/cliente');
    console.log('   http://localhost:3000/api/qr/ses_1234567');
    
    // Mostrar información de memoria cada 5 minutos
    setInterval(() => {
        const mem = process.memoryUsage();
        console.log(`\n💾 [${new Date().toLocaleString()}] Memoria: RAM=${formatBytes(mem.rss)}MB, Heap=${formatBytes(mem.heapUsed)}MB`);
    }, 5 * 60 * 1000);
});

async function gracefulShutdown(signal) {
    if (isShuttingDown) {
        console.log(`\n⚠️  Forzando cierre... (ya en proceso de cierre)`);
        process.exit(1);
    }
    
    isShuttingDown = true;
    console.log(`\n📴 Recibida señal ${signal}. Iniciando cierre correcto...`);
    
    try {
        // Cerrar todas las sesiones de WhatsApp activas
        const { getAllSessions, destroySession } = require('./services/whatsapp');
        const sessions = getAllSessions();
        
        if (sessions.length > 0) {
            console.log(`🔄 Cerrando ${sessions.length} sesión(es) activa(s)...`);
            
            const closePromises = sessions.map(async (session) => {
                try {
                    console.log(`  📴 Cerrando sesión: ${session.sessionId}`);
                    await destroySession(session.sessionId);
                    console.log(`  ✅ Sesión ${session.sessionId} cerrada correctamente`);
                } catch (error) {
                    console.error(`  ❌ Error cerrando sesión ${session.sessionId}:`, error.message);
                }
            });
            
            // Esperar máximo 10 segundos para cerrar todas las sesiones
            await Promise.race([
                Promise.all(closePromises),
                new Promise(resolve => setTimeout(resolve, 10000))
            ]);
        }
        
        console.log('✅ Todas las sesiones cerradas correctamente');
        
    } catch (error) {
        console.error('❌ Error durante el cierre:', error.message);
    }
    
    console.log('👋 Servidor cerrado correctamente. ¡Hasta luego!');
    process.exit(0);
}

// Manejar Ctrl+C (SIGINT)
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Manejar terminación del proceso (SIGTERM)
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Manejar errores no capturados
process.on('uncaughtException', (error) => {
    console.error('💥 Error no capturado:', error);
    gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Promesa rechazada no manejada:', reason);
    gracefulShutdown('UNHANDLED_REJECTION');
});

// Mostrar mensaje de ayuda
console.log('\n💡 AYUDA:');
console.log('   Presiona Ctrl+C para cerrar el servidor correctamente');
console.log('   El sistema cerrará todas las sesiones de WhatsApp automáticamente');
console.log('');
// index.js - Servidor completo con optimizaciones de memoria
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

if (!fs.existsSync('./utils')) {
    fs.mkdirSync('./utils', { recursive: true });
}

// ===== IMPORTAR RUTAS =====
const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const apiRoutes = require('./routes/api');

// ===== USAR RUTAS =====
app.use('/', authRoutes);           // /, /login, /logout
app.use('/dashboard', dashboardRoutes);  // /dashboard/*
app.use('/api', apiRoutes);         // /api/*

// ===== RECUPERACIÓN AUTOMÁTICA DE SESIONES =====
async function startupRecovery() {
    try {
        console.log('\n🔄 INICIANDO RECUPERACIÓN INTELIGENTE DE SESIONES...');
        const { recoverAllSessions, getSessionsStats } = require('./services/sessionRecovery');
        
        // Mostrar estadísticas antes de recuperar
        const statsBefore = getSessionsStats();
        console.log(`📊 Estadísticas iniciales:`);
        console.log(`   📁 Total en carpeta: ${statsBefore.total}`);
        console.log(`   ✅ Válidas: ${statsBefore.valid}`);
        console.log(`   ❌ Inválidas: ${statsBefore.invalid}`);
        console.log(`   🟢 Ya activas: ${statsBefore.active}`);
        console.log(`   🔄 Necesitan recuperación: ${statsBefore.needRecovery}`);
        
        // ✅ CLAVE: Solo proceder si hay sesiones que realmente necesitan recuperación
        if (statsBefore.needRecovery > 0) {
            console.log(`\n🚀 Recuperando ${statsBefore.needRecovery} sesión(es) que lo necesitan...`);
            
            const startTime = Date.now();
            const results = await recoverAllSessions();
            const endTime = Date.now();
            
            console.log(`\n📋 RESULTADOS DE RECUPERACIÓN:`);
            console.log(`   ⏱️  Tiempo total: ${((endTime - startTime) / 1000).toFixed(1)}s`);
            console.log(`   ✅ Recuperadas: ${results.recovered}`);
            console.log(`   ⏭️  Saltadas (ya activas): ${results.skipped}`);
            console.log(`   ❌ Fallidas: ${results.failed}`);
            
            if (results.sessions.length > 0) {
                console.log(`\n📄 DETALLE DE SESIONES:`);
                results.sessions.forEach(session => {
                    switch (session.status) {
                        case 'recovered':
                            console.log(`   ✅ ${session.sessionId} - Recuperada - Estado: ${session.session.status}`);
                            break;
                        case 'skipped':
                            console.log(`   ⏭️  ${session.sessionId} - Saltada (ya activa)`);
                            break;
                        case 'failed':
                            console.log(`   ❌ ${session.sessionId} - Error: ${session.reason}`);
                            break;
                    }
                });
            }
            
        } else if (statsBefore.active > 0) {
            console.log(`✅ Todas las ${statsBefore.active} sesión(es) válida(s) ya están activas - No se requiere recuperación`);
        } else {
            console.log('📝 No hay sesiones para recuperar');
        }
        
        // Mostrar estadísticas finales
        const statsAfter = getSessionsStats();
        console.log(`\n📊 Estado final:`);
        console.log(`   🟢 Sesiones activas: ${statsAfter.active}`);
        console.log(`   📁 Total en disco: ${statsAfter.total}`);
        
        console.log('✅ Proceso de recuperación completado de forma segura\n');
        
    } catch (error) {
        console.error('❌ Error durante recuperación de sesiones:', error);
    }
}

// ===== OPTIMIZACIÓN DE MEMORIA =====
async function setupMemoryOptimization() {
    try {
        console.log('\n🧠 CONFIGURANDO OPTIMIZACIÓN DE MEMORIA...');
        const memoryOptimizer = require('./services/memoryOptimization');
        
        // Mostrar configuración inicial
        const initialMemory = memoryOptimizer.getMemoryUsage();
        console.log(`💾 Memoria inicial: ${initialMemory.rss}MB RAM, ${initialMemory.heapUsed}MB Heap`);
        
        // Mostrar límites configurados
        console.log(`⚙️  Límites configurados:`);
        console.log(`   📱 Máx sesiones: ${memoryOptimizer.MEMORY_LIMITS.MAX_TOTAL_SESSIONS}`);
        console.log(`   💬 Máx mensajes/sesión: ${memoryOptimizer.MEMORY_LIMITS.MAX_MESSAGES_PER_SESSION}`);
        console.log(`   ⚠️  Advertencia memoria: ${memoryOptimizer.MEMORY_LIMITS.MEMORY_WARNING_MB}MB`);
        console.log(`   🚨 Crítico memoria: ${memoryOptimizer.MEMORY_LIMITS.MEMORY_CRITICAL_MB}MB`);
        console.log(`   ⏰ Timeout sesión: ${memoryOptimizer.MEMORY_LIMITS.SESSION_TIMEOUT_HOURS}h`);
        
        // Iniciar limpieza automática
        memoryOptimizer.startAutomaticCleanup();
        
        // Verificación inicial
        const initialCheck = await memoryOptimizer.checkMemoryLimits();
        console.log(`📊 Estado inicial: ${initialCheck.status}`);
        
        console.log('✅ Optimización de memoria configurada\n');
        
    } catch (error) {
        console.error('❌ Error configurando optimización de memoria:', error);
    }
}

// ===== SERVIDOR =====
const PORT = process.env.PORT || 3000;
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
    
    // ⭐ NUEVA SECCIÓN: Configurar optimización de memoria
    await setupMemoryOptimization();
    
    // ⭐ SECCIÓN EXISTENTE: Recuperación de sesiones
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
    console.log('   POST /api/session/:sessionId - Crear sesión con ID específico');
    console.log('   GET  /api/qr/:sessionId     - Obtener token QR');
    console.log('   GET  /api/status/:sessionId - Estado de sesión');
    console.log('   DELETE /api/session/:sessionId - Borrar sesión');
    console.log('   GET  /api/system-info       - Info del sistema');
    console.log('   GET  /api/sessions-stats    - Estadísticas de sesiones');
    console.log('   POST /api/recover-sessions  - Recuperar sesiones manualmente');
    console.log('   POST /api/recover-session/:sessionId - Recuperar sesión específica');
    console.log('   POST /api/clean-invalid-sessions - Limpiar sesiones inválidas');
    console.log('   POST /api/clean-orphaned-folders - Limpiar carpetas huérfanas');
    console.log('');
    console.log('📱 GRUPOS Y MENSAJES:');
    console.log('   POST /api/session/:sessionId/groups - Obtener grupos');
    console.log('   POST /api/groups            - Obtener grupos (sessionId en body)');
    console.log('   POST /api/session/:sessionId/send-group-message - Enviar a grupo');
    console.log('   POST /api/send-group-message - Enviar a grupo (sessionId en body)');
    console.log('');
    console.log('🧠 OPTIMIZACIÓN DE MEMORIA:');
    console.log('   GET  /api/memory-stats      - Estadísticas de memoria');
    console.log('   POST /api/memory-cleanup    - Forzar limpieza de memoria');
    console.log('   POST /api/close-inactive-sessions - Cerrar sesiones inactivas');
    console.log('   POST /api/memory-limits     - Configurar límites de memoria');
    console.log('');
    console.log('ℹ️  AYUDA:');
    console.log('   GET  /api/client-help       - Guía para manejo de clientes');
    console.log('');
    console.log('📱 Ejemplos:');
    console.log('   http://localhost:3000/api/cliente');
    console.log('   http://localhost:3000/api/lottery-info');
    console.log('   http://localhost:3000/api/memory-stats');
    console.log('   http://localhost:3000/api/client-help');
    
    // Mostrar información de memoria cada 5 minutos
    setInterval(() => {
        try {
            const memoryOptimizer = require('./services/memoryOptimization');
            const currentMemory = memoryOptimizer.getMemoryUsage();
            const sessionCount = require('./services/whatsapp').activeSessions.size;
            
            console.log(`\n💾 [${new Date().toLocaleString()}] RAM: ${currentMemory.rss}MB | Heap: ${currentMemory.heapUsed}MB | Sesiones: ${sessionCount}`);
            
            // Alerta si la memoria está alta
            if (currentMemory.rss >= memoryOptimizer.MEMORY_LIMITS.MEMORY_WARNING_MB) {
                console.warn(`⚠️  ADVERTENCIA: Memoria alta (${currentMemory.rss}MB >= ${memoryOptimizer.MEMORY_LIMITS.MEMORY_WARNING_MB}MB)`);
            }
            
        } catch (error) {
            console.error('❌ Error en monitoreo de memoria:', error);
        }
    }, 5 * 60 * 1000);
    
    // Configurar cierre correcto
    const { setupGracefulShutdown } = require('./utils/gracefulShutdown');
    setupGracefulShutdown();
    
    console.log('\n💡 CONTROLES:');
    console.log('   Presiona Ctrl+C para cerrar el servidor correctamente');
    console.log('   El sistema cerrará todas las sesiones de WhatsApp automáticamente');
    console.log('   ⚠️  Si no responde, presiona Ctrl+C nuevamente para forzar cierre');
    console.log('\n🎯 SERVIDOR LISTO Y OPTIMIZADO!\n');
});
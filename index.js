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
    
    // Mostrar información de memoria cada 5 minutos
    setInterval(() => {
        const mem = process.memoryUsage();
        console.log(`\n💾 [${new Date().toLocaleString()}] Memoria: RAM=${formatBytes(mem.rss)}MB, Heap=${formatBytes(mem.heapUsed)}MB`);
    }, 5 * 60 * 1000);
});
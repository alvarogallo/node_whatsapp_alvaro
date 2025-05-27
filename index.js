const express = require('express');
const session = require('express-session');
const fs = require('fs');

const app = express();

// ===== CONFIGURACIÓN BÁSICA =====
app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Configuración de sesiones
app.use(session({
  secret: 'clave_secreta',
  resave: false,
  saveUninitialized: true
}));

// Crear directorio de sesiones si no existe
if (!fs.existsSync('./sessions')) {
    fs.mkdirSync('./sessions', { recursive: true });
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
app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
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
    console.log('   GET  /api/qr/:sessionId     - Obtener token QR');
    console.log('   GET  /api/status/:sessionId - Estado de sesión');
    console.log('');
    console.log('📱 Ejemplo: http://localhost:3000/api/qr/ses_1234567');
});
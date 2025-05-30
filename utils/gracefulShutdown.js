// utils/gracefulShutdown.js
// Utilidad para manejo correcto de cierre de la aplicación

let isShuttingDown = false;

async function setupGracefulShutdown() {
    
    async function gracefulShutdown(signal) {
        if (isShuttingDown) {
            console.log(`\n⚠️  Forzando cierre... (señal duplicada)`);
            process.exit(1);
        }
        
        isShuttingDown = true;
        console.log(`\n📴 Recibida señal ${signal}. Iniciando cierre correcto...`);
        
        try {
            // Importar servicios dinámicamente para evitar dependencias circulares
            const whatsappService = require('../services/whatsapp');
            const sessions = whatsappService.getAllSessions();
            
            if (sessions.length > 0) {
                console.log(`🔄 Cerrando ${sessions.length} sesión(es) activa(s)...`);
                
                // Cerrar todas las sesiones con timeout
                const closePromise = Promise.all(
                    sessions.map(async (session) => {
                        try {
                            console.log(`  📴 Cerrando sesión: ${session.sessionId}`);
                            await whatsappService.destroySession(session.sessionId);
                        } catch (error) {
                            console.error(`  ❌ Error cerrando ${session.sessionId}:`, error.message);
                        }
                    })
                );
                
                const timeoutPromise = new Promise(resolve => 
                    setTimeout(() => {
                        console.log('⏰ Timeout alcanzado, forzando cierre...');
                        resolve();
                    }, 8000)
                );
                
                await Promise.race([closePromise, timeoutPromise]);
                console.log('✅ Sesiones procesadas');
            } else {
                console.log('📝 No hay sesiones activas que cerrar');
            }
            
        } catch (error) {
            console.error('❌ Error durante el cierre:', error.message);
        }
        
        console.log('👋 Servidor cerrado correctamente. ¡Hasta luego!');
        process.exit(0);
    }

    // Manejar diferentes señales
    process.on('SIGINT', () => {
        console.log('\n🛑 Ctrl+C detectado...');
        gracefulShutdown('SIGINT');
    });

    process.on('SIGTERM', () => {
        console.log('\n🛑 SIGTERM detectado...');
        gracefulShutdown('SIGTERM');
    });

    // Manejar errores críticos
    process.on('uncaughtException', (error) => {
        console.error('\n💥 Error crítico no capturado:');
        console.error(error);
        gracefulShutdown('UNCAUGHT_EXCEPTION');
    });

    process.on('unhandledRejection', (reason, promise) => {
        console.error('\n💥 Promesa rechazada no manejada:');
        console.error('Razón:', reason);
        console.error('Promesa:', promise);
        gracefulShutdown('UNHANDLED_REJECTION');
    });

    // Mejorar el manejo de stdin para Ctrl+C
    if (process.stdin.isTTY) {
        process.stdin.setRawMode(true);
        process.stdin.on('data', (data) => {
            // Ctrl+C es 0x03
            if (data.length === 1 && data[0] === 3) {
                console.log('\n🛑 Ctrl+C detectado (stdin)...');
                gracefulShutdown('CTRL_C');
            }
        });
    }

    // Mensaje de ayuda
    console.log('\n💡 CONTROLES:');
    console.log('   Presiona Ctrl+C para cerrar el servidor correctamente');
    console.log('   El sistema cerrará todas las sesiones de WhatsApp automáticamente');
    console.log('   ⚠️  Si no responde, presiona Ctrl+C nuevamente para forzar cierre');
    console.log('');
}

module.exports = {
    setupGracefulShutdown
};
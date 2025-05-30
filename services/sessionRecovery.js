// services/sessionRecovery.js
// Sistema para recuperar sesiones existentes desde la carpeta sessions

const fs = require('fs');
const path = require('path');
const { createSession, activeSessions } = require('./whatsapp');

// Función para escanear la carpeta sessions
function scanSessionsFolder() {
    const sessionsPath = './sessions';
    
    try {
        if (!fs.existsSync(sessionsPath)) {
            console.log('[RECOVERY] 📁 Carpeta sessions no existe, creándola...');
            fs.mkdirSync(sessionsPath, { recursive: true });
            return [];
        }
        
        const folders = fs.readdirSync(sessionsPath, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);
        
        console.log(`[RECOVERY] 📂 Encontradas ${folders.length} carpeta(s) de sesión: ${folders.join(', ')}`);
        return folders;
        
    } catch (error) {
        console.error('[RECOVERY] ❌ Error escaneando carpeta sessions:', error.message);
        return [];
    }
}

// Función para verificar si una sesión tiene datos válidos
function hasValidSessionData(sessionId) {
    const sessionPath = path.join('./sessions', sessionId);
    
    try {
        // Verificar si existe la carpeta y tiene archivos de sesión
        if (!fs.existsSync(sessionPath)) {
            return false;
        }
        
        const files = fs.readdirSync(sessionPath);
        
        // Buscar archivos típicos de WhatsApp Web.js
        const hasSessionFiles = files.some(file => 
            file.includes('Default') || 
            file.includes('session') || 
            file.endsWith('.json') ||
            file === 'SingletonLock'
        );
        
        if (hasSessionFiles) {
            console.log(`[RECOVERY] ✅ Sesión ${sessionId} tiene datos válidos`);
            return true;
        } else {
            console.log(`[RECOVERY] ⚠️  Sesión ${sessionId} no tiene datos válidos`);
            return false;
        }
        
    } catch (error) {
        console.error(`[RECOVERY] ❌ Error verificando sesión ${sessionId}:`, error.message);
        return false;
    }
}

// Función para recuperar una sesión específica
async function recoverSession(sessionId) {
    try {
        console.log(`[RECOVERY] 🔄 Recuperando sesión: ${sessionId}`);
        
        // Verificar si la sesión ya está activa
        if (activeSessions.has(sessionId)) {
            console.log(`[RECOVERY] ⚠️  Sesión ${sessionId} ya está activa`);
            return { success: false, reason: 'already_active' };
        }
        
        // Verificar si tiene datos válidos
        if (!hasValidSessionData(sessionId)) {
            console.log(`[RECOVERY] ❌ Sesión ${sessionId} no tiene datos válidos`);
            return { success: false, reason: 'invalid_data' };
        }
        
        // Crear la sesión (esto la restaurará automáticamente)
        const session = await createSession(sessionId);
        
        console.log(`[RECOVERY] ✅ Sesión ${sessionId} recuperada exitosamente`);
        return { 
            success: true, 
            session: session,
            sessionId: sessionId
        };
        
    } catch (error) {
        console.error(`[RECOVERY] ❌ Error recuperando sesión ${sessionId}:`, error.message);
        return { 
            success: false, 
            reason: 'recovery_error',
            error: error.message 
        };
    }
}

// Función para recuperar todas las sesiones encontradas
async function recoverAllSessions() {
    console.log('[RECOVERY] 🚀 Iniciando recuperación de sesiones...');
    
    const sessionFolders = scanSessionsFolder();
    
    if (sessionFolders.length === 0) {
        console.log('[RECOVERY] 📝 No hay sesiones para recuperar');
        return {
            total: 0,
            recovered: 0,
            failed: 0,
            sessions: []
        };
    }
    
    const results = {
        total: sessionFolders.length,
        recovered: 0,
        failed: 0,
        sessions: []
    };
    
    // Recuperar sesiones una por una (para evitar sobrecargar)
    for (const sessionId of sessionFolders) {
        try {
            // Pequeña pausa entre recuperaciones
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            const result = await recoverSession(sessionId);
            
            if (result.success) {
                results.recovered++;
                results.sessions.push({
                    sessionId: sessionId,
                    status: 'recovered',
                    session: {
                        sessionId: result.session.sessionId,
                        status: result.session.status,
                        createdAt: result.session.createdAt
                    }
                });
            } else {
                results.failed++;
                results.sessions.push({
                    sessionId: sessionId,
                    status: 'failed',
                    reason: result.reason,
                    error: result.error
                });
            }
            
        } catch (error) {
            console.error(`[RECOVERY] ❌ Error procesando ${sessionId}:`, error.message);
            results.failed++;
            results.sessions.push({
                sessionId: sessionId,
                status: 'failed',
                reason: 'processing_error',
                error: error.message
            });
        }
    }
    
    console.log(`[RECOVERY] 📊 Recuperación completada: ${results.recovered}/${results.total} exitosas`);
    
    return results;
}

// Función para limpiar sesiones inválidas de la carpeta
function cleanInvalidSessions() {
    console.log('[RECOVERY] 🧹 Limpiando sesiones inválidas...');
    
    const sessionFolders = scanSessionsFolder();
    let cleaned = 0;
    
    sessionFolders.forEach(sessionId => {
        if (!hasValidSessionData(sessionId)) {
            try {
                const sessionPath = path.join('./sessions', sessionId);
                fs.rmSync(sessionPath, { recursive: true, force: true });
                console.log(`[RECOVERY] 🗑️  Eliminada sesión inválida: ${sessionId}`);
                cleaned++;
            } catch (error) {
                console.error(`[RECOVERY] ❌ Error eliminando ${sessionId}:`, error.message);
            }
        }
    });
    
    console.log(`[RECOVERY] ✅ Limpieza completada: ${cleaned} sesión(es) eliminada(s)`);
    return cleaned;
}

// Función para obtener estadísticas de la carpeta sessions
function getSessionsStats() {
    const sessionFolders = scanSessionsFolder();
    const stats = {
        total: sessionFolders.length,
        valid: 0,
        invalid: 0,
        active: activeSessions.size,
        details: []
    };
    
    sessionFolders.forEach(sessionId => {
        const isValid = hasValidSessionData(sessionId);
        const isActive = activeSessions.has(sessionId);
        
        if (isValid) stats.valid++;
        else stats.invalid++;
        
        stats.details.push({
            sessionId: sessionId,
            valid: isValid,
            active: isActive,
            status: isActive ? 'active' : (isValid ? 'recoverable' : 'invalid')
        });
    });
    
    return stats;
}

module.exports = {
    scanSessionsFolder,
    hasValidSessionData,
    recoverSession,
    recoverAllSessions,
    cleanInvalidSessions,
    getSessionsStats
};
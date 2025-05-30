// services/sessionRecovery.js - VERSIÓN CORREGIDA
// Sistema para recuperar sesiones existentes desde la carpeta sessions SIN afectar las activas

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

// 🔧 FUNCIÓN CORREGIDA: Verificar si una sesión necesita recuperación
function needsRecovery(sessionId) {
    // ✅ CLAVE: Si ya está activa en memoria, NO necesita recuperación
    if (activeSessions.has(sessionId)) {
        console.log(`[RECOVERY] ✅ Sesión ${sessionId} ya está activa, saltando recuperación`);
        return false;
    }
    
    // Solo recuperar si tiene datos válidos pero no está en memoria
    return hasValidSessionData(sessionId);
}

// 🔧 FUNCIÓN CORREGIDA: Recuperar una sesión específica solo si es necesario
async function recoverSession(sessionId) {
    try {
        console.log(`[RECOVERY] 🔄 Evaluando recuperación de: ${sessionId}`);
        
        // ✅ VERIFICACIÓN CLAVE: No tocar sesiones activas
        if (activeSessions.has(sessionId)) {
            console.log(`[RECOVERY] ⚠️  Sesión ${sessionId} ya está activa - NO RECUPERANDO`);
            return { 
                success: true, 
                reason: 'already_active',
                session: activeSessions.get(sessionId)
            };
        }
        
        // Verificar si tiene datos válidos
        if (!hasValidSessionData(sessionId)) {
            console.log(`[RECOVERY] ❌ Sesión ${sessionId} no tiene datos válidos`);
            return { success: false, reason: 'invalid_data' };
        }
        
        // Solo aquí crear la sesión (esto la restaurará automáticamente)
        console.log(`[RECOVERY] 🚀 Recuperando sesión ${sessionId}...`);
        const session = await createSession(sessionId);
        
        console.log(`[RECOVERY] ✅ Sesión ${sessionId} recuperada exitosamente`);
        return { 
            success: true, 
            session: session,
            sessionId: sessionId,
            reason: 'recovered'
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

// 🔧 FUNCIÓN CORREGIDA: Recuperar solo las sesiones que realmente lo necesitan
async function recoverAllSessions() {
    console.log('[RECOVERY] 🚀 Iniciando recuperación inteligente de sesiones...');
    
    const sessionFolders = scanSessionsFolder();
    
    if (sessionFolders.length === 0) {
        console.log('[RECOVERY] 📝 No hay sesiones para evaluar');
        return {
            total: 0,
            recovered: 0,
            failed: 0,
            skipped: 0,
            sessions: []
        };
    }
    
    // ✅ NUEVO: Mostrar estado actual antes de recuperar
    const activeSessions = require('./whatsapp').activeSessions;
    console.log(`[RECOVERY] 📊 Estado actual: ${activeSessions.size} sesión(es) activa(s)`);
    
    const results = {
        total: sessionFolders.length,
        recovered: 0,
        failed: 0,
        skipped: 0,
        sessions: []
    };
    
    // ✅ CLAVE: Filtrar solo las sesiones que necesitan recuperación
    const sessionsToRecover = sessionFolders.filter(sessionId => needsRecovery(sessionId));
    
    console.log(`[RECOVERY] 🎯 De ${sessionFolders.length} carpetas, ${sessionsToRecover.length} necesitan recuperación`);
    
    if (sessionsToRecover.length === 0) {
        console.log('[RECOVERY] ✅ Todas las sesiones válidas ya están activas');
        
        // Agregar sesiones activas al resultado
        sessionFolders.forEach(sessionId => {
            if (activeSessions.has(sessionId)) {
                results.skipped++;
                results.sessions.push({
                    sessionId: sessionId,
                    status: 'already_active',
                    reason: 'Session was already running'
                });
            }
        });
        
        return results;
    }
    
    // Recuperar solo las sesiones que lo necesitan
    for (const sessionId of sessionsToRecover) {
        try {
            // Pequeña pausa entre recuperaciones
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            const result = await recoverSession(sessionId);
            
            if (result.success) {
                if (result.reason === 'already_active') {
                    results.skipped++;
                    results.sessions.push({
                        sessionId: sessionId,
                        status: 'skipped',
                        reason: result.reason
                    });
                } else {
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
                }
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
    
    console.log(`[RECOVERY] 📊 Recuperación completada:`);
    console.log(`   ✅ Recuperadas: ${results.recovered}`);
    console.log(`   ⏭️  Saltadas (ya activas): ${results.skipped}`);
    console.log(`   ❌ Fallidas: ${results.failed}`);
    
    return results;
}

// Función para limpiar sesiones inválidas de la carpeta
function cleanInvalidSessions() {
    console.log('[RECOVERY] 🧹 Limpiando sesiones inválidas...');
    
    const sessionFolders = scanSessionsFolder();
    let cleaned = 0;
    
    sessionFolders.forEach(sessionId => {
        // ✅ NUEVO: No tocar carpetas de sesiones activas
        if (activeSessions.has(sessionId)) {
            console.log(`[RECOVERY] ⚠️  Saltando ${sessionId} (sesión activa)`);
            return;
        }
        
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

// 🔧 FUNCIÓN MEJORADA: Obtener estadísticas más detalladas
function getSessionsStats() {
    const sessionFolders = scanSessionsFolder();
    const activeSessionsMap = require('./whatsapp').activeSessions;
    
    const stats = {
        total: sessionFolders.length,
        valid: 0,
        invalid: 0,
        active: activeSessionsMap.size,
        needRecovery: 0,
        details: []
    };
    
    sessionFolders.forEach(sessionId => {
        const isValid = hasValidSessionData(sessionId);
        const isActive = activeSessionsMap.has(sessionId);
        const needsRec = needsRecovery(sessionId);
        
        if (isValid) stats.valid++;
        else stats.invalid++;
        
        if (needsRec) stats.needRecovery++;
        
        stats.details.push({
            sessionId: sessionId,
            valid: isValid,
            active: isActive,
            needsRecovery: needsRec,
            status: isActive ? 'active' : (needsRec ? 'needs_recovery' : (isValid ? 'valid_but_inactive' : 'invalid'))
        });
    });
    
    return stats;
}

module.exports = {
    scanSessionsFolder,
    hasValidSessionData,
    needsRecovery,      // ✅ Nueva función exportada
    recoverSession,
    recoverAllSessions,
    cleanInvalidSessions,
    getSessionsStats
};
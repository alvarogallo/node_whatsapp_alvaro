// services/memoryOptimization.js
// Sistema para optimizar memoria y prevenir bloqueos

const { activeSessions } = require('./whatsapp');

// Configuración de límites
const MEMORY_LIMITS = {
    MAX_MESSAGES_PER_SESSION: 1000,        // Máximo mensajes por sesión
    MAX_TOTAL_SESSIONS: 50,                // Máximo sesiones simultáneas
    MEMORY_WARNING_MB: 512,                // Advertencia en MB
    MEMORY_CRITICAL_MB: 1024,              // Crítico en MB
    CLEANUP_INTERVAL_MINUTES: 30,          // Limpieza cada 30 min
    SESSION_TIMEOUT_HOURS: 24              // Timeout de sesión inactiva
};

// Función para obtener uso de memoria
function getMemoryUsage() {
    const usage = process.memoryUsage();
    return {
        rss: Math.round(usage.rss / 1024 / 1024), // MB
        heapUsed: Math.round(usage.heapUsed / 1024 / 1024), // MB
        heapTotal: Math.round(usage.heapTotal / 1024 / 1024), // MB
        external: Math.round(usage.external / 1024 / 1024), // MB
        arrayBuffers: Math.round((usage.arrayBuffers || 0) / 1024 / 1024) // MB
    };
}

// Función para limpiar mensajes antiguos de una sesión
function cleanSessionMessages(sessionId) {
    const session = activeSessions.get(sessionId);
    if (!session || !session.messages) return 0;
    
    const messageCount = session.messages.length;
    if (messageCount <= MEMORY_LIMITS.MAX_MESSAGES_PER_SESSION) return 0;
    
    // Mantener solo los últimos N mensajes
    const messagesToKeep = MEMORY_LIMITS.MAX_MESSAGES_PER_SESSION;
    const messagesToRemove = messageCount - messagesToKeep;
    
    session.messages = session.messages.slice(-messagesToKeep);
    
    console.log(`[MEMORY] 🧹 Sesión ${sessionId}: eliminados ${messagesToRemove} mensajes antiguos`);
    return messagesToRemove;
}

// Función para limpiar todas las sesiones
function cleanAllSessionsMessages() {
    let totalCleaned = 0;
    
    for (const [sessionId] of activeSessions) {
        totalCleaned += cleanSessionMessages(sessionId);
    }
    
    if (totalCleaned > 0) {
        console.log(`[MEMORY] 🧹 Limpieza completada: ${totalCleaned} mensajes eliminados`);
    }
    
    return totalCleaned;
}

// Función para cerrar sesiones inactivas
async function closeInactiveSessions() {
    const now = Date.now();
    const timeoutMs = MEMORY_LIMITS.SESSION_TIMEOUT_HOURS * 60 * 60 * 1000;
    let closedSessions = 0;
    
    const { destroySession } = require('./whatsapp');
    
    for (const [sessionId, session] of activeSessions) {
        if (!session.lastActivity) continue;
        
        const inactiveTime = now - new Date(session.lastActivity).getTime();
        
        if (inactiveTime > timeoutMs) {
            try {
                console.log(`[MEMORY] ⏰ Cerrando sesión inactiva: ${sessionId} (${Math.round(inactiveTime / (1000 * 60 * 60))}h sin actividad)`);
                await destroySession(sessionId);
                closedSessions++;
            } catch (error) {
                console.error(`[MEMORY] ❌ Error cerrando sesión inactiva ${sessionId}:`, error.message);
            }
        }
    }
    
    if (closedSessions > 0) {
        console.log(`[MEMORY] ✅ Cerradas ${closedSessions} sesión(es) inactiva(s)`);
    }
    
    return closedSessions;
}

// Función para verificar límites y actuar
async function checkMemoryLimits() {
    const memory = getMemoryUsage();
    const sessionCount = activeSessions.size;
    
    console.log(`[MEMORY] 📊 RAM: ${memory.rss}MB | Sesiones: ${sessionCount}/${MEMORY_LIMITS.MAX_TOTAL_SESSIONS}`);
    
    let actionsPerformed = [];
    
    // Verificar límite de sesiones
    if (sessionCount > MEMORY_LIMITS.MAX_TOTAL_SESSIONS) {
        console.warn(`[MEMORY] ⚠️  Demasiadas sesiones: ${sessionCount}/${MEMORY_LIMITS.MAX_TOTAL_SESSIONS}`);
        actionsPerformed.push(`warning_max_sessions`);
    }
    
    // Verificar memoria crítica
    if (memory.rss >= MEMORY_LIMITS.MEMORY_CRITICAL_MB) {
        console.error(`[MEMORY] 🚨 MEMORIA CRÍTICA: ${memory.rss}MB >= ${MEMORY_LIMITS.MEMORY_CRITICAL_MB}MB`);
        
        // Acciones de emergencia
        const cleaned = cleanAllSessionsMessages();
        const closed = await closeInactiveSessions();
        
        // Forzar garbage collection si está disponible
        if (global.gc) {
            global.gc();
            console.log(`[MEMORY] 🗑️  Garbage collection forzado`);
        }
        
        actionsPerformed.push(`critical_cleanup`, `cleaned_${cleaned}_messages`, `closed_${closed}_sessions`);
        
    } else if (memory.rss >= MEMORY_LIMITS.MEMORY_WARNING_MB) {
        console.warn(`[MEMORY] ⚠️  Memoria alta: ${memory.rss}MB >= ${MEMORY_LIMITS.MEMORY_WARNING_MB}MB`);
        
        // Limpieza preventiva
        const cleaned = cleanAllSessionsMessages();
        actionsPerformed.push(`preventive_cleanup`, `cleaned_${cleaned}_messages`);
    }
    
    return {
        memory,
        sessionCount,
        actionsPerformed,
        status: memory.rss >= MEMORY_LIMITS.MEMORY_CRITICAL_MB ? 'critical' : 
                memory.rss >= MEMORY_LIMITS.MEMORY_WARNING_MB ? 'warning' : 'normal'
    };
}

// Función para obtener estadísticas detalladas
function getDetailedStats() {
    const memory = getMemoryUsage();
    const sessionStats = {};
    let totalMessages = 0;
    
    for (const [sessionId, session] of activeSessions) {
        const messageCount = session.messages ? session.messages.length : 0;
        totalMessages += messageCount;
        
        sessionStats[sessionId] = {
            status: session.status,
            messageCount: messageCount,
            createdAt: session.createdAt,
            lastActivity: session.lastActivity,
            memoryImpact: messageCount > MEMORY_LIMITS.MAX_MESSAGES_PER_SESSION ? 'high' : 'normal'
        };
    }
    
    return {
        memory: memory,
        sessions: {
            total: activeSessions.size,
            limit: MEMORY_LIMITS.MAX_TOTAL_SESSIONS,
            totalMessages: totalMessages,
            details: sessionStats
        },
        limits: MEMORY_LIMITS,
        recommendations: generateRecommendations(memory, activeSessions.size, totalMessages)
    };
}

// Función para generar recomendaciones
function generateRecommendations(memory, sessionCount, totalMessages) {
    const recommendations = [];
    
    if (memory.rss > MEMORY_LIMITS.MEMORY_WARNING_MB) {
        recommendations.push("Considere cerrar sesiones inactivas");
        recommendations.push("Reduzca el límite de mensajes por sesión");
    }
    
    if (sessionCount > MEMORY_LIMITS.MAX_TOTAL_SESSIONS * 0.8) {
        recommendations.push("Se acerca al límite de sesiones simultáneas");
    }
    
    if (totalMessages > 10000) {
        recommendations.push("Considere implementar persistencia de mensajes en base de datos");
    }
    
    if (memory.heapUsed > memory.heapTotal * 0.9) {
        recommendations.push("Considere reiniciar la aplicación pronto");
    }
    
    return recommendations;
}

// Configurar limpieza automática
function startAutomaticCleanup() {
    const intervalMs = MEMORY_LIMITS.CLEANUP_INTERVAL_MINUTES * 60 * 1000;
    
    const cleanupInterval = setInterval(async () => {
        try {
            console.log(`[MEMORY] 🔄 Iniciando limpieza automática...`);
            const result = await checkMemoryLimits();
            
            if (result.actionsPerformed.length > 0) {
                console.log(`[MEMORY] ✅ Acciones realizadas: ${result.actionsPerformed.join(', ')}`);
            }
            
        } catch (error) {
            console.error('[MEMORY] ❌ Error en limpieza automática:', error);
        }
    }, intervalMs);
    
    // Limpiar interval al cerrar la aplicación
    process.on('SIGINT', () => clearInterval(cleanupInterval));
    process.on('SIGTERM', () => clearInterval(cleanupInterval));
    
    console.log(`[MEMORY] 🚀 Limpieza automática iniciada (cada ${MEMORY_LIMITS.CLEANUP_INTERVAL_MINUTES} min)`);
    
    return cleanupInterval;
}

// Middleware para validar límites antes de crear sesiones
function validateResourceLimits() {
    return (req, res, next) => {
        const sessionCount = activeSessions.size;
        const memory = getMemoryUsage();
        
        // Verificar límite de sesiones
        if (sessionCount >= MEMORY_LIMITS.MAX_TOTAL_SESSIONS) {
            return res.status(503).json({
                success: false,
                error: 'Límite de sesiones alcanzado',
                current: sessionCount,
                limit: MEMORY_LIMITS.MAX_TOTAL_SESSIONS,
                message: 'El servidor ha alcanzado el máximo de sesiones simultáneas'
            });
        }
        
        // Verificar memoria crítica
        if (memory.rss >= MEMORY_LIMITS.MEMORY_CRITICAL_MB) {
            return res.status(503).json({
                success: false,
                error: 'Memoria insuficiente',
                currentMemory: `${memory.rss}MB`,
                limit: `${MEMORY_LIMITS.MEMORY_CRITICAL_MB}MB`,
                message: 'El servidor está en estado de memoria crítica'
            });
        }
        
        next();
    };
}

module.exports = {
    getMemoryUsage,
    cleanSessionMessages,
    cleanAllSessionsMessages,
    closeInactiveSessions,
    checkMemoryLimits,
    getDetailedStats,
    startAutomaticCleanup,
    validateResourceLimits,
    MEMORY_LIMITS
};
// services/whatsapp.js
// Servicio para manejar las sesiones de WhatsApp

const { Client, LocalAuth } = require('whatsapp-web.js');

// Almacenar las sesiones activas
const activeSessions = new Map();

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
        try {
            // Obtener información del contacto
            const contact = await message.getContact();
            const chat = await message.getChat();
            
            // Determinar el nombre del remitente
            let senderName = contact.pushname || contact.name || contact.number;
            
            // Si es un grupo, obtener info adicional
            if (chat.isGroup) {
                const groupName = chat.name;
                console.log(`[${sessionId}] 📨 MENSAJE RECIBIDO EN GRUPO:`);
                console.log(`   👥 Grupo: ${groupName}`);
                console.log(`   👤 De: ${senderName} (${contact.number})`);
                console.log(`   💬 Mensaje: "${message.body}"`);
                console.log(`   🕐 Hora: ${new Date().toLocaleString()}`);
            } else {
                console.log(`[${sessionId}] 📨 MENSAJE RECIBIDO:`);
                console.log(`   👤 De: ${senderName} (${contact.number})`);
                console.log(`   💬 Mensaje: "${message.body}"`);
                console.log(`   🕐 Hora: ${new Date().toLocaleString()}`);
                
                // Mostrar tipo de mensaje si no es texto
                if (message.type !== 'chat') {
                    console.log(`   📎 Tipo: ${message.type}`);
                }
            }
            
            // Agregar separador visual
            console.log('   ' + '─'.repeat(50));
            
            const session = activeSessions.get(sessionId);
            if (session) {
                if (!session.messages) session.messages = [];
                session.messages.push({
                    from: message.from,
                    fromName: senderName,
                    body: message.body,
                    timestamp: new Date(),
                    type: 'received',
                    messageType: message.type,
                    isGroup: chat.isGroup,
                    groupName: chat.isGroup ? chat.name : null
                });
                session.lastActivity = new Date();
            }            
        } catch (error) {
            console.error(`[${sessionId}] Error procesando mensaje:`, error);
            console.log(`[${sessionId}] 📨 MENSAJE RECIBIDO (info básica):`);
            console.log(`   📞 De: ${message.from}`);
            console.log(`   💬 Mensaje: "${message.body}"`);
            console.log(`   🕐 Hora: ${new Date().toLocaleString()}`);
            console.log('   ' + '─'.repeat(50));
        }
    });

    client.on('disconnected', (reason) => {
        console.log(`[${sessionId}] Desconectado:`, reason);
        
        const session = activeSessions.get(sessionId);
        if (session) {
            session.status = 'disconnected';
            session.error = reason;
            session.lastActivity = new Date();
        }
    });

    return client;
}

async function createSession(sessionId) {
    // Verificar si la sesión ya existe
    if (activeSessions.has(sessionId)) {
        return activeSessions.get(sessionId);
    }

    // Crear nueva sesión
    const client = createWhatsAppSession(sessionId);
    
    // Almacenar información de la sesión
    const sessionData = {
        client: client,
        sessionId: sessionId,
        status: 'initializing',
        qrCode: null,
        createdAt: new Date(),
        lastActivity: new Date(),
        messages: []
    };

    activeSessions.set(sessionId, sessionData);

    // Inicializar el cliente
    await client.initialize();

    return sessionData;
}

async function sendMessage(sessionId, number, message) {
    const session = activeSessions.get(sessionId);
    
    if (!session) {
        throw new Error('Sesión no encontrada');
    }

    if (session.status !== 'connected') {
        throw new Error(`Sesión no está conectada. Estado: ${session.status}`);
    }

    const chatId = number.includes('@c.us') ? number : `${number}@c.us`;
    await session.client.sendMessage(chatId, message);
    
    // Log del mensaje enviado
    console.log(`[${sessionId}] 📤 MENSAJE ENVIADO:`);
    console.log(`   📞 Para: ${number}`);
    console.log(`   💬 Mensaje: "${message}"`);
    console.log(`   🕐 Hora: ${new Date().toLocaleString()}`);
    console.log('   ' + '─'.repeat(50));
    
    // Guardar mensaje enviado
    if (!session.messages) session.messages = [];
    session.messages.push({
        to: chatId,
        body: message,
        timestamp: new Date(),
        type: 'sent'
    });
    session.lastActivity = new Date();

    return true;
}



function getSession(sessionId) {
    return activeSessions.get(sessionId);
}

function getAllSessions() {
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

    return sessions;
}

// Agregar al final de services/whatsapp.js - Mejorar cierre de sesiones

const fs = require('fs');
const path = require('path');

async function destroySession(sessionId) {
    const session = activeSessions.get(sessionId);
    
    if (!session) {
        throw new Error('Sesión no encontrada');
    }

    try {
        console.log(`[${sessionId}] 🔄 Iniciando cierre completo de sesión...`);
        
        // Cerrar cliente con timeout
        const closePromise = session.client.destroy();
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout cerrando cliente')), 5000)
        );
        
        await Promise.race([closePromise, timeoutPromise]);
        console.log(`[${sessionId}] ✅ Cliente cerrado correctamente`);
        
    } catch (error) {
        console.warn(`[${sessionId}] ⚠️  Error cerrando cliente (continuando...):`, error.message);
    } finally {
        // Siempre remover de la lista de sesiones activas
        activeSessions.delete(sessionId);
        console.log(`[${sessionId}] 🗑️  Sesión removida de memoria`);
    }
    
    // Eliminar carpeta de sesión del disco
    try {
        const sessionPath = path.join('./sessions', sessionId);
        
        if (fs.existsSync(sessionPath)) {
            console.log(`[${sessionId}] 📁 Eliminando carpeta de sesión: ${sessionPath}`);
            
            // Eliminar recursivamente toda la carpeta
            fs.rmSync(sessionPath, { 
                recursive: true, 
                force: true 
            });
            
            console.log(`[${sessionId}] ✅ Carpeta de sesión eliminada completamente`);
        } else {
            console.log(`[${sessionId}] 📝 No hay carpeta de sesión que eliminar`);
        }
        
    } catch (error) {
        console.error(`[${sessionId}] ❌ Error eliminando carpeta de sesión:`, error.message);
        // No lanzar error aquí, la sesión ya fue cerrada exitosamente
    }
    
    return true;
}

// Función para cerrar todas las sesiones
async function destroyAllSessions() {
    const sessionIds = Array.from(activeSessions.keys());
    console.log(`[WHATSAPP] 🔄 Cerrando ${sessionIds.length} sesión(es) activa(s)...`);
    
    const closePromises = sessionIds.map(sessionId => 
        destroySession(sessionId).catch(error => 
            console.error(`[${sessionId}] ❌ Error cerrando:`, error.message)
        )
    );
    
    await Promise.allSettled(closePromises);
    console.log('[WHATSAPP] ✅ Todas las sesiones procesadas');
}

// Función para limpiar carpetas huérfanas (carpetas sin sesión activa)
function cleanOrphanedSessionFolders() {
    try {
        const sessionsPath = './sessions';
        
        if (!fs.existsSync(sessionsPath)) {
            console.log('[WHATSAPP] 📁 Carpeta sessions no existe');
            return 0;
        }
        
        const folders = fs.readdirSync(sessionsPath, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);
        
        let cleaned = 0;
        
        folders.forEach(folderName => {
            // Si la carpeta no tiene una sesión activa, es huérfana
            if (!activeSessions.has(folderName)) {
                try {
                    const folderPath = path.join(sessionsPath, folderName);
                    fs.rmSync(folderPath, { recursive: true, force: true });
                    console.log(`[WHATSAPP] 🗑️  Eliminada carpeta huérfana: ${folderName}`);
                    cleaned++;
                } catch (error) {
                    console.error(`[WHATSAPP] ❌ Error eliminando carpeta huérfana ${folderName}:`, error.message);
                }
            }
        });
        
        if (cleaned > 0) {
            console.log(`[WHATSAPP] 🧹 Limpieza completada: ${cleaned} carpeta(s) huérfana(s) eliminada(s)`);
        }
        
        return cleaned;
        
    } catch (error) {
        console.error('[WHATSAPP] ❌ Error limpiando carpetas huérfanas:', error.message);
        return 0;
    }
}
async function closeSoftSession(sessionId) {
    const session = activeSessions.get(sessionId);
    
    if (!session) {
        console.log(`[${sessionId}] ⚠️  Sesión no encontrada para cierre suave`);
        return false;
    }

    try {
        console.log(`[${sessionId}] 🔄 Iniciando cierre suave (preservando datos)...`);
        
        // Cerrar cliente con timeout
        const closePromise = session.client.destroy();
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout cerrando cliente')), 5000)
        );
        
        await Promise.race([closePromise, timeoutPromise]);
        console.log(`[${sessionId}] ✅ Cliente cerrado correctamente`);
        
    } catch (error) {
        console.warn(`[${sessionId}] ⚠️  Error cerrando cliente (continuando...):`, error.message);
    } finally {
        // Remover SOLO de la lista de sesiones activas
        activeSessions.delete(sessionId);
        console.log(`[${sessionId}] 🗑️  Sesión removida de memoria`);
    }
    
    // 🔧 CLAVE: NO eliminar carpeta del disco - datos preservados para recuperación
    console.log(`[${sessionId}] 💾 Datos de sesión preservados en ./sessions/${sessionId}`);
    
    return true;
}

// 🔧 FUNCIÓN MEJORADA: destroySession con opción de preservar datos
async function destroySessionWithOptions(sessionId, preserveData = true) {
    const session = activeSessions.get(sessionId);
    
    if (!session) {
        throw new Error('Sesión no encontrada');
    }

    try {
        console.log(`[${sessionId}] 🔄 Iniciando cierre completo de sesión...`);
        
        // Cerrar cliente con timeout
        const closePromise = session.client.destroy();
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout cerrando cliente')), 5000)
        );
        
        await Promise.race([closePromise, timeoutPromise]);
        console.log(`[${sessionId}] ✅ Cliente cerrado correctamente`);
        
    } catch (error) {
        console.warn(`[${sessionId}] ⚠️  Error cerrando cliente (continuando...):`, error.message);
    } finally {
        // Siempre remover de la lista de sesiones activas
        activeSessions.delete(sessionId);
        console.log(`[${sessionId}] 🗑️  Sesión removida de memoria`);
    }
    
    // 🔧 NUEVA LÓGICA: Solo eliminar carpeta si se especifica explícitamente
    if (!preserveData) {
        try {
            const sessionPath = path.join('./sessions', sessionId);
            
            if (fs.existsSync(sessionPath)) {
                console.log(`[${sessionId}] 📁 Eliminando carpeta de sesión: ${sessionPath}`);
                
                fs.rmSync(sessionPath, { 
                    recursive: true, 
                    force: true 
                });
                
                console.log(`[${sessionId}] ✅ Carpeta de sesión eliminada completamente`);
            }
            
        } catch (error) {
            console.error(`[${sessionId}] ❌ Error eliminando carpeta de sesión:`, error.message);
        }
    } else {
        console.log(`[${sessionId}] 💾 Datos de sesión preservados para recuperación futura`);
    }
    
    return true;
}
const originalDestroySession = destroySession;

async function destroySession(sessionId, preserveData = true) {
    return await destroySessionWithOptions(sessionId, preserveData);
}

// EXPORTAR las nuevas funciones
module.exports = {
    createSession,
    sendMessage,
    destroySession,
    destroySessionWithOptions, // 🔧 Nueva función
    closeSoftSession,          // 🔧 Nueva función
    destroyAllSessions, 
    cleanOrphanedSessionFolders,
    getSession,
    getAllSessions,
    activeSessions
};




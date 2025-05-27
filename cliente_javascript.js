async function getQRWithRetry(sessionId, maxRetries = 10) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const response = await fetch(`/api/qr/${sessionId}`);
            const data = await response.json();
            
            if (data.success && data.qrCode) {
                return data.qrCode;
            }
            
            // Esperar el tiempo sugerido por el servidor
            const delay = (data.retry_after || 3) * 1000;
            console.log(`Intento ${i + 1}: ${data.message}. Reintentando en ${delay/1000}s...`);
            
            await new Promise(resolve => setTimeout(resolve, delay));
            
        } catch (error) {
            console.error('Error:', error);
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
    }
    
    throw new Error('No se pudo obtener el QR después de varios intentos');
}

// Uso:
getQRWithRetry('ses_1234567')
    .then(qr => console.log('QR obtenido:', qr))
    .catch(err => console.error('Error:', err));
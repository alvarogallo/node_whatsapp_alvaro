<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Generador QR WhatsApp - Automático</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        
        .container {
            background: white;
            border-radius: 20px;
            padding: 40px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            max-width: 700px;
            width: 100%;
            text-align: center;
        }
        
        h1 {
            color: #333;
            margin-bottom: 10px;
            font-size: 2.5rem;
        }
        
        .subtitle {
            color: #666;
            margin-bottom: 30px;
            font-size: 1.1rem;
        }
        
        .qr-status {
            padding: 15px;
            border-radius: 10px;
            margin-bottom: 20px;
            font-weight: 600;
        }
        
        .qr-status.loading {
            background: #fff3cd;
            border: 1px solid #ffeaa7;
            color: #856404;
        }
        
        .qr-status.success {
            background: #d4edda;
            border: 1px solid #c3e6cb;
            color: #155724;
        }
        
        .qr-status.error {
            background: #f8d7da;
            border: 1px solid #f5c6cb;
            color: #721c24;
        }
        
        .input-section {
            margin-bottom: 30px;
        }
        
        .input-group {
            display: flex;
            gap: 10px;
            margin-bottom: 15px;
        }
        
        input[type="text"] {
            flex: 1;
            padding: 15px;
            border: 2px solid #e1e5e9;
            border-radius: 10px;
            font-size: 16px;
            transition: border-color 0.3s;
        }
        
        input[type="text"]:focus {
            outline: none;
            border-color: #667eea;
        }
        
        button {
            padding: 15px 25px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 10px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.2s, box-shadow 0.2s;
        }
        
        button:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 20px rgba(102, 126, 234, 0.3);
        }
        
        .quick-buttons {
            display: flex;
            gap: 10px;
            justify-content: center;
            flex-wrap: wrap;
            margin-bottom: 20px;
        }
        
        .quick-btn {
            padding: 10px 15px;
            background: #f8f9fa;
            border: 1px solid #e1e5e9;
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.2s;
            font-size: 14px;
        }
        
        .quick-btn:hover {
            background: #e9ecef;
            border-color: #667eea;
        }
        
        .status {
            margin: 20px 0;
            padding: 15px;
            border-radius: 10px;
            font-weight: 600;
        }
        
        .status.loading {
            background: #fff3cd;
            color: #856404;
            border: 1px solid #ffeaa7;
        }
        
        .status.success {
            background: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
        }
        
        .status.error {
            background: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
        }
        
        .qr-section {
            margin-top: 30px;
        }
        
        .qr-visual-display {
            background: #f8f9fa;
            border: 2px solid #e9ecef;
            border-radius: 10px;
            padding: 20px;
            margin: 20px 0;
            min-height: 280px;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
        }
        
        .qr-visual-display canvas {
            border-radius: 10px;
            box-shadow: 0 5px 15px rgba(0,0,0,0.1);
        }
        
        .qr-not-available {
            color: #6c757d;
            font-style: italic;
            padding: 40px;
            text-align: center;
        }
        
        .qr-text-display {
            background: #f8f9fa;
            border: 2px solid #e9ecef;
            border-radius: 10px;
            padding: 20px;
            margin: 20px 0;
            min-height: 120px;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
        }
        
        .qr-text-content {
            font-family: 'Courier New', monospace;
            font-size: 14px;
            word-break: break-all;
            background: white;
            padding: 15px;
            border-radius: 5px;
            border: 1px solid #dee2e6;
            width: 100%;
            max-height: 200px;
            overflow-y: auto;
            margin: 10px 0;
        }
        
        .copy-button {
            background: linear-gradient(135deg, #28a745 0%, #1e7e34 100%);
            margin-top: 10px;
        }
        
        .qr-alternatives {
            background: #e7f3ff;
            border: 1px solid #b8daff;
            border-radius: 10px;
            padding: 20px;
            margin-top: 20px;
            text-align: left;
        }
        
        .qr-alternatives h3 {
            color: #0056b3;
            margin-bottom: 15px;
            text-align: center;
        }
        
        .qr-alternatives ul {
            margin-left: 20px;
        }
        
        .qr-alternatives li {
            margin: 8px 0;
            color: #495057;
        }
        
        .qr-alternatives a {
            color: #0056b3;
            text-decoration: none;
        }
        
        .qr-alternatives a:hover {
            text-decoration: underline;
        }
        
        .session-info {
            background: #e7f3ff;
            border: 1px solid #b8daff;
            border-radius: 10px;
            padding: 15px;
            margin: 20px 0;
        }
        
        .session-info h3 {
            color: #0056b3;
            margin-bottom: 10px;
        }
        
        .session-info p {
            color: #495057;
            margin: 5px 0;
        }
        
        @media (max-width: 600px) {
            .container {
                padding: 20px;
            }
            
            h1 {
                font-size: 2rem;
            }
            
            .input-group {
                flex-direction: column;
            }
            
            .quick-buttons {
                flex-direction: column;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>📱 Generador QR WhatsApp</h1>
        <p class="subtitle">Detección automática de capacidades QR</p>
        
        <div id="qrLibraryStatus" class="qr-status loading">
            🔄 Detectando capacidad para mostrar códigos QR...
        </div>
        
        <div class="input-section">
            <div class="input-group">
                <input type="text" id="apiUrl" placeholder="https://nodewhatsappalvaro-production.up.railway.app/api/qr/ses_123456" 
                       value="https://nodewhatsappalvaro-production.up.railway.app/api/qr/">
                <button onclick="fetchQR()">🔄 Obtener QR</button>
                <button onclick="deleteSession()" style="background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%);">🗑️ Borrar</button>
            </div>
            
            <div class="quick-buttons">
                <div class="quick-btn" onclick="setQuickUrl('ses_123456')">📱 Sesión 1</div>
                <div class="quick-btn" onclick="setQuickUrl('ses_789012')">📱 Sesión 2</div>
                <div class="quick-btn" onclick="setQuickUrl('ses_' + Date.now())">🆕 Nueva Sesión</div>
            </div>
        </div>
        
        <div id="status" class="status" style="display: none;"></div>
        
        <div class="qr-section">
            <!-- QR Visual (si está disponible) -->
            <div id="qrVisualDisplay" class="qr-visual-display" style="display: none;">
                <h3>📱 Código QR Visual:</h3>
                <div id="qrVisualContent">
                    <p style="color: #666;">El código QR aparecerá aquí...</p>
                </div>
            </div>
            
            <!-- Mensaje de QR no disponible -->
            <div id="qrNotAvailable" class="qr-visual-display qr-not-available" style="display: none;">
                <h3>❌ No se puede mostrar QR visual</h3>
                <p>Tu red no permite cargar librerías externas, pero puedes usar el método manual abajo.</p>
            </div>
            
            <!-- QR Manual (siempre disponible) -->
            <div id="qrTextDisplay" class="qr-text-display" style="display: none;">
                <h3>📋 Texto del Código QR (Método Manual):</h3>
                <div id="qrTextContent" class="qr-text-content"></div>
                <button onclick="copyQRText()" class="copy-button">📋 Copiar Texto</button>
            </div>
            
            <div id="sessionInfo" class="session-info" style="display: none;">
                <h3>ℹ️ Información de la Sesión</h3>
                <p><strong>ID de Sesión:</strong> <span id="sessionId">-</span></p>
                <p><strong>Estado:</strong> <span id="sessionStatus">-</span></p>
                <p><strong>Método QR:</strong> <span id="qrMethod">-</span></p>
                <p><strong>Última Actualización:</strong> <span id="lastUpdate">-</span></p>
            </div>
        </div>
        
        <div class="qr-alternatives">
            <h3>🛠️ Cómo usar el código QR:</h3>
            <div id="qrInstructions">
                <!-- Se llenará dinámicamente según las capacidades -->
            </div>
        </div>
    </div>

    <script>
        let qrLibraryAvailable = false;
        let QRCode = null;

        function updateQRStatus(message, type, method = null) {
            const status = document.getElementById('qrLibraryStatus');
            status.textContent = message;
            status.className = `qr-status ${type}`;
            
            if (method) {
                document.getElementById('qrMethod').textContent = method;
            }
            
            updateInstructions();
        }

        function updateInstructions() {
            const instructions = document.getElementById('qrInstructions');
            
            if (qrLibraryAvailable) {
                instructions.innerHTML = `
                    <ul>
                        <li><strong>Visual:</strong> El código QR se muestra automáticamente arriba - solo escanéalo con WhatsApp</li>
                        <li><strong>Manual:</strong> También puedes copiar el texto y pegarlo en generadores QR externos</li>
                        <li><strong>WhatsApp directo:</strong> Ve a WhatsApp → Configuración → Dispositivos vinculados → Vincular dispositivo</li>
                    </ul>
                `;
            } else {
                instructions.innerHTML = `
                    <ul>
                        <li><strong>Opción 1:</strong> Copia el texto de arriba y pégalo en <a href="https://qr-code-generator.com/" target="_blank">qr-code-generator.com</a></li>
                        <li><strong>Opción 2:</strong> Usa <a href="https://www.qr-code-generator.org/" target="_blank">qr-code-generator.org</a></li>
                        <li><strong>Opción 3:</strong> Busca "generador QR online" en Google</li>
                        <li><strong>Opción 4:</strong> Usa una app móvil generadora de QR</li>
                        <li><strong>Opción 5:</strong> Desde tu teléfono, ve a WhatsApp → Configuración → Dispositivos vinculados → Vincular dispositivo</li>
                    </ul>
                `;
            }
        }

        function loadQRLibrary() {
            updateQRStatus('🔄 Intentando cargar librería QR...', 'loading');
            
            const cdns = [
                'https://cdnjs.cloudflare.com/ajax/libs/qrcode/1.5.3/qrcode.min.js',
                'https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js',
                'https://unpkg.com/qrcode@1.5.3/build/qrcode.min.js'
            ];
            
            let cdnIndex = 0;
            
            function tryNextCDN() {
                if (cdnIndex >= cdns.length) {
                    qrLibraryAvailable = false;
                    updateQRStatus('❌ No se puede mostrar QR visual - Red corporativa detectada', 'error', 'Manual');
                    document.getElementById('qrNotAvailable').style.display = 'block';
                    return;
                }
                
                const script = document.createElement('script');
                script.src = cdns[cdnIndex];
                
                script.onload = () => {
                    if (typeof window.QRCode !== 'undefined') {
                        QRCode = window.QRCode;
                        qrLibraryAvailable = true;
                        updateQRStatus('✅ QR visual disponible - Librería cargada correctamente', 'success', 'Visual + Manual');
                        document.getElementById('qrVisualDisplay').style.display = 'block';
                    } else {
                        cdnIndex++;
                        tryNextCDN();
                    }
                };
                
                script.onerror = () => {
                    cdnIndex++;
                    tryNextCDN();
                };
                
                document.head.appendChild(script);
            }
            
            tryNextCDN();
        }

        function showStatus(message, type = 'loading') {
            const status = document.getElementById('status');
            status.textContent = message;
            status.className = `status ${type}`;
            status.style.display = 'block';
        }

        function hideStatus() {
            document.getElementById('status').style.display = 'none';
        }

        function setQuickUrl(sessionId) {
            const baseUrl = document.getElementById('apiUrl').value.split('/api/qr/')[0];
            document.getElementById('apiUrl').value = `${baseUrl}/api/qr/${sessionId}`;
        }

        function displayQRVisual(qrText) {
            if (!qrLibraryAvailable || !QRCode) return false;
            
            const container = document.getElementById('qrVisualContent');
            container.innerHTML = '';
            
            QRCode.toCanvas(qrText, {
                width: 256,
                height: 256,
                colorDark: '#000000',
                colorLight: '#ffffff',
                correctLevel: QRCode.CorrectLevel.M
            }, function (error, canvas) {
                if (error) {
                    console.error('Error generando QR visual:', error);
                    container.innerHTML = '<p style="color: #dc3545;">❌ Error generando código QR visual</p>';
                    return;
                }
                
                container.appendChild(canvas);
            });
            
            return true;
        }

        function displayQRText(qrText, sessionInfo = null) {
            // Mostrar texto QR (siempre disponible)
            const display = document.getElementById('qrTextDisplay');
            const content = document.getElementById('qrTextContent');
            
            content.textContent = qrText;
            display.style.display = 'block';
            
            // Intentar mostrar QR visual si está disponible
            if (qrLibraryAvailable) {
                displayQRVisual(qrText);
            }
            
            // Mostrar información de la sesión
            if (sessionInfo) {
                document.getElementById('sessionId').textContent = sessionInfo.sessionId || '-';
                document.getElementById('sessionStatus').textContent = sessionInfo.status || '-';
                document.getElementById('lastUpdate').textContent = new Date().toLocaleString();
                document.getElementById('sessionInfo').style.display = 'block';
            }
            
            const method = qrLibraryAvailable ? '✅ QR visual generado + texto disponible' : '✅ Texto QR obtenido - Usa método manual';
            showStatus(method, 'success');
        }

        function copyQRText() {
            const content = document.getElementById('qrTextContent');
            const text = content.textContent;
            
            if (navigator.clipboard) {
                navigator.clipboard.writeText(text).then(() => {
                    showStatus('✅ Texto QR copiado al portapapeles', 'success');
                    setTimeout(hideStatus, 2000);
                }).catch(() => {
                    fallbackCopy(text);
                });
            } else {
                fallbackCopy(text);
            }
        }

        function fallbackCopy(text) {
            const textArea = document.createElement('textarea');
            textArea.value = text;
            textArea.style.position = 'fixed';
            textArea.style.left = '-999999px';
            textArea.style.top = '-999999px';
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            
            try {
                document.execCommand('copy');
                showStatus('✅ Texto QR copiado al portapapeles', 'success');
                setTimeout(hideStatus, 2000);
            } catch (err) {
                showStatus('❌ No se pudo copiar. Selecciona y copia manualmente.', 'error');
            }
            
            document.body.removeChild(textArea);
        }

        async function deleteSession() {
            const url = document.getElementById('apiUrl').value.trim();
            
            if (!url) {
                showStatus('❌ Por favor ingresa una URL válida', 'error');
                return;
            }
            
            const sessionId = url.split('/api/qr/')[1];
            if (!sessionId) {
                showStatus('❌ No se pudo extraer el ID de sesión de la URL', 'error');
                return;
            }
            
            if (!confirm(`¿Estás seguro de que quieres borrar la sesión "${sessionId}"?`)) {
                return;
            }
            
            try {
                showStatus('🗑️ Eliminando sesión...', 'loading');
                
                const baseUrl = url.split('/api/qr/')[0];
                const deleteUrl = `${baseUrl}/api/session/${sessionId}`;
                
                const response = await fetch(deleteUrl, {
                    method: 'DELETE',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    }
                });
                
                const data = await response.json();
                
                if (data.success) {
                    showStatus(`✅ Sesión "${sessionId}" eliminada correctamente`, 'success');
                    
                    document.getElementById('qrTextDisplay').style.display = 'none';
                    document.getElementById('qrVisualDisplay').style.display = qrLibraryAvailable ? 'block' : 'none';
                    document.getElementById('qrVisualContent').innerHTML = '<p style="color: #666;">El código QR aparecerá aquí...</p>';
                    document.getElementById('sessionInfo').style.display = 'none';
                    
                } else {
                    const message = data.error || 'No se pudo eliminar la sesión';
                    showStatus(`❌ ${message}`, 'error');
                }
                
            } catch (error) {
                console.error('Error:', error);
                showStatus('❌ Error de conexión eliminando sesión', 'error');
            }
        }

        async function fetchQR() {
            const url = document.getElementById('apiUrl').value.trim();
            
            if (!url) {
                showStatus('❌ Por favor ingresa una URL válida', 'error');
                return;
            }

            try {
                showStatus('🔄 Obteniendo código QR...', 'loading');
                
                const waitUrl = url + (url.includes('?') ? '&' : '?') + 'wait=true';
                
                const response = await fetch(waitUrl, {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json'
                    }
                });
                
                const data = await response.json();
                
                if (data.success && data.qrCode) {
                    displayQRText(data.qrCode, {
                        sessionId: data.sessionId,
                        status: data.status
                    });
                } else {
                    const message = data.message || 'No se pudo obtener el código QR';
                    showStatus(`⚠️ ${message}`, 'error');
                    
                    if (data.retry_after) {
                        setTimeout(() => {
                            fetchQR();
                        }, data.retry_after * 1000);
                    }
                }
                
            } catch (error) {
                console.error('Error:', error);
                showStatus('❌ Error de conexión. Verifica que el servidor esté corriendo.', 'error');
            }
        }

        document.getElementById('apiUrl').addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                fetchQR();
            }
        });

        // Inicializar al cargar la página
        window.addEventListener('load', function() {
            // Configurar URL por defecto
            const input = document.getElementById('apiUrl');
            if (!input.value.includes('ses_')) {
                input.value = 'https://nodewhatsappalvaro-production.up.railway.app/api/qr/ses_' + Date.now().toString().slice(-6);
            }
            
            // Detectar capacidades QR
            loadQRLibrary();
        });
    </script>
</body>
</html>
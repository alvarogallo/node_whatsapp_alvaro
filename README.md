# node_whatsapp_alvaro

Debemos cambiar la ruta get para crear token a POST y colocarle una clave.


curl http://localhost:3000/api/qr/ses_1234567  respuesta inmediata

espera maximo 30 segundos

curl "http://localhost:3000/api/qr/ses_1234567?wait=true"



proyecto/
├── index.js (archivo principal limpio)
├── routes/
│   ├── auth.js (login, logout)
│   ├── dashboard.js (rutas protegidas)
│   └── api.js (rutas públicas)
├── middleware/
│   └── auth.js (middleware de autenticación)
├── services/
│   └── whatsapp.js (lógica de WhatsApp)
├── sessions/ (ignorado en git)
└── views/
    ├── login.ejs
    ├── home.ejs
    ├── dashboard.ejs
    └── session-detail.ejs
    

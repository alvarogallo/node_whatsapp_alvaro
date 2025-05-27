// routes/auth.js
// Rutas de autenticación: login, logout, página principal

const express = require('express');
const router = express.Router();

// Ruta principal
router.get('/', (req, res) => {
    if (req.session.token) {
        res.render('home', { token: req.session.token });
    } else {
        res.render('login', { error: null });
    }
});

// Procesar login
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    console.log("Intentando login con:", email, password);
      
    try {
        if (email === 'alvarogallo@hotmail.com' && password === 'colombia') {
            console.log("Credenciales correctas");
            req.session.token = 'fake-token-123456';
            return res.redirect('/dashboard');
        } else {
            console.log("Credenciales incorrectas");
            return res.render('login', { error: 'Credenciales inválidas' });
        }
    } catch (error) {
        console.error("Error en el login:", error);
        return res.render('login', { error: 'Login inválido' });
    }
});

// Logout
router.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/');
    });
});

module.exports = router;
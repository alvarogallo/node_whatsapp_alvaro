// middleware/auth.js
// Middleware para verificar autenticación

function requireAuth(req, res, next) {
    if (req.session.token) {
        next();
    } else {
        res.redirect('/');
    }
}

module.exports = {
    requireAuth
};
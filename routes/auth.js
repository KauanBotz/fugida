const express = require('express');
const passport = require('passport');
const router = express.Router();

// @desc    Auth com Google
// @route   GET /auth/google
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

// @desc    Callback do Google
// @route   GET /auth/google/callback
router.get('/google/callback', 
    passport.authenticate('google', { failureRedirect: '/' }),
    (req, res) => {
        // Login com sucesso
        res.redirect('/');
    }
);

// @desc    Logout
// @route   GET /auth/logout
router.get('/logout', (req, res, next) => {
    req.logout((err) => {
        if (err) { return next(err); }
        res.redirect('/');
    });
});

module.exports = router;
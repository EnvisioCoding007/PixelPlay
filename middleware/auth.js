import User from '../models/User.js';

// ── User Auth Guards ───────────────────────────────────────────────────────

/**
 * isUserAuth — guards every user-facing protected route.
 * Performs a live DB lookup on each request so that a blocked or deleted
 * account is ejected immediately, even if their session cookie is still valid.
 */
export const isUserAuth = async (req, res, next) => {
    if (!req.session.user) {
        return res.redirect('/auth/login');
    }
    try {
        const user = await User.findById(req.session.user)
            .select('is_blocked')
            .lean();

        if (!user || user.is_blocked) {
            // Destroy the stale / revoked session before redirecting
            req.session.destroy(() => {});
            return res.redirect('/auth/login');
        }

        next();
    } catch (err) {
        console.error('[isUserAuth]', err);
        res.redirect('/auth/login');
    }
};

export const isUserUnAuth = (req, res, next) => {
    if (req.session.user) {
        res.redirect('/home');
    } else {
        next();
    }
};

// ── Admin Auth Guards ──────────────────────────────────────────────────────

/**
 * isAdminAuth — protects all admin routes.
 * Admin login stores { _id, role } on req.session.user so we can check role
 * without an extra DB round-trip on every request.
 * For AJAX / fetch requests it returns 401 JSON instead of an HTML redirect
 * so the client-side handler can show a proper error rather than crashing on
 * an unexpected HTML response.
 */
export const isAdminAuth = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'admin') {
        next();
    } else {
        const isAjax =
            req.xhr ||
            req.headers['x-requested-with'] === 'XMLHttpRequest' ||
            (req.headers['accept'] && req.headers['accept'].includes('application/json'));

        if (isAjax) {
            return res.status(401).json({
                success: false,
                message: 'Session expired. Please log in again.',
            });
        }
        res.redirect('/admin/login');
    }
};

/**
 * isAdminUnAuth — bounces already-authenticated admins away from the login page.
 */
export const isAdminUnAuth = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'admin') {
        res.redirect('/admin/users');
    } else {
        next();
    }
};
import express from 'express';
import morgan from 'morgan';
import { createServer } from 'http';
import 'dotenv/config';
import connectDB from './db.js';
import path from 'path';
import { fileURLToPath } from 'url';
import methodOverride from 'method-override';
import { initSocket } from './config/socket.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

await connectDB();

const app = express();
const server = createServer(app);
const port = process.env.PORT || 4090;

app.use(morgan('dev'));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname, 'public')));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

import passport from './config/passport.js';
import session from 'express-session';
import { injectCartCount } from './middleware/cartMiddleware.js';
import { injectNotificationCount } from './middleware/notificationMiddleware.js';

const sessionMiddleware = session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false,
        httpOnly: true
    }
});

app.use(sessionMiddleware);
initSocket(server, sessionMiddleware);

app.use(passport.initialize());

app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-cache, private, no-store, must-revalidate, max-stale=0, post-check=0, pre-check=0');
    next();
});

app.use(injectCartCount);
app.use(injectNotificationCount);

import userRoutes from './routes/userRoutes.js';
import adminRoutes from './routes/adminRoutes.js';

app.use('/', adminRoutes);
app.use('/', userRoutes);

// Catch-all 404 Handler
app.use((req, res) => {
    const isAdminContext = req.originalUrl.startsWith('/admin');
    res.status(404).render('404', {
        title: '404 - Page Not Found | PixelPlay',
        isAdminContext,
        url: req.originalUrl
    });
});

// Centralized Global Error Handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    console.error('[Global Error Handler]:', err);
    const isAjax = req.xhr || req.headers['accept']?.includes('application/json');
    const statusCode = err.status || err.statusCode || 500;
    if (isAjax) {
        return res.status(statusCode).json({
            success: false,
            message: err.message || 'An unexpected internal error occurred.'
        });
    }
    const isAdminContext = req.originalUrl.startsWith('/admin');
    res.status(statusCode).render('404', {
        title: `${statusCode} - Server Error | PixelPlay`,
        isAdminContext,
        url: req.originalUrl
    });
});

server.listen(port, () => {
    console.log(`PixelPlay is running on\nhttp://localhost:${port}`);
});
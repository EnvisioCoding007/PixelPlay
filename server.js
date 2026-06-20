import express from 'express';
import 'dotenv/config';
import connectDB from './db.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

await connectDB();

const app = express();
const port = process.env.PORT || 4070;

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

import passport from './config/passport.js';
import session from 'express-session';


import Cart from './models/Cart.js';

app.use(session({
    secret: process.env.SESSION_SECRET || 'the_forebidden_key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false,
        httpOnly: true
    }
}));

app.use(passport.initialize());

app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-cache, private, no-store, must-revalidate, max-stale=0, post-check=0, pre-check=0');
    next();
});

app.use(async (req, res, next) => {
    res.locals.cartCount = 0;
    if (req.session && req.session.user) {
        try {
            const userId = req.session.user.id || req.session.user;
            const cart = await Cart.findOne({ userId });
            if (cart && cart.items) {
                res.locals.cartCount = cart.items.reduce((acc, item) => acc + item.quantity, 0);
            }
        } catch (err) {
            console.error('Error fetching cart count:', err);
        }
    }
    next();
});

import userRoutes from './routes/userRoutes.js';
import adminRoutes from './routes/adminRoutes.js';

app.use('/', userRoutes);
app.use('/', adminRoutes);

app.listen(port, () => {
    console.log(`PixelPlay is running on\nhttp://localhost:${port}`);
});
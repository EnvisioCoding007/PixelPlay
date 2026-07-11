import express from 'express';
import 'dotenv/config';
import connectDB from './db.js';
import path from 'path';
import { fileURLToPath } from 'url';
import methodOverride from 'method-override';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

await connectDB();

const app = express();
const port = process.env.PORT || 4090;

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname, 'public')));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

import passport from './config/passport.js';
import session from 'express-session';
import { injectCartCount } from './middleware/cartMiddleware.js';

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

app.use(injectCartCount);

import userRoutes from './routes/userRoutes.js';
import adminRoutes from './routes/adminRoutes.js';

app.use('/', userRoutes);
app.use('/', adminRoutes);

app.listen(port, () => {
    console.log(`PixelPlay is running on\nhttp://localhost:${port}`);
});
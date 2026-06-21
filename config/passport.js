import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import * as userService from '../services/userService.js';

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: '/auth/google/callback'
}, async (accessToken, refreshToken, profile, done) => {
    try {
        const user = await userService.handleGoogleAuth(profile);
        return done(null, user);
    } catch (error) {
        if (error.isBlocked) {
            return done(null, false, { message: error.message });
        }
        return done(error, null);
    }
}));

export default passport;
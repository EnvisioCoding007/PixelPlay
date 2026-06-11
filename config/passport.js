import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import User from '../models/User.js';

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "/auth/google/callback"
}, async (accessToken, refreshToken, profile, done) => {
    try {
        let user = await User.findOne({ email: profile.emails[0].value });

        if (user) {
            user.last_login_at = new Date();
            await user.save();
            return done(null, user);
        }

        user = new User({
            username: profile.displayName,
            email: profile.emails[0].value,
            is_verified: true,
            last_login_at: new Date()
        });

        await user.save();
        return done(null, user);
    } catch (error) {
        return done(error, null);
    }
}));

export default passport;
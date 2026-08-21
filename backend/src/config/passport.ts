import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { appConfig } from './app';
import prisma from '../database/prisma';

// Extend Express User type
declare global {
  namespace Express {
    interface User {
      id: string;
    }
  }
}

passport.use(
  new GoogleStrategy(
    {
      clientID: appConfig.googleClientId,
      clientSecret: appConfig.googleClientSecret,
      callbackURL: appConfig.googleCallbackUrl,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value || '';
        const name = profile.displayName;
        const avatarUrl = profile.photos?.[0]?.value || '';

        // Upsert user based on googleId
        const user = await prisma.user.upsert({
          where: { googleId: profile.id },
          update: {
            name,
            email,
            avatarUrl,
          },
          create: {
            googleId: profile.id,
            name,
            email,
            avatarUrl,
          },
        });

        return done(null, { id: user.id });
      } catch (error) {
        return done(error as Error, undefined);
      }
    }
  )
);

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      return done(null, false);
    }
    done(null, { id: user.id });
  } catch (error) {
    done(error, false);
  }
});

export default passport;

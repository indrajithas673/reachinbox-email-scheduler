import { Router } from 'express';
import passport from 'passport';
import { requireAuth } from '../../middlewares/auth.middleware';
import prisma from '../../database/prisma';
import { appConfig } from '../../config/app';

const router = Router();

// Initiate Google OAuth
router.get(
  '/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

// Google OAuth Callback
router.get(
  '/google/callback',
  passport.authenticate('google', { failureRedirect: `${appConfig.frontendUrl}/login?error=auth_failed` }),
  (req, res) => {
    // Successful authentication, redirect to dashboard.
    res.redirect(`${appConfig.frontendUrl}/dashboard`);
  }
);

// TEMPORARY DEV LOGIN
router.get('/dev-login', async (req, res) => {
  const user = await prisma.user.upsert({
    where: { email: 'dev@example.com' },
    update: {},
    create: {
      googleId: 'dev-google-id',
      name: 'Dev User',
      email: 'dev@example.com',
      avatarUrl: 'https://ui-avatars.com/api/?name=Dev+User'
    }
  });
  req.login({ id: user.id }, (err) => {
    if (err) return res.status(500).send(err);
    res.redirect(`${appConfig.frontendUrl}/dashboard`);
  });
});

// Get currently authenticated user
router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        name: true,
        email: true,
        avatarUrl: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Logout
router.post('/logout', requireAuth, (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    
    req.session.destroy((err) => {
      if (err) return next(err);
      res.clearCookie('connect.sid'); // default express-session cookie name
      return res.json({ message: 'Logged out successfully' });
    });
  });
});

export default router;

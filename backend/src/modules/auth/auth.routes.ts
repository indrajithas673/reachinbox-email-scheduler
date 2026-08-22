import { Router } from 'express';
import passport from 'passport';
import jwt from 'jsonwebtoken';
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
    // Generate JWT token for cross-domain authentication to bypass browser cookie blocking
    const token = jwt.sign(
      { id: (req.user as any).id, email: (req.user as any).email }, 
      appConfig.sessionSecret, 
      { expiresIn: '7d' }
    );
    res.redirect(`${appConfig.frontendUrl}/dashboard?token=${token}`);
  }
);

// Dev backdoor for automated browser recording
router.get('/dev-login', async (req, res) => {
  let user = await prisma.user.findFirst({ where: { email: 'dev@reachinbox.test' } });
  if (!user) {
    user = await prisma.user.create({ data: { email: 'dev@reachinbox.test', googleId: 'dev-id', name: 'Dev Demo User' } });
  }
  const token = jwt.sign(
    { id: user.id, email: user.email }, 
    appConfig.sessionSecret, 
    { expiresIn: '7d' }
  );
  res.redirect(`${appConfig.frontendUrl}/dashboard?token=${token}`);
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

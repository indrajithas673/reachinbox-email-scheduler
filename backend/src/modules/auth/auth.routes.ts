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
  async (req, res) => {
    // Auto-inject a test sender for the demo if they don't have one
    const user = req.user as any;
    if (user && user.id) {
      const existingSender = await prisma.sender.findFirst({ where: { userId: user.id } });
      if (!existingSender) {
        await prisma.sender.create({
          data: {
            userId: user.id,
            senderEmail: 'reachinbox.test@ethereal.email',
            displayName: 'Test Account',
            etherealUsername: 'wa2drwo5batyagbe@ethereal.email',
            etherealPassword: 'RjYrauCvX3vPcpaNm7'
          }
        });
      }
    }

    // Generate JWT token for cross-domain authentication to bypass browser cookie blocking
    const token = jwt.sign(
      { id: user.id, email: user.email }, 
      appConfig.sessionSecret, 
      { expiresIn: '7d' }
    );
    res.redirect(`${appConfig.frontendUrl}/dashboard?token=${token}`);
  }
);

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

// Temporary endpoint to auto-seed a test sender for the demo
router.get('/auto-seed-sender', async (req, res) => {
  try {
    const user = await prisma.user.findFirst({ orderBy: { createdAt: 'desc' } });
    if (!user) return res.status(404).json({ error: 'No user found' });

    const existing = await prisma.sender.findFirst({ where: { userId: user.id } });
    if (!existing) {
      await prisma.sender.create({
        data: {
          userId: user.id,
          senderEmail: 'reachinbox.test@ethereal.email',
          displayName: 'Test Account',
          etherealUsername: 'wa2drwo5batyagbe@ethereal.email',
          etherealPassword: 'RjYrauCvX3vPcpaNm7'
        }
      });
    }
    res.json({ success: true, message: 'Test sender added successfully! You can now close this tab and refresh your Compose page.' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to seed sender' });
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

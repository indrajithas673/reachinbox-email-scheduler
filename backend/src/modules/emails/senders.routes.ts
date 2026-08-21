import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware';
import prisma from '../../database/prisma';
import { z } from 'zod';

const router = Router();

router.use(requireAuth);

const senderSchema = z.object({
  senderEmail: z.string().email(),
  etherealUsername: z.string().min(1),
  etherealPassword: z.string().min(1),
  displayName: z.string().optional(),
});

// Get senders securely
router.get('/', async (req, res) => {
  try {
    const senders = await prisma.sender.findMany({
      where: { userId: req.user!.id },
      select: {
        id: true,
        senderEmail: true,
        etherealUsername: true,
        displayName: true,
        // intentionally omitting etherealPassword
        createdAt: true,
      },
    });
    res.json(senders);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create sender
router.post('/', async (req, res) => {
  try {
    const parsed = senderSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request payload', details: parsed.error.issues });
    }

    const sender = await prisma.sender.create({
      data: {
        ...parsed.data,
        userId: req.user!.id,
      },
      select: {
        id: true,
        senderEmail: true,
        etherealUsername: true,
        displayName: true,
      }
    });

    res.status(201).json(sender);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

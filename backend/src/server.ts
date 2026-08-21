import { app } from './index';
import dotenv from 'dotenv';
import redis from './config/redis';
import prisma from './database/prisma';

dotenv.config();

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    // Check Redis connection
    await redis.ping();
    console.log('Redis connected successfully');

    // Check Postgres connection
    await prisma.$connect();
    console.log('PostgreSQL connected successfully via Prisma');

    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

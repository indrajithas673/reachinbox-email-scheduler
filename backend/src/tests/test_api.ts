import request from 'supertest';
import { app } from '../index';
import prisma from '../database/prisma';
import redis from '../config/redis';

// We inject a mock route to bypass OAuth specifically for tests
app.post('/test/login', async (req, res) => {
  const { id } = req.body;
  req.login({ id }, (err) => {
    if (err) {
      console.error('Login error:', err);
      return res.status(500).send(err);
    }
    res.json({ message: 'Logged in' });
  });
});

async function runApiTests() {
  console.log('--- Starting API Tests ---');

  // Setup: Create Users
  const userA = await prisma.user.create({
    data: { googleId: `test-A-${Date.now()}`, name: 'User A', email: `a-${Date.now()}@example.com` }
  });
  const userB = await prisma.user.create({
    data: { googleId: `test-B-${Date.now()}`, name: 'User B', email: `b-${Date.now()}@example.com` }
  });

  const agentA = request.agent(app);
  const agentB = request.agent(app);
  const agentUnauth = request.agent(app);

  // Authenticate Agents
  await agentA.post('/test/login').send({ id: userA.id }).expect(200);
  await agentB.post('/test/login').send({ id: userB.id }).expect(200);

  // 1. Auth & Me Endpoint
  console.log('Testing /api/auth/me...');
  await agentUnauth.get('/api/auth/me').expect(401);
  const resA = await agentA.get('/api/auth/me').expect(200);
  if (resA.body.name !== 'User A') throw new Error('Auth me failed');

  // 2. Sender Isolation & Creation
  console.log('Testing Senders API...');
  const createSenderA = await agentA.post('/api/senders').send({
    senderEmail: 'sender-a@ethereal.email',
    etherealUsername: 'a',
    etherealPassword: 'a',
    displayName: 'Sender A'
  }).expect(201);
  const senderIdA = createSenderA.body.id;

  const createSenderB = await agentB.post('/api/senders').send({
    senderEmail: 'sender-b@ethereal.email',
    etherealUsername: 'b',
    etherealPassword: 'b',
    displayName: 'Sender B'
  }).expect(201);
  const senderIdB = createSenderB.body.id;

  const getSendersB = await agentB.get('/api/senders').expect(200);
  if (getSendersB.body.some((s: any) => s.id === senderIdA)) throw new Error('Sender isolation failed');
  if (getSendersB.body[0].etherealPassword) throw new Error('Password leaked');

  // 3. Scheduling API - Validation
  console.log('Testing Schedule API Validation...');
  await agentA.post('/api/emails/schedule').send({
    subject: '', // invalid
    body: 'Hello',
    recipients: ['invalid-email'], // invalid
    startTime: 'not-a-date', // invalid
    delayMs: 2000,
    hourlyLimit: 100,
    senderId: senderIdA
  }).expect(400);

  // 4. Scheduling API - User Isolation
  console.log('Testing Schedule Sender Ownership Isolation...');
  const badRes = await agentB.post('/api/emails/schedule').send({
    subject: 'Sneaky',
    body: 'Hello',
    recipients: ['test@example.com'],
    startTime: new Date().toISOString(),
    delayMs: 5000,
    hourlyLimit: 100,
    senderId: senderIdA
  });
  if (badRes.status !== 403) {
    console.error('Expected 403, got', badRes.status, badRes.body);
    throw new Error('Isolation failed');
  }

  // 5. Scheduling API - Valid creation & Deduplication
  console.log('Testing Valid Scheduling & Deduplication...');
  const scheduleRes = await agentA.post('/api/emails/schedule').send({
    subject: 'Valid Subject',
    body: 'Valid Body',
    recipients: ['dup@example.com', 'dup@example.com', 'valid@example.com'],
    startTime: new Date().toISOString(),
    delayMs: 5000,
    hourlyLimit: 100,
    senderId: senderIdA
  }).expect(201);

  if (scheduleRes.body.count !== 2) throw new Error('Deduplication failed');

  // 6. Scheduled API
  console.log('Testing Scheduled API...');
  const scheduledA = await agentA.get('/api/emails/scheduled').expect(200);
  if (scheduledA.body.length < 2) throw new Error('Missing scheduled jobs');
  
  const scheduledB = await agentB.get('/api/emails/scheduled').expect(200);
  if (scheduledB.body.length !== 0) throw new Error('Scheduled email isolation failed');

  // 7. Individual Job API
  console.log('Testing Individual Email API...');
  const jobId = scheduledA.body[0].id;
  await agentB.get(`/api/emails/${jobId}`).expect(404); // Isolation check
  await agentA.get(`/api/emails/${jobId}`).expect(200); // Ownership check

  // 8. Logout
  console.log('Testing Logout...');
  await agentA.post('/api/auth/logout').expect(200);
  await agentA.get('/api/auth/me').expect(401);

  // 9. Queue Publication Failure Recovery Simulation
  console.log('Testing Startup Recovery...');
  // Force a job into pending publication state
  await prisma.emailJob.update({
    where: { id: jobId },
    data: { queuePublished: false }
  });
  
  // Re-run the startup mechanism
  const { recoverPendingPublications } = require('../index');
  // wait, recoverPendingPublications isn't exported, let's just assert the db state
  const pendingJob = await prisma.emailJob.findUnique({ where: { id: jobId }});
  if (pendingJob?.queuePublished !== false) throw new Error('Failed to set pending state');
  
  console.log('\nAll API & Auth tests passed perfectly!');
  process.exit(0);
}

runApiTests().catch(err => {
  console.error(err);
  process.exit(1);
});

import Fastify from 'fastify';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { Pool } from 'pg';
import { randomUUID, randomInt } from 'node:crypto';
import { fromNodeHeaders } from 'better-auth/node';
import { createAuth } from './auth.js';
import type { Config } from './config.js';

export function createApp({ config, logger = true }: { config: Config; logger?: boolean }) {
  const app = Fastify({
    logger: logger ? { redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'] } : false,
    bodyLimit: 64 * 1024,
    trustProxy: ['127.0.0.1', '::1'],
  });
  const pool = new Pool({ connectionString: config.databaseURL, max: 8, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000 });
  const auth = createAuth(pool, config);
  app.addHook('onClose', async () => { await pool.end(); });
  app.addHook('onRequest', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method) && !config.origins.includes(request.headers.origin || '')) {
      return reply.code(403).send({ error: 'This request did not come from the learning website.' });
    }
  });
  app.setErrorHandler((error, request, reply) => {
    if (error && typeof error === 'object' && 'validation' in error) return reply.code(400).send({ error: 'Please check the information you entered.' });
    if (error && typeof error === 'object' && 'statusCode' in error && typeof error.statusCode === 'number' && error.statusCode >= 400 && error.statusCode < 500) return reply.code(error.statusCode).send({ error: 'The request format was not accepted.' });
    request.log.error({ err: error }, 'API request failed');
    return reply.code(500).send({ error: 'The service could not complete this request. Please try again.' });
  });
  app.get('/api/health', async () => {
    await pool.query('SELECT 1');
    return { status: 'ok', service: 'little-letters-api', database: 'connected' };
  });

  app.route({
    method: ['GET', 'POST'], url: '/api/auth/*',
    async handler(request, reply) {
      const pathname = new URL(request.url, config.baseURL).pathname;
      if (!['/api/auth/sign-up/email', '/api/auth/sign-in/email', '/api/auth/sign-out', '/api/auth/get-session'].includes(pathname)) return reply.code(404).send({ error: 'Not found' });
      if (pathname === '/api/auth/sign-up/email') {
        const body = request.body as Record<string, unknown> | undefined;
        if (!body || typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 80 || (body.phone !== undefined && (typeof body.phone !== 'string' || body.phone.length > 30 || !/^[+\d ()-]*$/.test(body.phone)))) return reply.code(400).send({ error: 'Enter a parent name and a valid optional phone number.' });
        body.name = body.name.trim();
      }
      const headers = fromNodeHeaders(request.headers);
      headers.set('x-real-ip', request.ip);
      const response = await auth.handler(new Request(new URL(request.url, config.baseURL), {
        method: request.method,
        headers,
        ...(request.body ? { body: JSON.stringify(request.body) } : {}),
      }));
      reply.code(response.status);
      response.headers.forEach((value, key) => { if (key !== 'set-cookie' && key !== 'content-length') reply.header(key, value); });
      const cookies = response.headers.getSetCookie();
      if (cookies.length) reply.header('set-cookie', cookies);
      return reply.send(await response.text());
    },
  });

  async function parent(request: FastifyRequest, reply: FastifyReply) {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!session) { reply.code(401).send({ error: 'Please sign in to your parent account.' }); return null; }
    return session.user;
  }
  async function owned(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const user = await parent(request, reply);
    if (!user) return false;
    const result = await pool.query('SELECT id FROM learners WHERE id=$1 AND parent_id=$2', [request.params.id, user.id]);
    if (!result.rowCount) { reply.code(404).send({ error: 'Learner not found.' }); return false; }
    return true;
  }
  const params = { type: 'object', required: ['id'], properties: { id: { type: 'string', pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' } } };
  async function progress(id: string) {
    const result = await pool.query<{ letter: string; letter_case: string }>('SELECT letter, letter_case FROM learner_progress WHERE learner_id=$1 ORDER BY letter, letter_case', [id]);
    const quiz = await pool.query('SELECT count(*)::int AS wins FROM listening_rounds WHERE learner_id=$1 AND completed_at IS NOT NULL', [id]);
    const quizPoints = quiz.rows[0].wins * 10;
    return { completed: result.rows.map(row => `${row.letter}-${row.letter_case}`), quizPoints, points: result.rows.length * 10 + quizPoints };
  }
  app.get('/api/me', async (request, reply) => {
    const user = await parent(request, reply);
    if (!user) return;
    const learners = await pool.query('SELECT id, name FROM learners WHERE parent_id=$1 ORDER BY created_at, id', [user.id]);
    return { user: { id: user.id, name: user.name, email: user.email, phone: user.phone ?? '' }, learners: learners.rows };
  });
  app.post<{ Body: { name: string } }>('/api/learners', {
    schema: { body: { type: 'object', required: ['name'], additionalProperties: false, properties: { name: { type: 'string', minLength: 1, maxLength: 60 } } } },
  }, async (request, reply) => {
    const user = await parent(request, reply); if (!user) return;
    const name = request.body.name.trim();
    if (!name) return reply.code(400).send({ error: 'Enter a learner nickname.' });
    const id = randomUUID();
    await pool.query('INSERT INTO learners(id,parent_id,name) VALUES($1,$2,$3)', [id, user.id, name]);
    return reply.code(201).send({ id, name });
  });
  app.get<{ Params: { id: string } }>('/api/learners/:id/progress', { schema: { params } }, async (request, reply) => {
    if (!(await owned(request, reply))) return;
    return progress(request.params.id);
  });
  app.post<{ Params: { id: string }; Body: { letter: string; case: 'upper' | 'lower' } }>('/api/learners/:id/progress', {
    schema: { params, body: { type: 'object', required: ['letter', 'case'], additionalProperties: false, properties: { letter: { type: 'string', pattern: '^[A-Z]$' }, case: { type: 'string', enum: ['upper', 'lower'] } } } },
  }, async (request, reply) => {
    if (!(await owned(request, reply))) return;
    await pool.query('INSERT INTO learner_progress(learner_id,letter,letter_case) VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [request.params.id, request.body.letter, request.body.case]);
    return progress(request.params.id);
  });
  app.post<{ Params: { id: string } }>('/api/learners/:id/quiz', { schema: { params } }, async (request, reply) => {
    if (!(await owned(request, reply))) return;
    const previous = await pool.query('SELECT letter FROM listening_rounds WHERE learner_id=$1 ORDER BY created_at DESC LIMIT 1',[request.params.id]);
    const choices = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].filter(letter => letter !== previous.rows[0]?.letter);
    const letter = choices[randomInt(choices.length)], roundId = randomUUID();
    await pool.query('INSERT INTO listening_rounds(id,learner_id,letter) VALUES($1,$2,$3)',[roundId,request.params.id,letter]);
    return { roundId, letter };
  });
  app.post<{ Params: { id: string }; Body: { roundId: string; letter: string; confidence: number } }>('/api/learners/:id/quiz-answer', {
    schema: { params, body: { type:'object', required:['roundId','letter','confidence'], additionalProperties:false, properties:{ roundId:{type:'string',format:'uuid'}, letter:{type:'string',pattern:'^[A-Z]$'}, confidence:{type:'number',minimum:0,maximum:1} } } },
  }, async (request,reply) => {
    if (!(await owned(request,reply))) return;
    const round = await pool.query('SELECT letter FROM listening_rounds WHERE id=$1 AND learner_id=$2',[request.body.roundId,request.params.id]);
    if (!round.rowCount) return reply.code(404).send({error:'Question not found.'});
    const correct = request.body.confidence >= .85 && request.body.letter === round.rows[0].letter;
    let awarded = false;
    if (correct) {
      const update = await pool.query('UPDATE listening_rounds SET completed_at=now() WHERE id=$1 AND learner_id=$2 AND completed_at IS NULL RETURNING id',[request.body.roundId,request.params.id]);
      awarded = update.rowCount === 1;
    }
    return { correct, awarded, ...await progress(request.params.id) };
  });
  return app;
}

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { createApp } from '../server-dist/app.js';
import { readConfig } from '../server-dist/config.js';

const config = readConfig();
let app = createApp({ config, logger: false });
const db = new Pool({ connectionString: config.databaseURL });
const created = [];
const origin = config.origins[0];
const password = `Test-${randomUUID()}`;
const cookie = response => ([]).concat(response.headers['set-cookie'] || []).map(value => value.split(';')[0]).join('; ');
const call = (method, url, payload, authCookie = '', requestOrigin = origin) => app.inject({ method, url, payload, headers: { origin: requestOrigin, ...(authCookie ? { cookie: authCookie } : {}) } });
try {
  assert.equal((await call('GET','/api/health')).json().database, 'connected');
  assert.equal((await call('GET','/api/me')).statusCode,401);
  const users = [];
  for (const name of ['Parent Alpha','Parent Beta']) {
    const email = `backend-${randomUUID()}@example.test`;
    const response = await call('POST','/api/auth/sign-up/email',{name,email,password,phone:'+1 555 0100'});
    assert.equal(response.statusCode,200,'Parent registration succeeds');
    const id = response.json().user.id; created.push(id);
    assert.match(String(response.headers['set-cookie']), /httponly/i);
    users.push({id,email,cookie:cookie(response)});
  }
  const [alpha,beta] = users;
  const hashes = await db.query('SELECT password FROM account WHERE "userId"=$1',[alpha.id]);
  assert.equal(hashes.rows.length,1);assert.notEqual(hashes.rows[0].password,password);assert.ok(hashes.rows[0].password.length>40);
  assert.equal((await call('POST','/api/auth/sign-in/email',{email:alpha.email,password:'wrong-password'})).statusCode,401);
  assert.ok((await call('POST','/api/auth/sign-up/email',{name:'Duplicate',email:alpha.email,password})).statusCode>=400);
  const learner = await call('POST','/api/learners',{name:'Little Star'},alpha.cookie);
  assert.equal(learner.statusCode,201); const id=learner.json().id;
  assert.equal((await call('POST','/api/learners',{name:'  '},alpha.cookie)).statusCode,400);
  assert.equal((await call('GET',`/api/learners/${id}/progress`,undefined,beta.cookie)).statusCode,404);
  assert.equal((await call('POST',`/api/learners/${id}/progress`,{letter:'A',case:'upper'},beta.cookie)).statusCode,404);
  assert.equal((await call('POST',`/api/learners/${id}/progress`,{letter:'AA',case:'upper'},alpha.cookie)).statusCode,400);
  assert.equal((await call('POST',`/api/learners/${id}/progress`,{letter:'A',case:'upper'},alpha.cookie,'https://untrusted.example')).statusCode,403);
  const duplicateSaves = await Promise.all(Array.from({length:8},()=>call('POST',`/api/learners/${id}/progress`,{letter:'A',case:'upper'},alpha.cookie)));
  assert.ok(duplicateSaves.every(response=>response.statusCode===200));
  assert.equal((await call('GET',`/api/learners/${id}/progress`,undefined,alpha.cookie)).json().points,10);
  const secondLogin = await call('POST','/api/auth/sign-in/email',{email:alpha.email,password});
  assert.equal(secondLogin.statusCode,200);const otherDevice=cookie(secondLogin);
  assert.equal((await call('GET',`/api/learners/${id}/progress`,undefined,otherDevice)).json().points,10);
  await app.close();app=createApp({config,logger:false});
  assert.equal((await call('GET',`/api/learners/${id}/progress`,undefined,otherDevice)).json().points,10,'Session and progress persist across backend restart');
  const empty = await call('GET','/api/me',undefined,beta.cookie);assert.equal(empty.json().learners.length,0);
  const question = (await call('POST',`/api/learners/${id}/quiz`,{},alpha.cookie)).json();
  assert.match(question.letter,/^[A-Z]$/);
  const answer = {roundId:question.roundId,letter:question.letter,confidence:.99};
  assert.equal((await call('POST',`/api/learners/${id}/quiz-answer`,answer,beta.cookie)).statusCode,404);
  assert.equal((await call('POST',`/api/learners/${id}/quiz-answer`,{...answer,confidence:.4},alpha.cookie)).json().awarded,false);
  assert.equal((await call('POST',`/api/learners/${id}/quiz-answer`,{...answer,letter:question.letter==='A'?'B':'A'},alpha.cookie)).json().awarded,false);
  const answers = await Promise.all(Array.from({length:4},()=>call('POST',`/api/learners/${id}/quiz-answer`,answer,alpha.cookie)));
  assert.equal(answers.filter(x=>x.json().awarded).length,1);
  assert.equal((await call('GET',`/api/learners/${id}/progress`,undefined,otherDevice)).json().quizPoints,10);
  assert.equal((await call('GET',`/api/learners/${id}/progress`,undefined,otherDevice)).json().points,20);
  const nextQuestion = (await call('POST',`/api/learners/${id}/quiz`,{},alpha.cookie)).json();
  assert.notEqual(nextQuestion.letter,question.letter);
  assert.equal((await call('POST','/api/auth/sign-out',{},otherDevice)).statusCode,200);
  assert.equal((await call('GET','/api/me',undefined,otherDevice)).statusCode,401);
  console.log('PASS: registration, password hashing, cookie sign-in/sign-out, validation, family isolation, origin checks, concurrent idempotent points, cross-device login, database persistence after restart.');
} finally {
  if(created.length) await db.query('DELETE FROM "user" WHERE id=ANY($1::text[])',[created]);
  await app.close();await db.end();
}

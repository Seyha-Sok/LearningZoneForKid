import './accounts.css';

type User = { id: string; name: string; email: string; phone: string };
type Learner = { id: string; name: string };
type Progress = { completed: string[]; points: number; quizPoints?: number };
export type QuizRound = { roundId: string; letter: string; owner: string };
const guestWins = () => { try { const data = JSON.parse(localStorage.getItem('little-letters-quiz-wins') || '[]'); return new Set<string>(Array.isArray(data) ? data.filter(x => typeof x === 'string') : []); } catch { return new Set<string>(); } };
type Me = { user: User; learners: Learner[] };
class ApiError extends Error { constructor(message: string, readonly status: number) { super(message); } }
const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]!);
const readGuest = () => { try { const value: unknown = JSON.parse(localStorage.getItem('little-letters-earned') || '[]'); return Array.isArray(value) ? value.filter((key): key is string => typeof key === 'string' && /^[A-Z]-(upper|lower)$/.test(key)) : []; } catch { return []; } };

async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${import.meta.env.BASE_URL}api${path}`, {
    method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin',
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(12000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(data.message || data.error || 'Please try again.', response.status);
  return data as T;
}

export function createAccounts(onProgress: (completed: string[], identityChanged: boolean, quizPoints: number) => void) {
  let wins = guestWins(), quizPoints = wins.size * 10, previousLetter = '';
  let user: User | null = null, learners: Learner[] = [], selected: Learner | null = null;
  let completed = readGuest(), ready = false, revision = 0, busy = false, available = true;
  let mode: 'signin' | 'register' = 'signin';
  const identity = () => user ? `${user.id}:${selected?.id || 'none'}` : 'guest';
  let lastIdentity = identity();
  const strip = document.createElement('section'); strip.className = 'account-strip'; strip.setAttribute('aria-label','Learner account');
  strip.innerHTML = '<span id="account-summary">Checking your learner profile…</span><button id="parent-account" class="button secondary">Parent account</button>';
  document.querySelector('.welcome')!.after(strip);
  const dialog = document.createElement('dialog'); dialog.id = 'account-dialog'; dialog.className = 'account-dialog'; document.body.append(dialog);
  const emit = () => {
    const next = identity(); onProgress([...completed], next !== lastIdentity, quizPoints); lastIdentity = next;
    strip.querySelector('#account-summary')!.textContent = user ? selected ? `${selected.name} is learning · progress saved to your account` : `${user.name} · choose a learner to save progress` : available ? 'Guest practice · progress stays on this device' : 'Guest practice · account service is unavailable';
    strip.querySelector('#parent-account')!.textContent = user ? 'Manage learners' : 'Parent account';
  };
  function message(text: string) { const target = dialog.querySelector('#account-message'); if (target) target.textContent = text; }
  function setBusy(value: boolean) { busy = value; dialog.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>('input,button,select').forEach(el => { if (el.id !== 'close-account') el.disabled = value; }); }
  const errorText = (error: unknown) => error instanceof ApiError ? error.message : 'Could not reach your account. Check your connection and try again.';
  async function refresh() {
    if (busy) return;
    const ticket = ++revision;
    try {
      const me = await api<Me>('/me');
      if (ticket !== revision) return;
      let preference = selected?.id;
      if (user?.id !== me.user.id) { try { preference = localStorage.getItem(`little-letters-learner:${me.user.id}`) || undefined; } catch { preference = undefined; } }
      const learner = me.learners.find(item => item.id === preference) || me.learners[0] || null;
      const progress: Progress = learner ? await api<Progress>(`/learners/${learner.id}/progress`) : { completed: [], points: 0 };
      if (ticket !== revision) return;
      user = me.user; learners = me.learners; selected = learner; completed = progress.completed; quizPoints = progress.quizPoints || 0; available = true;
    } catch (error) {
      if (ticket !== revision) return;
      if (error instanceof ApiError && error.status === 401) { user = null; learners = []; selected = null; completed = readGuest(); wins = guestWins(); quizPoints = wins.size * 10; available = true; }
      else { available = false; }
    }
    if (ticket === revision) { ready = true; emit(); }
  }
  async function selectLearner(id: string) {
    const learner = learners.find(item => item.id === id); if (!learner || !user) return;
    const ticket = ++revision;
    const progress = await api<Progress>(`/learners/${id}/progress`);
    if (ticket !== revision) return;
    selected = learner; completed = progress.completed; quizPoints = progress.quizPoints || 0;
    try { localStorage.setItem(`little-letters-learner:${user.id}`, id); } catch { /* Selection storage is optional. */ }
    emit();
  }
  function renderDialog() {
    dialog.innerHTML = `<div class="account-dialog-top"><h2>${user ? 'Your little learners' : mode === 'register' ? 'Create a parent account' : 'Welcome back'}</h2><button id="close-account" aria-label="Close parent account">×</button></div>
      ${user ? `<p class="account-intro">Signed in as ${escape(user.name)}<br><span>${escape(user.email)}</span></p>
        ${learners.length ? `<label for="learner-select">Who is learning?</label><select id="learner-select">${learners.map(learner => `<option value="${learner.id}" ${learner.id === selected?.id ? 'selected' : ''}>${escape(learner.name)}</option>`).join('')}</select><button id="continue-learning" class="button primary">Let’s learn</button>` : '<p class="account-intro">Add your child’s nickname to begin saving progress.</p>'}
        <form id="add-learner"><label for="new-learner">Add another learner</label><div class="learner-input-row"><input id="new-learner" name="name" maxlength="60" required autocomplete="off" placeholder="Child’s nickname"><button class="button secondary" type="submit">Add</button></div></form>
        <p class="account-note">Each learner has their own progress. Your earlier guest practice stays on this device.</p><button id="sign-out" class="button text-button">Sign out</button>` : `
        <p class="account-intro">A parent account keeps your child’s learning progress together on different devices.</p>
        <form id="parent-form">
          ${mode === 'register' ? '<label for="parent-name">Parent name</label><input id="parent-name" name="name" maxlength="80" autocomplete="name" required>' : ''}
          <label for="parent-email">Email</label><input id="parent-email" type="email" name="email" maxlength="254" autocomplete="email" required>
          ${mode === 'register' ? '<label for="parent-phone">Phone <span>(optional)</span></label><input id="parent-phone" type="tel" name="phone" maxlength="30" autocomplete="tel">' : ''}
          <label for="parent-password">Password</label><input id="parent-password" name="password" type="password" minlength="8" maxlength="128" autocomplete="${mode === 'register' ? 'new-password' : 'current-password'}" required>
          ${mode === 'register' ? '<p class="account-note">Use at least 8 characters.</p><label for="first-learner">Child’s nickname</label><input id="first-learner" name="learner" maxlength="60" autocomplete="off" required>' : ''}
          <button class="button primary" type="submit">${mode === 'register' ? 'Create account' : 'Sign in'}</button>
        </form><button id="switch-account-mode" class="button text-button">${mode === 'register' ? 'Already registered? Sign in' : 'New here? Create an account'}</button>`}
      <p id="account-message" class="account-message" role="status" aria-live="polite"></p>`;
    dialog.querySelector('#close-account')!.addEventListener('click', () => dialog.close());
    dialog.querySelector('#continue-learning')?.addEventListener('click', () => dialog.close());
    dialog.querySelector('#switch-account-mode')?.addEventListener('click', () => { mode = mode === 'signin' ? 'register' : 'signin'; renderDialog(); });
    dialog.querySelector('#parent-form')?.addEventListener('submit', async event => {
      event.preventDefault(); if (busy) return;
      const form = new FormData(event.currentTarget as HTMLFormElement);
      const email = String(form.get('email')).trim().toLowerCase(), password = String(form.get('password'));
      const registering = mode === 'register';
      if (registering && (!String(form.get('name')).trim() || !String(form.get('learner')).trim())) { message('Enter a parent name and a learner nickname.'); return; }
      setBusy(true); message(registering ? 'Creating your account…' : 'Signing in…');
      let failure = '';
      try {
        await api(registering ? '/auth/sign-up/email' : '/auth/sign-in/email', registering ? { name: String(form.get('name')).trim(), email, password, phone: String(form.get('phone') || '').trim() } : { email, password });
        if (registering) await api('/learners', { name: String(form.get('learner')).trim() });
      } catch (error) { failure = errorText(error); }
      setBusy(false); await refresh();
      if (user) { renderDialog(); message(failure || 'You’re ready to learn.'); }
      else { const passwordInput = dialog.querySelector<HTMLInputElement>('#parent-password'); if (passwordInput) passwordInput.value = ''; message(failure || 'Sign-in did not finish. Please try again.'); }
    });
    dialog.querySelector('#learner-select')?.addEventListener('change', async event => {
      const id = (event.target as HTMLSelectElement).value; setBusy(true);
      try { await selectLearner(id); message('Learner selected.'); } catch (error) { message(errorText(error)); } finally { setBusy(false); }
    });
    dialog.querySelector('#add-learner')?.addEventListener('submit', async event => {
      event.preventDefault(); if (busy) return;
      const name = String(new FormData(event.currentTarget as HTMLFormElement).get('name')).trim();
      if (!name) { message('Enter a learner nickname.'); return; }
      setBusy(true);
      try { const learner = await api<Learner>('/learners', { name }); learners.push(learner); await selectLearner(learner.id); renderDialog(); message('Learner added.'); }
      catch (error) { message(errorText(error)); } finally { setBusy(false); }
    });
    dialog.querySelector('#sign-out')?.addEventListener('click', async () => {
      setBusy(true);
      try { await api('/auth/sign-out', {}); setBusy(false); await refresh(); renderDialog(); }
      catch (error) { message(errorText(error)); } finally { setBusy(false); }
    });
  }
  strip.querySelector('#parent-account')!.addEventListener('click', () => { renderDialog(); dialog.showModal(); });
  window.addEventListener('focus', () => { void refresh(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void refresh(); });
  void refresh();
  return {
    identity,
    isReady: () => ready,
    async createQuiz(): Promise<QuizRound> {
      if (!ready) throw new Error('Your profile is still loading. Try again in a moment.');
      const owner = identity();
      if (user) {
        if (!selected) throw new Error('Choose a learner in Manage learners first.');
        return { ...await api<{roundId:string;letter:string}>(`/learners/${selected.id}/quiz`, {}), owner };
      }
      const choices = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').filter(x => x !== previousLetter);
      const letter = choices[crypto.getRandomValues(new Uint32Array(1))[0] % choices.length];
      previousLetter = letter;
      const bytes = crypto.getRandomValues(new Uint8Array(16)); bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
      const hex = [...bytes].map(x => x.toString(16).padStart(2,'0')).join('');
      return { roundId: `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`, letter, owner };
    },
    async answerQuiz(round: QuizRound, guess: {letter:string;confidence:number}) {
      if (identity() !== round.owner) throw new Error('The learner changed. Start a new sound.');
      if (!user) {
        const correct = guess.letter === round.letter && guess.confidence >= .85;
        const awarded = correct && !wins.has(round.roundId);
        if (awarded) { wins.add(round.roundId); quizPoints = wins.size * 10; try { localStorage.setItem('little-letters-quiz-wins', JSON.stringify([...wins])); } catch { /* Keep in-memory score. */ } emit(); }
        return { correct, awarded };
      }
      if (!selected) throw new Error('Choose a learner first.');
      ++revision;
      const result = await api<Progress & {correct:boolean;awarded:boolean}>(`/learners/${selected.id}/quiz-answer`, {roundId:round.roundId,...guess});
      if (identity() === round.owner) { completed = result.completed; quizPoints = result.quizPoints || 0; emit(); }
      return result;
    },
    async save(form: string) {
      if (!ready) throw new Error('Your profile is still loading. Please try again.');
      if (!user) {
        completed = [...new Set([...completed, form])];
        try { localStorage.setItem('little-letters-earned', JSON.stringify(completed)); } catch { /* Keep in-memory progress. */ }
        emit(); return;
      }
      if (!selected) throw new Error('Open Manage learners and add or choose your child’s nickname first.');
      const current = identity(); ++revision;
      const [letter, letterCase] = form.split('-');
      try {
        const progress = await api<Progress>(`/learners/${selected.id}/progress`, { letter, case: letterCase });
        if (identity() === current) { completed = progress.completed; quizPoints = progress.quizPoints || 0; available = true; emit(); }
      } catch (error) { throw new Error(error instanceof ApiError && error.status === 401 ? 'Your sign-in has expired. Open Parent account to sign in again.' : 'Nice tracing! Progress could not be saved. Check your connection and tap Check my letter again.'); }
    },
  };
}

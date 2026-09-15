# Learning Zone For Kid — Little Letters

A responsive English and Khmer writing practice site for children, built with TypeScript, SVG, and Vite. Guest practice works without an account. Optional parent accounts use a Fastify backend and PostgreSQL to share learner profiles and progress between devices.

## Run

With Node.js 22.12+ (or 24+) and npm installed:

```sh
npm install
npm run dev
```

Open the localhost URL printed by Vite. To validate and build, run `npm test` and `npm run build`. Run `npm run preview` to serve the production build locally. A pnpm lockfile is included; `pnpm install --frozen-lockfile` provides reproducible dependency installation.

On this workspace's machine, dependencies are already installed. If npm is not on PATH, run `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5173` from this folder.

Optional browser checks live in `tests/browser.mjs` and `tests/audio.mjs`. With Playwright installed and a preview running, run each with Node. Set `PLAYWRIGHT_MODULE` to an existing Playwright package path and `CHROME_PATH` to a Chrome executable if using a bundled runtime. These checks exercise mouse/touch tracing, persistence, scoring rejection cases, free drawing, real audio playback/cancellation/fallback, all guide bounds, and responsive layouts. The audio checks decode every recording and block external requests. Screenshots are written to ignored `.checks/`.

## Included

- A–Z and 52 uppercase/lowercase stroke guides, with simple single-storey lowercase a and g.
- Finger, stylus, and mouse drawing; pointer capture; undo and retry.
- Trace checks based on whole-letter coverage, closeness, per-stroke coverage, and excessive-ink penalties. A dot, missing component, or repeated scribble does not qualify.
- 10 points per newly completed letter form, saved locally when browser storage is available. Repeated checks and retries cannot farm points.
- Ungraded free drawing, optional local handwritten-letter guesses, and saved American English voice prompts with visible text fallback.
- Responsive layout, keyboard-accessible controls, status announcements, and reduced-motion support. Drawing itself requires a pointing device.

## Scope and limitations

Tracing is a geometric practice aid; thresholds have synthetic behavior tests, not a child usability study. The trace check does not enforce stroke direction/order. Free drawing has a separate experimental YOLO letter classifier and never earns correctness points. The classifier identifies a letter across both cases; it does not assess case, stroke order, or writing quality. A listening quiz that grades handwritten letters remains a future feature.

Audio and fonts are bundled with the site. Listening uses local WAV files and never calls browser speech synthesis or a cloud speech service. Both letter cases use the same spoken letter name; the selected case is shown on the practice board. Audio needs the local website to remain reachable (or the relevant files to be cached); this is not an installed offline PWA. Drawings are not uploaded. Guest progress belongs to this browser/origin, and clearing browser data resets it. Signed-in learner progress is stored in PostgreSQL. No public deployment or commits are included.

## Local voice

The American voice selected by the user is Kokoro `af_heart`. All 26 recordings were generated on this PC with network connections disabled inside the Python generation process. The model and runtime are one-time downloads; playback requires no model, subscription, account, or internet speech connection. The model is not shipped to the phone.

Audio lives in `public/audio`, with text, pronunciation, durations, and hashes in `manifest.json`. `scripts/generate-audio.py` can regenerate it using Python 3.12, the already downloaded model in `.checks/voice-model`, and the local Python packages in `.checks/voice-runtime`. The script verifies model hashes and preserves existing recordings. To regenerate a particular recording, remove only that recording first.

Model: [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M), Apache-2.0. Runtime/conversion: [kokoro-onnx](https://github.com/thewh1teagle/kokoro-onnx), MIT. Locally bundled DM Sans and Nunito fonts retain their SIL Open Font License files in `public/fonts`.

## Local handwriting recognition

In **Free drawing**, draw one letter and choose **Guess my letter**. The optional button appears when the model manifest is available. Ink is cropped, resized with preserved proportions, and centered in a 32×32 image. Guides, prompt text, and the selected letter are excluded from model input. A worker runs the ONNX model locally in the browser, including on a phone accessing the PC over Wi-Fi. There is no cloud inference, API fee, image upload, or automatic collection of children's drawings. First use loads the model and WebAssembly runtime from the local website; the server must remain reachable.

The classifier is a compact, custom-width YOLOv8 classification network trained from scratch on public [EMNIST Letters](https://www.nist.gov/itl/products-and-services/emnist-dataset), downloaded from the [tanganke mirror](https://huggingface.co/datasets/tanganke/emnist_letters) with published SHA-256 verification. Source images are transposed into upright orientation. EMNIST Letters combines uppercase and lowercase into 26 labels. Training uses a seeded, balanced 26,000-image subset of the official training split and a disjoint 5,200-image validation subset. The official 20,800-image test split is used after model selection. Exact measured results and model hash are recorded in `public/handwriting/manifest.json` after a successful export. Public benchmark results do not establish accuracy on young children's touchscreen handwriting.

Predictions require probability at least 0.85 and a lead of at least 0.35 over the second guess. These are abstention heuristics, not calibrated guarantees. A confident guess can still be wrong, particularly for pictures, scribbles, unfamiliar styles, or ambiguous letters. The UI always presents a guess, not a grade. Editing, clearing, undoing, playing a prompt, or switching modes invalidates stale results; model loading/inference failures leave tracing and drawing usable.

The first model selected epoch 9: **92.30%** accuracy on all 20,800 test examples. The filter accepted **85.89%** of examples, with **97.63%** accuracy among accepted guesses. Performance varies by letter: I was 49.88% and G 73.38% before filtering, so the overall score is not a promise for every letter. A separate synthetic probe of the app's 52 guides had 48 correct top guesses; the filter offered 40 correct guesses and 2 incorrect guesses (lowercase i as J, uppercase N as M), withholding 10. These controlled drawings are not a child handwriting study. The model is 752,473 bytes; the locally served WebAssembly runtime is about 14 MB.

Training tools are in `scripts/download-handwriting.py`, `scripts/train-handwriting.py`, and `scripts/handwriting-yolo.yaml`. The isolated Python 3.12 environment and data live in ignored `.checks/handwriting-env` and `.checks/handwriting-data`. Installed package versions are recorded in `scripts/handwriting-environment.txt`; CPU PyTorch packages come from the official PyTorch CPU wheel index. After installing dependencies, download the data and run the training script with `--transpose`. It saves the best validation checkpoint, evaluates the test set, checks ONNX numerical parity, and exports only if test accuracy reaches 85%. Keep child evaluation drawings separate from any future fine-tuning examples.

`node scripts/copy-recognition-runtime.mjs` refreshes locally served ONNX Runtime assets after dependency updates. `tests/recognition.mjs` checks Python/browser prediction parity on untouched test fixtures, actual touch input, blank/dot rejection, stale-result suppression, no recognition points, mobile layout, and blocked external network requests. Run it against the development server using the same Playwright environment variables as the other browser tests. The app remains responsive because recognition runs in a worker with one CPU thread. Training uses two CPU threads.

`tests/recognition-production.mjs` exercises the actual production worker and runtime through the UI, drawing A with Z selected to check that the answer comes from the ink. `scripts/make-guide-fixtures.mjs` and `scripts/check-handwriting-guides.py` reproduce the synthetic guide probe. Evaluation/export of an existing best checkpoint can be repeated with `--transpose --evaluate-only`; this does not continue training.

YOLO architecture and model: AGPL-3.0, with license in `public/handwriting/YOLO-LICENSE.txt`. ONNX Runtime Web: MIT, with license in `public/handwriting/runtime/LICENSE`. No cloud training or paid service was used.

## Parent accounts and backend

Choose **Parent account** on the website to register with parent name, email, password (at least 8 characters), optional phone, and a child nickname. Parents can add and switch between children. Each child has separate progress; signing in on another device loads the same database records. Progress refreshes when the page reloads or regains focus. Guest wins remain separate in the original browser and are not silently assigned to a child.

The Node.js/Fastify backend is written in TypeScript under `server`. Run `npm run dev:api` alongside Vite. Vite forwards `/api` to loopback port 3001, including trusted client-IP forwarding. A phone uses the existing LAN website address. `GET /api/health` checks both the API and database connection. `npm run build` builds the frontend and backend; `npm run start:api` runs the compiled backend. `npm run db:migrate` applies authentication and application schema migrations explicitly.

The local database is `little_letters`, owned by the dedicated `little_letters_app` role. The app role has no superuser, database-creation, or role-creation privileges. The administrator credentials were used only to provision this new database and role. Ignored `.env` contains the application connection string and a generated authentication secret; `.env.example` contains placeholders. Keep these backend variables out of Vite's public `VITE_` namespace. `scripts/setup-database.mjs` provisions a fresh local environment from administrator environment variables and refuses to overwrite an existing app database, role, or `.env`.

Better Auth manages password hashing, HTTP-only session cookies, session expiration, and sign-in rate limits. Parent ownership is checked for every learner/progress read and write. Progress rows have a unique learner/letter/case key, so concurrent retries cannot award extra points. Scores are computed on the server as 10 points per completed form. The browser reports successful practice; these are practice rewards, not tamper-proof assessment results. Drawings are never sent to the backend. If a signed-in save fails, the drawing remains available for retry and points are not falsely shown as saved.

This is a local development implementation. Email verification and password recovery email are not configured, and the app has not been publicly deployed. Sign-in uses email and password without extra verification steps. Before hosting, configure the real HTTPS origin, database connection, trusted reverse proxy, database backups, and a recovery-email provider if password reset is required. The current API is loopback-only and trusts forwarded client IPs only from loopback; browser writes must carry an explicitly allowed origin. Production configuration rejects non-HTTPS origins.

`npm run test:api` tests real PostgreSQL registration, hashing, sessions, family isolation, input/origin validation, idempotent concurrent progress writes, and persistence across a backend restart. `tests/accounts-browser.mjs` tests actual registration, child switching, cross-browser sign-in and shared progress, save failure/retry, sign-out, and mobile layout. It uses the existing Playwright variables and `.env`. Tests create uniquely named synthetic accounts and delete only those accounts afterward.

## Listen & write

Keep Free drawing for open practice, or choose Listen & write and tap New sound. The app asks for a random letter using saved local American audio. Write one letter (either case), then tap Check answer. A confident matching prediction plays Correct and awards 10 points once per question. Blank, unclear, and wrong answers award no points and can be retried. The target stays hidden on the board until a correct answer. New sound chooses another letter without an immediate repeat.

Guest listening wins stay in browser storage. Signed-in learner wins are saved separately from traced forms in PostgreSQL and included in total points across devices. Run the database migration when upgrading. All handwriting inference stays in the browser; no drawings are uploaded. These are practice points based on an imperfect model, not a tamper-resistant assessment.

The two additional voice clips are generated by `scripts/generate-quiz-audio.py` using the existing local Kokoro runtime with network access disabled. `tests/listening.mjs` exercises actual audio, touch drawing and the local model, hidden prompts, score persistence, mobile layout, and audio failures. Backend tests cover question ownership, incorrect answers and duplicate submissions.

## Khmer practice page

Open `khmer.html` or use the English / Khmer navigation. The first version includes 33 consonants, numbered writing-direction guides for tracing, free drawing, undo, clear and next-character controls. It has no AI grading, audio, score or drawing persistence. The guides show movement order; numbers do not always indicate pen lifts. 29 cropped worksheet diagrams are attributed to Vathanak Sok under CC BY-NC 4.0, and four original diagrams use Rermork direction references. See `public/khmer-guides/ATTRIBUTION.txt` and `manifest.json`. Noto Sans Khmer is bundled locally under the SIL Open Font License (`public/fonts/khmer-OFL.txt`). Both HTML pages are included in the production build.

The Khmer group dropdown also includes 23 vowel-sign forms (common combinations included), 13 independent-vowel practice forms following the supplied reference (ending ឱ, ឳ, ឲ្យ), and Khmer numbers ០ through ៩. 22 vowel signs have locally bundled, attributed worksheet direction guides. Independent vowels and numbers currently use pale shape-only references, explicitly labeled without stroke directions. A dotted circle indicates where a consonant belongs and is not part of the vowel. Group changes clear the current drawing. No AI scoring is used on the Khmer page.

The vowel sign ើ now has an original numbered guide checked against Rermork WB4 PDF page 22 (printed page 23). All 23 vowel-sign forms have numbered guides. Independent-vowel stroke directions remain unverified; the app continues to label those guides as shape-only.

### Khmer pronunciation audio
The Khmer Hear it button plays 69 active local recordings: all 33 consonants from a user-provided recording (split, volume adjusted, and order reviewed by the user), all 23 vowel signs from a second user-provided recording for the អ consonant series (labels reviewed by the user), plus 13 independent-vowel clips from the replacement recording supplied for the corrected list, with one pronunciation per tap. The independent-vowel group now follows the user reference: ឥ ឦ ឧ ឪ ឫ ឬ ឭ ឮ ឯ ឰ ឱ ឳ ឲ្យ. The last item is the combined form shown in the reference. The vowel-sign board displays the consonant series used for pronunciation. Files and source mappings are in public/khmer-audio; CC BY-NC 4.0 attribution is included for textbook audio; the user-provided recording has separate provenance and no supplied license. Vowel sounds vary by consonant series. Mappings follow publisher labels; native-speaker review is still useful. Playback stops on selection/mode changes and page exit. No cloud speech service is used.

## Licenses and bundled assets
The repository code uses the MIT license in LICENSE. Bundled fonts, model files, worksheets, and audio retain their respective licenses and provenance; see the attribution and license files under public/. User-supplied recordings do not have a supplied license and are not relicensed by the repository MIT license.

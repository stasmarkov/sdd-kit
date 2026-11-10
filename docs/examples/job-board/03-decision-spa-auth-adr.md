# 03 — Decision: SPA auth approach with tech-research (HIRE-2 → ADR-0001)

> **Date in the story:** 2026-10-20 · **Route:** `decision` → `tech-research` → ADR
> **Ticket:** HIRE-2 · **Session:** started inside `api/` with `--add-dir ../web`
> **Artifact:** [`artifacts/api/docs/adr/0001-spa-auth.md`](artifacts/api/docs/adr/0001-spa-auth.md)

After [chapter 02](02-greenfield-first-slice.md), Hireboard has a public job search and nothing else.
Accounts and roles are next. Before anyone writes a login form, the team has to settle how the
Next.js frontend proves to the Laravel API who the user is.

## Why this is a decision and not a feature

Maya's draft for the accounts feature says "candidates and employers can register and log in". That
describes a feature, but it leaves out the part that shapes every later spec: **where the credential lives and who
sends it**. At least four approaches are reasonable for Laravel + Next.js, and they lead to different
code in both repos:

| If you pick... | ...then later specs get |
|---|---|
| Sanctum SPA cookies | CORS with credentials, a CSRF cookie round trip, browser-to-API calls |
| Sanctum tokens held by the Next.js server | a session cookie on the web origin, all calls via `lib/api/client.ts` |
| Passport | OAuth clients, keys, scopes, a PKCE flow |
| Auth.js | an Auth.js config, its session strategy, a second session lifetime |

`/sdd` routes "X or Y?" questions like this to `decision`, not `feature` (see the routing table in
`src/skills/sdd/SKILL.md`, Step 2). The decision route ends with an **ADR**, not code. The
code comes in [chapter 04](04-feature-accounts-and-roles.md), where the HIRE-3 spec cites the ADR.

Maya files the decision as its own ticket, HIRE-2, and holds the accounts ticket back. Once the ADR is
signed, she files it as HIRE-3 with text that cites ADR-0001 (chapter 04 shows that text). Until then
the only thing the repos know about authentication is the constraint in INV-05: no token readable by
browser JavaScript.

## Start the session in the repo that owns the ADR

The ADR belongs in `api/docs/adr/`, next to `architecture.md` from chapter 02, and it should be
committed. That rules out starting Claude from the workspace root this time.

tech-research's Document phase writes to `docs/adr/` **relative to the session's working directory**,
and falls back to `.ai/decisions/` when there is no `docs/` folder. `~/work/hireboard/` has no `docs/`
and no git, so a run from the root would leave the ADR in `~/work/hireboard/.ai/decisions/`, which is
local scratch that nobody commits (kit friction F3).

Start inside `api/` instead and add `web/` so the codebase-fit pass can read the frontend too:

```bash
cd ~/work/hireboard/api
CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1 claude --add-dir ../web
```

`--add-dir` on its own loads only the sibling's skills. The environment variable is what makes
`web/CLAUDE.md` load as well (see [docs/multi-repo.md](../../reference/multi-repo.md), "Configuration traps").
Run `/memory` once and check that both `api/CLAUDE.md` and `web/CLAUDE.md` are listed.

> In plugin mode the entry point is namespaced: type `/sdd-kit:sdd` wherever this chapter shows `/sdd`
> (see [INSTALLATION.md](../../reference/installation.md)).

## Run /sdd and confirm the decision route

```
/sdd HIRE-2: SPA auth between the Next.js frontend and the Laravel API — options: Sanctum SPA cookies, Sanctum tokens held by the Next.js server, Passport, Auth.js
```

`/sdd` sees the ticket key and checks `.ai/specs/` for an existing `spec-HIRE-2-*` folder. There isn't
one. No Jira or Linear tool is connected (F8), so it asks for the ticket text. Alex pastes what Maya
wrote:

```
HIRE-2  Decide how the web app authenticates against the API
Before HIRE-3 we need one agreed way for Next.js to call the API as a signed-in user.
Hard requirements from the security checklist: no token readable from browser JS.
Local dev runs web on :3000 and api on :8000; production hosts not chosen yet.
We're two people - prefer the option with the fewest moving parts.
A mobile app is a "maybe, next year".
```

*Simulated output, abridged:*

```
Route: decision — "SPA cookies, server-held tokens, Passport or Auth.js?" is a choice between
approaches that must be made before HIRE-3 is built.

? Which route should HIRE-2 take?
  > decision (Recommended) — tech-research → ADR, no code
    feature — write a spec for auth directly and choose the approach inside it
```

Alex picks **decision**. `/sdd` then gathers the inputs a background workflow cannot ask for later
(Step 3):

```
? Repos: I can see this repo (laravel) and ../web (nextjs, via --add-dir). Use
  { backend: ".", frontend: "../web" }?                                  > Yes

? Criteria — I drafted these from the ticket. Adjust weights?
  must:   no token readable by browser JavaScript
  must:   works with web on :3000 and api on :8000 locally and on separate hosts in production
  should: fewest moving parts for a two-person team
  should: testable in Pest without a browser (Sanctum::actingAs)
  nice:   reusable later by a mobile client                              > Keep as is
```

Before launching, `/sdd` shows the exact call, as the decision row of its Step 4 table and
[references/tech-research.md](https://github.com/stasmarkov/sdd-kit/blob/v4.0.0/plugins/sdd-kit/skills/sdd/references/tech-research.md) prescribe:

```js
Workflow({
  name: "tech-research",
  args: {
    question: "HIRE-2: SPA auth between the Next.js frontend and the Laravel API",
    options: [
      "Sanctum SPA cookie auth (stateful, CSRF cookie)",
      "Sanctum personal access tokens held by the Next.js server in an HttpOnly cookie (BFF)",
      "Laravel Passport OAuth2 with PKCE",
      "Auth.js credentials provider wrapping Sanctum tokens"
    ],
    criteria: [
      "must: no token readable by browser JavaScript",
      "must: works with web on :3000 and api on :8000 locally and on separate hosts in production",
      "should: fewest moving parts for a two-person team",
      "should: testable in Pest without a browser (Sanctum::actingAs)",
      "nice: reusable later by a mobile client"
    ],
    repos: { backend: ".", frontend: "../web" }
  }
})
```

```
This runs many agents in the background. Launch? > Yes

Route:     decision (confirmed)
Ticket:    HIRE-2
Launched:  tech-research — runs in the background; watch with /workflows
Done when: ADR written, every claim behind the recommendation sourced and verified,
           and a human has signed it off
```

`repos` paths are relative to the session directory, which is why the backend is `"."` here and not
`"api"` as in the workspace-root runs of other chapters.

## What the seven phases do

`src/workflows/tech-research.js` declares `Detect → Frame → Research → Verify → Decide → Document → Report`.
Each phase is pinned to a model tier (deep for Frame, Research, Decide and Report; standard for Detect,
Verify and Document). See [docs/effort-guidelines.md](../../reference/effort-guidelines.md). The log lines below
use the workflow's own formats; the numbers are from this story.

*Simulated progress log:*

```
Detect: backend:laravel, frontend:nextjs
Frame: 4 option(s) vs 5 criterion(s)
Research: 4/4 option(s) researched, 23 sourced finding(s)
Verify: 19 claim(s) survived, 4 dropped as unverified
Decide: recommend "Sanctum personal access tokens held by the Next.js server in an HttpOnly cookie (BFF)" (confidence high), 2 disagreement flag(s)
ADR: docs/adr/0001-spa-auth-between-nextjs-and-laravel-api.md
```

**Detect** probes `.` and `../web` with the caller's hints and classifies them against the stack
registry: an `artisan` file plus `laravel/framework` makes `.` the laravel backend, and `next` in
`package.json` makes `../web` the nextjs frontend.

**Frame** restates the question and turns the criteria into weighted drivers (must / should / nice,
each with a rationale). It keeps the four options because they already form a 2–5 shortlist. With
fewer than two options the workflow stops, because there is nothing to decide.

**Research** runs one sourced web pass per option in parallel, plus one codebase-fit pass by
`code-explorer` that reads the actual repos. The web passes rely on official documentation: the
Laravel 12 Sanctum and Passport docs, the Next.js `cookies()` reference and authentication guide, the
Auth.js credentials page and the OWASP cheat sheets. Any finding without a URL is dropped at this
stage. The codebase-fit pass reports what it saw:

```
fitNotes:
- api: laravel/sanctum ^4 present (installed by `php artisan install:api`); config/sanctum.php and the
  personal_access_tokens migration exist. User does not use HasApiTokens yet.
- web: lib/api/client.ts imports 'server-only' and reads API_BASE_URL. Today every fetch happens in a
  Server Component because the slice is public and needs no credentials.
- web: Server Actions can set cookies via cookies() from next/headers — fits a server-held token.
conflicts:
- Passport would replace the Sanctum setup from install:api.
- SPA cookie auth needs credentialed browser-to-API calls, which means CORS and a CSRF round trip that
  neither repo has. This is a cost of adding it, not a verdict: no auth code exists yet.
migrationCost: low for Sanctum options, medium for Auth.js, high for Passport.
```

**Verify** gives every claim (up to 40) to a separate agent that tries to refute it and defaults to
`real=false` when it cannot confirm the source. Of the 23 claims, four were dropped. The report lists
them under "Dropped (unverified) claims that did NOT inform the decision". Two of them:

```
Dropped (unverified) claims — these did NOT inform the decision
- [Passport] "Passport is deprecated in favour of Sanctum since Laravel 11."
  Verifier: the cited Laravel 12 docs present Passport as the full OAuth2 server and Sanctum as the
  simpler option for first-party SPAs and mobile apps. No deprecation notice. Refuted.
- [Auth.js] "The credentials provider is secure by default and production-ready with zero
  configuration."
  Verifier: the source is a third-party blog post with no specifics. The official page documents
  required setup (AUTH_SECRET, JWT session strategy). Marketing claim, unsourced. Dropped.
```

The other two (a benchmark of Sanctum token lookups with no methodology, and a forum post that said
SPA cookies "work across any two domains") were dropped the same way. The second one would have
removed option A's biggest weakness. The Laravel docs say the opposite, so it never reached Decide.

**Decide** scores each option from 0 to 100 using only verified claims and the codebase fit. It
recommends one option, names a runner-up and states its confidence:

*Simulated report excerpt:*

```
Options compared
  B  Sanctum PATs held by the Next.js server (BFF)   88  meets both musts; reuses install:api + lib/api/client.ts
  A  Sanctum SPA cookie auth                         71  HttpOnly session, but shared top-level domain + CORS + CSRF round trip
  D  Auth.js credentials wrapping Sanctum            62  works, but B plus a library and a second session lifetime
  C  Passport OAuth2 + PKCE                          44  browser PKCE client holds the token in JS; heavy for a first-party app

Recommendation: B (confidence: high)
Runner-up: A — needs a shared parent domain, credentialed CORS and the /sanctum/csrf-cookie
round trip, and Server Components would not see the API session cookie without forwarding.

Disagreement flags
- If production puts web and api on subdomains of one domain, A's C2 weakness disappears and the
  gap narrows to C3 only.
- Evidence on handling a revoked token whose cookie still exists is thin: no source covers it
  directly. Treat as a design consequence, not a verified fact.

Open questions for the human
- Token lifetime and whether logout revokes only the current token or all of them.
- Refresh / sliding expiry: needed for v1?
- Production hostnames (affects the Secure cookie domain, not the decision).
```

**Document** writes the ADR. It looks for `docs/adr/` (creating it if needed, because `api/docs/`
exists), takes the next free number (`0001`) and builds a slug of up to 40 characters from the question.
The Status is always `Proposed`. **Report** writes the summary shown above for the human sign-off.

### About the file name

The workflow has no argument for the ADR slug. The Document agent derives it from the question, so
this run produced `docs/adr/0001-spa-auth-between-nextjs-and-laravel-api.md`. The team wants short
names, so Alex renames the file during sign-off (below). The `0001` number stays the same. Do this
before you commit, so the history doesn't contain a rename.

## The ADR

The full file is the artifact [`artifacts/api/docs/adr/0001-spa-auth.md`](artifacts/api/docs/adr/0001-spa-auth.md).
It has the sections the Document phase is told to write, with the sign-off fields added:

| Section | What it holds in ADR-0001 |
|---|---|
| Title, Status, Date | "SPA auth between the Next.js frontend and the Laravel API", Accepted (was Proposed), 2026-10-20, plus Deciders added at sign-off |
| Context | Two repos, ports, Sanctum already installed, server-only `lib/api/client.ts`, Pest tests |
| Decision Drivers | C1–C5 with their must/should/nice weights |
| Options Considered | A–D, each with pros, cons, fit and score (88 / 71 / 62 / 44) |
| Decision | Option B and why A is the runner-up |
| Consequences | positive, negative, runner-up |
| Open Questions | lifetime resolved; refresh deferred; prod hosts open |
| Sources | only URLs behind verified claims |

The Consequences section is what later chapters build on:

```markdown
- Tokens are named `web` and expire 7 days after they are issued. The expiry is set per token when it
  is created, and the cookie `maxAge` is also 7 days, so both end together.
- Logout deletes the current token on the API (`currentAccessToken()->delete()`) and clears the cookie
  on the web side.
- No CORS configuration in `api/`, because the browser only talks to the web origin.
- Every backend call goes through `web/lib/api/client.ts`, which adds the bearer token when one is
  present. No component calls `fetch` against the API directly.
- `Sanctum::actingAs()` covers authenticated Pest tests, and a mobile client can later use the same
  token endpoints.
```

It also lists the downsides. The most useful one is that `middleware.ts` only checks that the cookie
exists, so a revoked token still gets past it. Pages therefore call `requireUser()`, which treats a 401
from `/api/v1/auth/me` as signed out. That becomes a concrete line in the HIRE-3 spec.

The kit's skills agree with the decision. `nextjs-auth` (`src/skills/nextjs-auth/SKILL.md`)
recommends HttpOnly cookies set by Next.js and rates `localStorage` as "NOT recommended".
`api-security` (`src/skills/api-security/SKILL.md`) reserves the Sanctum CSRF cookie flow for
SPAs that use cookies and asks for explicit CORS origins when CORS is needed, which option B avoids.
Both skills load automatically in chapter 04 when the auth code is written: `nextjs-auth` through its
`paths:` globs (`middleware.ts`, `**/*.tsx`) and `api-security` through its description.

## Sign-off: the done condition

`references/tech-research.md` defines done as "ADR written, every claim behind the recommendation
sourced and verified, **and a human has signed it off**". A Proposed ADR is a recommendation, nothing
more.

Maya and Alex go through the report together. Alex checks that every option's cons trace to a verified
source, and Maya answers the first open question: 7 days, and logout revokes only the current token.
That answer confirms BR-04 in `api/docs/context/business-rules.md`, which the product brief had already recorded as an open question. The refresh question is deferred,
and production hosts stay open because the decision doesn't depend on them.

Alex then edits the ADR header. *Diff shown inline; the artifact holds the final file:*

```diff
-# HIRE-2: SPA auth between the Next.js frontend and the Laravel API
+# ADR-0001: SPA auth between the Next.js frontend and the Laravel API

-- **Status:** Proposed
+- **Status:** Accepted
 - **Date:** 2026-10-20
+- **Deciders:** Maya Chen (product owner), Alex Rivera (developer)
+- **Ticket:** HIRE-2
+- **Recorded as:** INV-05 in the workspace `CLAUDE.md`, `api/CLAUDE.md` and `web/CLAUDE.md`
```

```diff
 ## Open Questions

-- Token lifetime and whether logout revokes only the current token or all of them.
-- Refresh / sliding expiry: needed for v1?
-- Production hostnames (affects the Secure cookie domain, not the decision).
+- [x] Token lifetime and logout behavior: 7 days, logout revokes the current token only (Maya Chen,
+  2026-10-20; recorded as BR-04).
+- [ ] Refresh or sliding expiry is deferred. Users sign in again after 7 days. Revisit if support
+  requests show it is a problem.
+- [ ] Production hostnames are not chosen yet. The decision does not depend on them, but they set the
+  `Secure` cookie domain.
```

Then the rename and the commit, from inside `api/`:

```bash
mv docs/adr/0001-spa-auth-between-nextjs-and-laravel-api.md docs/adr/0001-spa-auth.md
git -C . add docs/adr/0001-spa-auth.md
git -C . commit -m "docs(adr): 0001 SPA auth via BFF-held Sanctum tokens"
```

### Make the decision an invariant

An ADR in a folder doesn't stop a later session from reaching for `localStorage`. Turning it into an
invariant does, because the invariant loads with every session. Until now the workspace `CLAUDE.md`,
`api/CLAUDE.md` and `web/CLAUDE.md` carried INV-05 as the bare constraint from the product brief, with
no mechanism, no cookie name and no claim about which origin the browser talks to. The decision is
what earns those details, so the sign-off adds them to all three files. *Diff, identical in each file
apart from the path:*

```diff
-| INV-05 | No API token is readable by browser JavaScript. |
+| INV-05 | The browser never holds the API token. The Next.js server keeps it in the HttpOnly cookie `hireboard_session` and calls the API itself; the browser never calls :8000 (ADR-0001). |
```

Alex then checks that the reference resolves and that the three copies agree:

```bash
grep -n "INV-05" ../CLAUDE.md CLAUDE.md ../web/CLAUDE.md
ls docs/adr/0001-spa-auth.md
```

All three lines now name `hireboard_session` and ADR-0001, and the ADR file is there. The
"Recorded as" line added to the ADR header above is the reverse link. Alex commits the `api/` and
`web/` changes in their own repos (`docs: record ADR-0001 in INV-05`). The workspace file has no git,
so that edit is only saved.

HIRE-2 is done: the ADR is written, every claim in it is verified, Maya has signed it off, and the
decision is in context for every future session.

## Further reading

- [src/docs/USAGE-EXAMPLES.md, "3. Technology decision"](../../reference/usage-examples.md#3-technology-decision)
  covers the general version of this flow.
- [src/skills/sdd/references/tech-research.md](https://github.com/stasmarkov/sdd-kit/blob/v4.0.0/plugins/sdd-kit/skills/sdd/references/tech-research.md)
  lists the route's arguments, phases, outputs and done condition.
- [docs/multi-repo.md](../../reference/multi-repo.md) explains why `--add-dir` needs the environment variable.

## What you have now

- `api/docs/adr/0001-spa-auth.md`, Accepted by Maya Chen and Alex Rivera: Sanctum personal access tokens
  held by the Next.js server in the HttpOnly `hireboard_session` cookie, with SPA cookie auth as the
  recorded runner-up.
- A report that lists the claims verification dropped, so nobody later mistakes them for reasons behind
  the decision.
- INV-05 in the workspace and both repo `CLAUDE.md` files, extended with the mechanism and cookie name now that an accepted ADR backs it, plus BR-04 confirmed (7-day tokens, logout revokes the
  current token), ready for the HIRE-3 spec to cite.

Next: [04 — First feature: accounts and roles via write-spec → approval → ship-feature (HIRE-3)](04-feature-accounts-and-roles.md)

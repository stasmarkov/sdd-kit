# CI providers other than GitHub Actions

Load from Step 1 when the origin host is Bitbucket or GitLab. GitHub runs use the `gh` commands in SKILL.md. Each section gives the same five things: input to failing run, failed jobs and log, head commit, rerun, and where the step's command lives. Every command here only reads, apart from the GitLab retry, which needs the user's confirmation.

## Bitbucket Pipelines

Bitbucket Cloud has no first-party CLI, so the log comes from read-only REST calls with `curl`. Workspace and repo are the first two path segments of the origin URL (as in `/open-pr`).

**Credentials.** Read from the environment, never printed, never written to a file:

- `BITBUCKET_EMAIL` and `BITBUCKET_API_TOKEN`: an Atlassian API token with scopes, sent as Basic auth. Grant only `read:pipeline:bitbucket`, `read:pullrequest:bitbucket` and `read:repository:bitbucket`.
- or `BITBUCKET_ACCESS_TOKEN`: a repository or workspace access token with Pipelines read, Pull requests read and Repositories read, sent as a Bearer header. Replace `-u "$BITBUCKET_EMAIL:$BITBUCKET_API_TOKEN"` with `-H "Authorization: Bearer $BITBUCKET_ACCESS_TOKEN"` in every call below.

Neither set (`test -n "$BITBUCKET_API_TOKEN"`, never `echo` it): ask the user to paste the failed step's log, or run `/fix-ci local "<failing command>"`. Never ask for the token in chat. A `401` or `403` means a missing scope; name the three read scopes as the fix.

Only `GET`: no `-X`, `--request`, `-d`, `--data` or `-F` on any call. Logs redirect to storage, hence `-L`.

| Need | How |
|------|-----|
| PR number | `curl -sfL -u "$BITBUCKET_EMAIL:$BITBUCKET_API_TOKEN" "https://api.bitbucket.org/2.0/repositories/<workspace>/<repo>/pullrequests/<id>"` gives `source.branch.name` and `source.commit.hash` (a short hash) |
| Bare `/fix-ci` | branch from `git branch --show-current` |
| Failing pipeline for a branch | `curl -sfL -u "$BITBUCKET_EMAIL:$BITBUCKET_API_TOKEN" "https://api.bitbucket.org/2.0/repositories/<workspace>/<repo>/pipelines?target.branch=<branch>&sort=-created_on&pagelen=20"`; take the newest entry whose `state.result.name` is `FAILED` or `ERROR` and whose `target.commit.hash` starts with the PR's `source.commit.hash` (for a branch: the newest failed one) |
| `--run=<URL>` | `https://bitbucket.org/<workspace>/<repo>/pipelines/results/<n>`: `<n>` is the `build_number`, not the UUID. Page through the list above without the branch filter (`&page=2`, ...) until `build_number` equals `<n>`, and use that entry's `uuid` |
| Failed steps | `curl -sfL -u "$BITBUCKET_EMAIL:$BITBUCKET_API_TOKEN" "https://api.bitbucket.org/2.0/repositories/<workspace>/<repo>/pipelines/<pipeline-uuid>/steps/"`; keep the steps whose `state.result.name` is `FAILED` or `ERROR` (`name`, `uuid`) |
| Step log | `curl -sfL -u "$BITBUCKET_EMAIL:$BITBUCKET_API_TOKEN" "https://api.bitbucket.org/2.0/repositories/<workspace>/<repo>/pipelines/<pipeline-uuid>/steps/<step-uuid>/log" \| grep -nE 'ERROR\|Error:\|FAIL\|✘' \| head -60`, then read the full log around the first hit |
| Head commit (Commit match) | the pipeline's `target.commit.hash` |
| Flaky check | the list filtered by `target.commit.hash=<sha>`: a `SUCCESSFUL` pipeline for the same commit means the failure is nondeterministic |
| Rerun (`INFRA`) | No API call. Print: "In Bitbucket, open the pipeline and choose Rerun > Rerun failed steps." |

UUIDs come wrapped in braces (`{1a2b...}`); percent-encode them in the path (`%7B1a2b...%7D`).

**Where the step lives.** `bitbucket-pipelines.yml`: the step's `script:` lines (plus any `cd` in them; there is no working-directory key), its `image:` or the global one, `services:` on the step with their definitions under `definitions.services`, `caches:`, `size:` and `max-time:`. Selection is by `pipelines.default`, `branches:`, `pull-requests:`, `tags:` and `custom:`, and a step can be limited by `condition.changesets.includePaths`. There is no local validator; read the YAML against the Bitbucket configuration reference and check the indentation of `step:` lists by eye.

## GitLab CI

Use `glab`, always non-interactively: every log read names its job (`glab ci trace <job-id>`), and `--output json` replaces the TUI views. A self-managed host needs `glab auth login --hostname <host>` once.

| Need | How |
|------|-----|
| MR number | `glab mr view <iid> --output json` gives `source_branch` and `sha`; the head pipeline's failed jobs: `glab ci get --merge-request <iid> --status failed --with-job-details --output json` |
| Bare `/fix-ci` | `glab ci get --branch "$(git branch --show-current)" --status failed --with-job-details --output json` |
| `--run=<URL>` | `.../-/pipelines/<id>`: `glab ci get --pipeline-id <id> --status failed --with-job-details --output json`. `.../-/jobs/<job-id>`: go straight to the log |
| Job log | `glab ci trace <job-id> \| grep -nE 'ERROR\|Error:\|FAIL\|✘' \| head -60`, then read the full log around the first hit |
| Head commit (Commit match) | the pipeline's `sha` |
| Flaky check | `glab ci list --sha <sha> --status success --output json`: a passing pipeline for the same commit means the failure is nondeterministic |
| Rerun (`INFRA`) | `glab ci retry <job-id>`, only after the user confirms with `AskUserQuestion`; otherwise print it |

**Where the job lives.** `.gitlab-ci.yml` and any local `include:` files (commonly under `.gitlab/`): the job's `script:` with `before_script:` and `default:` blocks it inherits, `extends:` templates, `image:`, `services:`, `variables:`, and `rules:` / `only:` / `except:` for when it runs. A remote or project `include:` cannot be diffed locally; name it in the report. Validate with `glab ci lint`.

## Weakening spellings

These join the CI row of the Hard rule in SKILL.md, and the Step 5 detector covers each one.

| Spelling | Provider | Effect |
|----------|----------|--------|
| `allow_failure: true` | GitLab | the job fails without failing the pipeline |
| a command moved to `after-script:` / `after_script:` | Bitbucket / GitLab | runs after the result is decided, so its failure no longer fails the step |
| `when: manual`, `when: never` | GitLab | the job no longer runs automatically |
| `trigger: manual` on a step that ran automatically | Bitbucket | the step waits for a click |
| narrowed `condition.changesets` / `rules:changes` | Bitbucket / GitLab | the job skips changes it used to check (caught by the `--stat` list) |

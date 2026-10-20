# Role dispatch and model policy

Recommended arrangement: a Sol 6.1 primary (medium reasoning) owns implementation and
corrections. Astra owns one bounded substantive design
pass. A separate reviewer owns final inspection. This saves a separate worker
handoff and keeps Astra out of routine test/edit/status loops. An Astra primary that
delegates execution is a supported fallback, with more parent overhead; it must not
reimplement or re-review the worker's work.

These are configurable workflow defaults, not availability guarantees:

| Role | Configuration | Default | When |
|---|---|---|---|
| Primary / execution | Project `.codex/config.toml`; `pw_worker.toml` if delegated | Sol 6.1, medium | Ordinary implementation and corrections |
| Coordinator / Patch release delegate | `pw_coordinator.toml` | Sol 6.1, medium | Authorized queue routing and, only under a valid standing owner grant, release approval/execution dispatch |
| Designer | `pw_designer.toml` | Astra, medium | Nontrivial design, ambiguity or focused escalation; high for difficult sensitive reasoning |
| Reviewer | `pw_reviewer.toml` | Sol 6.1, medium | ROUTINE/STANDARD final review |
| Consequential reviewer | `pw_reviewer_high.toml` | Astra, high | HIGH final review, separate from designer/worker |

The TOMLs under `.codex/agents/` are the dispatch source of truth for model IDs and
default efforts. Do not duplicate model policy in the repository facts profile.
Installation sets the project primary default to the worker model and medium effort.
Every non-Astra coding role defaults to Sol 6.1 / medium. Verify effective named-profile,
session and CLI overrides; project files do not switch a running chat. Preserve custom
role instructions while reconciling old owned model/effort fields to this policy. Later
deliberate overrides must be recorded in the TOMLs and matched in the project default
when they affect primary execution. Do not silently substitute a model or effort, or
inherit the parent's model/effort.
A task-specific effort override must use an explicit model/effort spawn with the role
instructions, or a deliberately updated role configuration; a custom agent file
that fixes effort may override a different effort supplied at spawn.

The coordinator is not another implementation owner, designer or reviewer. Follow
`AI_WORKFLOW_COORDINATOR.md`; coordination never requires Astra. Patch's release approval
under `AI_WORKFLOW_RELEASE.md` is an authority decision, not independent review or
implementation. Optional state labels may record queue status, but labels neither
execute models nor self-authorize work or release.

## Dispatch once, verify honestly

1. Inspect the available client tools/model choices and role configuration before
   dependent work. Select Sol 6.1 / Medium in the app for the issue chat if it is not
   already selected. CLI equivalent: `codex -m gpt-6.1-sol -c model_reasoning_effort=\"medium\"`.
   Existing session/CLI overrides may outrank project defaults; do not change account
   settings. A different verified suitable economical model requires a recorded policy
   choice, not an implicit fallback.
2. Use the native custom agent selector when exposed. If tools expose only explicit
   model/effort spawning, read the configured TOML and pass its model, effort and role
   instructions explicitly to the native spawn call, in a fresh bounded context.
   In this desktop tool surface that means `fork_turns="none"`, the configured `model`
   and `reasoning_effort`, plus the handoff message. Do not assume every client has
   these parameter names. Full-history inheritance is not the compact handoff.
3. Send only the source request/contract reference and excerpt, frozen design/decision
   authority, relevant source paths, risk boundaries, base/head, applicable evidence,
   exact assignment, output format and stop conditions. Agents read relevant source
   independently. Wait for the result and relay findings internally. No committee or
   second implementation owner. A designer returns a decision; it does not implement.
4. Record agent/run ID, requested model/effort and available client-reported execution
   metadata. Distinguish configured, requested, accepted dispatch and observed execution.
   A self-reported model name or PASS is not model verification. Read-only sandbox is a
   configuration request; verify effective controls when exposed. Runtime overrides
   can affect them. Reviewer behavior must remain read-only regardless.

If the required designer is unavailable, stop before material design-dependent edits.
If the worker is unavailable, preserve the design and stop implementation instead of
silently running Astra. If final review is unavailable, retain the candidate/evidence
but do not claim readiness. Report the exact tool/model failure and recommended next
step once. A preapproved configured equivalent may be used with visible attribution.

Smallest manual fallback: use the same project in a client that exposes the required
native delegation. If no such client is available, select the economical model for
implementation and open a separate read-only review context with the compact handoff;
Astra must separately supply substantive design. This may require manual selection
and handoff, and does not satisfy hands-off coordination. State that limitation rather
than simulate independence. Do not use external model APIs, GitHub model Actions or
labels as model execution or self-authorizing orchestration. A same-context model
switch does not create independent review.

Supported configuration references and client verification are recorded in the
package's `reports/capabilities.md`; they are install-time documentation, not extra
per-issue reading. Each installation must verify its actual client/account capability.

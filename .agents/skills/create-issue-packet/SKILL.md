---
name: create-issue-packet
description: Turn a feature, bug, workflow, or improvement idea into a GitHub implementation issue packet containing testable product intent. Use when the user asks to make, create, draft, or revise a packet or GitHub issue from an idea. Do not implement the issue or perform deep technical discovery.
---

# Create Issue Packet

Use the **Product packet** section of `docs/AI_ISSUE_WORKFLOW.md` as the authoritative format.

- Capture the user's outcome, current problem, desired behavior, acceptance criteria, non-goals, safety/production boundaries, and genuine open product questions.
- Preserve the user's stated intent and terminology.
- Do not perform deep repository exploration just to fill technical fields.
- Do not speculate about file paths, routes, tables, providers, migrations, implementation architecture, or validation commands that have not been verified.
- If minor technical details are unknown, omit them; they belong in the repository-grounded Implementation Note created when `Work issue X` begins.
- Ask only when a missing answer would materially change the user-visible product outcome. Otherwise create the packet with reasonable product-level wording.
- Creating the issue is not implementation authorization. Stop after the issue is created or the draft packet is delivered.

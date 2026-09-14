# Second Brain

## Product direction
A task-first personal workspace: a quiet light canvas, ink-blue actions, an editorial Instrument Serif heading, Inter controls, subtle borders, a consistent spacing rhythm, and one task row/editor everywhere. The assistant lives beside the plan on wide screens and in an accessible modal sheet on tablets and phones. Mobile has its own labelled bottom navigation and central capture action.

## Reference research
- [SmoothUI component documentation](https://smoothui.dev/docs/components): controlled animated indicators, shared tokens, keyboard arrows/Home/End and reduced motion. The original `.mdx` URL was unavailable; the current docs and registry were read.
- [Bencho](https://bencho.dev/): synchronized completion and inline confirmation; no falling cards or playful rotations.
- [Amicro](https://github.com/Subhan-code/Amicro--Micro-transitions-): its FadeUp pattern shortened to 180ms and 5px, with reduced-motion handling added.
- [Best Designs on X](https://bestdesignsonx.com/): typography research only; the dynamic gallery could not be inspected completely.

## Reusable implementation
- TaskRow: all task and event lists, completion, metadata, edit target.
- TaskEditor: capture and editing with the same validation and fields.
- FilterTabs: controlled status tabs with keyboard navigation.
- Modal and MobileAssistant: Radix focus management and scroll locking.
- Gemini service: server-only request, bounded relevant context, validated proposed actions and transactional application.

## Boundaries
Manual tasks, profile and journal work independently of Gemini. The user connects a key through Settings. Keys are sent to the same-origin backend, checked with Google, encrypted using AES-GCM with account-bound additional data, and never returned by the API. The encryption secret is a hosted server secret, never source code.

AI creates reviewed task/event, journal, profile and follow-up proposals. It cannot silently delete or complete tasks. Application is transactional and idempotent. Freeform tags remain user-owned. Reminders appear while the app is open; closed-app push delivery is not implemented.

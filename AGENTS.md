# Project instructions

Read `HANDOFF.md` for the product decisions and hosting context before changing this project. Communicate with the owner in Dutch unless they request another language.

## Runtime and checks

- Use Node.js 24+ and pnpm 11.25.0. Preserve `pnpm-lock.yaml`.
- Install with `pnpm install --frozen-lockfile --ignore-scripts`.
- Run `pnpm test` for changes affecting votes, classes, admin actions or uploads.
- Build with `pnpm build`, then run `node --check dist/server/index.js`.
- Start the local preview with `pnpm dev`; its address is `http://127.0.0.1:5174/`.
- Keep `.sites-runtime/`, local SQLite files, uploaded photos, credentials and build output out of Git.

## Preserve user data and behavior

- Tiers are S, A, B, C, D and F. Do not restore E. New rankings and saved drafts may contain at most one S. Preserve historical ballots; loading old drafts returns extra S-docents to unranked.
- Docentduels use a separate activity tab above the class content. Keep them out of the Tierlist panel.
- Use `public/classes.js` as the shared class list. Existing internal ITF IDs must remain stable so saved ballots, class names and reset rounds stay associated.
- Classes have 1–30 unique teachers. Validate ballots, favorites, duels and account drafts against the actual class list. Public setup is one-time; changing existing names requires admin authentication and starts a new class round. Preserve old drafts with their teacher-name snapshot so old positions never transfer to different teachers.
- Preserve separate class rankings and shared teacher identities in the overall ranking.
- Resetting a ranking starts a new round. Do not delete historical votes to implement a reset.
- Applied Drizzle migrations are immutable. Append a migration for schema changes and preserve the journal and snapshots.
- Public visitors must not gain admin reset access.
- School-year storage in `worker/features.js` keeps 2026-2027 class IDs unchanged and prefixes later stored IDs with `YEAR:`. API IDs remain stable. Use the scoped DB for vote/class queries; keep member tierlists explicitly keyed by school year. Archived years reject public writes and admin resets.
- Teacher photos and uploads were removed. Do not restore photo UI or routes. Preserve existing photo tables, immutable migrations and storage bindings without exposing stored files.
- Loading/saving account drafts must not cast a vote or give admin access. Submitting a valid ballot while signed in also saves that tierlist and its teacher-name snapshot in the same database batch. Keep the anonymous voting cookie separate from member authentication.
- Feedback tickets are private to their submitting member and authenticated admins. Use server-side ownership checks and the raw database for tickets across classes and school years. Never expose other members' tickets or account identifiers.

## Production publishing

This is an existing PUBLIC OpenAI Site. Preserve its audience and `.openai/hosting.json` project ID. Do not create a replacement Site or migrate hosting merely because source development moved to GitHub.

Use the installed Sites building/hosting skills and native Sites tools for publishing. Keep the exact source revision in the Sites source repository before saving and deploying a version. GitHub pushes alone do not deploy this website. The Sites workflow may use a separate source repository credential; do not overwrite the GitHub remote to store that credential.

Keep runtime secrets in the hosting configuration. Never commit the admin setup token, its private setup URL, passwords, Git credentials or database exports. Do not initialize a production admin account during tests.

If Sites tools or access to the existing Site are unavailable in a cloud chat, complete the code change and validation in GitHub, then report that publishing requires the existing Site connection. Do not pretend a GitHub commit has published the website.

## Fixed class membership

- Accounts are optional: voting must work for guests with the HttpOnly voter cookie. voting_memberships is the server-side authority, keyed per browser/member and school year. Browsing another class must never change this binding.
- Ranking, duel and favorite writes must match membership and retain revision guards against concurrent class switches. Other classes are read-only and their results are public to bound visitors; the own-class blind-voting rule remains.
- A confirmed class switch deletes only that visitor/account’s linked vote, weekly-vote, duel and favorite rows from the departed classes in the current school year. Preserve saved designs, other visitors, archives and admin reset semantics. Keep the switch and cleanup atomic.

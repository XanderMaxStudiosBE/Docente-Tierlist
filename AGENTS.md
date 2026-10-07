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

- Tiers are S, A, B, C, D and F. Do not restore E.
- Use `public/classes.js` as the shared class list. Existing internal ITF IDs must remain stable so saved ballots, class names and reset rounds stay associated.
- Preserve separate class rankings and shared teacher identities in the overall ranking and photo storage.
- Resetting a ranking starts a new round. Do not delete historical votes to implement a reset.
- Applied Drizzle migrations are immutable. Append a migration for schema changes and preserve the journal and snapshots.
- Public visitors must not gain admin reset access or overwrite another uploader's photo.
- School-year storage in `worker/features.js` keeps 2026-2027 class IDs unchanged and prefixes later stored IDs with `YEAR:`. API IDs remain stable. Use the scoped DB for vote/class queries; keep member tierlists explicitly keyed by school year. Archived years reject public writes and admin resets.
- New photos enter `photo_submissions`; only approved `teacher_photos` are public. Do not make pending photo URLs publicly accessible.
- Member accounts only save drafts. Loading/saving drafts must not cast a vote or give admin access.

## Production publishing

This is an existing PUBLIC OpenAI Site. Preserve its audience and `.openai/hosting.json` project ID. Do not create a replacement Site or migrate hosting merely because source development moved to GitHub.

Use the installed Sites building/hosting skills and native Sites tools for publishing. Keep the exact source revision in the Sites source repository before saving and deploying a version. GitHub pushes alone do not deploy this website. The Sites workflow may use a separate source repository credential; do not overwrite the GitHub remote to store that credential.

Keep runtime secrets in the hosting configuration. Never commit the admin setup token, its private setup URL, passwords, Git credentials or database exports. Do not initialize a production admin account during tests.

If Sites tools or access to the existing Site are unavailable in a cloud chat, complete the code change and validation in GitHub, then report that publishing requires the existing Site connection. Do not pretend a GitHub commit has published the website.

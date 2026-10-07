# Docente Ranking

Nederlandstalige docent-tierlists voor 19 klassen, met eigen docentnamen en stemmen per klas en een gezamenlijk IT Factory-klassement.

## Ontwikkelen

Gebruik Node.js 24 of hoger en pnpm 11.25.0. De lokale preview en tests gebruiken Node's ingebouwde SQLite.

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm dev
```

De preview draait op `http://127.0.0.1:5174/`. Lokale testdata en foto's staan in de genegeerde map `.sites-runtime/`.

```sh
pnpm test
pnpm build
node --check dist/server/index.js
```

De tests gebruiken eigen tijdelijke databanken en wijzigen geen productiegegevens. De twee testsuites controleren stemmen, klassen, admin-authenticatie, resets en foto-opslag.

## Codex cloud

Selecteer deze repository in een Codex cloud environment. Laat de omgeving Node.js 24 en de vastgelegde pnpm-versie installeren. Laat Codex `pnpm test`, `pnpm build` en de Worker-syntaxcontrole uitvoeren voordat je de omgeving publiceert. Lees `AGENTS.md` en `HANDOFF.md` bij het starten van een nieuwe chat.

## Opbouw en hosting

- `public/`: website, adminpagina en gedeelde klassenlijst.
- `worker/`: Cloudflare Worker, stemmen-API, admin-authenticatie en uploads.
- `db/` en `drizzle/`: D1-schema en onveranderlijke, opeenvolgende migraties.
- `scripts/`: preview, lokale opslag, tests en build.
- `.openai/hosting.json`: bestaande OpenAI Sites-projectidentiteit en logische bindings `DB` (D1) en `PHOTOS` (R2).

De website blijft gehost op OpenAI Sites. GitHub en Codex cloud zijn voor ontwikkeling; GitHub Pages kan deze Worker met databank en uploads niet vervangen. Publiceer wijzigingen via Sites naar hetzelfde project. Productiestemmen, foto's, adminaccount en geheimen blijven bij de bestaande hosting.

Productie: https://docente-ranking.maxdepoesgames.chatgpt.site/

Eigen domein: `docente-ranking-thomasmoregeel.eu`. Raadpleeg de actuele domeinstatus via Sites; de laatste status in `HANDOFF.md` is een momentopname.

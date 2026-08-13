# Codex Checkpoints

| Checkpoint | State | Resume evidence |
| --- | --- | --- |
| Source prompt mapped | Complete | `docs/GOAL_COMPLETION_MATRIX.md` |
| Baseline audited | Complete | `docs/TECHNICAL_AUDIT.md` |
| Core safety implementation | Complete | `server/ledger.ts`, `server/index.ts`, `client/src/pages/Home.tsx` |
| Deployment and CI | Complete | `Dockerfile`, `docker-compose.yml`, `.github/workflows/ci.yml` |
| Automated API regression | Complete | `npm run check:release`; `docs/FINAL_VERIFICATION_REPORT.md` |
| Browser acceptance | Complete | desktop/mobile and console evidence in final report |
| Windows installer | Complete | isolated install plus SHA-256 in final report |
| Windows upgrade/data safety | Complete | migration, DPAPI encryption, configuration restart, in-use owned-process stop, and byte-preserving reinstall in release gate |
| Live ngrok plus HAI | Complete | bounded installed-launcher HTTPS, exact-Host `200`/`421`, and teardown acceptance in final report |
| Fresh source snapshot | Complete | clean dependency and release checks in final report |
| Commit and push | Release handoff | final branch/commit and remote status are reported by Git after document freeze |

For later maintenance, start with `git status`, `npm run doctor`, and `npm run check:release`; do not repeat completed implementation unless a regression is found.

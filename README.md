# LastLight

LastLight is a three-turn station survival game for GenLayer. It is a new project and does not modify Dispute Court.

Live app: https://lastlight-ten.vercel.app

The [build specification](../lastlight-blueprint/BUILD_SPEC.md) fixes the game rules. `content/kestrel-01.json` is the authored mission source. Run `npm run generate` after changing it to regenerate the single-file contract's embedded rules and the web display copy.

## Local development

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
npm install
npm run generate
npm run dev
```

The web app opens in read-only mode until the address in `web/src/deployment.json`, `VITE_LASTLIGHT_CONTRACT_ADDRESS`, or the browser's local deployment setting passes the on-chain mission-hash check. A design-only simulation is in the separate `lastlight-blueprint` folder and is never used as a live fallback.

## Checks

```powershell
npm test
npm run build
genvm-lint lint contracts\lastlight.py --json
```

`genvm-lint check` additionally needs the pinned GenVM runner archive installed in the local validator. The direct tests have a test-only workaround for `gltest`'s Windows temporary-file unlink behavior.

Before any network transaction, inspect the deployed contract, network, wallet, and public plan. All contract methods require zero attached GEN; network fees may still apply. No private key belongs in this repository.

## Studionet verification

Deployed contract: `0xD5682Ee05Fa8E86fd462b2c2fCB1c7d4e716B8db` (chain 61999). The contract's `get_config()` returned mission hash `ad4eb443e42d11fb278145b94bc9d247b366b9780cf08ef09f7c37dfa88d0465`, matching the generated content.

The first signed solo end-to-end mission is `d02cbb717b331525c5a809cad760ef6d`. Public reads returned three `SUCCESS` bands, `COMPLETED`, `RESCUED`, score 290, and final resources oxygen 48, power 39, hull 80. The same state appeared after a browser reload.

The two-person crew flow was also completed on Studionet in mission `335e46e2136a3cb6d576587f86c82fca`. The host created the mission, the invited wallet joined, and the turns alternated host → guest → host. All three consensus judgments were `SUCCESS`; the finalized outcome was `RESCUED`, score 290, and final resources oxygen 48, power 39, hull 80. Plans and judgments are public on-chain. Each game action attached 0 GEN; network fees may apply.

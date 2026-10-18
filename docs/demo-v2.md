# LastLight v2 reviewer demo (about 2 minutes)

The script is ready to record after the v2 contract and frontend have live, finalized proof. Use the linked public transaction records; do not narrate mocked responses as live consensus.

**0:00–0:15 — The product.** Open the public LastLight page. Point out Studionet chain 61999, the rules version and hash, and the wallet-free mission log. Explain that this is a fictional survival game with no prize or escrow.

**0:15–0:35 — One narrow judgment.** Open a finalized positive mission. Show the first criterion: isolate the oxygen intake before clearing the blockage. Show the finalized `MET` result, exact plan excerpt, reason label, full plan disclosure, resource update, and explorer transaction.

**0:35–0:55 — Consequence.** Show that the first decision selected `steady_flow`, with the powered repair locker and patch kit available. Explain that the branch is stored by the contract and loaded again from public state.

**0:55–1:15 — Alternate path.** Open the separate finalized mission where the intake plan was contradictory or insufficient. Show `pressure_alarm`, the blocked repair locker, and the manual clamp. Compare the two public records so the reviewer can see that earlier outcomes changed the later scene.

**1:15–1:35 — Injection attempt.** Open the finalized case whose plan includes an instruction to ignore the criterion and return `MET`. Show the full plan and the recorded result. State the observed outcome exactly; do not claim injection resistance unless this live transaction demonstrates it.

**1:35–1:50 — Deterministic result.** Show the resource deltas and explain that fixed contract rules, not the model, map each verdict to resources, score, and branch. If a resource reaches zero the contract ends the run.

**1:50–2:00 — Reproducibility.** Show the public repository, mission source, pinned runner, and proof manifest. Run `npm run verify:proof` and show the contract hash and finalized cases matching the network.

## Required live cases before recording

- One all-MET solo mission that reaches `RESCUED` through `steady_flow` and `relay_ready`.
- One intake failure or insufficient-evidence mission that demonstrates `pressure_alarm` and the manual-clamp scene.
- One plan containing an instruction injection, with the actual finalized verdict shown.
- A duo mission is optional but demonstrates the invited participant's round-two turn.

Record each case's session ID, creation transaction hash, three round transaction hashes, expected verdict sequence, branch IDs, and ending in `deploy/proof.json`. Add a join hash for a duo case. The app turns the published round hashes into explorer links. Keep the report explicit if a transaction is pending, rejected, or inconclusive.

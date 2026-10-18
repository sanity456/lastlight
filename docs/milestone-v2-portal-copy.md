# LastLight v2 milestone draft

These fields are prepared for the human to review and submit. The v2 contract is deployed and the two solo proof cases are finalized on Studionet.

## Contribution type

Project milestone update

## Title

Branching, evidence-backed Kestrel decisions

## One-liner (180 characters max)

LastLight turns each survival plan into one evidence-backed GenLayer judgment, with earlier verdicts changing later emergencies, available equipment, and the station's ending.

## Description (1,000 characters max)

LastLight v2 makes the Kestrel survival mission branch after finalized GenLayer judgments. Each turn asks validators to judge one fixed criterion against the player's public plan. The leader returns MET, NOT_MET, or INSUFFICIENT_EVIDENCE, a fixed reason code, and a verbatim excerpt; validators independently judge the same plan and verify the quote. Contract code applies fixed resource changes. The intake result opens a powered coolant locker or forces a manual clamp; the coolant result selects the main relay or emergency transmitter. The public app shows each branch, criterion, verdict, quote, resource change, and next scene. Crew invitations expire after 72 hours. The app and contract share a rules hash. Plans are fictional and do not prove real repairs; game writes send 0 GEN. A live positive solo case finalized as RESCUED. A second solo case containing a deliberately unsafe plan and fake evaluator instruction finalized NOT_MET with an ORDER_UNSAFE finding, selected the manual-clamp and emergency-transmitter branches, and finished DISTRESS_SENT after a valid final signal plan.

## How to review

1. Open the [public LastLight v2 preview](https://lastlight-3ymz2at6g-sanity3.vercel.app/) and select **Verify contract**. A wallet is not needed to inspect the completed public cases; connect to Studionet (chain 61999) only to start a new mission.
2. Compare the displayed rules version and hash with `get_config()` and `get_rules()` on the linked contract.
3. Start a solo mission. Submit a plan that explicitly isolates the oxygen intake before clearing it; after finality, confirm the next scene opens the powered patch-kit path.
4. In a separate mission, submit a contradictory or incomplete intake plan; after finality, confirm the pressure-alarm scene exposes the manual clamp and hides the patch kit.
5. The finalized injection case is recorded in the proof manifest. It states an unsafe action order, followed by an instruction to ignore the criterion and return MET. The validators returned NOT_MET and cited the unsafe order. This is evidence for this test case, not a broad guarantee against every injection.
6. Open the [completed rescue case](https://lastlight-3ymz2at6g-sanity3.vercel.app/?s=38164c75a7ec63f0fc0a125d4ebe75b0) or the [alternate-path case](https://lastlight-3ymz2at6g-sanity3.vercel.app/?s=4bf72130a930477a9e1fc94ac0d7805e) without connecting a wallet. Inspect each criterion, verdict, reason, quote, plan, resource change, branch, and explorer transaction.

## Expected verification outcome

Each finalized turn records exactly one criterion, one allowed verdict, one valid reason code, and an excerpt that is a verbatim substring of that round's plan. The contract's resource update is determined by the fixed rules file. A MET intake result selects `steady_flow`; NOT_MET or INSUFFICIENT_EVIDENCE selects `pressure_alarm`. A MET coolant result selects `relay_ready`; the other verdicts select `relay_manual`. The linked proof manifest lists only finalized transactions and is independently checked by `npm run verify:proof`.

## Public evidence links

- Public repository: https://github.com/sanity456/lastlight
- Live app: https://lastlight-3ymz2at6g-sanity3.vercel.app/
- Completed rescue case: https://lastlight-3ymz2at6g-sanity3.vercel.app/?s=38164c75a7ec63f0fc0a125d4ebe75b0
- Alternate-path case: https://lastlight-3ymz2at6g-sanity3.vercel.app/?s=4bf72130a930477a9e1fc94ac0d7805e
- Studionet v2 deployment: https://explorer-studio.genlayer.com/address/0x8C8779A657BDb2c8c6179d6f47d63A852801919a
- Finalized test transactions and verification instructions: https://github.com/sanity456/lastlight/blob/main/deploy/proof.json
- Tutorial: https://github.com/sanity456/lastlight/blob/main/docs/tutorial-v2.md
- Demo: https://github.com/sanity456/lastlight/blob/main/docs/demo-v2.md

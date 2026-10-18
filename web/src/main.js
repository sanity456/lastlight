import './styles.css';
import './milestone.css';
import proof from '../../deploy/proof.json';
import {
  CHAIN_ID, EXPLORER, MISSION, MISSION_HASH, configuredAddress, saveAddress,
  validAddress, validSessionId, short, requestWallet, getProvider, client, read,
  write, deploy, waitForFinality, verifyContract, pendingAction, rememberPending,
  forgetPending, savedRoundTx, saveRoundTx, newId, safeError,
} from './lib/chain.js';

const app = document.querySelector('#app');
const query = new URLSearchParams(location.search);
const state = {
  account: '', contract: configuredAddress(), verified: false,
  sessionId: validSessionId(query.get('s')) ? query.get('s') : '',
  session: null, rounds: [], sessions: [], sessionsCursor: 0n, sessionsHasMore: false, tab: 'mission',
  busy: false, pending: pendingAction(), notice: '', error: '', sessionError: '',
  modal: null, plan: '', mode: 'SOLO', guest: '', addressInput: '',
};

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const txLink = hash => `${EXPLORER.replace(/\/$/, '')}/tx/${encodeURIComponent(hash)}`;
const addressLink = address => `${EXPLORER.replace(/\/$/, '')}/address/${encodeURIComponent(address)}`;
const shareLink = id => `${location.origin}${location.pathname}?s=${encodeURIComponent(id)}`;
const resourceClass = value => value <= 20 ? 'critical' : value <= 40 ? 'warning' : 'healthy';
const roundTx = record => {
  const liveCase = proof.contractAddress?.toLowerCase() === state.contract.toLowerCase()
    ? proof.cases.find(item => item.sessionId === record.session_id) : null;
  const fromProof = liveCase?.roundTxHashes?.[record.round_index];
  return /^0x[\da-fA-F]{64}$/.test(fromProof || '')
    ? fromProof : savedRoundTx(state.contract, record.session_id, record.round_index);
};
const currentScenario = () => {
  if (!state.session || state.session.next_round_index >= MISSION.rounds.length) return null;
  const round = MISSION.rounds[state.session.next_round_index];
  return state.session.next_round_index === 0 ? round : round.branches[state.session.branch_id] || null;
};
const scenarioForRecord = record => record.round_index === 0
  ? MISSION.rounds[0]
  : MISSION.rounds[record.round_index].branches[record.branch_id];
const currentPilot = () => state.session && (state.session.mode === 'SOLO' || state.session.next_round_index !== 1 ? state.session.host : state.session.joined_guest);
const actionable = () => state.verified && state.account && !state.busy && !state.pending;

function setSessionId(id) {
  state.sessionId = id;
  state.session = null;
  state.rounds = [];
  state.sessionError = '';
  state.plan = '';
  const url = new URL(location.href);
  if (id) url.searchParams.set('s', id); else url.searchParams.delete('s');
  history.replaceState(null, '', url);
}

function statusLabel(status) {
  return ({ WAITING: 'Waiting for crew', ACTIVE: 'Mission live', COMPLETED: 'Mission complete', FAILED: 'Station lost', CANCELLED: 'Cancelled', ABANDONED: 'Abandoned', EXPIRED: 'Invitation expired' })[status] || status;
}

function button(label, action, extra = '') { return `<button type="button" data-action="${action}" ${extra}>${label}</button>`; }

function renderHeader() {
  return `<header class="topbar">
    <div class="brand" data-action="home" role="button" tabindex="0"><span class="brand-symbol"><span>✳</span></span><span>LAST<span class="brand-accent">LIGHT</span><small>THE KESTREL PROTOCOL</small></span></div>
    <nav class="nav"><button type="button" class="${state.tab === 'mission' ? 'active' : ''}" data-action="tab-mission">Mission control</button><button type="button" class="${state.tab === 'hangar' ? 'active' : ''}" data-action="tab-hangar">My missions</button><button type="button" class="${state.tab === 'rules' ? 'active' : ''}" data-action="tab-rules">How it works</button></nav>
    <div class="header-right"><span class="network"><i></i> STUDIONET · ${CHAIN_ID}</span>${state.account ? `<button class="wallet" type="button" data-action="connect">${esc(short(state.account))}</button>` : `<button class="wallet" type="button" data-action="connect">Connect wallet ↗</button>`}</div>
  </header>`;
}

function renderAlert() {
  const messages = [];
  if (state.error) messages.push(`<div class="alert error" role="alert">${esc(state.error)} ${button('Dismiss', 'dismiss')}</div>`);
  if (state.notice) messages.push(`<div class="alert info" role="status">${esc(state.notice)} ${button('Dismiss', 'dismiss')}</div>`);
  if (state.pending) messages.push(`<div class="alert pending" role="status"><span>Transaction awaiting finality</span><strong>${esc(state.pending.kind)} · ${esc(short(state.pending.hash))}</strong><a href="${esc(txLink(state.pending.hash))}" target="_blank" rel="noopener">Explorer ↗</a>${button('Recheck', 'recheck')}</div>`);
  return messages.join('');
}

function renderSetup() {
  if (state.verified) return '';
  return `<section class="setup-panel"><span class="eyebrow">NETWORK SETUP</span><h2>Bring the mission on-chain.</h2><p>LastLight has no mock game state. Connect a Studionet wallet and select the verified contract to play. Deployment and every game action send <strong>0 GEN</strong> to the contract; normal network fees may apply.</p>
    <div class="setup-row"><label for="contract-address">Contract address</label><input id="contract-address" autocomplete="off" placeholder="0x…" value="${esc(state.addressInput || state.contract)}" /><button type="button" data-action="use-contract">Verify contract</button></div>
    <div class="setup-foot"><span>Mission hash <code>${esc(MISSION_HASH.slice(0, 16))}…</code></span><button class="text-button" type="button" data-action="deploy">Deploy a new LastLight contract ↗</button></div>
  </section>`;
}

function renderHero() {
  return `<section class="hero"><div class="hero-copy"><span class="eyebrow"><span class="eyebrow-line"></span> A BRANCHING COOPERATIVE SURVIVAL MISSION</span><h1>The station is failing.<br /><em>Your words are the tools.</em></h1><p>Three emergencies. One shared fate. Each finalized decision changes the next scene, the tools in reach, and Kestrel's chance of getting home.</p><div class="hero-actions">${button('Start a mission  ↗', 'open-create', 'class="primary"')}${button('Explore the rules  ↓', 'tab-rules', 'class="ghost"')}</div><div class="hero-meta"><span>◉ SOLO OR TWO-PERSON CREW</span><span>◇ NO STAKES OR REWARDS</span><span>✳ EVIDENCE-BACKED OUTCOMES</span></div></div><div class="hero-art" aria-hidden="true"><div class="orbit orbit-one"></div><div class="orbit orbit-two"></div><div class="orbit orbit-three"></div><div class="star-star">✳</div><div class="spacecraft"><div class="wing left"></div><div class="ship-core"><span>KESTREL</span><i></i></div><div class="wing right"></div></div><div class="art-label top">STATION / KESTREL-01</div><div class="art-label bottom">SIGNAL STATUS: OFFLINE <span>●</span></div></div></section>`;
}

function renderCreate() {
  return `<section class="create-panel" id="create"><div class="section-heading"><span class="eyebrow">01 / LAUNCH</span><h2>New mission</h2><p>Choose your crew. The story and scoring rules are fixed before the first decision.</p></div><div class="mode-grid"><button type="button" data-action="mode-solo" class="mode-card ${state.mode === 'SOLO' ? 'selected' : ''}"><span class="mode-icon">◌</span><strong>Solo mission</strong><small>You pilot all three emergencies.</small></button><button type="button" data-action="mode-duo" class="mode-card ${state.mode === 'DUO' ? 'selected' : ''}"><span class="mode-icon">◎</span><strong>Two-person crew</strong><small>Invite one wallet. Turns alternate A → B → A.</small></button></div>${state.mode === 'DUO' ? `<label class="field-label" for="guest">Invited wallet</label><input id="guest" placeholder="0x…" value="${esc(state.guest)}" spellcheck="false" /><small class="hint">Only this address can join. No public matchmaking.</small>` : ''}<div class="launch-row"><div><strong>KESTREL-01</strong><small>Life support → Engineering → Communications</small></div>${button('Create on Studionet  ↗', 'create', `class="primary" ${!actionable() ? 'disabled' : ''}`)}</div></section>`;
}

function renderResource(name, value) {
  return `<div class="resource ${resourceClass(value)}"><div><span>${name}</span><strong>${esc(value)}<small>/ 100</small></strong></div><div class="meter"><i style="width:${Math.max(0, Math.min(100, Number(value)))}%"></i></div></div>`;
}

function renderRound(record) {
  const scenario = scenarioForRecord(record);
  const judgment = record.judgment || {};
  const verdict = judgment.verdict || 'INSUFFICIENT_EVIDENCE';
  const reason = MISSION.reasonCodes[judgment.reason_code] || 'No reason code was recorded.';
  const hash = roundTx(record);
  return `<article class="round-record"><div class="record-top"><span class="eyebrow">ROUND 0${record.round_index + 1} · ${esc(scenario.sector || MISSION.rounds[record.round_index].sector)} · PATH ${esc(record.branch_id)}</span><span class="band ${esc(verdict.toLowerCase())}">${esc(verdict.replaceAll('_', ' '))}</span></div><h3>${esc(scenario.title)}</h3><p class="judged-criterion"><strong>Criterion:</strong> ${esc(record.criterion?.text || scenario.criterion.text)}</p><p class="judgment-reason">${esc(reason)}</p><div class="evidence-quote"><span class="mini-label">VERBATIM PLAN EVIDENCE</span><blockquote>${judgment.quote ? esc(judgment.quote) : 'No supporting excerpt was found in the plan.'}</blockquote></div><details class="full-plan"><summary>Read the full public plan</summary><blockquote>${esc(record.plan)}</blockquote></details><div class="record-bottom"><span>${esc(short(record.actor))} · ${esc(new Date(record.resolved_at * 1000).toLocaleString())}${hash ? ` · <a href="${esc(txLink(hash))}" target="_blank" rel="noopener">Finalized transaction ↗</a>` : ''}</span><span>O₂ ${esc(record.resources_before.oxygen)} → ${esc(record.resources_after.oxygen)} · PWR ${esc(record.resources_before.power)} → ${esc(record.resources_after.power)} · HULL ${esc(record.resources_before.hull)} → ${esc(record.resources_after.hull)}</span></div></article>`;
}

function renderSession() {
  const s = state.session;
  if (!s) return `<section class="loading-panel"><span class="eyebrow">MISSION RECORD</span><h2>${state.sessionError ? 'Mission unavailable' : state.sessionId && state.verified ? 'Loading mission…' : state.sessionId ? 'Contract needed' : 'No mission selected'}</h2><p>${esc(state.sessionError || (state.sessionId && !state.verified ? 'Verify the matching LastLight v2 contract above to open this mission.' : state.sessionId ? 'Reading confirmed Studionet state.' : 'Start one below or open a crew invitation.'))}</p>${state.sessionError ? button('Clear mission ID', 'clear-session') : ''}</section>`;
  const scenario = currentScenario();
  const pilot = currentPilot();
  const me = state.account.toLowerCase();
  const myTurn = s.status === 'ACTIVE' && me === pilot;
  return `<section class="mission-panel"><div class="mission-top"><div><span class="eyebrow">MISSION ID / ${esc(s.id.toUpperCase())}</span><h2>Kestrel is ${s.status === 'COMPLETED' ? 'home.' : s.status === 'FAILED' ? 'lost.' : s.status === 'EXPIRED' ? 'awaiting a new crew.' : s.status === 'WAITING' ? 'waiting for its crew.' : 'counting on you.'}</h2></div><span class="status-pill ${esc(s.status.toLowerCase())}">${esc(statusLabel(s.status))}</span></div><div class="mission-meta"><span>HOST <strong>${esc(short(s.host))}</strong></span><span>CREW <strong>${s.mode === 'SOLO' ? 'SOLO' : `${esc(short(s.host))} / ${esc(short(s.joined_guest || s.invited_guest))}`}</strong></span><span>ROUND <strong>${Math.min(3, s.next_round_index + 1)} / 3</strong></span><button type="button" data-action="copy-link">Copy mission link ↗</button></div><div class="resources">${renderResource('OXYGEN', s.oxygen)}${renderResource('POWER', s.power)}${renderResource('HULL', s.hull)}</div>
  ${s.status === 'WAITING' ? `<div class="phase-card"><span class="eyebrow">AWAITING CREW</span><h3>One seat remains.</h3><p>Only invited wallet <strong>${esc(s.invited_guest)}</strong> can join before <strong>${new Date(s.invite_deadline * 1000).toLocaleString()}</strong>. The invitation expires after 72 hours; anyone can close it after expiry.</p><div class="phase-actions">${button('Join as invited crew ↗', 'join', `class="primary" ${me !== s.invited_guest || !actionable() || Date.now() / 1000 > s.invite_deadline ? 'disabled' : ''}`)}${button('Cancel mission', 'cancel', `${me !== s.host || !actionable() ? 'disabled' : ''}`)}${Date.now() / 1000 > s.invite_deadline ? button('Close expired invitation', 'expire-invite', !actionable() ? 'disabled' : '') : ''}</div></div>` : ''}
  ${s.status === 'ACTIVE' && scenario ? `<div class="scenario"><div class="scenario-kicker"><span class="eyebrow">ROUND 0${s.next_round_index + 1} / ${esc((scenario.sector || MISSION.rounds[s.next_round_index].sector).toUpperCase())}</span><span class="cost">−${scenario.powerCost} POWER · −${MISSION.oxygenCost} OXYGEN</span></div>${s.next_round_index > 0 ? `<div class="branch-callout"><span class="mini-label">THIS SCENE CHANGED BECAUSE OF ROUND ${s.next_round_index}</span><strong>${s.branch_id === 'steady_flow' ? 'The intake stayed stable; the powered repair locker is open.' : s.branch_id === 'pressure_alarm' ? 'The intake remained unstable; the repair locker is blocked.' : s.branch_id === 'relay_ready' ? 'The coolant repair kept the main relay powered.' : 'The coolant emergency forced the crew onto the backup transmitter.'}</strong></div>` : ''}<h3>${esc(scenario.title)}</h3><p class="scenario-summary">${esc(scenario.summary)}</p><div class="scenario-grid"><div><span class="mini-label">WHAT YOU KNOW</span><p>${esc(scenario.facts)}</p></div><div><span class="mini-label">AVAILABLE EQUIPMENT</span><ul>${scenario.equipment.map(item => `<li>${esc(item)}</li>`).join('')}</ul></div></div><div class="constraints"><span class="mini-label">CONSTRAINTS</span><p>${esc(scenario.constraints)}</p></div><div class="criteria"><span class="mini-label">ONE CONSENSUS CRITERION</span><div><span>01</span>${esc(scenario.criterion.text)}</div></div></div>
    <div class="plan-panel"><div class="plan-head"><span class="eyebrow">YOUR DECISION</span><span>${myTurn ? 'YOU ARE THE CURRENT PILOT' : `WAITING FOR ${esc(short(pilot))}`}</span></div><label for="plan">Explain how your plan addresses the criterion</label><textarea id="plan" maxlength="1200" placeholder="Describe what you would do and how it meets the single criterion…" ${!myTurn || !actionable() ? 'disabled' : ''}>${esc(state.plan)}</textarea><div class="plan-footer"><small><span id="byte-count">${new TextEncoder().encode(state.plan.trim()).length}</span> / ${MISSION.limits.maxPlanBytes} UTF-8 bytes · minimum ${MISSION.limits.minPlanBytes}</small>${button('Submit plan for consensus ↗', 'submit-plan', `class="primary" ${!myTurn || !actionable() ? 'disabled' : ''}`)}</div></div><div class="abandon">${button('Abandon this mission', 'abandon', `class="text-button" ${![s.host, s.joined_guest].includes(me) || !actionable() ? 'disabled' : ''}`)}</div>` : ''}
  ${['COMPLETED', 'FAILED', 'ABANDONED', 'CANCELLED', 'EXPIRED'].includes(s.status) ? `<div class="ending"><span class="eyebrow">FINAL SIGNAL</span><h3>${s.ending === 'RESCUED' ? 'Rescue acknowledged.' : s.ending === 'DISTRESS_SENT' ? 'The distress signal got through.' : s.ending === 'HOLDING_ON' ? 'Still holding on.' : s.ending === 'FAILED' ? 'The station went dark.' : statusLabel(s.status)}</h3><p>Ending: <strong>${esc(s.ending || s.status)}</strong> · Shared score: <strong>${esc(s.final_score)}</strong></p><p>${s.status === 'EXPIRED' ? 'The invitation window closed before the crew joined.' : 'The contract calculated this ending from finalized, evidence-backed judgments and fixed resource rules.'}</p></div>` : ''}
  ${state.rounds.length ? `<div class="history"><div class="section-heading"><span class="eyebrow">MISSION LOG</span><h2>Every decision, on record.</h2></div>${state.rounds.map(renderRound).join('')}</div>` : ''}</section>`;
}

function renderHangar() {
  return `<section class="hangar"><div class="section-heading"><span class="eyebrow">CREW MANIFEST</span><h1>My missions</h1><p>Your confirmed solo and crew missions on Studionet.</p></div>${!state.account ? `<div class="empty"><h3>Connect to see your missions.</h3>${button('Connect wallet ↗', 'connect', 'class="primary"')}</div>` : !state.verified ? `<div class="empty">Verify a LastLight contract to load missions.</div>` : !state.sessions.length ? `<div class="empty"><h3>No missions yet.</h3><p>Start a new Kestrel run or open a crew invitation.</p>${button('Start mission ↗', 'tab-mission', 'class="primary"')}</div>` : `<div class="session-list">${state.sessions.map(s => `<button type="button" data-action="open-session" data-id="${esc(s.id)}"><span><small>${esc(s.mode)} · ${esc(s.id.slice(0, 10).toUpperCase())}</small><strong>${esc(statusLabel(s.status))}</strong></span><span>ROUND ${Math.min(3, s.next_round_index + 1)} / 3 <b>↗</b></span></button>`).join('')}</div>${state.sessionsHasMore ? button('Load more missions ↓', 'load-more', `class="ghost" ${state.busy ? 'disabled' : ''}`) : ''}`}</section>`;
}

function renderRules() {
  return `<section class="rules-page"><span class="eyebrow">FIELD MANUAL / V2</span><h1>No perfect answer.<br /><em>Only the next good decision.</em></h1><div class="rule-cards"><article><b>01</b><h2>Start or join</h2><p>Play solo or invite one specific wallet. In a crew, the host handles rounds one and three; the invited guest pilots round two.</p></article><article><b>02</b><h2>One criterion at a time</h2><p>Each transaction asks validators to judge one defined action against your public plan. The model returns MET, NOT MET, or INSUFFICIENT EVIDENCE with a verbatim excerpt.</p></article><article><b>03</b><h2>Your choices change the mission</h2><p>The contract maps each verdict to fixed resource changes and chooses the next emergency branch. A stable intake opens the powered repair locker; a coolant outcome decides which communications equipment remains.</p></article><article><b>04</b><h2>Inspect the proof</h2><p>Every finalized round shows its criterion, verdict, reason code, evidence excerpt, full public plan, resource changes, and the equipment path selected for the next round.</p></article></div><div class="rules-details"><h2>Nothing is at stake except the station.</h2><p>Game actions attach 0 GEN. There is no escrow, prize, token, NFT, or paid advantage. Wallets pay only any normal network transaction fees. Player plans, judgments, and outcomes are public on Studionet, so do not include private information. Branches use fictional rules and do not prove real-world repair work.</p><code>RULES ${esc(MISSION.rulesVersion)} · SHA-256 ${esc(MISSION_HASH)}</code></div></section>`;
}

function renderModal() {
  if (!state.modal) return '';
  const { title, detail, action, label } = state.modal;
  const warning = action === 'confirm-deploy'
    ? 'Deployment attaches 0 GEN as contract value. A Studionet network fee may apply. The contract source becomes public after finality.'
    : 'This transaction sends 0 GEN to the game contract. A Studionet network fee may apply. Your action and any plan text are public and permanent after finality.';
  return `<div class="modal-backdrop"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><span class="eyebrow">FINAL REVIEW</span><h2 id="modal-title">${esc(title)}</h2><p>${esc(detail)}</p><div class="modal-warning">${warning}</div><label class="confirm-check"><input type="checkbox" id="confirm-box" /> I reviewed the wallet, network, and public action.</label><div class="modal-actions">${button('Back', 'close-modal', 'class="ghost"')}${button(label, action, 'class="primary" disabled id="modal-confirm"')}</div></div></div>`;
}

function render() {
  app.innerHTML = `${renderHeader()}<main>${renderAlert()}${renderSetup()}${state.tab === 'rules' ? renderRules() : state.tab === 'hangar' ? renderHangar() : `${renderHero()}${state.sessionId ? renderSession() : ''}${renderCreate()}`}</main><footer><span>LASTLIGHT / KESTREL-01</span><span>A GENLAYER-NATIVE FICTIONAL SURVIVAL GAME · NO FINANCIAL REWARDS</span>${state.contract ? `<a href="${esc(addressLink(state.contract))}" target="_blank" rel="noopener">CONTRACT ${esc(short(state.contract))} ↗</a>` : '<span>CONTRACT NOT CONFIGURED</span>'}</footer>${renderModal()}`;
}

function message(value, kind = 'notice') { state.error = kind === 'error' ? value : ''; state.notice = kind === 'notice' ? value : ''; render(); }

async function loadSessionPage(reset = false) {
  if (!state.account) {
    state.sessions = [];
    state.sessionsCursor = 0n;
    state.sessionsHasMore = false;
    return;
  }
  const cursor = reset ? 0n : state.sessionsCursor;
  const page = await read(state.contract, 'list_sessions', [state.account, cursor, 20n], state.account);
  const items = Array.isArray(page?.items) ? page.items : [];
  const nextCursor = BigInt(page?.next_cursor ?? cursor + BigInt(items.length));
  if (nextCursor < cursor || (page?.has_more && nextCursor === cursor)) {
    throw new Error('The mission list returned an invalid pagination cursor.');
  }
  if (reset) {
    state.sessions = items;
  } else {
    const existing = new Set(state.sessions.map(session => session.id));
    state.sessions.push(...items.filter(session => !existing.has(session.id)));
  }
  state.sessionsCursor = nextCursor;
  state.sessionsHasMore = Boolean(page?.has_more);
}

async function refresh() {
  if (!validAddress(state.contract)) { state.verified = false; render(); return; }
  try {
    await verifyContract(state.contract, state.account || undefined);
    state.verified = true;
    state.sessionError = '';
    if (state.sessionId) {
      try {
        state.session = await read(state.contract, 'get_session', [state.sessionId], state.account || undefined);
        state.rounds = [];
        for (let i = 0; i < Math.min(3, Number(state.session.next_round_index)); i++) state.rounds.push(await read(state.contract, 'get_round', [state.sessionId, BigInt(i)], state.account || undefined));
      } catch (error) {
        state.session = null;
        state.rounds = [];
        state.sessionError = `Could not load mission ${state.sessionId}. Check the ID and contract address, then retry.`;
      }
    }
    await loadSessionPage(true);
    state.error = '';
  } catch (error) {
    state.verified = false;
    state.error = safeError(error);
  }
  render();
}

async function connect() {
  try {
    state.account = await requestWallet();
    message(`Connected ${short(state.account)} on Studionet.`);
    await refresh();
  } catch (error) { message(safeError(error), 'error'); }
}

async function perform(kind, fn, proof = {}) {
  if (state.busy || state.pending) return;
  state.busy = true; state.modal = null; state.error = ''; state.notice = `Preparing ${kind}…`; render();
  try {
    state.account = await requestWallet();
    if (kind !== 'Deploy contract') await verifyContract(state.contract, state.account);
    const hash = await fn();
    if (!/^0x[\da-fA-F]{64}$/.test(hash || '')) throw new Error('The wallet did not return a valid transaction hash.');
    state.pending = { kind, hash, account: state.account, contract: state.contract, sessionId: state.sessionId, proof, at: Date.now() };
    rememberPending(state.pending);
    state.notice = `Submitted ${kind}. Waiting for GenLayer consensus…`; render();
    const receipt = await waitForFinality(hash, state.account);
    await verifyPendingAction(state.pending, receipt);
    if (kind === 'Submit plan') {
      saveRoundTx(state.pending.contract, state.pending.sessionId, proof.round, hash);
      state.plan = '';
    }
    forgetPending(); state.pending = null;
    state.notice = `${kind} finalized successfully.`;
    await refresh();
  } catch (error) {
    if (/finalized with an execution error/i.test(String(error?.message || ''))) {
      forgetPending(); state.pending = null;
    }
    state.error = safeError(error);
    state.notice = '';
    render();
  } finally { state.busy = false; render(); }
}

async function verifyPendingAction(pending, receipt) {
  if (pending.kind === 'Deploy contract') return finishDeployment(receipt);
  const address = pending.contract;
  const id = pending.proof?.id || pending.sessionId;
  if (!validSessionId(id)) throw new Error('The pending action has no verifiable mission ID. Check its explorer record.');
  if (pending.kind === 'Submit plan') {
    const record = await read(address, 'get_round', [id, BigInt(pending.proof.round)]);
    if (record.action_id !== pending.proof.actionId || record.actor !== pending.account.toLowerCase()) throw new Error('The submitted plan could not be matched to the confirmed round.');
    return;
  }
  const session = await read(address, 'get_session', [id]);
  if (session.id !== id) throw new Error('The mission could not be verified on-chain.');
  if (pending.kind === 'Create mission') {
    if (session.host !== pending.account.toLowerCase()) throw new Error('The created mission host does not match the wallet.');
    setSessionId(id); state.tab = 'mission';
  } else if (pending.kind === 'Join mission' && session.joined_guest !== pending.account.toLowerCase()) {
    throw new Error('The invited crew join was not found on-chain.');
  } else if (pending.kind === 'Cancel mission' && session.status !== 'CANCELLED') {
    throw new Error('The cancellation was not found on-chain.');
  } else if (pending.kind === 'Abandon mission' && session.status !== 'ABANDONED') {
    throw new Error('The abandonment was not found on-chain.');
  } else if (pending.kind === 'Expire invitation' && session.status !== 'EXPIRED') {
    throw new Error('The invitation expiry was not found on-chain.');
  }
}

async function recoverPending() {
  const pending = state.pending;
  if (!pending || state.busy) return;
  state.busy = true; state.notice = 'Checking the transaction’s final consensus result…'; render();
  try {
    const receipt = await waitForFinality(pending.hash, pending.account);
    await verifyPendingAction(pending, receipt);
    if (pending.kind === 'Submit plan') {
      saveRoundTx(pending.contract, pending.sessionId, pending.proof.round, pending.hash);
      state.plan = '';
    }
    forgetPending(); state.pending = null;
    state.notice = `${pending.kind} finalized successfully.`;
    await refresh();
  } catch (error) { state.error = safeError(error); state.notice = ''; }
  finally { state.busy = false; render(); }
}

async function finishDeployment(receipt) {
  const candidate = receipt?.txDataDecoded?.contractAddress || receipt?.to_address || receipt?.recipient;
  if (!validAddress(candidate)) throw new Error('Deployment finalized, but the contract address was not returned. Find it in the explorer before deploying again.');
  await verifyContract(candidate, state.account);
  saveAddress(candidate); state.contract = candidate;
}

function openReview(title, detail, action, label) { state.modal = { title, detail, action, label }; render(); }

async function act(action, target) {
  if (action === 'dismiss') { state.error = ''; state.notice = ''; render(); return; }
  if (action === 'connect') return connect();
  if (action === 'home' || action === 'tab-mission') { state.tab = 'mission'; render(); return; }
  if (action === 'tab-hangar') { state.tab = 'hangar'; await refresh(); return; }
  if (action === 'load-more') {
    if (state.busy || !state.sessionsHasMore) return;
    state.busy = true; state.error = ''; render();
    try { await loadSessionPage(); }
    catch (error) { state.error = safeError(error); }
    finally { state.busy = false; render(); }
    return;
  }
  if (action === 'tab-rules') { state.tab = 'rules'; render(); return; }
  if (action === 'open-create') { document.querySelector('#create')?.scrollIntoView({ behavior: 'smooth' }); return; }
  if (action === 'mode-solo' || action === 'mode-duo') { state.mode = action === 'mode-solo' ? 'SOLO' : 'DUO'; render(); return; }
  if (action === 'close-modal') { state.modal = null; render(); return; }
  if (action === 'recheck') return recoverPending();
  if (action === 'copy-link') { await navigator.clipboard.writeText(shareLink(state.sessionId)); message('Mission link copied.'); return; }
  if (action === 'open-session') { setSessionId(target.dataset.id); state.tab = 'mission'; await refresh(); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  if (action === 'clear-session') { setSessionId(''); render(); return; }
  if (action === 'use-contract') {
    try { const value = document.querySelector('#contract-address')?.value.trim(); await verifyContract(value); saveAddress(value); state.contract = value; await refresh(); if (state.verified) message('Contract verified against LastLight’s mission hash.'); }
    catch (error) { message(safeError(error), 'error'); }
    return;
  }
  if (action === 'deploy') return openReview('Deploy LastLight to Studionet', 'The connected wallet will deploy this pinned mission contract. A network fee applies; no GEN is sent as contract value.', 'confirm-deploy', 'Open MetaMask ↗');
  if (action === 'confirm-deploy') return perform('Deploy contract', () => deploy(state.account));
  if (action === 'create') {
    if (!actionable()) return;
    const guest = state.mode === 'DUO' ? document.querySelector('#guest')?.value.trim() : '';
    if (state.mode === 'DUO' && (!validAddress(guest) || guest.toLowerCase() === state.account.toLowerCase())) return message('Enter a different valid guest wallet address.', 'error');
    state.guest = guest || '';
    return openReview('Create a Kestrel mission', `${state.mode === 'SOLO' ? 'Solo mission' : `Two-person mission with invited wallet ${guest}`}. Mission ID is generated randomly.`, 'confirm-create', 'Open MetaMask ↗');
  }
  if (action === 'confirm-create') {
    const id = newId();
    return perform('Create mission', () => write(state.contract, 'create_session', [id, state.mode, state.guest], state.account), { id });
  }
  if (!state.session || !actionable()) return;
  if (action === 'join') return openReview('Join the crew', `Join mission ${state.sessionId} as invited wallet ${state.account}.`, 'confirm-join', 'Open MetaMask ↗');
  if (action === 'confirm-join') return perform('Join mission', () => write(state.contract, 'join_session', [state.sessionId], state.account));
  if (action === 'cancel') return openReview('Cancel this waiting mission', 'The invited crew will no longer be able to join. This cannot be undone.', 'confirm-cancel', 'Open MetaMask ↗');
  if (action === 'confirm-cancel') return perform('Cancel mission', () => write(state.contract, 'cancel_session', [state.sessionId], state.account));
  if (action === 'expire-invite') return openReview('Close expired invitation', 'The 72-hour join window has passed. This permissionless action closes the waiting mission so it no longer remains open.', 'confirm-expire-invite', 'Open MetaMask ↗');
  if (action === 'confirm-expire-invite') return perform('Expire invitation', () => write(state.contract, 'expire_invitation', [state.sessionId], state.account));
  if (action === 'abandon') return openReview('Abandon this live mission', 'This ends the game for the whole crew with score zero. This cannot be undone.', 'confirm-abandon', 'Open MetaMask ↗');
  if (action === 'confirm-abandon') return perform('Abandon mission', () => write(state.contract, 'abandon_session', [state.sessionId], state.account));
  if (action === 'submit-plan') {
    state.plan = document.querySelector('#plan')?.value.trim() || '';
    const bytes = new TextEncoder().encode(state.plan).length;
    if (bytes < 40 || bytes > 1200) return message('Plan must be 40 to 1200 UTF-8 bytes.', 'error');
    if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(state.plan)) return message('Plan contains unsupported control characters.', 'error');
    const scenario = currentScenario();
    return openReview('Submit your public plan', `Round ${state.session.next_round_index + 1} criterion: “${scenario.criterion.text}” Your plan will be judged against this one criterion. Validators return a fixed verdict and a verbatim excerpt.`, 'confirm-plan', 'Open MetaMask ↗');
  }
  if (action === 'confirm-plan') {
    const id = newId(); const round = Number(state.session.next_round_index); const plan = state.plan;
    return perform('Submit plan', () => write(state.contract, 'submit_plan', [state.sessionId, BigInt(round), id, plan], state.account), { round, actionId: id });
  }
}

app.addEventListener('click', event => {
  const target = event.target.closest('[data-action]');
  if (target && !target.disabled) act(target.dataset.action, target);
});
app.addEventListener('input', event => {
  if (event.target.id === 'plan') {
    state.plan = event.target.value;
    const count = document.querySelector('#byte-count');
    if (count) count.textContent = new TextEncoder().encode(state.plan.trim()).length;
  }
  if (event.target.id === 'guest') state.guest = event.target.value;
  if (event.target.id === 'contract-address') state.addressInput = event.target.value;
  if (event.target.id === 'confirm-box') document.querySelector('#modal-confirm').disabled = !event.target.checked;
});
getProvider()?.on?.('accountsChanged', accounts => { state.account = accounts?.[0] || ''; state.verified = false; state.session = null; state.sessions = []; state.sessionsCursor = 0n; state.sessionsHasMore = false; refresh(); });
getProvider()?.on?.('chainChanged', () => { state.verified = false; state.session = null; refresh(); });

render();
if (getProvider()) {
  getProvider().request({ method: 'eth_accounts' }).then(accounts => {
    if (accounts?.[0]) { state.account = accounts[0]; refresh(); }
    else if (state.contract) refresh();
  }).catch(() => {});
}

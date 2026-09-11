import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  getDatabase,
  ref,
  set,
  update,
  onValue,
  get,
  remove,
  push,
  runTransaction
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-database.js";
import {
  getAuth,
  signInAnonymously
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";
const APP_VERSION = "1.5.5";
const DEFAULT_CRITERIA = [
  ["voiceManagement", "Voice Management", 10],
  ["voiceTiming", "Voice Timing", 20],
  ["costume", "Costume", 5],
  ["props", "Props", 5],
  ["performance", "Performance", 40],
  ["crowdResponse", "Crowd Response", 20]
];
function normalizeCriteria(raw) {
  const source = Array.isArray(raw) ? raw : Object.values(raw || {});
  const list = source.map((x, i) => {
    if (Array.isArray(x)) {
      return [String(x[0] || `criterion${i+1}`), String(x[1] || `Criterion ${i+1}`), Number(x[2]) || 1];
    }
    return [
      String(x?.key || x?.id || `criterion${i+1}`).replace(/[^a-zA-Z0-9_]/g, "_") || `criterion${i+1}`,
      String(x?.label || x?.name || `Criterion ${i+1}`).trim() || `Criterion ${i+1}`,
      Number.isInteger(Number(x?.max)) && Number(x.max) >= 1 ? Number(x.max) : 1
    ];
  });
  return list.length ? list : DEFAULT_CRITERIA.map(x => [...x]);
}
let C = DEFAULT_CRITERIA.map(x => [...x]);
let MAX_TOTAL = C.reduce((total, item) => total + item[2], 0);
function criteriaLocked() {
  return !!D.active || cs().length > 0 || teams().length > 0 || Object.keys(S()).length > 0;
}
function criteriaTotal(list = C) {
  return list.reduce((total, item) => total + Number(item[2] || 0), 0);
}
function criteriaForPerformance(performance) {
  // SOURCE OF TRUTH: the criteria snapshot stored on the performance.
  // This preserves the working v1.4d behavior and prevents an older global
  // criteria set from appearing on a Judge tablet.
  if (performance?.criteria) {
    return normalizeCriteria(performance.criteria);
  }
  // Backward compatibility for performances created before snapshots.
  if (performance && D.active && performance.id === D.active && D.activeCriteria) {
    return normalizeCriteria(D.activeCriteria);
  }
  return normalizeCriteria(D.criteria || C);
}
function draftTotalForCriteria(list, source = draft) {
  return list.reduce((total, [key]) => total + (Number(source[key]) || 0), 0);
}
function bonusPoints() {
  const n = Number(D.bonusPoints);
  return Number.isInteger(n) && n > 0 ? n : 0;
}
function individualRoundCount() {
  return Number(D.individualRoundCount) === 1 ? 1 : 2;
}
function performanceBonus(performance) {
  return performance?.bonusEligible === true ? bonusPoints() : 0;
}
function performanceFinalScore(performance, result) {
  return Number(result?.avg || 0) + performanceBonus(performance);
}
async function hashJudgePassword(password) {
  const data = new TextEncoder().encode(String(password));
  const buffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, "0")).join("");
}
function judgePasswordHash(judgeId) {
  return D.judgePasswords?.[judgeId]?.hash || D.judgePasswords?.[judgeId] || "";
}
function judgePasswordSet(judgeId) {
  return !!judgePasswordHash(judgeId);
}
const J = {
  j1: { no: 1, name: "Judge 1" },
  j2: { no: 2, name: "Judge 2" },
  j3: { no: 3, name: "Judge 3" },
  j4: { no: 4, name: "Judge 4" },
  j5: { no: 5, name: "Judge 5" }
};
const VALID_JUDGE_COUNTS = [3, 5];
const COMPETITION_TYPES = {
  TEAM: "team",
  INDIVIDUAL: "individual"
};
const fb = initializeApp(firebaseConfig);
const db = getDatabase(fb);
const au = getAuth(fb);
const root = document.getElementById("app");
const isJudgePortal = () =>
  new URLSearchParams(window.location.search).get("judge") === "1" ||
  window.location.hash === "#judge";
let D = {};
let role =
  localStorage.getItem("rk_role") || null;
// The dedicated Judge Portal always starts at its login screen.
// Judge authentication is kept in sessionStorage so a refresh in the same
// tab can continue, but a different tablet/tab must authenticate separately.
const judgeSession = (() => {
  try { return sessionStorage.getItem("rk_judge_auth") === "1"; } catch (_) { return false; }
})();
if (isJudgePortal()) {
  role = judgeSession ? "judge" : null;
} else if (role === "judge") {
  role = null;
}
let jid = judgeSession ? (sessionStorage.getItem("rk_judge") || null) : null;
let selectedLoginJudge = null;
let page = "home";
let draft = {};
let submitting = false;
let draftPerformanceId = null;
let judgeFromAuditor = false;
let correctionJudgeId = null;
let correctionPerformanceId = null;
const E = value =>
  String(value ?? "").replace(
    /[&<>"']/g,
    c =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }[c])
  );
/* =========================================================
   COMPETITION TYPE
   ========================================================= */
const competitionType = () =>
  D.competitionType ===
  COMPETITION_TYPES.INDIVIDUAL
    ? COMPETITION_TYPES.INDIVIDUAL
    : COMPETITION_TYPES.TEAM;
const isTeamMode = () =>
  competitionType() ===
  COMPETITION_TYPES.TEAM;
const competitionTypeLabel = () =>
  isTeamMode()
    ? "TEAM COMPETITION"
    : "INDIVIDUAL COMPETITION";
/* =========================================================
   JUDGE COUNT
   ========================================================= */
const judgeCount = () => {
  const value = Number(D.judgeCount);
  return VALID_JUDGE_COUNTS.includes(value)
    ? value
    : 5;
};
const activeJudges = () =>
  Object.entries(J)
    .filter(
      ([id, judge]) =>
        judge.no <= judgeCount()
    )
    .map(([id, judge]) => ({
      id,
      ...judge
    }));
/* =========================================================
   PERFORMANCE NUMBER
   ========================================================= */
const hasDrawNumber = performance => {
  const n = Number(
    performance?.number
  );
  return (
    Number.isInteger(n) &&
    n >= 1
  );
};
const performanceNumber = performance => {
  if (
    hasDrawNumber(performance)
  ) {
    return Number(
      performance.number
    );
  }
  /*
    Backwards compatibility with
    older records which used "order".
  */
  const oldOrder =
    Number(performance?.order);
  if (
    Number.isInteger(oldOrder) &&
    oldOrder >= 1
  ) {
    return oldOrder;
  }
  return Infinity;
};
/* =========================================================
   CONTESTANTS / PERFORMANCES
   ========================================================= */
const cs = () =>
  Object.entries(D.contestants || {})
    .map(([id, x]) => ({
      id,
      ...x
    }))
    .sort((a, b) => {
      const an =
        performanceNumber(a);
      const bn =
        performanceNumber(b);
      if (an !== bn) {
        return an - bn;
      }
      return (
        Number(a.createdAt || 0) -
        Number(b.createdAt || 0)
      );
    });
/* =========================================================
   SCORES
   ========================================================= */
const S = () =>
  D.scores || {};
/* =========================================================
   ACTIVE PERFORMANCE
   ========================================================= */
const A = () =>
  D.active && D.contestants?.[D.active]
    ? { id: D.active, ...D.contestants[D.active] }
    : null;
/* =========================================================
   CURRENT DRAFT TOTAL
   ========================================================= */
const T = (list = C) =>
  draftTotalForCriteria(list, draft);
/* =========================================================
   TEAMS
   ========================================================= */
const teams = () =>
  Object.entries(D.teams || {})
    .map(([id, value]) => ({
      id,
      name:
        typeof value === "string"
          ? value
          : value?.name || ""
    }))
    .filter(x => x.name)
    .sort((a, b) =>
      a.name.localeCompare(b.name)
    );
/* =========================================================
   TEAM NAME
   ========================================================= */
const teamName = teamId => {
  if (!teamId) {
    return "";
  }
  const t =
    D.teams?.[teamId];
  if (
    typeof t === "string"
  ) {
    return t;
  }
  return t?.name || "";
};
/* =========================================================
   TEAM MEMBERS
   ========================================================= */
const teamMembers = teamId => {
  if (!teamId) {
    return [];
  }
  const team =
    D.teams?.[teamId];
  if (
    !team ||
    typeof team === "string"
  ) {
    return [];
  }
  return Object.entries(
    team.members || {}
  )
    .map(([id, member]) => ({
      id,
      ...member
    }))
    .sort((a, b) =>
      String(a.memberId || a.id)
        .localeCompare(
          String(b.memberId || b.id)
        )
    );
};
/* =========================================================
   CONTESTANT TEAM
   ========================================================= */
const getContestantTeam =
  contestant => {
    if (!contestant) {
      return "";
    }
    if (contestant.team) {
      return contestant.team;
    }
    if (contestant.teamId) {
      return teamName(
        contestant.teamId
      );
    }
    return "";
  };
/* =========================================================
   NUMBER VALIDATION
   ========================================================= */
const validNumber = (
  value,
  min,
  max
) => {
  const n =
    Number(value);
  return (
    Number.isFinite(n) &&
    Number.isInteger(n) &&
    n >= min &&
    n <= max
  );
};
/* =========================================================
   DATABASE INITIALIZATION
   ========================================================= */
async function initializeEvent() {
  const eventRef =
    ref(db, "event");
  const snap =
    await get(eventRef);
  if (!snap.exists()) {
    await set(
      eventRef,
      {
        name:
          "Royal Karaoke SKN Championship",
        venue: "",
        date: "",
        competitionType:
          COMPETITION_TYPES.TEAM,
        active: null,
        contestants: {},
        judges: J,
        judgeCount: 5,
        teams: {},
        scores: {},
        criteria: DEFAULT_CRITERIA.map(x => [...x]),
        activeCriteria: DEFAULT_CRITERIA.map(x => [...x]),
        bonusPoints: 0,
        individualRoundCount: 2,
        judgePasswords: {}
      }
    );
    return;
  }
  const event =
    snap.val() || {};
  const updates = {};
  if (
    !VALID_JUDGE_COUNTS.includes(
      Number(event.judgeCount)
    )
  ) {
    updates[
      "event/judgeCount"
    ] = 5;
  }
  if (!event.judges) {
    updates[
      "event/judges"
    ] = J;
  }
  if (!event.judgePasswords) {
    updates[
      "event/judgePasswords"
    ] = {};
  }
  if (!event.teams) {
    updates[
      "event/teams"
    ] = {};
  }
  if (!event.contestants) {
    updates[
      "event/contestants"
    ] = {};
  }
  if (!event.scores) {
    updates[
      "event/scores"
    ] = {};
  }
  if (!event.criteria) {
    updates[
      "event/criteria"
    ] = DEFAULT_CRITERIA.map(x => [...x]);
  }
  if (!event.activeCriteria) {
    updates[
      "event/activeCriteria"
    ] = normalizeCriteria(event.criteria || DEFAULT_CRITERIA);
  }
  if (![1, 2].includes(Number(event.individualRoundCount))) {
    updates["event/individualRoundCount"] = 2;
  }
  if (event.bonusPoints === undefined || event.bonusPoints === null || !Number.isFinite(Number(event.bonusPoints))) {
    updates[
      "event/bonusPoints"
    ] = 0;
  }
  if (
    ![
      COMPETITION_TYPES.TEAM,
      COMPETITION_TYPES.INDIVIDUAL
    ].includes(
      event.competitionType
    )
  ) {
    updates[
      "event/competitionType"
    ] =
      COMPETITION_TYPES.TEAM;
  }
  if (
    Object.keys(updates).length
  ) {
    await update(
      ref(db),
      updates
    );
  }
}
/* =========================================================
   START
   ========================================================= */
async function start() {
  try {
    await signInAnonymously(
      au
    );
  } catch (e) {
    root.innerHTML = `
      <div class="wrap">
        <div class="card">
          <h2>Firebase Authentication Error</h2>
          <p>${E(e.message)}</p>
        </div>
      </div>
    `;
    return;
  }
  try {
    await initializeEvent();
  } catch (e) {
    root.innerHTML = `
      <div class="wrap">
        <div class="card">
          <h2>Firebase Setup Error</h2>
          <p>${E(e.message)}</p>
        </div>
      </div>
    `;
    return;
  }
  onValue(
    ref(db, "event"),
    snapshot => {
      const previousActive =
        D.active || null;
      D =
        snapshot.val() || {};
      C = normalizeCriteria(D.criteria);
      MAX_TOTAL = criteriaTotal(C);
      if (
        previousActive !==
        D.active
      ) {
        draft = {};
        draftPerformanceId =
          D.active || null;
      }
      if (
        role === "judge" &&
        (
          !jid ||
          !J[jid] ||
          J[jid].no >
            judgeCount()
        )
      ) {
        logout();
        return;
      }
      render();
    },
    error => {
      root.innerHTML = `
        <div class="wrap">
          <div class="card">
            <h2>Firebase Database Error</h2>
            <p>${E(error.message)}</p>
          </div>
        </div>
      `;
    }
  );
}
/* =========================================================
   HEADER
   ========================================================= */
function head() {
  return `
    <div class="top">
      <b>
        🎤 ROYAL KARAOKE SKN
        <br>
        <small>
          DIGITAL JUDGING SYSTEM
        </small>
      </b>
      <span class="pill">
        ${
          role === "auditor"
            ? `AUDITOR · ${judgeCount()} JUDGES`
            : role === "judge"
            ? `JUDGE ${J[jid]?.no || "?"}`
            : "WELCOME"
        }
      </span>
    </div>
  `;
}
/* =========================================================
   LOGIN
   ========================================================= */
function login() {
  const availableJudges = activeJudges();
  if (!isJudgePortal()) {
    return `
      <div class="wrap">
        <div class="card hero">
          <div class="big">🎤</div>
          <h1>Royal Karaoke SKN</h1>
          <h2>100-Point Digital Judging System</h2>
          <p class="muted">${E(competitionTypeLabel())}</p>
          <p class="muted">Current competition: <b>${judgeCount()} Judges</b></p>
          <button id="aud" class="primary" type="button">AUDITOR LOGIN</button>
          <p class="muted">Judges should use the dedicated Judge Portal URL.</p>
        </div>
      </div>
    `;
  }
  const selected = selectedLoginJudge ? J[selectedLoginJudge] : null;
  const selectedSet = selected ? judgePasswordSet(selectedLoginJudge) : false;
  return `
    <div class="wrap">
      <div class="card hero">
        <div class="big">🎤</div>
        <h1>Royal Karaoke SKN</h1>
        <h2>Judge Login</h2>
        <p class="muted">${E(competitionTypeLabel())} · ${judgeCount()} Judges</p>
        <h3>Select Your Assigned Judge</h3>
        <div class="login-grid">
          ${availableJudges.map(judge => `
            <button class="jl ${selectedLoginJudge === judge.id ? "primary" : ""}" data-id="${E(judge.id)}" type="button">
              ${E(judge.name)}
            </button>
          `).join("")}
        </div>
        ${selected ? `
          <div class="card" style="margin-top:18px;text-align:left">
            <h3>${E(selected.name)} Password</h3>
            <p class="muted">Enter the password created by the Auditor for this Judge.</p>
            ${selectedSet ? `<input id="judgeLoginPassword" type="password" autocomplete="current-password" placeholder="Enter password" style="width:100%;box-sizing:border-box">\n              <br><br><button id="judgeLogin" class="primary" type="button" style="width:100%">LOGIN AS ${E(selected.name).toUpperCase()}</button>` : `<p class="warn">A password has not been created for this Judge yet. Please ask the Auditor to set it.</p>`}
            <p id="judgeLoginStatus" class="muted"></p>
          </div>
        ` : `<p class="muted">Select your assigned Judge number above.</p>`}
      </div>
    </div>
  `;
}
/* =========================================================
   COMPETITION SETTINGS
   ========================================================= */
function judgePasswordSettings() {
  const enabled = activeJudges();
  return `
    <hr>
    <h3>🔐 Judge Login Passwords</h3>
    <p class="muted">Create or change the password for each enabled Judge. Judges will use the dedicated Judge Login page, select their assigned number, then enter the password. Passwords are stored as one-way hashes; the Auditor cannot view an existing password.</p>
    <div class="table-wrap">
      <table>
        <tr><th>Judge</th><th>Status</th><th>New / Change Password</th></tr>
        ${enabled.map(judge => `
          <tr>
            <td><strong>${E(judge.name)}</strong></td>
            <td>${judgePasswordSet(judge.id) ? '<span class="ok">✓ Password Set</span>' : '<span class="warn">Not Set</span>'}</td>
            <td><input class="judge-password-input" data-id="${E(judge.id)}" type="password" autocomplete="new-password" placeholder="${judgePasswordSet(judge.id) ? 'Enter new password' : 'Create password'}" minlength="4" maxlength="50"></td>
          </tr>
        `).join("")}
      </table>
    </div>
    <br>
    <button id="saveJudgePasswords" class="primary" type="button">SAVE JUDGE PASSWORDS</button>
    <p class="muted">Use at least 4 characters. Leave a field blank if you do not want to change that Judge's existing password.</p>
  `;
}
/* =========================================================
   COMPETITION SETTINGS
   ========================================================= */
function settingsCard() {
  const locked = criteriaLocked();
  const total = criteriaTotal(C);
  const bonus = bonusPoints();
  return `
    <div class="card">
      <h2>⚙️ Competition Settings</h2>
      <p><b>Competition Details</b></p>
      <div class="form-grid">
        <input id="competitionName" value="${E(D.name || "")}" placeholder="Competition Name" maxlength="150">
        <input id="competitionVenue" value="${E(D.venue || "")}" placeholder="Venue" maxlength="150">
        <input id="competitionDate" type="date" value="${E(D.date || "")}">
      </div>
      <br><button id="saveCompetitionDetails" class="primary" type="button">SAVE COMPETITION DETAILS</button>
      <hr>
      <p><b>Competition Type</b></p>
      <div class="login-grid">
        <button id="competitionTeam" type="button" class="${isTeamMode() ? "primary" : ""}">TEAM COMPETITION</button>
        <button id="competitionIndividual" type="button" class="${!isTeamMode() ? "primary" : ""}">INDIVIDUAL COMPETITION</button>
      </div>
      <p>Current: <strong>${E(competitionTypeLabel())}</strong></p>
      ${locked ? `<p class="warn">Competition type, judging criteria, individual round setting and early-registration bonus are locked because registration or scoring has started. Use START NEW COMPETITION to configure the next event.</p>` : `<p class="muted">Choose the competition type and all competition settings before registering contestants.</p>`}
      ${!isTeamMode() ? `
        <hr>
        <h3>🎵 Individual Competition — Number of Rounds</h3>
        <p class="muted">Set this once before registration. Every individual contestant registered in this competition will use the selected number of rounds.</p>
        <div class="form-grid">
          <select id="individualRoundCountSetting" ${locked ? "disabled" : ""}>
            <option value="1" ${individualRoundCount() === 1 ? "selected" : ""}>1 Round</option>
            <option value="2" ${individualRoundCount() === 2 ? "selected" : ""}>2 Rounds</option>
          </select>
        </div>
        <br>
        <button id="saveIndividualRoundCount" class="primary" type="button" ${locked ? "disabled" : ""}>SAVE INDIVIDUAL ROUND SETTING</button>
        <p><strong>Current setting: ${individualRoundCount()} Round${individualRoundCount() === 1 ? "" : "s"} for all individual contestants</strong></p>
      ` : ""}
      <hr>
      <p><b>Number of Judges</b></p>
      <div class="login-grid">
        <button id="judges3" type="button" class="${judgeCount() === 3 ? "primary" : ""}">3 JUDGES</button>
        <button id="judges5" type="button" class="${judgeCount() === 5 ? "primary" : ""}">5 JUDGES</button>
      </div>
      <p>Current setting: <strong>${judgeCount()} Judges</strong></p>
      ${judgePasswordSettings()}
      <hr>
      <h3>🎁 Early Registration Bonus Points</h3>
      <p class="muted">Set the bonus once for this competition. During registration, tick the <strong>Early Registration Bonus</strong> box for each contestant/member who should receive it. The bonus is awarded once per contestant, not once per song or judge.</p>
      <div class="form-grid">
        <input id="bonusPoints" type="number" min="0" max="100" step="1" value="${bonus}" ${locked ? "disabled" : ""} placeholder="Bonus Points">
      </div>
      <br>
      <button id="saveBonusPoints" class="primary" type="button" ${locked ? "disabled" : ""}>SAVE BONUS POINTS</button>
      <p><strong>Current early-registration bonus: +${bonus} point${bonus === 1 ? "" : "s"}</strong></p>
      ${bonus > 0 ? `<p class="ok">✓ Eligible contestants will receive +${bonus} once on their final result.</p>` : `<p class="muted">No early-registration bonus is currently configured.</p>`}
      <hr>
      <h3>📝 Editable Judging Criteria</h3>
      <p class="muted">Create as many scoring segments as you need. Each segment has its own name and maximum points. The judging total must equal exactly 100 points.</p>
      <div class="table-wrap">
        <table>
          <tr><th>#</th><th>Criterion</th><th>Maximum Points</th><th>Action</th></tr>
          <tbody id="criteriaRows">
            ${C.map((x,i) => `
              <tr data-criterion-row="${i}">
                <td><strong>${i+1}</strong></td>
                <td><input class="criterion-label" data-index="${i}" value="${E(x[1])}" maxlength="80" ${locked ? "disabled" : ""}></td>
                <td><input class="criterion-max" data-index="${i}" type="number" min="1" max="100" value="${E(x[2])}" ${locked ? "disabled" : ""}></td>
                <td>
                  <button class="criterion-up" data-index="${i}" type="button" ${locked || i===0 ? "disabled" : ""}>↑</button>
                  <button class="criterion-down" data-index="${i}" type="button" ${locked || i===C.length-1 ? "disabled" : ""}>↓</button>
                  <button class="criterion-delete danger" data-index="${i}" type="button" ${locked || C.length<=1 ? "disabled" : ""}>Delete</button>
                </td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>
      <br>
      <button id="addCriterion" type="button" ${locked ? "disabled" : ""}>＋ ADD JUDGING SEGMENT</button>
      <button id="saveCriteria" class="primary" type="button" ${locked ? "disabled" : ""}>SAVE JUDGING CRITERIA</button>
      <p><strong>Judging total: ${total}/100</strong> ${total===100 ? '<span class="ok">✓ VALID</span>' : '<span class="warn">Must equal 100</span>'}</p>
      ${locked ? '<p class="muted">These settings cannot be changed after registration/scoring begins. Start a new competition before changing them.</p>' : ''}
    </div>
  `;
}
/* =========================================================
   CRITERIA EDITING
   ========================================================= */
function readCriteriaEditor() {
  const labels = [...document.querySelectorAll(".criterion-label")];
  const maxes = [...document.querySelectorAll(".criterion-max")];
  return labels.map((input, i) => [
    C[i]?.[0] || `criterion${i+1}`,
    input.value.trim(),
    Number(maxes[i]?.value)
  ]);
}
function criteriaEditorAdd() {
  if (criteriaLocked()) { alert("Judging criteria are locked after registration or scoring starts."); return; }
  const current = readCriteriaEditor();
  current.push([`criterion${Date.now()}`, `Criterion ${current.length + 1}`, 1]);
  C = current; MAX_TOTAL = criteriaTotal(C); render();
}
function criteriaEditorMove(index, direction) {
  if (criteriaLocked()) return;
  const current = readCriteriaEditor();
  const target = index + direction;
  if (target < 0 || target >= current.length) return;
  [current[index], current[target]] = [current[target], current[index]];
  C = current; MAX_TOTAL = criteriaTotal(C); render();
}
function criteriaEditorDelete(index) {
  if (criteriaLocked()) return;
  const current = readCriteriaEditor();
  if (current.length <= 1) { alert("At least one judging segment is required."); return; }
  current.splice(index, 1); C = current; MAX_TOTAL = criteriaTotal(C); render();
}
async function saveCriteria() {
  if (criteriaLocked()) { alert("Judging criteria are locked after registration or scoring starts. Start a new competition first."); return; }
  const list = readCriteriaEditor();
  if (!list.length) { alert("Add at least one judging segment."); return; }
  const seen = new Set();
  for (const item of list) {
    if (!item[1]) { alert("Every judging segment must have a name."); return; }
    if (!Number.isInteger(item[2]) || item[2] < 1 || item[2] > 100) { alert(`Invalid maximum points for ${item[1]}.`); return; }
    let key = item[0] || `criterion${Date.now()}`;
    key = String(key).replace(/[^a-zA-Z0-9_]/g, "_");
    if (seen.has(key)) key += `_${Math.random().toString(36).slice(2,5)}`;
    item[0] = key; seen.add(key);
  }
  const total = criteriaTotal(list);
  if (total !== 100) { alert(`Judging criteria total ${total} points. The total must equal exactly 100 points.`); return; }
  try {
    await set(ref(db, "event/criteria"), list);
    C = normalizeCriteria(list); MAX_TOTAL = criteriaTotal(C);
    alert(`Judging criteria saved successfully. ${C.length} segments, ${MAX_TOTAL} points total.`);
    render();
  } catch (error) { alert("The judging criteria could not be saved.\n\n" + error.message); }
}
async function saveJudgePasswords() {
  const inputs = [...document.querySelectorAll(".judge-password-input")];
  const updates = {};
  let changed = 0;
  for (const input of inputs) {
    const judgeId = input.dataset.id;
    const password = input.value;
    if (!password) continue;
    if (password.length < 4) {
      alert(`${J[judgeId]?.name || "Judge"} password must be at least 4 characters.`);
      return;
    }
    if (password.length > 50) {
      alert(`${J[judgeId]?.name || "Judge"} password must be 50 characters or fewer.`);
      return;
    }
    updates[`event/judgePasswords/${judgeId}`] = {
      hash: await hashJudgePassword(password),
      updatedAt: Date.now()
    };
    changed++;
  }
  if (!changed) {
    alert("No new passwords were entered.");
    return;
  }
  try {
    await update(ref(db), updates);
    alert(`${changed} Judge password${changed === 1 ? " has" : "s have"} been saved successfully.`);
    render();
  } catch (error) {
    console.error("Judge password error:", error);
    alert("The Judge passwords could not be saved.\n\n" + error.message);
  }
}
async function saveBonusPoints() {
  if (criteriaLocked()) { alert("The early-registration bonus is locked after registration or scoring starts. Start a new competition first."); return; }
  const value = Number(document.getElementById("bonusPoints")?.value);
  if (!Number.isInteger(value) || value < 0 || value > 100) { alert("Bonus points must be a whole number from 0 to 100."); return; }
  try {
    await set(ref(db, "event/bonusPoints"), value);
    alert(`Early-registration bonus saved: +${value} point${value === 1 ? "" : "s"}.`);
    render();
  } catch (error) { alert("The bonus points could not be saved.\n\n" + error.message); }
}
async function saveIndividualRoundCount() {
  if (criteriaLocked()) {
    alert("The individual round setting is locked after registration or scoring starts. Start a new competition before changing it.");
    return;
  }
  const value = Number(document.getElementById("individualRoundCountSetting")?.value);
  if (![1, 2].includes(value)) {
    alert("Choose either 1 Round or 2 Rounds.");
    return;
  }
  try {
    await set(ref(db, "event/individualRoundCount"), value);
    alert(`Individual competition set to ${value} Round${value === 1 ? "" : "s"} for all contestants registered in this competition.`);
    render();
  } catch (error) {
    alert("The individual round setting could not be saved.\n\n" + error.message);
  }
}
/* =========================================================
   RESET
   ========================================================= */
function resetCard() {
  return `
    <div class="card">
      <h2>
        ⚠️ New Competition / Reset Scores
      </h2>
      <p>
        Use this when you are ready to clear the scores
        and start a new competition.
      </p>
      <p class="muted">
        Resetting will permanently remove:
      </p>
      <ul>
        <li>All judge scores</li>
        <li>The active performance</li>
        <li>Any previous scoring data</li>
      </ul>
      <p class="warn">
        Your contestants, teams, performance numbers,
        competition name, venue, judges and judge count
        will remain in place.
      </p>
      <p class="muted">
        After the reset you can change between 3 or 5 judges
        before activating the first performance.
      </p>
      <button
        id="resetCompetition"
        class="danger"
        type="button"
      >
        ⚠️ RESET SCORES / NEW COMPETITION
      </button>
    </div>
  `;
}
/* =========================================================
   AUDITOR DASHBOARD
   ========================================================= */
function dash() {
  const a = A();
  const activeScores =
    D.active
      ? S()[D.active] || {}
      : {};
  const submitted =
    activeJudges().filter(
      judge =>
        activeScores[judge.id]
    ).length;
  const complete =
    submitted === judgeCount();
  const numbered =
    cs().filter(
      hasDrawNumber
    ).length;
  const total =
    cs().length;
  const currentTeam =
    getContestantTeam(a);
  const activationCandidates =
    cs().filter(
      hasDrawNumber
    );
  return `
    <h1>
      Auditor Dashboard
    </h1>
    <div class="grid">
      <div class="card">
        <span class="muted">
          Competition
        </span>
        <h2>
          ${E(
            D.name ||
            "Royal Karaoke SKN Championship"
          )}
        </h2>
        <p>
          ${E(D.venue || "")}
        </p>
        ${D.date ? `<p><b>Date:</b> ${E(D.date)}</p>` : ""}
        <p>
          <b>
            ${E(
              competitionTypeLabel()
            )}
          </b>
        </p>
        <p>
          <b>
            ${judgeCount()} Judges
          </b>
        </p>
      </div>
      <div class="card">
        <span class="muted">
          Performance Numbers
        </span>
        <div class="stat">
          ${numbered}/${total}
        </div>
        <p>
          performances numbered
        </p>
        ${
          total > 0 &&
          numbered === total
            ? `
              <span class="ok">
                ✓ DRAW COMPLETE
              </span>
            `
            : total > 0
            ? `
              <span class="warn">
                DRAW NUMBERS REQUIRED
              </span>
            `
            : `
              <span class="muted">
                No performances registered
              </span>
            `
        }
      </div>
      <div class="card">
        <span class="muted">
          Current Performance
        </span>
        ${
          a
            ? `
              <div class="big">
                #${E(a.number)}
              </div>
              <h2>
                ${E(a.name)}
                ${
                  a.category === "Duet" &&
                  a.name2
                    ? `<br>& ${E(a.name2)}`
                    : ""
                }
              </h2>
              ${
                currentTeam
                  ? `
                    <p>
                      <b>
                        Team:
                      </b>
                      ${E(currentTeam)}
                    </p>
                  `
                  : ""
              }
              <p>
                ${E(a.category || "")}
              </p>
            `
            : `
              <p>
                No active performance
              </p>
            `
        }
      </div>
      <div class="card">
        <span class="muted">
          Judges Submitted
        </span>
        <div class="stat">
          ${submitted}/${judgeCount()}
        </div>
        ${
          complete
            ? `
              <span class="ok">
                ✓ COMPLETE
              </span>
            `
            : `
              <span class="warn">
                WAITING
              </span>
            `
        }
      </div>
    </div>
    ${settingsCard()}
    <div class="card">
      <h2>
        ▶ Activate Performance
      </h2>
      <p class="muted">
        Only performances with a drawn performance
        number can be activated.
      </p>
      ${
        activationCandidates.length
          ? `
            <select id="act">
              <option value="">
                Select performance
              </option>
              ${activationCandidates
                .map(x => {
                  const team =
                    getContestantTeam(x);
                  return `
                    <option
                      value="${E(x.id)}"
                      ${
                        x.id === D.active
                          ? "selected"
                          : ""
                      }
                    >
                      #${E(x.number)}
                      —
                      ${E(x.name)}
                      ${
                        x.category === "Duet" &&
                        x.name2
                          ? ` & ${E(x.name2)}`
                          : ""
                      }
                      ${
                        team
                          ? ` — ${E(team)}`
                          : ""
                      }
                    </option>
                  `;
                })
                .join("")}
            </select>
            <br><br>
            <button
              id="activate"
              class="primary"
              type="button"
            >
              ACTIVATE PERFORMANCE
            </button>
          `
          : `
            <p class="warn">
              No numbered performances are available.
              Go to Contestants and assign the drawn numbers.
            </p>
          `
      }
    </div>
    <div class="card">
      <h2>
        Judge Status
      </h2>
      ${activeJudges().map(judge => {
        const score=activeScores[judge.id];
        return `<div style="margin-bottom:12px"><button class="auditor-judge-score" data-judge-id="${E(judge.id)}" type="button" style="width:100%;text-align:left"><b>${E(judge.name)}</b> — ${score ? `<span class="ok">✓ Submitted — ${Number(score.total||0).toFixed(0)}/100</span><br><small>CLICK TO VIEW / CORRECT THIS JUDGE'S SCORE</small>` : `<span class="warn">Waiting — no score submitted yet</span>`}</button></div>`;
      }).join("")}
    </div>
  </div>
${resetCard()}
  `;
}
/* =========================================================
   TEAM MEMBER OPTIONS
   ========================================================= */
function memberOptions(
  teamId,
  selected = ""
) {
  const members =
    teamMembers(teamId);
  return `
    <option value="">
      Select Member
    </option>
    ${members
      .map(member => `
        <option
          value="${E(member.id)}"
          ${
            selected === member.id
              ? "selected"
              : ""
          }
        >
          ${E(member.memberId || "")}
          —
          ${E(member.name || "")}
          —
          ${E(member.gender || "")}
        </option>
      `)
      .join("")}
  `;
}
/* =========================================================
   TEAM REGISTRATION FORM
   ========================================================= */
function teamRegistration() {
  const rows = Array.from({ length: 5 }, (_, index) => {
    const n = index + 1;
    return `
      <tr>
        <td><strong>Member ${n}</strong></td>
        <td><input id="tmid${n}" placeholder="Member ID" maxlength="30"></td>
        <td><input id="tmname${n}" placeholder="Member Name" maxlength="100"></td>
        <td>
          <select id="tmgender${n}">
            <option value="">Gender</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
          </select>
        </td>
        <td><input id="tmsong${n}" placeholder="Individual Song" maxlength="150"></td>
        <td style="text-align:center"><input id="tmbonus${n}" type="checkbox" title="Award early-registration bonus to this member"></td>
      </tr>
    `;
  }).join("");
  return `
    <div class="card">
      <h2>👥 Register Complete Team</h2>
      <p class="muted">
        Register the complete team before competition night. Each team must have exactly five members,
        five individual performances and exactly one duet — six performances in total.
        If the early-registration bonus is configured, tick the bonus box beside each member who should receive it.
      </p>
      <div class="form-grid">
        <input id="teamId" placeholder="Team ID / Number" maxlength="30">
        <input id="teamName" placeholder="Team Name" maxlength="80">
      </div>
      <br>
      <div class="table-wrap">
        <table>
          <tr>
            <th>#</th>
            <th>Member ID</th>
            <th>Member Name</th>
            <th>Gender</th>
            <th>Individual Song</th>
          </tr>
          ${rows}
        </table>
      </div>
      <br>
      <div class="card">
        <h3>🎤 Team Duet</h3>
        <p class="muted">
          Select two different members from the five above and register the one duet song.
        </p>
        <div class="form-grid">
          <select id="duetMember1">
            <option value="">Duet Member 1</option>
            ${[1,2,3,4,5].map(n => `<option value="${n}">Member ${n}</option>`).join("")}
          </select>
          <select id="duetMember2">
            <option value="">Duet Member 2</option>
            ${[1,2,3,4,5].map(n => `<option value="${n}">Member ${n}</option>`).join("")}
          </select>
          <input id="duetSong" placeholder="Duet Song" maxlength="150">
        </div>
      </div>
      <br>
      <button id="addTeamRoster" class="primary" type="button">
        REGISTER TEAM — CREATE ALL 6 PERFORMANCES
      </button>
    </div>
  `;
}
/* =========================================================
   EXISTING TEAMS
   ========================================================= */
function existingTeams() {
  return `
    <div class="card table-wrap">
      <h2>
        Registered Teams — 5 Members + 1 Duet
      </h2>
      ${
        teams().length
          ? `
            <table>
              <tr>
                <th>
                  Team ID
                </th>
                <th>
                  Team Name
                </th>
                <th>
                  Members
                </th>
                <th>
                  Action
                </th>
              </tr>
              ${teams()
                .map(team => {
                  const members =
                    teamMembers(
                      team.id
                    );
                  return `
                    <tr>
                      <td>
                        ${
                          typeof D.teams?.[team.id] ===
                            "object"
                            ? E(
                                D.teams[
                                  team.id
                                ].teamId || ""
                              )
                            : "—"
                        }
                      </td>
                      <td>
                        <strong>
                          ${E(team.name)}
                        </strong>
                      </td>
                      <td>
                        ${
                          members.length
                            ? members
                                .map(
                                  member =>
                                    `
                                      <div>
                                        <strong>
                                          ${E(
                                            member.memberId ||
                                            ""
                                          )}
                                        </strong>
                                        —
                                        ${E(
                                          member.name ||
                                          ""
                                        )}
                                        —
                                        ${E(
                                          member.gender ||
                                          ""
                                        )}
                                        <br>
                                        <span class="muted">
                                          ${E(
                                            member.song ||
                                            ""
                                          )}
                                        </span>
                                      </div>
                                    `
                                )
                                .join(
                                  "<hr>"
                                )
                            : `
                              <span class="muted">
                                No member roster stored
                              </span>
                            `
                        }
                      </td>
                      <td>
                        <button
                          class="delete-team danger"
                          data-id="${E(team.id)}"
                          type="button"
                        >
                          Delete Team
                        </button>
                      </td>
                    </tr>
                  `;
                })
                .join("")}
            </table>
          `
          : `
            <p>
              No teams have been registered yet.
            </p>
          `
      }
    </div>
  `;
}
/* =========================================================
   TEAM OPTIONS FOR DUET REGISTRATION
   ========================================================= */
function teamOptions(selected = "") {
  const list = teams();
  return `
    <option value="">
      Select Team
    </option>
    ${list
      .map(team => `
        <option
          value="${E(team.id)}"
          ${
            selected === team.id
              ? "selected"
              : ""
          }
        >
          ${E(
            team.teamId ||
            (
              typeof D.teams?.[team.id] === "object"
                ? D.teams[team.id].teamId || ""
                : ""
            )
          )}
          ${
            (
              team.teamId ||
              (
                typeof D.teams?.[team.id] === "object"
                  ? D.teams[team.id].teamId || ""
                  : ""
              )
            )
              ? " — "
              : ""
          }
          ${E(team.name)}
        </option>
      `)
      .join("")}
  `;
}
/* =========================================================
   DUET REGISTRATION
   ========================================================= */
function duetRegistration() {
  return `
    <div class="card">
      <h2>
        🎤 Register Team Duet
      </h2>
      <p class="muted">
        Select two members from the same team.
        The duet becomes a separate performance
        and contributes one final score to the team.
      </p>
      ${
        teams().length
          ? `
            <div class="form-grid">
              <select id="duetTeam">
                ${teamOptions()}
              </select>
              <select id="duetMember1">
                <option value="">
                  Select First Member
                </option>
              </select>
              <select id="duetMember2">
                <option value="">
                  Select Second Member
                </option>
              </select>
              <input
                id="duetSong"
                placeholder="Duet Song"
                maxlength="150"
              >
            </div>
            <br>
            <button
              id="addDuet"
              class="primary"
              type="button"
            >
              ADD DUET PERFORMANCE
            </button>
          `
          : `
            <p class="warn">
              Create a team first before registering a duet.
            </p>
          `
      }
    </div>
  `;
}
/* =========================================================
   INDIVIDUAL REGISTRATION
   ========================================================= */
function individualRegistration() {
  const rounds = individualRoundCount();
  return `
    <div class="card">
      <h2>🎤 Register Individual Contestant — ${rounds} Round${rounds === 1 ? "" : "s"}</h2>
      <p class="muted">
        The competition is set to <strong>${rounds} Round${rounds === 1 ? "" : "s"}</strong> for all individual contestants.
        ${rounds === 2
          ? "Enter a different song for Round 1 and Round 2. Each round is scored independently and the final base score is the average of the two rounds."
          : "Only Round 1 is required. The completed Round 1 score becomes the contestant's final base score."}
        ${bonusPoints() > 0
          ? `The configured early-registration bonus is <strong>+${bonusPoints()} points</strong>; tick the box if this contestant is eligible.`
          : "No early-registration bonus is currently configured."}
      </p>
      <div class="form-grid">
        <input id="individualId" placeholder="Contestant ID / Number" maxlength="30">
        <input id="individualName" placeholder="Contestant / Stage Name" maxlength="100">
        <select id="individualGender">
          <option value="">Select Gender</option>
          <option value="Male">Male</option>
          <option value="Female">Female</option>
        </select>
        <input id="individualSong1" placeholder="Round 1 Song" maxlength="150">
        ${rounds === 2 ? `<input id="individualSong2" placeholder="Round 2 Song" maxlength="150">` : ""}
        <label style="display:flex;align-items:center;gap:10px;padding:10px;border:1px solid #ddd;border-radius:8px;grid-column:1/-1">
          <input id="individualBonus" type="checkbox" ${bonusPoints() === 0 ? "disabled" : ""}>
          <span><strong>Early Registration Bonus</strong> — award the configured +${bonusPoints()} points to this contestant</span>
        </label>
      </div>
      <br><button id="addIndividual" class="primary" type="button">REGISTER INDIVIDUAL</button>
    </div>
  `;
}
/* =========================================================
   DRAW NUMBER SECTION
   ========================================================= */
function drawNumbers() {
  const list =
    cs();
  if (!list.length) {
    return `
      <div class="card">
        <h2>
          🎲 Competition Night Draw
        </h2>
        <p>
          No performances have been registered yet.
        </p>
      </div>
    `;
  }
  const numbered =
    list.filter(
      hasDrawNumber
    ).length;
  return `
    <div class="card">
      <h2>
        🎲 Assign Random Draw Numbers
      </h2>
      <p>
        Enter the number drawn for each performance.
        This is done on competition night.
      </p>
      <p class="muted">
        Do not enter performance order during
        registration. The drawn number automatically
        determines the running order.
      </p>
      <p>
        <strong>
          ${numbered}/${list.length}
        </strong>
        performance numbers assigned.
      </p>
      <div class="table-wrap">
        <table>
          <tr>
            <th>
              Draw #
            </th>
            <th>
              Performer
            </th>
            <th>
              Type
            </th>
            <th>
              Team
            </th>
            <th>
              Song
            </th>
            <th>
              Draw Number
            </th>
          </tr>
          ${list
            .map(x => {
              const team =
                getContestantTeam(x);
              const performer =
                x.category === "Duet" &&
                x.name2
                  ? `${x.name} & ${x.name2}`
                  : x.name;
              return `
                <tr>
                  <td>
                    ${
                      hasDrawNumber(x)
                        ? `#${E(x.number)}`
                        : "—"
                    }
                  </td>
                  <td>
                    <strong>
                      ${E(performer)}
                    </strong>
                  </td>
                  <td>
                    ${E(
                      x.category || ""
                    )}
                  </td>
                  <td>
                    ${E(
                      team ||
                      "Unassigned"
                    )}
                  </td>
                  <td>
                    ${E(
                      x.song || ""
                    )}
                  </td>
                  <td>
                    ${x.bonusEligible === true ? `<span class="ok">+${bonusPoints()}</span>` : "—"}
                  </td>
                  <td>
                    <input
                      class="draw-number-input"
                      data-id="${E(x.id)}"
                      type="number"
                      min="1"
                      max="9999"
                      value="${
                        hasDrawNumber(x)
                          ? E(x.number)
                          : ""
                      }"
                      placeholder="Enter draw #"
                      style="min-width:110px"
                    >
                  </td>
                </tr>
              `;
            })
            .join("")}
        </table>
      </div>
      <br>
      <button
        id="saveDrawNumbers"
        class="primary"
        type="button"
      >
        SAVE DRAW NUMBERS
      </button>
      <p class="muted">
        Each number must be unique.
        The system will automatically use the
        numbers to determine singing order.
      </p>
    </div>
  `;
}
/* =========================================================
   REGISTERED PERFORMANCE LIST
   ========================================================= */
function registeredPerformances() {
  const list =
    cs();
  return `
    <div class="card table-wrap">
      <h2>
        Registered Performances
      </h2>
      <table>
        <tr>
          <th>
            Draw #
          </th>
          <th>
            Performer
          </th>
          <th>
            Type
          </th>
          <th>
            ID
          </th>
          <th>
            Gender
          </th>
          <th>
            Team
          </th>
          <th>
            Song
          </th>
          <th>
            Bonus
          </th>
          <th>
            Status
          </th>
          <th>
            Action
          </th>
        </tr>
        ${
          list.length
            ? list
                .map(x => {
                  const team =
                    getContestantTeam(x);
                  const performer =
                    x.category === "Duet" &&
                    x.name2
                      ? `
                        <strong>
                          ${E(x.name)}
                        </strong>
                        <br>
                        & ${E(x.name2)}
                      `
                      : `
                        <strong>
                          ${E(x.name)}
                        </strong>
                      `;
                  const ids =
                    Array.isArray(
                      x.memberIds
                    )
                      ? x.memberIds
                          .map(
                            memberKey => {
                              const member =
                                D.teams?.[
                                  x.teamId
                                ]?.members?.[
                                  memberKey
                                ];
                              return (
                                member?.memberId ||
                                ""
                              );
                            }
                          )
                          .filter(Boolean)
                          .join(" / ")
                      : (
                          x.contestantId ||
                          ""
                        );
                  return `
                    <tr>
                      <td>
                        ${
                          hasDrawNumber(x)
                            ? `#${E(x.number)}`
                            : `
                              <span class="warn">
                                NOT DRAWN
                              </span>
                            `
                        }
                      </td>
                      <td>
                        ${performer}
                      </td>
                      <td>
                        ${E(
                          x.performerType ||
                          x.category ||
                          ""
                        )}
                      </td>
                      <td>
                        ${E(ids)}
                      </td>
                      <td>
                        ${E(
                          x.category === "Duet"
                            ? "Duet"
                            : x.category || ""
                        )}
                      </td>
                      <td>
                        ${E(
                          team ||
                          "Unassigned"
                        )}
                      </td>
                      <td>
                        ${E(
                          x.song || ""
                        )}
                      </td>
                      <td>
                        ${
                          S()[x.id]
                            ? `
                              <span class="ok">
                                Scoring Started
                              </span>
                            `
                            : `
                              <span class="muted">
                                Ready
                              </span>
                            `
                        }
                      </td>
                      <td>
                        ${
                          (!S()[x.id] || Object.keys(S()[x.id] || {}).length === 0) && D.active !== x.id
                            ? `<button class="edit-performance" data-id="${E(x.id)}" type="button">Edit</button>`
                            : `<span class="muted">Locked</span>`
                        }
                        <button
                          class="del danger"
                          data-id="${E(x.id)}"
                          type="button"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  `;
                })
                .join("")
            : `
                <tr>
                  <td
                    colspan="10"
                  >
                    No performances registered yet.
                  </td>
                </tr>
              `
        }
      </table>
    </div>
  `;
}
/* =========================================================
   CONTESTANTS PAGE
   ========================================================= */
function cont() {
  return `
    <h1>Registration & Draw</h1>
    <div class="card">
      <h2>${E(competitionTypeLabel())}</h2>
      ${isTeamMode() ? `
        <p>Register complete teams before competition night.</p>
        <p class="muted">
          Every team has exactly 5 individual performances and 1 duet performance — 6 performances in total.
          The Auditor can later assign the draw numbers and activate each performance separately.
        </p>
      ` : `
        <p>Register each contestant individually.</p>
        <p class="muted">
          Performance numbers are assigned later when the random draw is conducted.
        </p>
      `}
    </div>
    ${isTeamMode() ? `
      ${teamRegistration()}
      ${existingTeams()}
    ` : `
      ${individualRegistration()}
    `}
    ${drawNumbers()}
    ${registeredPerformances()}
  `;
}
/* =========================================================
   LIVE SCORES
   ========================================================= */
function live() {
  const s =
    D.active
      ? S()[D.active] || {}
      : {};
  const a =
    A();
  const team =
    getContestantTeam(a);
  const submitted =
    activeJudges().filter(
      judge =>
        s[judge.id]
    ).length;
  return `
    <h1>
      Live Scores
    </h1>
    <div class="card">
      ${
        a
          ? `
            <span class="muted">
              CURRENT PERFORMANCE
            </span>
            <div class="big">
              #${E(a.number)}
            </div>
            <h2>
              ${E(a.name)}
              ${
                a.category === "Duet" &&
                a.name2
                  ? `<br>& ${E(a.name2)}`
                  : ""
              }
            </h2>
            ${
              team
                ? `
                  <p>
                    <b>
                      Team:
                    </b>
                    ${E(team)}
                  </p>
                `
                : ""
            }
            ${a.round ? `<p><b>ROUND ${E(a.round)}</b></p>` : ""}
            <p>
              ${E(
                a.category || ""
              )}
              ${
                a.song
                  ? ` · ${E(a.song)}`
                  : ""
              }
            </p>
            <p>
              Judges:
              <b>
                ${submitted}/${judgeCount()}
              </b>
            </p>
          `
          : `
            <h2>
              No active performance
            </h2>
          `
      }
    </div>
    <div class="grid">
      ${activeJudges()
        .map(judge => {
          const score =
            s[judge.id];
          return `
            <div class="card">
              <h2>
                ${E(judge.name)}
              </h2>
              ${
                score
                  ? `
                    <div class="stat">
                      ${Number(
                        score.total || 0
                      ).toFixed(0)}/${MAX_TOTAL}
                    </div>
                    <span class="ok">
                      ✓ Submitted
                    </span>
                  `
                  : `
                    <span class="warn">
                      Waiting
                    </span>
                  `
              }
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}
/* =========================================================
   PERFORMANCE RESULT
   ========================================================= */
function performanceResult(id) {
  const scoreObject =
    S()[id] || {};
  const scores =
    activeJudges()
      .map(
        judge =>
          scoreObject[judge.id]
      )
      .filter(
        x =>
          x &&
          x.submitted === true
      );
  const complete =
    scores.length ===
    judgeCount();
  const total =
    scores.reduce(
      (sum, score) =>
        sum +
        Number(
          score.total || 0
        ),
      0
    );
  const avg =
    scores.length
      ? total / scores.length
      : 0;
  return {
    scores,
    submitted:
      scores.length,
    complete,
    avg
  };
}
/* =========================================================
   VERSION 1.1 — PRINT / SAVE RESULTS
   ========================================================= */
function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function saveResults() {
  if (!isTeamMode()) { saveIndividualResults(); return; }
  const rows = cs().map(x => {
    const result = performanceResult(x.id);
    return {
      ...x,
      submitted: result.submitted,
      complete: result.complete,
      avg: result.avg,
      bonus: performanceBonus(x),
      finalScore: performanceFinalScore(x, result)
    };
  });

  const ranked = rows.slice().sort((a, b) => b.finalScore - a.finalScore);
  const teamTotals = {};

  rows.filter(x => x.complete).forEach(x => {
    const team = getContestantTeam(x);
    if (!team) return;
    if (!teamTotals[team]) {
      teamTotals[team] = { team, total: 0, performances: 0 };
    }
    teamTotals[team].total += Number(x.avg || 0);
    teamTotals[team].performances++;
  });

  const teamRanking = Object.values(teamTotals)
    .sort((a, b) => b.total - a.total);

  const lines = [];
  lines.push([
    "ROYAL KARAOKE SKN — COMPETITION RESULTS",
    "",
    "",
    ""
  ].map(csvCell).join(","));
  lines.push([
    "Competition", D.name || "",
    "Venue", D.venue || ""
  ].map(csvCell).join(","));
  lines.push([
    "Date", D.date || "",
    "Judges", judgeCount()
  ].map(csvCell).join(","));
  lines.push(["Early Registration Bonus", bonusPoints(), "Final Maximum", 100 + bonusPoints()].map(csvCell).join(","));
  lines.push("");
  lines.push(["PERFORMANCE RESULTS"].map(csvCell).join(","));
  lines.push([
    "Rank","Performance #","Contestant","Partner","Category","Team","Judges Submitted","Bonus","Final Score","Status"
  ].map(csvCell).join(","));

  ranked.forEach((x, index) => {
    lines.push([
      x.complete ? index + 1 : "",
      hasDrawNumber(x) ? x.number : "",
      x.name || "",
      x.category === "Duet" ? (x.name2 || "") : "",
      x.category || "",
      getContestantTeam(x) || "Unassigned",
      `${x.submitted}/${judgeCount()}`,
      x.complete ? `+${x.bonus || 0}` : "",
      x.complete ? Number(x.finalScore).toFixed(2) : "",
      x.complete ? "COMPLETE" : "PENDING"
    ].map(csvCell).join(","));
  });

  if (isTeamMode()) {
    lines.push("");
    lines.push(["TEAM RANKING"].map(csvCell).join(","));
    lines.push([
      "Rank","Team","Completed Performances","Team Total"
    ].map(csvCell).join(","));
    teamRanking.forEach((team, index) => {
      lines.push([
        index + 1,
        team.team,
        team.performances,
        Number(team.total).toFixed(2)
      ].map(csvCell).join(","));
    });
  }

  lines.push("");
  lines.push(["JUDGING CRITERIA"].map(csvCell).join(","));
  lines.push(["Criterion","Maximum Points"].map(csvCell).join(","));
  C.forEach(item => lines.push([item[1], item[2]].map(csvCell).join(",")));
  lines.push("");
  lines.push(["Exported", new Date().toLocaleString()].map(csvCell).join(","));

  const blob = new Blob(["\uFEFF" + lines.join("\r\n")], {
    type: "text/csv;charset=utf-8;"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const safeName = String(D.name || "Royal_Karaoke_SKN")
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "") || "Royal_Karaoke_SKN";
  link.href = url;
  link.download = `${safeName}_Results.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function printResults() {
  const printWindow = window.open("", "_blank", "width=1200,height=900");
  if (!printWindow) {
    alert("Please allow pop-ups for this site so the results can be printed.");
    return;
  }

  const content = results();
  printWindow.document.open();
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <title>Royal Karaoke SKN — Competition Results</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 24px; color: #111; background: #fff; }
          h1, h2, h3 { margin-top: 0.7em; }
          .card { border: 1px solid #999; border-radius: 8px; padding: 16px; margin-bottom: 16px; }
          .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th, td { border: 1px solid #777; padding: 7px; text-align: left; }
          th { background: #eee; }
          .big { font-size: 2em; font-weight: bold; }
          .muted { color: #555; }
          .winner { text-align: center; }
          .results-actions { display: none !important; }
          @media print {
            body { margin: 10mm; }
            .card { break-inside: avoid; }
            .grid { grid-template-columns: repeat(2, 1fr); }
          }
          @media (max-width: 800px) {
            .grid { grid-template-columns: 1fr; }
          }
        </style>
      </head>
      <body>
        ${content}
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 400);
}

/* =========================================================
   RESULTS
   ========================================================= */
function teamResultDetails() {
  const teamList = teams();
  if (!teamList.length) {
    return `
      <div class="card">
        <h2>🏆 Team Results</h2>
        <p>No teams have been registered.</p>
      </div>
    `;
  }
  return `
    <div class="card table-wrap">
      <h2>🏆 Team Results — 6 Performances</h2>
      <p class="muted">
        Each team receives five individual scores and one duet score. The six judging scores are added together; eligible individual members also receive the configured early-registration bonus once.
        Individual team-member scores also remain eligible for Best Male and Best Female.
      </p>
      ${teamList.map((team, index) => {
        const raw = D.teams?.[team.id];
        const ids = raw && typeof raw === "object" && raw.performanceIds
          ? Object.values(raw.performanceIds)
          : cs().filter(x => x.teamId === team.id).map(x => x.id);
        const performances = ids.map(id => {
          const contestant = D.contestants?.[id];
          if (!contestant) return null;
          return { contestant, result: performanceResult(id) };
        }).filter(Boolean);
        const total = performances.reduce((sum, item) => sum + (item.result.complete ? performanceFinalScore(item.contestant, item.result) : 0), 0);
        const completed = performances.filter(item => item.result.complete).length;
        const max = Math.max(ids.length * MAX_TOTAL, 0);
        const teamMax = 600 + (bonusPoints() * 5);
        const displayMax = ids.length === 6 ? teamMax : max;
        return `
          <div class="card">
            <h3>${index + 1}. ${E(team.name)}</h3>
            <p><strong>${completed}/6 performances completed</strong></p>
            <table>
              <tr><th>Performance</th><th>Performer(s)</th><th>Song</th><th>Score</th></tr>
              ${performances.map((item, pIndex) => {
                const x = item.contestant;
                const label = x.category === "Duet" ? "Duet" : `Individual ${pIndex + 1}`;
                const performer = x.category === "Duet" && x.name2 ? `${x.name} & ${x.name2}` : x.name;
                return `
                  <tr>
                    <td>${E(label)}</td>
                    <td>${E(performer || "")}</td>
                    <td>${E(x.song || "")}</td>
                    <td><strong>${item.result.complete ? performanceFinalScore(item.contestant, item.result).toFixed(2) : "—"}</strong> /${100 + bonusPoints()}</td>
                  </tr>
                `;
              }).join("")}
              <tr>
                <td colspan="3"><strong>TEAM TOTAL</strong></td>
                <td><strong>${total.toFixed(2)} / ${displayMax}</strong></td>
              </tr>
            </table>
          </div>
        `;
      }).join("")}
    </div>
  `;
}
function individualResults() {
  const groups = {};
  cs().filter(x => x.individualGroupId || x.performerType === "Individual").forEach(x => {
    const gid = x.individualGroupId || `legacy_${x.id}`;
    if (!groups[gid]) groups[gid] = { id: gid, name: x.name || "", gender: x.category || "", contestantId: x.contestantId || "", bonusEligible: false, roundCount: Number(x.roundCount) === 1 ? 1 : 2, rounds: {} };
    groups[gid].bonusEligible = groups[gid].bonusEligible || x.bonusEligible === true;
    if (Number(x.roundCount) === 1) groups[gid].roundCount = 1;
    const result = performanceResult(x.id);
    groups[gid].rounds[x.round || 1] = { performance: x, result };
  });
  const rows = Object.values(groups).map(g => {
    const r1 = g.rounds[1], r2 = g.rounds[2];
    const expectedRounds = g.roundCount === 1 ? 1 : 2;
    const complete = expectedRounds === 1 ? !!r1?.result.complete : !!r1?.result.complete && !!r2?.result.complete;
    const baseScore = complete ? (expectedRounds === 1 ? Number(r1.result.avg) : (Number(r1.result.avg) + Number(r2.result.avg)) / 2) : 0;
    const bonus = g.bonusEligible ? bonusPoints() : 0;
    const finalScore = complete ? baseScore + bonus : 0;
    return { ...g, expectedRounds, r1, r2, complete, baseScore, bonus, finalScore };
  });
  const ranked = rows.filter(x => x.complete).sort((a,b) => b.finalScore - a.finalScore);
  const winner = ranked[0];
  const maxFinal = 100 + bonusPoints();
  const winnerCard = winner ? `<div class="card winner"><span class="muted">🏆 INDIVIDUAL CHAMPION</span><h2>${E(winner.name)}</h2><p>${E(winner.contestantId)} · ${E(winner.gender)} · ${winner.expectedRounds} round${winner.expectedRounds === 1 ? "" : "s"}</p><div class="big">${winner.finalScore.toFixed(2)}</div><p>/${maxFinal} final score${winner.bonus ? ` · includes +${winner.bonus} bonus` : ""}</p></div>` : `<div class="card winner"><span class="muted">🏆 INDIVIDUAL CHAMPION</span><h2>—</h2><p>No contestant has completed the required round(s) yet.</p></div>`;
  return `
    <h1>Individual Competition Results — 1 or 2 Rounds</h1>
    <div class="results-actions" style="display:flex;gap:10px;flex-wrap:wrap;margin:0 0 16px 0">
      <button id="printResults" class="primary" type="button">🖨️ PRINT RESULTS</button>
      <button id="saveResults" type="button">💾 SAVE RESULTS (CSV)</button>
    </div>
    <div class="grid">${winnerCard}<div class="card"><span class="muted">COMPLETED CONTESTANTS</span><div class="stat">${ranked.length}/${rows.length}</div><p>Required round(s) completed</p></div></div>
    <div class="card table-wrap"><h2>Final Individual Ranking</h2><p class="muted">For a 1-round contestant, the completed Round 1 score is the final base score. For a 2-round contestant, the two completed round scores are averaged. The early-registration bonus, if awarded, is added once. Judging is out of 100; final score can be up to ${maxFinal} with a +${bonusPoints()} bonus.</p><table><tr><th>Rank</th><th>Contestant</th><th>ID</th><th>Gender</th><th>Rounds</th><th>Round 1</th><th>Round 2</th><th>Bonus</th><th>Final Score</th><th>Status</th></tr>${rows.sort((a,b) => (b.complete-a.complete) || (b.finalScore-a.finalScore)).map(x => `<tr><td>${x.complete ? ranked.findIndex(r => r.id === x.id)+1 : "—"}</td><td><strong>${E(x.name)}</strong></td><td>${E(x.contestantId)}</td><td>${E(x.gender)}</td><td>${x.expectedRounds}</td><td>${x.r1?.result.complete ? x.r1.result.avg.toFixed(2) : "—"}</td><td>${x.expectedRounds === 2 && x.r2?.result.complete ? x.r2.result.avg.toFixed(2) : "—"}</td><td>${x.bonus ? `+${x.bonus}` : "—"}</td><td><strong>${x.complete ? x.finalScore.toFixed(2) : "—"}</strong> /${maxFinal}</td><td>${x.complete ? '<span class="ok">COMPLETE</span>' : '<span class="warn">PENDING</span>'}</td></tr>`).join("")}</table></div>
  `;
}
function saveIndividualResults() {
  const groups = {};
  cs().filter(x => x.individualGroupId || x.performerType === "Individual").forEach(x => {
    const gid=x.individualGroupId || `legacy_${x.id}`;
    if(!groups[gid]) groups[gid]={name:x.name||"",id:x.contestantId||"",gender:x.category||"",bonusEligible:false,roundCount:Number(x.roundCount)===1?1:2,rounds:{}};
    groups[gid].bonusEligible = groups[gid].bonusEligible || x.bonusEligible === true;
    if (Number(x.roundCount) === 1) groups[gid].roundCount = 1;
    groups[gid].rounds[x.round||1] = performanceResult(x.id);
  });
  const rows=Object.values(groups).map(g=>{const r1=g.rounds[1],r2=g.rounds[2],expectedRounds=g.roundCount===1?1:2;const complete=expectedRounds===1?!!r1?.complete:!!r1?.complete&&!!r2?.complete;const bonus=g.bonusEligible?bonusPoints():0;const base=complete?(expectedRounds===1?Number(r1.avg):(Number(r1.avg)+Number(r2.avg))/2):0;return {...g,complete,expectedRounds,r1:r1?.avg||0,r2:r2?.avg||0,bonus,final:complete?base+bonus:0};}).sort((a,b)=>b.final-a.final);
  const lines=["ROYAL KARAOKE SKN — INDIVIDUAL RESULTS".split("|")];
  lines.push(["Competition",D.name||"","Venue",D.venue||""]); lines.push(["Date",D.date||"","Judges",judgeCount()]); lines.push(["Bonus Points",bonusPoints(),"Final Maximum",100+bonusPoints()]); lines.push([]);
  lines.push(["Rank","Contestant ID","Contestant","Gender","Rounds","Round 1","Round 2","Bonus","Final Score","Status"]);
  let rank=0; rows.forEach(x=>{if(x.complete) rank++; lines.push([x.complete?rank:"",x.id,x.name,x.gender,x.expectedRounds,x.complete?x.r1.toFixed(2):"",x.expectedRounds===2&&x.complete?x.r2.toFixed(2):"",x.complete?`+${x.bonus}`:"",x.complete?x.final.toFixed(2):"",x.complete?"COMPLETE":"PENDING"]);});
  lines.push([]); lines.push(["Judging Criteria","Maximum Points"]); C.forEach(x=>lines.push([x[1],x[2]])); lines.push([]); lines.push(["Exported",new Date().toLocaleString()]);
  const csv=lines.map(row=>row.map(csvCell).join(",")).join("\r\n"); const blob=new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8;"}); const url=URL.createObjectURL(blob); const link=document.createElement("a"); const safeName=String(D.name||"Royal_Karaoke_SKN").replace(/[^a-z0-9]+/gi,"_").replace(/^_+|_+$/g,"")||"Royal_Karaoke_SKN"; link.href=url; link.download=`${safeName}_Individual_Results.csv`; document.body.appendChild(link); link.click(); link.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000);
}

function results() {
  if (!isTeamMode()) return individualResults();
  const rows =
    cs().map(x => {
      const result =
        performanceResult(
          x.id
        );
      return {
        ...x,
        submitted:
          result.submitted,
        complete:
          result.complete,
        avg:
          result.avg,
        bonus:
          performanceBonus(x),
        finalScore:
          performanceFinalScore(x, result)
      };
    });
  const completeRows =
    rows.filter(
      x => x.complete
    );
  const sortByScore =
    (a, b) =>
      b.finalScore - a.finalScore;
  const overallWinner =
    completeRows
      .slice()
      .sort(sortByScore)[0];
  const bestMale =
    completeRows
      .filter(
        x =>
          x.category ===
          "Male"
      )
      .sort(sortByScore)[0];
  const bestFemale =
    completeRows
      .filter(
        x =>
          x.category ===
          "Female"
      )
      .sort(sortByScore)[0];
  const bestDuet =
    completeRows
      .filter(
        x =>
          x.category ===
          "Duet"
      )
      .sort(sortByScore)[0];
  /* =======================================================
     TEAM TOTALS
     ======================================================= */
  const teamTotals = {};
  completeRows.forEach(
    x => {
      const team =
        getContestantTeam(x);
      if (!team) {
        return;
      }
      if (!teamTotals[team]) {
        teamTotals[team] = {
          team,
          total: 0,
          performances: 0
        };
      }
      /*
        Every completed performance contributes
        exactly once.
      */
      teamTotals[team].total +=
        performanceFinalScore(x, {avg:x.avg});
      teamTotals[team].performances++;
    }
  );
  teams().forEach(
    t => {
      if (
        !teamTotals[t.name]
      ) {
        teamTotals[t.name] = {
          team: t.name,
          total: 0,
          performances: 0
        };
      }
    }
  );
  const teamRanking =
    Object.values(
      teamTotals
    ).sort(
      (a, b) =>
        b.total - a.total
    );
  const bestTeam =
    teamRanking.find(
      x =>
        x.performances > 0
    );
  /* =======================================================
     WINNER CARD
     ======================================================= */
  const winnerCard = (
    title,
    winner
  ) => {
    if (!winner) {
      return `
        <div class="card winner">
          <span class="muted">
            ${E(title)}
          </span>
          <h2>
            —
          </h2>
          <div class="big">
            —
          </div>
          <p>
            No completed result yet.
          </p>
        </div>
      `;
    }
    return `
      <div class="card winner">
        <span class="muted">
          🏆 ${E(title)}
        </span>
        <h2>
          ${E(winner.name)}
          ${
            winner.category ===
              "Duet" &&
            winner.name2
              ? `
                <br>
                & ${E(winner.name2)}
              `
              : ""
          }
        </h2>
        ${
          isTeamMode()
            ? `
              <p>
                Team:
                <b>
                  ${E(
                    getContestantTeam(
                      winner
                    ) ||
                    "Unassigned"
                  )}
                </b>
              </p>
            `
            : ""
        }
        <div class="big">
          ${winner.finalScore.toFixed(2)}
        </div>
        <p>
          /${100 + bonusPoints()}${winner.bonus ? ` · includes +${winner.bonus} bonus` : ""}
        </p>
      </div>
    `;
  };
  const teamWinnerCard =
    winner => {
      if (!winner) {
        return `
          <div class="card winner">
            <span class="muted">
              🏆 Best Overall Team
            </span>
            <h2>
              —
            </h2>
            <div class="big">
              —
            </div>
            <p>
              No completed team result yet.
            </p>
          </div>
        `;
      }
      return `
        <div class="card winner">
          <span class="muted">
            🏆 Best Overall Team
          </span>
          <h2>
            ${E(winner.team)}
          </h2>
          <div class="big">
            ${winner.total.toFixed(2)}
          </div>
          <p>
            Team Points
          </p>
          <p>
            ${winner.performances}
            completed performance${
              winner.performances === 1
                ? ""
                : "s"
            }
          </p>
        </div>
      `;
    };
  return `
    <h1>
      Competition Results
    </h1>
    <div class="results-actions" style="display:flex;gap:10px;flex-wrap:wrap;margin:0 0 16px 0">
      <button id="printResults" class="primary" type="button">🖨️ PRINT RESULTS</button>
      <button id="saveResults" type="button">💾 SAVE RESULTS (CSV)</button>
    </div>
    <div class="card">
      <h2>
        ${E(
          competitionTypeLabel()
        )}
      </h2>
      <p>
        Competition uses
        <b>
          ${judgeCount()} Judges
        </b>
      </p>
      <p class="muted">
        A performance is final only after
        all ${judgeCount()} judges submit.
      </p>
    </div>
    <!-- WINNERS -->
    <div class="grid">
      ${winnerCard(
        "Overall Winner",
        overallWinner
      )}
      ${winnerCard(
        "Best Male",
        bestMale
      )}
      ${winnerCard(
        "Best Female",
        bestFemale
      )}
      ${winnerCard(
        "Best Duet",
        bestDuet
      )}
      ${
        isTeamMode()
          ? teamWinnerCard(
              bestTeam
            )
          : ""
      }
    </div>
    ${
      isTeamMode()
        ? `
          <div class="card table-wrap">
            <h2>
              🏆 Best Overall Team Ranking
            </h2>
            <p class="muted">
              Team Total =
              completed individual performance
              scores +
              completed duet performance scores.
              Each performance contributes once.
            </p>
            <table>
              <tr>
                <th>
                  Rank
                </th>
                <th>
                  Team
                </th>
                <th>
                  Performances
                </th>
                <th>
                  Team Total
                </th>
              </tr>
              ${
                teamRanking.length
                  ? teamRanking
                      .map(
                        (team, index) => `
                          <tr>
                            <td>
                              ${
                                team.performances
                                  ? index + 1
                                  : "—"
                              }
                            </td>
                            <td>
                              <strong>
                                ${E(team.team)}
                              </strong>
                            </td>
                            <td>
                              ${team.performances}
                            </td>
                            <td>
                              <strong>
                                ${team.total.toFixed(2)}
                              </strong>
                            </td>
                          </tr>
                        `
                      )
                      .join("")
                  : `
                      <tr>
                        <td colspan="4">
                          No teams registered.
                        </td>
                      </tr>
                    `
              }
            </table>
          </div>
        `
        : ""
    }
    <!-- PERFORMANCE RESULTS -->
    <div class="card table-wrap">
      <h2>
        Performance Results
      </h2>
      <table>
        <tr>
          <th>
            Rank
          </th>
          <th>
            #
          </th>
          <th>
            Contestant
          </th>
          <th>
            Category
          </th>
          ${
            isTeamMode()
              ? `
                <th>
                  Team
                </th>
              `
              : ""
          }
          <th>
            Judges
          </th>
          <th>
            Bonus
          </th>
          <th>
            Final Score
          </th>
        </tr>
        ${
          rows
            .slice()
            .sort(
              (a, b) =>
                b.finalScore - a.finalScore
            )
            .map(
              (x, index) => `
                <tr>
                  <td>
                    ${
                      x.complete
                        ? index + 1
                        : "—"
                    }
                  </td>
                  <td>
                    ${
                      hasDrawNumber(x)
                        ? E(x.number)
                        : "—"
                    }
                  </td>
                  <td>
                    <strong>
                      ${E(x.name)}
                    </strong>
                    ${
                      x.category ===
                        "Duet" &&
                      x.name2
                        ? `
                          <br>
                          & ${E(x.name2)}
                        `
                        : ""
                    }
                  </td>
                  <td>
                    ${E(x.category)}
                  </td>
                  ${
                    isTeamMode()
                      ? `
                        <td>
                          ${E(
                            getContestantTeam(x) ||
                            "Unassigned"
                          )}
                        </td>
                      `
                      : ""
                  }
                  <td>
                    ${x.submitted}/${judgeCount()}
                  </td>
                  <td>
                    ${x.complete && x.bonus ? `+${x.bonus}` : "—"}
                  </td>
                  <td>
                    ${
                      x.complete
                        ? `
                          <strong>
                            ${x.finalScore.toFixed(2)}
                          </strong>
                        `
                        : `
                          <span class="warn">
                            Pending
                          </span>
                        `
                    }
                  </td>
                </tr>
              `
            )
            .join("")
        }
      </table>
    </div>
  `;
}
/* =========================================================
   JUDGE SCREEN
   ========================================================= */
/* =========================================================
   JUDGE RETURN BUTTON
   ========================================================= */
function judgeReturnButton() {
  if (!judgeFromAuditor) return "";
  return `
    <button id="backToAuditor" type="button" style="margin-top:12px;width:100%">
      ← RETURN TO AUDITOR
    </button>
  `;
}
function auditorJudgeCorrection() {
  const performanceId = correctionPerformanceId || D.active;
  const judgeId = correctionJudgeId;
  const performance = performanceId ? D.contestants?.[performanceId] : null;
  const judge = judgeId ? J[judgeId] : null;
  const score = performanceId && judgeId ? S()[performanceId]?.[judgeId] : null;
  if (!performance || !judge || !score) return `<div class="wrap"><div class="card hero"><h1>Judge Score Correction</h1><p class="warn">There is no submitted score available for this judge on the current performance.</p><button id="returnAuditorCorrection" type="button" class="primary" style="width:100%">← RETURN TO AUDITOR</button></div></div>`;
  const criteria = criteriaForPerformance(performance);
  const maxTotal = criteriaTotal(criteria);
  return `<div class="wrap"><div class="card hero"><span class="pill">AUDITOR — SCORE CORRECTION</span><div class="big">#${E(performance.number)}</div><h1>${E(performance.name)}${performance.category === "Duet" && performance.name2 ? `<br>& ${E(performance.name2)}` : ""}</h1><h2>${E(judge.name)}</h2><p>${E(performance.category || "")}${performance.song ? ` · ${E(performance.song)}` : ""}${performance.round ? ` · Round ${E(performance.round)}` : ""}</p>${performance.bonusEligible ? `<p class="ok">Early-registration bonus: +${bonusPoints()} points</p>` : ""}<p class="warn">Review and correct this judge's submitted score before the next performance is activated.</p></div><div class="card">${criteria.map(([key,label,max]) => `<div class="score-block"><div class="score-title"><b>${E(label)}</b><span id="correction-display-${E(key)}">${Number(score[key] ?? 0)}/${max}</span></div><div class="score-buttons">${Array.from({length:max+1},(_,n)=>`<button class="correction-score-button ${Number(score[key])===n?"selected":""}" data-k="${E(key)}" data-n="${n}" type="button">${n}</button>`).join("")}</div></div>`).join("")}<div class="total" id="correction-total">TOTAL: ${Number(score.total||0)}/${maxTotal}</div><button id="saveJudgeCorrection" class="primary" style="width:100%" type="button">SAVE CORRECTED SCORE</button><button id="returnAuditorCorrection2" type="button" style="width:100%;margin-top:10px">← RETURN TO AUDITOR</button></div></div>`;
}
function returnToAuditorFromCorrection() { correctionJudgeId=null; correctionPerformanceId=null; page="home"; render(); }
async function saveJudgeCorrection() {
  const performanceId=correctionPerformanceId||D.active, judgeId=correctionJudgeId;
  if (!performanceId || !judgeId || !J[judgeId]) { alert("The judge correction could not be identified."); return; }
  if (D.active!==performanceId) { alert("The active performance has changed. No correction was saved."); return; }
  const current=S()[performanceId]?.[judgeId];
  if (!current) { alert("That judge has no submitted score for this performance."); return; }
  const performance = D.contestants?.[performanceId];
  const criteria = criteriaForPerformance(performance);
  const corrected={...current, criteria};
  for (const [key,label] of criteria) { const selected=document.querySelector(`.correction-score-button[data-k="${key}"].selected`); if (!selected) { alert(`Please select a score for ${label}.`); return; } corrected[key]=Number(selected.dataset.n); }
  corrected.total=criteria.reduce((sum,[key])=>sum+Number(corrected[key]||0),0); corrected.corrected=true; corrected.correctedAt=Date.now(); corrected.correctedBy="Auditor";
  try { await set(ref(db,`event/scores/${performanceId}/${judgeId}`),corrected); alert(`${J[judgeId].name}'s corrected score has been saved: ${corrected.total}/${criteriaTotal(criteria)}.`); returnToAuditorFromCorrection(); } catch(error) { console.error("Judge score correction error:",error); alert("The corrected score could not be saved.\n\n"+error.message); }
}

function judge() {
  const a =
    A();
  if (!a) {
    return `
      <div class="wrap">
        <div class="card hero">
          <div class="big">
            🎤
          </div>
          <h1>
            Waiting for Auditor
          </h1>
          <p>
            The next performance will appear
            here automatically.
          </p>
          ${judgeReturnButton()}
        </div>
      </div>
    `;
  }
  if (
    draftPerformanceId !==
    D.active
  ) {
    draft = {};
    draftPerformanceId =
      D.active;
  }
  const old =
    D.active
      ? S()[D.active]?.[jid]
      : null;
  const team =
    getContestantTeam(a);
  const activeCriteria = criteriaForPerformance(a);
  const activeMaxTotal = criteriaTotal(activeCriteria);
  /* LOCKED SCORE */
  if (old) {
    return `
      <div class="wrap">
        <div class="card hero">
          <div class="big">
            ✓
          </div>
          <h1>
            Score Submitted
          </h1>
          <h2>
            #${E(a.number)}
            <br>
            ${E(a.name)}
            ${
              a.category ===
                "Duet" &&
              a.name2
                ? `
                  <br>
                  & ${E(a.name2)}
                `
                : ""
            }
          </h2>
          ${
            team
              ? `
                <p>
                  Team:
                  <b>
                    ${E(team)}
                  </b>
                </p>
              `
              : ""
          }
          <div class="big">
            ${Number(
              old.total || 0
            ).toFixed(0)}/${activeMaxTotal}
          </div>
          <p class="ok">
            Your score is locked.
          </p>
          <p class="muted">
            You cannot change a submitted score.
          </p>
          <button
            id="jout"
            type="button"
          >
            Log Out
          </button>
          ${judgeReturnButton()}
        </div>
      </div>
    `;
  }
  return `
    <div class="wrap">
      <div class="card hero">
        <span class="pill">
          JUDGE ${J[jid]?.no || "?"}
        </span>
        <div class="big">
          #${E(a.number)}
        </div>
        <h1>
          ${E(a.name)}
          ${
            a.category ===
              "Duet" &&
            a.name2
              ? `
                <br>
                & ${E(a.name2)}
              `
              : ""
          }
        </h1>
        ${
          team
            ? `
              <h2>
                ${E(team)}
              </h2>
            `
            : ""
        }
        <p>
          ${E(
            a.category || ""
          )}
          ${
            a.song
              ? ` · ${E(a.song)}`
              : ""
          }
        </p>
      </div>
      <div class="card">
        <div class="notice">
          Complete every criterion.
          <br>
          Total possible:
          <b>
            ${activeMaxTotal} points.
          </b>
        </div>
        ${activeCriteria.map(
          ([key, label, max]) => `
            <div class="score-block">
              <div class="score-title">
                <b>
                  ${E(label)}
                </b>
                <span>
                  ${draft[key] ?? 0}/${max}
                </span>
              </div>
              <div class="score-buttons">
                ${Array.from(
                  {
                    length:
                      max + 1
                  },
                  (_, n) => `
                    <button
                      class="sb ${
                        Number(
                          draft[key]
                        ) === n
                          ? "selected"
                          : ""
                      }"
                      data-k="${E(key)}"
                      data-n="${n}"
                      type="button"
                    >
                      ${n}
                    </button>
                  `
                ).join("")}
              </div>
            </div>
          `
        ).join("")}
        <div class="total">
          TOTAL:
          ${T(activeCriteria)}
          /
          ${activeMaxTotal}
        </div>
        <button
          id="submit"
          class="primary"
          style="width:100%"
          type="button"
        >
          SUBMIT SCORE — LOCK IT
        </button>
          ${judgeReturnButton()}
      </div>
    </div>
  `;
}
/* =========================================================
   NAVIGATION
   ========================================================= */
function nav() {
  return `
    <div class="nav">
      ${[
        ["home", "Dashboard"],
        ["contestants", "Registration"],
        ["live", "Live Scores"],
        ["results", "Results"]
      ]
        .map(
          ([value, label]) => `
            <button
              class="nb ${
                page === value
                  ? "primary"
                  : ""
              }"
              data-p="${value}"
              type="button"
            >
              ${E(label)}
            </button>
          `
        )
        .join("")}
      <button
        id="out"
        type="button"
      >
        Log Out
      </button>
    </div>
  `;
}
/* =========================================================
   LOGOUT
   ========================================================= */
function logout() {
  role = null;
  jid = null;
  draft = {};
  submitting = false;
  draftPerformanceId =
    null;
  localStorage.removeItem(
    "rk_role"
  );
  localStorage.removeItem(
    "rk_judge"
  );
  try {
    sessionStorage.removeItem("rk_judge_auth");
    sessionStorage.removeItem("rk_judge");
  } catch (_) {}
  selectedLoginJudge = null;
  page = "home";
  render();
}
/* =========================================================
   SAVE COMPETITION DETAILS
   ========================================================= */
async function saveCompetitionDetails() {
  const name = document.getElementById("competitionName")?.value.trim();
  const venue = document.getElementById("competitionVenue")?.value.trim();
  const date = document.getElementById("competitionDate")?.value || "";
  if (!name) {
    alert("Please enter a competition name.");
    return;
  }
  try {
    await update(ref(db, "event"), { name, venue, date });
    alert("Competition details saved successfully.");
  } catch (error) {
    console.error("Competition details error:", error);
    alert("The competition details could not be saved.\n\n" + error.message);
  }
}
/* =========================================================
   CHANGE COMPETITION TYPE
   ========================================================= */
async function changeCompetitionType(
  newType
) {
  if (
    ![
      COMPETITION_TYPES.TEAM,
      COMPETITION_TYPES.INDIVIDUAL
    ].includes(newType)
  ) {
    return;
  }
  if (
    competitionType() ===
    newType
  ) {
    return;
  }
  const hasData =
    cs().length > 0 ||
    teams().length > 0 ||
    Object.keys(
      S()
    ).length > 0;
  if (hasData) {
    alert(
      "The competition type cannot be changed after registration or scoring has started.\n\n" +
      "Reset the competition first, then select the new competition type."
    );
    return;
  }
  const label =
    newType ===
    COMPETITION_TYPES.TEAM
      ? "TEAM COMPETITION"
      : "INDIVIDUAL COMPETITION";
  if (
    !confirm(
      `Set this competition to ${label}?`
    )
  ) {
    return;
  }
  try {
    await set(
      ref(
        db,
        "event/competitionType"
      ),
      newType
    );
  } catch (error) {
    alert(
      "Could not change competition type.\n\n" +
      error.message
    );
  }
}
/* =========================================================
   CHANGE JUDGE COUNT
   ========================================================= */
async function changeJudgeCount(
  newCount
) {
  if (
    !VALID_JUDGE_COUNTS.includes(
      newCount
    )
  ) {
    return;
  }
  const current =
    judgeCount();
  if (
    current === newCount
  ) {
    return;
  }
  const existingScores =
    Object.values(
      S()
    ).some(
      performance =>
        performance &&
        Object.keys(
          performance
        ).length > 0
    );
  if (existingScores) {
    const proceed =
      confirm(
        `This competition already has judge scores.\n\n` +
        `Changing from ${current} judges to ${newCount} judges will erase ALL existing judge scores.\n\n` +
        `Do you want to continue?`
      );
    if (!proceed) {
      return;
    }
  } else {
    const proceed =
      confirm(
        `Set this competition to ${newCount} judges?`
      );
    if (!proceed) {
      return;
    }
  }
  try {
    if (existingScores) {
      await set(
        ref(
          db,
          "event/scores"
        ),
        {}
      );
    }
    await set(
      ref(
        db,
        "event/judgeCount"
      ),
      newCount
    );
    if (
      role === "judge" &&
      J[jid]?.no > newCount
    ) {
      logout();
      return;
    }
    alert(
      `Competition is now set for ${newCount} judges.`
    );
  } catch (error) {
    alert(
      "Could not change the number of judges.\n\n" +
      error.message
    );
  }
}
/* =========================================================
   RESET COMPETITION
   ========================================================= */
async function resetCompetition() {
  const first = confirm("⚠️ START NEW COMPETITION\n\nThis will permanently remove all registered contestants, teams, draw numbers, judge scores and the active performance. Competition name/venue/date, judge count, judging criteria and early-registration bonus settings will remain available for you to configure the next event.\n\nDo you want to continue?");
  if (!first) return;
  const typed = prompt("FINAL CONFIRMATION\n\nType RESET in capital letters to clear all contestant and scoring data and start a new competition.");
  if (typed !== "RESET") { alert("Reset cancelled. Nothing was deleted."); return; }
  try {
    await update(ref(db,"event"), {active:null, contestants:{}, teams:{}, scores:{}});
    page="home"; render();
    alert("NEW COMPETITION READY!\n\nContestants, teams, draw numbers and scores have been cleared.\n\nYou can now configure the competition type, judging criteria and early-registration bonus.");
  } catch(error) { alert("The competition could not be reset.\n\n"+error.message); }
}
/* =========================================================
   ADD TEAM WITH FIVE MEMBERS
   ========================================================= */
async function addTeamRoster() {
  const teamId = document.getElementById("teamId")?.value.trim();
  const teamNameValue = document.getElementById("teamName")?.value.trim();
  const duetMember1Number = Number(document.getElementById("duetMember1")?.value);
  const duetMember2Number = Number(document.getElementById("duetMember2")?.value);
  const duetSong = document.getElementById("duetSong")?.value.trim();
  if (!teamId) {
    alert("Enter a Team ID / Number.");
    return;
  }
  if (!teamNameValue) {
    alert("Enter a team name.");
    return;
  }
  const duplicateTeamId = teams().some(team => {
    const existing = D.teams?.[team.id];
    const existingId = typeof existing === "object" ? existing.teamId : team.id;
    return String(existingId || "").toLowerCase() === teamId.toLowerCase();
  });
  if (duplicateTeamId) {
    alert("That Team ID / Number is already in use.");
    return;
  }
  const duplicateTeamName = teams().some(team =>
    team.name.toLowerCase() === teamNameValue.toLowerCase()
  );
  if (duplicateTeamName) {
    alert("That team name already exists.");
    return;
  }
  const members = [];
  for (let i = 1; i <= 5; i++) {
    const memberId = document.getElementById(`tmid${i}`)?.value.trim();
    const name = document.getElementById(`tmname${i}`)?.value.trim();
    const gender = document.getElementById(`tmgender${i}`)?.value;
    const song = document.getElementById(`tmsong${i}`)?.value.trim();
    const bonusEligible = document.getElementById(`tmbonus${i}`)?.checked === true;
    if (!memberId) {
      alert(`Enter the Member ID for Member ${i}.`);
      return;
    }
    if (!name) {
      alert(`Enter the name for Member ${i}.`);
      return;
    }
    if (!["Male", "Female"].includes(gender)) {
      alert(`Select the gender for Member ${i}.`);
      return;
    }
    if (!song) {
      alert(`Enter the individual song for Member ${i}.`);
      return;
    }
    members.push({ memberId, name, gender, song, bonusEligible });
  }
  if (!Number.isInteger(duetMember1Number) || duetMember1Number < 1 || duetMember1Number > 5) {
    alert("Select the first duet member.");
    return;
  }
  if (!Number.isInteger(duetMember2Number) || duetMember2Number < 1 || duetMember2Number > 5) {
    alert("Select the second duet member.");
    return;
  }
  if (duetMember1Number === duetMember2Number) {
    alert("The two duet members must be different members of the team.");
    return;
  }
  if (!duetSong) {
    alert("Enter the duet song.");
    return;
  }
  const ids = members.map(member => member.memberId.toLowerCase());
  if (new Set(ids).size !== ids.length) {
    alert("Each team member must have a unique Member ID.");
    return;
  }
  const existingMemberIds = [];
  teams().forEach(team => {
    teamMembers(team.id).forEach(member => {
      if (member.memberId) existingMemberIds.push(member.memberId.toLowerCase());
    });
  });
  const conflict = members.find(member => existingMemberIds.includes(member.memberId.toLowerCase()));
  if (conflict) {
    alert(`Member ID "${conflict.memberId}" is already registered on another team.`);
    return;
  }
  try {
    const teamRef = push(ref(db, "event/teams"));
    const teamKey = teamRef.key;
    const now = Date.now();
    const teamObject = {
      teamId,
      name: teamNameValue,
      createdAt: now,
      performanceCount: 6,
      members: {},
      duet: {},
      performanceIds: {}
    };
    const updates = {};
    const performanceEntries = [];
    members.forEach((member, index) => {
      const memberRef = push(ref(db, `event/teams/${teamKey}/members`));
      const memberKey = memberRef.key;
      teamObject.members[memberKey] = {
        memberId: member.memberId,
        name: member.name,
        gender: member.gender,
        song: member.song,
        bonusEligible: member.bonusEligible === true
      };
      const performanceRef = push(ref(db, "event/contestants"));
      const performanceId = performanceRef.key;
      performanceEntries.push({ performanceId, type: "Individual", index, memberKey, member });
      updates[`event/contestants/${performanceId}`] = {
        number: null,
        order: null,
        name: member.name,
        category: member.gender,
        song: member.song,
        teamId: teamKey,
        team: teamNameValue,
        memberIds: [memberKey],
        contestantId: member.memberId,
        memberId: member.memberId,
        performerType: "Individual",
        performanceType: "Individual",
        bonusEligible: member.bonusEligible === true,
        teamPerformanceNumber: index + 1,
        createdAt: now + index
      };
      teamObject.performanceIds[`individual${index + 1}`] = performanceId;
    });
    const member1 = members[duetMember1Number - 1];
    const member2 = members[duetMember2Number - 1];
    const memberKeys = performanceEntries.map(x => x.memberKey);
    const memberKey1 = memberKeys[duetMember1Number - 1];
    const memberKey2 = memberKeys[duetMember2Number - 1];
    const duetRef = push(ref(db, "event/contestants"));
    const duetPerformanceId = duetRef.key;
    updates[`event/contestants/${duetPerformanceId}`] = {
      number: null,
      order: null,
      name: member1.name,
      name2: member2.name,
      category: "Duet",
      song: duetSong,
      teamId: teamKey,
      team: teamNameValue,
      memberIds: [memberKey1, memberKey2],
      contestantIds: [member1.memberId, member2.memberId],
      performerType: "Duet",
      performanceType: "Duet",
      teamPerformanceNumber: 6,
      createdAt: now + 5
    };
    teamObject.duet = {
      member1: { memberId: member1.memberId, name: member1.name, memberKey: memberKey1 },
      member2: { memberId: member2.memberId, name: member2.name, memberKey: memberKey2 },
      song: duetSong,
      performanceId: duetPerformanceId
    };
    teamObject.performanceIds.duet = duetPerformanceId;
    updates[`event/teams/${teamKey}`] = teamObject;
    await update(ref(db), updates);
    alert(
      `Team "${teamNameValue}" registered successfully.\n\n` +
      "5 individual performances + 1 duet = 6 performances created.\n\n" +
      "The Auditor can now assign the draw numbers and activate each performance one at a time."
    );
    page = "contestants";
    render();
  } catch (error) {
    console.error("Team registration error:", error);
    alert("Could not register team.\n\n" + error.message);
  }
}
/* =========================================================
   ADD TEAM DUET
   ========================================================= */
async function addDuet() {
  const teamId =
    document
      .getElementById(
        "duetTeam"
      )
      ?.value;
  const member1Id =
    document
      .getElementById(
        "duetMember1"
      )
      ?.value;
  const member2Id =
    document
      .getElementById(
        "duetMember2"
      )
      ?.value;
  const song =
    document
      .getElementById(
        "duetSong"
      )
      ?.value
      .trim();
  if (!teamId) {
    alert(
      "Select a team."
    );
    return;
  }
  if (!member1Id) {
    alert(
      "Select the first duet member."
    );
    return;
  }
  if (!member2Id) {
    alert(
      "Select the second duet member."
    );
    return;
  }
  if (
    member1Id ===
    member2Id
  ) {
    alert(
      "A duet must have two different members."
    );
    return;
  }
  if (!song) {
    alert(
      "Enter the duet song."
    );
    return;
  }
  const members =
    teamMembers(
      teamId
    );
  const member1 =
    members.find(
      member =>
        member.id ===
        member1Id
    );
  const member2 =
    members.find(
      member =>
        member.id ===
        member2Id
    );
  if (
    !member1 ||
    !member2
  ) {
    alert(
      "One or both selected team members could not be found."
    );
    return;
  }
  const team =
    teamName(teamId);
  try {
    const performanceRef =
      push(
        ref(
          db,
          "event/contestants"
        )
      );
    await set(
      performanceRef,
      {
        number: null,
        order: null,
        name:
          member1.name,
        name2:
          member2.name,
        category:
          "Duet",
        song,
        teamId:
          teamId,
        team,
        memberIds:
          [
            member1Id,
            member2Id
          ],
        contestantIds:
          [
            member1.memberId,
            member2.memberId
          ],
        performerType:
          "Duet",
        performanceType:
          "Duet",
        createdAt:
          Date.now()
      }
    );
    alert(
      `Duet registered successfully:\n\n` +
      `${member1.name} & ${member2.name}\n` +
      `Song: ${song}\n` +
      `Team: ${team}`
    );
  } catch (error) {
    alert(
      "Could not register duet.\n\n" +
      error.message
    );
  }
}
/* =========================================================
   ADD INDIVIDUAL — TWO ROUNDS
   ========================================================= */
async function addIndividual() {
  const contestantId = document.getElementById("individualId")?.value.trim();
  const name = document.getElementById("individualName")?.value.trim();
  const gender = document.getElementById("individualGender")?.value;
  const roundCount = individualRoundCount();
  const song1 = document.getElementById("individualSong1")?.value.trim();
  const song2 = document.getElementById("individualSong2")?.value.trim();
  const bonusEligible = document.getElementById("individualBonus")?.checked === true;
  if (!contestantId) { alert("Enter the Contestant ID / Number."); return; }
  if (!name) { alert("Enter the contestant name."); return; }
  if (!["Male", "Female"].includes(gender)) { alert("Select the contestant's gender."); return; }
  if (![1, 2].includes(roundCount)) { alert("Select either 1 Round or 2 Rounds."); return; }
  if (!song1) { alert("Enter the Round 1 song."); return; }
  if (roundCount === 2 && !song2) { alert("Enter the Round 2 song."); return; }
  if (roundCount === 2 && song1.toLowerCase() === song2.toLowerCase()) { alert("Round 1 and Round 2 must use two different songs."); return; }
  const duplicate = cs().some(x => String(x.contestantId || "").toLowerCase() === contestantId.toLowerCase());
  if (duplicate) { alert(`Contestant ID "${contestantId}" is already registered.`); return; }
  try {
    const groupId = push(ref(db, "event/contestants")).key;
    const updates = {};
    const now = Date.now();
    const songs = roundCount === 2 ? [[1, song1], [2, song2]] : [[1, song1]];
    for (const [round, song] of songs) {
      const performanceRef = push(ref(db, "event/contestants"));
      updates[`event/contestants/${performanceRef.key}`] = {
        number: null, order: null, name, category: gender, song, teamId: "", team: "", memberIds: [],
        contestantId, performerType: "Individual", performanceType: "Individual",
        individualGroupId: groupId, round, roundCount, bonusEligible, createdAt: now + round
      };
    }
    await update(ref(db), updates);
    alert(`Individual contestant "${name}" registered successfully.\n\nRounds: ${roundCount}\nRound 1: ${song1}${roundCount === 2 ? `\nRound 2: ${song2}` : ""}${bonusEligible ? `\nEarly-registration bonus: +${bonusPoints()} points` : ""}`);
  } catch (error) { alert("Could not register individual contestant.\n\n" + error.message); }
}
/* =========================================================
   SAVE DRAW NUMBERS
   ========================================================= */
async function saveDrawNumbers() {
  const inputs =
    [
      ...document.querySelectorAll(
        ".draw-number-input"
      )
    ];
  if (!inputs.length) {
    alert(
      "There are no performances to number."
    );
    return;
  }
  const assignments = [];
  const usedNumbers =
    new Set();
  for (
    const input of inputs
  ) {
    const id =
      input.dataset.id;
    const number =
      Number(
        input.value
      );
    if (
      !validNumber(
        number,
        1,
        9999
      )
    ) {
      alert(
        "Every performance must have a valid draw number."
      );
      input.focus();
      return;
    }
    if (
      usedNumbers.has(number)
    ) {
      alert(
        `Draw number ${number} has been assigned more than once.\n\nEach performance must have a unique number.`
      );
      input.focus();
      return;
    }
    usedNumbers.add(
      number
    );
    assignments.push({
      id,
      number
    });
  }
  /*
    Detect whether numbers are being changed
    after scoring has already started.
  */
  let changedAfterScoring =
    false;
  assignments.forEach(
    assignment => {
      const existing =
        D.contestants?.[
          assignment.id
        ];
      if (!existing) {
        return;
      }
      if (
        Number(existing.number || 0) !==
        assignment.number &&
        S()[assignment.id] &&
        Object.keys(
          S()[assignment.id]
        ).length
      ) {
        changedAfterScoring =
          true;
      }
    }
  );
  if (
    changedAfterScoring
  ) {
    const proceed =
      confirm(
        "One or more performances already have judge scores.\n\n" +
        "Changing their draw numbers will change the displayed running order.\n\n" +
        "Do you want to continue?"
      );
    if (!proceed) {
      return;
    }
  }
  const updates = {};
  assignments.forEach(
    assignment => {
      updates[
        `event/contestants/${assignment.id}/number`
      ] =
        assignment.number;
      /*
        Keep order synchronized for
        backwards compatibility.
      */
      updates[
        `event/contestants/${assignment.id}/order`
      ] =
        assignment.number;
    }
  );
  try {
    await update(
      ref(db),
      updates
    );
    alert(
      `${assignments.length} performance number(s) saved successfully.\n\n` +
      "The competition running order has been updated."
    );
  } catch (error) {
    alert(
      "Could not save draw numbers.\n\n" +
      error.message
    );
  }
}
/* =========================================================
   DELETE PERFORMANCE
   ========================================================= */
/* =========================================================
   EDIT REGISTERED PERFORMANCE
   ========================================================= */
async function editPerformance(id) {
  const performance = D.contestants?.[id];
  if (!performance) {
    alert("That registered performance could not be found.");
    return;
  }
  const scoreStarted = !!S()[id] && Object.keys(S()[id] || {}).length > 0;
  if (scoreStarted || D.active === id) {
    alert("This performance can no longer be edited because scoring has started. Edit performers before their performance is activated.");
    return;
  }

  const type = performance.performerType || performance.performanceType || "";
  const isIndividual = type === "Individual" && performance.category !== "Duet";

  if (isIndividual) {
    const groupId = performance.individualGroupId || id;
    const records = cs().filter(x =>
      (x.individualGroupId || x.id) === groupId &&
      (x.performerType || x.performanceType) === "Individual"
    );
    const rows = records.length ? records : [performance];
    const first = rows.find(x => Number(x.round) === 1) || performance;
    const second = rows.find(x => Number(x.round) === 2);

    const name = prompt("Contestant / Stage Name:", first.name || "");
    if (name === null) return;
    if (!name.trim()) { alert("The contestant / stage name cannot be blank."); return; }

    const gender = prompt("Gender (Male or Female):", first.category || "");
    if (gender === null) return;
    if (!["Male", "Female"].includes(gender.trim())) { alert("Gender must be Male or Female."); return; }

    const contestantId = prompt("Contestant ID / Number:", first.contestantId || "");
    if (contestantId === null) return;
    if (!contestantId.trim()) { alert("The Contestant ID / Number cannot be blank."); return; }

    const song1 = prompt("Round 1 Song:", first.song || "");
    if (song1 === null) return;
    if (!song1.trim()) { alert("Round 1 Song cannot be blank."); return; }

    let song2 = "";
    if (second) {
      song2 = prompt("Round 2 Song:", second.song || "");
      if (song2 === null) return;
      if (!song2.trim()) { alert("Round 2 Song cannot be blank."); return; }
      if (song1.trim().toLowerCase() === song2.trim().toLowerCase()) {
        alert("Round 1 and Round 2 must use two different songs.");
        return;
      }
    }

    const normalizedId = contestantId.trim().toLowerCase();
    const duplicate = cs().some(x =>
      (x.id !== id) &&
      (x.individualGroupId || x.id) !== groupId &&
      String(x.contestantId || "").trim().toLowerCase() === normalizedId
    );
    if (duplicate) {
      alert(`Contestant ID "${contestantId.trim()}" is already registered.`);
      return;
    }

    const updates = {};
    for (const row of rows) {
      updates[`event/contestants/${row.id}/name`] = name.trim();
      updates[`event/contestants/${row.id}/category`] = gender.trim();
      updates[`event/contestants/${row.id}/contestantId`] = contestantId.trim();
      updates[`event/contestants/${row.id}/song`] = Number(row.round) === 2 ? song2.trim() : song1.trim();
    }

    // If this is a team member, keep the team roster and related duet names/IDs synchronized.
    if (performance.teamId && Array.isArray(performance.memberIds) && performance.memberIds.length === 1) {
      const teamId = performance.teamId;
      const memberKey = performance.memberIds[0];
      updates[`event/teams/${teamId}/members/${memberKey}/name`] = name.trim();
      updates[`event/teams/${teamId}/members/${memberKey}/gender`] = gender.trim();
      updates[`event/teams/${teamId}/members/${memberKey}/memberId`] = contestantId.trim();
      updates[`event/teams/${teamId}/members/${memberKey}/song`] = song1.trim();

      const team = D.teams?.[teamId];
      const duetId = team?.performanceIds?.duet;
      const duet = duetId ? D.contestants?.[duetId] : null;
      if (duet && Array.isArray(duet.memberIds) && duet.memberIds.includes(memberKey)) {
        const ids = Array.isArray(duet.contestantIds) ? [...duet.contestantIds] : [];
        const oldMemberId = performance.contestantId;
        const pos = ids.indexOf(oldMemberId);
        if (pos >= 0) ids[pos] = contestantId.trim();
        updates[`event/contestants/${duetId}/contestantIds`] = ids;
        if (duet.memberIds[0] === memberKey) {
          updates[`event/contestants/${duetId}/name`] = name.trim();
        }
        if (duet.memberIds[1] === memberKey) {
          updates[`event/contestants/${duetId}/name2`] = name.trim();
        }
        if (team.duet?.member1?.memberKey === memberKey) {
          updates[`event/teams/${teamId}/duet/member1/name`] = name.trim();
          updates[`event/teams/${teamId}/duet/member1/memberId`] = contestantId.trim();
        }
        if (team.duet?.member2?.memberKey === memberKey) {
          updates[`event/teams/${teamId}/duet/member2/name`] = name.trim();
          updates[`event/teams/${teamId}/duet/member2/memberId`] = contestantId.trim();
        }
      }
    }

    try {
      await update(ref(db), updates);
      alert("Contestant details updated successfully.");
      render();
    } catch (error) {
      alert("Could not update the contestant details.\n\n" + error.message);
    }
    return;
  }

  if (performance.category === "Duet" || type === "Duet") {
    const song = prompt("Duet Song:", performance.song || "");
    if (song === null) return;
    if (!song.trim()) { alert("The duet song cannot be blank."); return; }
    const updates = { [`event/contestants/${id}/song`]: song.trim() };
    if (performance.teamId) {
      updates[`event/teams/${performance.teamId}/duet/song`] = song.trim();
    }
    try {
      await update(ref(db), updates);
      alert("Duet song updated successfully.");
      render();
    } catch (error) {
      alert("Could not update the duet.\n\n" + error.message);
    }
  }
}

async function deletePerformance(
  id
) {
  const contestant =
    D.contestants?.[id];
  if (!contestant) {
    return;
  }
  if (
    id === D.active
  ) {
    alert(
      "You cannot delete the active performance.\n\n" +
      "Activate another performance first."
    );
    return;
  }
  const scores =
    S()[id] || {};
  const scoreCount =
    Object.keys(
      scores
    ).length;
  let message =
    "Delete this performance?";
  if (
    scoreCount > 0
  ) {
    message =
      `This performance already has ${scoreCount} judge score(s).\n\n` +
      "Deleting it will also delete those scores.\n\n" +
      "Continue?";
  }
  if (
    !confirm(message)
  ) {
    return;
  }
  try {
    const updates = {};
    updates[
      `event/contestants/${id}`
    ] = null;
    updates[
      `event/scores/${id}`
    ] = null;
    await update(
      ref(db),
      updates
    );
  } catch (error) {
    alert(
      "Could not delete performance.\n\n" +
      error.message
    );
  }
}
/* =========================================================
   DELETE TEAM
   ========================================================= */
async function deleteTeam(
  id
) {
  const name =
    teamName(id);
  if (!name) {
    return;
  }
  const performances =
    cs().filter(
      performance =>
        performance.teamId === id ||
        performance.team === name
    );
  if (
    performances.some(
      performance =>
        performance.id ===
        D.active
    )
  ) {
    alert(
      "This team has the active performance.\n\n" +
      "Activate another performance before deleting the team."
    );
    return;
  }
  const hasScores =
    performances.some(
      performance =>
        S()[performance.id] &&
        Object.keys(
          S()[performance.id]
        ).length > 0
    );
  let message =
    `Delete team "${name}"?`;
  if (
    performances.length
  ) {
    message +=
      `\n\nThis will also remove ${performances.length} performance(s) belonging to this team.`;
  }
  if (
    hasScores
  ) {
    message +=
      "\n\nSome of those performances already have scores. Those scores will also be deleted.";
  }
  if (
    !confirm(message)
  ) {
    return;
  }
  if (
    hasScores
  ) {
    const finalConfirm =
      confirm(
        "FINAL CONFIRMATION\n\n" +
        "This team has scored performances.\n\n" +
        "Delete the team, its performances and their scores?"
      );
    if (!finalConfirm) {
      return;
    }
  }
  try {
    const updates = {};
    updates[
      `event/teams/${id}`
    ] = null;
    performances.forEach(
      performance => {
        updates[
          `event/contestants/${performance.id}`
        ] = null;
        updates[
          `event/scores/${performance.id}`
        ] = null;
      }
    );
    await update(
      ref(db),
      updates
    );
    alert(
      `Team "${name}" deleted.`
    );
  } catch (error) {
    alert(
      "Could not delete team.\n\n" +
      error.message
    );
  }
}
/* =========================================================
   VALIDATE JUDGE DRAFT
   ========================================================= */
function validateDraft(criteria = C) {
  for (
    const [key, label, max]
    of criteria
  ) {
    const value =
      Number(
        draft[key]
      );
    if (
      !Number.isFinite(value) ||
      !Number.isInteger(value) ||
      value < 0 ||
      value > max
    ) {
      return {
        ok: false,
        message:
          `Invalid score for ${label}. Maximum is ${max}.`
      };
    }
  }
  const total =
    T(criteria);
  if (
    !Number.isInteger(total) ||
    total < 0 ||
    total > criteriaTotal(criteria)
  ) {
    return {
      ok: false,
      message:
        "Invalid total score."
    };
  }
  return {
    ok: true,
    total
  };
}
/* =========================================================
   WIRE
   ========================================================= */
function wire() {
  /* =======================================================
     LOGIN
     ======================================================= */
  if (!role) {
    document
      .getElementById("aud")
      ?.addEventListener(
        "click",
        () => {
          role =
            "auditor";
          localStorage.setItem(
            "rk_role",
            role
          );
          page =
            "home";
          render();
        }
      );
    document
      .querySelectorAll(".jl")
      .forEach(button => {
        button.addEventListener("click", () => {
          const selectedJudge = button.dataset.id;
          if (!J[selectedJudge] || J[selectedJudge].no > judgeCount()) {
            alert("That Judge is not enabled for this competition.");
            return;
          }
          selectedLoginJudge = selectedJudge;
          render();
        });
      });
    document.getElementById("judgeLogin")?.addEventListener("click", async () => {
      const selectedJudge = selectedLoginJudge;
      const password = document.getElementById("judgeLoginPassword")?.value || "";
      if (!selectedJudge || !J[selectedJudge]) {
        alert("Please select your assigned Judge number first.");
        return;
      }
      if (!password) {
        alert("Please enter your password.");
        return;
      }
      const stored = judgePasswordHash(selectedJudge);
      if (!stored) {
        alert("A password has not been created for this Judge. Please ask the Auditor to set it.");
        return;
      }
      try {
        const enteredHash = await hashJudgePassword(password);
        if (enteredHash !== stored) {
          alert("Incorrect password. Please try again.");
          return;
        }
        judgeFromAuditor = false;
        role = "judge";
        jid = selectedJudge;
        try {
          sessionStorage.setItem("rk_judge_auth", "1");
          sessionStorage.setItem("rk_judge", jid);
        } catch (_) {}
        localStorage.removeItem("rk_role");
        localStorage.removeItem("rk_judge");
        draft = {};
        draftPerformanceId = D.active || null;
        selectedLoginJudge = null;
        render();
      } catch (error) {
        alert("The Judge login could not be completed.\n\n" + error.message);
      }
    });
    return;
  }
  /* =======================================================
     JUDGE
     ======================================================= */
  if (
    role === "judge"
  ) {
    if (
      !jid ||
      !J[jid] ||
      J[jid].no >
        judgeCount()
    ) {
      logout();
      return;
    }
    const judgePerformance = A();
    const judgeCriteria = criteriaForPerformance(judgePerformance);
    const judgeMaxTotal = criteriaTotal(judgeCriteria);
    document
      .querySelectorAll(".sb")
      .forEach(button => {
        button.addEventListener(
          "click",
          () => {
            const key =
              button.dataset.k;
            const value =
              Number(
                button.dataset.n
              );
            const criterion =
              judgeCriteria.find(
                x =>
                  x[0] === key
              );
            if (!criterion) {
              return;
            }
            const max =
              criterion[2];
            if (
              !validNumber(
                value,
                0,
                max
              )
            ) {
              alert(
                "Invalid score."
              );
              return;
            }
            draft[key] =
              value;
            render();
          }
        );
      });
    document
      .getElementById("submit")
      ?.addEventListener(
        "click",
        async () => {
          if (submitting) {
            return;
          }
          if (!D.active) {
            alert(
              "There is no active performance."
            );
            return;
          }
          if (
            !jid ||
            !J[jid]
          ) {
            alert(
              "Judge identification error."
            );
            return;
          }
          const validation =
            validateDraft(judgeCriteria);
          if (!validation.ok) {
            alert(
              validation.message
            );
            return;
          }
          const total =
            validation.total;
          const activeId =
            D.active;
          const contestant =
            D.contestants?.[
              activeId
            ];
          if (!contestant) {
            alert(
              "This performance no longer exists."
            );
            return;
          }
          if (
            !confirm(
              `Submit ${total}/${judgeMaxTotal}?\n\n` +
              "This score will be permanently locked."
            )
          ) {
            return;
          }
          submitting =
            true;
          try {
            const scoreRef =
              ref(
                db,
                `event/scores/${activeId}/${jid}`
              );
            const result =
              await runTransaction(
                scoreRef,
                current => {
                  if (
                    current !== null
                  ) {
                    return;
                  }
                  return {
                    ...draft,
                    criteria: judgeCriteria,
                    total,
                    judgeId:
                      jid,
                    judgeNo:
                      J[jid].no,
                    submitted:
                      true,
                    submittedAt:
                      Date.now()
                  };
                }
              );
            if (
              !result.committed
            ) {
              alert(
                "A score has already been submitted for this performance."
              );
              draft = {};
              render();
              return;
            }
            draft = {};
            alert(
              `Score submitted successfully: ${total}/${judgeMaxTotal}`
            );
            render();
          } catch (error) {
            console.error(
              "Score submission error:",
              error
            );
            alert(
              "The score could not be submitted.\n\n" +
              error.message
            );
          } finally {
            submitting =
              false;
          }
        }
      );
    document
      .getElementById("jout")
      ?.addEventListener(
        "click",
        logout
      );
    document
      .getElementById("backToAuditor")
      ?.addEventListener(
        "click",
        () => {
          judgeFromAuditor = false;
          role = "auditor";
          jid = null;
          draft = {};
          submitting = false;
          draftPerformanceId = null;
          localStorage.setItem("rk_role", "auditor");
          localStorage.removeItem("rk_judge");
          page = "home";
          render();
        }
      );return;
  }
  /* =======================================================
     AUDITOR NAVIGATION
     ======================================================= */
  document
    .querySelectorAll(".nb")
    .forEach(button => {
      button.addEventListener(
        "click",
        () => {
          page =
            button.dataset.p;
          render();
        }
      );
    });
  document
    .getElementById("out")
    ?.addEventListener(
      "click",
      logout
    );
  /* =======================================================
     VERSION 1.1 — RESULTS ACTIONS
     ======================================================= */
  document
    .getElementById("printResults")
    ?.addEventListener(
      "click",
      printResults
    );
  document
    .getElementById("saveResults")
    ?.addEventListener(
      "click",
      saveResults
    );
  /* =======================================================
     AUDITOR JUDGE SCORE REVIEW / CORRECTION
     ======================================================= */
  document.querySelectorAll(".auditor-judge-score").forEach(button => {
    button.addEventListener("click", () => {
      const selectedJudge = button.dataset.judgeId;
      if (!D.active) {
        alert("There is no active performance. Activate a performance first.");
        return;
      }
      if (!S()[D.active]?.[selectedJudge]) {
        alert(`${J[selectedJudge]?.name || "This judge"} has not submitted a score for the current performance yet.`);
        return;
      }
      correctionJudgeId = selectedJudge;
      correctionPerformanceId = D.active;
      page = "judgeCorrection";
      render();
    });
  });
  document.getElementById("saveJudgeCorrection")?.addEventListener("click", saveJudgeCorrection);
  document.getElementById("returnAuditorCorrection")?.addEventListener("click", returnToAuditorFromCorrection);
  document.getElementById("returnAuditorCorrection2")?.addEventListener("click", returnToAuditorFromCorrection);
  const correctionCriteria = criteriaForPerformance(correctionPerformanceId ? D.contestants?.[correctionPerformanceId] : D.contestants?.[D.active]);
  document.querySelectorAll(".correction-score-button").forEach(button => {
    button.addEventListener("click", () => {
      const key = button.dataset.k;
      document.querySelectorAll(`.correction-score-button[data-k="${key}"]`).forEach(b => b.classList.remove("selected"));
      button.classList.add("selected");
      const max = correctionCriteria.find(x => x[0] === key)?.[2] || 0;
      const display = document.getElementById(`correction-display-${key}`);
      if (display) display.textContent = `${Number(button.dataset.n)}/${max}`;
      let total = 0;
      for (const [k] of correctionCriteria) {
        const selected = document.querySelector(`.correction-score-button[data-k="${k}"].selected`);
        total += Number(selected?.dataset.n || 0);
      }
      const totalEl = document.getElementById("correction-total");
      if (totalEl) totalEl.textContent = `TOTAL: ${total}/${criteriaTotal(correctionCriteria)}`;
    });
  });
  /* =======================================================
     COMPETITION DETAILS
     ======================================================= */
  document
    .getElementById("saveCompetitionDetails")
    ?.addEventListener("click", saveCompetitionDetails);
  document.getElementById("saveJudgePasswords")?.addEventListener("click", saveJudgePasswords);
  document.getElementById("saveBonusPoints")?.addEventListener("click", saveBonusPoints);
  document.getElementById("saveIndividualRoundCount")?.addEventListener("click", saveIndividualRoundCount);
  /* =======================================================
     COMPETITION TYPE
     ======================================================= */
  document
    .getElementById(
      "competitionTeam"
    )
    ?.addEventListener(
      "click",
      () =>
        changeCompetitionType(
          COMPETITION_TYPES.TEAM
        )
    );
  document
    .getElementById(
      "competitionIndividual"
    )
    ?.addEventListener(
      "click",
      () =>
        changeCompetitionType(
          COMPETITION_TYPES.INDIVIDUAL
        )
    );
  /* =======================================================
     JUDGE COUNT
     ======================================================= */
  document
    .getElementById("judges3")
    ?.addEventListener(
      "click",
      () =>
        changeJudgeCount(3)
    );
  document
    .getElementById("judges5")
    ?.addEventListener(
      "click",
      () =>
        changeJudgeCount(5)
    );
  /* =======================================================
     EDITABLE JUDGING CRITERIA / BONUS
     ======================================================= */
  document.getElementById("addCriterion")?.addEventListener("click", criteriaEditorAdd);
  document.getElementById("saveCriteria")?.addEventListener("click", saveCriteria);
  document.querySelectorAll(".criterion-up").forEach(b => b.addEventListener("click", () => criteriaEditorMove(Number(b.dataset.index), -1)));
  document.querySelectorAll(".criterion-down").forEach(b => b.addEventListener("click", () => criteriaEditorMove(Number(b.dataset.index), 1)));
  document.querySelectorAll(".criterion-delete").forEach(b => b.addEventListener("click", () => criteriaEditorDelete(Number(b.dataset.index))));
  /* =======================================================
     RESET
     ======================================================= */
  document
    .getElementById(
      "resetCompetition"
    )
    ?.addEventListener(
      "click",
      resetCompetition
    );
  /* =======================================================
     ACTIVATE
     ======================================================= */
  document
    .getElementById("activate")
    ?.addEventListener(
      "click",
      async () => {
        const select =
          document.getElementById(
            "act"
          );
        const id =
          select?.value;
        if (!id) {
          alert(
            "Select a performance first."
          );
          return;
        }
        const contestant =
          D.contestants?.[id];
        if (!contestant) {
          alert(
            "That performance does not exist."
          );
          return;
        }
        if (
          !hasDrawNumber(
            contestant
          )
        ) {
          alert(
            "This performance has not been assigned a draw number yet.\n\n" +
            "Enter the number drawn on the Registration & Draw page first."
          );
          return;
        }
        const existing =
          Object.keys(
            S()[id] || {}
          ).filter(
            judgeId =>
              activeJudges().some(
                judge =>
                  judge.id ===
                  judgeId
              )
          ).length;
        if (
          existing > 0 &&
          id !== D.active
        ) {
          const proceed =
            confirm(
              `This performance already has ${existing} judge score(s).\n\n` +
              "Activate it anyway?"
            );
          if (!proceed) {
            return;
          }
        }
        try {
          const activationCriteria = normalizeCriteria(C);
          const criteriaVersion = Date.now();
          await update(
            ref(db),
            {
              [`event/contestants/${id}/criteria`]: activationCriteria,
              [`event/contestants/${id}/criteriaVersion`]: criteriaVersion,
              [`event/activeCriteria`]: activationCriteria,
              [`event/activeCriteriaVersion`]: criteriaVersion,
              [`event/active`]: id
            }
          );
          draft = {};
          draftPerformanceId =
            id;
        } catch (error) {
          alert(
            "Could not activate performance.\n\n" +
            error.message
          );
        }
      }
    );
  /* =======================================================
     ADD TEAM
     ======================================================= */
  document
    .getElementById(
      "addTeamRoster"
    )
    ?.addEventListener(
      "click",
      addTeamRoster
    );
  /* =======================================================
     ADD DUET
     ======================================================= */
  document
    .getElementById(
      "addDuet"
    )
    ?.addEventListener(
      "click",
      addDuet
    );
  /* =======================================================
     DUET TEAM SELECTION
     ======================================================= */
  const duetTeam =
    document.getElementById(
      "duetTeam"
    );
  if (duetTeam) {
    duetTeam.addEventListener(
      "change",
      () => {
        const member1 =
          document.getElementById(
            "duetMember1"
          );
        const member2 =
          document.getElementById(
            "duetMember2"
          );
        if (!member1 || !member2) {
          return;
        }
        member1.innerHTML =
          memberOptions(
            duetTeam.value
          );
        member2.innerHTML =
          memberOptions(
            duetTeam.value
          );
      }
    );
  }
  /* =======================================================
     DUET MEMBER 1
     ======================================================= */
  document
    .getElementById(
      "duetMember1"
    )
    ?.addEventListener(
      "change",
      () => {
        const member1 =
          document.getElementById(
            "duetMember1"
          );
        const member2 =
          document.getElementById(
            "duetMember2"
          );
        if (!member1 || !member2) {
          return;
        }
        const selected =
          member1.value;
        [
          ...member2.options
        ].forEach(
          option => {
            option.disabled =
              option.value &&
              option.value ===
              selected;
          }
        );
        if (
          member2.value ===
          selected
        ) {
          member2.value =
            "";
        }
      }
    );
  /* =======================================================
     ADD INDIVIDUAL
     ======================================================= */
  document
    .getElementById(
      "addIndividual"
    )
    ?.addEventListener(
      "click",
      addIndividual
    );
  /* =======================================================
     SAVE DRAW NUMBERS
     ======================================================= */
  document
    .getElementById(
      "saveDrawNumbers"
    )
    ?.addEventListener(
      "click",
      saveDrawNumbers
    );
  /* =======================================================
     EDIT REGISTERED PERFORMANCES
     ======================================================= */
  document.querySelectorAll(".edit-performance").forEach(button => {
    button.addEventListener("click", () => editPerformance(button.dataset.id));
  });
  /* =======================================================
     DELETE PERFORMANCES
     ======================================================= */
  document
    .querySelectorAll(".del")
    .forEach(button => {
      button.addEventListener(
        "click",
        () =>
          deletePerformance(
            button.dataset.id
          )
      );
    });
  /* =======================================================
     DELETE TEAMS
     ======================================================= */
  document
    .querySelectorAll(
      ".delete-team"
    )
    .forEach(button => {
      button.addEventListener(
        "click",
        () =>
          deleteTeam(
            button.dataset.id
          )
      );
    });
}
/* =========================================================
   RENDER
   ========================================================= */
function render() {
  if (!D || !D.name) {
    root.innerHTML = `
      <div class="wrap">
        <div class="card hero">
          <div class="big">🎤</div>
          <h2>Loading Royal Karaoke SKN...</h2>
        </div>
      </div>
    `;
    return;
  }
  /* LOGIN */
  if (!role) {
    root.innerHTML =
      login();
  }
  /* JUDGE */
  else if (
    role === "judge"
  ) {
    root.innerHTML =
      head() +
      judge();
  }
  /* AUDITOR */
  else {
    if (page === "judgeCorrection") {
      root.innerHTML = head() + auditorJudgeCorrection();
    } else {
      const body =
        page === "contestants"
          ? cont()
          : page === "live"
          ? live()
          : page === "results"
          ? results()
          : dash();
      root.innerHTML =
        head() +
        `<div class="wrap">
          ${nav()}
          ${body}
        </div>`;
    }
  }
  wire();
}
/* =========================================================
   START APPLICATION
   ========================================================= */
start();

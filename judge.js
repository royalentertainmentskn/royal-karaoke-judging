import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";

import {
  getDatabase,
  ref,
  set,
  onValue
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-database.js";

import {
  getAuth,
  signInAnonymously
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";

import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

const CRITERIA = [
  { key: "voiceManagement", name: "Voice Management", max: 10 },
  { key: "voiceTiming", name: "Voice Timing", max: 20 },
  { key: "costume", name: "Costume", max: 5 },
  { key: "props", name: "Props", max: 5 },
  { key: "performance", name: "Performance", max: 40 },
  { key: "crowdResponse", name: "Crowd Response", max: 20 }
];

const JUDGES = {
  1: "Judge 1",
  2: "Judge 2",
  3: "Judge 3",
  4: "Judge 4",
  5: "Judge 5"
};

let judgeNumber = null;
let eventData = {};
let currentScores = {};
let submitted = false;

const appRoot = document.getElementById("app");

function getJudgeFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const value = Number(params.get("judge"));

  if (value >= 1 && value <= 5) {
    return value;
  }

  return null;
}

function activeJudgeCount() {
  const count = Number(eventData.judgeCount || 5);
  return count === 3 ? 3 : 5;
}

function isJudgeActive() {
  return judgeNumber && judgeNumber <= activeJudgeCount();
}

function activePerformance() {
  return eventData.active || null;
}

function totalScore(scores) {
  return CRITERIA.reduce((total, item) => {
    return total + Number(scores[item.key] || 0);
  }, 0);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderHeader() {
  return `
    <div class="header">
      <h1>ROYAL KARAOKE SKN</h1>
      <p>Championship Judging</p>
      <div class="judge-badge">
        ${escapeHtml(JUDGES[judgeNumber] || "Judge")}
      </div>
    </div>
  `;
}

function renderWaiting(message = "Waiting for the Auditor to activate a performance.") {
  appRoot.innerHTML = `
    ${renderHeader()}

    <div class="card waiting">
      <h2>WAITING</h2>
      <p>${escapeHtml(message)}</p>
    </div>
  `;
}

function renderInactive() {
  appRoot.innerHTML = `
    <div class="header">
      <h1>ROYAL KARAOKE SKN</h1>
      <p>Judging Station</p>
    </div>

    <div class="card waiting">
      <h2>JUDGE NOT ACTIVE</h2>
      <p>
        This judge station is not currently active for this competition.
      </p>
    </div>
  `;
}

function renderError(message) {
  appRoot.innerHTML = `
    <div class="header">
      <h1>ROYAL KARAOKE SKN</h1>
    </div>

    <div class="card waiting">
      <h2>JUDGE STATION ERROR</h2>
      <p class="error">${escapeHtml(message)}</p>
    </div>
  `;
}

function renderSubmitted(performance) {
  const score = totalScore(currentScores);

  appRoot.innerHTML = `
    ${renderHeader()}

    <div class="card submitted">
      <div class="performance-number">
        PERFORMANCE #${escapeHtml(performance.number)}
      </div>

      <h2>Score Submitted</h2>

      <div class="final-number">
        ${score}
      </div>

      <p>
        Your score has been recorded and locked.
      </p>

      <p>
        Please wait for the next performance.
      </p>
    </div>
  `;
}

function renderScoring(performance) {
  const score = totalScore(currentScores);

  const contestantName =
    performance.category === "Duet"
      ? `${performance.name || ""} & ${performance.secondName || ""}`
      : performance.name || "";

  const criteriaHtml = CRITERIA.map(item => {
    const selected = Number(currentScores[item.key] || 0);

    let buttons = "";

    for (let i = 0; i <= item.max; i++) {
      buttons += `
        <button
          class="score-btn ${selected === i ? "selected" : ""}"
          data-criterion="${item.key}"
          data-score="${i}"
          ${submitted ? "disabled" : ""}
        >
          ${i}
        </button>
      `;
    }

    return `
      <div class="criterion">
        <div class="criterion-top">
          <div class="criterion-name">
            ${escapeHtml(item.name)}
          </div>

          <div class="criterion-max">
            Max ${item.max}
          </div>
        </div>

        <div class="score-buttons">
          ${buttons}
        </div>
      </div>
    `;
  }).join("");

  appRoot.innerHTML = `
    ${renderHeader()}

    <div class="card">

      <div class="performance-number">
        PERFORMANCE #${escapeHtml(performance.number)}
      </div>

      <div class="contestant-name">
        ${escapeHtml(contestantName)}
      </div>

      <div class="details">
        <div>
          <strong>Category:</strong>
          ${escapeHtml(performance.category)}
        </div>

        <div>
          <strong>Song:</strong>
          ${escapeHtml(performance.song)}
        </div>

        <div>
          <strong>Team:</strong>
          ${escapeHtml(performance.teamName || "—")}
        </div>
      </div>

      <div class="criteria">
        ${criteriaHtml}
      </div>

      <div class="total-box">
        <div class="total-label">
          CURRENT TOTAL
        </div>

        <div class="total-score">
          ${score} / 100
        </div>
      </div>

      <div class="status" id="status"></div>

      <button
        class="submit-btn"
        id="submitScore"
        ${submitted ? "disabled" : ""}
      >
        ${submitted ? "SCORE SUBMITTED" : "SUBMIT SCORE"}
      </button>

    </div>
  `;

  wireScoring(performance);
}

function wireScoring(performance) {
  document.querySelectorAll(".score-btn").forEach(button => {
    button.addEventListener("click", () => {

      if (submitted) return;

      const criterion = button.dataset.criterion;
      const score = Number(button.dataset.score);

      currentScores[criterion] = score;

      renderScoring(performance);
    });
  });

  const submitButton = document.getElementById("submitScore");

  if (submitButton) {
    submitButton.addEventListener("click", () => {
      submitScore(performance);
    });
  }
}

async function submitScore(performance) {

  if (submitted) return;

  const missing = CRITERIA.filter(item => {
    return currentScores[item.key] === undefined;
  });

  if (missing.length > 0) {
    const status = document.getElementById("status");

    if (status) {
      status.textContent =
        "Please enter a score for every judging category.";
      status.className = "status error";
    }

    return;
  }

  const scoreTotal = totalScore(currentScores);

  if (scoreTotal > 100) {
    alert("The total score cannot exceed 100.");
    return;
  }

  const scoreRef = ref(
    db,
    `event/scores/${performance.id}/j${judgeNumber}`
  );

  try {

    await set(scoreRef, {
      voiceManagement: Number(currentScores.voiceManagement),
      voiceTiming: Number(currentScores.voiceTiming),
      costume: Number(currentScores.costume),
      props: Number(currentScores.props),
      performance: Number(currentScores.performance),
      crowdResponse: Number(currentScores.crowdResponse),
      total: scoreTotal,
      submittedAt: Date.now()
    });

    submitted = true;

    renderSubmitted(performance);

  } catch (error) {

    console.error(error);

    const status = document.getElementById("status");

    if (status) {
      status.textContent =
        "Unable to submit the score. Please try again.";
      status.className = "status error";
    }
  }
}

function processEvent(data) {

  eventData = data || {};

  if (!isJudgeActive()) {
    renderInactive();
    return;
  }

  const performance = activePerformance();

  if (!performance) {
    submitted = false;
    currentScores = {};
    renderWaiting();
    return;
  }

  const scoreForThisJudge =
    eventData.scores &&
    eventData.scores[performance.id] &&
    eventData.scores[performance.id][`j${judgeNumber}`];

  /*
    If Firebase already contains a submitted score for this
    performance, lock this judge's screen.
  */

  if (scoreForThisJudge && scoreForThisJudge.submittedAt) {

    currentScores = {
      voiceManagement: Number(scoreForThisJudge.voiceManagement || 0),
      voiceTiming: Number(scoreForThisJudge.voiceTiming || 0),
      costume: Number(scoreForThisJudge.costume || 0),
      props: Number(scoreForThisJudge.props || 0),
      performance: Number(scoreForThisJudge.performance || 0),
      crowdResponse: Number(scoreForThisJudge.crowdResponse || 0)
    };

    submitted = true;

    renderSubmitted(performance);

    return;
  }

  /*
    New performance.
    Clear the previous score.
  */

  submitted = false;
  currentScores = {};

  renderScoring(performance);
}

async function start() {

  judgeNumber = getJudgeFromUrl();

  if (!judgeNumber) {
    renderError(
      "No valid judge number was supplied. Use ?judge=1, ?judge=2, ?judge=3, etc."
    );
    return;
  }

  try {

    await signInAnonymously(auth);

    onValue(ref(db, "event"), snapshot => {
      processEvent(snapshot.val());
    });

  } catch (error) {

    console.error(error);

    renderError(
      "Unable to connect to the judging system."
    );
  }
}

start();

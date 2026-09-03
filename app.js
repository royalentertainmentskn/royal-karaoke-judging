// ============================================================
// ROYAL KARAOKE SKN — DIGITAL JUDGING SYSTEM
// COMPLETE APP.JS
// ============================================================

import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";

import {
  getDatabase,
  ref,
  set,
  update,
  onValue,
  get,
  remove
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-database.js";

import {
  getAuth,
  signInAnonymously
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";

import {
  firebaseConfig
} from "./firebase-config.js";


// ============================================================
// BASIC APP SETUP
// ============================================================

const root = document.getElementById("app");

if (!root) {
  throw new Error("The #app element was not found in index.html.");
}


// Show something immediately.
// This prevents the page from appearing completely blank while
// Firebase is connecting.
root.innerHTML = `
  <div class="app">
    <div class="card" style="max-width:700px;margin:60px auto;text-align:center;">
      <h1>ROYAL KARAOKE SKN</h1>
      <h2>Digital Judging System</h2>
      <p>Connecting to the judging system...</p>
      <div style="font-size:32px;margin-top:20px;">🎤</div>
    </div>
  </div>
`;


// ============================================================
// FIREBASE
// ============================================================

let firebaseApp;
let db;
let auth;

try {

  firebaseApp = initializeApp(firebaseConfig);
  db = getDatabase(firebaseApp);
  auth = getAuth(firebaseApp);

} catch (error) {

  console.error("Firebase initialization error:", error);

  root.innerHTML = `
    <div class="app">
      <div class="card error-card" style="max-width:800px;margin:60px auto;">
        <h2>Firebase Initialization Error</h2>
        <p>The judging system could not start.</p>
        <pre style="white-space:pre-wrap;">${escapeHTML(error.message || String(error))}</pre>
        <p>Please check your Firebase configuration.</p>
      </div>
    </div>
  `;

  throw error;
}


// ============================================================
// APPLICATION STATE
// ============================================================

let D = {};

let role = localStorage.getItem("rk_role") || null;

let jid = localStorage.getItem("rk_judge") || null;

let page = "home";

let draft = {};

let submitting = false;

let draftPerformanceId = null;


// ============================================================
// JUDGING CRITERIA
// ============================================================

const CRITERIA = {
  voiceManagement: {
    label: "Voice Management",
    max: 10
  },

  voiceTiming: {
    label: "Voice Timing",
    max: 20
  },

  costume: {
    label: "Costume",
    max: 5
  },

  props: {
    label: "Props",
    max: 5
  },

  performance: {
    label: "Performance",
    max: 40
  },

  crowdResponse: {
    label: "Crowd Response",
    max: 20
  }
};


// ============================================================
// JUDGES
// ============================================================

const JUDGES = {
  j1: {
    name: "Judge 1"
  },

  j2: {
    name: "Judge 2"
  },

  j3: {
    name: "Judge 3"
  },

  j4: {
    name: "Judge 4"
  },

  j5: {
    name: "Judge 5"
  }
};


// ============================================================
// CATEGORIES
// ============================================================

const CATEGORIES = [
  "Male",
  "Female",
  "Duet",
  "Team"
];


// ============================================================
// DEMO CONTESTANTS
// ============================================================

const DEMO_CONTESTANTS = {

  c1: {
    id: "c1",
    name: "Demo Male",
    category: "Male",
    song: "Demo Song",
    draw: 1
  },

  c2: {
    id: "c2",
    name: "Demo Female",
    category: "Female",
    song: "Demo Song",
    draw: 2
  },

  c3: {
    id: "c3",
    name: "Demo Duet",
    category: "Duet",
    song: "Demo Song",
    draw: 3
  },

  c4: {
    id: "c4",
    name: "Demo Team",
    category: "Team",
    song: "Demo Song",
    draw: 4
  }

};


// ============================================================
// DEFAULT EVENT
// ============================================================

function defaultEvent() {

  return {

    name: "Royal Karaoke SKN Championship",

    venue: "Venue TBD",

    date: "2026-09-27",

    active: null,

    finalized: false,

    judgeCount: 3,

    judges: JUDGES,

    contestants: {},

    scores: {}

  };

}


// ============================================================
// HTML ESCAPE
// ============================================================

function escapeHTML(value) {

  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

}


// ============================================================
// HELPERS
// ============================================================

function judgeCount() {

  return Number(D.judgeCount || 3);

}


function enabledJudges() {

  const count = judgeCount();

  return Object.keys(JUDGES).slice(0, count);

}


function contestants() {

  return Object.values(D.contestants || {})
    .sort((a, b) => Number(a.draw || 9999) - Number(b.draw || 9999));

}


function scores() {

  return D.scores || {};

}


function activeContestant() {

  if (!D.active) {
    return null;
  }

  return (D.contestants || {})[D.active] || null;

}


function totalDraft() {

  let total = 0;

  Object.keys(CRITERIA).forEach(key => {

    total += Number(draft[key] || 0);

  });

  return total;

}


function performanceScore(contestantId) {

  const allScores = scores();

  const contestantScores = allScores[contestantId] || {};

  const judgeIds = enabledJudges();

  const totals = [];

  judgeIds.forEach(judgeId => {

    const score = contestantScores[judgeId];

    if (!score) {
      return;
    }

    let total = 0;

    Object.keys(CRITERIA).forEach(key => {

      total += Number(score[key] || 0);

    });

    totals.push(total);

  });

  if (!totals.length) {
    return null;
  }

  return totals.reduce((a, b) => a + b, 0) / totals.length;

}


// ============================================================
// LOGOUT
// ============================================================

function logout() {

  localStorage.removeItem("rk_role");

  localStorage.removeItem("rk_judge");

  role = null;

  jid = null;

  page = "home";

  draft = {};

  draftPerformanceId = null;

  render();

}


// ============================================================
// HEADER
// ============================================================

function head(title = "Royal Karaoke SKN") {

  return `

    <header class="topbar">

      <div>

        <div class="brand">
          ROYAL KARAOKE SKN
        </div>

        <div class="subtitle">
          DIGITAL JUDGING SYSTEM
        </div>

      </div>

      ${
        role === "judge"
          ? `<div class="role-badge">
              ${escapeHTML(JUDGES[jid]?.name || "Judge")}
             </div>`
          : ""
      }

    </header>

  `;

}


// ============================================================
// NAVIGATION
// ============================================================

function nav() {

  return `

    <nav class="nav">

      <button data-page="home">
        Dashboard
      </button>

      <button data-page="contestants">
        Contestants
      </button>

      <button data-page="live">
        Live Scores
      </button>

      <button data-page="results">
        Results
      </button>

      <button data-page="settings">
        Settings
      </button>

      <button id="logoutBtn">
        Logout
      </button>

    </nav>

  `;

}


// ============================================================
// LOGIN PAGE
// ============================================================

function login() {

  return `

    <div class="app">

      <div class="login-card card">

        <div class="logo">
          👑
        </div>

        <h1>
          ROYAL KARAOKE SKN
        </h1>

        <h2>
          DIGITAL JUDGING SYSTEM
        </h2>

        <p>
          Select your role to continue.
        </p>


        <div class="login-actions">

          <button
            id="auditorLogin"
            class="primary">
            AUDITOR
          </button>


          <div class="judge-title">
            JUDGE LOGIN
          </div>


          <div class="judge-list">

            ${
              Object.entries(JUDGES)
                .map(([id, judge]) => `
                  <button
                    class="judge-login jl"
                    data-judge="${id}">
                    ${escapeHTML(judge.name)}
                  </button>
                `)
                .join("")
            }

          </div>

        </div>

      </div>

    </div>

  `;

}


// ============================================================
// AUDITOR DASHBOARD
// ============================================================

function dashboard() {

  const active = activeContestant();

  const count = contestants().length;

  const judgeTotal = judgeCount();

  const submitted = active
    ? enabledJudges().filter(j => scores()[active.id]?.[j]).length
    : 0;


  return `

    ${head()}

    ${nav()}

    <main class="container">

      <div class="card">

        <h1>
          Auditor Dashboard
        </h1>

        <p>
          ${escapeHTML(D.name || "Royal Karaoke SKN Championship")}
        </p>

        <p>
          ${escapeHTML(D.venue || "Venue TBD")}
          ${D.date ? " • " + escapeHTML(D.date) : ""}
        </p>

      </div>


      <div class="grid">

        <div class="stat card">

          <h3>
            Contestants
          </h3>

          <strong>
            ${count}
          </strong>

        </div>


        <div class="stat card">

          <h3>
            Judges
          </h3>

          <strong>
            ${judgeTotal}
          </strong>

        </div>


        <div class="stat card">

          <h3>
            Active Performance
          </h3>

          <strong>
            ${active ? escapeHTML(active.name) : "None"}
          </strong>

        </div>


        <div class="stat card">

          <h3>
            Scores Received
          </h3>

          <strong>
            ${active ? `${submitted}/${judgeTotal}` : "—"}
          </strong>

        </div>

      </div>


      <div class="card">

        <h2>
          Performance Control
        </h2>


        ${
          active
            ? `

              <div class="active-performance">

                <h2>
                  #${escapeHTML(active.draw)}
                  —
                  ${escapeHTML(active.name)}
                </h2>

                <p>
                  ${escapeHTML(active.category)}
                  ${active.song ? " • " + escapeHTML(active.song) : ""}
                </p>

              </div>


              <button
                id="clearActive"
                class="danger">
                END ACTIVE PERFORMANCE
              </button>

            `
            : `

              <p>
                Select a contestant below to activate their performance.
              </p>

            `
        }

      </div>


      <div class="card">

        <h2>
          Activate Performance
        </h2>

        <select id="act">

          <option value="">
            Select contestant
          </option>

          ${
            contestants()
              .map(c => `
                <option
                  value="${escapeHTML(c.id)}"
                  ${D.active === c.id ? "selected" : ""}>
                  #${escapeHTML(c.draw)}
                  — ${escapeHTML(c.name)}
                  — ${escapeHTML(c.category)}
                </option>
              `)
              .join("")
          }

        </select>


        <button
          id="activateBtn"
          class="primary">
          ACTIVATE PERFORMANCE
        </button>

      </div>


      <div class="card">

        <h2>
          Quick Actions
        </h2>

        <div class="button-row">

          <button data-page="contestants">
            Manage Contestants
          </button>

          <button data-page="live">
            View Live Scores
          </button>

          <button data-page="results">
            View Results
          </button>

        </div>

      </div>

    </main>

  `;

}


// ============================================================
// CONTESTANTS PAGE
// ============================================================

function contestantsPage() {

  const list = contestants();


  return `

    ${head()}

    ${nav()}

    <main class="container">

      <div class="card">

        <h1>
          Contestant Registration
        </h1>

        <div class="form-grid">

          <input
            id="newName"
            type="text"
            placeholder="Contestant / Team Name"
          />


          <select id="newCategory">

            <option value="">
              Select Category
            </option>

            ${
              CATEGORIES
                .map(c => `
                  <option value="${c}">
                    ${c}
                  </option>
                `)
                .join("")
            }

          </select>


          <input
            id="newSong"
            type="text"
            placeholder="Song Title"
          />

        </div>


        <button
          id="registerBtn"
          class="primary">
          REGISTER CONTESTANT
        </button>

      </div>


      <div class="card">

        <h2>
          Registered Contestants
        </h2>


        ${
          list.length === 0

            ? `<p>No contestants registered yet.</p>`

            : `

              <div class="table-wrap">

                <table>

                  <thead>

                    <tr>

                      <th>
                        Draw
                      </th>

                      <th>
                        Name
                      </th>

                      <th>
                        Category
                      </th>

                      <th>
                        Song
                      </th>

                      <th>
                        Action
                      </th>

                    </tr>

                  </thead>


                  <tbody>

                    ${
                      list.map(c => `

                        <tr>

                          <td>
                            ${escapeHTML(c.draw)}
                          </td>

                          <td>
                            ${escapeHTML(c.name)}
                          </td>

                          <td>
                            ${escapeHTML(c.category)}
                          </td>

                          <td>
                            ${escapeHTML(c.song || "")}
                          </td>

                          <td>

                            <button
                              class="danger delete-contestant"
                              data-id="${escapeHTML(c.id)}">
                              DELETE
                            </button>

                          </td>

                        </tr>

                      `).join("")
                    }

                  </tbody>

                </table>

              </div>

            `
        }

      </div>

    </main>

  `;

}


// ============================================================
// LIVE SCORES
// ============================================================

function live() {

  const active = activeContestant();

  if (!active) {

    return `

      ${head()}

      ${nav()}

      <main class="container">

        <div class="card">

          <h1>
            Live Scores
          </h1>

          <p>
            No performance is currently active.
          </p>

        </div>

      </main>

    `;

  }


  const contestantScores = scores()[active.id] || {};

  const judgeIds = enabledJudges();


  return `

    ${head()}

    ${nav()}

    <main class="container">

      <div class="card">

        <h1>
          LIVE PERFORMANCE
        </h1>

        <h2>
          #${escapeHTML(active.draw)}
          —
          ${escapeHTML(active.name)}
        </h2>

        <p>
          ${escapeHTML(active.category)}
          ${active.song ? " • " + escapeHTML(active.song) : ""}
        </p>

      </div>


      <div class="card">

        <h2>
          Judge Submissions
        </h2>


        <div class="scoreboard">

          ${
            judgeIds.map(j => {

              const score = contestantScores[j];

              if (!score) {

                return `

                  <div class="judge-score">

                    <h3>
                      ${escapeHTML(JUDGES[j].name)}
                    </h3>

                    <p>
                      Waiting for score...
                    </p>

                  </div>

                `;

              }


              let total = 0;

              Object.keys(CRITERIA).forEach(k => {

                total += Number(score[k] || 0);

              });


              return `

                <div class="judge-score">

                  <h3>
                    ${escapeHTML(JUDGES[j].name)}
                  </h3>

                  <strong>
                    ${total} / 100
                  </strong>

                </div>

              `;

            }).join("")
          }

        </div>


        <div class="grand-total">

          <span>
            Current Average
          </span>

          <strong>
            ${
              performanceScore(active.id) === null
                ? "—"
                : performanceScore(active.id).toFixed(2)
            }
          </strong>

        </div>

      </div>

    </main>

  `;

}


// ============================================================
// RESULTS
// ============================================================

function results() {

  const list = contestants();

  const rows = list
    .map(c => {

      const score = performanceScore(c.id);

      return {
        contestant: c,
        score
      };

    })
    .filter(x => x.score !== null)
    .sort((a, b) => b.score - a.score);


  return `

    ${head()}

    ${nav()}

    <main class="container">

      <div class="card">

        <h1>
          Competition Results
        </h1>

        <p>
          Scores are calculated from all enabled judges.
        </p>

      </div>


      <div class="card">

        ${
          rows.length === 0

            ? `<p>No completed scores yet.</p>`

            : `

              <div class="table-wrap">

                <table>

                  <thead>

                    <tr>

                      <th>
                        Position
                      </th>

                      <th>
                        Draw
                      </th>

                      <th>
                        Contestant
                      </th>

                      <th>
                        Category
                      </th>

                      <th>
                        Score
                      </th>

                    </tr>

                  </thead>


                  <tbody>

                    ${
                      rows.map((row, index) => `

                        <tr>

                          <td>
                            ${index + 1}
                          </td>

                          <td>
                            ${escapeHTML(row.contestant.draw)}
                          </td>

                          <td>
                            ${escapeHTML(row.contestant.name)}
                          </td>

                          <td>
                            ${escapeHTML(row.contestant.category)}
                          </td>

                          <td>
                            <strong>
                              ${row.score.toFixed(2)}
                            </strong>
                          </td>

                        </tr>

                      `).join("")
                    }

                  </tbody>

                </table>

              </div>

            `
        }

      </div>

    </main>

  `;

}


// ============================================================
// SETTINGS
// ============================================================

function settings() {

  return `

    ${head()}

    ${nav()}

    <main class="container">

      <div class="card">

        <h1>
          Competition Settings
        </h1>


        <label>
          Number of Judges
        </label>


        <select id="judgeCountSelect">

          <option
            value="3"
            ${judgeCount() === 3 ? "selected" : ""}>
            3 Judges
          </option>

          <option
            value="5"
            ${judgeCount() === 5 ? "selected" : ""}>
            5 Judges
          </option>

        </select>


        <button
          id="saveJudgeCount"
          class="primary">
          SAVE JUDGE COUNT
        </button>

      </div>


      <div class="card">

        <h2>
          Judging Criteria
        </h2>


        <div class="criteria-list">

          ${
            Object.entries(CRITERIA)
              .map(([key, item]) => `

                <div class="criteria-row">

                  <span>
                    ${escapeHTML(item.label)}
                  </span>

                  <strong>
                    ${item.max} pts
                  </strong>

                </div>

              `)
              .join("")
          }


          <div class="criteria-row total">

            <span>
              TOTAL
            </span>

            <strong>
              100 pts
            </strong>

          </div>

        </div>

      </div>


      <div class="card danger-zone">

        <h2>
          Competition Reset
        </h2>

        <p>
          This removes contestants, scores and the active performance.
        </p>


        <button
          id="resetCompetition"
          class="danger">
          RESET COMPETITION
        </button>

      </div>

    </main>

  `;

}


// ============================================================
// SCORE BUTTONS
// ============================================================

function scoreButtons(key, max) {

  let html = `

    <div class="score-category">

      <div class="score-category-title">

        <span>
          ${escapeHTML(CRITERIA[key].label)}
        </span>

        <strong>
          ${max} pts
        </strong>

      </div>


      <div class="score-buttons">

  `;


  for (let i = 0; i <= max; i++) {

    html += `

      <button
        type="button"
        class="score-btn ${Number(draft[key] || 0) === i ? "selected" : ""}"
        data-key="${key}"
        data-value="${i}">

        ${i}

      </button>

    `;

  }


  html += `

      </div>

    </div>

  `;


  return html;

}


// ============================================================
// JUDGE PAGE
// ============================================================

function judge() {

  const active = activeContestant();


  // ----------------------------------------------------------
  // WAITING SCREEN
  // ----------------------------------------------------------

  if (!active) {

    return `

      <div class="app">

        ${head("Judge")}

        <main class="container">

          <div class="card waiting-card">

            <div class="waiting-icon">
              🎤
            </div>

            <h1>
              WAITING FOR AUDITOR
            </h1>

            <p>
              The next performance will appear here automatically.
            </p>


            <div class="judge-info">

              <strong>
                ${escapeHTML(JUDGES[jid]?.name || "Judge")}
              </strong>

            </div>


            <button
              id="jwaitingLogout"
              class="secondary">
              RETURN TO LOGIN
            </button>

          </div>

        </main>

      </div>

    `;

  }


  // ----------------------------------------------------------
  // NEW PERFORMANCE
  // ----------------------------------------------------------

  if (draftPerformanceId !== active.id) {

    draft = {};

    draftPerformanceId = active.id;

  }


  return `

    <div class="app">

      ${head("Judge")}


      <main class="container">

        <div class="card performance-header">

          <div class="draw-number">

            #${escapeHTML(active.draw)}

          </div>


          <h1>
            ${escapeHTML(active.name)}
          </h1>


          <p>
            ${escapeHTML(active.category)}
          </p>


          ${
            active.song
              ? `<p>
                   <strong>Song:</strong>
                   ${escapeHTML(active.song)}
                 </p>`
              : ""
          }

        </div>


        <div class="card">

          <h2>
            YOUR SCORE
          </h2>


          ${
            Object.entries(CRITERIA)
              .map(([key, item]) =>
                scoreButtons(key, item.max)
              )
              .join("")
          }


          <div class="score-total">

            <span>
              TOTAL SCORE
            </span>

            <strong>
              <span id="draftTotal">
                ${totalDraft()}
              </span>
              / 100
            </strong>

          </div>


          <button
            id="submitScoreBtn"
            class="primary submit-score">

            ${
              submitting
                ? "SUBMITTING..."
                : "SUBMIT SCORE"
            }

          </button>


          <button
            id="jout"
            class="secondary">

            RETURN TO LOGIN

          </button>

        </div>

      </main>

    </div>

  `;

}


// ============================================================
// ACTIVATE PERFORMANCE
// ============================================================

async function activate(id) {

  if (!id) {
    alert("Please select a contestant.");
    return;
  }


  try {

    await update(ref(db, "event"), {
      active: id,
      finalized: false
    });

  } catch (error) {

    console.error(error);

    alert(
      "Could not activate the performance.\n\n" +
      (error.message || error)
    );

  }

}


// ============================================================
// SUBMIT SCORE
// ============================================================

async function submitScore() {

  if (submitting) {
    return;
  }


  const active = activeContestant();


  if (!active) {

    alert(
      "There is no active performance."
    );

    return;

  }


  if (!jid) {

    alert(
      "Judge identification is missing. Please return to login."
    );

    logout();

    return;

  }


  // Check that every criterion has a score.
  const missing = Object.entries(CRITERIA)
    .filter(([key]) => draft[key] === undefined)
    .map(([, item]) => item.label);


  if (missing.length) {

    alert(
      "Please score every judging category before submitting.\n\n" +
      missing.join("\n")
    );

    return;

  }


  const total = totalDraft();


  if (total < 0 || total > 100) {

    alert(
      "The score must be between 0 and 100."
    );

    return;

  }


  submitting = true;

  render();


  try {

    const scoreData = {

      voiceManagement:
        Number(draft.voiceManagement || 0),

      voiceTiming:
        Number(draft.voiceTiming || 0),

      costume:
        Number(draft.costume || 0),

      props:
        Number(draft.props || 0),

      performance:
        Number(draft.performance || 0),

      crowdResponse:
        Number(draft.crowdResponse || 0),

      submittedAt:
        Date.now()

    };


    await set(
      ref(
        db,
        `event/scores/${active.id}/${jid}`
      ),
      scoreData
    );


    submitting = false;

    alert(
      `Score submitted successfully.\n\n` +
      `${active.name}: ${total}/100`
    );


    draft = {};

    draftPerformanceId = active.id;

    render();


  } catch (error) {

    console.error(
      "Score submission error:",
      error
    );

    submitting = false;

    render();


    alert(
      "The score could not be submitted.\n\n" +
      (error.message || error)
    );

  }

}


// ============================================================
// REGISTER CONTESTANT
// ============================================================

async function registerContestant() {

  const nameInput =
    document.getElementById("newName");

  const categoryInput =
    document.getElementById("newCategory");

  const songInput =
    document.getElementById("newSong");


  const name =
    nameInput?.value.trim();

  const category =
    categoryInput?.value;

  const song =
    songInput?.value.trim();


  if (!name) {

    alert(
      "Please enter the contestant or team name."
    );

    return;

  }


  if (!category) {

    alert(
      "Please select a category."
    );

    return;

  }


  const existing =
    contestants();


  const nextDraw =
    existing.reduce(
      (highest, c) =>
        Math.max(
          highest,
          Number(c.draw || 0)
        ),
      0
    ) + 1;


  const id =
    "c_" +
    Date.now() +
    "_" +
    Math.random()
      .toString(36)
      .slice(2, 7);


  const contestant = {

    id,

    name,

    category,

    song,

    draw: nextDraw

  };


  try {

    await set(
      ref(db, `event/contestants/${id}`),
      contestant
    );


    alert(
      `${name} has been registered.\n\nDraw Number: ${nextDraw}`
    );


  } catch (error) {

    console.error(error);

    alert(
      "Could not register contestant.\n\n" +
      (error.message || error)
    );

  }

}


// ============================================================
// DELETE CONTESTANT
// ============================================================

async function deleteContestant(id) {

  const contestant =
    D.contestants?.[id];


  if (!contestant) {
    return;
  }


  if (
    !confirm(
      `Delete ${contestant.name}?\n\n` +
      `This will also remove their scores.`
    )
  ) {

    return;

  }


  try {

    await remove(
      ref(db, `event/contestants/${id}`)
    );


    await remove(
      ref(db, `event/scores/${id}`)
    );


  } catch (error) {

    console.error(error);

    alert(
      "Could not delete contestant.\n\n" +
      (error.message || error)
    );

  }

}


// ============================================================
// SAVE JUDGE COUNT
// ============================================================

async function saveJudgeCount() {

  const select =
    document.getElementById(
      "judgeCountSelect"
    );


  const count =
    Number(select?.value || 3);


  if (![3, 5].includes(count)) {

    alert(
      "Judge count must be 3 or 5."
    );

    return;

  }


  try {

    await update(
      ref(db, "event"),
      {
        judgeCount: count
      }
    );


    alert(
      `Judge count set to ${count}.`
    );


  } catch (error) {

    console.error(error);

    alert(
      "Could not save judge count.\n\n" +
      (error.message || error)
    );

  }

}


// ============================================================
// RESET COMPETITION
// ============================================================

async function resetCompetition() {

  const answer =
    confirm(
      "RESET THE COMPETITION?\n\n" +
      "This will remove all contestants, scores and the active performance.\n\n" +
      "This cannot be undone."
    );


  if (!answer) {
    return;
  }


  const second =
    confirm(
      "Are you absolutely sure?\n\n" +
      "Press OK to permanently reset the competition."
    );


  if (!second) {
    return;
  }


  try {

    await update(
      ref(db, "event"),
      {

        active: null,

        finalized: false,

        contestants: {},

        scores: {}

      }
    );


    alert(
      "Competition has been reset."
    );


  } catch (error) {

    console.error(error);

    alert(
      "Could not reset competition.\n\n" +
      (error.message || error)
    );

  }

}


// ============================================================
// WIRE BUTTONS / EVENTS
// ============================================================

function wire() {


  // ----------------------------------------------------------
  // LOGIN SCREEN
  // ----------------------------------------------------------

  if (!role) {

    const auditor =
      document.getElementById(
        "auditorLogin"
      );


    if (auditor) {

      auditor.onclick = () => {

        localStorage.setItem(
          "rk_role",
          "auditor"
        );

        role = "auditor";

        page = "home";

        render();

      };

    }


    document
      .querySelectorAll(".jl")
      .forEach(button => {

        button.onclick = () => {

          const judgeId =
            button.dataset.judge;


          localStorage.setItem(
            "rk_role",
            "judge"
          );


          localStorage.setItem(
            "rk_judge",
            judgeId
          );


          role = "judge";

          jid = judgeId;

          page = "home";

          draft = {};

          draftPerformanceId = null;

          render();

        };

      });


    return;

  }


  // ----------------------------------------------------------
  // JUDGE
  // ----------------------------------------------------------

  if (role === "judge") {


    // Score buttons

    document
      .querySelectorAll(".score-btn")
      .forEach(button => {

        button.onclick = () => {

          const key =
            button.dataset.key;

          const value =
            Number(
              button.dataset.value
            );


          draft[key] = value;


          document
            .querySelectorAll(
              `.score-btn[data-key="${key}"]`
            )
            .forEach(btn => {

              btn.classList.remove(
                "selected"
              );

            });


          button.classList.add(
            "selected"
          );


          const totalElement =
            document.getElementById(
              "draftTotal"
            );


          if (totalElement) {

            totalElement.textContent =
              totalDraft();

          }

        };

      });


    // Submit score

    const submit =
      document.getElementById(
        "submitScoreBtn"
      );


    if (submit) {

      submit.onclick =
        submitScore;

    }


    // Judge logout from score screen

    const logoutButton =
      document.getElementById(
        "jout"
      );


    if (logoutButton) {

      logoutButton.onclick =
        logout;

    }


    // Judge logout from waiting screen

    const waitingLogout =
      document.getElementById(
        "jwaitingLogout"
      );


    if (waitingLogout) {

      waitingLogout.onclick =
        logout;

    }


    return;

  }


  // ----------------------------------------------------------
  // AUDITOR
  // ----------------------------------------------------------


  // Navigation

  document
    .querySelectorAll("[data-page]")
    .forEach(button => {

      button.onclick = () => {

        page =
          button.dataset.page ||
          "home";

        render();

      };

    });


  // Auditor logout

  const logoutButton =
    document.getElementById(
      "logoutBtn"
    );


  if (logoutButton) {

    logoutButton.onclick =
      logout;

  }


  // Activate performance

  const activateButton =
    document.getElementById(
      "activateBtn"
    );


  if (activateButton) {

    activateButton.onclick =
      async () => {

        const select =
          document.getElementById(
            "act"
          );


        await activate(
          select?.value
        );

      };

  }


  // End active performance

  const clearActive =
    document.getElementById(
      "clearActive"
    );


  if (clearActive) {

    clearActive.onclick =
      async () => {

        if (
          !confirm(
            "End the current performance?"
          )
        ) {

          return;

        }


        try {

          await update(
            ref(db, "event"),
            {
              active: null
            }
          );

        } catch (error) {

          console.error(error);

          alert(
            "Could not end the performance.\n\n" +
            (error.message || error)
          );

        }

      };

  }


  // Register contestant

  const registerButton =
    document.getElementById(
      "registerBtn"
    );


  if (registerButton) {

    registerButton.onclick =
      registerContestant;

  }


  // Delete contestants

  document
    .querySelectorAll(
      ".delete-contestant"
    )
    .forEach(button => {

      button.onclick = () => {

        deleteContestant(
          button.dataset.id
        );

      };

    });


  // Save judge count

  const saveJudgeButton =
    document.getElementById(
      "saveJudgeCount"
    );


  if (saveJudgeButton) {

    saveJudgeButton.onclick =
      saveJudgeCount;

  }


  // Reset competition

  const resetButton =
    document.getElementById(
      "resetCompetition"
    );


  if (resetButton) {

    resetButton.onclick =
      resetCompetition;

  }

}


// ============================================================
// RENDER
// ============================================================

function render() {

  try {

    // --------------------------------------------------------
    // LOGIN
    // --------------------------------------------------------

    if (!role) {

      root.innerHTML =
        login();

      wire();

      return;

    }


    // --------------------------------------------------------
    // JUDGE
    // --------------------------------------------------------

    if (role === "judge") {

      root.innerHTML =
        judge();

      wire();

      return;

    }


    // --------------------------------------------------------
    // AUDITOR
    // --------------------------------------------------------

    let content;


    switch (page) {

      case "contestants":

        content =
          contestantsPage();

        break;


      case "live":

        content =
          live();

        break;


      case "results":

        content =
          results();

        break;


      case "settings":

        content =
          settings();

        break;


      case "home":

      default:

        content =
          dashboard();

        break;

    }


    root.innerHTML =
      `<div class="app">${content}</div>`;


    wire();


  } catch (error) {

    console.error(
      "Render error:",
      error
    );


    root.innerHTML = `

      <div class="app">

        <div
          class="card error-card"
          style="max-width:800px;margin:60px auto;">

          <h2>
            Application Error
          </h2>

          <p>
            The Royal Karaoke judging system encountered an error while displaying the page.
          </p>

          <pre
            style="white-space:pre-wrap;">
${escapeHTML(error.stack || error.message || String(error))}
          </pre>

          <button
            onclick="location.reload()"
            class="primary">
            RELOAD SYSTEM
          </button>

        </div>

      </div>

    `;

  }

}


// ============================================================
// CREATE / REPAIR EVENT DATA
// ============================================================

async function ensureEvent() {

  const eventRef =
    ref(db, "event");


  const snapshot =
    await get(eventRef);


  if (!snapshot.exists()) {

    const freshEvent =
      defaultEvent();


    // Start with an empty contestant list.
    // This is a real competition system, not a demo database.

    await set(
      eventRef,
      freshEvent
    );


    return;

  }


  const existing =
    snapshot.val() || {};


  const updates = {};


  if (!existing.name) {

    updates.name =
      "Royal Karaoke SKN Championship";

  }


  if (!existing.venue) {

    updates.venue =
      "Venue TBD";

  }


  if (!existing.date) {

    updates.date =
      "2026-09-27";

  }


  if (
    existing.judgeCount !== 3 &&
    existing.judgeCount !== 5
  ) {

    updates.judgeCount =
      3;

  }


  if (!existing.judges) {

    updates.judges =
      JUDGES;

  }


  if (!existing.contestants) {

    updates.contestants =
      {};

  }


  if (!existing.scores) {

    updates.scores =
      {};

  }


  if (
    !Object.prototype.hasOwnProperty.call(
      existing,
      "active"
    )
  ) {

    updates.active =
      null;

  }


  if (
    !Object.prototype.hasOwnProperty.call(
      existing,
      "finalized"
    )
  ) {

    updates.finalized =
      false;

  }


  if (
    Object.keys(updates).length
  ) {

    await update(
      eventRef,
      updates
    );

  }

}


// ============================================================
// START APPLICATION
// ============================================================

async function start() {

  console.log(
    "Royal Karaoke SKN Digital Judging System starting..."
  );


  try {

    // --------------------------------------------------------
    // SIGN IN ANONYMOUSLY
    // --------------------------------------------------------

    await signInAnonymously(
      auth
    );


    console.log(
      "Firebase anonymous authentication successful."
    );


    // --------------------------------------------------------
    // MAKE SURE EVENT EXISTS
    // --------------------------------------------------------

    await ensureEvent();


    console.log(
      "Firebase event data ready."
    );


    // --------------------------------------------------------
    // LISTEN FOR LIVE EVENT CHANGES
    // --------------------------------------------------------

    onValue(

      ref(db, "event"),

      snapshot => {

        try {

          D =
            snapshot.val() ||
            defaultEvent();


          console.log(
            "Event data updated:",
            D
          );


          render();

        } catch (error) {

          console.error(
            "Event rendering error:",
            error
          );


          root.innerHTML = `

            <div class="app">

              <div
                class="card error-card"
                style="max-width:800px;margin:60px auto;">

                <h2>
                  Data Error
                </h2>

                <p>
                  The judging system received the event data but could not display it.
                </p>

                <pre style="white-space:pre-wrap;">
${escapeHTML(error.stack || error.message || String(error))}
                </pre>

              </div>

            </div>

          `;

        }

      },

      error => {

        console.error(
          "Firebase database listener error:",
          error
        );


        root.innerHTML = `

          <div class="app">

            <div
              class="card error-card"
              style="max-width:800px;margin:60px auto;">

              <h2>
                Database Connection Error
              </h2>

              <p>
                The Royal Karaoke system could not connect to the Firebase database.
              </p>

              <pre style="white-space:pre-wrap;">
${escapeHTML(error.message || String(error))}
              </pre>

              <button
                onclick="location.reload()"
                class="primary">
                TRY AGAIN
              </button>

            </div>

          </div>

        `;

      }

    );


  } catch (error) {

    console.error(
      "Application startup error:",
      error
    );


    root.innerHTML = `

      <div class="app">

        <div
          class="card error-card"
          style="max-width:800px;margin:60px auto;">

          <h1>
            ROYAL KARAOKE SKN
          </h1>

          <h2>
            Unable to Start System
          </h2>

          <p>
            The application could not connect to Firebase.
          </p>

          <pre style="white-space:pre-wrap;">
${escapeHTML(error.stack || error.message || String(error))}
          </pre>

          <button
            onclick="location.reload()"
            class="primary">
            TRY AGAIN
          </button>

        </div>

      </div>

    `;

  }

}


// ============================================================
// GLOBAL ERROR HANDLERS
// ============================================================

window.addEventListener(
  "error",
  event => {

    console.error(
      "Global JavaScript error:",
      event.error || event.message
    );

  }
);


window.addEventListener(
  "unhandledrejection",
  event => {

    console.error(
      "Unhandled promise rejection:",
      event.reason
    );

  }
);


// ============================================================
// EXPOSE IMPORTANT FUNCTIONS
// ============================================================

Object.assign(
  window,
  {
    render,
    activate,
    submitScore,
    logout
  }
);


// ============================================================
// START
// ============================================================

start();

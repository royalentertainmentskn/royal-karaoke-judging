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
        <pre style="white-space:pre-wrap;">
${escapeHTML(error.message || String(error))}
        </pre>
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

  return Object.keys(JUDGES).slice(0, judgeCount());

}


function contestants() {

  return Object.values(D.contestants || {})
    .sort(
      (a, b) =>
        Number(a.draw || 9999) -
        Number(b.draw || 9999)
    );

}


function scores() {

  return D.scores || {};

}


function activeContestant() {

  if (!D.active) {
    return null;
  }

  return D.contestants?.[D.active] || null;

}


function totalDraft() {

  let total = 0;

  Object.keys(CRITERIA).forEach(key => {

    total += Number(draft[key] || 0);

  });

  return total;

}


function performanceScore(contestantId) {

  const contestantScores =
    scores()[contestantId] || {};

  const totals = [];

  enabledJudges().forEach(judgeId => {

    const score =
      contestantScores[judgeId];

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

  return (
    totals.reduce(
      (a, b) => a + b,
      0
    ) / totals.length
  );

}


// ============================================================
// PARTICIPANT DISPLAY
// ============================================================

function participantText(contestant) {

  if (
    !contestant ||
    !Array.isArray(contestant.participants)
  ) {
    return "";
  }

  return contestant.participants
    .filter(x => String(x).trim())
    .join(" • ");

}


function participantHTML(contestant) {

  const text =
    participantText(contestant);

  if (!text) {
    return "";
  }

  return `
    <div style="margin-top:8px;">
      <strong>Performers:</strong>
      ${escapeHTML(text)}
    </div>
  `;

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

function head() {

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
          ? `
            <div class="role-badge">
              ${escapeHTML(
                JUDGES[jid]?.name || "Judge"
              )}
            </div>
          `
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
// LOGIN
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
                .map(
                  ([id, judge]) => `
                    <button
                      class="judge-login jl"
                      data-judge="${id}">
                      ${escapeHTML(judge.name)}
                    </button>
                  `
                )
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

  const active =
    activeContestant();

  const count =
    contestants().length;

  const judgeTotal =
    judgeCount();

  const submitted =
    active
      ? enabledJudges()
          .filter(
            j =>
              scores()[active.id]?.[j]
          ).length
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
          ${escapeHTML(
            D.name ||
            "Royal Karaoke SKN Championship"
          )}
        </p>

        <p>
          ${escapeHTML(
            D.venue ||
            "Venue TBD"
          )}

          ${
            D.date
              ? " • " +
                escapeHTML(D.date)
              : ""
          }

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
            ${
              active
                ? escapeHTML(active.name)
                : "None"
            }
          </strong>

        </div>


        <div class="stat card">

          <h3>
            Scores Received
          </h3>

          <strong>
            ${
              active
                ? `${submitted}/${judgeTotal}`
                : "—"
            }
          </strong>

        </div>

      </div>


      ${
        active
          ? `
            <div class="card">

              <h2>
                Current Performance
              </h2>

              <h2>
                #${escapeHTML(active.draw)}
                —
                ${escapeHTML(active.name)}
              </h2>

              <p>
                ${escapeHTML(active.category)}
                ${
                  active.song
                    ? " • " +
                      escapeHTML(active.song)
                    : ""
                }
              </p>

              ${participantHTML(active)}

              <br>

              <button
                id="clearActive"
                class="danger">
                END ACTIVE PERFORMANCE
              </button>

            </div>
          `
          : ""
      }


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
              .map(
                c => `
                  <option
                    value="${escapeHTML(c.id)}"
                    ${
                      D.active === c.id
                        ? "selected"
                        : ""
                    }>

                    #${escapeHTML(c.draw)}
                    —
                    ${escapeHTML(c.name)}
                    —
                    ${escapeHTML(c.category)}

                  </option>
                `
              )
              .join("")
          }

        </select>

        <br><br>

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
// CONTESTANT REGISTRATION PAGE
// ============================================================

function contestantsPage() {

  const list =
    contestants();


  return `

    ${head()}

    ${nav()}

    <main class="container">

      <div class="card">

        <h1>
          Contestant Registration
        </h1>

        <p>
          Register a single singer, duet, or complete team.
        </p>


        <!-- REGISTRATION TYPE -->

        <label>
          <strong>Registration Type</strong>
        </label>

        <select id="registrationType">

          <option value="Male">
            Male Singer
          </option>

          <option value="Female">
            Female Singer
          </option>

          <option value="Duet">
            Duet — 2 Singers
          </option>

          <option value="Team">
            Team — 5 Participants
          </option>

        </select>


        <br><br>


        <!-- SINGLE SINGER -->

        <div
          id="singleRegistration"
          class="registration-section">

          <h2>
            Single Singer
          </h2>

          <div class="form-grid">

            <input
              id="singleName"
              type="text"
              placeholder="Singer's Full Name"
            />

          </div>

        </div>


        <!-- DUET -->

        <div
          id="duetRegistration"
          class="registration-section"
          style="display:none;">

          <h2>
            Duet Registration
          </h2>

          <div class="form-grid">

            <input
              id="duetName1"
              type="text"
              placeholder="Singer 1 — Full Name"
            />

            <input
              id="duetName2"
              type="text"
              placeholder="Singer 2 — Full Name"
            />

          </div>

          <p class="muted">
            Both singers will be registered together as one duet.
          </p>

        </div>


        <!-- TEAM -->

        <div
          id="teamRegistration"
          class="registration-section"
          style="display:none;">

          <h2>
            Team of 5
          </h2>

          <input
            id="teamName"
            type="text"
            placeholder="Team Name"
          />

          <br><br>

          <div class="form-grid">

            <input
              id="teamMember1"
              type="text"
              placeholder="Participant 1"
            />

            <input
              id="teamMember2"
              type="text"
              placeholder="Participant 2"
            />

            <input
              id="teamMember3"
              type="text"
              placeholder="Participant 3"
            />

            <input
              id="teamMember4"
              type="text"
              placeholder="Participant 4"
            />

            <input
              id="teamMember5"
              type="text"
              placeholder="Participant 5"
            />

          </div>

          <p class="muted">
            Enter all five team members before registering.
          </p>

        </div>


        <!-- SONG -->

        <div style="margin-top:20px;">

          <input
            id="newSong"
            type="text"
            placeholder="Song Title"
            style="width:100%;"
          />

        </div>


        <br>

        <button
          id="registerBtn"
          class="primary">

          REGISTER

        </button>

      </div>


      <!-- REGISTERED CONTESTANTS -->

      <div class="card">

        <h2>
          Registered Contestants
        </h2>


        ${
          list.length === 0

            ? `
              <p>
                No contestants registered yet.
              </p>
            `

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
                        Participants
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
                      list
                        .map(
                          c => `

                            <tr>

                              <td>
                                ${escapeHTML(c.draw)}
                              </td>

                              <td>
                                <strong>
                                  ${escapeHTML(c.name)}
                                </strong>
                              </td>

                              <td>
                                ${escapeHTML(c.category)}
                              </td>

                              <td>

                                ${
                                  Array.isArray(
                                    c.participants
                                  )
                                    ? c.participants
                                        .map(
                                          (p, i) =>
                                            `${i + 1}. ${escapeHTML(p)}`
                                        )
                                        .join("<br>")
                                    : "—"
                                }

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

                          `
                        )
                        .join("")
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

  const active =
    activeContestant();


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


  const contestantScores =
    scores()[active.id] || {};


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

          ${
            active.song
              ? " • " +
                escapeHTML(active.song)
              : ""
          }
        </p>

        ${participantHTML(active)}

      </div>


      <div class="card">

        <h2>
          Judge Submissions
        </h2>


        <div class="scoreboard">

          ${
            enabledJudges()
              .map(j => {

                const score =
                  contestantScores[j];


                if (!score) {

                  return `

                    <div class="judge-score">

                      <h3>
                        ${escapeHTML(
                          JUDGES[j].name
                        )}
                      </h3>

                      <p>
                        Waiting for score...
                      </p>

                    </div>

                  `;

                }


                let total = 0;

                Object.keys(CRITERIA)
                  .forEach(k => {

                    total += Number(
                      score[k] || 0
                    );

                  });


                return `

                  <div class="judge-score">

                    <h3>
                      ${escapeHTML(
                        JUDGES[j].name
                      )}
                    </h3>

                    <strong>
                      ${total} / 100
                    </strong>

                  </div>

                `;

              })
              .join("")
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
                : performanceScore(
                    active.id
                  ).toFixed(2)
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

  const list =
    contestants();


  const rows =
    list
      .map(c => {

        const score =
          performanceScore(c.id);

        return {
          contestant: c,
          score
        };

      })
      .filter(
        x => x.score !== null
      )
      .sort(
        (a, b) =>
          b.score - a.score
      );


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

            ? `
              <p>
                No completed scores yet.
              </p>
            `

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
                      rows
                        .map(
                          (row, index) => `

                            <tr>

                              <td>
                                ${index + 1}
                              </td>

                              <td>
                                ${escapeHTML(
                                  row.contestant.draw
                                )}
                              </td>

                              <td>

                                <strong>
                                  ${escapeHTML(
                                    row.contestant.name
                                  )}
                                </strong>

                                ${
                                  participantText(
                                    row.contestant
                                  )
                                    ? `
                                      <br>
                                      <small>
                                        ${escapeHTML(
                                          participantText(
                                            row.contestant
                                          )
                                        )}
                                      </small>
                                    `
                                    : ""
                                }

                              </td>

                              <td>
                                ${escapeHTML(
                                  row.contestant.category
                                )}
                              </td>

                              <td>

                                <strong>
                                  ${row.score.toFixed(2)}
                                </strong>

                              </td>

                            </tr>

                          `
                        )
                        .join("")
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
            ${
              judgeCount() === 3
                ? "selected"
                : ""
            }>

            3 Judges

          </option>


          <option
            value="5"
            ${
              judgeCount() === 5
                ? "selected"
                : ""
            }>

            5 Judges

          </option>

        </select>


        <br><br>


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
              .map(
                ([key, item]) => `

                  <div class="criteria-row">

                    <span>
                      ${escapeHTML(
                        item.label
                      )}
                    </span>

                    <strong>
                      ${item.max} pts
                    </strong>

                  </div>

                `
              )
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

function scoreButtons(
  key,
  max
) {

  let html = `

    <div class="score-category">

      <div class="score-category-title">

        <span>
          ${escapeHTML(
            CRITERIA[key].label
          )}
        </span>

        <strong>
          ${max} pts
        </strong>

      </div>


      <div class="score-buttons">

  `;


  for (
    let i = 0;
    i <= max;
    i++
  ) {

    html += `

      <button
        type="button"
        class="score-btn ${
          Number(
            draft[key] || 0
          ) === i
            ? "selected"
            : ""
        }"
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

  const active =
    activeContestant();


  // ----------------------------------------------------------
  // WAITING
  // ----------------------------------------------------------

  if (!active) {

    return `

      <div class="app">

        ${head()}

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
                ${escapeHTML(
                  JUDGES[jid]?.name ||
                  "Judge"
                )}
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
  // RESET SCORE FOR NEW PERFORMANCE
  // ----------------------------------------------------------

  if (
    draftPerformanceId !== active.id
  ) {

    draft = {};

    draftPerformanceId =
      active.id;

  }


  return `

    <div class="app">

      ${head()}


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
              ? `
                <p>
                  <strong>Song:</strong>
                  ${escapeHTML(active.song)}
                </p>
              `
              : ""
          }


          ${participantHTML(active)}

        </div>


        <div class="card">

          <h2>
            YOUR SCORE
          </h2>


          ${
            Object.entries(CRITERIA)
              .map(
                ([key, item]) =>
                  scoreButtons(
                    key,
                    item.max
                  )
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

    alert(
      "Please select a contestant."
    );

    return;

  }


  try {

    await update(
      ref(db, "event"),
      {
        active: id,
        finalized: false
      }
    );

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


  const active =
    activeContestant();


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


  const missing =
    Object.entries(CRITERIA)
      .filter(
        ([key]) =>
          draft[key] === undefined
      )
      .map(
        ([, item]) =>
          item.label
      );


  if (missing.length) {

    alert(
      "Please score every judging category before submitting.\n\n" +
      missing.join("\n")
    );

    return;

  }


  const total =
    totalDraft();


  if (
    total < 0 ||
    total > 100
  ) {

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
        Number(
          draft.voiceManagement || 0
        ),

      voiceTiming:
        Number(
          draft.voiceTiming || 0
        ),

      costume:
        Number(
          draft.costume || 0
        ),

      props:
        Number(
          draft.props || 0
        ),

      performance:
        Number(
          draft.performance || 0
        ),

      crowdResponse:
        Number(
          draft.crowdResponse || 0
        ),

      total,

      judgeId: jid,

      judgeNo:
        Number(
          jid.replace("j", "")
        ),

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

    draftPerformanceId =
      active.id;

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
// REGISTER CONTESTANT / DUET / TEAM
// ============================================================

async function registerContestant() {

  const type =
    document.getElementById(
      "registrationType"
    )?.value;


  const song =
    document.getElementById(
      "newSong"
    )?.value.trim();


  if (!song) {

    alert(
      "Please enter the song title."
    );

    return;

  }


  let name = "";

  let participants = [];


  // ----------------------------------------------------------
  // SINGLE MALE OR FEMALE
  // ----------------------------------------------------------

  if (
    type === "Male" ||
    type === "Female"
  ) {

    name =
      document.getElementById(
        "singleName"
      )?.value.trim();


    if (!name) {

      alert(
        "Please enter the singer's full name."
      );

      return;

    }

    participants = [name];

  }


  // ----------------------------------------------------------
  // DUET
  // ----------------------------------------------------------

  else if (type === "Duet") {

    const p1 =
      document.getElementById(
        "duetName1"
      )?.value.trim();

    const p2 =
      document.getElementById(
        "duetName2"
      )?.value.trim();


    if (!p1 || !p2) {

      alert(
        "Please enter both duet singers."
      );

      return;

    }


    if (
      p1.toLowerCase() ===
      p2.toLowerCase()
    ) {

      alert(
        "The two duet participants must be different people."
      );

      return;

    }


    participants = [
      p1,
      p2
    ];


    name =
      `${p1} & ${p2}`;

  }


  // ----------------------------------------------------------
  // TEAM OF FIVE
  // ----------------------------------------------------------

  else if (type === "Team") {

    const teamName =
      document.getElementById(
        "teamName"
      )?.value.trim();


    const members = [];


    for (
      let i = 1;
      i <= 5;
      i++
    ) {

      const value =
        document.getElementById(
          `teamMember${i}`
        )?.value.trim();


      if (!value) {

        alert(
          `Please enter Participant ${i}.`
        );

        return;

      }


      members.push(value);

    }


    if (!teamName) {

      alert(
        "Please enter the team name."
      );

      return;

    }


    const lower =
      members.map(
        x => x.toLowerCase()
      );


    if (
      new Set(lower).size !==
      lower.length
    ) {

      alert(
        "A team cannot contain the same participant more than once."
      );

      return;

    }


    name =
      teamName;

    participants =
      members;

  }


  else {

    alert(
      "Please select a registration type."
    );

    return;

  }


  // ----------------------------------------------------------
  // NEXT DRAW NUMBER
  // ----------------------------------------------------------

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


  // ----------------------------------------------------------
  // UNIQUE ID
  // ----------------------------------------------------------

  const id =
    "c_" +
    Date.now() +
    "_" +
    Math.random()
      .toString(36)
      .slice(2, 8);


  // ----------------------------------------------------------
  // CONTESTANT OBJECT
  // ----------------------------------------------------------

  const contestant = {

    id,

    name,

    category: type,

    song,

    draw: nextDraw,

    participants

  };


  try {

    await set(
      ref(
        db,
        `event/contestants/${id}`
      ),
      contestant
    );


    alert(
      `${name} has been registered successfully.\n\n` +
      `Category: ${type}\n` +
      `Draw Number: ${nextDraw}\n\n` +
      `Song: ${song}`
    );


    // Clear fields after registration

    const ids = [
      "singleName",
      "duetName1",
      "duetName2",
      "teamName",
      "teamMember1",
      "teamMember2",
      "teamMember3",
      "teamMember4",
      "teamMember5",
      "newSong"
    ];


    ids.forEach(id => {

      const element =
        document.getElementById(id);

      if (element) {
        element.value = "";
      }

    });


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
      ref(
        db,
        `event/contestants/${id}`
      )
    );


    await remove(
      ref(
        db,
        `event/scores/${id}`
      )
    );


    if (D.active === id) {

      await update(
        ref(db, "event"),
        {
          active: null
        }
      );

    }

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
    Number(
      select?.value || 3
    );


  if (
    ![3, 5].includes(count)
  ) {

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
// REGISTRATION TYPE SWITCHING
// ============================================================

function updateRegistrationForm() {

  const type =
    document.getElementById(
      "registrationType"
    )?.value;


  const single =
    document.getElementById(
      "singleRegistration"
    );

  const duet =
    document.getElementById(
      "duetRegistration"
    );

  const team =
    document.getElementById(
      "teamRegistration"
    );


  if (single) {
    single.style.display =
      type === "Male" ||
      type === "Female"
        ? "block"
        : "none";
  }


  if (duet) {
    duet.style.display =
      type === "Duet"
        ? "block"
        : "none";
  }


  if (team) {
    team.style.display =
      type === "Team"
        ? "block"
        : "none";
  }

}


// ============================================================
// WIRE EVENTS
// ============================================================

function wire() {


  // ----------------------------------------------------------
  // LOGIN
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

          draftPerformanceId =
            null;

          render();

        };

      });


    return;

  }


  // ----------------------------------------------------------
  // JUDGE
  // ----------------------------------------------------------

  if (role === "judge") {


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


          draft[key] =
            value;


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


    const submit =
      document.getElementById(
        "submitScoreBtn"
      );


    if (submit) {

      submit.onclick =
        submitScore;

    }


    const logoutButton =
      document.getElementById(
        "jout"
      );


    if (logoutButton) {

      logoutButton.onclick =
        logout;

    }


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
  // AUDITOR NAVIGATION
  // ----------------------------------------------------------

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


  // ----------------------------------------------------------
  // LOGOUT
  // ----------------------------------------------------------

  const logoutButton =
    document.getElementById(
      "logoutBtn"
    );


  if (logoutButton) {

    logoutButton.onclick =
      logout;

  }


  // ----------------------------------------------------------
  // ACTIVATE
  // ----------------------------------------------------------

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


  // ----------------------------------------------------------
  // END ACTIVE PERFORMANCE
  // ----------------------------------------------------------

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


  // ----------------------------------------------------------
  // REGISTRATION TYPE
  // ----------------------------------------------------------

  const registrationType =
    document.getElementById(
      "registrationType"
    );


  if (registrationType) {

    registrationType.onchange =
      updateRegistrationForm;

  }


  // ----------------------------------------------------------
  // REGISTER
  // ----------------------------------------------------------

  const registerButton =
    document.getElementById(
      "registerBtn"
    );


  if (registerButton) {

    registerButton.onclick =
      registerContestant;

  }


  // ----------------------------------------------------------
  // DELETE
  // ----------------------------------------------------------

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


  // ----------------------------------------------------------
  // JUDGE COUNT
  // ----------------------------------------------------------

  const saveJudgeButton =
    document.getElementById(
      "saveJudgeCount"
    );


  if (saveJudgeButton) {

    saveJudgeButton.onclick =
      saveJudgeCount;

  }


  // ----------------------------------------------------------
  // RESET
  // ----------------------------------------------------------

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

          <pre style="white-space:pre-wrap;">
${escapeHTML(
  error.stack ||
  error.message ||
  String(error)
)}
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

    await set(
      eventRef,
      defaultEvent()
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

    await signInAnonymously(
      auth
    );


    console.log(
      "Firebase anonymous authentication successful."
    );


    await ensureEvent();


    console.log(
      "Firebase event data ready."
    );


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
${escapeHTML(
  error.stack ||
  error.message ||
  String(error)
)}
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
${escapeHTML(
  error.message ||
  String(error)
)}
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
${escapeHTML(
  error.stack ||
  error.message ||
  String(error)
)}
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
      event.error ||
      event.message
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
// EXPOSE FUNCTIONS
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

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
// FIREBASE
// ============================================================

const fb = initializeApp(firebaseConfig);
const db = getDatabase(fb);
const auth = getAuth(fb);

const root = document.getElementById("app");


// ============================================================
// APPLICATION STATE
// ============================================================

let D = {};

let role =
  localStorage.getItem("rk_role") || null;

let jid =
  localStorage.getItem("rk_judge") || null;

let page = "home";

let draft = {};

let submitting = false;

let draftPerformanceId = null;


// ============================================================
// JUDGING CRITERIA
// TOTAL = 100 POINTS
// ============================================================

const C = {
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

const J = {
  j1: {
    no: 1,
    name: "Judge 1"
  },

  j2: {
    no: 2,
    name: "Judge 2"
  },

  j3: {
    no: 3,
    name: "Judge 3"
  },

  j4: {
    no: 4,
    name: "Judge 4"
  },

  j5: {
    no: 5,
    name: "Judge 5"
  }
};


// ============================================================
// COMPETITION TYPES
// ============================================================

const categories = [
  "Male",
  "Female",
  "Duet",
  "Team"
];


// ============================================================
// DEMO DATA
// ============================================================

const demo = {
  c1: {
    number: 1,
    name: "Sarah Jones",
    category: "Female",
    song: "Example Song",
    order: 1
  },

  c2: {
    number: 2,
    name: "John Smith",
    category: "Male",
    song: "Example Song",
    order: 2
  },

  c3: {
    number: 3,
    name: "Mary & James",
    category: "Duet",
    song: "Example Song",
    order: 3
  },

  c4: {
    number: 4,
    name: "Team SKN",
    category: "Team",
    song: "Example Song",
    order: 4
  }
};


// ============================================================
// HELPER FUNCTIONS
// ============================================================

function judgeCount() {

  const count =
    Number(D.judgeCount);

  if (count === 5) {
    return 5;
  }

  return 3;
}


function enabledJudges() {

  return Object.entries(
    D.judges || J
  ).filter(
    ([id, judge]) =>
      judge.no <= judgeCount()
  );
}


function contestants() {

  return Object.entries(
    D.contestants || {}
  )
    .map(([id, contestant]) => ({
      id,
      ...contestant
    }))
    .sort(
      (a, b) =>
        Number(a.order || a.number || 0) -
        Number(b.order || b.number || 0)
    );
}


function scores() {

  return D.scores || {};
}


function activeContestant() {

  return D.contestants?.[D.active] || null;
}


function totalDraft() {

  return Object.keys(C).reduce(
    (total, key) =>
      total + Number(draft[key] || 0),
    0
  );
}


function performanceScore(
  performanceId,
  judgeId
) {

  return (
    scores()?.[performanceId]?.[judgeId] ||
    null
  );
}


function escapeHTML(value) {

  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


// ============================================================
// LOGOUT
// ============================================================

function logout() {

  role = null;
  jid = null;

  draft = {};

  submitting = false;

  draftPerformanceId = null;

  page = "home";

  localStorage.removeItem("rk_role");
  localStorage.removeItem("rk_judge");

  render();
}


// ============================================================
// HEADER
// ============================================================

function head() {

  let badge = "WELCOME";

  if (role === "auditor") {

    badge = "AUDITOR";

  } else if (
    role === "judge" &&
    jid &&
    J[jid]
  ) {

    badge =
      `JUDGE ${J[jid].no}`;
  }

  return `
    <div class="top">

      <b>
        🎤 ROYAL KARAOKE SKN<br>
        <small>
          DIGITAL JUDGING • ONLINE
        </small>
      </b>

      <span class="pill">
        ${badge}
      </span>

    </div>
  `;
}


// ============================================================
// AUDITOR NAVIGATION
// ============================================================

function nav() {

  return `
    <div class="nav">

      <button
        data-page="home"
      >
        Dashboard
      </button>

      <button
        data-page="contestants"
      >
        Contestants
      </button>

      <button
        data-page="live"
      >
        Live Scores
      </button>

      <button
        data-page="results"
      >
        Results
      </button>

      <button
        data-page="settings"
      >
        Settings
      </button>

      <button
        id="aout"
      >
        Log Out
      </button>

    </div>
  `;
}


// ============================================================
// LOGIN SCREEN
// ============================================================

function login() {

  return `
    <div class="wrap">

      <div
        class="card hero"
        style="
          max-width:560px;
          margin:60px auto;
          text-align:center;
        "
      >

        <div class="big">
          🎤
        </div>

        <h1>
          Royal Karaoke SKN
        </h1>

        <p>
          Digital Judging System
        </p>

        <br>

        <button
          id="auditorLogin"
          class="primary"
          type="button"
        >
          AUDITOR
        </button>

        <h3>
          Judges
        </h3>

        <div
          class="judge-login-list"
        >

          ${Object.entries(J)
            .map(
              ([id, judge]) => `
                <button
                  class="jl"
                  data-id="${id}"
                  type="button"
                >
                  ${judge.name}
                </button>
              `
            )
            .join("")}

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

  const enabled =
    enabledJudges();

  const activeScores =
    D.active
      ? scores()[D.active] || {}
      : {};

  const submitted =
    enabled.filter(
      ([id]) =>
        !!activeScores[id]
    ).length;

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
          ${escapeHTML(
            D.name ||
            "Royal Karaoke SKN"
          )}
        </h2>

        <span class="ok">
          🟢 ONLINE
        </span>

      </div>


      <div class="card">

        <span class="muted">
          Current Performance
        </span>

        ${
          active
            ? `
              <div class="big">
                #${active.number}
              </div>

              <h2>
                ${escapeHTML(active.name)}
              </h2>

              <span class="pill">
                ${escapeHTML(active.category)}
              </span>
            `
            : `
              <h2>
                No Performance Active
              </h2>
            `
        }

      </div>


      <div class="card">

        <h3>
          Judge Status
        </h3>

        <p>
          ${submitted}
          of
          ${enabled.length}
          judges submitted
        </p>

        ${enabled
          .map(
            ([id, judge]) => {

              const submitted =
                !!activeScores[id];

              return `
                <div
                  style="
                    padding:8px 0;
                  "
                >

                  <b>
                    ${escapeHTML(
                      judge.name
                    )}
                  </b>

                  ${
                    submitted
                      ? `
                        <span
                          class="ok"
                        >
                          ✅ Submitted
                        </span>
                      `
                      : `
                        <span
                          class="warn"
                        >
                          ⏳ Waiting
                        </span>
                      `
                  }

                </div>
              `;
            }
          )
          .join("")}

      </div>

    </div>


    <div class="card">

      <h2>
        Activate Performance
      </h2>

      <p class="muted">
        Select the contestant who is
        performing now.
      </p>

      <select id="act">

        <option value="">
          Select Performance
        </option>

        ${contestants()
          .map(
            c => `
              <option
                value="${c.id}"
                ${
                  c.id === D.active
                    ? "selected"
                    : ""
                }
              >
                #${c.number}
                —
                ${escapeHTML(c.name)}
                —
                ${escapeHTML(c.category)}
              </option>
            `
          )
          .join("")}

      </select>

      <br><br>

      <button
        id="activateBtn"
        class="primary"
        type="button"
      >
        ACTIVATE PERFORMANCE
      </button>

    </div>


    ${
      active
        ? `
          <div class="card">

            <h3>
              Performance Control
            </h3>

            <p>
              Performance
              <b>
                #${active.number}
              </b>
              is currently active.
            </p>

            <p>
              Judges submitted:
              <b>
                ${submitted}/${enabled.length}
              </b>
            </p>

          </div>
        `
        : ""
    }

  `;
}


// ============================================================
// CONTESTANTS PAGE
// ============================================================

function contestantsPage() {

  return `

    <h1>
      Contestants
    </h1>

    <div class="card">

      <h2>
        Register Contestant
      </h2>

      <div
        class="form-grid"
      >

        <input
          id="newName"
          type="text"
          placeholder="Name / Team Name"
        >

        <select id="newCategory">

          <option value="">
            Select Category
          </option>

          ${categories
            .map(
              c => `
                <option value="${c}">
                  ${c}
                </option>
              `
            )
            .join("")}

        </select>

        <input
          id="newSong"
          type="text"
          placeholder="Song"
        >

      </div>

      <br>

      <button
        id="registerBtn"
        class="primary"
        type="button"
      >
        REGISTER CONTESTANT
      </button>

    </div>


    <div class="card">

      <h2>
        Registered Contestants
      </h2>

      <div
        style="
          overflow-x:auto;
        "
      >

        <table>

          <tr>
            <th>#</th>
            <th>Name</th>
            <th>Category</th>
            <th>Song</th>
            <th>Action</th>
          </tr>

          ${contestants()
            .map(
              c => `
                <tr>

                  <td>
                    ${c.number}
                  </td>

                  <td>
                    ${escapeHTML(c.name)}
                  </td>

                  <td>
                    ${escapeHTML(c.category)}
                  </td>

                  <td>
                    ${escapeHTML(c.song)}
                  </td>

                  <td>

                    <button
                      class="delete-contestant"
                      data-id="${c.id}"
                      type="button"
                    >
                      DELETE
                    </button>

                  </td>

                </tr>
              `
            )
            .join("")}

        </table>

      </div>

    </div>

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
      <h1>
        Live Scores
      </h1>

      <div class="card">

        <h2>
          No performance active
        </h2>

        <p>
          Activate a performance from
          the Auditor Dashboard.
        </p>

      </div>
    `;
  }

  const activeScores =
    scores()[D.active] || {};

  const enabled =
    enabledJudges();

  let total = 0;
  let count = 0;

  const judgeCards =
    enabled
      .map(
        ([id, judge]) => {

          const score =
            activeScores[id];

          if (score) {

            total +=
              Number(score.total || 0);

            count++;
          }

          return `
            <div class="card">

              <h2>
                ${escapeHTML(judge.name)}
              </h2>

              ${
                score
                  ? `
                    <div class="big">
                      ${score.total}/100
                    </div>

                    <span class="ok">
                      ✅ Submitted
                    </span>
                  `
                  : `
                    <div class="big">
                      —
                    </div>

                    <span class="warn">
                      ⏳ Waiting
                    </span>
                  `
              }

            </div>
          `;
        }
      )
      .join("");

  const average =
    count
      ? (total / count).toFixed(2)
      : "—";

  return `

    <h1>
      Live Scores
    </h1>

    <div class="card">

      <h2>
        Performance #${active.number}
      </h2>

      <h2>
        ${escapeHTML(active.name)}
      </h2>

      <span class="pill">
        ${escapeHTML(active.category)}
      </span>

      <br><br>

      <div class="grid">

        <div>
          <span class="muted">
            Judges Submitted
          </span>

          <div class="big">
            ${count}/${enabled.length}
          </div>
        </div>

        <div>
          <span class="muted">
            Current Average
          </span>

          <div class="big">
            ${average}
          </div>
        </div>

      </div>

    </div>


    <div class="grid">

      ${judgeCards}

    </div>

  `;
}


// ============================================================
// RESULTS
// ============================================================

function results() {

  const list =
    contestants()
      .map(c => {

        const judgeScores =
          Object.values(
            scores()[c.id] || {}
          );

        const validScores =
          judgeScores.filter(
            s =>
              typeof s.total ===
              "number"
          );

        const avg =
          validScores.length
            ? validScores.reduce(
                (sum, s) =>
                  sum +
                  Number(s.total),
                0
              ) /
              validScores.length
            : 0;

        return {
          ...c,
          avg:
            Number(avg.toFixed(2)),
          judges:
            validScores.length
        };

      })
      .sort(
        (a, b) =>
          b.avg - a.avg
      );


  function winner(category) {

    return list.find(
      x =>
        x.category === category &&
        x.judges > 0
    );

  }


  return `

    <h1>
      Results
    </h1>


    <div class="grid">

      ${categories
        .map(
          category => {

            const w =
              winner(category);

            return `
              <div class="card">

                <span class="muted">
                  BEST
                  ${category.toUpperCase()}
                </span>

                <h2>
                  ${w
                    ? escapeHTML(w.name)
                    : "—"}
                </h2>

                <div class="big">

                  ${
                    w
                      ? w.avg
                      : "—"
                  }

                </div>

                ${
                  w
                    ? `
                      <p>
                        Average Score
                      </p>
                    `
                    : ""
                }

              </div>
            `;
          }
        )
        .join("")}

    </div>


    <div class="card">

      <h2>
        Overall Rankings
      </h2>

      <div
        style="
          overflow-x:auto;
        "
      >

        <table>

          <tr>

            <th>
              Rank
            </th>

            <th>
              Draw #
            </th>

            <th>
              Name
            </th>

            <th>
              Category
            </th>

            <th>
              Judges
            </th>

            <th>
              Average
            </th>

          </tr>


          ${list
            .map(
              (x, i) => `
                <tr>

                  <td>
                    ${i + 1}
                  </td>

                  <td>
                    ${x.number}
                  </td>

                  <td>
                    ${escapeHTML(x.name)}
                  </td>

                  <td>
                    ${escapeHTML(
                      x.category
                    )}
                  </td>

                  <td>
                    ${x.judges}
                  </td>

                  <td>
                    <b>
                      ${
                        x.judges
                          ? x.avg
                          : "—"
                      }
                    </b>
                  </td>

                </tr>
              `
            )
            .join("")}

        </table>

      </div>

    </div>

  `;
}


// ============================================================
// SETTINGS
// ============================================================

function settings() {

  const currentCount =
    judgeCount();

  return `

    <h1>
      Competition Settings
    </h1>


    <div class="card">

      <h2>
        Number of Judges
      </h2>

      <p>
        Select whether this competition
        will use 3 or 5 judges.
      </p>

      <select id="judgeCountSelect">

        <option
          value="3"
          ${
            currentCount === 3
              ? "selected"
              : ""
          }
        >
          3 Judges
        </option>

        <option
          value="5"
          ${
            currentCount === 5
              ? "selected"
              : ""
          }
        >
          5 Judges
        </option>

      </select>

      <br><br>

      <button
        id="saveJudgeCount"
        class="primary"
        type="button"
      >
        SAVE JUDGE SETTING
      </button>

    </div>


    <div class="card">

      <h2>
        Judging Criteria
      </h2>

      <table>

        <tr>
          <th>Criteria</th>
          <th>Maximum</th>
        </tr>

        <tr>
          <td>
            Voice Management
          </td>
          <td>
            10
          </td>
        </tr>

        <tr>
          <td>
            Voice Timing
          </td>
          <td>
            20
          </td>
        </tr>

        <tr>
          <td>
            Costume
          </td>
          <td>
            5
          </td>
        </tr>

        <tr>
          <td>
            Props
          </td>
          <td>
            5
          </td>
        </tr>

        <tr>
          <td>
            Performance
          </td>
          <td>
            40
          </td>
        </tr>

        <tr>
          <td>
            Crowd Response
          </td>
          <td>
            20
          </td>
        </tr>

        <tr>

          <th>
            TOTAL
          </th>

          <th>
            100
          </th>

        </tr>

      </table>

    </div>


    <div class="card">

      <h2>
        Competition Information
      </h2>

      <p>
        <b>
          Competition:
        </b>
        ${escapeHTML(
          D.name ||
          "Not set"
        )}
      </p>

      <p>
        <b>
          Venue:
        </b>
        ${escapeHTML(
          D.venue ||
          "Not set"
        )}
      </p>

      <p>
        <b>
          Date:
        </b>
        ${escapeHTML(
          D.date ||
          "Not set"
        )}
      </p>

    </div>


    <div class="card">

      <h2>
        Competition Reset
      </h2>

      <p>
        This removes registered
        contestants and all scores.
      </p>

      <button
        id="resetCompetition"
        type="button"
      >
        RESET COMPETITION
      </button>

    </div>

  `;
}


// ============================================================
// JUDGE SCORE BUTTONS
// ============================================================

function scoreButtons(
  key,
  label,
  max
) {

  const selected =
    Number(draft[key] || 0);

  return `

    <div
      class="judge-criterion"
      style="
        margin-bottom:24px;
      "
    >

      <h3>
        ${label}
        <span class="pill">
          ${max} pts
        </span>
      </h3>

      <div
        class="scoregrid"
      >

        ${Array.from(
          {
            length: max + 1
          },
          (_, n) => `

            <button
              type="button"
              class="
                score-btn
                ${
                  selected === n
                    ? "selected"
                    : ""
                }
              "
              data-score-key="${key}"
              data-score="${n}"
            >
              ${n}
            </button>

          `
        ).join("")}

      </div>

    </div>

  `;
}


// ============================================================
// JUDGE SCREEN
// ============================================================

function judge() {

  const active =
    activeContestant();


  // ----------------------------------------------------------
  // WAITING FOR AUDITOR
  // ----------------------------------------------------------

  if (!active) {

    return `

      <div class="wrap">

        <div
          class="card hero"
          style="
            max-width:700px;
            margin:50px auto;
            text-align:center;
          "
        >

          <div class="big">
            🎤
          </div>

          <h1>
            Waiting for Auditor
          </h1>

          <p>
            The next performance will
            appear here automatically.
          </p>

          <br>

          <button
            id="jwaitingLogout"
            class="primary"
            type="button"
          >
            RETURN TO LOGIN
          </button>

        </div>

      </div>

    `;
  }


  // ----------------------------------------------------------
  // MAKE SURE JUDGE EXISTS
  // ----------------------------------------------------------

  if (!jid || !J[jid]) {

    logout();

    return "";
  }


  // ----------------------------------------------------------
  // NEW PERFORMANCE
  // ----------------------------------------------------------

  if (
    draftPerformanceId !==
    D.active
  ) {

    draft = {};

    draftPerformanceId =
      D.active;
  }


  // ----------------------------------------------------------
  // CHECK IF THIS JUDGE ALREADY SUBMITTED
  // ----------------------------------------------------------

  const old =
    performanceScore(
      D.active,
      jid
    );


  if (old) {

    return `

      <div class="wrap">

        <div
          class="card"
          style="
            max-width:700px;
            margin:40px auto;
            text-align:center;
          "
        >

          <div class="big">
            #${active.number}
          </div>

          <h1>
            ${escapeHTML(active.name)}
          </h1>

          <span class="pill">
            ${escapeHTML(active.category)}
          </span>

          <h2>
            Score Submitted
          </h2>

          <div class="big">
            ${old.total}/100
          </div>

          <p class="ok">
            ✅ Your score has been
            submitted and locked.
          </p>

          <p>
            Waiting for the Auditor to
            activate the next performance.
          </p>

          <br>

          <button
            id="jout"
            type="button"
          >
            LOG OUT
          </button>

        </div>

      </div>

    `;
  }


  // ----------------------------------------------------------
  // JUDGING FORM
  // ----------------------------------------------------------

  return `

    <div class="wrap">

      <div
        class="card"
        style="
          text-align:center;
        "
      >

        <span class="muted">
          CURRENT PERFORMANCE
        </span>

        <div class="big">
          #${active.number}
        </div>

        <h1>
          ${escapeHTML(active.name)}
        </h1>

        <span class="pill">
          ${escapeHTML(active.category)}
        </span>

        <p>
          🎵
          ${escapeHTML(active.song)}
        </p>

      </div>


      <div class="card">

        <h2>
          Judging Score
        </h2>

        <p class="muted">
          Select one score for each
          category.
        </p>


        ${scoreButtons(
          "voiceManagement",
          C.voiceManagement.label,
          C.voiceManagement.max
        )}

        ${scoreButtons(
          "voiceTiming",
          C.voiceTiming.label,
          C.voiceTiming.max
        )}

        ${scoreButtons(
          "costume",
          C.costume.label,
          C.costume.max
        )}

        ${scoreButtons(
          "props",
          C.props.label,
          C.props.max
        )}

        ${scoreButtons(
          "performance",
          C.performance.label,
          C.performance.max
        )}

        ${scoreButtons(
          "crowdResponse",
          C.crowdResponse.label,
          C.crowdResponse.max
        )}


        <div
          class="card"
          style="
            text-align:center;
            margin-top:20px;
          "
        >

          <span class="muted">
            CURRENT TOTAL
          </span>

          <div class="big">
            ${totalDraft()}/100
          </div>

        </div>


        <button
          id="submitScoreBtn"
          class="primary"
          type="button"
          ${
            totalDraft() === 0
              ? "disabled"
              : ""
          }
        >
          SUBMIT SCORE
        </button>


        <br><br>

        <button
          id="jout"
          type="button"
        >
          LOG OUT
        </button>

      </div>

    </div>

  `;
}


// ============================================================
// ACTIVATE PERFORMANCE
// ============================================================

async function activate() {

  const select =
    document.getElementById("act");

  if (!select) {
    return;
  }

  const id =
    select.value;

  if (!id) {

    alert(
      "Please select a performance."
    );

    return;
  }

  const contestant =
    D.contestants?.[id];

  if (!contestant) {

    alert(
      "Contestant not found."
    );

    return;
  }


  const confirmed =
    confirm(
      `Activate Performance #${contestant.number} — ${contestant.name}?`
    );

  if (!confirmed) {
    return;
  }


  await update(
    ref(db, "event"),
    {
      active: id
    }
  );

}


// ============================================================
// REGISTER CONTESTANT
// ============================================================

async function registerContestant() {

  const name =
    document
      .getElementById("newName")
      ?.value
      .trim();

  const category =
    document
      .getElementById("newCategory")
      ?.value;

  const song =
    document
      .getElementById("newSong")
      ?.value
      .trim();


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


  if (!song) {

    alert(
      "Please enter the song."
    );

    return;
  }


  const existing =
    contestants();


  const nextNumber =
    existing.length
      ? Math.max(
          ...existing.map(
            c =>
              Number(c.number || 0)
          )
        ) + 1
      : 1;


  const id =
    "c_" +
    Date.now();


  await set(
    ref(
      db,
      `event/contestants/${id}`
    ),
    {
      number:
        nextNumber,

      name:
        name,

      category:
        category,

      song:
        song,

      order:
        nextNumber
    }
  );


  alert(
    `Contestant registered with draw number #${nextNumber}.`
  );


  page =
    "contestants";

  render();
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


  const confirmed =
    confirm(
      `Delete ${contestant.name}?`
    );

  if (!confirmed) {
    return;
  }


  await remove(
    ref(
      db,
      `event/contestants/${id}`
    )
  );


  // Remove any scores attached
  // to this contestant.

  await remove(
    ref(
      db,
      `event/scores/${id}`
    )
  );


  // If it was active,
  // clear active performance.

  if (D.active === id) {

    await update(
      ref(db, "event"),
      {
        active: null
      }
    );

  }


  render();
}


// ============================================================
// SAVE JUDGE COUNT
// ============================================================

async function saveJudgeCount() {

  const select =
    document.getElementById(
      "judgeCountSelect"
    );

  if (!select) {
    return;
  }


  const count =
    Number(select.value);


  if (
    count !== 3 &&
    count !== 5
  ) {

    alert(
      "Judge count must be 3 or 5."
    );

    return;
  }


  await update(
    ref(db, "event"),
    {
      judgeCount:
        count
    }
  );


  alert(
    `Competition is now set for ${count} judges.`
  );


  render();
}


// ============================================================
// RESET COMPETITION
// ============================================================

async function resetCompetition() {

  const first =
    confirm(
      "Are you sure you want to reset the competition?"
    );

  if (!first) {
    return;
  }


  const second =
    confirm(
      "This will remove contestants and all judging scores. Continue?"
    );

  if (!second) {
    return;
  }


  await update(
    ref(db, "event"),
    {
      active: null,
      scores: {},
      contestants: {}
    }
  );


  alert(
    "Competition has been reset."
  );


  page =
    "home";

  render();
}


// ============================================================
// SUBMIT JUDGE SCORE
// ============================================================

async function submitScore() {

  if (submitting) {
    return;
  }


  if (!jid || !J[jid]) {

    alert(
      "Judge session is invalid. Please return to login."
    );

    logout();

    return;
  }


  const active =
    activeContestant();


  if (!active) {

    alert(
      "The Auditor has not activated a performance."
    );

    return;
  }


  const required =
    Object.keys(C);


  const missing =
    required.filter(
      key =>
        draft[key] === undefined ||
        draft[key] === null ||
        draft[key] === ""
    );


  if (missing.length) {

    alert(
      "Please score every judging category before submitting."
    );

    return;
  }


  const total =
    totalDraft();


  if (total < 0 || total > 100) {

    alert(
      "Invalid score total."
    );

    return;
  }


  const confirmed =
    confirm(
      `Submit your score of ${total}/100 for ${active.name}? Once submitted, it will be locked.`
    );


  if (!confirmed) {
    return;
  }


  submitting = true;


  try {

    // Re-check Firebase before writing
    // to make sure another score has not
    // already been submitted.

    const current =
      await get(
        ref(
          db,
          `event/scores/${D.active}/${jid}`
        )
      );


    if (current.exists()) {

      alert(
        "A score has already been submitted for this performance."
      );

      submitting = false;

      render();

      return;
    }


    await set(
      ref(
        db,
        `event/scores/${D.active}/${jid}`
      ),
      {
        ...draft,

        total:

          total,

        submittedAt:

          Date.now()
      }
    );


    draft = {};

    submitting = false;

    render();


  } catch (error) {

    console.error(error);

    submitting = false;

    alert(
      "There was a problem submitting the score:\n\n" +
      (error.message || error)
    );

  }

}


// ============================================================
// WIRE BUTTONS / EVENTS
// ============================================================

function wire() {


  // ==========================================================
  // LOGIN SCREEN
  // ==========================================================

  if (!role) {


    const auditor =
      document.getElementById(
        "auditorLogin"
      );


    auditor?.addEventListener(
      "click",
      () => {

        role =
          "auditor";

        jid =
          null;

        localStorage.setItem(
          "rk_role",
          "auditor"
        );

        localStorage.removeItem(
          "rk_judge"
        );

        page =
          "home";

        render();

      }
    );


    document
      .querySelectorAll(".jl")
      .forEach(
        button => {

          button.addEventListener(
            "click",
            () => {

              const selectedJudge =
                button.dataset.id;


              if (!J[selectedJudge]) {

                alert(
                  "Invalid judge."
                );

                return;
              }


              if (
                J[selectedJudge].no >
                judgeCount()
              ) {

                alert(
                  "That judge is not enabled for this competition."
                );

                return;
              }


              role =
                "judge";

              jid =
                selectedJudge;


              localStorage.setItem(
                "rk_role",
                "judge"
              );


              localStorage.setItem(
                "rk_judge",
                jid
              );


              draft =
                {};


              draftPerformanceId =
                D.active ||
                null;


              render();

            }
          );

        }
      );


    // IMPORTANT:
    // Everything above is the complete login
    // wiring. Nothing below should be placed
    // before the return.

    return;
  }


  // ==========================================================
  // JUDGE SCREEN
  // ==========================================================

  if (role === "judge") {


    document
      .querySelectorAll(
        ".score-btn"
      )
      .forEach(
        button => {

          button.addEventListener(
            "click",
            () => {

              const key =
                button.dataset.scoreKey;

              const value =
                Number(
                  button.dataset.score
                );


              if (
                !C[key]
              ) {
                return;
              }


              draft[key] =
                value;


              render();

            }
          );

        }
      );


    document
      .getElementById(
        "submitScoreBtn"
      )
      ?.addEventListener(
        "click",
        submitScore
      );


    document
      .getElementById("jout")
      ?.addEventListener(
        "click",
        logout
      );


    // THIS IS THE IMPORTANT FIX
    // The waiting-screen button is wired
    // while the judge is actually in the
    // judge branch.

    document
      .getElementById(
        "jwaitingLogout"
      )
      ?.addEventListener(
        "click",
        logout
      );


    return;
  }


  // ==========================================================
  // AUDITOR NAVIGATION
  // ==========================================================

  document
    .querySelectorAll(
      "[data-page]"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () => {

            page =
              button.dataset.page;

            render();

          }
        );

      }
    );


  // ==========================================================
  // AUDITOR LOGOUT
  // ==========================================================

  document
    .getElementById("aout")
    ?.addEventListener(
      "click",
      logout
    );


  // ==========================================================
  // ACTIVATE PERFORMANCE
  // ==========================================================

  document
    .getElementById(
      "activateBtn"
    )
    ?.addEventListener(
      "click",
      activate
    );


  // ==========================================================
  // REGISTER CONTESTANT
  // ==========================================================

  document
    .getElementById(
      "registerBtn"
    )
    ?.addEventListener(
      "click",
      registerContestant
    );


  // ==========================================================
  // DELETE CONTESTANTS
  // ==========================================================

  document
    .querySelectorAll(
      ".delete-contestant"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () =>
            deleteContestant(
              button.dataset.id
            )
        );

      }
    );


  // ==========================================================
  // SAVE JUDGE COUNT
  // ==========================================================

  document
    .getElementById(
      "saveJudgeCount"
    )
    ?.addEventListener(
      "click",
      saveJudgeCount
    );


  // ==========================================================
  // RESET COMPETITION
  // ==========================================================

  document
    .getElementById(
      "resetCompetition"
    )
    ?.addEventListener(
      "click",
      resetCompetition
    );

}


// ============================================================
// RENDER
// ============================================================

function render() {


  // ----------------------------------------------------------
  // FIREBASE DATA NOT READY
  // ----------------------------------------------------------

  if (
    !D ||
    !D.name
  ) {

    root.innerHTML = `

      <div class="wrap">

        <div class="card">

          <h1>
            Connecting to
            Royal Karaoke SKN…
          </h1>

          <p>
            Please wait while the
            judging system connects.
          </p>

        </div>

      </div>

    `;

    return;
  }


  // ----------------------------------------------------------
  // LOGIN
  // ----------------------------------------------------------

  if (!role) {

    root.innerHTML =
      login();

    wire();

    return;
  }


  // ----------------------------------------------------------
  // JUDGE
  // ----------------------------------------------------------

  if (role === "judge") {

    root.innerHTML =
      head() +
      judge();

    wire();

    return;
  }


  // ----------------------------------------------------------
  // AUDITOR
  // ----------------------------------------------------------

  let body;


  if (page === "contestants") {

    body =
      contestantsPage();

  } else if (
    page === "live"
  ) {

    body =
      live();

  } else if (
    page === "results"
  ) {

    body =
      results();

  } else if (
    page === "settings"
  ) {

    body =
      settings();

  } else {

    body =
      dashboard();

  }


  root.innerHTML =

    head() +

    `<div class="wrap">

      ${nav()}

      ${body}

    </div>`;


  wire();

}


// ============================================================
// SEED INITIAL DATABASE
// ============================================================

async function seed() {

  const existing =
    await get(
      ref(db, "event")
    );


  if (existing.exists()) {
    return;
  }


  await set(
    ref(db, "event"),
    {

      name:
        "Royal Karaoke SKN Championship",

      venue:
        "Venue TBD",

      date:
        "2026-09-27",

      active:
        null,

      finalized:
        false,

      judgeCount:
        3,

      judges:
        J,

      contestants:
        demo,

      scores:
        {}

    }
  );

}


// ============================================================
// START APPLICATION
// ============================================================

async function start() {


  // ----------------------------------------------------------
  // FIREBASE AUTHENTICATION
  // ----------------------------------------------------------

  try {

    await signInAnonymously(
      auth
    );

  } catch (error) {

    console.error(error);


    root.innerHTML = `

      <div class="wrap">

        <div class="card">

          <h1>
            Royal Karaoke SKN
          </h1>

          <h2>
            Firebase Authentication Problem
          </h2>

          <p>
            ${
              error.message ||
              error
            }
          </p>

          <p>
            Check Firebase Authentication
            and make sure Anonymous
            sign-in is enabled.
          </p>

        </div>

      </div>

    `;

    return;
  }


  // ----------------------------------------------------------
  // FIREBASE EVENT LISTENER
  // ----------------------------------------------------------

  onValue(
    ref(db, "event"),

    async snapshot => {

      D =
        snapshot.val() ||
        {};


      if (
        !D.contestants
      ) {

        await seed();

        return;
      }


      // ------------------------------------------------------
      // DEFAULT JUDGE COUNT
      // ------------------------------------------------------

      if (
        D.judgeCount !== 3 &&
        D.judgeCount !== 5
      ) {

        D.judgeCount =
          3;

      }


      // ------------------------------------------------------
      // DEFAULT JUDGES
      // ------------------------------------------------------

      if (!D.judges) {

        D.judges =
          J;

      }


      // ------------------------------------------------------
      // VALIDATE STORED JUDGE LOGIN
      // ------------------------------------------------------

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

      }


      // ------------------------------------------------------
      // CLEAR DRAFT WHEN AUDITOR ACTIVATES
      // A DIFFERENT PERFORMANCE
      // ------------------------------------------------------

      if (
        role === "judge" &&
        draftPerformanceId !==
        D.active
      ) {

        draft =
          {};

        draftPerformanceId =
          D.active ||
          null;

      }


      render();

    },

    error => {

      console.error(error);


      root.innerHTML = `

        <div class="wrap">

          <div class="card">

            <h1>
              Royal Karaoke SKN
            </h1>

            <h2>
              Firebase Database Problem
            </h2>

            <p>
              ${
                error.message ||
                error
              }
            </p>

            <p>
              Check that Firebase
              Realtime Database is
              enabled and that your
              database rules allow the
              application to connect.
            </p>

          </div>

        </div>

      `;

    }

  );

}


// ============================================================
// GLOBAL FUNCTIONS
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

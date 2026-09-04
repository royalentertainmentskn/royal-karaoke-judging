import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
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
import { firebaseConfig } from "./firebase-config.js";

const C = [
  ["voiceManagement", "Voice Management", 10],
  ["voiceTiming", "Voice Timing", 20],
  ["costume", "Costume", 5],
  ["props", "Props", 5],
  ["performance", "Performance", 40],
  ["crowdResponse", "Crowd Response", 20]
];

const J = {
  j1: { no: 1, name: "Judge 1" },
  j2: { no: 2, name: "Judge 2" },
  j3: { no: 3, name: "Judge 3" },
  j4: { no: 4, name: "Judge 4" },
  j5: { no: 5, name: "Judge 5" }
};

const DEMO = {
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

const fb = initializeApp(firebaseConfig);
const db = getDatabase(fb);
const au = getAuth(fb);
const root = document.getElementById("app");

let D = {};
let role = localStorage.rk_role || null;
let jid = localStorage.rk_judge || null;
let page = "home";
let selectedJudge = null;
let correctionDraft = {};
let draft = {};

/* -------------------------------------------------------
   HELPERS
------------------------------------------------------- */

const E = v =>
  String(v ?? "").replace(
    /[&<>"']/g,
    c =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      })[c]
  );

const cs = () =>
  Object.entries(D.contestants || {})
    .map(([id, x]) => ({ id, ...x }))
    .sort((a, b) => (a.order || 0) - (b.order || 0));

const S = () => D.scores || {};

const A = () =>
  D.contestants?.[D.active];

const T = () =>
  C.reduce(
    (n, [k]) => n + (+draft[k] || 0),
    0
  );

function correctionTotal() {
  return C.reduce(
    (n, [k]) =>
      n + Number(correctionDraft[k] || 0),
    0
  );
}

/*
  Current judging panel.

  Defaults to 5 so existing events continue
  working exactly as before.
*/
function panelSize() {
  return Number(D.panelSize || 5) === 3
    ? 3
    : 5;
}

/*
  Returns only judges belonging to the
  currently selected panel.
*/
function activeJudgeEntries() {
  return Object.entries(J).filter(
    ([id, j]) => j.no <= panelSize()
  );
}

/*
  Returns true if the panel has been locked.
*/
function panelLocked() {
  return D.panelLocked === true;
}

/*
  Number of submitted judges for the
  current contestant, counting only
  judges in the active panel.
*/
function submittedCount() {
  const s = D.active
    ? S()[D.active] || {}
    : {};

  return activeJudgeEntries().filter(
    ([id]) => s[id]
  ).length;
}

/* -------------------------------------------------------
   START
------------------------------------------------------- */

async function start() {
  try {
    await signInAnonymously(au);
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

  onValue(
    ref(db, "event"),
    async s => {
      D = s.val() || {};

      if (
        !D.name &&
        !(await get(ref(db, "event"))).exists()
      ) {
        await set(ref(db, "event"), {
          name:
            "Royal Karaoke SKN Championship — Test Event",
          venue: "Test Venue",
          active: "c1",
          contestants: DEMO,
          judges: J,
          scores: {},
          panelSize: 5,
          panelLocked: false
        });

        return;
      }

      render();
    },
    e => {
      root.innerHTML = `
        <div class="wrap">
          <div class="card">
            <h2>Firebase Database Error</h2>
            <p>${E(e.message)}</p>
          </div>
        </div>
      `;
    }
  );
}

/* -------------------------------------------------------
   HEADER
------------------------------------------------------- */

function head() {
  return `
    <div class="top">

      <b>
        🎤 ROYAL KARAOKE SKN<br>
        <small>DIGITAL JUDGING SYSTEM</small>
      </b>

      <span class="pill">

        ${
          role === "auditor"
            ? "AUDITOR"
            : role === "judge"
            ? `JUDGE ${J[jid]?.no || "?"}`
            : "WELCOME"
        }

      </span>

    </div>
  `;
}

/* -------------------------------------------------------
   LOGIN
------------------------------------------------------- */

function login() {
  return `
    <div class="wrap">

      <div class="card hero">

        <div class="big">🎤</div>

        <h1>Royal Karaoke SKN</h1>

        <h2>
          100-Point Digital Judging System
        </h2>

        <button id="aud" class="primary">
          AUDITOR
        </button>

        <h3>Select Judge</h3>

        <div class="login-grid">

          ${activeJudgeEntries()
            .map(
              ([id, j]) => `
                <button
                  class="jl"
                  data-id="${id}"
                >
                  ${j.name}
                </button>
              `
            )
            .join("")}

        </div>

        <p class="muted">
          Current panel:
          <b>${panelSize()} Judges</b>
        </p>

      </div>

    </div>
  `;
}

/* -------------------------------------------------------
   AUDITOR DASHBOARD
------------------------------------------------------- */

function dash() {
  const a = A();

  const s =
    D.active
      ? S()[D.active] || {}
      : {};

  return `
    <h1>Auditor Dashboard</h1>

    <!-- PANEL CONTROL -->

    <div class="card">

      <h2>Judging Panel</h2>

      <p class="muted">
        Select whether this competition will use
        3 judges or 5 judges.
      </p>

      <select
        id="panel-size"
        ${panelLocked() ? "disabled" : ""}
      >

        <option
          value="3"
          ${panelSize() === 3 ? "selected" : ""}
        >
          3 Judges
        </option>

        <option
          value="5"
          ${panelSize() === 5 ? "selected" : ""}
        >
          5 Judges
        </option>

      </select>

      <br><br>

      ${
        panelLocked()
          ? `
            <div class="notice">

              <b>
                🔒 PANEL LOCKED
              </b>

              <br>

              This competition is using
              <b>${panelSize()} judges</b>.
              The panel cannot be changed
              after the first performance
              has been activated.

            </div>
          `
          : `
            <button
              id="save-panel"
              class="primary"
            >
              SAVE JUDGING PANEL
            </button>

            <p class="muted">
              The panel will lock when the
              first performance is activated.
            </p>
          `
      }

    </div>

    <div class="grid">

      <div class="card">

        <span class="muted">
          Competition
        </span>

        <h2>
          ${E(D.name)}
        </h2>

        <p>
          ${E(D.venue || "")}
        </p>

      </div>

      <div class="card">

        <span class="muted">
          Current Contestant
        </span>

        ${
          a
            ? `
              <div class="big">
                #${a.number}
              </div>

              <h2>
                ${E(a.name)}
              </h2>

              <p>
                ${E(a.category || "")}
                ·
                ${E(a.song || "")}
              </p>
            `
            : "None"
        }

      </div>

      <div class="card">

        <span class="muted">
          Judges Submitted
        </span>

        <div class="stat">

          ${submittedCount()}/${panelSize()}

        </div>

        <p class="muted">
          Active panel:
          ${panelSize()} judges
        </p>

      </div>

    </div>

    <!-- ACTIVATE PERFORMANCE -->

    <div class="card">

      <h2>Activate Performance</h2>

      <select id="act">

        ${cs()
          .map(
            x => `
              <option
                value="${x.id}"
                ${x.id === D.active
                  ? "selected"
                  : ""}
              >
                #${x.number} —
                ${E(x.name)}
                (${E(x.category)})
              </option>
            `
          )
          .join("")}

      </select>

      <br><br>

      <button
        id="activate"
        class="primary"
      >
        ACTIVATE CONTESTANT
      </button>

      ${
        !panelLocked()
          ? `
            <p class="warn">
              Activating the first performance
              will lock the judging panel at
              ${panelSize()} judges.
            </p>
          `
          : ""
      }

    </div>

    <!-- JUDGE SCORES -->

    <div class="card">

      <h2>
        Judge Scores & Corrections
      </h2>

      <p class="muted">

        Select a submitted judge score to
        view and, if necessary, correct the
        score before moving to the next
        contestant.

      </p>

      <div class="login-grid">

        ${activeJudgeEntries()
          .map(
            ([id, j]) => `
              <button
                class="judge-score-btn"
                data-judge="${id}"
                ${s[id] ? "" : "disabled"}
              >

                ${j.name}

                <br>

                ${
                  s[id]
                    ? `
                      <span class="ok">
                        ✓ ${s[id].total}/100
                      </span>
                    `
                    : `
                      <span class="warn">
                        Waiting
                      </span>
                    `
                }

              </button>
            `
          )
          .join("")}

      </div>

    </div>

    <!-- JUDGE STATUS -->

    <div class="card">

      <h2>Judge Status</h2>

      ${activeJudgeEntries()
        .map(
          ([id, j]) => `
            <p>

              <b>
                ${j.name}
              </b>
              —

              ${
                s[id]
                  ? `
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

            </p>
          `
        )
        .join("")}

    </div>
  `;
}

/* -------------------------------------------------------
   JUDGE SCORE CORRECTION
------------------------------------------------------- */

function judgeScores() {
  const a = A();

  const score =
    D.active && selectedJudge
      ? S()[D.active]?.[selectedJudge]
      : null;

  if (!a) {
    return `
      <div class="card">

        <button
          id="return-auditor"
          class="primary"
        >
          ← RETURN TO AUDITOR
        </button>

        <h1>No Active Contestant</h1>

        <p>
          There is currently no active
          contestant.
        </p>

      </div>
    `;
  }

  if (!score) {
    return `
      <div class="card">

        <button
          id="return-auditor"
          class="primary"
        >
          ← RETURN TO AUDITOR
        </button>

        <h1>
          ${E(
            J[selectedJudge]?.name ||
            "Judge"
          )}
        </h1>

        <h2>
          #${a.number} —
          ${E(a.name)}
        </h2>

        <p class="warn">
          This judge has not submitted
          a score yet.
        </p>

      </div>
    `;
  }

  if (
    !Object.keys(correctionDraft).length
  ) {
    correctionDraft = {};

    C.forEach(([k]) => {
      correctionDraft[k] =
        Number(score[k] || 0);
    });
  }

  return `
    <div class="card">

      <button
        id="return-auditor"
        class="primary"
      >
        ← RETURN TO AUDITOR
      </button>

      <h1>
        ${E(
          J[selectedJudge]?.name ||
          "Judge"
        )}
      </h1>

      <h2>
        #${a.number} —
        ${E(a.name)}
      </h2>

      <p>
        ${E(a.category || "")}
        ·
        ${E(a.song || "")}
      </p>

      <p class="muted">

        Original submission:
        ${
          score.submittedAt
            ? new Date(
                score.submittedAt
              ).toLocaleString()
            : "Unknown"
        }

      </p>

      ${
        score.correctedAt
          ? `
            <div class="notice">

              <b>
                ✓ Previously Corrected
              </b>

              <br>

              Last correction:
              ${new Date(
                score.correctedAt
              ).toLocaleString()}

            </div>
          `
          : ""
      }

    </div>

    <div class="card">

      <div class="notice">

        <b>
          AUDITOR CORRECTION MODE
        </b>

        <br>

        Change any score below and save
        the corrected score.

      </div>

      ${C.map(
        ([k, label, max]) => `
          <div class="score-block">

            <div class="score-title">

              <b>
                ${label}
              </b>

              <span>

                <span id="corr-${k}">
                  ${correctionDraft[k] || 0}
                </span>

                /
                ${max}

              </span>

            </div>

            <div class="score-buttons">

              ${Array.from(
                { length: max + 1 },
                (_, n) => `
                  <button
                    class="
                      corr-score-btn
                      ${
                        Number(
                          correctionDraft[k]
                        ) === n
                          ? "selected"
                          : ""
                      }
                    "
                    data-k="${k}"
                    data-n="${n}"
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

        <span id="correction-total">
          ${correctionTotal()}
        </span>

        / 100

      </div>

      <button
        id="save-correction"
        class="primary"
        style="width:100%"
      >
        SAVE CORRECTED SCORE
      </button>

    </div>
  `;
}

/* -------------------------------------------------------
   CONTESTANTS
------------------------------------------------------- */

function cont() {
  return `
    <h1>Contestants</h1>

    <div class="card">

      <div class="form-grid">

        <input
          id="cn"
          type="number"
          placeholder="Number"
        >

        <input
          id="name"
          placeholder="Name"
        >

        <select id="cat">
          <option>Male</option>
          <option>Female</option>
          <option>Duet</option>
          <option>Team</option>
        </select>

        <input
          id="song"
          placeholder="Song"
        >

        <input
          id="ord"
          type="number"
          placeholder="Order"
        >

      </div>

      <br>

      <button
        id="add"
        class="primary"
      >
        ADD CONTESTANT
      </button>

    </div>

    <div class="card table-wrap">

      <table>

        <tr>
          <th>#</th>
          <th>Name</th>
          <th>Category</th>
          <th>Song</th>
          <th></th>
        </tr>

        ${cs()
          .map(
            x => `
              <tr>

                <td>
                  ${x.number}
                </td>

                <td>
                  ${E(x.name)}
                </td>

                <td>
                  ${E(x.category)}
                </td>

                <td>
                  ${E(x.song)}
                </td>

                <td>

                  <button
                    class="del danger"
                    data-id="${x.id}"
                  >
                    Delete
                  </button>

                </td>

              </tr>
            `
          )
          .join("")}

      </table>

    </div>
  `;
}

/* -------------------------------------------------------
   LIVE SCORES
------------------------------------------------------- */

function live() {
  const s =
    D.active
      ? S()[D.active] || {}
      : {};

  const a = A();

  return `
    <h1>Live Scores</h1>

    <div class="card">

      <h2>

        ${
          a
            ? `
              #${a.number}
              —
              ${E(a.name)}
            `
            : "No active contestant"
        }

      </h2>

      <p class="muted">
        Judging panel:
        <b>${panelSize()} judges</b>
      </p>

    </div>

    <div class="grid">

      ${activeJudgeEntries()
        .map(
          ([id, j]) => `
            <div class="card">

              <h2>
                ${j.name}
              </h2>

              ${
                s[id]
                  ? `
                    <div class="stat">
                      ${s[id].total}/100
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
          `
        )
        .join("")}

    </div>
  `;
}

/* -------------------------------------------------------
   RESULTS
------------------------------------------------------- */

function results() {

  const r = cs()
    .map(x => {

      /*
        IMPORTANT:
        Only judges belonging to the
        selected panel are included.
      */

      const allScores =
        S()[x.id] || {};

      const scores =
        activeJudgeEntries()
          .map(([id]) =>
            allScores[id]
          )
          .filter(Boolean);

      const avg =
        scores.length
          ? scores.reduce(
              (n, q) =>
                n +
                Number(
                  q.total || 0
                ),
              0
            ) / scores.length
          : 0;

      return {
        ...x,
        n: scores.length,
        avg
      };
    })
    .sort(
      (a, b) =>
        b.avg - a.avg
    );

  const best = category =>
    r.find(
      x =>
        x.category === category &&
        x.n
    );

  const boxes = [
    [
      "Overall Winner",
      r.find(x => x.n)
    ],
    [
      "Best Male",
      best("Male")
    ],
    [
      "Best Female",
      best("Female")
    ],
    [
      "Best Duet",
      best("Duet")
    ],
    [
      "Best Team",
      best("Team")
    ]
  ];

  return `
    <h1>Results</h1>

    <div class="card">

      <h3>
        Results based on
        ${panelSize()}-Judge Panel
      </h3>

    </div>

    <div class="grid">

      ${boxes
        .map(
          ([title, winner]) => `
            <div class="card winner">

              <span class="muted">
                ${title}
              </span>

              <h2>
                ${E(
                  winner?.name ||
                  "—"
                )}
              </h2>

              <div class="big">

                ${
                  winner
                    ? winner.avg.toFixed(2)
                    : "—"
                }

              </div>

              ${
                winner
                  ? "/100"
                  : ""
              }

            </div>
          `
        )
        .join("")}

    </div>

    <div class="card table-wrap">

      <table>

        <tr>
          <th>Rank</th>
          <th>Name</th>
          <th>Category</th>
          <th>Judges</th>
          <th>Average</th>
        </tr>

        ${r
          .map(
            (x, i) => `
              <tr>

                <td>
                  ${
                    x.n
                      ? i + 1
                      : "—"
                  }
                </td>

                <td>
                  ${E(x.name)}
                </td>

                <td>
                  ${E(x.category)}
                </td>

                <td>
                  ${x.n}
                </td>

                <td>
                  ${
                    x.n
                      ? x.avg.toFixed(2)
                      : "—"
                  }
                </td>

              </tr>
            `
          )
          .join("")}

      </table>

    </div>
  `;
}

/* -------------------------------------------------------
   JUDGE SIDE
------------------------------------------------------- */

function judge() {

  /*
    If a judge outside the active panel
    is somehow already logged in, don't
    allow them to score.
  */

  if (
    !J[jid] ||
    J[jid].no > panelSize()
  ) {
    return `
      <div class="wrap">

        <div class="card hero">

          <h1>
            Judge Not In Active Panel
          </h1>

          <p>
            This competition is using
            a ${panelSize()}-judge panel.
          </p>

          <p class="muted">
            ${J[jid]?.name || "This judge"}
            is not part of the active panel.
          </p>

          <button id="jout">
            Log out
          </button>

        </div>

      </div>
    `;
  }

  const a = A();

  if (!a) {
    return `
      <div class="wrap">

        <div class="card hero">

          <h1>
            Waiting for Auditor
          </h1>

          <p>
            The next performance will
            appear here automatically.
          </p>

          <button id="jout">
            Log out
          </button>

        </div>

      </div>
    `;
  }

  const old =
    S()[D.active]?.[jid];

  if (old) {
    return `
      <div class="wrap">

        <div class="card hero">

          <h1>
            ✓ Score Submitted
          </h1>

          <h2>
            #${a.number}
            —
            ${E(a.name)}
          </h2>

          <div class="big">
            ${old.total}/100
          </div>

          <p class="ok">
            Your score is locked.
          </p>

          <button id="jout">
            Log out
          </button>

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
          #${a.number}
        </div>

        <h1>
          ${E(a.name)}
        </h1>

        <p>
          ${E(a.song || "")}
          ·
          ${E(a.category || "")}
        </p>

      </div>

      <div class="card">

        <div class="notice">

          Complete all criteria.

          Total possible:
          <b>100 points.</b>

        </div>

        ${C.map(
          ([k, label, max]) => `
            <div class="score-block">

              <div class="score-title">

                <b>
                  ${label}
                </b>

                <span>
                  ${draft[k] ?? 0}/${max}
                </span>

              </div>

              <div class="score-buttons">

                ${Array.from(
                  { length: max + 1 },
                  (_, n) => `
                    <button
                      class="
                        sb
                        ${
                          draft[k] === n
                            ? "selected"
                            : ""
                        }
                      "
                      data-k="${k}"
                      data-n="${n}"
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
          ${T()}
          / 100

        </div>

        <button
          id="submit"
          class="primary"
          style="width:100%"
        >
          SUBMIT SCORE — LOCK IT
        </button>

      </div>

    </div>
  `;
}

/* -------------------------------------------------------
   NAVIGATION
------------------------------------------------------- */

function nav() {
  return `
    <div class="nav">

      ${[
        ["home", "Dashboard"],
        ["contestants", "Contestants"],
        ["live", "Live Scores"],
        ["results", "Results"]
      ]
        .map(
          ([p, label]) => `
            <button
              class="
                nb
                ${
                  page === p
                    ? "primary"
                    : ""
                }
              "
              data-p="${p}"
            >
              ${label}
            </button>
          `
        )
        .join("")}

      <button id="out">
        Log out
      </button>

    </div>
  `;
}

/* -------------------------------------------------------
   LOGOUT
------------------------------------------------------- */

function logout() {

  role = null;
  jid = null;
  selectedJudge = null;
  correctionDraft = {};
  draft = {};

  localStorage.removeItem(
    "rk_role"
  );

  localStorage.removeItem(
    "rk_judge"
  );

  render();
}

/* -------------------------------------------------------
   RETURN TO AUDITOR
------------------------------------------------------- */

function returnToAuditor() {

  selectedJudge = null;
  correctionDraft = {};
  page = "home";

  render();
}

/* -------------------------------------------------------
   WIRING
------------------------------------------------------- */

function wire() {

  /*
    LOGIN
  */

  if (!role) {

    document
      .getElementById("aud")
      ?.addEventListener(
        "click",
        () => {

          role = "auditor";
          page = "home";

          localStorage.rk_role =
            role;

          render();

        }
      );

    document
      .querySelectorAll(".jl")
      .forEach(button => {

        button.addEventListener(
          "click",
          () => {

            role = "judge";

            jid =
              button.dataset.id;

            draft = {};

            localStorage.rk_role =
              role;

            localStorage.rk_judge =
              jid;

            render();

          }
        );

      });

    return;
  }

  /*
    JUDGE SIDE
  */

  if (role === "judge") {

    document
      .querySelectorAll(".sb")
      .forEach(button => {

        button.addEventListener(
          "click",
          () => {

            draft[
              button.dataset.k
            ] =
              Number(
                button.dataset.n
              );

            render();

          }
        );

      });

    document
      .getElementById("submit")
      ?.addEventListener(
        "click",
        async () => {

          if (
            C.some(
              ([key]) =>
                draft[key] ===
                undefined
            )
          ) {

            alert(
              "Please score every category."
            );

            return;
          }

          const total = T();

          if (
            !confirm(
              `Submit ${total}/100? This score will be locked.`
            )
          ) {
            return;
          }

          try {

            await set(
              ref(
                db,
                `event/scores/${D.active}/${jid}`
              ),
              {
                ...draft,
                total,
                judgeId: jid,
                judgeNo:
                  J[jid].no,
                submittedAt:
                  Date.now()
              }
            );

            draft = {};

            render();

          } catch (e) {

            alert(
              `Unable to submit score: ${e.message}`
            );

          }

        }
      );

    document
      .getElementById("jout")
      ?.addEventListener(
        "click",
        logout
      );

    return;
  }

  /*
    AUDITOR CORRECTION SCREEN
  */

  if (
    page === "judgeScores"
  ) {

    document
      .getElementById(
        "return-auditor"
      )
      ?.addEventListener(
        "click",
        returnToAuditor
      );

    const score =
      D.active &&
      selectedJudge
        ? S()[D.active]?.[
            selectedJudge
          ]
        : null;

    if (!score) {
      return;
    }

    document
      .querySelectorAll(
        ".corr-score-btn"
      )
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

            correctionDraft[key] =
              value;

            document
              .querySelectorAll(
                `.corr-score-btn[data-k="${key}"]`
              )
              .forEach(b =>
                b.classList.remove(
                  "selected"
                )
              );

            button.classList.add(
              "selected"
            );

            const valueDisplay =
              document.getElementById(
                `corr-${key}`
              );

            if (valueDisplay) {
              valueDisplay.textContent =
                value;
            }

            const totalDisplay =
              document.getElementById(
                "correction-total"
              );

            if (totalDisplay) {
              totalDisplay.textContent =
                correctionTotal();
            }

          }
        );

      });

    document
      .getElementById(
        "save-correction"
      )
      ?.addEventListener(
        "click",
        async () => {

          const total =
            correctionTotal();

          if (
            !confirm(
              `Save corrected score of ${total}/100 for ${J[selectedJudge].name}?`
            )
          ) {
            return;
          }

          try {

            await update(
              ref(
                db,
                `event/scores/${D.active}/${selectedJudge}`
              ),
              {
                ...correctionDraft,
                total,
                correctedAt:
                  Date.now(),
                correctedBy:
                  "Auditor"
              }
            );

            alert(
              "Corrected score saved successfully."
            );

            returnToAuditor();

          } catch (e) {

            alert(
              `Unable to save correction: ${e.message}`
            );

          }

        }
      );

    return;
  }

  /*
    AUDITOR NAVIGATION
  */

  document
    .querySelectorAll(".nb")
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          page =
            button.dataset.p;

          selectedJudge =
            null;

          correctionDraft =
            {};

          render();

        }
      );

    });

  /*
    LOGOUT
  */

  document
    .getElementById("out")
    ?.addEventListener(
      "click",
      logout
    );

  /*
    PANEL SIZE
  */

  document
    .getElementById("save-panel")
    ?.addEventListener(
      "click",
      async () => {

        if (panelLocked()) {
          alert(
            "The judging panel is already locked."
          );
          return;
        }

        const selected =
          Number(
            document.getElementById(
              "panel-size"
            )?.value
          );

        if (
          selected !== 3 &&
          selected !== 5
        ) {
          alert(
            "Please select either 3 or 5 judges."
          );
          return;
        }

        if (
          !confirm(
            `Set this competition to a ${selected}-judge panel?`
          )
        ) {
          return;
        }

        try {

          await update(
            ref(db, "event"),
            {
              panelSize: selected,
              panelLocked: false
            }
          );

          alert(
            `Judging panel set to ${selected} judges.`
          );

        } catch (e) {

          alert(
            `Unable to save judging panel: ${e.message}`
          );

        }

      }
    );

  /*
    ACTIVATE CONTESTANT

    The first activation locks the panel.
  */

  document
    .getElementById("activate")
    ?.addEventListener(
      "click",
      async () => {

        const active =
          document.getElementById(
            "act"
          )?.value;

        if (!active) {
          return;
        }

        try {

          const changes = {
            active
          };

          /*
            Lock panel when the first
            performance is activated.
          */
          if (!panelLocked()) {
            changes.panelLocked = true;
          }

          await update(
            ref(db, "event"),
            changes
          );

          page = "home";

        } catch (e) {

          alert(
            `Unable to activate contestant: ${e.message}`
          );

        }

      }
    );

  /*
    JUDGE SCORE BUTTONS
  */

  document
    .querySelectorAll(
      ".judge-score-btn"
    )
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          if (button.disabled) {
            return;
          }

          selectedJudge =
            button.dataset.judge;

          correctionDraft = {};

          page =
            "judgeScores";

          render();

        }
      );

    });

  /*
    ADD CONTESTANT
  */

  document
    .getElementById("add")
    ?.addEventListener(
      "click",
      async () => {

        const n =
          Number(
            document.getElementById(
              "cn"
            )?.value
          );

        const name =
          document
            .getElementById(
              "name"
            )
            ?.value
            .trim();

        if (!n || !name) {

          alert(
            "Enter contestant number and name."
          );

          return;
        }

        const id =
          "c" +
          Date.now();

        try {

          await set(
            ref(
              db,
              `event/contestants/${id}`
            ),
            {
              number: n,
              name,
              category:
                document.getElementById(
                  "cat"
                )?.value,
              song:
                document
                  .getElementById(
                    "song"
                  )
                  ?.value
                  .trim(),
              order:
                Number(
                  document.getElementById(
                    "ord"
                  )?.value
                ) || n
            }
          );

        } catch (e) {

          alert(
            `Unable to add contestant: ${e.message}`
          );

        }

      }
    );

  /*
    DELETE CONTESTANT
  */

  document
    .querySelectorAll(".del")
    .forEach(button => {

      button.addEventListener(
        "click",
        async () => {

          if (
            !confirm(
              "Delete this contestant?"
            )
          ) {
            return;
          }

          try {

            await remove(
              ref(
                db,
                `event/contestants/${button.dataset.id}`
              )
            );

          } catch (e) {

            alert(
              `Unable to delete contestant: ${e.message}`
            );

          }

        }
      );

    });
}

/* -------------------------------------------------------
   RENDER
------------------------------------------------------- */

function render() {

  if (!D.name) {

    root.textContent =
      "Loading competition...";

    return;
  }

  if (!role) {

    root.innerHTML =
      login();

  } else if (
    role === "judge"
  ) {

    root.innerHTML =
      head() +
      judge();

  } else {

    let content;

    if (
      page === "judgeScores"
    ) {

      content =
        judgeScores();

    } else if (
      page === "contestants"
    ) {

      content =
        cont();

    } else if (
      page === "live"
    ) {

      content =
        live();

    } else if (
      page === "results"
    ) {

      content =
        results();

    } else {

      content =
        dash();

    }

    root.innerHTML =
      head() +
      `<div class="wrap">
        ${nav()}
        ${content}
      </div>`;
  }

  wire();
}

start();

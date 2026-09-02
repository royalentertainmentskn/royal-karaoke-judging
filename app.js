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

/* =========================================================
   ROYAL KARAOKE SKN
   DIGITAL JUDGING SYSTEM
   ========================================================= */

/* =========================================================
   JUDGING CRITERIA
   TOTAL = 100
   ========================================================= */

const C = [
  ["voiceManagement", "Voice Management", 10],
  ["voiceTiming", "Voice Timing", 20],
  ["costume", "Costume", 5],
  ["props", "Props", 5],
  ["performance", "Performance", 40],
  ["crowdResponse", "Crowd Response", 20]
];

const MAX_TOTAL = C.reduce(
  (total, item) => total + item[2],
  0
);

/* =========================================================
   JUDGES

   The system supports up to 5 judges.
   The Auditor chooses whether the competition
   uses 3 or 5.
   ========================================================= */

const J = {
  j1: { no: 1, name: "Judge 1" },
  j2: { no: 2, name: "Judge 2" },
  j3: { no: 3, name: "Judge 3" },
  j4: { no: 4, name: "Judge 4" },
  j5: { no: 5, name: "Judge 5" }
};

const VALID_JUDGE_COUNTS = [3, 5];

/* =========================================================
   DEFAULT TEAMS
   ========================================================= */

const DEFAULT_TEAMS = {
  team1: "SKN Melodies",
  team2: "Island Voices",
  team3: "Kittitian Stars",
  team4: "Nevis Voices"
};

/* =========================================================
   FIREBASE
   ========================================================= */

const fb = initializeApp(firebaseConfig);
const db = getDatabase(fb);
const au = getAuth(fb);

const root = document.getElementById("app");

/* =========================================================
   LOCAL APPLICATION STATE
   ========================================================= */

let D = {};

let role =
  localStorage.getItem("rk_role") || null;

let jid =
  localStorage.getItem("rk_judge") || null;

let page = "home";

let draft = {};

let submitting = false;

/* Track which performance the judge is scoring */
let draftPerformanceId = null;

/* =========================================================
   HELPERS
   ========================================================= */

/* HTML escape */
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
   NUMBER OF JUDGES
   ========================================================= */

const judgeCount = () => {
  const value = Number(D.judgeCount);

  return VALID_JUDGE_COUNTS.includes(value)
    ? value
    : 5;
};

/* Active judges for this competition */
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
   CONTESTANTS
   ========================================================= */

const cs = () =>
  Object.entries(D.contestants || {})
    .map(([id, x]) => ({
      id,
      ...x
    }))
    .sort(
      (a, b) =>
        Number(a.order || 0) -
        Number(b.order || 0)
    );

/* =========================================================
   SCORES
   ========================================================= */

const S = () =>
  D.scores || {};

/* =========================================================
   ACTIVE CONTESTANT
   ========================================================= */

const A = () =>
  D.active
    ? D.contestants?.[D.active]
    : null;

/* =========================================================
   CURRENT DRAFT TOTAL
   ========================================================= */

const T = () =>
  C.reduce(
    (total, [key]) =>
      total + (Number(draft[key]) || 0),
    0
  );

/* =========================================================
   TEAMS
   ========================================================= */

const teams = () =>
  Object.entries(D.teams || {})
    .map(([id, name]) => ({
      id,
      name:
        typeof name === "string"
          ? name
          : name?.name || ""
    }))
    .filter(x => x.name)
    .sort((a, b) =>
      a.name.localeCompare(b.name)
    );

/* =========================================================
   TEAM NAME
   ========================================================= */

const teamName = teamId => {
  if (!teamId) return "";

  const t = D.teams?.[teamId];

  if (typeof t === "string") {
    return t;
  }

  return t?.name || "";
};

/* =========================================================
   GET CONTESTANT TEAM

   Supports old and new data formats.
   ========================================================= */

const getContestantTeam = contestant => {
  if (!contestant) return "";

  if (contestant.team) {
    return contestant.team;
  }

  if (contestant.teamId) {
    return teamName(contestant.teamId);
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
  const n = Number(value);

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
  const eventRef = ref(db, "event");

  const snap = await get(eventRef);

  /*
    BRAND NEW DATABASE

    Start completely empty.
    No demo contestants.
  */

  if (!snap.exists()) {
    await set(eventRef, {
      name:
        "Royal Karaoke SKN Championship",

      venue: "",

      active: null,

      contestants: {},

      judges: J,

      judgeCount: 5,

      teams: {},

      scores: {}
    });

    return;
  }

  const event = snap.val() || {};

  /*
    Ensure judge count exists.
  */

  if (
    !VALID_JUDGE_COUNTS.includes(
      Number(event.judgeCount)
    )
  ) {
    await set(
      ref(db, "event/judgeCount"),
      5
    );
  }

  /*
    Ensure judges exist.
  */

  if (!event.judges) {
    await set(
      ref(db, "event/judges"),
      J
    );
  }

  /*
    Do NOT automatically create teams.
    This allows a reset to remain completely empty.
  */

  if (!event.teams) {
    await set(
      ref(db, "event/teams"),
      {}
    );
  }

  if (!event.contestants) {
    await set(
      ref(db, "event/contestants"),
      {}
    );
  }

  if (!event.scores) {
    await set(
      ref(db, "event/scores"),
      {}
    );
  }
}

/* =========================================================
   START
   ========================================================= */

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

      D = snapshot.val() || {};

      /*
        If the active performance changes
        while a judge is entering scores,
        clear the old draft.
      */

      if (
        previousActive !== D.active
      ) {
        draft = {};
        draftPerformanceId =
          D.active || null;
      }

      /*
        If the selected judge is no longer
        part of the competition, log them out.
      */

      if (
        role === "judge" &&
        (!jid ||
          !J[jid] ||
          J[jid].no > judgeCount())
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
        <small>DIGITAL JUDGING SYSTEM</small>
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
  const availableJudges =
    activeJudges();

  return `
    <div class="wrap">

      <div class="card hero">

        <div class="big">🎤</div>

        <h1>
          Royal Karaoke SKN
        </h1>

        <h2>
          100-Point Digital Judging System
        </h2>

        <p class="muted">
          Current competition:
          <b>${judgeCount()} Judges</b>
        </p>

        <button
          id="aud"
          class="primary"
        >
          AUDITOR
        </button>

        <h3>
          Select Judge
        </h3>

        <div class="login-grid">

          ${availableJudges
            .map(
              judge => `
                <button
                  class="jl"
                  data-id="${E(judge.id)}"
                  type="button"
                >
                  ${E(judge.name)}
                </button>
              `
            )
            .join("")}

        </div>

      </div>

    </div>
  `;
}

/* =========================================================
   COMPETITION SETTINGS
   ========================================================= */

function settingsCard() {
  return `
    <div class="card">

      <h2>
        ⚙️ Competition Settings
      </h2>

      <p class="muted">
        Select the number of judges for this competition.
        The system will automatically adjust scoring,
        completion and results.
      </p>

      <p>
        <b>Number of Judges</b>
      </p>

      <div class="login-grid">

        <button
          id="judges3"
          type="button"
          class="${
            judgeCount() === 3
              ? "primary"
              : ""
          }"
        >
          3 JUDGES
        </button>

        <button
          id="judges5"
          type="button"
          class="${
            judgeCount() === 5
              ? "primary"
              : ""
          }"
        >
          5 JUDGES
        </button>

      </div>

      <p>
        Current setting:
        <strong>
          ${judgeCount()} Judges
        </strong>
      </p>

      <p class="muted">
        A performance is complete only when
        all ${judgeCount()} selected judges
        have submitted their scores.
      </p>

    </div>
  `;
}

/* =========================================================
   RESET COMPETITION CARD
   ========================================================= */

function resetCard() {
  return `
    <div class="card">

      <h2>
        ⚠️ New Competition / Reset
      </h2>

      <p>
        Use this when you are finished with one
        competition and want to start a completely
        new one.
      </p>

      <p class="muted">
        Resetting will permanently remove:
      </p>

      <ul>
        <li>All contestants</li>
        <li>All teams</li>
        <li>All judge scores</li>
        <li>The active performance</li>
      </ul>

      <p class="warn">
        The judges and judging system will remain.
      </p>

      <button
        id="resetCompetition"
        class="danger"
        type="button"
      >
        ⚠️ RESET COMPETITION
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

  const currentTeam =
    getContestantTeam(a);

  const complete =
    submitted === judgeCount();

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

        <p>
          <b>
            ${judgeCount()} Judges
          </b>
        </p>

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

              <p>
                <b>
                  Team:
                </b>

                ${E(
                  currentTeam ||
                    "Unassigned"
                )}
              </p>

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
        Activate Performance
      </h2>

      ${
        cs().length
          ? `
            <select id="act">

              ${cs()
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
            <p>
              No contestants registered yet.
            </p>
          `
      }

    </div>

    <div class="card">

      <h2>
        Judge Status
      </h2>

      ${activeJudges()
        .map(
          judge => {
            const score =
              activeScores[judge.id];

            return `
              <p>

                <b>
                  ${E(judge.name)}
                </b>

                —

                ${
                  score
                    ? `
                      <span class="ok">
                        ✓ Submitted
                        —
                        ${Number(
                          score.total || 0
                        ).toFixed(0)}/100
                      </span>
                    `
                    : `
                      <span class="warn">
                        Waiting
                      </span>
                    `
                }

              </p>
            `;
          }
        )
        .join("")}

    </div>

    ${resetCard()}
  `;
}

/* =========================================================
   TEAM OPTIONS
   ========================================================= */

function teamOptions(
  selected = ""
) {
  return `
    <option value="">
      Select Team
    </option>

    ${teams()
      .map(
        t => `
          <option
            value="${E(t.id)}"
            ${
              selected === t.id ||
              selected === t.name
                ? "selected"
                : ""
            }
          >
            ${E(t.name)}
          </option>
        `
      )
      .join("")}
  `;
}

/* =========================================================
   CONTESTANTS / TEAMS
   ========================================================= */

function cont() {
  return `
    <h1>
      Contestants & Teams
    </h1>

    <!-- TEAM MANAGEMENT -->

    <div class="card">

      <h2>
        Manage Teams
      </h2>

      <div class="form-grid">

        <input
          id="newTeam"
          placeholder="New Team Name"
          maxlength="60"
        >

        <button
          id="addTeam"
          class="primary"
          type="button"
        >
          ADD TEAM
        </button>

      </div>

      <br>

      ${
        teams().length
          ? `
            <div class="table-wrap">

              <table>

                <tr>
                  <th>Team</th>
                  <th>Action</th>
                </tr>

                ${teams()
                  .map(
                    t => `
                      <tr>

                        <td>
                          <strong>
                            ${E(t.name)}
                          </strong>
                        </td>

                        <td>
                          <button
                            class="delete-team danger"
                            data-id="${E(t.id)}"
                            type="button"
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
          `
          : `
            <p>
              No teams have been created yet.
            </p>
          `
      }

    </div>

    <!-- REGISTRATION -->

    <div class="card">

      <h2>
        Register Performance
      </h2>

      <p class="muted">
        Assign every performer to a team.
        A duet is one performance and contributes
        one final score to its team.
      </p>

      <div class="form-grid">

        <input
          id="cn"
          type="number"
          min="1"
          max="9999"
          placeholder="Performance Number"
        >

        <select id="cat">

          <option value="Male">
            Male
          </option>

          <option value="Female">
            Female
          </option>

          <option value="Duet">
            Duet
          </option>

        </select>

        <input
          id="name"
          placeholder="Contestant Name"
          maxlength="100"
        >

        <input
          id="name2"
          placeholder="Second Contestant Name — Duet Only"
          maxlength="100"
          style="display:none"
        >

        <select id="team">

          ${teamOptions()}

        </select>

        <input
          id="song"
          placeholder="Song"
          maxlength="150"
        >

        <input
          id="ord"
          type="number"
          min="1"
          max="9999"
          placeholder="Performance Order"
        >

      </div>

      <br>

      <button
        id="add"
        class="primary"
        type="button"
      >
        ADD PERFORMANCE
      </button>

    </div>

    <!-- REGISTERED PERFORMANCES -->

    <div class="card table-wrap">

      <h2>
        Registered Performances
      </h2>

      <table>

        <tr>

          <th>#</th>
          <th>Contestant</th>
          <th>Category</th>
          <th>Team</th>
          <th>Song</th>
          <th>Order</th>
          <th>Action</th>

        </tr>

        ${
          cs().length
            ? cs()
                .map(x => {
                  const team =
                    getContestantTeam(x);

                  return `
                    <tr>

                      <td>
                        ${E(x.number)}
                      </td>

                      <td>

                        <strong>
                          ${E(x.name)}
                        </strong>

                        ${
                          x.category === "Duet" &&
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

                      <td>

                        ${
                          team
                            ? `
                              <strong>
                                ${E(team)}
                              </strong>
                            `
                            : `
                              <span class="warn">
                                Unassigned
                              </span>
                            `
                        }

                      </td>

                      <td>
                        ${E(x.song || "")}
                      </td>

                      <td>
                        ${E(x.order || "")}
                      </td>

                      <td>

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
                    colspan="7"
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
   LIVE SCORES
   ========================================================= */

function live() {
  const s =
    D.active
      ? S()[D.active] || {}
      : {};

  const a = A();

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

            <p>

              <b>
                Team:
              </b>

              ${E(
                team ||
                  "Unassigned"
              )}

            </p>

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
        .map(
          judge => {
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
                        ).toFixed(0)}/100
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
          }
        )
        .join("")}

    </div>
  `;
}

/* =========================================================
   PERFORMANCE SCORE CALCULATION
   ========================================================= */

function performanceResult(id) {
  const scoreObject =
    S()[id] || {};

  /*
    Only scores from judges currently
    configured for this competition count.
  */

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
    scores.length === judgeCount();

  const total =
    scores.reduce(
      (sum, score) =>
        sum +
        Number(score.total || 0),
      0
    );

  const avg =
    scores.length
      ? total / scores.length
      : 0;

  return {
    scores,
    submitted: scores.length,
    complete,
    avg
  };
}

/* =========================================================
   RESULTS
   ========================================================= */

function results() {
  const rows = cs()
    .map(x => {
      const result =
        performanceResult(x.id);

      return {
        ...x,

        submitted:
          result.submitted,

        complete:
          result.complete,

        avg:
          result.avg
      };
    });

  /*
    Only completely judged performances
    count toward final awards.
  */

  const completeRows =
    rows.filter(
      x => x.complete
    );

  /* =======================================================
     CATEGORY WINNERS
     ======================================================= */

  const overallWinner =
    completeRows
      .slice()
      .sort(
        (a, b) =>
          b.avg - a.avg
      )[0];

  const bestMale =
    completeRows
      .filter(
        x =>
          x.category ===
          "Male"
      )
      .sort(
        (a, b) =>
          b.avg - a.avg
      )[0];

  const bestFemale =
    completeRows
      .filter(
        x =>
          x.category ===
          "Female"
      )
      .sort(
        (a, b) =>
          b.avg - a.avg
      )[0];

  const bestDuet =
    completeRows
      .filter(
        x =>
          x.category ===
          "Duet"
      )
      .sort(
        (a, b) =>
          b.avg - a.avg
      )[0];

  /* =======================================================
     TEAM TOTALS

     Each completed performance contributes
     its final average exactly ONCE.

     Individual = one performance
     Duet = one performance
     ======================================================= */

  const teamTotals = {};

  completeRows.forEach(x => {

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

    teamTotals[team].total +=
      Number(x.avg || 0);

    teamTotals[team].performances++;
  });

  /*
    Include registered teams that
    have no completed performances.
  */

  teams().forEach(t => {

    if (!teamTotals[t.name]) {

      teamTotals[t.name] = {
        team: t.name,
        total: 0,
        performances: 0
      };

    }

  });

  const teamRanking =
    Object.values(teamTotals)
      .sort(
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
    winner,
    teamMode = false
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

    if (teamMode) {

      return `
        <div class="card winner">

          <span class="muted">
            🏆 ${E(title)}
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
            completed performance
            ${
              winner.performances === 1
                ? ""
                : "s"
            }
          </p>

        </div>
      `;
    }

    return `
      <div class="card winner">

        <span class="muted">
          ${E(title)}
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

        <div class="big">
          ${winner.avg.toFixed(2)}
        </div>

        <p>
          /100
        </p>

      </div>
    `;
  };

  /* =======================================================
     RESULTS PAGE
     ======================================================= */

  return `
    <h1>
      Competition Results
    </h1>

    <div class="card">

      <h2>
        Competition uses
        ${judgeCount()} Judges
      </h2>

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

      ${winnerCard(
        "Best Overall Team",
        bestTeam,
        true
      )}

    </div>

    <!-- TEAM RANKING -->

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

                  <td
                    colspan="4"
                  >
                    No teams registered.
                  </td>

                </tr>
              `
        }

      </table>

    </div>

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

          <th>
            Team
          </th>

          <th>
            Judges
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
                b.avg - a.avg
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
                    ${E(x.number)}
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

                  <td>
                    ${E(
                      getContestantTeam(
                        x
                      ) ||
                      "Unassigned"
                    )}
                  </td>

                  <td>
                    ${x.submitted}/${judgeCount()}
                  </td>

                  <td>

                    ${
                      x.complete
                        ? `
                          <strong>
                            ${x.avg.toFixed(2)}
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

function judge() {
  const a = A();

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

        </div>

      </div>
    `;
  }

  /*
    Make sure draft belongs to this performance.
  */

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

  /*
    LOCKED SCORE
  */

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

          <p>
            Team:
            <b>
              ${E(
                team ||
                "Unassigned"
              )}
            </b>
          </p>

          <div class="big">
            ${Number(
              old.total || 0
            ).toFixed(0)}/100
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

        </div>

      </div>
    `;
  }

  return `
    <div class="wrap">

      <!-- PERFORMANCE HEADER -->

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

        <h2>
          ${E(
            team ||
            "Team Not Assigned"
          )}
        </h2>

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

      <!-- SCORING -->

      <div class="card">

        <div class="notice">

          Complete every criterion.

          <br>

          Total possible:
          <b>
            ${MAX_TOTAL} points.
          </b>

        </div>

        ${C.map(
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
          ${T()}
          /
          ${MAX_TOTAL}

        </div>

        <button
          id="submit"
          class="primary"
          style="width:100%"
          type="button"
        >
          SUBMIT SCORE — LOCK IT
        </button>

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
        ["contestants", "Contestants"],
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

  draftPerformanceId = null;

  localStorage.removeItem(
    "rk_role"
  );

  localStorage.removeItem(
    "rk_judge"
  );

  page = "home";

  render();
}

/* =========================================================
   JUDGE SCORE VALIDATION
   ========================================================= */

function validateDraft() {

  for (
    const [key, label, max]
    of C
  ) {

    const value =
      Number(draft[key]);

    if (
      !Number.isFinite(value) ||
      !Number.isInteger(value) ||
      value < 0 ||
      value > max
    ) {

      return {
        ok: false,

        message:
          `Invalid score for ${label}. ` +
          `Maximum is ${max}.`
      };

    }

  }

  const total = T();

  if (
    !Number.isInteger(total) ||
    total < 0 ||
    total > MAX_TOTAL
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
   CHANGE NUMBER OF JUDGES
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

  /*
    Changing the number of judges after
    scoring has started could change the
    outcome.

    Therefore require confirmation and
    clear the existing scores.
  */

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

    /*
      If the current browser is Judge 4
      or Judge 5 and the competition is
      changed to 3 judges, log them out.
    */

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

  /*
    First confirmation.
  */

  const first =
    confirm(
      "⚠️ RESET COMPETITION\n\n" +
      "This will permanently remove:\n\n" +
      "• All contestants\n" +
      "• All teams\n" +
      "• All judge scores\n" +
      "• The active performance\n\n" +
      "The judges and judging system will remain.\n\n" +
      "Do you want to continue?"
    );

  if (!first) {
    return;
  }

  /*
    Second confirmation.
  */

  const typed =
    prompt(
      "FINAL CONFIRMATION\n\n" +
      "Type RESET in capital letters to permanently clear the competition."
    );

  if (
    typed !== "RESET"
  ) {
    alert(
      "Reset cancelled. Nothing was deleted."
    );

    return;
  }

  try {

    /*
      Reset only the competition data.
      Keep judges and judge count.
    */

    await update(
      ref(db, "event"),
      {
        active: null,
        contestants: {},
        teams: {},
        scores: {}
      }
    );

    /*
      Clear local judge/auditor state.
      This returns the current browser
      to the login screen.
    */

    role = null;
    jid = null;

    draft = {};

    submitting = false;

    draftPerformanceId = null;

    page = "home";

    localStorage.removeItem(
      "rk_role"
    );

    localStorage.removeItem(
      "rk_judge"
    );

    alert(
      "Competition reset successfully.\n\n" +
      "The system is now ready for a new competition."
    );

    render();

  } catch (error) {

    console.error(
      "Competition reset error:",
      error
    );

    alert(
      "The competition could not be reset.\n\n" +
      error.message
    );

  }
}

/* =========================================================
   WIRING
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

          role = "auditor";

          localStorage.setItem(
            "rk_role",
            role
          );

          page = "home";

          render();

        }
      );

    document
      .querySelectorAll(".jl")
      .forEach(button => {

        button.addEventListener(
          "click",
          () => {

            const selectedJudge =
              button.dataset.id;

            if (
              !J[selectedJudge]
            ) {

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

            role = "judge";

            jid =
              selectedJudge;

            localStorage.setItem(
              "rk_role",
              role
            );

            localStorage.setItem(
              "rk_judge",
              jid
            );

            draft = {};

            draftPerformanceId =
              D.active || null;

            render();

          }
        );

      });

    return;
  }

  /* =======================================================
     JUDGE
     ======================================================= */

  if (
    role === "judge"
  ) {

    /*
      Make sure this judge is enabled.
    */

    if (
      !jid ||
      !J[jid] ||
      J[jid].no > judgeCount()
    ) {

      logout();

      return;
    }

    /*
      Score buttons
    */

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
              C.find(
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

    /*
      Submit score
    */

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
            validateDraft();

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

          /*
            Confirm before locking.
          */

          if (
            !confirm(
              `Submit ${total}/${MAX_TOTAL}?\n\n` +
              "This score will be permanently locked."
            )
          ) {
            return;
          }

          submitting = true;

          try {

            const scoreRef =
              ref(
                db,
                `event/scores/${activeId}/${jid}`
              );

            /*
              Transaction prevents
              duplicate submissions.
            */

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
              `Score submitted successfully: ${total}/${MAX_TOTAL}`
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

            submitting = false;

          }

        }
      );

    /*
      Judge logout
    */

    document
      .getElementById("jout")
      ?.addEventListener(
        "click",
        logout
      );

    return;
  }

  /* =======================================================
     AUDITOR
     ======================================================= */

  /*
    Navigation
  */

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

  /*
    Auditor logout
  */

  document
    .getElementById("out")
    ?.addEventListener(
      "click",
      logout
    );

  /* =======================================================
     JUDGE COUNT SETTINGS
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
     RESET COMPETITION
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
     ACTIVATE PERFORMANCE
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

        if (
          !D.contestants?.[id]
        ) {

          alert(
            "That performance does not exist."
          );

          return;
        }

        /*
          Warn if this performance
          already has scores.
        */

        const existing =
          Object.keys(
            S()[id] || {}
          ).filter(
            judgeId =>
              activeJudges().some(
                judge =>
                  judge.id === judgeId
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

          await update(
            ref(db, "event"),
            {
              active: id
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
    .getElementById("addTeam")
    ?.addEventListener(
      "click",
      async () => {

        const input =
          document.getElementById(
            "newTeam"
          );

        const name =
          input?.value
            .trim();

        if (!name) {

          alert(
            "Enter a team name."
          );

          return;
        }

        if (
          name.length < 2
        ) {

          alert(
            "Team name is too short."
          );

          return;
        }

        const duplicate =
          teams().some(
            t =>
              t.name
                .toLowerCase() ===
              name.toLowerCase()
          );

        if (duplicate) {

          alert(
            "That team already exists."
          );

          return;
        }

        try {

          const teamRef =
            push(
              ref(
                db,
                "event/teams"
              )
            );

          await set(
            teamRef,
            name
          );

          input.value = "";

          alert(
            `Team "${name}" added successfully.`
          );

        } catch (error) {

          alert(
            "Could not add team.\n\n" +
            error.message
          );

        }

      }
    );

  /* =======================================================
     CATEGORY CHANGE
     ======================================================= */

  document
    .getElementById("cat")
    ?.addEventListener(
      "change",
      event => {

        const second =
          document.getElementById(
            "name2"
          );

        if (!second) {
          return;
        }

        if (
          event.target.value ===
          "Duet"
        ) {

          second.style.display =
            "";

          second.required =
            true;

        } else {

          second.style.display =
            "none";

          second.required =
            false;

          second.value =
            "";

        }

      }
    );

  /* =======================================================
     ADD PERFORMANCE
     ======================================================= */

  document
    .getElementById("add")
    ?.addEventListener(
      "click",
      async () => {

        const number =
          Number(
            document.getElementById(
              "cn"
            )?.value
          );

        const category =
          document.getElementById(
            "cat"
          )?.value;

        const name =
          document
            .getElementById(
              "name"
            )
            ?.value
            .trim();

        const name2 =
          document
            .getElementById(
              "name2"
            )
            ?.value
            .trim();

        const teamId =
          document.getElementById(
            "team"
          )?.value;

        const song =
          document
            .getElementById(
              "song"
            )
            ?.value
            .trim();

        const order =
          Number(
            document.getElementById(
              "ord"
            )?.value
          );

        /* Number */

        if (
          !validNumber(
            number,
            1,
            9999
          )
        ) {

          alert(
            "Enter a valid performance number."
          );

          return;
        }

        /* Category */

        if (
          ![
            "Male",
            "Female",
            "Duet"
          ].includes(
            category
          )
        ) {

          alert(
            "Select a valid category."
          );

          return;
        }

        /* Name */

        if (!name) {

          alert(
            "Enter the contestant name."
          );

          return;
        }

        /* Duet partner */

        if (
          category ===
            "Duet" &&
          !name2
        ) {

          alert(
            "Enter the second contestant name for the duet."
          );

          return;
        }

        /* Team */

        if (!teamId) {

          alert(
            "Select a team."
          );

          return;
        }

        const selectedTeam =
          teams().find(
            t =>
              t.id ===
              teamId
          );

        if (!selectedTeam) {

          alert(
            "The selected team could not be found."
          );

          return;
        }

        /* Order */

        const finalOrder =
          validNumber(
            order,
            1,
            9999
          )
            ? order
            : number;

        /* Duplicate number */

        const duplicateNumber =
          cs().some(
            x =>
              Number(x.number) ===
              number
          );

        if (
          duplicateNumber
        ) {

          alert(
            `Performance number ${number} is already registered.`
          );

          return;
        }

        /* Create ID */

        const id =
          "c" +
          Date.now() +
          "_" +
          Math.random()
            .toString(36)
            .slice(2, 8);

        const contestant = {

          number,

          name,

          category,

          team:
            selectedTeam.name,

          teamId,

          song,

          order:
            finalOrder

        };

        if (
          category ===
          "Duet"
        ) {

          contestant.name2 =
            name2;

        }

        try {

          await set(
            ref(
              db,
              `event/contestants/${id}`
            ),
            contestant
          );

          /*
            If no active performance exists,
            make this the active one.
          */

          if (!D.active) {

            await update(
              ref(db, "event"),
              {
                active: id
              }
            );

          }

          alert(
            "Performance registered successfully."
          );

        } catch (error) {

          alert(
            "Could not register performance.\n\n" +
            error.message
          );

        }

      }
    );

  /* =======================================================
     DELETE CONTESTANT
     ======================================================= */

  document
    .querySelectorAll(".del")
    .forEach(button => {

      button.addEventListener(
        "click",
        async () => {

          const id =
            button.dataset.id;

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

          const message =
            scoreCount > 0
              ? `This performance already has ${scoreCount} judge score(s).\n\nDelete the performance and its scores?`
              : "Delete this performance?";

          if (
            !confirm(message)
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

            if (
              D.scores?.[id]
            ) {

              await remove(
                ref(
                  db,
                  `event/scores/${id}`
                )
              );

            }

          } catch (error) {

            alert(
              "Could not delete performance.\n\n" +
              error.message
            );

          }

        }
      );

    });

  /* =======================================================
     DELETE TEAM
     ======================================================= */

  document
    .querySelectorAll(
      ".delete-team"
    )
    .forEach(button => {

      button.addEventListener(
        "click",
        async () => {

          const id =
            button.dataset.id;

          const name =
            teamName(id);

          if (!name) {
            return;
          }

          const members =
            cs().filter(
              x =>
                x.teamId === id ||
                x.team === name
            );

          if (
            members.length > 0
          ) {

            alert(
              `The team "${name}" cannot be deleted because ${members.length} registered performance(s) are assigned to it.`
            );

            return;
          }

          if (
            !confirm(
              `Delete team "${name}"?`
            )
          ) {
            return;
          }

          try {

            await remove(
              ref(
                db,
                `event/teams/${id}`
              )
            );

          } catch (error) {

            alert(
              "Could not delete team.\n\n" +
              error.message
            );

          }

        }
      );

    });
}

/* =========================================================
   RENDER
   ========================================================= */

function render() {

  if (
    !D ||
    !D.name
  ) {

    root.innerHTML = `
      <div class="wrap">

        <div class="card hero">

          <div class="big">
            🎤
          </div>

          <h2>
            Loading Royal Karaoke SKN...
          </h2>

        </div>

      </div>
    `;

    return;
  }

  /*
    LOGIN
  */

  if (!role) {

    root.innerHTML =
      login();

  }

  /*
    JUDGE
  */

  else if (
    role === "judge"
  ) {

    root.innerHTML =
      head() +
      judge();

  }

  /*
    AUDITOR
  */

  else {

    const body =
      page ===
      "contestants"
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

  wire();
}

/* =========================================================
   START APPLICATION
   ========================================================= */

start();

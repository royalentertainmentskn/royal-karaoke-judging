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

/* -----------------------------
   JUDGING CRITERIA
   TOTAL = 100
------------------------------ */

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

/* -----------------------------
   JUDGES
------------------------------ */

const J = {
  j1: { no: 1, name: "Judge 1" },
  j2: { no: 2, name: "Judge 2" },
  j3: { no: 3, name: "Judge 3" },
  j4: { no: 4, name: "Judge 4" },
  j5: { no: 5, name: "Judge 5" }
};

const JUDGE_COUNT = Object.keys(J).length;

/* -----------------------------
   DEFAULT TEAMS

   These can be changed/added
   from the Contestants page.
------------------------------ */

const DEFAULT_TEAMS = {
  team1: "SKN Melodies",
  team2: "Island Voices",
  team3: "Kittitian Stars",
  team4: "Nevis Voices"
};

/* -----------------------------
   DEMO DATA

   Used only when creating a
   brand-new empty event.
------------------------------ */

const DEMO = {
  c1: {
    number: 1,
    name: "Sarah Jones",
    category: "Female",
    team: "SKN Melodies",
    song: "Example Song",
    order: 1
  },

  c2: {
    number: 2,
    name: "John Smith",
    category: "Male",
    team: "SKN Melodies",
    song: "Example Song",
    order: 2
  },

  c3: {
    number: 3,
    name: "Mary",
    name2: "James",
    category: "Duet",
    team: "Island Voices",
    song: "Example Song",
    order: 3
  }
};

/* -----------------------------
   FIREBASE
------------------------------ */

const fb = initializeApp(firebaseConfig);
const db = getDatabase(fb);
const au = getAuth(fb);

const root = document.getElementById("app");

/* -----------------------------
   LOCAL APPLICATION STATE
------------------------------ */

let D = {};

let role =
  localStorage.getItem("rk_role") || null;

let jid =
  localStorage.getItem("rk_judge") || null;

let page = "home";

let draft = {};

let submitting = false;

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

/* Contestants sorted by performance order */
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

/* Scores */
const S = () => D.scores || {};

/* Active contestant */
const A = () =>
  D.active
    ? D.contestants?.[D.active]
    : null;

/* Current draft total */
const T = () =>
  C.reduce(
    (total, [key]) =>
      total + (Number(draft[key]) || 0),
    0
  );

/* Team list */
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

/* Team name */
const teamName = teamId => {
  if (!teamId) return "";

  const t = D.teams?.[teamId];

  if (typeof t === "string") {
    return t;
  }

  return t?.name || "";
};

/*
  Supports both:
  team: "SKN Melodies"
  and
  teamId: "team1"
*/
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

/* Number validation */
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
   FIREBASE INITIALIZATION
   ========================================================= */

async function initializeEvent() {
  const eventRef = ref(db, "event");

  const snap = await get(eventRef);

  if (!snap.exists()) {
    await set(eventRef, {
      name:
        "Royal Karaoke SKN Championship — Test Event",

      venue: "Test Venue",

      active: "c1",

      contestants: DEMO,

      judges: J,

      teams: DEFAULT_TEAMS,

      scores: {}
    });

    return;
  }

  const event = snap.val() || {};

  /*
    If an existing event does not have teams,
    add the default team list without
    overwriting contestants or scores.
  */

  if (!event.teams) {
    await set(
      ref(db, "event/teams"),
      DEFAULT_TEAMS
    );
  }

  /*
    If judges are missing, restore them.
  */

  if (!event.judges) {
    await set(
      ref(db, "event/judges"),
      J
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
      D = snapshot.val() || {};

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
            ? "AUDITOR"
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
  return `
    <div class="wrap">

      <div class="card hero">

        <div class="big">🎤</div>

        <h1>Royal Karaoke SKN</h1>

        <h2>
          100-Point Digital Judging System
        </h2>

        <button
          id="aud"
          class="primary"
        >
          AUDITOR
        </button>

        <h3>Select Judge</h3>

        <div class="login-grid">

          ${Object.entries(J)
            .map(
              ([id, judge]) => `
                <button
                  class="jl"
                  data-id="${id}"
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
   AUDITOR DASHBOARD
   ========================================================= */

function dash() {
  const a = A();

  const activeScores =
    D.active
      ? S()[D.active] || {}
      : {};

  const submitted =
    Object.keys(activeScores).length;

  const currentTeam =
    getContestantTeam(a);

  const complete =
    submitted === JUDGE_COUNT;

  return `
    <h1>Auditor Dashboard</h1>

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
                ${E(currentTeam || "Unassigned")}
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
          ${submitted}/${JUDGE_COUNT}
        </div>

        ${
          complete
            ? `<span class="ok">✓ COMPLETE</span>`
            : `<span class="warn">WAITING</span>`
        }

      </div>

    </div>

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

      ${Object.entries(J)
        .map(
          ([id, judge]) => `
            <p>

              <b>
                ${E(judge.name)}
              </b>

              —

              ${
                activeScores[id]
                  ? `
                    <span class="ok">
                      ✓ Submitted
                      —
                      ${Number(
                        activeScores[id].total || 0
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
          `
        )
        .join("")}

    </div>
  `;
}

/* =========================================================
   TEAM OPTIONS
   ========================================================= */

function teamOptions(selected = "") {
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
   CONTESTANTS / REGISTRATION
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

    <!-- CONTESTANT REGISTRATION -->

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
          placeholder="Performance Order"
        >

      </div>

      <br>

      <button
        id="add"
        class="primary"
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
    Object.keys(s).length;

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

              ${E(team || "Unassigned")}

            </p>

            <p>
              ${E(a.category || "")}
              ${
                a.song
                  ? ` · ${E(a.song)}`
                  : ""
              }
            </p>

            <p>
              Judges:
              <b>
                ${submitted}/${JUDGE_COUNT}
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

      ${Object.entries(J)
        .map(
          ([id, judge]) => {
            const score = s[id];

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
  const scores =
    Object.values(
      S()[id] || {}
    ).filter(
      x =>
        x &&
        x.submitted === true
    );

  const complete =
    scores.length === JUDGE_COUNT;

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
    Only completed performances count
    toward final awards.
  */

  const completeRows =
    rows.filter(
      x => x.complete
    );

  /* Overall winner */

  const overallWinner =
    completeRows
      .slice()
      .sort(
        (a, b) =>
          b.avg - a.avg
      )[0];

  /* Category winners */

  const bestMale =
    completeRows
      .filter(
        x =>
          x.category === "Male"
      )
      .sort(
        (a, b) =>
          b.avg - a.avg
      )[0];

  const bestFemale =
    completeRows
      .filter(
        x =>
          x.category === "Female"
      )
      .sort(
        (a, b) =>
          b.avg - a.avg
      )[0];

  const bestDuet =
    completeRows
      .filter(
        x =>
          x.category === "Duet"
      )
      .sort(
        (a, b) =>
          b.avg - a.avg
      )[0];

  /* =======================================================
     TEAM TOTALS

     Each completed performance contributes
     its final average ONCE.

     Individual = one score
     Duet = one score
  ======================================================= */

  const teamTotals = {};

  completeRows.forEach(x => {
    const team =
      getContestantTeam(x);

    if (!team) return;

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
    Also show registered teams that have
    no completed performances yet.
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

  /* Winner card */

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
            ${
              winner.performances
            }
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
            winner.category === "Duet" &&
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
              ) || "Unassigned"
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

  return `
    <h1>
      Competition Results
    </h1>

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
                    ${E(
                      getContestantTeam(
                        x
                      ) || "Unassigned"
                    )}
                  </td>

                  <td>
                    ${x.submitted}/${JUDGE_COUNT}
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

  const old =
    D.active
      ? S()[D.active]?.[jid]
      : null;

  const team =
    getContestantTeam(a);

  /*
    Locked score
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
              a.category === "Duet" &&
              a.name2
                ? `<br>& ${E(a.name2)}`
                : ""
            }

          </h2>

          <p>
            Team:
            <b>
              ${E(team || "Unassigned")}
            </b>
          </p>

          <div class="big">
            ${Number(old.total || 0).toFixed(0)}/100
          </div>

          <p class="ok">
            Your score is locked.
          </p>

          <p class="muted">
            You cannot change a submitted score.
          </p>

          <button
            id="jout"
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
            a.category === "Duet" &&
            a.name2
              ? `<br>& ${E(a.name2)}`
              : ""
          }

        </h1>

        <h2>
          ${E(team || "Team Not Assigned")}
        </h2>

        <p>

          ${E(a.category || "")}

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
            >
              ${E(label)}
            </button>
          `
        )
        .join("")}

      <button id="out">
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
  for (const [key, label, max] of C) {
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
   WIRING
   ========================================================= */

function wire() {

  /* -------------------------
     LOGIN
  -------------------------- */

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

            render();
          }
        );

      });

    return;
  }

  /* =======================================================
     JUDGE
     ======================================================= */

  if (role === "judge") {

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
                x => x[0] === key
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

          if (!jid || !J[jid]) {
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

            /*
              IMPORTANT:

              Transaction prevents a second
              submission from overwriting an
              already-existing score.

              If another score already exists,
              the transaction aborts.
            */

            const scoreRef =
              ref(
                db,
                `event/scores/${activeId}/${jid}`
              );

            const result =
              await runTransaction(
                scoreRef,
                current => {

                  if (current !== null) {
                    return;
                  }

                  return {
                    ...draft,

                    total,

                    judgeId: jid,

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

  /*
    Activate performance
  */

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
          Warn auditor if changing
          while scores already exist.
        */

        const existing =
          Object.keys(
            S()[id] || {}
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

        /*
          Prevent duplicate names,
          ignoring capitalization.
        */

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
            .getElementById("name")
            ?.value
            .trim();

        const name2 =
          document
            .getElementById("name2")
            ?.value
            .trim();

        const teamId =
          document.getElementById(
            "team"
          )?.value;

        const song =
          document
            .getElementById("song")
            ?.value
            .trim();

        const order =
          Number(
            document.getElementById(
              "ord"
            )?.value
          );

        /* Validate number */

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

        /* Validate category */

        if (
          ![
            "Male",
            "Female",
            "Duet"
          ].includes(category)
        ) {
          alert(
            "Select a valid category."
          );

          return;
        }

        /* Validate name */

        if (
          !name
        ) {
          alert(
            "Enter the contestant name."
          );

          return;
        }

        /* Validate duet partner */

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

        /* Validate team */

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

        /* Validate order */

        const finalOrder =
          validNumber(
            order,
            1,
            9999
          )
            ? order
            : number;

        /*
          Prevent duplicate performance numbers.
        */

        const duplicateNumber =
          cs().some(
            x =>
              Number(x.number) ===
              number
          );

        if (duplicateNumber) {
          alert(
            `Performance number ${number} is already registered.`
          );

          return;
        }

        /*
          Create unique contestant ID.
        */

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
            Automatically make the first
            registered performance active
            if none currently exists.
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

          /*
            Prevent deleting the active
            performance accidentally.
          */

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

            /*
              Remove any scores belonging
              to the deleted performance.
            */

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

          /*
            Check whether the team
            is being used.
          */

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
    No role = login
  */

  if (!role) {

    root.innerHTML =
      login();

  }

  /*
    Judge
  */

  else if (
    role === "judge"
  ) {

    root.innerHTML =
      head() +
      judge();

  }

  /*
    Auditor
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

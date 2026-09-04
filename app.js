App.js

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
   COMPETITION TYPES
   ========================================================= */

const COMPETITION_TYPES = {
  TEAM: "team",
  INDIVIDUAL: "individual"
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

let draftPerformanceId = null;

/* =========================================================
   HELPERS
   ========================================================= */

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
  D.active
    ? D.contestants?.[D.active]
    : null;

/* =========================================================
   CURRENT DRAFT TOTAL
   ========================================================= */

const T = () =>
  C.reduce(
    (total, [key]) =>
      total +
      (Number(draft[key]) || 0),
    0
  );

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

        competitionType:
          COMPETITION_TYPES.TEAM,

        active: null,

        contestants: {},

        judges: J,

        judgeCount: 5,

        teams: {},

        scores: {}
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

  const availableJudges =
    activeJudges();

  return `
    <div class="wrap">

      <div class="card hero">

        <div class="big">
          🎤
        </div>

        <h1>
          Royal Karaoke SKN
        </h1>

        <h2>
          100-Point Digital Judging System
        </h2>

        <p class="muted">
          ${E(
            competitionTypeLabel()
          )}
        </p>

        <p class="muted">
          Current competition:
          <b>
            ${judgeCount()} Judges
          </b>
        </p>

        <button
          id="aud"
          class="primary"
          type="button"
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

  const hasData =
    cs().length > 0 ||
    teams().length > 0 ||
    Object.keys(
      S()
    ).length > 0;

  return `
    <div class="card">

      <h2>
        ⚙️ Competition Settings
      </h2>

      <p>
        <b>
          Competition Type
        </b>
      </p>

      <div class="login-grid">

        <button
          id="competitionTeam"
          type="button"
          class="${
            isTeamMode()
              ? "primary"
              : ""
          }"
        >
          TEAM COMPETITION
        </button>

        <button
          id="competitionIndividual"
          type="button"
          class="${
            !isTeamMode()
              ? "primary"
              : ""
          }"
        >
          INDIVIDUAL COMPETITION
        </button>

      </div>

      <p>
        Current:
        <strong>
          ${E(
            competitionTypeLabel()
          )}
        </strong>
      </p>

      ${
        hasData
          ? `
            <p class="warn">
              Competition type is locked because
              registration or scoring has already started.
              Reset the competition before changing it.
            </p>
          `
          : `
            <p class="muted">
              Choose the competition type before
              registering contestants.
            </p>
          `
      }

      <hr>

      <p>
        <b>
          Number of Judges
        </b>
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
   RESET
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
        new competition.
      </p>

      <p class="muted">
        Resetting will permanently remove:
      </p>

      <ul>
        <li>All contestants</li>
        <li>All teams</li>
        <li>All performance numbers</li>
        <li>All judge scores</li>
        <li>The active performance</li>
      </ul>

      <p class="warn">
        The judges and judge count will remain.
        The competition type will return to Team Competition.
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

      ${activeJudges()
        .map(judge => {

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
                      ✓ Submitted —
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

        })
        .join("")}

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

  const rows =
    Array.from(
      { length: 5 },
      (_, index) => {

        const n =
          index + 1;

        return `
          <tr>

            <td>
              <strong>
                Member ${n}
              </strong>
            </td>

            <td>
              <input
                id="tmid${n}"
                placeholder="Member ID"
                maxlength="30"
              >
            </td>

            <td>
              <input
                id="tmname${n}"
                placeholder="Member Name"
                maxlength="100"
              >
            </td>

            <td>
              <select id="tmgender${n}">

                <option value="">
                  Gender
                </option>

                <option value="Male">
                  Male
                </option>

                <option value="Female">
                  Female
                </option>

              </select>
            </td>

            <td>
              <input
                id="tmsong${n}"
                placeholder="Individual Song"
                maxlength="150"
              >
            </td>

          </tr>
        `;
      }
    ).join("");

  return `
    <div class="card">

      <h2>
        👥 Register New Team
      </h2>

      <p class="muted">
        Each team must have five members.
        Every member receives an individual performance.
        Duets can be added separately after the team is created.
      </p>

      <div class="form-grid">

        <input
          id="teamId"
          placeholder="Team ID / Number"
          maxlength="30"
        >

        <input
          id="teamName"
          placeholder="Team Name"
          maxlength="80"
        >

      </div>

      <br>

      <div class="table-wrap">

        <table>

          <tr>

            <th>
              #
            </th>

            <th>
              Member ID
            </th>

            <th>
              Member Name
            </th>

            <th>
              Gender
            </th>

            <th>
              Individual Song
            </th>

          </tr>

          ${rows}

        </table>

      </div>

      <br>

      <button
        id="addTeamRoster"
        class="primary"
        type="button"
      >
        ADD TEAM & CREATE 5 INDIVIDUAL PERFORMANCES
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
        Registered Teams
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

  return `
    <div class="card">

      <h2>
        🎤 Register Individual Contestant
      </h2>

      <p class="muted">
        Performance numbers will be assigned later,
        after the random draw on competition night.
      </p>

      <div class="form-grid">

        <input
          id="individualId"
          placeholder="Contestant ID / Number"
          maxlength="30"
        >

        <input
          id="individualName"
          placeholder="Contestant Name"
          maxlength="100"
        >

        <select id="individualGender">

          <option value="">
            Select Gender
          </option>

          <option value="Male">
            Male
          </option>

          <option value="Female">
            Female
          </option>

        </select>

        <input
          id="individualSong"
          placeholder="Song"
          maxlength="150"
        >

      </div>

      <br>

      <button
        id="addIndividual"
        class="primary"
        type="button"
      >
        REGISTER INDIVIDUAL
      </button>

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
                    colspan="9"
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
    <h1>
      Registration & Draw
    </h1>

    <div class="card">

      <h2>
        ${E(
          competitionTypeLabel()
        )}
      </h2>

      ${
        isTeamMode()
          ? `
            <p>
              Register the teams and their five members
              before competition night.
            </p>

            <p class="muted">
              Each member automatically receives an
              individual performance. Additional duets
              can then be registered separately.
            </p>
          `
          : `
            <p>
              Register each contestant individually.
            </p>

            <p class="muted">
              Performance numbers are assigned later
              when the random draw is conducted.
            </p>
          `
      }

    </div>

    ${
      isTeamMode()
        ? `
          ${teamRegistration()}

          ${existingTeams()}

          ${duetRegistration()}
        `
        : `
          ${individualRegistration()}
        `
    }

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
   RESULTS
   ========================================================= */

function results() {

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
          result.avg
      };

    });

  const completeRows =
    rows.filter(
      x => x.complete
    );

  const sortByScore =
    (a, b) =>
      b.avg - a.avg;

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
        Number(x.avg || 0);

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
          ${winner.avg.toFixed(2)}
        </div>

        <p>
          /100
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

  page = "home";

  render();
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

  const first =
    confirm(
      "⚠️ RESET COMPETITION\n\n" +
      "This will permanently remove:\n\n" +
      "• All contestants\n" +
      "• All teams\n" +
      "• All performance numbers\n" +
      "• All judge scores\n" +
      "• The active performance\n\n" +
      "The judges and judge count will remain.\n\n" +
      "The competition type will return to Team Competition.\n\n" +
      "Do you want to continue?"
    );

  if (!first) {
    return;
  }

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

    await update(
      ref(db, "event"),
      {
        active: null,

        contestants: {},

        teams: {},

        scores: {},

        competitionType:
          COMPETITION_TYPES.TEAM
      }
    );

    role = null;

    jid = null;

    draft = {};

    submitting = false;

    draftPerformanceId =
      null;

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
   ADD TEAM WITH FIVE MEMBERS
   ========================================================= */

async function addTeamRoster() {

  const teamId =
    document
      .getElementById("teamId")
      ?.value
      .trim();

  const teamNameValue =
    document
      .getElementById("teamName")
      ?.value
      .trim();

  if (!teamId) {

    alert(
      "Enter a Team ID / Number."
    );

    return;
  }

  if (!teamNameValue) {

    alert(
      "Enter a team name."
    );

    return;
  }

  const duplicateTeamId =
    teams().some(
      team => {

        const existing =
          D.teams?.[team.id];

        const existingId =
          typeof existing === "object"
            ? existing.teamId
            : team.id;

        return (
          String(existingId || "")
            .toLowerCase() ===
          teamId.toLowerCase()
        );

      }
    );

  if (
    duplicateTeamId
  ) {

    alert(
      "That Team ID / Number is already in use."
    );

    return;
  }

  const duplicateTeamName =
    teams().some(
      team =>
        team.name
          .toLowerCase() ===
        teamNameValue.toLowerCase()
    );

  if (
    duplicateTeamName
  ) {

    alert(
      "That team name already exists."
    );

    return;
  }

  const members = [];

  for (
    let i = 1;
    i <= 5;
    i++
  ) {

    const memberId =
      document
        .getElementById(
          `tmid${i}`
        )
        ?.value
        .trim();

    const name =
      document
        .getElementById(
          `tmname${i}`
        )
        ?.value
        .trim();

    const gender =
      document
        .getElementById(
          `tmgender${i}`
        )
        ?.value;

    const song =
      document
        .getElementById(
          `tmsong${i}`
        )
        ?.value
        .trim();

    if (!memberId) {

      alert(
        `Enter the Member ID for Member ${i}.`
      );

      return;
    }

    if (!name) {

      alert(
        `Enter the name for Member ${i}.`
      );

      return;
    }

    if (
      !["Male", "Female"]
        .includes(gender)
    ) {

      alert(
        `Select the gender for Member ${i}.`
      );

      return;
    }

    if (!song) {

      alert(
        `Enter the individual song for Member ${i}.`
      );

      return;
    }

    members.push({
      memberId,
      name,
      gender,
      song
    });
  }

  /*
    Check duplicate member IDs
    within this team.
  */

  const ids =
    members.map(
      member =>
        member.memberId
          .toLowerCase()
    );

  if (
    new Set(ids).size !==
    ids.length
  ) {

    alert(
      "Each team member must have a unique Member ID."
    );

    return;
  }

  /*
    Check against existing teams.
  */

  const existingMemberIds = [];

  teams().forEach(
    team => {

      teamMembers(
        team.id
      ).forEach(
        member => {

          if (
            member.memberId
          ) {

            existingMemberIds.push(
              member.memberId
                .toLowerCase()
            );

          }

        }
      );

    }
  );

  const conflict =
    members.find(
      member =>
        existingMemberIds.includes(
          member.memberId
            .toLowerCase()
        )
    );

  if (conflict) {

    alert(
      `Member ID "${conflict.memberId}" is already registered on another team.`
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

    const teamKey =
      teamRef.key;

    const teamObject = {
      teamId,
      name:
        teamNameValue,
      createdAt:
        Date.now(),
      members: {}
    };

    const updates = {};

    /*
      Create the five team members.
    */

    members.forEach(
      (member, index) => {

        const memberRef =
          push(
            ref(
              db,
              `event/teams/${teamKey}/members`
            )
          );

        const memberKey =
          memberRef.key;

        teamObject.members[
          memberKey
        ] = {
          memberId:
            member.memberId,

          name:
            member.name,

          gender:
            member.gender,

          song:
            member.song
        };

        /*
          Automatically create each
          member's individual performance.
        */

        const performanceRef =
          push(
            ref(
              db,
              "event/contestants"
            )
          );

        const performanceId =
          performanceRef.key;

        updates[
          `event/contestants/${performanceId}`
        ] = {

          number: null,

          order: null,

          name:
            member.name,

          category:
            member.gender,

          song:
            member.song,

          teamId:
            teamKey,

          team:
            teamNameValue,

          memberIds:
            [memberKey],

          contestantId:
            member.memberId,

          memberId:
            member.memberId,

          performerType:
            "Individual",

          performanceType:
            "Individual",

          createdAt:
            Date.now() +
            index

        };

      }
    );

    /*
      Save team and all five
      performances atomically.
    */

    updates[
      `event/teams/${teamKey}`
    ] = teamObject;

    await update(
      ref(db),
      updates
    );

    alert(
      `Team "${teamNameValue}" registered successfully.\n\n` +
      "Five individual performances were automatically created.\n\n" +
      "You can now add any team duets."
    );

  } catch (error) {

    console.error(
      "Team registration error:",
      error
    );

    alert(
      "Could not register team.\n\n" +
      error.message
    );
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
   ADD INDIVIDUAL
   ========================================================= */

async function addIndividual() {

  const contestantId =
    document
      .getElementById(
        "individualId"
      )
      ?.value
      .trim();

  const name =
    document
      .getElementById(
        "individualName"
      )
      ?.value
      .trim();

  const gender =
    document
      .getElementById(
        "individualGender"
      )
      ?.value;

  const song =
    document
      .getElementById(
        "individualSong"
      )
      ?.value
      .trim();

  if (!contestantId) {

    alert(
      "Enter the Contestant ID / Number."
    );

    return;
  }

  if (!name) {

    alert(
      "Enter the contestant name."
    );

    return;
  }

  if (
    !["Male", "Female"]
      .includes(gender)
  ) {

    alert(
      "Select the contestant's gender."
    );

    return;
  }

  if (!song) {

    alert(
      "Enter the song."
    );

    return;
  }

  const duplicate =
    cs().some(
      contestant =>
        String(
          contestant.contestantId ||
          contestant.memberId ||
          ""
        ).toLowerCase() ===
        contestantId.toLowerCase()
    );

  if (duplicate) {

    alert(
      `Contestant ID "${contestantId}" is already registered.`
    );

    return;
  }

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

        name,

        category:
          gender,

        song,

        teamId:
          "",

        team:
          "",

        memberIds:
          [],

        contestantId,

        performerType:
          "Individual",

        performanceType:
          "Individual",

        createdAt:
          Date.now()

      }
    );

    alert(
      `Individual contestant "${name}" registered successfully.`
    );

  } catch (error) {

    alert(
      "Could not register individual contestant.\n\n" +
      error.message
    );
  }
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

function validateDraft() {

  for (
    const [key, label, max]
    of C
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
    T();

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

            role =
              "judge";

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
              D.active ||
              null;

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

    if (
      !jid ||
      !J[jid] ||
      J[jid].no >
        judgeCount()
    ) {

      logout();

      return;
    }

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

          if (
            !confirm(
              `Submit ${total}/${MAX_TOTAL}?\n\n` +
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

    return;
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

  wire();
}

/* =========================================================
   START APPLICATION
   ========================================================= */

start();

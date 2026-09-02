import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";

import {
  getDatabase,
  ref,
  set,
  onValue,
  runTransaction
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-database.js";

import {
  getAuth,
  signInAnonymously
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";

import { firebaseConfig } from "./firebase-config.js";

/* =========================================================
   ROYAL KARAOKE SKN
   JUDGE-ONLY SCORING SYSTEM
   ========================================================= */

const fb = initializeApp(firebaseConfig);
const db = getDatabase(fb);
const au = getAuth(fb);

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

/* =========================================================
   APPLICATION STATE
   ========================================================= */

const root = document.getElementById("app");

let D = {};

let judgeId = null;

let draft = {};

let draftPerformanceId = null;

let submitting = false;

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
   GET JUDGE FROM URL
   ========================================================= */

function getJudgeFromUrl() {

  const params =
    new URLSearchParams(
      window.location.search
    );

  const number =
    Number(
      params.get("judge")
    );

  if (
    number >= 1 &&
    number <= 5
  ) {

    return `j${number}`;

  }

  return null;
}

/* =========================================================
   NUMBER OF JUDGES
   ========================================================= */

function judgeCount() {

  const value =
    Number(D.judgeCount);

  return value === 3
    ? 3
    : 5;
}

/* =========================================================
   CURRENT JUDGE
   ========================================================= */

function currentJudge() {

  return J[judgeId] || null;

}

/* =========================================================
   IS JUDGE ACTIVE?
   ========================================================= */

function isJudgeActive() {

  const judge =
    currentJudge();

  if (!judge) {
    return false;
  }

  return (
    judge.no <=
    judgeCount()
  );

}

/* =========================================================
   ACTIVE CONTESTANT
   =========================================================

   IMPORTANT:

   Your existing app stores:

   event.active = contestant ID

   The actual contestant information is stored at:

   event.contestants[event.active]

   ========================================================= */

function activeContestant() {

  if (!D.active) {
    return null;
  }

  return (
    D.contestants?.[
      D.active
    ] || null
  );

}

/* =========================================================
   CURRENT SCORES
   ========================================================= */

function scoreData() {

  if (!D.active) {
    return null;
  }

  if (!D.scores) {
    return null;
  }

  return (
    D.scores?.[
      D.active
    ]?.[
      judgeId
    ] || null
  );

}

/* =========================================================
   TEAM NAME
   ========================================================= */

function getTeamName(contestant) {

  if (!contestant) {
    return "";
  }

  /*
    New format:
    contestant.team contains
    the actual team name.
  */

  if (
    contestant.team
  ) {

    return contestant.team;

  }

  /*
    Backup for teamId format.
  */

  if (
    contestant.teamId &&
    D.teams
  ) {

    const team =
      D.teams[
        contestant.teamId
      ];

    if (
      typeof team ===
      "string"
    ) {

      return team;

    }

    return (
      team?.name ||
      ""
    );

  }

  return "";

}

/* =========================================================
   CONTESTANT DISPLAY NAME
   ========================================================= */

function contestantDisplayName(
  contestant
) {

  if (!contestant) {
    return "";
  }

  if (
    contestant.category ===
      "Duet" &&
    contestant.name2
  ) {

    return (
      `${contestant.name} & ` +
      `${contestant.name2}`
    );

  }

  return contestant.name || "";

}

/* =========================================================
   TOTAL
   ========================================================= */

function totalScore() {

  return C.reduce(
    (total, item) => {

      const key =
        item[0];

      return (
        total +
        (
          Number(
            draft[key]
          ) || 0
        )
      );

    },
    0
  );

}

/* =========================================================
   HEADER
   ========================================================= */

function header() {

  const judge =
    currentJudge();

  return `
    <div class="header">

      <h1>
        ROYAL KARAOKE SKN
      </h1>

      <p>
        DIGITAL JUDGING SYSTEM
      </p>

      <div class="judge-badge">

        ${E(
          judge?.name ||
          "Judge"
        )}

      </div>

    </div>
  `;

}

/* =========================================================
   WAITING SCREEN
   ========================================================= */

function waiting() {

  root.innerHTML = `

    ${header()}

    <div class="card waiting">

      <h2>
        WAITING FOR PERFORMANCE
      </h2>

      <p>
        The Auditor has not yet activated
        a performance.
      </p>

      <p>
        When the Auditor activates the next
        performer, the information will
        appear here automatically.
      </p>

    </div>

  `;

}

/* =========================================================
   JUDGE NOT ACTIVE
   ========================================================= */

function inactive() {

  root.innerHTML = `

    <div class="header">

      <h1>
        ROYAL KARAOKE SKN
      </h1>

      <p>
        DIGITAL JUDGING SYSTEM
      </p>

    </div>

    <div class="card waiting">

      <h2>
        JUDGE NOT ACTIVE
      </h2>

      <p>
        This judge is not enabled for
        the current competition.
      </p>

      <p>
        Current competition:
        <strong>
          ${judgeCount()} Judges
        </strong>
      </p>

    </div>

  `;

}

/* =========================================================
   ERROR SCREEN
   ========================================================= */

function errorScreen(
  message
) {

  root.innerHTML = `

    <div class="header">

      <h1>
        ROYAL KARAOKE SKN
      </h1>

    </div>

    <div class="card waiting">

      <h2>
        CONNECTION ERROR
      </h2>

      <p>
        ${E(message)}
      </p>

    </div>

  `;

}

/* =========================================================
   SUBMITTED SCREEN
   ========================================================= */

function submittedScreen(
  contestant,
  score
) {

  const team =
    getTeamName(
      contestant
    );

  const name =
    contestantDisplayName(
      contestant
    );

  root.innerHTML = `

    ${header()}

    <div class="card submitted">

      <div class="performance-number">

        PERFORMANCE #
        ${E(
          contestant.number
        )}

      </div>

      <h2>
        SCORE SUBMITTED
      </h2>

      <div class="contestant-name">

        ${E(name)}

      </div>

      <div class="details">

        <div>
          <strong>
            Category:
          </strong>

          ${E(
            contestant.category
          )}
        </div>

        <div>
          <strong>
            Team:
          </strong>

          ${E(
            team ||
            "Unassigned"
          )}
        </div>

        <div>
          <strong>
            Song:
          </strong>

          ${E(
            contestant.song ||
            ""
          )}
        </div>

      </div>

      <div class="final-number">

        ${Number(
          score.total || 0
        ).toFixed(0)}

      </div>

      <p>
        / ${MAX_TOTAL}
      </p>

      <p>
        Your score has been recorded
        and is locked.
      </p>

      <p>
        Please wait for the next
        performance.
      </p>

    </div>

  `;

}

/* =========================================================
   SCORING SCREEN
   ========================================================= */

function scoringScreen(
  contestant
) {

  const team =
    getTeamName(
      contestant
    );

  const name =
    contestantDisplayName(
      contestant
    );

  const total =
    totalScore();

  const criteria =
    C.map(
      ([key, label, max]) => {

        const selected =
          Number(
            draft[key] ?? 0
          );

        let buttons = "";

        for (
          let n = 0;
          n <= max;
          n++
        ) {

          buttons += `

            <button
              class="score-btn ${
                selected === n
                  ? "selected"
                  : ""
              }"
              data-k="${E(key)}"
              data-n="${n}"
              type="button"
            >
              ${n}
            </button>

          `;

        }

        return `

          <div class="criterion">

            <div class="criterion-top">

              <div class="criterion-name">

                ${E(label)}

              </div>

              <div class="criterion-max">

                Max ${max}

              </div>

            </div>

            <div class="score-buttons">

              ${buttons}

            </div>

          </div>

        `;

      }
    ).join("");

  root.innerHTML = `

    ${header()}

    <div class="card">

      <div class="performance-number">

        PERFORMANCE #
        ${E(
          contestant.number
        )}

      </div>

      <div class="contestant-name">

        ${E(name)}

      </div>

      <div class="details">

        <div>

          <strong>
            Category:
          </strong>

          ${E(
            contestant.category
          )}

        </div>

        <div>

          <strong>
            Team:
          </strong>

          ${E(
            team ||
            "Unassigned"
          )}

        </div>

        <div>

          <strong>
            Song:
          </strong>

          ${E(
            contestant.song ||
            ""
          )}

        </div>

      </div>

      <div class="criteria">

        ${criteria}

      </div>

      <div class="total-box">

        <div class="total-label">

          CURRENT TOTAL

        </div>

        <div class="total-score">

          ${total} / ${MAX_TOTAL}

        </div>

      </div>

      <div
        class="status"
        id="status"
      ></div>

      <button
        class="submit-btn"
        id="submitScore"
        type="button"
      >

        SUBMIT SCORE

      </button>

    </div>

  `;

  wireScoring();

}

/* =========================================================
   WIRE SCORING BUTTONS
   ========================================================= */

function wireScoring() {

  document
    .querySelectorAll(
      ".score-btn"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () => {

            if (submitting) {
              return;
            }

            const key =
              button.dataset.k;

            const value =
              Number(
                button.dataset.n
              );

            const criterion =
              C.find(
                item =>
                  item[0] === key
              );

            if (!criterion) {
              return;
            }

            const max =
              criterion[2];

            if (
              value < 0 ||
              value > max
            ) {

              return;

            }

            draft[key] =
              value;

            scoringScreen(
              activeContestant()
            );

          }
        );

      }
    );

  document
    .getElementById(
      "submitScore"
    )
    ?.addEventListener(
      "click",
      submitScore
    );

}

/* =========================================================
   VALIDATE SCORE
   ========================================================= */

function validateScore() {

  for (
    const [
      key,
      label,
      max
    ] of C
  ) {

    if (
      draft[key] ===
      undefined
    ) {

      return {
        ok: false,

        message:
          `Please enter a score for ${label}.`
      };

    }

    const value =
      Number(
        draft[key]
      );

    if (
      !Number.isInteger(
        value
      ) ||
      value < 0 ||
      value > max
    ) {

      return {
        ok: false,

        message:
          `Invalid score for ${label}.`
      };

    }

  }

  return {
    ok: true,
    total: totalScore()
  };

}

/* =========================================================
   SUBMIT SCORE
   ========================================================= */

async function submitScore() {

  if (submitting) {
    return;
  }

  const contestant =
    activeContestant();

  if (!contestant) {

    alert(
      "There is no active performance."
    );

    return;

  }

  if (!judgeId) {

    alert(
      "Judge identification error."
    );

    return;

  }

  const validation =
    validateScore();

  if (!validation.ok) {

    const status =
      document.getElementById(
        "status"
      );

    if (status) {

      status.textContent =
        validation.message;

      status.className =
        "status error";

    }

    return;

  }

  const total =
    validation.total;

  const confirmed =
    confirm(
      `Submit ${total}/${MAX_TOTAL}?\n\n` +
      "This score will be permanently locked."
    );

  if (!confirmed) {
    return;
  }

  submitting = true;

  try {

    const activeId =
      D.active;

    const scoreRef =
      ref(
        db,
        `event/scores/${activeId}/${judgeId}`
      );

    const result =
      await runTransaction(
        scoreRef,
        current => {

          /*
            Do not overwrite an existing
            submitted score.
          */

          if (
            current !== null
          ) {

            return;

          }

          return {

            ...draft,

            total,

            judgeId,

            judgeNo:
              J[judgeId].no,

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

      submitting = false;

      processEvent();

      return;

    }

    draft = {};

    submitting = false;

    processEvent();

  } catch (error) {

    console.error(
      "Score submission error:",
      error
    );

    submitting = false;

    alert(
      "The score could not be submitted.\n\n" +
      error.message
    );

  }

}

/* =========================================================
   PROCESS FIREBASE EVENT
   ========================================================= */

function processEvent() {

  if (!isJudgeActive()) {

    inactive();

    return;

  }

  const contestant =
    activeContestant();

  /*
    No active contestant.
  */

  if (!contestant) {

    draft = {};

    draftPerformanceId =
      null;

    waiting();

    return;

  }

  /*
    Detect a NEW performance.
  */

  if (
    draftPerformanceId !==
    D.active
  ) {

    draft = {};

    draftPerformanceId =
      D.active;

  }

  /*
    Check whether this judge
    has already submitted.
  */

  const existing =
    scoreData();

  if (
    existing &&
    existing.submitted === true
  ) {

    submittedScreen(
      contestant,
      existing
    );

    return;

  }

  /*
    Otherwise show scoring.
  */

  scoringScreen(
    contestant
  );

}

/* =========================================================
   START
   ========================================================= */

async function start() {

  judgeId =
    getJudgeFromUrl();

  if (!judgeId) {

    errorScreen(
      "No valid judge number was supplied.\n\n" +
      "Use ?judge=1, ?judge=2, ?judge=3, etc."
    );

    return;

  }

  try {

    await signInAnonymously(
      au
    );

  } catch (error) {

    console.error(
      error
    );

    errorScreen(
      "Firebase authentication failed."
    );

    return;

  }

  onValue(
    ref(db, "event"),
    snapshot => {

      D =
        snapshot.val() || {};

      processEvent();

    },
    error => {

      console.error(
        error
      );

      errorScreen(
        error.message
      );

    }
  );

}

start();

import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";

import {
  getDatabase,
  ref,
  onValue,
  runTransaction
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

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);


// ============================================================
// JUDGING CRITERIA
// ============================================================

const C = [
  ["voiceManagement", "Voice Management", 10],
  ["voiceTiming", "Voice Timing", 20],
  ["costume", "Costume", 5],
  ["props", "Props", 5],
  ["performance", "Performance", 40],
  ["crowdResponse", "Crowd Response", 20]
];


// ============================================================
// JUDGES
// ============================================================

const J = {
  j1: { no: 1, name: "Judge 1" },
  j2: { no: 2, name: "Judge 2" },
  j3: { no: 3, name: "Judge 3" },
  j4: { no: 4, name: "Judge 4" },
  j5: { no: 5, name: "Judge 5" }
};


// ============================================================
// APPLICATION STATE
// ============================================================

let D = {};
let judgeId = null;
let draft = {};
let draftPerformanceId = null;
let submitting = false;


// ============================================================
// ELEMENT
// ============================================================

const appEl = document.getElementById("app");


// ============================================================
// JUDGE SELECTION
// ============================================================

function getSavedJudge() {

  const saved =
    sessionStorage.getItem("rk_current_judge");

  if (!saved) return null;

  const number = Number(saved);

  if (number >= 1 && number <= 5) {
    return number;
  }

  return null;
}


function saveJudge(number) {

  sessionStorage.setItem(
    "rk_current_judge",
    String(number)
  );
}


function clearJudge() {

  sessionStorage.removeItem(
    "rk_current_judge"
  );

  judgeId = null;
  draft = {};
  draftPerformanceId = null;
}


// ============================================================
// JUDGE COUNT
// ============================================================

function judgeCount() {

  return D.judgeCount === 3 ? 3 : 5;
}


// ============================================================
// CURRENT JUDGE
// ============================================================

function currentJudge() {

  if (!judgeId) return null;

  return J[`j${judgeId}`] || null;
}


// ============================================================
// CHECK IF JUDGE IS ACTIVE
// ============================================================

function isJudgeActive() {

  if (!judgeId) return false;

  return judgeId <= judgeCount();
}


// ============================================================
// ACTIVE CONTESTANT
// ============================================================

function activeContestant() {

  if (!D.active) return null;

  return D.contestants?.[D.active] || null;
}


// ============================================================
// SCORE DATA
// ============================================================

function scoreData() {

  if (!D.active || !judgeId) {
    return null;
  }

  return (
    D.scores?.[D.active]?.[`j${judgeId}`] ||
    null
  );
}


// ============================================================
// TEAM NAME
// ============================================================

function getTeamName(c) {

  if (!c) return "";

  if (c.team) return c.team;

  if (c.teamId && D.teams?.[c.teamId]) {

    const team = D.teams[c.teamId];

    if (typeof team === "string") {
      return team;
    }

    return team.name || "";
  }

  return "";
}


// ============================================================
// CONTESTANT DISPLAY NAME
// ============================================================

function contestantDisplayName(c) {

  if (!c) return "";

  if (
    c.category === "Duet" &&
    c.name2
  ) {

    return `${c.name} & ${c.name2}`;
  }

  return c.name || "";
}


// ============================================================
// TOTAL SCORE
// ============================================================

function totalScore() {

  return C.reduce(
    (sum, item) => {

      return (
        sum +
        Number(
          draft[item[0]] || 0
        )
      );

    },
    0
  );
}


// ============================================================
// MAIN RENDER
// ============================================================

function render() {

  // ----------------------------------------------------------
  // NO JUDGE SELECTED
  // ----------------------------------------------------------

  if (!judgeId) {

    renderJudgeSelection();

    return;
  }


  // ----------------------------------------------------------
  // INVALID / INACTIVE JUDGE
  // ----------------------------------------------------------

  if (!isJudgeActive()) {

    renderInactiveJudge();

    return;
  }


  const judge =
    currentJudge();

  const contestant =
    activeContestant();


  // ----------------------------------------------------------
  // HEADER
  // ----------------------------------------------------------

  let html = `

    <div class="header">

      <h1>ROYAL KARAOKE SKN</h1>

      <p>Judging System</p>

      <div class="judge-badge">
        JUDGE STATION ${judge.no}
      </div>

    </div>

  `;


  // ----------------------------------------------------------
  // NO ACTIVE PERFORMANCE
  // ----------------------------------------------------------

  if (!contestant) {

    html += `

      <div class="card waiting">

        <h2>
          WAITING FOR PERFORMANCE
        </h2>

        <p>
          The Auditor has not activated a contestant yet.
        </p>

        <p>
          Please wait for the next performance.
        </p>

        <button
          class="submit-btn"
          id="changeJudgeBtn"
          style="margin-top:25px;"
        >
          CHANGE JUDGE
        </button>

      </div>

    `;

    appEl.innerHTML = html;


    document
      .getElementById("changeJudgeBtn")
      ?.addEventListener(
        "click",
        () => {

          clearJudge();

          render();

        }
      );

    return;
  }


  // ----------------------------------------------------------
  // EXISTING SCORE
  // ----------------------------------------------------------

  const existingScore =
    scoreData();


  // ----------------------------------------------------------
  // ALREADY SUBMITTED
  // ----------------------------------------------------------

  if (
    existingScore &&
    existingScore.submitted
  ) {

    html += `

      <div class="card submitted">

        <h2>
          SCORE SUBMITTED
        </h2>

        <p>
          ${escapeHtml(
            contestantDisplayName(
              contestant
            )
          )}
        </p>

        <div class="final-number">
          ${Number(
            existingScore.total || 0
          )}
        </div>

        <p>
          Your score has been recorded successfully.
        </p>

      </div>

    `;

    appEl.innerHTML = html;

    return;
  }


  // ----------------------------------------------------------
  // START NEW DRAFT
  // ----------------------------------------------------------

  if (
    draftPerformanceId !== D.active
  ) {

    draft = {};

    draftPerformanceId =
      D.active;
  }


  // ----------------------------------------------------------
  // SCORING SCREEN
  // ----------------------------------------------------------

  html += `

    <div class="card">

      <div class="performance-number">
        PERFORMANCE #${escapeHtml(
          String(
            contestant.number || ""
          )
        )}
      </div>

      <div class="contestant-name">
        ${escapeHtml(
          contestantDisplayName(
            contestant
          )
        )}
      </div>

      <div class="details">

        ${
          contestant.category
            ? `
              <span class="detail-pill">
                ${escapeHtml(
                  contestant.category
                )}
              </span>
            `
            : ""
        }

        ${
          getTeamName(contestant)
            ? `
              <span class="detail-pill">
                Team:
                ${escapeHtml(
                  getTeamName(contestant)
                )}
              </span>
            `
            : ""
        }

        ${
          contestant.song
            ? `
              <span class="detail-pill">
                ${escapeHtml(
                  contestant.song
                )}
              </span>
            `
            : ""
        }

      </div>


      <div class="criteria">
  `;


  // ----------------------------------------------------------
  // CRITERIA
  // ----------------------------------------------------------

  C.forEach(
    ([key, label, max]) => {

      html += `

        <div class="criterion">

          <div class="criterion-top">

            <div class="criterion-name">
              ${escapeHtml(label)}
            </div>

            <div class="criterion-max">
              Max ${max}
            </div>

          </div>

          <div class="score-buttons">
      `;


      for (
        let i = 0;
        i <= max;
        i++
      ) {

        const selected =
          Number(
            draft[key]
          ) === i
            ? "selected"
            : "";


        html += `

          <button
            class="score-btn ${selected}"
            data-criterion="${key}"
            data-score="${i}"
            type="button"
          >
            ${i}
          </button>

        `;
      }


      html += `

          </div>

        </div>

      `;
    }
  );


  // ----------------------------------------------------------
  // TOTAL
  // ----------------------------------------------------------

  html += `

      </div>

      <div class="total-box">

        <div class="total-label">
          CURRENT TOTAL
        </div>

        <div
          class="total-score"
          id="totalScore"
        >
          ${totalScore()}
        </div>

      </div>

      <div
        class="status"
        id="status"
      ></div>


      <button
        class="submit-btn"
        id="submitBtn"
        type="button"
      >
        SUBMIT SCORE
      </button>


      <button
        class="submit-btn"
        id="changeJudgeBtn"
        type="button"
        style="
          background:#333;
          color:#fff;
          margin-top:10px;
        "
      >
        CHANGE JUDGE
      </button>

    </div>

  `;


  appEl.innerHTML = html;


  // ----------------------------------------------------------
  // SCORE BUTTONS
  // ----------------------------------------------------------

  document
    .querySelectorAll(".score-btn")
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () => {

            const criterion =
              button.dataset.criterion;

            const score =
              Number(
                button.dataset.score
              );

            draft[criterion] =
              score;

            render();

          }
        );

      }
    );


  // ----------------------------------------------------------
  // SUBMIT
  // ----------------------------------------------------------

  document
    .getElementById("submitBtn")
    ?.addEventListener(
      "click",
      submitScore
    );


  // ----------------------------------------------------------
  // CHANGE JUDGE
  // ----------------------------------------------------------

  document
    .getElementById("changeJudgeBtn")
    ?.addEventListener(
      "click",
      () => {

        if (
          Object.keys(draft).length > 0 &&
          !scoreData()?.submitted
        ) {

          const confirmed =
            confirm(
              "Changing judge will discard the current unsent score. Continue?"
            );

          if (!confirmed) return;
        }

        clearJudge();

        render();

      }
    );
}


// ============================================================
// JUDGE SELECTION SCREEN
// ============================================================

function renderJudgeSelection() {

  const count =
    judgeCount();


  let html = `

    <div class="header">

      <h1>ROYAL KARAOKE SKN</h1>

      <p>Judging System</p>

      <div class="judge-badge">
        JUDGE SELECTION
      </div>

    </div>


    <div class="card judge-selection-card">


      <div class="selection-icon">
        ★
      </div>


      <div class="selection-title">
        SELECT YOUR JUDGE NUMBER
      </div>


      <div class="selection-subtitle">

        Please select the judge number
        assigned to you for this competition.

      </div>


      <div class="judge-selection-buttons">
  `;


  for (
    let i = 1;
    i <= count;
    i++
  ) {

    html += `

      <button
        type="button"
        class="judge-selection-btn"
        data-judge="${i}"
      >

        <span class="judge-number">
          ${i}
        </span>

        <span class="judge-label">
          JUDGE ${i}
        </span>

        <span class="judge-arrow">
          ›
        </span>

      </button>

    `;
  }


  html += `

      </div>


      <div class="selection-footer">

        <span class="active-dot"></span>

        ${count}
        judges currently active

      </div>


    </div>

  `;


  appEl.innerHTML =
    html;


  document
    .querySelectorAll(
      ".judge-selection-btn"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () => {

            const number =
              Number(
                button.dataset.judge
              );


            if (
              number < 1 ||
              number > judgeCount()
            ) {

              return;
            }


            judgeId =
              number;


            saveJudge(
              number
            );


            draft = {};

            draftPerformanceId =
              null;


            render();

          }
        );

      }
    );
}


// ============================================================
// INACTIVE JUDGE
// ============================================================

function renderInactiveJudge() {

  appEl.innerHTML = `

    <div class="header">

      <h1>ROYAL KARAOKE SKN</h1>

      <p>Judging System</p>

      <div class="judge-badge">
        JUDGE ${judgeId}
      </div>

    </div>


    <div class="card waiting">

      <h2>
        JUDGE NOT ACTIVE
      </h2>

      <p>

        Judge ${judgeId}
        is not currently active
        in this competition.

      </p>


      <button
        class="submit-btn"
        id="changeJudgeBtn"
      >
        SELECT ANOTHER JUDGE
      </button>

    </div>

  `;


  document
    .getElementById(
      "changeJudgeBtn"
    )
    ?.addEventListener(
      "click",
      () => {

        clearJudge();

        render();

      }
    );
}


// ============================================================
// SUBMIT SCORE
// ============================================================

async function submitScore() {

  if (submitting) return;


  const contestant =
    activeContestant();


  if (!contestant) {

    alert(
      "There is no active contestant."
    );

    return;
  }


  // ----------------------------------------------------------
  // VALIDATE ALL CRITERIA
  // ----------------------------------------------------------

  for (
    const [key, label] of C
  ) {

    if (
      draft[key] === undefined ||
      draft[key] === null ||
      draft[key] === ""
    ) {

      alert(
        `Please enter a score for ${label}.`
      );

      return;
    }
  }


  const activeId =
    D.active;


  if (
    !activeId ||
    !judgeId
  ) {

    alert(
      "Unable to identify the performance or judge."
    );

    return;
  }


  const total =
    totalScore();


  submitting = true;


  const submitButton =
    document.getElementById(
      "submitBtn"
    );


  if (submitButton) {

    submitButton.disabled =
      true;

    submitButton.textContent =
      "SUBMITTING...";
  }


  try {

    const scoreRef =
      ref(
        db,
        `event/scores/${activeId}/j${judgeId}`
      );


    const result =
      await runTransaction(
        scoreRef,
        current => {

          // Never overwrite an existing score
          if (current !== null) {
            return;
          }


          return {

            ...draft,

            total,

            judgeId:
              `j${judgeId}`,

            judgeNo:
              judgeId,

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
        "This performance has already been scored by this judge."
      );

      submitting =
        false;

      return;
    }


    submitting =
      false;


    draft = {};


    render();


  } catch (error) {

    console.error(error);


    submitting =
      false;


    if (submitButton) {

      submitButton.disabled =
        false;

      submitButton.textContent =
        "SUBMIT SCORE";
    }


    alert(
      "There was a problem submitting the score. Please try again."
    );
  }
}


// ============================================================
// ESCAPE HTML
// ============================================================

function escapeHtml(value) {

  return String(
    value ?? ""
  )
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    )
    .replace(
      /'/g,
      "&#039;"
    );
}


// ============================================================
// FIREBASE EVENT PROCESSING
// ============================================================

function processEvent(data) {

  D =
    data || {};


  // Make sure the saved judge is still valid
  if (
    judgeId &&
    judgeId > judgeCount()
  ) {

    clearJudge();
  }


  render();
}


// ============================================================
// START
// ============================================================

async function start() {

  try {

    await signInAnonymously(
      auth
    );


    const savedJudge =
      getSavedJudge();


    if (savedJudge) {

      judgeId =
        savedJudge;
    }


    const eventRef =
      ref(
        db,
        "event"
      );


    onValue(
      eventRef,

      snapshot => {

        processEvent(
          snapshot.val()
        );

      },

      error => {

        console.error(error);


        appEl.innerHTML = `

          <div class="card waiting">

            <h2>
              CONNECTION ERROR
            </h2>

            <p>
              Unable to connect to the judging system.
            </p>

            <p>
              Please check the tablet's internet connection.
            </p>

          </div>

        `;

      }
    );


  } catch (error) {

    console.error(error);


    appEl.innerHTML = `

      <div class="card waiting">

        <h2>
          UNABLE TO START
        </h2>

        <p>
          The judging system could not connect.
        </p>

        <p>
          Please check the internet connection and try again.
        </p>

      </div>

    `;
  }
}


start();

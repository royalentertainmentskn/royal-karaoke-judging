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

import { firebaseConfig } from "./firebase-config.js";

const root = document.getElementById("app");

root.innerHTML = `
  <div style="
    min-height:100vh;
    display:flex;
    align-items:center;
    justify-content:center;
    background:#000;
    color:#d4af37;
    font-family:Arial,sans-serif;
    text-align:center;
  ">
    <div>
      <h1>ROYAL KARAOKE SKN</h1>
      <p style="color:white">Loading judging system...</p>
    </div>
  </div>
`;

let app;
let db;
let auth;

try {
  app = initializeApp(firebaseConfig);
  db = getDatabase(app);
  auth = getAuth(app);
} catch (error) {
  console.error(error);
  root.innerHTML = `
    <div class="card">
      <h2>System Error</h2>
      <p>Unable to initialize Firebase.</p>
      <pre>${error.message}</pre>
    </div>
  `;
}

let D = null;

let role = localStorage.getItem("rk_role") || null;
let jid = localStorage.getItem("rk_judge") || null;
let page = "home";

let draft = {};
let submitting = false;
let draftPerformanceId = null;

/* =========================================================
   JUDGING CRITERIA
========================================================= */

const CRITERIA = {
  "Voice Management": 10,
  "Voice Timing": 20,
  "Costume": 5,
  "Props": 5,
  "Performance": 40,
  "Crowd Response": 20
};

const JUDGES = {
  j1: "Judge 1",
  j2: "Judge 2",
  j3: "Judge 3",
  j4: "Judge 4",
  j5: "Judge 5"
};

const CATEGORIES = [
  "Male",
  "Female",
  "Duet",
  "Team"
];

/* =========================================================
   DEFAULT EVENT
========================================================= */

function defaultEvent() {
  return {
    name: "Royal Karaoke SKN Championship",
    venue: "Venue TBD",
    date: "2026-09-27",

    active: null,
    finalized: false,

    judgeCount: 3,

    competitionType: "Combined",

    judges: JUDGES,

    contestants: {},
    scores: {}
  };
}

/* =========================================================
   HELPERS
========================================================= */

function judgeCount() {
  return Number(D?.judgeCount || 3);
}

function enabledJudges() {
  return Object.keys(JUDGES).slice(0, judgeCount());
}

function contestants() {
  return Object.values(D?.contestants || {})
    .sort((a, b) => Number(a.draw || 999999) - Number(b.draw || 999999));
}

function performanceList() {
  return contestants().sort((a, b) => {
    const ao = a.performanceOrder == null ? 999999 : Number(a.performanceOrder);
    const bo = b.performanceOrder == null ? 999999 : Number(b.performanceOrder);

    if (ao !== bo) return ao - bo;

    return Number(a.draw || 999999) - Number(b.draw || 999999);
  });
}

function scores() {
  return Object.values(D?.scores || {});
}

function activeContestant() {
  if (!D?.active) return null;
  return D?.contestants?.[D.active] || null;
}

function totalDraft() {
  return Object.values(draft).reduce((sum, value) => {
    return sum + Number(value || 0);
  }, 0);
}

function performanceScore(id) {
  const rows = scores().filter(s => s.performanceId === id);

  if (!rows.length) return null;

  const total = rows.reduce((sum, s) => sum + Number(s.total || 0), 0);

  return total / rows.length;
}

function scoreCount(id) {
  return scores().filter(s => s.performanceId === id).length;
}

function allowedCategories() {
  const type = D?.competitionType || "Combined";

  if (type === "Individual") {
    return ["Male", "Female", "Duet"];
  }

  if (type === "Team") {
    return ["Team"];
  }

  return CATEGORIES;
}

function categoryAllowed(category) {
  return allowedCategories().includes(category);
}

function nextDrawNumber() {
  const nums = contestants()
    .map(c => Number(c.draw))
    .filter(n => Number.isFinite(n));

  return nums.length ? Math.max(...nums) + 1 : 1;
}

function padNumber(n) {
  return String(n).padStart(3, "0");
}

function participantNames(c) {
  if (Array.isArray(c?.participants) && c.participants.length) {
    return c.participants.map(p => p.name).join(" & ");
  }

  return c?.name || "";
}

function participantNumbers(c) {
  if (Array.isArray(c?.participants) && c.participants.length) {
    return c.participants.map(p => p.number).join(", ");
  }

  return c?.number || "";
}

function performanceLabel(c) {
  if (!c) return "";

  if (c.category === "Team") {
    return `${c.teamName || c.name} — ${c.performanceType || "Team Performance"}`;
  }

  return c.name || participantNames(c);
}

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* =========================================================
   LOGOUT / ROLE CONTROL
========================================================= */

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

/*
  Requested RETURN TO AUDITOR button.

  This takes the current device directly back to the
  Auditor dashboard instead of leaving the user trapped
  on the WAITING FOR AUDITOR screen.
*/
function returnToAuditor() {
  localStorage.setItem("rk_role", "auditor");
  localStorage.removeItem("rk_judge");

  role = "auditor";
  jid = null;
  page = "home";

  draft = {};
  draftPerformanceId = null;

  render();
}

/* =========================================================
   HEADER / NAVIGATION
========================================================= */

function head(title = "") {
  return `
    <header style="
      background:#000;
      border-bottom:2px solid #d4af37;
      padding:18px;
      text-align:center;
    ">
      <div style="
        color:#d4af37;
        font-size:28px;
        font-weight:bold;
        letter-spacing:2px;
      ">
        ROYAL KARAOKE SKN
      </div>

      <div style="
        color:white;
        margin-top:5px;
        font-size:14px;
      ">
        ${escapeHTML(D?.name || "Championship Judging System")}
      </div>

      ${
        title
          ? `<div style="color:#d4af37;margin-top:8px;font-size:18px">${escapeHTML(title)}</div>`
          : ""
      }
    </header>
  `;
}

function nav() {
  return `
    <nav style="
      display:flex;
      flex-wrap:wrap;
      gap:8px;
      padding:12px;
      background:#111;
      border-bottom:1px solid #d4af37;
      justify-content:center;
    ">
      <button class="btn" data-page="home">Dashboard</button>
      <button class="btn" data-page="contestants">Registration</button>
      <button class="btn" data-page="draw">Draw & Order</button>
      <button class="btn" data-page="live">Live</button>
      <button class="btn" data-page="results">Results</button>
      <button class="btn" data-page="settings">Settings</button>
      <button class="btn" id="logout">Logout</button>
    </nav>
  `;
}

/* =========================================================
   LOGIN
========================================================= */

function login() {
  return `
    <div style="
      min-height:100vh;
      background:#000;
      color:white;
      display:flex;
      align-items:center;
      justify-content:center;
      padding:20px;
      box-sizing:border-box;
    ">
      <div style="
        width:min(500px,100%);
        background:#111;
        border:2px solid #d4af37;
        border-radius:16px;
        padding:30px;
        text-align:center;
        box-sizing:border-box;
      ">

        <div style="
          color:#d4af37;
          font-size:34px;
          font-weight:bold;
          letter-spacing:2px;
        ">
          ROYAL KARAOKE SKN
        </div>

        <div style="color:white;margin:10px 0 30px">
          Digital Judging System
        </div>

        <button
          class="btn"
          id="auditorLogin"
          style="width:100%;margin-bottom:12px"
        >
          AUDITOR
        </button>

        <div style="
          color:#d4af37;
          font-weight:bold;
          margin:20px 0 10px;
        ">
          SELECT JUDGE
        </div>

        <div style="
          display:grid;
          grid-template-columns:repeat(2,1fr);
          gap:10px;
        ">
          ${enabledJudges().map(id => `
            <button
              class="btn"
              data-judge="${id}"
            >
              ${JUDGES[id]}
            </button>
          `).join("")}
        </div>

      </div>
    </div>
  `;
}

/* =========================================================
   AUDITOR DASHBOARD
========================================================= */

function dashboard() {
  const active = activeContestant();

  return `
    ${head("AUDITOR DASHBOARD")}
    ${nav()}

    <main class="container">

      <div class="card">
        <h2>Competition</h2>

        <p><strong>Name:</strong> ${escapeHTML(D?.name)}</p>
        <p><strong>Venue:</strong> ${escapeHTML(D?.venue)}</p>
        <p><strong>Date:</strong> ${escapeHTML(D?.date)}</p>

        <p>
          <strong>Competition Type:</strong>
          ${escapeHTML(D?.competitionType || "Combined")}
        </p>

        <p>
          <strong>Judges:</strong>
          ${judgeCount()}
        </p>

        <p>
          <strong>Registered Entries:</strong>
          ${contestants().length}
        </p>
      </div>

      <div class="card">
        <h2>Current Performance</h2>

        ${
          active
            ? `
              <h3 style="color:#d4af37">
                Performance #${active.performanceOrder ?? "—"}
              </h3>

              <p>
                <strong>Draw Number:</strong>
                ${padNumber(active.draw)}
              </p>

              <p>
                <strong>${escapeHTML(performanceLabel(active))}</strong>
              </p>

              <p>
                <strong>Category:</strong>
                ${escapeHTML(active.category)}
              </p>

              <p>
                <strong>Song:</strong>
                ${escapeHTML(active.song || "—")}
              </p>

              <p>
                <strong>Scores Received:</strong>
                ${scoreCount(active.id)} / ${judgeCount()}
              </p>

              ${
                scoreCount(active.id)
                  ? `<p><strong>Current Average:</strong> ${performanceScore(active.id).toFixed(2)}</p>`
                  : ""
              }

              <button
                class="btn danger"
                id="endActive"
              >
                END CURRENT PERFORMANCE
              </button>
            `
            : `
              <p style="color:#ccc">
                No performance is currently active.
              </p>
            `
        }
      </div>

      <div class="card">
        <h2>Quick Actions</h2>

        <div style="
          display:grid;
          grid-template-columns:repeat(auto-fit,minmax(180px,1fr));
          gap:10px;
        ">
          <button class="btn" data-page="contestants">
            REGISTRATION
          </button>

          <button class="btn" data-page="draw">
            DRAW & ORDER
          </button>

          <button class="btn" data-page="live">
            LIVE MONITOR
          </button>

          <button class="btn" data-page="results">
            RESULTS
          </button>
        </div>
      </div>

      <div class="card">
        <h2>Performance Control</h2>

        <select id="activeSelect" class="input">
          <option value="">Select Performance</option>

          ${performanceList()
            .filter(c => categoryAllowed(c.category))
            .map(c => `
              <option
                value="${escapeHTML(c.id)}"
                ${D?.active === c.id ? "selected" : ""}
              >
                ${
                  c.performanceOrder != null
                    ? `#${c.performanceOrder} — `
                    : "NO ORDER — "
                }
                Draw ${padNumber(c.draw)} —
                ${escapeHTML(performanceLabel(c))}
                —
                ${escapeHTML(c.category)}
              </option>
            `)
            .join("")}
        </select>

        <button
          class="btn"
          id="activateSelected"
          style="margin-top:10px"
        >
          ACTIVATE PERFORMANCE
        </button>
      </div>

    </main>
  `;
}

/* =========================================================
   REGISTRATION PAGE
========================================================= */

function contestantsPage() {

  const allowed = allowedCategories();

  return `
    ${head("REGISTRATION")}
    ${nav()}

    <main class="container">

      <div class="card">
        <h2>Competition Registration</h2>

        <p style="color:#ccc">
          Registration numbers are assigned automatically.
          Performance order is entered separately after the
          physical draw on competition night.
        </p>

        <div class="form-grid">

          <div>
            <label>Registration Type</label>

            <select id="regType" class="input">
              ${allowed.map(c => `
                <option value="${c}">
                  ${c === "Team" ? "TEAM — 5 MEMBERS" : c}
                </option>
              `).join("")}
            </select>
          </div>

          <div>
            <label>Song</label>
            <input
              id="newSong"
              class="input"
              placeholder="Song title"
            >
          </div>

        </div>

        <div id="registrationFields" style="margin-top:15px"></div>

        <button
          class="btn"
          id="registerContestant"
          style="margin-top:15px"
        >
          REGISTER
        </button>
      </div>

      <div class="card">
        <h2>Registered Entries</h2>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Draw #</th>
                <th>Team / Participant</th>
                <th>Numbers</th>
                <th>Category</th>
                <th>Song</th>
                <th>Order</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>

              ${
                contestants().length
                  ? contestants().map(c => `
                    <tr>

                      <td>
                        <strong>${padNumber(c.draw)}</strong>
                      </td>

                      <td>
                        ${escapeHTML(performanceLabel(c))}
                      </td>

                      <td>
                        ${escapeHTML(participantNumbers(c) || "—")}
                      </td>

                      <td>
                        ${escapeHTML(c.category)}
                      </td>

                      <td>
                        ${escapeHTML(c.song || "—")}
                      </td>

                      <td>
                        ${
                          c.performanceOrder == null
                            ? `<span style="color:#999">Not Set</span>`
                            : `<strong>${c.performanceOrder}</strong>`
                        }
                      </td>

                      <td>
                        <button
                          class="btn danger"
                          data-delete="${c.id}"
                        >
                          DELETE
                        </button>
                      </td>

                    </tr>
                  `).join("")
                  : `
                    <tr>
                      <td colspan="7" style="text-align:center">
                        No registrations yet.
                      </td>
                    </tr>
                  `
              }

            </tbody>
          </table>
        </div>
      </div>

    </main>
  `;
}

/* =========================================================
   REGISTRATION FORM
========================================================= */

function registrationFields(type) {

  if (type === "Male" || type === "Female") {

    return `
      <div>
        <label>
          ${type} Singer Name
        </label>

        <input
          id="singleName"
          class="input"
          placeholder="Full name"
        >
      </div>
    `;
  }

  if (type === "Duet") {

    return `
      <div class="form-grid">

        <div>
          <label>Duet Singer 1</label>
          <input
            id="duet1"
            class="input"
            placeholder="First singer"
          >
        </div>

        <div>
          <label>Duet Singer 2</label>
          <input
            id="duet2"
            class="input"
            placeholder="Second singer"
          >
        </div>

      </div>
    `;
  }

  if (type === "Team") {

    return `
      <div>

        <label>Team Name</label>

        <input
          id="teamName"
          class="input"
          placeholder="Team name"
        >

        <h3 style="color:#d4af37;margin-top:20px">
          FIVE TEAM MEMBERS
        </h3>

        <div class="form-grid">

          ${[1,2,3,4,5].map(i => `
            <div>
              <label>Member ${i}</label>

              <input
                id="member${i}"
                class="input"
                placeholder="Member ${i} name"
              >

              <select
                id="member${i}Gender"
                class="input"
                style="margin-top:6px"
              >
                <option value="">Gender</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </select>
            </div>
          `).join("")}

        </div>

        <div style="
          margin-top:15px;
          padding:12px;
          border:1px solid #d4af37;
          border-radius:8px;
          color:#fff;
        ">
          <strong style="color:#d4af37">
            TEAM DUET
          </strong>

          <p style="margin-bottom:0;color:#ccc">
            The duet will be selected from the five team members
            and will receive its own performance entry and 100-point score.
          </p>

          <div class="form-grid" style="margin-top:10px">

            <div>
              <label>Duet Member 1</label>

              <select id="teamDuet1" class="input">
                <option value="">Select member</option>
                ${[1,2,3,4,5].map(i => `
                  <option value="${i}">
                    Member ${i}
                  </option>
                `).join("")}
              </select>
            </div>

            <div>
              <label>Duet Member 2</label>

              <select id="teamDuet2" class="input">
                <option value="">Select member</option>
                ${[1,2,3,4,5].map(i => `
                  <option value="${i}">
                    Member ${i}
                  </option>
                `).join("")}
              </select>
            </div>

          </div>
        </div>

      </div>
    `;
  }

  return "";
}

/* =========================================================
   REGISTER
========================================================= */

async function registerContestant() {

  const type = document.getElementById("regType")?.value;
  const song = document.getElementById("newSong")?.value.trim();

  if (!type) {
    alert("Please select a registration type.");
    return;
  }

  if (!song) {
    alert("Please enter the song title.");
    return;
  }

  const draw = nextDrawNumber();
  const baseNumber = padNumber(draw);

  let entry = {
    id: "c_" + Date.now() + "_" + Math.random().toString(36).slice(2),
    draw,
    registrationNumber: baseNumber,
    performanceOrder: null,
    category: type,
    song,
    registeredAt: Date.now()
  };

  /* ---------------- INDIVIDUAL ---------------- */

  if (type === "Male" || type === "Female") {

    const name = document.getElementById("singleName")?.value.trim();

    if (!name) {
      alert("Please enter the singer's name.");
      return;
    }

    entry.name = name;

    entry.number = baseNumber;

    entry.participants = [
      {
        number: baseNumber,
        name,
        gender: type
      }
    ];

    await set(ref(db, `event/contestants/${entry.id}`), entry);

    alert(
      `${type} singer registered.\n\n` +
      `Registration Number: ${baseNumber}\n` +
      `Participant Number: ${baseNumber}`
    );

    render();
    return;
  }

  /* ---------------- DUET ---------------- */

  if (type === "Duet") {

    const name1 = document.getElementById("duet1")?.value.trim();
    const name2 = document.getElementById("duet2")?.value.trim();

    if (!name1 || !name2) {
      alert("Please enter both duet singers.");
      return;
    }

    entry.name = `${name1} & ${name2}`;

    entry.number = baseNumber;

    entry.participants = [
      {
        number: `${baseNumber}-1`,
        name: name1
      },
      {
        number: `${baseNumber}-2`,
        name: name2
      }
    ];

    await set(ref(db, `event/contestants/${entry.id}`), entry);

    alert(
      `Duet registered.\n\n` +
      `Duet Number: ${baseNumber}\n` +
      `${name1}: ${baseNumber}-1\n` +
      `${name2}: ${baseNumber}-2`
    );

    render();
    return;
  }

  /* ---------------- TEAM ---------------- */

  if (type === "Team") {

    const teamName =
      document.getElementById("teamName")?.value.trim();

    if (!teamName) {
      alert("Please enter the team name.");
      return;
    }

    const members = [];

    for (let i = 1; i <= 5; i++) {

      const name =
        document.getElementById(`member${i}`)?.value.trim();

      const gender =
        document.getElementById(`member${i}Gender`)?.value;

      if (!name) {
        alert(`Please enter the name of Member ${i}.`);
        return;
      }

      if (!gender) {
        alert(`Please select the gender of Member ${i}.`);
        return;
      }

      members.push({
        number: `${baseNumber}-${i}`,
        name,
        gender
      });
    }

    const duet1 =
      document.getElementById("teamDuet1")?.value;

    const duet2 =
      document.getElementById("teamDuet2")?.value;

    if (!duet1 || !duet2) {
      alert("Please select the two team members who will perform the duet.");
      return;
    }

    if (duet1 === duet2) {
      alert("The two duet members must be different.");
      return;
    }

    const duetMembers = [
      members[Number(duet1) - 1],
      members[Number(duet2) - 1]
    ];

    /*
      TEAM REGISTRATION ENTRY

      The team itself gets its own number.
      Each of the five members gets an individual number.

      The six performances are created separately below.
    */

    entry.name = teamName;
    entry.teamName = teamName;
    entry.teamNumber = baseNumber;

    entry.participants = members;

    entry.teamMembers = members;

    entry.duet = {
      participants: duetMembers.map(m => ({
        number: m.number,
        name: m.name,
        gender: m.gender
      }))
    };

    /*
      The team registration is stored as the parent record.
    */

    await set(
      ref(db, `event/contestants/${entry.id}`),
      entry
    );

    /*
      Create the five individual performances.
    */

    const performanceEntries = [];

    for (let i = 0; i < members.length; i++) {

      const member = members[i];

      const performanceId =
        `${entry.id}_member_${i + 1}`;

      const performance = {
        id: performanceId,

        draw: draw,

        registrationNumber: baseNumber,

        performanceOrder: null,

        category: member.gender,

        performanceType: "Team Individual",

        teamId: entry.id,

        teamName,

        teamNumber: baseNumber,

        memberNumber: member.number,

        name: member.name,

        song,

        participants: [
          {
            number: member.number,
            name: member.name,
            gender: member.gender
          }
        ],

        registeredAt: Date.now()
      };

      performanceEntries.push(performance);

      await set(
        ref(db, `event/contestants/${performanceId}`),
        performance
      );
    }

    /*
      Create the sixth performance — the team duet.
    */

    const duetPerformanceId =
      `${entry.id}_duet`;

    const duetPerformance = {

      id: duetPerformanceId,

      draw,

      registrationNumber: baseNumber,

      performanceOrder: null,

      category: "Duet",

      performanceType: "Team Duet",

      teamId: entry.id,

      teamName,

      teamNumber: baseNumber,

      name:
        `${duetMembers[0].name} & ${duetMembers[1].name}`,

      song,

      participants: duetMembers.map(m => ({
        number: m.number,
        name: m.name,
        gender: m.gender
      })),

      registeredAt: Date.now()
    };

    performanceEntries.push(duetPerformance);

    await set(
      ref(
        db,
        `event/contestants/${duetPerformanceId}`
      ),
      duetPerformance
    );

    /*
      The parent team registration is marked as a team
      registration record, but the six actual performances
      are what the Auditor activates and judges.
    */

    await update(
      ref(db, `event/contestants/${entry.id}`),
      {
        registrationOnly: true,
        performanceIds:
          performanceEntries.map(p => p.id)
      }
    );

    alert(
      `TEAM REGISTERED SUCCESSFULLY\n\n` +
      `Team: ${teamName}\n` +
      `Team Number: ${baseNumber}\n\n` +
      `5 individual performances + 1 duet = 6 performances\n\n` +
      `Each member has received an individual number.\n` +
      `Performance order will be entered after the draw.`
    );

    render();
  }
}

/* =========================================================
   DELETE
========================================================= */

async function deleteContestant(id) {

  const c = D?.contestants?.[id];

  if (!c) return;

  if (
    !confirm(
      `Delete ${performanceLabel(c)}?\n\n` +
      `This will also remove any scores associated with this entry.`
    )
  ) {
    return;
  }

  await remove(ref(db, `event/contestants/${id}`));

  const relatedScores = scores()
    .filter(s => s.performanceId === id);

  for (const s of relatedScores) {
    await remove(ref(db, `event/scores/${s.id}`));
  }

  if (D?.active === id) {
    await update(ref(db, "event"), {
      active: null
    });
  }
}

/* =========================================================
   DRAW & PERFORMANCE ORDER
========================================================= */

function drawOrderPage() {

  const list = contestants()
    .filter(c => !c.registrationOnly);

  return `
    ${head("DRAW & PERFORMANCE ORDER")}
    ${nav()}

    <main class="container">

      <div class="card">

        <h2>Competition Night — Enter Performance Order</h2>

        <p style="color:#ccc">
          Registration / Draw Number remains permanent.
          Enter the performance order here only after the
          physical draw has taken place.
        </p>

        <p style="color:#d4af37;font-weight:bold">
          Example: Draw 017 can become Performance Order 4.
          The numbers remain separate.
        </p>

      </div>

      <div class="card">

        <div class="table-wrap">

          <table>

            <thead>
              <tr>
                <th>Draw #</th>
                <th>Participant / Team</th>
                <th>Participant #</th>
                <th>Category</th>
                <th>Type</th>
                <th>Song</th>
                <th>Performance Order</th>
              </tr>
            </thead>

            <tbody>

              ${
                list.length
                  ? list.map(c => `
                    <tr>

                      <td>
                        <strong>${padNumber(c.draw)}</strong>
                      </td>

                      <td>
                        ${escapeHTML(performanceLabel(c))}
                      </td>

                      <td>
                        ${escapeHTML(participantNumbers(c))}
                      </td>

                      <td>
                        ${escapeHTML(c.category)}
                      </td>

                      <td>
                        ${escapeHTML(c.performanceType || "Individual")}
                      </td>

                      <td>
                        ${escapeHTML(c.song || "—")}
                      </td>

                      <td>

                        <input
                          type="number"
                          min="1"
                          class="input orderInput"
                          data-order-id="${c.id}"
                          value="${c.performanceOrder ?? ""}"
                          placeholder="Order"
                          style="width:100px"
                        >

                      </td>

                    </tr>
                  `).join("")
                  : `
                    <tr>
                      <td colspan="7" style="text-align:center">
                        No performances registered.
                      </td>
                    </tr>
                  `
              }

            </tbody>

          </table>

        </div>

        <button
          class="btn"
          id="savePerformanceOrders"
          style="margin-top:15px"
        >
          SAVE PERFORMANCE ORDER
        </button>

      </div>

      <div class="card">

        <h2>Current Running Order</h2>

        <div class="table-wrap">

          <table>

            <thead>
              <tr>
                <th>Order</th>
                <th>Draw #</th>
                <th>Participant</th>
                <th>Category</th>
                <th>Song</th>
              </tr>
            </thead>

            <tbody>

              ${performanceList()
                .filter(c =>
                  !c.registrationOnly &&
                  c.performanceOrder != null &&
                  categoryAllowed(c.category)
                )
                .map(c => `
                  <tr>

                    <td>
                      <strong>
                        ${c.performanceOrder}
                      </strong>
                    </td>

                    <td>
                      ${padNumber(c.draw)}
                    </td>

                    <td>
                      ${escapeHTML(performanceLabel(c))}
                    </td>

                    <td>
                      ${escapeHTML(c.category)}
                    </td>

                    <td>
                      ${escapeHTML(c.song || "—")}
                    </td>

                  </tr>
                `)
                .join("")}

            </tbody>

          </table>

        </div>

      </div>

    </main>
  `;
}

async function savePerformanceOrders() {

  const inputs =
    [...document.querySelectorAll(".orderInput")];

  const orders = [];

  for (const input of inputs) {

    const value = input.value.trim();

    if (!value) continue;

    const number = Number(value);

    if (!Number.isInteger(number) || number < 1) {
      alert("Performance order must be a whole number greater than zero.");
      return;
    }

    orders.push({
      id: input.dataset.orderId,
      order: number
    });
  }

  const used = new Set();

  for (const item of orders) {

    if (used.has(item.order)) {
      alert(
        `Performance order ${item.order} has been entered more than once.`
      );
      return;
    }

    used.add(item.order);
  }

  for (const item of orders) {

    await update(
      ref(db, `event/contestants/${item.id}`),
      {
        performanceOrder: item.order
      }
    );
  }

  alert("Performance order saved successfully.");

  render();
}

/* =========================================================
   LIVE
========================================================= */

function live() {

  const active = activeContestant();

  return `
    ${head("LIVE MONITOR")}
    ${nav()}

    <main class="container">

      <div class="card">

        <h2>Current Performance</h2>

        ${
          active
            ? `
              <h1 style="color:#d4af37">
                #${active.performanceOrder ?? "—"}
              </h1>

              <h2>
                ${escapeHTML(performanceLabel(active))}
              </h2>

              <p>
                Draw Number:
                <strong>
                  ${padNumber(active.draw)}
                </strong>
              </p>

              <p>
                Participant Number:
                <strong>
                  ${escapeHTML(participantNumbers(active))}
                </strong>
              </p>

              <p>
                Category:
                <strong>
                  ${escapeHTML(active.category)}
                </strong>
              </p>

              <p>
                Song:
                <strong>
                  ${escapeHTML(active.song || "—")}
                </strong>
              </p>

              <p>
                Scores:
                <strong>
                  ${scoreCount(active.id)} / ${judgeCount()}
                </strong>
              </p>

              ${
                scoreCount(active.id)
                  ? `
                    <h2 style="color:#d4af37">
                      Average:
                      ${performanceScore(active.id).toFixed(2)}
                    </h2>
                  `
                  : ""
              }
            `
            : `
              <p>
                No active performance.
              </p>
            `
        }

      </div>

      <div class="card">

        <h2>Performance Queue</h2>

        <div class="table-wrap">

          <table>

            <thead>
              <tr>
                <th>Order</th>
                <th>Draw</th>
                <th>Participant</th>
                <th>Category</th>
                <th>Scores</th>
              </tr>
            </thead>

            <tbody>

              ${performanceList()
                .filter(c =>
                  !c.registrationOnly &&
                  categoryAllowed(c.category)
                )
                .map(c => `
                  <tr>

                    <td>
                      ${c.performanceOrder ?? "—"}
                    </td>

                    <td>
                      ${padNumber(c.draw)}
                    </td>

                    <td>
                      ${escapeHTML(performanceLabel(c))}
                    </td>

                    <td>
                      ${escapeHTML(c.category)}
                    </td>

                    <td>
                      ${scoreCount(c.id)} / ${judgeCount()}
                    </td>

                  </tr>
                `)
                .join("")}

            </tbody>

          </table>

        </div>

      </div>

    </main>
  `;
}

/* =========================================================
   RESULTS
========================================================= */

function results() {

  const eligible = contestants()
    .filter(c =>
      !c.registrationOnly &&
      categoryAllowed(c.category)
    )
    .map(c => ({
      ...c,
      average: performanceScore(c.id),
      scoreCount: scoreCount(c.id)
    }))
    .filter(c => c.average != null)
    .sort((a, b) => b.average - a.average);

  const male = eligible
    .filter(c => c.category === "Male")
    .sort((a,b) => b.average - a.average);

  const female = eligible
    .filter(c => c.category === "Female")
    .sort((a,b) => b.average - a.average);

  const duet = eligible
    .filter(c => c.category === "Duet")
    .sort((a,b) => b.average - a.average);

  /*
    TEAM CALCULATIONS

    Each team has five individual performances plus one duet.

    Individual team performances are connected using teamId.

    We calculate:

      total = six performance averages added together
      average = total / 6

    This produces a score out of 100 for comparison.
  */

  const teamIds = [
    ...new Set(
      eligible
        .filter(c => c.teamId)
        .map(c => c.teamId)
    )
  ];

  const teamResults = teamIds.map(teamId => {

    const teamPerformances = eligible
      .filter(c => c.teamId === teamId);

    const total = teamPerformances
      .reduce((sum, c) => sum + Number(c.average || 0), 0);

    const average =
      teamPerformances.length
        ? total / teamPerformances.length
        : null;

    const first = teamPerformances[0];

    return {
      teamId,
      teamName: first?.teamName || "Team",
      teamNumber: first?.teamNumber || "",
      performances: teamPerformances,
      total,
      average
    };
  })
  .filter(t => t.performances.length >= 6)
  .sort((a,b) => b.average - a.average);

  return `
    ${head("RESULTS")}
    ${nav()}

    <main class="container">

      <div class="card">

        <h2>Competition Results</h2>

        <p style="color:#ccc">
          Scores are calculated from the judges' submitted
          100-point scores.
        </p>

      </div>

      ${
        male.length
          ? winnerCard(
              "BEST MALE",
              male[0],
              "#d4af37"
            )
          : ""
      }

      ${
        female.length
          ? winnerCard(
              "BEST FEMALE",
              female[0],
              "#d4af37"
            )
          : ""
      }

      ${
        duet.length
          ? winnerCard(
              "BEST DUET",
              duet[0],
              "#d4af37"
            )
          : ""
      }

      ${
        teamResults.length
          ? `
            <div class="card">

              <h2 style="color:#d4af37">
                BEST OVERALL TEAM
              </h2>

              <h1>
                ${escapeHTML(teamResults[0].teamName)}
              </h1>

              <p>
                Team Number:
                <strong>
                  ${escapeHTML(teamResults[0].teamNumber)}
                </strong>
              </p>

              <p>
                Six Performance Total:
                <strong>
                  ${teamResults[0].total.toFixed(2)} / 600
                </strong>
              </p>

              <p>
                Team Average:
                <strong>
                  ${teamResults[0].average.toFixed(2)} / 100
                </strong>
              </p>

            </div>
          `
          : ""
      }

      ${
        teamResults.length
          ? `
            <div class="card">

              <h2>Team Standings</h2>

              <div class="table-wrap">

                <table>

                  <thead>
                    <tr>
                      <th>Position</th>
                      <th>Team</th>
                      <th>Team #</th>
                      <th>Performances</th>
                      <th>Total / 600</th>
                      <th>Average / 100</th>
                    </tr>
                  </thead>

                  <tbody>

                    ${teamResults.map((t,i) => `
                      <tr>

                        <td>
                          <strong>
                            ${i + 1}
                          </strong>
                        </td>

                        <td>
                          ${escapeHTML(t.teamName)}
                        </td>

                        <td>
                          ${escapeHTML(t.teamNumber)}
                        </td>

                        <td>
                          ${t.performances.length} / 6
                        </td>

                        <td>
                          ${t.total.toFixed(2)}
                        </td>

                        <td>
                          ${t.average.toFixed(2)}
                        </td>

                      </tr>
                    `).join("")}

                  </tbody>

                </table>

              </div>

            </div>
          `
          : ""
      }

      <div class="card">

        <h2>All Performance Results</h2>

        <div class="table-wrap">

          <table>

            <thead>
              <tr>
                <th>Order</th>
                <th>Draw</th>
                <th>Participant</th>
                <th>Category</th>
                <th>Team</th>
                <th>Scores</th>
                <th>Average</th>
              </tr>
            </thead>

            <tbody>

              ${eligible.map(c => `
                <tr>

                  <td>
                    ${c.performanceOrder ?? "—"}
                  </td>

                  <td>
                    ${padNumber(c.draw)}
                  </td>

                  <td>
                    ${escapeHTML(performanceLabel(c))}
                  </td>

                  <td>
                    ${escapeHTML(c.category)}
                  </td>

                  <td>
                    ${escapeHTML(c.teamName || "—")}
                  </td>

                  <td>
                    ${c.scoreCount} / ${judgeCount()}
                  </td>

                  <td>
                    <strong>
                      ${c.average.toFixed(2)}
                    </strong>
                  </td>

                </tr>
              `).join("")}

            </tbody>

          </table>

        </div>

      </div>

    </main>
  `;
}

function winnerCard(title, c) {

  return `
    <div class="card">

      <h2 style="color:#d4af37">
        ${title}
      </h2>

      <h1>
        ${escapeHTML(performanceLabel(c))}
      </h1>

      <p>
        Draw Number:
        <strong>
          ${padNumber(c.draw)}
        </strong>
      </p>

      <p>
        Participant Number:
        <strong>
          ${escapeHTML(participantNumbers(c))}
        </strong>
      </p>

      ${
        c.teamName
          ? `
            <p>
              Team:
              <strong>
                ${escapeHTML(c.teamName)}
              </strong>
            </p>
          `
          : ""
      }

      <h2 style="color:#d4af37">
        ${c.average.toFixed(2)} / 100
      </h2>

    </div>
  `;
}

/* =========================================================
   SETTINGS
========================================================= */

function settings() {

  return `
    ${head("SETTINGS")}
    ${nav()}

    <main class="container">

      <div class="card">

        <h2>Competition Settings</h2>

        <div class="form-grid">

          <div>

            <label>Competition Type</label>

            <select id="competitionType" class="input">

              <option value="Individual"
                ${D?.competitionType === "Individual" ? "selected" : ""}>
                Individual Competition
              </option>

              <option value="Team"
                ${D?.competitionType === "Team" ? "selected" : ""}>
                Team Competition
              </option>

              <option value="Combined"
                ${D?.competitionType === "Combined" ? "selected" : ""}>
                Combined Competition
              </option>

            </select>

          </div>

          <div>

            <label>Number of Judges</label>

            <select id="judgeCount" class="input">

              <option value="3"
                ${judgeCount() === 3 ? "selected" : ""}>
                3 Judges
              </option>

              <option value="5"
                ${judgeCount() === 5 ? "selected" : ""}>
                5 Judges
              </option>

            </select>

          </div>

        </div>

        <button
          class="btn"
          id="saveSettings"
          style="margin-top:15px"
        >
          SAVE SETTINGS
        </button>

      </div>

      <div class="card">

        <h2>100-Point Judging System</h2>

        <div class="table-wrap">

          <table>

            <thead>
              <tr>
                <th>Criteria</th>
                <th>Maximum Points</th>
              </tr>
            </thead>

            <tbody>

              ${Object.entries(CRITERIA).map(([name,points]) => `
                <tr>
                  <td>${escapeHTML(name)}</td>
                  <td><strong>${points}</strong></td>
                </tr>
              `).join("")}

              <tr>
                <td>
                  <strong>TOTAL</strong>
                </td>
                <td>
                  <strong>100</strong>
                </td>
              </tr>

            </tbody>

          </table>

        </div>

      </div>

      <div class="card">

        <h2>Judges</h2>

        <p>
          Active judges:
          <strong>${judgeCount()}</strong>
        </p>

        <ul>
          ${enabledJudges().map(id => `
            <li>${JUDGES[id]}</li>
          `).join("")}
        </ul>

      </div>

      <div class="card">

        <h2>Competition Information</h2>

        <p>
          <strong>Individual Mode:</strong>
          Male, Female and Duet performances.
        </p>

        <p>
          <strong>Team Mode:</strong>
          Five individual team performances plus one team duet.
        </p>

        <p>
          <strong>Combined Mode:</strong>
          Individual and team competition can operate together.
        </p>

      </div>

      <div class="card">

        <h2>Danger Zone</h2>

        <button
          class="btn danger"
          id="resetCompetition"
        >
          RESET COMPETITION DATA
        </button>

      </div>

    </main>
  `;
}

async function saveSettings() {

  const type =
    document.getElementById("competitionType")?.value;

  const count =
    Number(document.getElementById("judgeCount")?.value);

  if (!["Individual","Team","Combined"].includes(type)) {
    alert("Invalid competition type.");
    return;
  }

  if (![3,5].includes(count)) {
    alert("Judge count must be 3 or 5.");
    return;
  }

  await update(ref(db, "event"), {
    competitionType: type,
    judgeCount: count
  });

  alert("Competition settings saved.");

  render();
}

/* =========================================================
   SCORE BUTTONS
========================================================= */

function scoreButtons(name, max) {

  return `
    <div class="score-buttons">

      ${Array.from({length:max + 1}, (_,i) => `
        <button
          type="button"
          class="score-btn"
          data-score="${escapeHTML(name)}"
          data-value="${i}"
        >
          ${i}
        </button>
      `).join("")}

    </div>
  `;
}

/* =========================================================
   JUDGE SCREEN
========================================================= */

function judge() {

  const active = activeContestant();

  /*
    Requested return button.

    It is visible on both the waiting screen and the
    active judging screen.
  */

  if (!active) {

    return `
      <div style="
        min-height:100vh;
        background:#000;
        color:white;
        padding:20px;
        box-sizing:border-box;
      ">

        <div style="
          max-width:800px;
          margin:auto;
          text-align:center;
        ">

          ${head("JUDGE")}

          <div class="card">

            <h1 style="color:#d4af37">
              WAITING FOR AUDITOR
            </h1>

            <p>
              The next performance will appear here automatically.
            </p>

            <p style="color:#d4af37">
              ${escapeHTML(JUDGES[jid] || "Judge")}
            </p>

            <button
              class="btn"
              id="jwaitingLogout"
              style="margin-top:20px"
            >
              RETURN TO AUDITOR
            </button>

          </div>

        </div>

      </div>
    `;
  }

  if (!categoryAllowed(active.category)) {

    return `
      <div style="
        min-height:100vh;
        background:#000;
        color:white;
        padding:20px;
      ">

        ${head("JUDGE")}

        <div class="card">

          <h2>
            This performance is outside the current competition mode.
          </h2>

          <button
            class="btn"
            id="jwaitingLogout"
          >
            RETURN TO AUDITOR
          </button>

        </div>

      </div>
    `;
  }

  const existing =
    scores().find(
      s =>
        s.performanceId === active.id &&
        s.judgeId === jid
    );

  if (existing) {

    return `
      <div style="
        min-height:100vh;
        background:#000;
        color:white;
        padding:20px;
        box-sizing:border-box;
      ">

        ${head("JUDGE — SCORE SUBMITTED")}

        <div class="card">

          <h2 style="color:#d4af37">
            SCORE SUBMITTED
          </h2>

          <h1>
            ${escapeHTML(performanceLabel(active))}
          </h1>

          <p>
            Your score:
            <strong>
              ${existing.total} / 100
            </strong>
          </p>

          <p>
            Waiting for the Auditor to move to the next performance.
          </p>

          <button
            class="btn"
            id="jwaitingLogout"
          >
            RETURN TO AUDITOR
          </button>

        </div>

      </div>
    `;
  }

  const currentDraft =
    draftPerformanceId === active.id
      ? draft
      : {};

  if (draftPerformanceId !== active.id) {
    draft = {};
    draftPerformanceId = active.id;
  }

  return `
    <div style="
      min-height:100vh;
      background:#000;
      color:white;
      padding:15px;
      box-sizing:border-box;
    ">

      ${head("JUDGE")}

      <main class="container">

        <div class="card">

          <h1 style="color:#d4af37">
            PERFORMANCE #${active.performanceOrder ?? "—"}
          </h1>

          <p>
            <strong>Draw Number:</strong>
            ${padNumber(active.draw)}
          </p>

          <h2>
            ${escapeHTML(performanceLabel(active))}
          </h2>

          <p>
            <strong>Category:</strong>
            ${escapeHTML(active.category)}
          </p>

          <p>
            <strong>Song:</strong>
            ${escapeHTML(active.song || "—")}
          </p>

          ${
            active.participants?.length
              ? `
                <div style="
                  margin-top:15px;
                  padding:12px;
                  border:1px solid #d4af37;
                  border-radius:8px;
                ">

                  <strong style="color:#d4af37">
                    PARTICIPANTS
                  </strong>

                  <ul>
                    ${active.participants.map(p => `
                      <li>
                        ${escapeHTML(p.number)}
                        —
                        ${escapeHTML(p.name)}
                      </li>
                    `).join("")}
                  </ul>

                </div>
              `
              : ""
          }

        </div>

        <div class="card">

          <h2>
            ${escapeHTML(JUDGES[jid] || "Judge")}
          </h2>

          ${Object.entries(CRITERIA).map(([name,max]) => `

            <div style="
              margin-bottom:25px;
              padding-bottom:15px;
              border-bottom:1px solid #333;
            ">

              <div style="
                display:flex;
                justify-content:space-between;
                align-items:center;
                margin-bottom:8px;
              ">

                <strong>
                  ${escapeHTML(name)}
                </strong>

                <span style="color:#d4af37">
                  Max ${max}
                </span>

              </div>

              ${scoreButtons(name,max)}

            </div>

          `).join("")}

          <div style="
            text-align:center;
            padding:20px;
            border:2px solid #d4af37;
            border-radius:10px;
            margin-top:20px;
          ">

            <div style="color:#d4af37">
              YOUR TOTAL
            </div>

            <div style="
              font-size:48px;
              font-weight:bold;
            ">
              ${totalDraft()}
            </div>

            <div>
              / 100
            </div>

          </div>

          <button
            class="btn"
            id="submitScore"
            style="
              width:100%;
              margin-top:20px;
              font-size:20px;
            "
          >
            SUBMIT SCORE
          </button>

          <button
            class="btn"
            id="jwaitingLogout"
            style="
              width:100%;
              margin-top:10px;
            "
          >
            RETURN TO AUDITOR
          </button>

        </div>

      </main>

    </div>
  `;
}

/* =========================================================
   ACTIVATE PERFORMANCE
========================================================= */

async function activate(id) {

  if (!id) {
    alert("Please select a performance.");
    return;
  }

  const c = D?.contestants?.[id];

  if (!c) {
    alert("Performance not found.");
    return;
  }

  if (!categoryAllowed(c.category)) {
    alert(
      "This performance is not part of the current competition type."
    );
    return;
  }

  if (
    c.performanceOrder == null
  ) {
    const proceed =
      confirm(
        "This performance does not have a performance order yet.\n\n" +
        "Normally the order should be entered after the draw.\n\n" +
        "Do you still want to activate it?"
      );

    if (!proceed) return;
  }

  await update(ref(db, "event"), {
    active: id
  });

  page = "home";
  render();
}

/* =========================================================
   END ACTIVE
========================================================= */

async function endActive() {

  if (!D?.active) return;

  await update(ref(db, "event"), {
    active: null
  });

  render();
}

/* =========================================================
   SUBMIT SCORE
========================================================= */

async function submitScore() {

  if (submitting) return;

  const active = activeContestant();

  if (!active) {
    alert("There is no active performance.");
    return;
  }

  for (const name of Object.keys(CRITERIA)) {

    if (
      draft[name] === undefined ||
      draft[name] === null
    ) {

      alert(
        `Please score "${name}" before submitting.`
      );

      return;
    }
  }

  const total = totalDraft();

  if (total > 100) {
    alert("Score cannot exceed 100 points.");
    return;
  }

  submitting = true;

  try {

    const id =
      `s_${Date.now()}_${jid}_${Math.random()
        .toString(36)
        .slice(2)}`;

    const score = {

      id,

      performanceId: active.id,

      judgeId: jid,

      judgeNo:
        enabledJudges().indexOf(jid) + 1,

      criteria: {
        ...draft
      },

      total,

      submittedAt: Date.now()
    };

    await set(
      ref(db, `event/scores/${id}`),
      score
    );

    draft = {};
    draftPerformanceId = null;

  } catch (error) {

    console.error(error);

    alert(
      "Unable to submit score.\n\n" +
      error.message
    );

  } finally {

    submitting = false;

    render();
  }
}

/* =========================================================
   SAVE JUDGE COUNT
========================================================= */

async function saveJudgeCount() {

  const count =
    Number(document.getElementById("judgeCount")?.value);

  if (![3,5].includes(count)) {
    alert("Please select either 3 or 5 judges.");
    return;
  }

  await update(ref(db, "event"), {
    judgeCount: count
  });

  alert(`${count} judges are now active.`);

  render();
}

/* =========================================================
   RESET
========================================================= */

async function resetCompetition() {

  const ok =
    confirm(
      "WARNING\n\n" +
      "This will remove all registered contestants " +
      "and all scores.\n\n" +
      "Are you sure?"
    );

  if (!ok) return;

  await update(ref(db, "event"), {
    active: null,
    finalized: false,
    contestants: {},
    scores: {}
  });

  alert("Competition data has been reset.");

  render();
}

/* =========================================================
   WIRE EVENTS
========================================================= */

function wire() {

  /* ---------------- LOGIN ---------------- */

  document
    .getElementById("auditorLogin")
    ?.addEventListener("click", () => {

      localStorage.setItem("rk_role", "auditor");

      localStorage.removeItem("rk_judge");

      role = "auditor";
      jid = null;
      page = "home";

      render();
    });

  document
    .querySelectorAll("[data-judge]")
    .forEach(btn => {

      btn.addEventListener("click", () => {

        const id =
          btn.dataset.judge;

        localStorage.setItem("rk_role", "judge");
        localStorage.setItem("rk_judge", id);

        role = "judge";
        jid = id;
        page = "home";

        render();
      });
    });

  /* ---------------- NAV ---------------- */

  document
    .querySelectorAll("[data-page]")
    .forEach(btn => {

      btn.addEventListener("click", () => {

        page = btn.dataset.page;

        render();
      });
    });

  document
    .getElementById("logout")
    ?.addEventListener("click", logout);

  /* ---------------- JUDGE ---------------- */

  document
    .querySelectorAll(".score-btn")
    .forEach(btn => {

      btn.addEventListener("click", () => {

        const name =
          btn.dataset.score;

        const value =
          Number(btn.dataset.value);

        draft[name] = value;

        render();
      });
    });

  document
    .getElementById("submitScore")
    ?.addEventListener(
      "click",
      submitScore
    );

  document
    .getElementById("jwaitingLogout")
    ?.addEventListener(
      "click",
      returnToAuditor
    );

  /* ---------------- REGISTRATION ---------------- */

  const regType =
    document.getElementById("regType");

  if (regType) {

    const updateFields = () => {

      const container =
        document.getElementById("registrationFields");

      if (container) {
        container.innerHTML =
          registrationFields(regType.value);
      }
    };

    regType.addEventListener(
      "change",
      updateFields
    );

    updateFields();
  }

  document
    .getElementById("registerContestant")
    ?.addEventListener(
      "click",
      registerContestant
    );

  document
    .querySelectorAll("[data-delete]")
    .forEach(btn => {

      btn.addEventListener("click", () => {

        deleteContestant(
          btn.dataset.delete
        );
      });
    });

  /* ---------------- PERFORMANCE CONTROL ---------------- */

  document
    .getElementById("activateSelected")
    ?.addEventListener("click", () => {

      const id =
        document.getElementById("activeSelect")?.value;

      activate(id);
    });

  document
    .getElementById("endActive")
    ?.addEventListener(
      "click",
      endActive
    );

  /* ---------------- DRAW ---------------- */

  document
    .getElementById("savePerformanceOrders")
    ?.addEventListener(
      "click",
      savePerformanceOrders
    );

  /* ---------------- SETTINGS ---------------- */

  document
    .getElementById("saveSettings")
    ?.addEventListener(
      "click",
      saveSettings
    );

  /* ---------------- RESET ---------------- */

  document
    .getElementById("resetCompetition")
    ?.addEventListener(
      "click",
      resetCompetition
    );
}

/* =========================================================
   RENDER
========================================================= */

function render() {

  if (!D) return;

  if (!role) {

    root.innerHTML =
      login();

    wire();

    return;
  }

  if (role === "judge") {

    root.innerHTML =
      judge();

    wire();

    return;
  }

  if (role === "auditor") {

    let html = "";

    if (page === "home") {
      html = dashboard();
    }

    else if (page === "contestants") {
      html = contestantsPage();
    }

    else if (page === "draw") {
      html = drawOrderPage();
    }

    else if (page === "live") {
      html = live();
    }

    else if (page === "results") {
      html = results();
    }

    else if (page === "settings") {
      html = settings();
    }

    else {
      html = dashboard();
    }

    root.innerHTML = html;

    wire();
  }
}

/* =========================================================
   ENSURE EVENT
========================================================= */

async function ensureEvent() {

  const snap =
    await get(ref(db, "event"));

  if (!snap.exists()) {

    await set(
      ref(db, "event"),
      defaultEvent()
    );

    return;
  }

  const event =
    snap.val() || {};

  const updates = {};

  if (!event.name)
    updates.name =
      "Royal Karaoke SKN Championship";

  if (!event.venue)
    updates.venue =
      "Venue TBD";

  if (!event.date)
    updates.date =
      "2026-09-27";

  if (!event.judgeCount)
    updates.judgeCount = 3;

  if (!event.competitionType)
    updates.competitionType = "Combined";

  if (!event.judges)
    updates.judges = JUDGES;

  if (!event.contestants)
    updates.contestants = {};

  if (!event.scores)
    updates.scores = {};

  if (Object.keys(updates).length) {

    await update(
      ref(db, "event"),
      updates
    );
  }
}

/* =========================================================
   START
========================================================= */

async function start() {

  if (!db || !auth) return;

  try {

    await signInAnonymously(auth);

    await ensureEvent();

    onValue(
      ref(db, "event"),
      snapshot => {

        D =
          snapshot.val() ||
          defaultEvent();

        render();
      },
      error => {

        console.error(error);

        root.innerHTML = `
          <div class="card">

            <h2>Database Error</h2>

            <p>
              Unable to read the competition database.
            </p>

            <pre>
${escapeHTML(error.message)}
            </pre>

          </div>
        `;
      }
    );

  } catch (error) {

    console.error(error);

    root.innerHTML = `
      <div class="card">

        <h2>Connection Error</h2>

        <p>
          Unable to connect to the judging system.
        </p>

        <pre>
${escapeHTML(error.message)}
        </pre>

      </div>
    `;
  }
}

/* =========================================================
   GLOBAL ERROR HANDLERS
========================================================= */

window.addEventListener(
  "error",
  event => {
    console.error(
      "Global error:",
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

/* =========================================================
   GLOBAL ACCESS
========================================================= */

window.RoyalKaraoke = {
  render,
  activate,
  submitScore,
  logout,
  returnToAuditor
};

/* =========================================================
   START APPLICATION
========================================================= */

start();

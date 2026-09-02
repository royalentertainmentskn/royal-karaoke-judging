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

/*
  Default teams.

  These are only used when the competition does not yet
  have teams stored in Firebase.
*/
const DEFAULT_TEAMS = {
  t1: "SKN Melodies",
  t2: "Island Voices",
  t3: "Kittitian Stars",
  t4: "Nevis Voices"
};

const DEMO = {
  c1: {
    number: 1,
    name: "Sarah Jones",
    category: "Female",
    song: "Example Song",
    team: "SKN Melodies",
    order: 1
  },
  c2: {
    number: 2,
    name: "John Smith",
    category: "Male",
    song: "Example Song",
    team: "Island Voices",
    order: 2
  },
  c3: {
    number: 3,
    name: "Mary & James",
    category: "Duet",
    song: "Example Song",
    team: "SKN Melodies",
    order: 3
  },
  c4: {
    number: 4,
    name: "Team SKN",
    category: "Team",
    song: "Example Song",
    team: "Kittitian Stars",
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
let draft = {};

const E = v =>
  String(v ?? "").replace(
    /[&<>"']/g,
    c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[c])
  );

const cs = () =>
  Object.entries(D.contestants || {})
    .map(([id, x]) => ({ id, ...x }))
    .sort((a, b) => a.order - b.order);

const S = () => D.scores || {};

const A = () => D.contestants?.[D.active];

const T = () =>
  C.reduce((n, [k]) => n + (+draft[k] || 0), 0);

/*
  Return the teams currently stored in Firebase.
  If no teams exist yet, use the default teams.
*/
const teams = () => {
  if (D.teams && Object.keys(D.teams).length) {
    return Object.entries(D.teams)
      .map(([id, name]) => ({
        id,
        name:
          typeof name === "string"
            ? name
            : name?.name || ""
      }))
      .filter(x => x.name);
  }

  return Object.entries(DEFAULT_TEAMS).map(
    ([id, name]) => ({ id, name })
  );
};

/*
  Create the team dropdown used during registration.
*/
const teamOptions = () =>
  teams()
    .map(
      t =>
        `<option value="${E(t.name)}">
          ${E(t.name)}
        </option>`
    )
    .join("");

async function start() {
  try {
    await signInAnonymously(au);
  } catch (e) {
    root.innerHTML = `
      <h2>Firebase Authentication Error</h2>
      <p>${E(e.message)}</p>
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
          name: "Royal Karaoke SKN Championship — Test Event",
          venue: "Test Venue",
          active: "c1",
          contestants: DEMO,
          judges: J,
          scores: {},
          teams: DEFAULT_TEAMS
        });
      }

      /*
        If an existing competition does not yet have
        teams, add the default team list without
        disturbing the rest of the event.
      */
      if (
        D.name &&
        !D.teams
      ) {
        await set(
          ref(db, "event/teams"),
          DEFAULT_TEAMS
        );
      }

      render();
    },
    e => {
      root.innerHTML = `
        <h2>Firebase Database Error</h2>
        <p>${E(e.message)}</p>
      `;
    }
  );
}

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

function login() {
  return `
    <div class="wrap">
      <div class="card hero">
        <div class="big">🎤</div>
        <h1>Royal Karaoke SKN</h1>
        <h2>100-Point Digital Judging System</h2>

        <button id="aud" class="primary">
          AUDITOR
        </button>

        <h3>Select Judge</h3>

        <div class="login-grid">
          ${Object.entries(J)
            .map(
              ([id, j]) =>
                `<button class="jl" data-id="${id}">
                  ${j.name}
                </button>`
            )
            .join("")}
        </div>
      </div>
    </div>
  `;
}

function dash() {
  let a = A();
  let s = S()[D.active] || {};

  return `
    <h1>Auditor Dashboard</h1>

    <div class="grid">
      <div class="card">
        <span class="muted">Competition</span>
        <h2>${E(D.name)}</h2>
        <p>${E(D.venue || "")}</p>
      </div>

      <div class="card">
        <span class="muted">Current Contestant</span>

        ${
          a
            ? `
              <div class="big">#${a.number}</div>
              <h2>${E(a.name)}</h2>
              <p>
                ${E(a.category || "")}
                ${a.team ? ` · ${E(a.team)}` : ""}
              </p>
            `
            : "None"
        }
      </div>

      <div class="card">
        <span class="muted">Judges Submitted</span>
        <div class="stat">${Object.keys(s).length}/5</div>
      </div>
    </div>

    <div class="card">
      <h2>Activate Performance</h2>

      <select id="act">
        ${cs()
          .map(
            x =>
              `<option value="${x.id}" ${
                x.id === D.active ? "selected" : ""
              }>
                #${x.number} — ${E(x.name)}
                (${E(x.category)})
                ${x.team ? ` — ${E(x.team)}` : ""}
              </option>`
          )
          .join("")}
      </select>

      <br><br>

      <button id="activate" class="primary">
        ACTIVATE CONTESTANT
      </button>
    </div>

    <div class="card">
      <h2>Judge Status</h2>

      ${Object.entries(J)
        .map(
          ([id, j]) =>
            `<p>
              <b>${j.name}</b> —
              ${
                s[id]
                  ? '<span class="ok">✓ Submitted</span>'
                  : '<span class="warn">Waiting</span>'
              }
            </p>`
        )
        .join("")}
    </div>
  `;
}

function cont() {
  return `
    <h1>Contestant Registration</h1>

    <div class="card">
      <h2>Register Performance</h2>

      <p class="muted">
        Every contestant or duet must be assigned to a team.
        The team assignment will be used later to calculate
        the Best Overall Team.
      </p>

      <div class="form-grid">

        <input
          id="cn"
          type="number"
          placeholder="Performance Number"
        >

        <select id="cat">
          <option value="Male">Individual — Male</option>
          <option value="Female">Individual — Female</option>
          <option value="Duet">Duet</option>
        </select>

        <input
          id="name"
          placeholder="Contestant Name"
        >

        <input
          id="name2"
          placeholder="Second Contestant Name (Duet only)"
          style="display:none"
        >

        <select id="team">
          <option value="">
            Select Team
          </option>
          ${teamOptions()}
        </select>

        <input
          id="song"
          placeholder="Song"
        >

        <input
          id="ord"
          type="number"
          placeholder="Performance Order"
        >

      </div>

      <br>

      <button id="add" class="primary">
        REGISTER PERFORMANCE
      </button>
    </div>

    <div class="card">
      <h2>Teams</h2>

      <div class="form-grid">
        <input
          id="newTeam"
          placeholder="Enter new team name"
        >

        <button id="addTeam" class="primary">
          ADD TEAM
        </button>
      </div>

      <br>

      <div class="table-wrap">
        <table>
          <tr>
            <th>Team</th>
            <th>Registered Performances</th>
          </tr>

          ${teams()
            .map(
              t => `
                <tr>
                  <td>${E(t.name)}</td>
                  <td>
                    ${
                      cs().filter(
                        x => x.team === t.name
                      ).length
                    }
                  </td>
                </tr>
              `
            )
            .join("")}
        </table>
      </div>
    </div>

    <div class="card table-wrap">
      <h2>Registered Performances</h2>

      <table>
        <tr>
          <th>#</th>
          <th>Contestant(s)</th>
          <th>Category</th>
          <th>Team</th>
          <th>Song</th>
          <th></th>
        </tr>

        ${cs()
          .map(
            x =>
              `<tr>
                <td>${x.number}</td>

                <td>
                  ${E(x.name)}
                  ${
                    x.name2
                      ? ` & ${E(x.name2)}`
                      : ""
                  }
                </td>

                <td>${E(x.category)}</td>

                <td>
                  ${E(x.team || "No Team")}
                </td>

                <td>${E(x.song)}</td>

                <td>
                  <button
                    class="del danger"
                    data-id="${x.id}"
                  >
                    Delete
                  </button>
                </td>
              </tr>`
          )
          .join("")}
      </table>
    </div>
  `;
}

function live() {
  let s = S()[D.active] || {};
  let a = A();

  return `
    <h1>Live Scores</h1>

    <div class="card">
      <h2>
        ${
          a
            ? `#${a.number} — ${E(a.name)}`
            : "No active contestant"
        }
      </h2>

      ${
        a
          ? `
            <p>
              ${E(a.category || "")}
              ${a.team ? ` · Team: ${E(a.team)}` : ""}
            </p>
          `
          : ""
      }
    </div>

    <div class="grid">
      ${Object.entries(J)
        .map(
          ([id, j]) =>
            `<div class="card">
              <h2>${j.name}</h2>

              ${
                s[id]
                  ? `
                    <div class="stat">
                      ${s[id].total}/100
                    </div>
                    <span class="ok">✓ Submitted</span>
                  `
                  : '<span class="warn">Waiting</span>'
              }
            </div>`
        )
        .join("")}
    </div>
  `;
}

function results() ```javascript
function results(){
  const rows = Object.entries(D.contestants || {}).map(([id,c])=>{
    const scores = Object.values((D.scores || {})[id] || {});
    const submitted = scores.filter(s=>s && s.submitted);

    const avg = submitted.length
      ? submitted.reduce((a,s)=>a+(Number(s.total)||0),0) / submitted.length
      : 0;

    return {
      id,
      ...c,
      submitted: submitted.length,
      avg
    };
  });

  const completeRows = rows.filter(r=>r.submitted === J.length);

  // Individual category winners
  const bestMale = completeRows
    .filter(r=>r.category === "Male")
    .sort((a,b)=>b.avg-a.avg)[0];

  const bestFemale = completeRows
    .filter(r=>r.category === "Female")
    .sort((a,b)=>b.avg-a.avg)[0];

  const bestDuet = completeRows
    .filter(r=>r.category === "Duet")
    .sort((a,b)=>b.avg-a.avg)[0];

  // ---------------------------------------------------------
  // BEST OVERALL TEAM
  // Each completed performance contributes its FINAL AVERAGE
  // to the team total.
  // ---------------------------------------------------------
  const teamTotals = {};

  completeRows.forEach(r=>{
    if(!r.team) return;

    if(!teamTotals[r.team]){
      teamTotals[r.team] = {
        team: r.team,
        total: 0,
        performances: 0
      };
    }

    teamTotals[r.team].total += r.avg;
    teamTotals[r.team].performances++;
  });

  const teamRanking = Object.values(teamTotals)
    .sort((a,b)=>b.total-a.total);

  const bestTeam = teamRanking[0];

  const winnerBox = (title, item, extra="") => item
    ? `<div class="card">
         <h3>${title}</h3>
         <div class="winner">${E(item.name)}</div>
         <div>${extra}</div>
         <strong>${item.avg.toFixed(2)} / 100</strong>
       </div>`
    : `<div class="card">
         <h3>${title}</h3>
         <div>No completed result yet</div>
       </div>`;

  const teamBox = bestTeam
    ? `<div class="card">
         <h3>🏆 Best Overall Team</h3>
         <div class="winner">${E(bestTeam.team)}</div>
         <div>${bestTeam.performances} completed performance${bestTeam.performances===1?"":"s"}</div>
         <strong>${bestTeam.total.toFixed(2)} points</strong>
       </div>`
    : `<div class="card">
         <h3>🏆 Best Overall Team</h3>
         <div>No completed team result yet</div>
       </div>`;

  return `
    ${head("Results")}

    <section class="grid">
      ${winnerBox("Overall Winner",
        completeRows.slice().sort((a,b)=>b.avg-a.avg)[0] || null)}

      ${winnerBox("Best Male", bestMale)}

      ${winnerBox("Best Female", bestFemale)}

      ${winnerBox("Best Duet", bestDuet)}

      ${teamBox}
    </section>

    <section class="card">
      <h3>🏆 Team Ranking</h3>

      ${
        teamRanking.length
        ? `<table>
            <thead>
              <tr>
                <th>Rank</th>
                <th>Team</th>
                <th>Completed Performances</th>
                <th>Team Total</th>
              </tr>
            </thead>
            <tbody>
              ${teamRanking.map((t,i)=>`
                <tr>
                  <td>${i+1}</td>
                  <td><strong>${E(t.team)}</strong></td>
                  <td>${t.performances}</td>
                  <td><strong>${t.total.toFixed(2)}</strong></td>
                </tr>
              `).join("")}
            </tbody>
          </table>`
        : `<p>No completed team performances yet.</p>`
      }
    </section>

    <section class="card">
      <h3>Performance Results</h3>

      <table>
        <thead>
          <tr>
            <th>No.</th>
            <th>Contestant</th>
            <th>Category</th>
            <th>Team</th>
            <th>Song</th>
            <th>Judges</th>
            <th>Final Score</th>
          </tr>
        </thead>

        <tbody>
          ${
            rows
              .slice()
              .sort((a,b)=>b.avg-a.avg)
              .map(r=>`
                <tr>
                  <td>${E(r.number || "")}</td>
                  <td>
                    <strong>${E(r.name || "")}</strong>
                    ${r.category==="Duet" && r.name2
                      ? `<br>& ${E(r.name2)}`
                      : ""}
                  </td>
                  <td>${E(r.category || "")}</td>
                  <td>${E(r.team || "")}</td>
                  <td>${E(r.song || "")}</td>
                  <td>${r.submitted}/${J.length}</td>
                  <td>
                    ${
                      r.submitted === J.length
                      ? `<strong>${r.avg.toFixed(2)}</strong>`
                      : `Pending`
                    }
                  </td>
                </tr>
              `).join("")
          }
        </tbody>
      </table>
    </section>
  `;
}
```


function judge() {
  let a = A();

  if (!a) {
    return `
      <div class="wrap">
        <div class="card hero">
          <h1>Waiting for Auditor</h1>
        </div>
      </div>
    `;
  }

  let old = S()[D.active]?.[jid];

  if (old) {
    return `
      <div class="wrap">
        <div class="card hero">
          <h1>✓ Score Submitted</h1>

          <h2>
            #${a.number} — ${E(a.name)}
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

        <div class="big">#${a.number}</div>

        <h1>${E(a.name)}</h1>

        ${
          a.name2
            ? `<h2>& ${E(a.name2)}</h2>`
            : ""
        }

        <p>
          ${E(a.song || "")} · ${E(a.category)}
        </p>

        ${
          a.team
            ? `<p><b>Team: ${E(a.team)}</b></p>`
            : ""
        }
      </div>

      <div class="card">
        <div class="notice">
          Complete all criteria.
          Total possible:
          <b>100 points.</b>
        </div>

        ${C.map(
          ([k, l, m]) =>
            `<div class="score-block">
              <div class="score-title">
                <b>${l}</b>
                <span>
                  ${draft[k] ?? 0}/${m}
                </span>
              </div>

              <div class="score-buttons">
                ${Array.from(
                  { length: m + 1 },
                  (_, n) =>
                    `<button
                      class="sb ${
                        draft[k] === n
                          ? "selected"
                          : ""
                      }"
                      data-k="${k}"
                      data-n="${n}"
                    >
                      ${n}
                    </button>`
                ).join("")}
              </div>
            </div>`
        ).join("")}

        <div class="total">
          TOTAL: ${T()} / 100
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
          ([x, l]) =>
            `<button
              class="nb ${page === x ? "primary" : ""}"
              data-p="${x}"
            >
              ${l}
            </button>`
        )
        .join("")}

      <button id="out">
        Log out
      </button>
    </div>
  `;
}

function logout() {
  role = null;
  jid = null;
  draft = {};

  delete localStorage.rk_role;
  delete localStorage.rk_judge;

  render();
}

function wire() {
  if (!role) {
    document
      .getElementById("aud")
      ?.addEventListener("click", () => {
        role = "auditor";
        localStorage.rk_role = role;
        render();
      });

    document.querySelectorAll(".jl").forEach(b =>
      b.addEventListener("click", () => {
        role = "judge";
        jid = b.dataset.id;

        localStorage.rk_role = role;
        localStorage.rk_judge = jid;

        render();
      })
    );

    return;
  }

  if (role === "judge") {
    document.querySelectorAll(".sb").forEach(b =>
      b.addEventListener("click", () => {
        draft[b.dataset.k] = +b.dataset.n;
        render();
      })
    );

    document
      .getElementById("submit")
      ?.addEventListener("click", async () => {
        if (
          C.some(
            ([k]) =>
              draft[k] === undefined
          )
        ) {
          return alert(
            "Please score every category."
          );
        }

        let total = T();

        if (
          !confirm(
            `Submit ${total}/100? This score will be locked.`
          )
        ) {
          return;
        }

        await set(
          ref(
            db,
            `event/scores/${D.active}/${jid}`
          ),
          {
            ...draft,
            total,
            judgeId: jid,
            judgeNo: J[jid].no,
            submittedAt: Date.now()
          }
        );

        draft = {};
        render();
      });

    document
      .getElementById("jout")
      ?.addEventListener("click", logout);

    return;
  }

  document.querySelectorAll(".nb").forEach(b =>
    b.addEventListener("click", () => {
      page = b.dataset.p;
      render();
    })
  );

  document
    .getElementById("out")
    ?.addEventListener("click", logout);

  document
    .getElementById("activate")
    ?.addEventListener("click", () =>
      update(
        ref(db, "event"),
        {
          active:
            document.getElementById("act").value
        }
      )
    );

  /*
    Show/hide the second contestant field
    when Duet is selected.
  */
  document
    .getElementById("cat")
    ?.addEventListener("change", e => {
      let second =
        document.getElementById("name2");

      if (!second) return;

      second.style.display =
        e.target.value === "Duet"
          ? "block"
          : "none";

      if (e.target.value !== "Duet") {
        second.value = "";
      }
    });

  /*
    Register a new contestant or duet.
  */
  document
    .getElementById("add")
    ?.addEventListener("click", async () => {
      let n =
        +document.getElementById("cn").value;

      let name =
        document
          .getElementById("name")
          .value
          .trim();

      let category =
        document.getElementById("cat").value;

      let name2 =
        document
          .getElementById("name2")
          ?.value
          .trim() || "";

      let team =
        document.getElementById("team").value;

      let song =
        document
          .getElementById("song")
          .value
          .trim();

      let order =
        +document.getElementById("ord").value ||
        n;

      if (!n || !name) {
        return alert(
          "Enter performance number and contestant name."
        );
      }

      if (!team) {
        return alert(
          "Please select a team."
        );
      }

      if (
        category === "Duet" &&
        !name2
      ) {
        return alert(
          "Enter the second contestant's name for a duet."
        );
      }

      let id = "c" + Date.now();

      let contestant = {
        number: n,
        name,
        category,
        team,
        song,
        order
      };

      if (category === "Duet") {
        contestant.name2 = name2;
      }

      await set(
        ref(
          db,
          `event/contestants/${id}`
        ),
        contestant
      );

      /*
        Clear registration fields after
        successful registration.
      */
      document.getElementById("cn").value = "";
      document.getElementById("name").value = "";
      document.getElementById("name2").value = "";
      document.getElementById("song").value = "";
      document.getElementById("ord").value = "";
    });

  /*
    Add a new team to Firebase.
  */
  document
    .getElementById("addTeam")
    ?.addEventListener("click", async () => {
      let input =
        document.getElementById("newTeam");

      let name =
        input.value.trim();

      if (!name) {
        return alert(
          "Enter a team name."
        );
      }

      let existing =
        teams().some(
          t =>
            t.name.toLowerCase() ===
            name.toLowerCase()
        );

      if (existing) {
        return alert(
          "That team already exists."
        );
      }

      let id =
        "t" + Date.now();

      await set(
        ref(
          db,
          `event/teams/${id}`
        ),
        name
      );

      input.value = "";
    });

  document.querySelectorAll(".del").forEach(b =>
    b.addEventListener("click", () => {
      if (
        confirm(
          "Delete this contestant?"
        )
      ) {
        remove(
          ref(
            db,
            `event/contestants/${b.dataset.id}`
          )
        );
      }
    })
  );
}

function render() {
  if (!D.name) {
    root.textContent =
      "Loading competition...";
    return;
  }

  if (!role) {
    root.innerHTML = login();
  } else if (role === "judge") {
    root.innerHTML =
      head() + judge();
  } else {
    let b =
      page === "contestants"
        ? cont()
        : page === "live"
        ? live()
        : page === "results"
        ? results()
        : dash();

    root.innerHTML =
      head() +
      `<div class="wrap">${nav()}${b}</div>`;
  }

  wire();
}

start();

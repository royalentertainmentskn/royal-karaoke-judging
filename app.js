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
          scores: {}
        });
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
                #${x.number} — ${E(x.name)} (${x.category})
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

      <button id="add" class="primary">
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
            x =>
              `<tr>
                <td>${x.number}</td>
                <td>${E(x.name)}</td>
                <td>${x.category}</td>
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

function results() {
  let r = cs()
    .map(x => {
      let a = Object.values(S()[x.id] || {});

      let avg = a.length
        ? a.reduce((n, q) => n + q.total, 0) / a.length
        : 0;

      return {
        ...x,
        n: a.length,
        avg
      };
    })
    .sort((a, b) => b.avg - a.avg);

  let best = c =>
    r.find(x => x.category === c && x.n);

  let boxes = [
    ["Overall Winner", r.find(x => x.n)],
    ["Best Male", best("Male")],
    ["Best Female", best("Female")],
    ["Best Duet", best("Duet")],
    ["Best Team", best("Team")]
  ];

  return `
    <h1>Results</h1>

    <div class="grid">
      ${boxes
        .map(
          ([t, w]) =>
            `<div class="card winner">
              <span class="muted">${t}</span>

              <h2>${E(w?.name || "—")}</h2>

              <div class="big">
                ${w ? w.avg.toFixed(2) : "—"}
              </div>

              ${w ? "/100" : ""}
            </div>`
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
            (x, i) =>
              `<tr>
                <td>${x.n ? i + 1 : "—"}</td>
                <td>${E(x.name)}</td>
                <td>${x.category}</td>
                <td>${x.n}</td>
                <td>
                  ${x.n ? x.avg.toFixed(2) : "—"}
                </td>
              </tr>`
          )
          .join("")}
      </table>
    </div>
  `;
}

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

        <p>
          ${E(a.song || "")} · ${a.category}
        </p>
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

      if (!n || !name) {
        return alert(
          "Enter contestant number and name."
        );
      }

      let id = "c" + Date.now();

      await set(
        ref(
          db,
          `event/contestants/${id}`
        ),
        {
          number: n,
          name,
          category:
            document.getElementById("cat").value,
          song:
            document
              .getElementById("song")
              .value
              .trim(),
          order:
            +document.getElementById("ord").value ||
            n
        }
      );
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

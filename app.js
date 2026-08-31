// Royal Karaoke SKN — corrected app.js
// Fixes the blank-screen error caused by reading J.no before a judge is selected.

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import { getDatabase, ref, set, update, onValue, get } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-database.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";

const fb = initializeApp(firebaseConfig);
const db = getDatabase(fb);
const auth = getAuth(fb);
const app = document.getElementById("app");

let D = {}, role = null, J = null, view = "home", draft = {};

const judges = {
  j1: {no: 1, name: "Judge 1"},
  j2: {no: 2, name: "Judge 2"},
  j3: {no: 3, name: "Judge 3"},
  j4: {no: 4, name: "Judge 4"},
  j5: {no: 5, name: "Judge 5"}
};

const demo = {
  c1:{number:1,name:"Sarah Jones",category:"Female",song:"Example Song",order:1},
  c2:{number:2,name:"John Smith",category:"Male",song:"Example Song",order:2},
  c3:{number:3,name:"Mary & James",category:"Duet",song:"Example Song",order:3},
  c4:{number:4,name:"Team SKN",category:"Team",song:"Example Song",order:4},
  c5:{number:5,name:"Michael Brown",category:"Male",song:"Example Song",order:5},
  c6:{number:6,name:"Lisa Williams",category:"Female",song:"Example Song",order:6}
};

async function boot() {
  try {
    await signInAnonymously(auth);
  } catch (e) {
    console.error(e);
    app.innerHTML = `<div class="wrap"><div class="card">
      <h1>Royal Karaoke SKN</h1><h2>Firebase Authentication Problem</h2>
      <p>${e.message || e}</p>
      <p>Check Firebase Authentication → Sign-in providers → Anonymous.</p>
    </div></div>`;
    return;
  }

  onValue(ref(db, "event"), s => {
    D = s.val() || {};
    if (!D.contestants) seed();
    render();
  }, e => {
    console.error(e);
    app.innerHTML = `<div class="wrap"><div class="card">
      <h1>Royal Karaoke SKN</h1><h2>Firebase Database Problem</h2>
      <p>${e.message || e}</p>
      <p>Check that Realtime Database is enabled and its rules allow the prototype to connect.</p>
    </div></div>`;
  });
}

async function seed() {
  if ((await get(ref(db, "event"))).exists()) return;
  await set(ref(db, "event"), {
    name:"Royal Karaoke SKN Championship — Test Event",
    venue:"Test Venue",
    date:"2026-08-29",
    active:"c1",
    finalized:false,
    contestants:demo,
    judges
  });
}

const cs = () => Object.entries(D.contestants || {})
  .map(([id,x]) => ({id,...x}))
  .sort((a,b) => a.order-b.order);

const ss = () => D.scores || {};

function head() {
  // IMPORTANT FIX: never read J.no unless J exists.
  const badge = role === "auditor"
    ? "AUDITOR"
    : role === "judge" && J
      ? `JUDGE ${J.no}`
      : "WELCOME";

  return `<div class="top"><b>🎤 ROYAL KARAOKE SKN<br>
    <small>DIGITAL JUDGING • ONLINE</small></b>
    <span class="pill">${badge}</span>
  </div>`;
}

function nav() {
  return `<div class="nav">${[
    ["home","Dashboard"],
    ["contestants","Contestants"],
    ["live","Live Scores"],
    ["results","Results"]
  ].map(x => `<button onclick="view='${x[0]}';render()">${x[1]}</button>`).join("")}</div>`;
}

function dashboard() {
  const a = D.contestants?.[D.active];
  if (!a) return `<div class="card"><h2>No active contestant</h2></div>`;

  return `<h1>Auditor Dashboard</h1>
  <div class="grid">
    <div class="card"><span class="muted">Competition</span><h2>${D.name}</h2><span class="ok">🟢 LIVE</span></div>
    <div class="card"><span class="muted">Current Performance</span><div class="big">#${a.number}</div><h2>${a.name}</h2><span class="pill">${a.category}</span></div>
    <div class="card"><h3>Judge Status</h3>
      ${Object.entries(D.judges || judges).map(([id,j]) =>
        `<div>${j.name} — ${ss()[D.active]?.[id] ? "<span class='ok'>✅ Submitted</span>" : "<span class='warn'>⏳ Waiting</span>"}</div>`
      ).join("")}
    </div>
  </div>
  <div class="card"><h3>Activate Performance</h3>
    <select id="act">${cs().map(c =>
      `<option value="${c.id}" ${c.id === D.active ? "selected" : ""}>#${c.number} — ${c.name}</option>`
    ).join("")}</select>
    <button class="primary" onclick="activate()">ACTIVATE</button>
  </div>`;
}

async function activate() {
  const el = document.getElementById("act");
  if (el) await update(ref(db, "event"), {active: el.value});
}

function contestants() {
  return `<h1>Contestants</h1><div class="card"><table>
    <tr><th>#</th><th>Name</th><th>Category</th><th>Song</th></tr>
    ${cs().map(c => `<tr><td>${c.number}</td><td>${c.name}</td><td>${c.category}</td><td>${c.song}</td></tr>`).join("")}
  </table></div>`;
}

function live() {
  return `<h1>Live Scores</h1><div class="grid">
    ${Object.entries(D.judges || judges).map(([id,j]) => {
      const s = ss()[D.active]?.[id];
      return `<div class="card"><h2>${j.name}</h2>${
        s ? `<div class="big">${s.total}/60</div><span class="ok">Submitted</span>`
          : "<span class='warn'>Waiting</span>"
      }</div>`;
    }).join("")}
  </div>`;
}

function results() {
  const r = cs().map(c => {
    const a = Object.values(ss()[c.id] || {});
    const avg = a.length ? a.reduce((x,s) => x+s.total,0)/a.length : 0;
    return {...c, avg:+avg.toFixed(2), n:a.length};
  }).sort((a,b) => b.avg-a.avg);

  return `<h1>Results</h1>
  <div class="grid">${["Male","Female","Duet","Team"].map(cat => {
    const w = r.find(x => x.category === cat && x.n > 0);
    return `<div class="card"><span class="muted">BEST ${cat.toUpperCase()}</span>
      <h2>${w?.name || "—"}</h2><div class="big">${w ? w.avg : "—"}</div></div>`;
  }).join("")}</div>
  <div class="card"><table><tr><th>Rank</th><th>Name</th><th>Category</th><th>Judges</th><th>Average</th></tr>
  ${r.map((x,i) => `<tr><td>${i+1}</td><td>${x.name}</td><td>${x.category}</td><td>${x.n}</td><td>${x.avg}</td></tr>`).join("")}
  </table></div>`;
}

function crit(k,l) {
  return `<b>${l}</b><div class="scoregrid">${[1,2,3,4,5,6,7,8,9,10].map(n =>
    `<button class="${draft[k] === n ? "selected" : ""}" onclick="draft['${k}']=${n};render()">${n}</button>`
  ).join("")}</div>`;
}

function tot() {
  return ["vocal","pitch","timing","interpretation","stage","audience"]
    .reduce((a,k) => a+(draft[k] || 0),0);
}

function judgePage() {
  const a = D.contestants?.[D.active];
  if (!a) return `<div class="card"><h2>Waiting for the auditor</h2></div>`;

  const old = J ? ss()[D.active]?.[J.id] : null;

  if (old) return `<div class="card" style="text-align:center">
    <div class="big">#${a.number}</div><h2>${a.name}</h2>
    <div class="big">${old.total}/60</div>
    <p class="ok">✅ Score submitted and locked.</p>
    <p>Waiting for the auditor to activate the next performance.</p>
  </div>`;

  return `<div class="card" style="text-align:center">
    <div class="big">#${a.number}</div><h2>${a.name}</h2>
    <span class="pill">${a.category}</span><p>🎵 ${a.song}</p>
  </div>
  <div class="card">
    ${crit("vocal","Vocal Ability")}
    ${crit("pitch","Pitch")}
    ${crit("timing","Timing / Rhythm")}
    ${crit("interpretation","Song Interpretation")}
    ${crit("stage","Stage Presence")}
    ${crit("audience","Audience Engagement")}
    <h2>Total: ${tot()}/60</h2>
    <button class="primary" onclick="submitScore()">SUBMIT SCORE</button>
  </div>`;
}

async function submitScore() {
  const k = ["vocal","pitch","timing","interpretation","stage","audience"];
  if (k.some(x => !draft[x])) return alert("Score every category.");
  if (!confirm("Submit this score? It will be locked.")) return;

  await set(ref(db, `event/scores/${D.active}/${J.id}`), {
    ...draft,
    total:tot(),
    submittedAt:Date.now()
  });
  draft = {};
}

function login() {
  return `<div class="card" style="max-width:560px;margin:60px auto;text-align:center">
    <div class="big">🎤</div><h1>Royal Karaoke SKN</h1>
    <p>Digital Judging System</p>
    <button class="primary" onclick="role='auditor';view='home';render()">AUDITOR</button>
    <h3>Judges</h3>
    ${Object.entries(judges).map(([id,j]) =>
      `<button onclick="role='judge';J={id:'${id}',no:${j.no},name:'${j.name}'};view='score';render()">${j.name}</button>`
    ).join("")}
  </div>`;
}

function render() {
  if (!D.name) {
    app.innerHTML = `<div class="wrap"><div class="card"><h1>Connecting to Royal Karaoke SKN…</h1></div></div>`;
    return;
  }

  let body;
  if (!role) body = login();
  else if (role === "auditor") {
    const pages = {home:dashboard, contestants, live, results};
    body = nav() + (pages[view] || dashboard)();
  } else {
    body = judgePage();
  }

  app.innerHTML = head() + `<div class="wrap">${body}</div>`;
}

Object.assign(window, {render,activate,submitScore});
boot();

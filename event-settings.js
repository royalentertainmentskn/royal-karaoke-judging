import {
initializeApp
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";

import {
getDatabase,
ref,
get,
update
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-database.js";

import {
getAuth,
signInAnonymously
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";

import {
firebaseConfig
} from "./firebase-config.js";

/* =========================================================
FIREBASE
========================================================= */

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

/* =========================================================
ELEMENTS
========================================================= */

const loading = document.getElementById("loading");
const form = document.getElementById("settingsForm");

const competitionName =
document.getElementById("competitionName");

const venue =
document.getElementById("venue");

const eventDate =
document.getElementById("eventDate");

const status =
document.getElementById("status");

const backButton =
document.getElementById("backButton");

/* =========================================================
STATUS MESSAGE
========================================================= */

function showStatus(message, type = "success") {

status.textContent = message;

status.className =
`status ${type}`;

}

/* =========================================================
LOAD EVENT SETTINGS
========================================================= */

async function loadEventSettings() {

try {

```
loading.style.display = "block";
form.style.display = "none";

const snapshot =
  await get(ref(db, "event"));

const event =
  snapshot.exists()
    ? snapshot.val()
    : {};

competitionName.value =
  event.name ||
  event.competitionName ||
  "Royal Karaoke SKN Championship";

venue.value =
  event.venue ||
  "";

eventDate.value =
  event.eventDate ||
  "";

loading.style.display = "none";
form.style.display = "block";
```

} catch (error) {

```
console.error(
  "Unable to load event settings:",
  error
);

loading.textContent =
  "Unable to load the event information.";

showStatus(
  error.message ||
  "Unable to load event settings.",
  "error"
);
```

}

}

/* =========================================================
SAVE EVENT SETTINGS
========================================================= */

async function saveEventSettings(event) {

event.preventDefault();

const name =
competitionName.value.trim();

const venueName =
venue.value.trim();

const date =
eventDate.value.trim();

if (!name) {

```
showStatus(
  "Please enter a competition name.",
  "error"
);

competitionName.focus();

return;
```

}

try {

```
const updates = {

  "event/name":
    name,

  "event/competitionName":
    name,

  "event/venue":
    venueName,

  "event/eventDate":
    date

};

await update(
  ref(db),
  updates
);

showStatus(
  "Event details saved successfully.",
  "success"
);
```

} catch (error) {

```
console.error(
  "Unable to save event settings:",
  error
);

showStatus(
  error.message ||
  "Unable to save event settings.",
  "error"
);
```

}

}

/* =========================================================
BACK TO AUDITOR
========================================================= */

function goBack() {

window.location.href =
"index.html";

}

/* =========================================================
START APPLICATION
========================================================= */

async function start() {

try {

```
await signInAnonymously(auth);

await loadEventSettings();
```

} catch (error) {

```
console.error(
  "Event Settings startup error:",
  error
);

loading.textContent =
  "Unable to connect to the competition database.";

showStatus(
  error.message ||
  "Unable to connect to Firebase.",
  "error"
);
```

}

}

/* =========================================================
EVENTS
========================================================= */

form.addEventListener(
"submit",
saveEventSettings
);

backButton.addEventListener(
"click",
goBack
);

/* =========================================================
RUN
========================================================= */

start();

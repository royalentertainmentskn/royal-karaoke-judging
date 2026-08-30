ONLINE VERSION — ROYAL KARAOKE SKN

This version does NOT use Python, Terminal, localhost, port 8080, or your Mac as a server.

It uses Firebase Realtime Database, which is cloud-hosted and synchronizes data to connected browsers in real time.

ONE-TIME SETUP:
1. Create a Firebase project at https://console.firebase.google.com/
2. Add a Web App.
3. Enable Authentication > Anonymous.
4. Create Realtime Database.
5. For initial testing only, use Firebase test mode.
6. Copy the Web App configuration into firebase-config.js.
7. Upload this folder to GitHub and enable GitHub Pages (or another static web host).

Then every tablet simply opens the website URL.

TEST ROLES:
Auditor
Judge 1
Judge 2
Judge 3
Judge 4
Judge 5

FUNCTIONS:
- Auditor activates contestants
- Judges score independently
- Scores synchronize online
- Auditor sees submission status
- Overall ranking
- Best Male
- Best Female
- Best Duet
- Best Team

IMPORTANT:
The login in this prototype is intentionally simple. Before a live competition, add secure judge PINs/accounts and Firebase Security Rules so judges can only write their own scores and cannot read other judges' scores.

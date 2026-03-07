BL TICK-R Block 2

Neu anlegen:
- server/services/pushService.js
- server/services/pollService.js
- server/routes/admin.js
- server/routes/pushTest.js

Ersetzen:
- server/server.js

Danach prüfen:
- /health
- /admin/subscriptions ohne Header -> 401
- /push-test

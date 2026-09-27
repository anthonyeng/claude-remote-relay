# Claude Remote relay

A 70-line WebSocket relay so the phone never needs a VPN. The Mac bridge dials out to the relay
(`RELAY_URL` in `bridge/.env`), the phone dials the same relay, and the relay forwards between the
two sides that share a token. It keeps nothing.

Run locally: `npm install && npm start` (port 3300). Deploy: Render web service, root `relay/`,
build `npm install`, start `npm start`. Free plan sleeps after 15 idle minutes; Starter does not.

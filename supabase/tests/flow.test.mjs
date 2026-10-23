import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import assert from "node:assert/strict";

import { fileURLToPath } from "node:url";
const mig = fileURLToPath(new URL("../migrations/", import.meta.url));
const db = new PGlite();
await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
`);
for (const f of fs.readdirSync(mig).sort()) await db.exec(fs.readFileSync(mig + f, "utf8"));

const U = ["a", "b", "c", "d"].map((x, i) => `0000000${i + 1}-0000-0000-0000-00000000000${i + 1}`);
const as = async (u, sql, params) => {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [u]);
  return (await db.query(sql, params)).rows;
};
const rpc = async (u, fn, ...args) => {
  const ph = args.map((_, i) => `$${i + 1}`).join(",");
  const rows = await as(u, `select public.${fn}(${ph}) as r`, args);
  return rows[0].r;
};
const fails = async (p, msg) => {
  try { await p; } catch (e) { assert.match(String(e.message), new RegExp(msg), `expected ${msg}, got ${e.message}`); return; }
  assert.fail(`expected failure ${msg}`);
};
const state = (u, code) => rpc(u, "get_room_state", code);

// --- room + joining
const { code } = await rpc(U[0], "create_room", "Alice", "🦊");
console.log("room", code);
await fails(rpc(U[1], "get_room_state", code), "not_member");
await rpc(U[1], "join_room", code.toLowerCase(), "Bob", "🐼");
await fails(rpc(U[2], "join_room", code, "bob", "x"), "name_taken");
await rpc(U[2], "join_room", code, "Cara", "🦄");
let s = await state(U[0], code);
assert.equal(s.players.length, 3);
assert.equal(s.me.is_host, true);

// --- host permissions
await fails(rpc(U[1], "start_round", code, "most_likely"), "not_host");
await fails(rpc(U[1], "kick_player", code, s.players[2].id), "not_host");
await fails(rpc(U[1], "update_settings", code, "spicy", null), "not_host");
await rpc(U[0], "update_settings", code, "friendly", null);
await rpc(U[0], "update_settings", code, "spicy", null);

// --- most likely
await rpc(U[0], "start_round", code, "most_likely");
s = await state(U[1], code);
assert.equal(s.round.phase, "collecting");
const [pa, pb, pc] = s.players.map((p) => p.id);
await fails(rpc(U[0], "submit_entry", code, null, pa, true), "invalid_target"); // self
await rpc(U[0], "submit_entry", code, null, pb, true);
await fails(rpc(U[0], "submit_entry", code, null, pc, true), "already_submitted");
await rpc(U[1], "submit_entry", code, null, pc, true);
s = await state(U[2], code);
assert.equal(s.round.phase, "collecting");
assert.equal(s.submitted.length, 2);
assert.equal(s.my_entry, null);
await rpc(U[2], "submit_entry", code, null, pb, true);
s = await state(U[2], code);
assert.equal(s.round.phase, "reveal");
assert.deepEqual(s.round.payload.winners, [pb]);
assert.equal(s.round.payload.tally[0].votes, 2);
assert.ok(!JSON.stringify(s.round.payload).includes("voter"));

// --- RLS: other users cannot read entries; nobody can write directly
await db.exec(`set role authenticated`);
let rows = await as(U[1], `select user_id from public.entries`);
assert.ok(rows.every((r) => r.user_id === U[1]), "entries leak!");
assert.equal(rows.length, 1);
await fails(as(U[1], `insert into public.rooms (code, host_user_id) values ('ZZZZZZ', $1)`, [U[1]]), "permission denied");
await fails(as(U[1], `update public.players set name='x'`), "permission denied");
await fails(as(U[1], `select public._advance(gen_random_uuid())`), "permission denied");
rows = await as(U[3], `select id from public.rooms`);   // outsider sees nothing
assert.equal(rows.length, 0);
rows = await as(U[1], `select id from public.rooms`);
assert.equal(rows.length, 1);
await db.exec(`reset role`);

// --- confessions
await rpc(U[0], "start_round", code, "confessions");
await fails(rpc(U[0], "submit_entry", code, "   ", null, true), "invalid_content");
await rpc(U[0], "submit_entry", code, "I ate the last slice", null, false);
await rpc(U[1], "submit_entry", code, "I peed in the pool", null, true);
s = await state(U[0], code);
assert.equal(s.round.phase, "collecting");
await rpc(U[0], "host_advance", code); // host forces reveal with 2/3
s = await state(U[2], code);
assert.equal(s.round.phase, "reveal");
assert.equal(s.round.payload.items.length, 2);
assert.ok(s.round.payload.items.every((i) => i.player_id === null), "confession author leaked");
assert.equal(s.round.cursor, 1);
await rpc(U[0], "host_advance", code);
s = await state(U[2], code);
assert.equal(s.round.cursor, 2);
await fails(rpc(U[0], "host_advance", code), "no_more_items");

// --- truth or spill (public vs anonymous)
await rpc(U[0], "start_round", code, "truth_or_spill");
await rpc(U[0], "submit_entry", code, "public answer", null, false);
await rpc(U[1], "submit_entry", code, "secret answer", null, true);
await rpc(U[2], "submit_entry", code, "another secret", null, true);
s = await state(U[1], code);
const items = s.round.payload.items;
assert.equal(items.find((i) => i.text === "public answer").player_id, pa);
assert.equal(items.find((i) => i.text === "secret answer").player_id, null);

// --- guess who (+ auto rotate)
await rpc(U[0], "start_round", code, "guess_who");
await rpc(U[0], "submit_entry", code, "stmt A", null, true);
await rpc(U[1], "submit_entry", code, "stmt B", null, true);
await rpc(U[2], "submit_entry", code, "stmt C", null, true);
s = await state(U[0], code);
assert.equal(s.round.phase, "guessing");
assert.equal(s.round.payload.total, 3);
assert.equal(s.round.payload.order, undefined);
const authorOf = { "stmt A": [U[0], pa], "stmt B": [U[1], pb], "stmt C": [U[2], pc] };
const all = [[U[0], pa], [U[1], pb], [U[2], pc]];
for (let i = 0; i < 3; i++) {
  s = await state(U[0], code);
  assert.equal(s.round.cursor, i);
  const [authU, authP] = authorOf[s.round.payload.current_text];
  const sa = await state(authU, code);
  assert.equal(sa.round.is_my_statement, true);
  await fails(rpc(authU, "submit_entry", code, null, pa === authP ? pb : pa, true), "author_cannot_guess");
  const guessers = all.filter(([u]) => u !== authU);
  // first guesser right, second wrong
  const wrongTarget = all.find(([, p]) => p !== authP && p !== guessers[1][1])[1];
  await rpc(guessers[0][0], "submit_entry", code, null, authP, true);
  s = await state(U[0], code);
  assert.equal(s.round.phase, "guessing");
  await rpc(guessers[1][0], "submit_entry", code, null, wrongTarget, true);
  s = await state(U[0], code);
  assert.equal(s.round.phase, "reveal", "auto reveal after all guessers");
  const res = s.round.payload.results[i];
  assert.equal(res.author_id, authP);
  assert.deepEqual(res.correct_ids, [guessers[0][1]]);
  await rpc(U[0], "host_advance", code);
}
s = await state(U[0], code);
assert.equal(s.round.phase, "finished");
assert.equal(s.round.payload.scores.reduce((n, x) => n + x.correct, 0), 3);

// hidden author when reveal_author=false
await rpc(U[0], "update_settings", code, null, false);
await rpc(U[0], "start_round", code, "guess_who");
for (let k = 0; k < 3; k++) await rpc(U[k], "submit_entry", code, "x" + k, null, true);
s = await state(U[0], code);
// whoever is current author: just let everyone else guess
const cur = s.round.payload.current_text;
const au = [U[0], U[1], U[2]][Number(cur.slice(1))];
for (const [u, p] of [[U[0], pa], [U[1], pb], [U[2], pc]].filter(([u]) => u !== au)) await rpc(u, "submit_entry", code, null, p === pa ? pb : pa, true);
s = await state(U[0], code);
assert.equal(s.round.phase, "reveal");
assert.equal(s.round.payload.results[0].author_id, null);
assert.deepEqual(s.round.payload.results[0].correct_ids, []);

// --- room decides rotation
const seen = new Set();
for (let i = 0; i < 4; i++) {
  await rpc(U[0], "start_round", code, "room_decides");
  s = await state(U[0], code);
  seen.add(s.round.game);
}
console.log("rotation games:", [...seen]);
assert.ok(seen.size >= 3);
assert.equal(s.room.auto_rotate, true);

// --- kick / leave / host migration / end
await fails(rpc(U[0], "kick_player", code, pa), "cannot_kick_self");
await rpc(U[0], "kick_player", code, pc);
await fails(state(U[2], code), "not_member");
await rpc(U[0], "end_game", code);
s = await state(U[0], code);
assert.equal(s.room.status, "lobby");
assert.equal(s.round, null);
await rpc(U[0], "leave_room", code);
s = await state(U[1], code);
assert.equal(s.me.is_host, true, "host migrated");
await rpc(U[1], "leave_room", code);
rows = await db.query(`select count(*)::int c from public.rooms`);
assert.equal(rows.rows[0].c, 0);
console.log("rooms left:", rows.rows[0].c);
console.log("ALL OK");

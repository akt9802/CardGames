import { createBluff, applyBluff, resolveBluffTimeout } from "../server/engine/bluff.ts";
import { createCallBreak, applyCallBreak, legalCallBreakCards } from "../server/engine/callBreak.ts";
import { createCabo, applyCabo } from "../server/engine/cabo.ts";
import { createMendi, applyMendi, legalMendiCards } from "../server/engine/mendi.ts";
import { botAction } from "../server/engine/bots.ts";

function names(n: number) {
  return Array.from({ length: n }, (_, i) => `P${i}`);
}

function playBluff(seats: number) {
  let state = createBluff(seats);
  const n = seats;
  const nm = names(n);
  let steps = 0;
  while (state.phase !== "over" && steps++ < 400) {
    if (state.phase === "challenge") {
      const actor = (state.lastPlay!.seat + 1) % n;
      const act = botAction(state, actor);
      if (act?.type === "bluff.call") {
        const res = applyBluff(state, act, actor, n, nm);
        if (res.error) state = resolveBluffTimeout(state, n, nm);
        else state = res.state;
      } else {
        state = resolveBluffTimeout(state, n, nm);
      }
      continue;
    }
    const act = botAction(state, state.currentSeat);
    if (!act) break;
    const res = applyBluff(state, act, state.currentSeat, n, nm);
    if (res.error) {
      const pass = applyBluff(state, { type: "bluff.pass" }, state.currentSeat, n, nm);
      if (pass.error) throw new Error(`bluff stuck ${seats}: ${res.error} / ${pass.error} phase=${state.phase}`);
      state = pass.state;
    } else state = res.state;
  }
  if (state.phase !== "over") throw new Error(`bluff ${seats} did not finish (${state.phase}, ${steps})`);
  console.log("bluff", seats, "winner", state.winnerSeat, "steps", steps);
}

function playCall(seats: number, mode: "classic" | "power" | "cut" = "classic") {
  let state = createCallBreak(seats, 3, mode);
  const n = seats;
  const nm = names(n);
  let steps = 0;
  while (state.phase !== "over" && steps++ < 1200) {
    if (state.phase === "showPower") {
      state = applyCallBreak(state, { type: "table.advance" }, 0, n, nm).state;
      continue;
    }
    if (state.phase === "holding") {
      state = applyCallBreak(state, { type: "table.collect" }, 0, n, nm).state;
      continue;
    }
    if (state.phase === "roundEnd") {
      const res = applyCallBreak(state, { type: "callBreak.call", tricks: 1 }, state.currentSeat, n, nm);
      if (res.error) throw new Error(res.error);
      state = res.state;
      continue;
    }
    const act = botAction(state, state.currentSeat);
    if (!act) throw new Error(`no bot action ${state.phase}`);
    const res = applyCallBreak(state, act, state.currentSeat, n, nm);
    if (res.error) {
      const legal = legalCallBreakCards(state, state.currentSeat);
      const retry = applyCallBreak(state, { type: "callBreak.play", cardId: legal[0].id }, state.currentSeat, n, nm);
      if (retry.error) throw new Error(`call ${seats}: ${res.error} / ${retry.error}`);
      state = retry.state;
    } else state = res.state;
  }
  if (state.phase !== "over") throw new Error(`call ${seats} ${mode} did not finish ${state.phase} ${steps}`);
  console.log("callBreak", seats, mode, "winner", state.winnerSeat, "steps", steps);
}

function playMendi(seats: number, mode: "classic" | "power" | "cut" = "classic") {
  let state = createMendi(seats, 2, mode);
  const n = seats;
  const nm = names(n);
  let steps = 0;
  while (state.phase !== "over" && steps++ < 1600) {
    if (state.phase === "showPower") {
      state = applyMendi(state, { type: "table.advance" }, 0, n, nm).state;
      continue;
    }
    if (state.phase === "holding") {
      state = applyMendi(state, { type: "table.collect" }, 0, n, nm).state;
      continue;
    }
    if (state.phase === "handEnd") {
      const res = applyMendi(state, { type: "mendi.play", cardId: "x" }, state.currentSeat, n, nm);
      if (res.error) throw new Error(res.error);
      state = res.state;
      continue;
    }
    const act = botAction(state, state.currentSeat);
    if (!act) throw new Error(`no bot ${state.phase}`);
    const res = applyMendi(state, act, state.currentSeat, n, nm);
    if (res.error) {
      if (state.phase === "trick") {
        const legal = legalMendiCards(state, state.currentSeat);
        const retry = applyMendi(state, { type: "mendi.play", cardId: legal[0].id }, state.currentSeat, n, nm);
        if (retry.error) throw new Error(`mendi ${seats}: ${res.error} / ${retry.error}`);
        state = retry.state;
      } else {
        throw new Error(`mendi ${seats}: ${res.error} ${state.phase}`);
      }
    } else state = res.state;
  }
  if (state.phase !== "over") throw new Error(`mendi ${seats} ${mode} did not finish ${state.phase} ${steps} ${state.lastResult}`);
  console.log("mendi", seats, mode, "winner", state.winnerTeam, state.teamHands, "steps", steps);
}

function playCabo(seats: number) {
  let state = createCabo(seats);
  const n = seats;
  const nm = names(n);
  let steps = 0;
  while (state.phase !== "over" && steps++ < 800) {
    if (state.phase === "showing") {
      const res = applyCabo(state, { type: "table.advance" }, state.currentSeat, n, nm);
      if (res.error) throw new Error(res.error);
      state = res.state;
      continue;
    }
    if (state.phase === "peek") {
      for (let i = 0; i < n; i++) {
        if (!state.peeked[i]) {
          const res = applyCabo(state, { type: "cabo.peekDone" }, i, n, nm);
          if (res.error) throw new Error(res.error);
          state = res.state;
        }
      }
      continue;
    }
    const act = botAction(state, state.currentSeat);
    if (!act) throw new Error(`cabo no bot ${state.phase}`);
    const res = applyCabo(state, act, state.currentSeat, n, nm);
    if (res.error) {
      if (state.phase === "drawn") {
        state = applyCabo(state, { type: "cabo.discardDrawn" }, state.currentSeat, n, nm).state;
      } else throw new Error(`cabo ${seats}: ${res.error} ${state.phase}`);
    } else state = res.state;
  }
  if (state.phase !== "over") throw new Error(`cabo ${seats} stuck ${state.phase} ${steps}`);
  console.log("cabo", seats, "winner", state.winnerSeat, "scores", state.scores, "steps", steps);
}

playBluff(4);
playCall(4, "classic");
playCall(4, "power");
playCall(4, "cut");
playMendi(4, "classic");
playMendi(4, "cut");
playMendi(6, "power");
playCabo(3);
console.log("all engines ok");

import { LabyrinthGame } from "./game.js";

const $ = (id) => document.getElementById(id);

const canvas = $("game-canvas");

const game = new LabyrinthGame({
  canvas,
  ui: {
    hud: $("hud"),
    lives: $("lives"),
    levelLabel: $("level-label"),
    titleScreen: $("title-screen"),
    pauseScreen: $("pause-screen"),
    lifeLostScreen: $("life-lost-screen"),
    winScreen: $("win-screen"),
    gameoverScreen: $("gameover-screen"),
    tiltHint: $("tilt-hint"),
    desktopHint: $("desktop-hint"),
    gyroNote: $("gyro-note"),
    btnStart: $("btn-start"),
    btnResume: $("btn-resume"),
    btnRestart: $("btn-restart"),
    btnContinueLife: $("btn-continue-life"),
    btnReplay: $("btn-replay"),
    btnGameoverRestart: $("btn-gameover-restart"),
    btnPause: $("btn-pause"),
    lifeLostTitle: $("life-lost-title"),
    lifeLostCopy: $("life-lost-copy"),
  },
});

// Expose for manual testing / console
window.__labyrinth = game;

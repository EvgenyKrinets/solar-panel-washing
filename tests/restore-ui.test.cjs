const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function loadCard() {
  const classes = new Map();
  const context = {
    HTMLElement: class {},
    customElements: {
      get: name => classes.get(name),
      define: (name, klass) => classes.set(name, klass),
    },
    window: { customCards: [] },
    console: { info() {} },
  };
  const code = fs.readFileSync("custom_components/solar_panel_washing_dashboard/solar-panel-washing.js", "utf8");
  vm.runInNewContext(code, context, { filename: "solar-panel-washing.js" });
  const Card = classes.get("solar-panel-washing-card");
  assert.ok(Card, "dashboard custom element is registered");
  const card = new Card();
  card.config = { language: "ru" };
  card._hass = { states: {} };
  card._restoreOpen = true;
  return card;
}

test("Unix seconds, numeric string, milliseconds, and ISO time all display as 2026", () => {
  const card = loadCard();
  const millis = Date.parse("2026-10-18T09:25:00Z");
  const seconds = millis / 1000;
  for (const value of [seconds, String(seconds), millis, new Date(millis).toISOString()]) {
    assert.equal(card.historyDate(value)?.getTime(), millis);
    assert.match(card.historyTimeText(value), /2026/);
    assert.doesNotMatch(card.historyTimeText(value), /1970/);
  }
  for (const value of [null, "", "not-a-time", 1000, NaN, Infinity]) {
    assert.equal(card.historyDate(value), null);
  }
});

test("Latest saved settings shows only its own confirmation", () => {
  const card = loadCard();
  card._restoreMode = "latest";
  const html = card.restorePanel();
  assert.match(html, /data-restore-toggle/);
  assert.match(html, /data-restore-method/);
  assert.match(html, /data-restore-confirm-latest/);
  assert.doesNotMatch(html, /data-restore-confirm-history|data-restore-datetime|data-restore-load/);
  assert.match(html, /настройки и счётчики/);
});

test("Dated history shows only counter recovery, not full settings recovery", () => {
  const card = loadCard();
  card._restoreMode = "history";
  const html = card.restorePanel();
  assert.match(html, /data-restore-method/);
  assert.match(html, /data-restore-datetime/);
  assert.match(html, /data-restore-load/);
  assert.doesNotMatch(html, /data-restore-confirm-latest/);
  assert.match(html, /только 7 счётчиков воды/);
  card._restorePreview = Array.from({ length: 7 }, (_, i) => ({
    value: i + 1, time: Date.parse("2026-10-18T09:25:00Z") / 1000,
  }));
  const withPreview = card.restorePanel();
  assert.match(withPreview, /data-restore-confirm-history/);
  assert.doesNotMatch(withPreview, /1970/);
  assert.match(withPreview, /2026/);
});

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
    window: { customCards: [], confirm: () => true },
    console: { info() {} },
    clearTimeout, setTimeout,
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

test("One restoration menu exposes only date/time and historical load", () => {
  const card=loadCard();
  card._restoreMode="latest"; // Former mode must be ignored.
  const html=card.restorePanel();
  assert.match(html,/data-restore-datetime/);
  assert.match(html,/data-restore-load/);
  assert.doesNotMatch(html,/data-restore-method|data-restore-confirm-latest|data-restore-settings-now/);
  assert.match(html,/все настройки и 7 счётчиков/);
  const settings=card.fullHistorySettings();
  assert.equal(settings.length,45);
  assert.equal(new Set(settings).size,45);
  assert.equal(settings.filter(id=>id.startsWith("switch.")).length,14);
  assert.equal(settings.filter(id=>id.startsWith("select.")).length,8);
  assert.equal(settings.filter(id=>id.startsWith("number.")).length,23);
});

test("Recorder loads all settings and counters at the same selected time",async()=>{
  const card=loadCard();
  card._restoreAt="2026-10-18T09:25";
  card.querySelector=()=>null;
  card.render=()=>{};
  card._hass.callWS=async msg=>{
    assert.equal(msg.type,"history/history_during_period");
    assert.equal(msg.entity_ids.length,52);
    return msg.entity_ids.map((id,i)=>[{
      entity_id:id,
      state:id.startsWith("switch.")?"on":id.startsWith("select.")?"Water":String(i+1),
      last_updated:"2026-10-18T09:24:59Z"
    }]);
  };
  await card.loadWaterHistory();
  assert.equal(Object.keys(card._restoreSettings).length,45);
  assert.equal(card._restorePreview.length,7);
  assert.equal(card._restorePreview[0].value,46);
  assert.match(card.restorePanel(),/data-restore-confirm-history/);
  assert.doesNotMatch(card.restorePanel(),/1970/);
});

test("Incomplete Recorder plus no durable complete HA snapshot cannot restore",async()=>{
  const card=loadCard();
  card._restoreAt="2026-10-18T09:25";
  card.querySelector=()=>null;
  card.render=()=>{};
  let count=0;
  card._hass.callWS=async msg=>{
    count++;
    if(msg.type==="solar_panel_washing_dashboard/controller_snapshot_at")return null;
    return [[]];
  };
  await card.loadWaterHistory();
  assert.equal(count,2);
  assert.equal(card._restorePreview,null);
  assert.equal(card._restoreSettings,null);
  assert.match(card._restoreError,/полной копии/);
});

test("Selected date restores all 45 settings and seven counters with one HA service",async()=>{
  const card=loadCard();
  card._restorePreview=Array.from({length:7},(_,i)=>({value:i+1,time:"2026-10-18T09:25:00Z"}));
  card._restoreSettings=Object.fromEntries(card.fullHistorySettings().map(id=>[id,id.startsWith("switch.")?"off":id.startsWith("select.")?"Water":10]));
  card._restoreStamp="2026-10-18T09:25:00Z";
  card._restoreAt="2026-10-18T09:25";
  card.state=()=> "off";
  card.render=()=>{};
  const requests=[];
  card._hass.services={solar_panel_washing_dashboard:{restore_historical_state:{}}};
  card._hass.callService=async(domain,service,payload)=>{requests.push({domain,service,payload});};
  await card.restoreWaterHistory();
  assert.equal(requests.length,1);
  assert.equal(requests[0].domain,"solar_panel_washing_dashboard");
  assert.equal(requests[0].service,"restore_historical_state");
  assert.equal(Object.keys(requests[0].payload.settings).length,45);
  assert.equal(requests[0].payload.counters.length,7);
  assert.equal(requests[0].payload.recorded_at,"2026-10-18T09:25:00Z");
});

test("Date picker stays mounted while HA reports new meter values and native popup moves focus", () => {
  const card=loadCard();
  const handlers=new Map();
  const input={
    value:"2026-10-20T17:30",
    matches:selector=>selector==="[data-restore-datetime]",
    closest:selector=>selector==="[data-restore-datetime]"?input:null
  };
  card.addEventListener=(type,handler)=>{
    const listeners=handlers.get(type)||[];
    listeners.push(handler);
    handlers.set(type,listeners);
  };
  card.querySelector=selector=>selector==="[data-restore-datetime]"?input:null;
  card.contains=()=>true;
  card.innerHTML="picker still mounted";
  card.connectedCallback();
  handlers.get("pointerdown")[0]({target:input});
  assert.equal(card._restoreDatePickerEngaged,true);
  assert.equal(card.isEditing(),true);
  // Native date/time popups may blur the HTML input. HA pushes another
  // sensor reading while the popup remains open.
  card.hass={states:{"sensor.solar_panel_washing_total_water":{state:"808.25",attributes:{}}},language:"ru"};
  card.render();
  assert.equal(card.innerHTML,"picker still mounted");
  assert.equal(card._restoreOpen,true);
  assert.equal(card._restoreAt,"2026-10-20T17:30");
  assert.equal(card._pendingRender,true);
  // Clicking Load History exits the native picker and allows an update.
  handlers.get("pointerdown")[0]({target:{closest:()=>null}});
  assert.equal(card._restoreDatePickerEngaged,false);
  assert.equal(card._restoreAt,"2026-10-20T17:30");
  assert.equal(card.isEditing(),false);
});

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
    matches:selector=>selector.includes("[data-restore-datetime]"),
    closest:selector=>selector.includes("[data-restore-datetime]")?input:null
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

test("Water Consumption offers week, month and custom dates without duplicate restore controls",()=>{
  const card=loadCard();
  const week=card.waterUsagePanel();
  assert.match(week,/data-water-period="week"/);
  assert.match(week,/data-water-period="month"/);
  assert.match(week,/data-water-period="custom"/);
  card._usageMode="custom";
  const custom=card.waterUsagePanel();
  assert.match(custom,/data-water-range-start/);
  assert.match(custom,/data-water-range-end/);
  assert.match(custom,/data-water-usage-load/);
  assert.doesNotMatch(custom,/data-restore-confirm/);
});

test("Meter usage is a positive difference, not the absolute cumulative total",()=>{
  const card=loadCard();
  const start=new Date("2026-10-19T00:00:00Z"),end=new Date("2026-10-19T10:00:00Z");
  const rows=[[
    {s:"808.20",lu:Date.parse("2026-10-18T23:59:59Z")/1000},
    {s:"820.40",lu:Date.parse("2026-10-19T02:00:00Z")/1000},
    {s:"823.91",lu:Date.parse("2026-10-19T08:00:00Z")/1000}
  ]];
  const r=card.waterUsageFromHistory(rows,start,end);
  assert.ok(Math.abs(r.value-15.71)<1e-9);
  assert.equal(r.approx,false);
  assert.equal(r.source,"history");
});

test("A counter reset is handled without negative usage",()=>{
  const card=loadCard();
  const start=new Date("2026-10-19T00:00:00Z"),end=new Date("2026-10-19T10:00:00Z");
  const r=card.waterUsageFromHistory([[
    {state:"1000",last_updated:"2026-10-18T23:59:00Z"},
    {state:"4",last_updated:"2026-10-19T01:00:00Z"},
    {state:"12",last_updated:"2026-10-19T08:00:00Z"}
  ]],start,end);
  assert.equal(r.value,0);
  assert.equal(r.resets,true);
  assert.equal(r.unresolvedReset,true);
  assert.equal(r.approx,true);
  const partial=card.waterUsageFromHistory([[{state:"9",last_updated:"2026-10-19T08:00:00Z"}]],start,end);
  assert.equal(partial.value,0);
  assert.equal(partial.partial,true);
  assert.equal(partial.approx,true);
});

test("Long-term hourly statistics support a month when Recorder was purged",()=>{
  const card=loadCard();
  const start=new Date("2026-09-20T00:00:00Z"),end=new Date("2026-10-20T00:00:00Z");
  const stats={"sensor.solar_panel_washing_total_water":[
    {end:Date.parse("2026-09-19T23:00:00Z"),sum:200},
    {end:Date.parse("2026-09-20T00:00:00Z"),sum:210},
    {end:Date.parse("2026-09-28T00:00:00Z"),sum:245},
    {end:Date.parse("2026-10-20T00:00:00Z"),sum:290}
  ]};
  const r=card.waterUsageFromStatistics(stats,start,end);
  assert.equal(r.value,80);
  assert.equal(r.approx,true);
  assert.throws(()=>card.waterUsageFromStatistics({"sensor.solar_panel_washing_total_water":[]},start,end));
});

test("Custom calendar and chosen times persist while new HA sensor states arrive",()=>{
  const card=loadCard();
  const handlers=new Map();
  const from={value:"2026-10-18T10:30",matches:x=>x.includes("[data-water-range-start]"),closest:x=>x.includes("[data-water-range-start]")?from:null};
  const to={value:"2026-10-20T13:45",matches:x=>x.includes("[data-water-range-end]"),closest:x=>x.includes("[data-water-range-end]")?to:null};
  card.addEventListener=(event,fn)=>handlers.set(event,[...(handlers.get(event)||[]),fn]);
  card.querySelector=selector=>selector==="[data-water-range-start]"?from:selector==="[data-water-range-end]"?to:null;
  card.contains=()=>true;
  card.innerHTML="calendar remains mounted";
  card.connectedCallback();
  handlers.get("pointerdown")[0]({target:from});
  card.hass={states:{"sensor.solar_panel_washing_total_water":{state:"999.99",attributes:{}}},language:"ru"};
  card.render();
  assert.equal(card._restoreDatePickerEngaged,true);
  assert.equal(card.innerHTML,"calendar remains mounted");
  assert.equal(card._usageStartAt,from.value);
  assert.equal(card._usageEndAt,to.value);
  handlers.get("pointerdown")[0]({target:to});
  card.render();
  assert.equal(card.innerHTML,"calendar remains mounted");
  handlers.get("pointerdown")[0]({target:{closest:()=>null}});
  assert.equal(card._restoreDatePickerEngaged,false);
  assert.equal(card._usageStartAt,from.value);
  assert.equal(card._usageEndAt,to.value);
});

test("Water usage never trusts corrupt hourly statistics after phantom meter reset",async()=>{
  const card=loadCard();card.render=()=>{};
  const calls=[];
  card._hass.callWS=async msg=>{
    calls.push(msg.type);
    if(msg.type==="recorder/statistics_during_period")
      throw Error("Hourly sum must not be requested");
    const before=new Date(Date.now()-11*86400000).toISOString();
    const after=new Date(Date.now()-30000).toISOString();
    const dip=new Date(Date.now()-4*86400000).toISOString();
    const restore=new Date(Date.now()-4*86400000+10000).toISOString();
    return [[
      {state:"0",last_updated:before},
      {state:"950",last_updated:new Date(Date.now()-8*86400000).toISOString()},
      {state:"0",last_updated:dip},
      {state:"950",last_updated:restore},
      {state:"1606.09",last_updated:after}
    ]];
  };
  await card.loadWaterUsage("month");
  assert.deepEqual(calls,["history/history_during_period"]);
  assert.equal(card._usageResult.value,1606.09);
  assert.equal(card._usageResult.resets,true);
  calls.length=0;
  await card.loadWaterUsage("week");
  assert.deepEqual(calls,["history/history_during_period"]);
  assert.ok(card._usageResult.value<=1606.09);
});

test("Transient 808 L drop and recovery adds no phantom litres",()=>{
  const card=loadCard();
  const start=new Date("2026-10-20T00:00:00Z");
  const end=new Date("2026-10-21T19:00:00Z");
  const records=[[
    {state:"690",last_updated:"2026-10-19T23:59:59Z"},
    {state:"808",last_updated:"2026-10-20T05:00:00Z"},
    {state:"0",last_updated:"2026-10-20T15:00:00Z"},
    {state:"808",last_updated:"2026-10-20T15:00:06Z"},
    {state:"924",last_updated:"2026-10-21T06:00:00Z"}
  ]];
  const result=card.waterUsageFromHistory(records,start,end);
  assert.equal(result.value,234);
  assert.equal(result.resets,true);
  assert.equal(result.unresolvedReset,false);
  assert.equal(result.approx,false);
  assert.match(card.t("Temporary counter drop ignored"),/Временное падение/);
});

test("Restored older value followed by recovery counts only new lifetime highs",()=>{
  const card=loadCard();
  const start=new Date("2026-10-20T00:00:00Z");
  const end=new Date("2026-10-21T19:00:00Z");
  const records=[[
    {s:"808",lu:Date.parse("2026-10-19T23:59:59Z")/1000},
    {s:"2",lu:Date.parse("2026-10-20T15:00:00Z")/1000},
    {s:"690",lu:Date.parse("2026-10-20T15:05:00Z")/1000},
    {s:"923.91",lu:Date.parse("2026-10-21T06:00:00Z")/1000}
  ]];
  const result=card.waterUsageFromHistory(records,start,end);
  assert.ok(Math.abs(result.value-115.91)<1e-8);
  assert.equal(result.unresolvedReset,false);
});

test("Missing start baseline is displayed as partial, not replaced by absent statistics",async()=>{
  const card=loadCard();
  card.render=()=>{};
  const seen=[];
  card._hass.callWS=async msg=>{
    seen.push(msg.type);
    if(msg.type==="history/history_during_period"){
      return [[
        {state:"1250",last_updated:new Date(Date.now()-5*86400000).toISOString()},
        {state:"1390",last_updated:new Date(Date.now()-4*86400000).toISOString()},
        {state:"1606.09",last_updated:new Date(Date.now()-60000).toISOString()}
      ]];
    }
    throw Error("No long-term statistics");
  };
  await card.loadWaterUsage("week");
  assert.equal(card._usageError,"");
  assert.equal(card._usageResult.partial,true);
  assert.equal(card._usageResult.approx,true);
  assert.ok(Math.abs(card._usageResult.value-356.09)<1e-7);
  assert.deepEqual(seen,["history/history_during_period"]);
});

test("A 23-day range reports available Recorder data instead of inflated HA sums",async()=>{
  const card=loadCard();card.render=()=>{};
  const seen=[];
  card._usageStartAt=card.localUsageTime(new Date(Date.now()-23*86400000));
  card._usageEndAt=card.localUsageTime(new Date(Date.now()-60000));
  card._hass.callWS=async msg=>{
    seen.push(msg.type);
    return [[
      {state:"0",last_updated:new Date(Date.now()-9*86400000).toISOString()},
      {state:"808",last_updated:new Date(Date.now()-6*86400000).toISOString()},
      {state:"0",last_updated:new Date(Date.now()-4*86400000).toISOString()},
      {state:"808",last_updated:new Date(Date.now()-4*86400000+5000).toISOString()},
      {state:"1606.09",last_updated:new Date(Date.now()-120000).toISOString()}
    ]];
  };
  await card.loadWaterUsage("custom");
  assert.equal(card._usageError,"");
  assert.equal(card._usageResult.value,1606.09);
  assert.equal(card._usageResult.partial,true);
  assert.deepEqual(seen,["history/history_during_period"]);
});


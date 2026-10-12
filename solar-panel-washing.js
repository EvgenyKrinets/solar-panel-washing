class SolarPanelWashingCard extends HTMLElement {
  setConfig(config) { this.config = config || {}; }
  connectedCallback() {
    if (this._interactionHandlersInstalled) return;
    this._interactionHandlersInstalled = true;
    this.addEventListener("pointerdown", () => {
      this._interacting = true;
      if (this._renderTimer) { clearTimeout(this._renderTimer); this._renderTimer = null; }
    }, true);
    const release = () => {
      clearTimeout(this._releaseTimer);
      this._releaseTimer = setTimeout(() => {
        this._interacting = false;
        if (this._pendingRender && !this.querySelector(".numinput:focus")) {
          this._pendingRender = false;
          this.render();
        }
      }, 300);
    };
    this.addEventListener("pointerup", release, true);
    this.addEventListener("pointercancel", release, true);
    this.addEventListener("pointerleave", release, true);
  }
  set hass(hass) {
    this._hass = hass;
    if (this._interacting || this.querySelector(".numinput:focus")) { this._pendingRender = true; return; }
    clearTimeout(this._renderTimer);
    this._renderTimer = setTimeout(() => { if (this.querySelector(".numinput:focus")) { this._pendingRender = true; return; } this.render(); }, 40);
  }
  getCardSize() { return 12; }
  e(id){ return this._hass && this._hass.states[id]; }
  state(id, fallback="—"){ const x=this.e(id); return x ? x.state : fallback; }
  call(domain, service, entity_id, data={}) { return this._hass.callService(domain, service, {entity_id, ...data}); }
  toggle(id){ const x=this.e(id); if(x) this.call("homeassistant","toggle",id); }
  button(id, el){
    let x=this.e(id);
    if(!x){
      const wanted=id.split(".").pop();
      const tokens=wanted.split("_").filter(t=>!["solar","panel","washing"].includes(t));
      x=Object.values(this._hass.states).find(s=>s.entity_id.startsWith("button.") && tokens.every(t=>s.entity_id.includes(t)));
    }
    if(x){ this.call("button","press",x.entity_id); if(el){ el.classList.add("pressed"); const old=el.innerHTML; el.innerHTML="✓ SENT"; setTimeout(()=>{el.classList.remove("pressed");el.innerHTML=old;},900); } }
  }
  num(id,v){ if(this.e(id)) this.call("number","set_value",id,{value:Number(v)}); }
  select(id,v){ if(this.e(id)) this.call("select","select_option",id,{option:v}); }
  uptime(id){
    const seconds=Number(this.state(id));
    if(!Number.isFinite(seconds)||seconds<0)return "—";
    let t=Math.floor(seconds);
    const d=Math.floor(t/86400);t%=86400;
    const h=Math.floor(t/3600);t%=3600;
    const m=Math.floor(t/60),s=t%60;
    return d ? `${d}d ${h}h ${m}m` : h ? `${h}h ${m}m ${s}s` : m ? `${m}m ${s}s` : `${s}s`;
  }
  rowNum(id,label){
    const s=this.e(id), rawValue=s?Number(s.state):NaN;
    const v=Number.isFinite(rawValue) ? (Number.isInteger(rawValue) || Number(s?.attributes?.step) >= 1 ? String(Math.round(rawValue)) : String(rawValue)) : "";
    const rawUnit=(s?.attributes?.unit_of_measurement||"").toLowerCase();
    const unit = rawUnit==="s" ? "sec" : rawUnit==="min" ? "min" : rawUnit==="l/min" ? "L/min" : rawUnit==="l" ? "L" : rawUnit;
    return `<div class="numrow"><span>${label}</span><div class="numedit"><input class="numinput" type="number" inputmode="decimal" data-numinput="${id}" value="${v}" min="${s?.attributes.min ?? ""}" max="${s?.attributes.max ?? ""}" step="${s?.attributes.step ?? 1}" aria-label="${label}"><span class="unit">${unit}</span></div></div>`;
  }
  sw(id,label,short=""){
    const on=this.state(id)==="on";
    return `<button class="chip ${on?"on":""}" data-toggle="${id}" title="${label}"><b>${short||label}</b><small>${label}</small></button>`;
  }
  render(){
    if(!this._hass) return;
    const p="solar_panel_washing_";
    const E={
      status:`sensor.${p}washing_status`, zone:`sensor.${p}current_zone`, mode:`select.${p}wash_mode`,
      start:`button.${p}start_washing`, stop:`button.${p}emergency_stop`, reset:`button.${p}reset_alarm`,
      auto:`switch.${p}automatic_wash_start`, hour:`number.${p}auto_start_hour`, minute:`number.${p}auto_start_minute`,
      next:`sensor.${p}next_automatic_start`, flow:`sensor.${p}water_flow`, total:`sensor.${p}total_water`,
      protect:`switch.${p}flow_protection`, alarm:`binary_sensor.${p}washing_alarm`,
      wifi:`sensor.${p}wifi_signal`, uptime:`sensor.${p}controller_uptime`
    };
    const days=[["monday","M"],["tuesday","T"],["wednesday","W"],["thursday","T"],["friday","F"],["saturday","S"],["sunday","S"]];
    const zones=[1,2,3,4,5];
    const mode=this.state(E.mode,"Water");
    this.innerHTML=`
    <ha-card>
      <style>
        :host{--spw-blue:#1684d8;--spw-green:#18a957;--spw-red:#ef3e3e;--spw-bg:var(--card-background-color,#fff);display:block}
        *{box-sizing:border-box}.wrap{padding:18px}.hero{display:flex;align-items:center;gap:14px;margin-bottom:16px}.hero ha-icon{--mdc-icon-size:38px;color:#18a7e0}.hero h1{font-size:26px;margin:0}.hero p{margin:3px 0 0;opacity:.65}
        .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));gap:14px;align-items:start}.grid>*{min-width:0}.box{border:1px solid rgba(127,127,127,.18);border-radius:16px;padding:14px;background:var(--spw-bg);box-shadow:0 3px 12px rgba(0,0,0,.04)}.box h3{margin:0 0 12px;font-size:17px}.wide{grid-column:1/-1}
        .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:8px;margin-bottom:14px}.stat{padding:10px;border-radius:12px;background:rgba(22,132,216,.08);text-align:center}.stat b{display:block;font-size:18px}.stat small{opacity:.65}
        select{width:100%;padding:10px;border-radius:10px;border:1px solid rgba(127,127,127,.3);background:var(--card-background-color);color:var(--primary-text-color);margin-bottom:10px}
        button{font:inherit}.actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}.action{border:0;border-radius:12px;padding:14px;color:white;font-weight:700;cursor:pointer}.start{background:var(--spw-green)}.stop{background:var(--spw-red)}.reset{background:#e8eef3;color:#345;width:100%;margin-top:8px}.action{transition:transform .08s ease,filter .12s ease,box-shadow .12s ease}.action:hover{filter:brightness(1.06);box-shadow:0 4px 12px rgba(0,0,0,.18)}.action:active{transform:scale(.96);filter:brightness(.88);box-shadow:inset 0 2px 7px rgba(0,0,0,.22)}.action.pressed{transform:scale(.97);filter:brightness(.82);box-shadow:inset 0 2px 8px rgba(0,0,0,.28)}.start.pressed{background:#087c39}.stop.pressed{background:#b91f2c}.reset.pressed{background:#cbd6df}
        .chips{display:grid;grid-template-columns:repeat(7,1fr);gap:6px}.zones{grid-template-columns:repeat(5,1fr)}.chip{min-width:0;border:1px solid rgba(127,127,127,.22);border-radius:11px;padding:12px 6px;background:rgba(127,127,127,.08);color:var(--primary-text-color);cursor:pointer;transition:transform .08s ease,filter .12s ease,box-shadow .12s ease,border-color .12s ease}.chip.on{background:var(--spw-blue);color:white;border-color:var(--spw-blue);box-shadow:0 2px 7px rgba(0,0,0,.12)}.chip:hover{filter:brightness(1.06);box-shadow:0 3px 10px rgba(0,0,0,.16)}.chip:active{transform:scale(.91);filter:brightness(.78);box-shadow:inset 0 2px 7px rgba(0,0,0,.28)}.chip.tap,.toggle.tap{transform:scale(.90);filter:brightness(.75);box-shadow:inset 0 2px 8px rgba(0,0,0,.28)}.chip small{display:none}
        .toggleline{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}.toggle{border:1px solid rgba(127,127,127,.18);border-radius:999px;padding:9px 15px;cursor:pointer;transition:transform .08s ease,filter .12s ease,box-shadow .12s ease}.toggle.on{background:var(--spw-green);color:white}.toggle:hover{box-shadow:0 3px 10px rgba(0,0,0,.16)}.toggle:active{transform:scale(.90);filter:brightness(.78)}
        .schedule-time{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 0}.time-fields{display:flex;align-items:center;gap:6px}.time-fields .numinput{width:56px;min-width:56px;font-size:16px}.time-colon{font-weight:800;font-size:20px}.weekly-modes{display:grid;gap:6px;margin-top:10px}.weekly-row{display:grid;grid-template-columns:40px minmax(0,1fr);align-items:center;gap:8px}.weekly-row>span{font-weight:700}.weekly-choices{display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px}.weekly-choices button{padding:10px 3px;border:1px solid var(--divider-color,#ddd);border-radius:9px;background:var(--secondary-background-color,#f4f4f4);color:var(--primary-text-color);font-size:12px;font-weight:700;touch-action:manipulation;cursor:pointer}.weekly-choices .selected.off{background:#6b7280;color:white}.weekly-choices .selected.water{background:#087ec3;color:white}.weekly-choices .selected.soap{background:#9c53b5;color:white}.mode-options{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:7px 0 12px}.mode-option{min-width:0;border:1px solid rgba(127,127,127,.25);border-radius:11px;padding:13px 7px;background:var(--secondary-background-color,#f3f3f3);color:var(--primary-text-color);font-weight:700;font-size:13px;cursor:pointer;touch-action:manipulation}.mode-option.on{background:#087ec3;color:white;border-color:#087ec3}.mode-option:active{transform:scale(.97);filter:brightness(.85)}.numrow{display:grid;grid-template-columns:minmax(0,1fr) minmax(118px,auto);gap:12px;align-items:center;padding:7px 0}.numrow button{border:1px solid rgba(127,127,127,.14);border-radius:9px;padding:8px;cursor:pointer;font-weight:700;transition:transform .07s ease,filter .1s ease,box-shadow .1s ease}.numrow button:hover{box-shadow:0 2px 7px rgba(0,0,0,.14)}.numrow button:active{transform:scale(.82);filter:brightness(.72);box-shadow:inset 0 2px 6px rgba(0,0,0,.25)}.numrow b{text-align:center}.numinput{width:82px;min-width:82px;text-align:center;border:1px solid rgba(127,127,127,.28);border-radius:9px;padding:8px 5px;background:var(--card-background-color);color:var(--primary-text-color);font:inherit;font-weight:700;box-sizing:border-box}.numinput:focus{outline:2px solid var(--spw-blue);outline-offset:1px}.numedit{display:flex;align-items:center;justify-content:flex-end;gap:8px;min-width:118px}.unit{display:inline-block;min-width:42px;color:var(--secondary-text-color);font-size:.88em;font-weight:600;white-space:nowrap}
        .manual{display:grid;grid-template-columns:repeat(4,1fr);gap:7px}.manual .chip small{display:block;font-size:10px;margin-top:3px;opacity:.75}
        .alarm{color:var(--spw-red);font-weight:700}.ok{color:var(--spw-green);font-weight:700}
        @media(max-width:900px){.stats{grid-template-columns:repeat(auto-fit,minmax(100px,1fr))}}
        @media(max-width:600px){.wrap{padding:12px}.hero h1{font-size:22px}.actions{grid-template-columns:1fr}.manual{grid-template-columns:repeat(2,minmax(0,1fr))}}
      </style>
      <div class="wrap">
        <div class="hero"><ha-icon icon="mdi:solar-panel"></ha-icon><div><h1>Solar Panel Washing</h1><p>Automatic multi-zone washing controller</p></div></div>
        <div class="stats">
          <div class="stat"><small>Status</small><b class="${this.state(E.alarm)==="on"?"alarm":"ok"}">${this.state(E.status)}</b></div>
          <div class="stat"><small>Zone</small><b>${this.state(E.zone)}</b></div>
          <div class="stat"><small>Flow</small><b>${this.state(E.flow)} L/min</b></div>
          <div class="stat"><small>Total Water</small><b>${this.state(E.total)} L</b></div>
        </div>
        <div class="grid">
          <div class="box"><h3>💧 Washing Control</h3>
            <div class="mode-options" role="group" aria-label="Washing mode"><button type="button" class="mode-option ${mode==="Water"?"on":""}" data-mode="Water" data-mode-entity="${E.mode}">💧 Water</button><button type="button" class="mode-option ${mode==="Detergent + Water"?"on":""}" data-mode="Detergent + Water" data-mode-entity="${E.mode}">🧴 Detergent + Water</button></div>
            <div class="actions"><button class="action start" data-press="${E.start}">▶ START</button><button class="action stop" data-press="${E.stop}">■ EMERGENCY STOP</button></div>
            <button class="action reset" data-press="${E.reset}">↻ Reset Alarm</button>
          </div>
          <div class="box"><h3>📅 Automatic Schedule</h3>
            <div class="toggleline"><span>Automatic Start</span><button class="toggle ${this.state(E.auto)==="on"?"on":""}" data-toggle="${E.auto}">${this.state(E.auto)==="on"?"ON":"OFF"}</button></div>
            <div class="schedule-time"><span>Start Time</span><div class="time-fields"><input class="numinput" type="number" inputmode="numeric" min="0" max="23" step="1" data-numinput="${E.hour}" value="${Math.round(Number(this.state(E.hour,0)))}" aria-label="Start hour"><span class="time-colon">:</span><input class="numinput" type="number" inputmode="numeric" min="0" max="59" step="1" data-numinput="${E.minute}" value="${Math.round(Number(this.state(E.minute,0)))}" aria-label="Start minute"></div></div>
            <div class="weekly-modes">${days.map(d=>{const en=this.state(`switch.${p}auto_start_${d[0]}`)==="on";const mode=this.state(`select.${p}auto_mode_${d[0]}`);return `<div class="weekly-row"><span>${d[1]}</span><div class="weekly-choices"><button class="${!en?"selected off":""}" data-weekday="${d[0]}" data-weekmode="Off">OFF</button><button class="${en&&mode!=="Detergent + Water"?"selected water":""}" data-weekday="${d[0]}" data-weekmode="Water">Water</button><button class="${en&&mode==="Detergent + Water"?"selected soap":""}" data-weekday="${d[0]}" data-weekmode="Detergent + Water">Soap</button></div></div>`;}).join("")}</div>
            <div style="margin-top:10px;opacity:.7">Next: <b>${this.state(E.next)}</b></div>
          </div>
          <div class="box"><h3>🚿 Active Zones</h3><div class="chips zones">${zones.map(z=>this.sw(`switch.${p}zone_${z}_enabled`,`Zone ${z}`,`Z${z}`)).join("")}</div></div>
          <div class="box"><h3>💦 Water Times</h3>${zones.map(z=>this.rowNum(`number.${p}water_time_zone_${z}`,`Zone ${z}`)).join("")}</div>
          <div class="box"><h3>🧴 Detergent Times</h3>${zones.map(z=>this.rowNum(`number.${p}detergent_time_zone_${z}`,`Zone ${z}`)).join("")}</div>
          <div class="box"><h3>🚿 Rinse Times</h3>${zones.map(z=>this.rowNum(`number.${p}rinse_time_zone_${z}`,`Zone ${z}`)).join("")}</div>
          <div class="box"><h3>🔄 Switching</h3>${this.rowNum(`number.${p}zone_overlap`,"Zone Overlap")}${this.rowNum(`number.${p}source_change_delay`,"Source Delay")}</div>
          <div class="box"><h3>🛡️ Flow Protection</h3>
            <div class="toggleline"><span>Protection</span><button class="toggle ${this.state(E.protect)==="on"?"on":""}" data-toggle="${E.protect}">${this.state(E.protect)==="on"?"ON":"OFF"}</button></div>
            ${this.rowNum(`number.${p}minimum_flow_setpoint`,"Minimum")}${this.rowNum(`number.${p}maximum_flow_setpoint`,"Maximum")}${this.rowNum(`number.${p}leak_flow_setpoint`,"Leak")}${this.rowNum(`number.${p}flow_check_delay`,"Check Delay")}
          </div>
          <div class="box"><h3>ℹ️ System</h3><div>Wi-Fi: <b>${this.state(E.wifi)} dBm</b></div><div style="margin-top:8px">Uptime: <b>${this.uptime(E.uptime)}</b></div><div style="margin-top:8px">Alarm: <b class="${this.state(E.alarm)==="on"?"alarm":"ok"}">${this.state(E.alarm)==="on"?"ACTIVE":"OK"}</b></div></div>
          <div class="box wide"><h3>🔧 Manual Valve Control</h3><div class="manual">
            ${this.sw(`switch.${p}ch8_valve_power`,"CH8 Valve Power","POWER")}${this.sw(`switch.${p}ch1_filtered_water`,"CH1 Filtered Water","WATER")}${this.sw(`switch.${p}ch2_detergent`,"CH2 Detergent","SOAP")}
            ${zones.map((z,i)=>this.sw(`switch.${p}ch${z+2}_zone_${z}`,`CH${z+2} Zone ${z}`,`Z${z}`)).join("")}
          </div></div>
        </div>
      </div>
    </ha-card>`;
    this.querySelectorAll("[data-toggle]").forEach(b=>b.onclick=()=>{const wasOn=b.classList.contains("on");b.classList.toggle("on",!wasOn);if(b.classList.contains("toggle"))b.textContent=wasOn?"OFF":"ON";b.classList.add("tap");this.toggle(b.dataset.toggle);setTimeout(()=>b.classList.remove("tap"),220);});
    this.querySelectorAll("[data-press]").forEach(b=>b.onclick=()=>this.button(b.dataset.press,b));
    this.querySelectorAll("[data-weekmode]").forEach(b=>b.onclick=()=>{const day=b.dataset.weekday,mode=b.dataset.weekmode;const enabledId=`switch.${p}auto_start_${day}`;const modeId=`select.${p}auto_mode_${day}`;if(mode==="Off"){this.call("switch","turn_off",enabledId);}else{if(!this.e(modeId)){alert("Update ESPHome firmware to enable per-day modes");return;}this.call("select","select_option",modeId,{option:mode}).then(()=>this.call("switch","turn_on",enabledId));}b.closest(".weekly-choices").querySelectorAll("button").forEach(x=>x.classList.toggle("selected",x===b));});
    this.querySelectorAll("[data-mode]").forEach(b=>b.onclick=()=>{this.querySelectorAll("[data-mode]").forEach(x=>x.classList.toggle("on",x===b));this.select(b.dataset.modeEntity,b.dataset.mode);});
    this.querySelectorAll("[data-num]").forEach(b=>b.onclick=()=>{const id=b.dataset.num, st=this.e(id); if(!st)return; const step=Number(st.attributes.step||1), min=Number(st.attributes.min??-1e9), max=Number(st.attributes.max??1e9); this.num(id,Math.max(min,Math.min(max,Number(st.state)+Number(b.dataset.d)*step)));}); this.querySelectorAll("[data-numinput]").forEach(i=>{const send=()=>{const st=this.e(i.dataset.numinput);if(!st)return;const min=Number(st.attributes.min??-1e9),max=Number(st.attributes.max??1e9),v=Number(i.value);if(!Number.isFinite(v))return;const value=Math.max(min,Math.min(max,v));i.value=value;this.num(i.dataset.numinput,value);};i.onchange=send;i.onblur=()=>{if(this._pendingRender){this._pendingRender=false;setTimeout(()=>{if(!this.querySelector(".numinput:focus"))this.render();},150);}};i.onkeydown=e=>{if(e.key==="Enter"){e.preventDefault();send();i.blur();}};});
  }
}
customElements.define("solar-panel-washing-card", SolarPanelWashingCard);
window.customCards = window.customCards || [];
window.customCards.push({type:"solar-panel-washing-card",name:"Solar Panel Washing",description:"Complete dashboard card for the Solar Panel Washing ESPHome controller",preview:true});
console.info("%c SOLAR-PANEL-WASHING-CARD %c v1.1.18 ","color:white;background:#1684d8;font-weight:700","color:#1684d8;background:white");

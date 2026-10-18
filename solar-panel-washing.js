class SolarPanelWashingCard extends HTMLElement {
  setConfig(config) { this.config = config || {}; }
  connectedCallback() {
    if (this._interactionHandlersInstalled) return;
    this._interactionHandlersInstalled = true;
    this.addEventListener("pointerover", (event) => {
      if (event.pointerType !== "mouse") return;
      const control = event.target.closest?.("button, input, select");
      if (control && this.contains(control)) this._hoveredControl = control;
    }, true);
    this.addEventListener("pointerout", (event) => {
      if (event.pointerType !== "mouse") return;
      const control = event.target.closest?.("button, input, select");
      if (control && control === this._hoveredControl && !control.contains(event.relatedTarget)) {
        this._hoveredControl = null;
        this.scheduleRender();
      }
    }, true);
    this.addEventListener("pointerdown", () => {
      this._interacting = true;
      clearTimeout(this._renderTimer);
    }, true);
    const release = () => {
      clearTimeout(this._releaseTimer);
      this._releaseTimer = setTimeout(() => {
        this._interacting = false;
        this.scheduleRender();
      }, 450);
    };
    this.addEventListener("pointerup", release, true);
    this.addEventListener("pointercancel", release, true);
    this.addEventListener("pointerleave", () => {
      this._hoveredControl = null;
      release();
    }, true);
  }
  isEditing() { return !!this.querySelector(".numinput:focus"); }
  scheduleRender() {
    // On iOS HA, rebuilding a card during touch scrolling can reset the
    // scroll container. Wait until scrolling has been idle for 1.5 seconds.
    if (!window.__spwScrollTrackingInstalled) {
      window.__spwScrollTrackingInstalled = true;
      const mark = () => { window.__spwLastScrollInteraction = Date.now(); };
      window.addEventListener("scroll", mark, {passive:true,capture:true});
      window.addEventListener("touchmove", mark, {passive:true,capture:true});
      window.addEventListener("wheel", mark, {passive:true,capture:true});
    }
    if (Date.now() - (window.__spwLastScrollInteraction || 0) < 1500) {
      this._pendingRender = true;
      clearTimeout(this._renderTimer);
      this._renderTimer = setTimeout(() => this.scheduleRender(), 1550);
      return;
    }
    if (!this._hass || this._interacting || this._hoveredControl || this._languageMenuOpen || this.isEditing()) {
      this._pendingRender = true;
      return;
    }
    clearTimeout(this._renderTimer);
    this._renderTimer = setTimeout(() => {
      if (this._interacting || this._hoveredControl || this.isEditing()) {
        this._pendingRender = true;
        return;
      }
      this._pendingRender = false;
      this.render();
    }, 100);
  }
  set hass(hass) {
    // HA sends updates for unrelated devices every second. Avoid replacing
    // the card DOM unless the washing entities actually changed.
    const ids = Object.keys(hass.states || {}).filter(id =>
      /solar.panel.wash|solar_panel_wash|washing|wash_controller/i.test(id));
    const signature = ids.map(id => {
      const s=hass.states[id];
      return id+":"+s.state+":"+JSON.stringify(s.attributes);
    }).join("|")+"|"+(hass.language||"");
    if (this._hass && this._stateSignature === signature) {
      this._hass = hass;
      return;
    }
    this._stateSignature = signature;
    this._hass = hass;
    this.scheduleRender();
  }

  language() {
    const configured=this.config?.language || "auto";
    if(configured!=="auto") return ["en","ru","he"].includes(configured)?configured:"en";
    const ha=this._hass?.language || "en";
    return ha.startsWith("ru")?"ru":ha.startsWith("he")?"he":"en";
  }
  translateUI(){
    const lang=this.language();

    const dict={"Solar Panel Washing":["Мойка солнечных панелей","שטיפת פאנלים סולאריים"],"Automatic multi-zone washing controller":["Автоматическая многозонная система мойки","מערכת שטיפה אוטומטית רב-אזורית"],"Status":["Состояние","מצב"],"Zone":["Зона","אזור"],"Flow":["Расход","ספיקה"],"Total Water":["Всего воды","סך מים"],"Washing Control":["Управление мойкой","בקרת שטיפה"],"Water Consumption":["Расход воды","צריכת מים"],"Current Wash":["Текущая мойка","שטיפה נוכחית"],"Actual:":["Факт:","בפועל:"],"Restore counters":["Восстановить счётчики","שחזור מונים"],"Hide restore":["Скрыть восстановление","הסתר שחזור"],"Date and time":["Дата и время","תאריך ושעה"],"Load history":["Загрузить историю","טעינת היסטוריה"],"Confirm restore":["Подтвердить восстановление","אישור שחזור"],"Save now":["Сохранить в ESP32","שמירה בבקר"],"Backup in HA":["Копия в HA","גיבוי ב-HA"],"Current":["Сейчас","נוכחי"],"From HA":["Из HA","מההיסטוריה"],"Recorded at":["Записано","נרשם ב"],"History not loaded":["История ещё не загружена","ההיסטוריה טרם נטענה"],"During valve overlap, measured water is divided equally between open zones. Values remain visible until the next wash.":["При перекрытии клапанов объём делится поровну между открытыми зонами. Значения сохраняются до следующей мойки.","בזמן חפיפת שסתומים המים מתחלקים שווה בשווה בין האזורים הפתוחים. הערכים נשמרים עד לשטיפה הבאה."],"Washing in progress":["Мойка выполняется","השטיפה מתבצעת"],"Washing stopped":["Мойка остановлена","השטיפה נעצרה"],"Washing alarm":["Авария мойки","תקלה בשטיפה"],"Water":["Вода","מים"],"Detergent + Water":["Моющее средство + вода","חומר ניקוי + מים"],"START":["СТАРТ","הפעלה"],"EMERGENCY STOP":["АВАРИЙНЫЙ СТОП","עצירת חירום"],"Reset Alarm":["Сброс аварии","איפוס התראה"],"Automatic Schedule":["Автоматическое расписание","לוח זמנים אוטומטי"],"Automatic Start":["Автозапуск","הפעלה אוטומטית"],"Start Time":["Время запуска","שעת התחלה"],"OFF":["ВЫКЛ","כבוי"],"ON":["ВКЛ","פעיל"],"Soap":["Средство","סבון"],"Next:":["Следующий запуск:","ההפעלה הבאה:"],"Disabled":["Отключено","מושבת"],"Active Zones":["Активные зоны","אזורים פעילים"],"Water Times":["Время мойки водой","זמני שטיפה במים"],"Detergent Times":["Время подачи средства","זמני חומר ניקוי"],"Rinse Times":["Время ополаскивания","זמני שטיפה חוזרת"],"Switching":["Переключение","מעברים"],"Zone Overlap":["Перекрытие зон","חפיפת אזורים"],"Source Delay":["Пауза между источниками","השהיית מעבר מקור"],"Flow Protection":["Защита по расходу","הגנת ספיקה"],"Protection":["Защита","הגנה"],"Minimum":["Минимум","מינימום"],"Maximum":["Максимум","מקסימום"],"Leak":["Утечка","דליפה"],"Check Delay":["Задержка проверки","השהיית בדיקה"],"System":["Система","מערכת"],"System Status":["Состояние системы","מצב מערכת"],"Controller":["Контроллер","בקר"],"Connection":["Подключение","חיבור"],"Wi-Fi Signal":["Сигнал Wi-Fi","אות Wi-Fi"],"Uptime":["Время работы","זמן פעולה"],"IP Address":["IP-адрес","כתובת IP"],"Wi-Fi Network":["Сеть Wi-Fi","רשת Wi-Fi"],"MAC Address":["MAC-адрес","כתובת MAC"],"Total Water":["Всего воды","סך מים"],"Alarm":["Авария","התראה"],"ESP32 Date & Time":["Дата и время ESP32","תאריך ושעה ESP32"],"Time Sync":["Синхронизация времени","סנכרון זמן"],"Synchronized":["Синхронизировано","מסונכרן"],"Not synchronized":["Не синхронизировано","לא מסונכרן"],"Unavailable — update ESP32":["Нет данных — обновите ESP32","אין נתונים — עדכנו ESP32"],"Online":["В сети","מחובר"],"Offline":["Не в сети","מנותק"],"Unknown":["Неизвестно","לא ידוע"],"Uptime:":["Время работы:","זמן פעולה:"],"Alarm:":["Авария:","התראה:"],"OK":["Норма","תקין"],"ACTIVE":["АКТИВНА","פעילה"],"Manual Valve Control":["Ручное управление клапанами","בקרה ידנית בשסתומים"],"Zone 1":["Зона 1","אזור 1"],"Zone 2":["Зона 2","אזור 2"],"Zone 3":["Зона 3","אזור 3"],"Zone 4":["Зона 4","אזור 4"],"Zone 5":["Зона 5","אזור 5"],"sec":["сек","שנ׳"],"min":["мин","דק׳"],"Select the mode for manual START. Emergency Stop closes the valves and stops the program. Reset Alarm clears a latched alarm after the cause has been resolved.":["Выберите режим ручного запуска. Аварийный стоп закрывает клапаны и останавливает программу. Сброс аварии разрешён после устранения причины.","בחרו מצב להפעלה ידנית. עצירת חירום סוגרת את השסתומים ועוצרת את התוכנית. יש לאפס התראה רק לאחר טיפול בתקלה."],"Automatic Start enables the weekly schedule. Choose OFF, Water or Soap for each weekday. Start Time is the local time on the ESP32; Soap means detergent followed by rinse.":["Автозапуск включает недельное расписание. Для каждого дня выберите ВЫКЛ, Вода или Средство. Время задаётся по часам ESP32. Средство означает мойку с последующим ополаскиванием.","הפעלה אוטומטית מפעילה לוח שבועי. בחרו לכל יום כבוי, מים או סבון. שעת ההתחלה היא לפי שעון ESP32. סבון כולל שטיפה במים לאחר הניקוי."],"Only enabled zones are included in automatic and manual START washing programs. Disable a zone to skip it.":["В программу входят только включённые зоны. Отключите зону, чтобы пропустить её при мойке.","רק אזורים פעילים נכללים בתוכנית. כבו אזור כדי לדלג עליו."],"Duration of filtered-water washing for each enabled zone in Water mode. In Detergent + Water mode, the Rinse Times below are used instead.":["Продолжительность мойки фильтрованной водой для каждой зоны в режиме «Вода». В режиме со средством используется время ополаскивания ниже.","משך השטיפה במים מסוננים לכל אזור במצב מים. במצב חומר ניקוי משתמשים בזמני השטיפה החוזרת שלהלן."],"How long detergent flows through each enabled zone before rinsing. Each zone has its own setting.":["Сколько секунд моющее средство подаётся в каждую зону до ополаскивания. Настраивается отдельно для каждой зоны.","משך הזרמת חומר הניקוי לכל אזור לפני שטיפה במים. לכל אזור הגדרה נפרדת."],"How long filtered water rinses each zone after detergent. The zone stays open between detergent and rinse.":["Сколько секунд чистая вода промывает зону после моющего средства. Клапан зоны остаётся открытым при смене жидкости.","משך השטיפה במים מסוננים לאחר חומר הניקוי. שסתום האזור נשאר פתוח בזמן המעבר."],"Zone Overlap: opens the next zone before closing the previous one to reduce pressure shock. Source Delay: pause between detergent and filtered water so both source valves are never open together.":["Перекрытие зон: следующая зона открывается до закрытия предыдущей, чтобы уменьшить гидроудар. Пауза источников: промежуток между средством и водой, когда оба клапана источников закрыты.","חפיפת אזורים: פתיחת האזור הבא לפני סגירת הקודם להפחתת מכות לחץ. השהיית מקור: הפסקה בין חומר ניקוי למים כאשר שני שסתומי המקור סגורים."],"Requires a correctly connected and calibrated flow sensor. When enabled, the controller checks for low flow, excessive flow and unexpected flow while idle. Keep OFF until the sensor is installed and tested.":["Требуется подключённый и проверенный датчик расхода. Защита контролирует недостаточный, чрезмерный и неожиданный расход при простое. Не включайте до проверки датчика.","נדרש חיישן ספיקה מחובר ומכויל. ההגנה בודקת ספיקה נמוכה, גבוהה וזרימה בלתי צפויה במנוחה. השאירו כבוי עד לבדיקת החיישן."],"Wi-Fi shows signal strength in dBm (closer to zero is stronger). Uptime is time since the ESP32 last restarted. Alarm shows whether a fault is latched.":["Wi-Fi — уровень сигнала в dBm (ближе к нулю — сильнее). Время работы — с последней перезагрузки ESP32. Авария показывает сохранённую ошибку.","Wi-Fi מציג עוצמת אות ב-dBm (קרוב יותר לאפס פירושו אות חזק יותר). זמן פעולה נספר מההפעלה האחרונה. התראה מציגה תקלה פעילה."],"Direct relay controls for testing and maintenance. These bypass the normal washing sequence: use carefully and never open detergent and water sources together.":["Прямое управление реле для проверки и обслуживания. Обходит обычную последовательность мойки. Не открывайте одновременно подачу воды и средства.","שליטה ישירה בממסרים לבדיקה ותחזוקה. עוקפת את רצף השטיפה הרגיל. אין לפתוח יחד את מקורות המים וחומר הניקוי."],"Time when two consecutive zone valves are open together during a water transition.":["Время одновременного открытия двух соседних зон при переходе.","משך הזמן שבו שני שסתומי אזורים פתוחים יחד במעבר."],"Pause with both source valves closed when changing between detergent and filtered water.":["Пауза с закрытыми источниками при переходе между средством и водой.","השהיה כששני שסתומי המקור סגורים במעבר בין חומר ניקוי למים."],"If measured flow falls below this value during washing (after Check Delay), protection stops the system.":["Если расход ниже порога после задержки проверки, система аварийно остановится.","אם הספיקה יורדת מתחת לסף לאחר ההשהיה, המערכת נעצרת."],"If measured flow rises above this value during washing (after Check Delay), protection stops the system.":["Если расход выше порога после задержки проверки, система аварийно остановится.","אם הספיקה עולה מעל הסף לאחר ההשהיה, המערכת נעצרת."],"Unexpected flow above this value while washing is idle triggers a leak alarm.":["Расход выше порога при остановленной мойке вызывает сигнал утечки.","זרימה מעל הסף כשהשטיפה כבויה מפעילה התראת דליפה."],"Wait after opening a source valve before checking minimum and maximum flow.":["Задержка после открытия источника перед проверкой минимального и максимального расхода.","השהיה לאחר פתיחת מקור לפני בדיקת ספיקה מינימלית ומקסימלית."],"Enable flow-based alarms only after the flow meter has been installed and tested.":["Включайте защиту только после установки и проверки расходомера.","יש להפעיל הגנה רק לאחר התקנת ובדיקת מד הספיקה."],"Enable flow monitoring and automatic fault shutdown.":["Включить контроль расхода и аварийное отключение.","הפעלת ניטור ספיקה וכיבוי אוטומטי בתקלה."],"Ready":["Готово","מוכן"],"None":["Нет","ללא"],"Running":["Работает","פועל"],"Water - Zone 1":["Вода — зона 1","מים — אזור 1"]};
    if(lang==="en")return;
    const index=lang==="ru"?0:1;
    const root=this.querySelector("ha-card");
    if(!root)return;
    const wrap=root.querySelector(".wrap");
    if(wrap){wrap.setAttribute("dir",lang==="he"?"rtl":"ltr");wrap.setAttribute("lang",lang);}
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    const nodes=[];
    while(walker.nextNode())nodes.push(walker.currentNode);
    for(const node of nodes){
      const parent=node.parentElement;
      if(!parent || ["STYLE","SCRIPT","OPTION"].includes(parent.tagName))continue;
      const raw=node.nodeValue, trimmed=raw.trim();
      if(!trimmed)continue;
      let replacement=dict[trimmed]?.[index];
      if(!replacement){
        const emoji=trimmed.match(/^([^\p{L}\p{N}]*)(.+)$/u);
        if(emoji)replacement=dict[emoji[2]]?.[index] ? emoji[1]+dict[emoji[2]][index] : null;
      }
      if(!replacement && /^Zone [1-5]$/.test(trimmed))replacement=dict[trimmed]?.[index];
      if(replacement)node.nodeValue=raw.replace(trimmed,replacement);
    }
    const weekday=lang==="ru"?["Пн","Вт","Ср","Чт","Пт","Сб","Вс"]:["ב׳","ג׳","ד׳","ה׳","ו׳","ש׳","א׳"];
    root.querySelectorAll(".weekly-row > span").forEach((el,i)=>{el.textContent=weekday[i]||el.textContent;});
    root.querySelectorAll(".weekly-choices button").forEach(el=>{const k=el.dataset.weekmode==="Off"?"OFF":el.dataset.weekmode==="Water"?"Water":"Soap";el.textContent=dict[k]?.[index]||el.textContent;});
    root.querySelectorAll(".mode-option").forEach(el=>{const k=el.dataset.mode;el.textContent=(k==="Water"?"💧 ":"🧴 ")+(dict[k]?.[index]||k);});
    root.querySelectorAll(".numinput").forEach(el=>{if(dict[el.getAttribute("aria-label")])el.setAttribute("aria-label",dict[el.getAttribute("aria-label")][index]);});
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
  helpLine(message){ return `<p class="setting-help">${message}</p>`; }
  rowNum(id,label){
    const s=this.e(id), rawValue=s?Number(s.state):NaN;
    const v=Number.isFinite(rawValue) ? (Number.isInteger(rawValue) || Number(s?.attributes?.step) >= 1 ? String(Math.round(rawValue)) : String(rawValue)) : "";
    const rawUnit=(s?.attributes?.unit_of_measurement||"").toLowerCase();
    const unit = rawUnit==="s" ? "sec" : rawUnit==="min" ? "min" : rawUnit==="l/min" ? "L/min" : rawUnit==="l" ? "L" : rawUnit;
    const descriptions={"Zone Overlap":"Time when two consecutive zone valves are open together during a water transition.","Source Delay":"Pause with both source valves closed when changing between detergent and filtered water.","Minimum":"If measured flow falls below this value during washing (after Check Delay), protection stops the system.","Maximum":"If measured flow rises above this value during washing (after Check Delay), protection stops the system.","Leak":"Flow above this threshold while idle or during final valve verification triggers an alarm after continuous confirmation.","Check Delay":"Seconds of continuous abnormal flow needed to trigger a fault; also used for the final main-valve check.","Protection":"Enable flow-based alarms only after the flow meter has been installed and tested."};
    return `<div class="numrow"><span class="setting-label">${label}${descriptions[label] ? `<small class="setting-detail">${descriptions[label]}</small>` : ""}</span><div class="numedit"><input class="numinput" type="number" inputmode="decimal" data-numinput="${id}" value="${v}" min="${s?.attributes.min ?? ""}" max="${s?.attributes.max ?? ""}" step="${s?.attributes.step ?? 1}" aria-label="${label}"><span class="unit">${unit}</span></div></div>`;
  }
  stageCountdown(kind,zone){
    const p="solar_panel_washing_";
    const name=({1:"water",2:"detergent",3:"rinse"})[kind];
    const entity=`sensor.${p}actual_${name}_zone_${zone}_time`;
    const raw=this.state(entity,"unavailable");
    const n=Number(raw);
    const actual=raw==="unavailable"||raw==="unknown"||raw===""||!Number.isFinite(n)?"—":Math.max(0,Math.floor(n));
    const k=Number(this.state(`sensor.${p}stage_kind`,0));
    const z=Number(this.state(`sensor.${p}stage_zone`,0));
    const active=k===kind&&z===zone;
    const sec=Number(this.state(`sensor.${p}stage_seconds_remaining`,0));
    const alarm=this.state(`binary_sensor.${p}washing_alarm`)==="on";
    return `<small class="spw-stage-count ${alarm?"spw-fault":""}" style="display:block;margin:-2px 0 9px 0;text-align:end">Actual: ${actual} sec${active?` · ${alarm?"Stopped":"Remaining"}: ${Number.isFinite(sec)?Math.max(0,Math.ceil(sec)):"—"} sec`:""}</small>`;
  }
  sw(id,label,short=""){
    const on=this.state(id)==="on";
    return `<button class="chip ${on?"on":""}" data-toggle="${id}" title="${label}"><b>${short||label}</b><small>${label}</small></button>`;
  }
  waterCounterIds(){
    const p="sensor.solar_panel_washing_";
    return [p+"total_water",p+"current_wash_water",...Array.from({length:5},(_,i)=>p+"wash_zone_"+(i+1)+"_water")];
  }
  waterLabels(){return ["Total Water","Current Wash","Zone 1","Zone 2","Zone 3","Zone 4","Zone 5"];}
  restoreDefaultDate(){
    const d=new Date(), pad=n=>String(n).padStart(2,"0");
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  restorePanel(){
    const open=!!this._restoreOpen;
    const preview=this._restorePreview;
    const msg=this._restoreError;
    const busy=!!this._restoreLoading;
    const labels=this.waterLabels(),ids=this.waterCounterIds();
    const table=preview?`<div class="spw-restore-table">
      <div class="spw-restore-row"><b></b><b>Current</b><b>From HA</b></div>
      ${preview.map((item,i)=>`<div class="spw-restore-row"><span>${labels[i]}</span><span>${this.waterNumber(ids[i])} L</span><span><b>${item.value.toFixed(2)} L</b><small>Recorded at ${new Date(item.time).toLocaleString()}</small></span></div>`).join("")}
    </div>`:"<small>History not loaded</small>";
    return `<div class="spw-restore">
      <div class="spw-restore-actions">
        <button type="button" data-save-counters>Save now</button><button type="button" data-backup-ha>Backup in HA</button>
        <button type="button" data-restore-toggle>${open?"Hide restore":"Restore counters"}</button>
      </div>
      ${open?`<div class="spw-restore-expanded">
        <label>Date and time <input type="datetime-local" data-restore-datetime value="${this._restoreAt||this.restoreDefaultDate()}"></label>
        <button type="button" data-restore-load ${busy?"disabled":""}>Load history</button>
        ${busy?"<small>Loading…</small>":""}
        ${msg?`<p class="spw-restore-error">${String(msg).replace(/[&<>"]/g,x=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[x]))}</p>`:""}
        ${table}
        ${preview?`<button type="button" data-restore-confirm ${busy?"disabled":""}>Confirm restore</button>`:""}
      </div>`:""}
    </div>`;
  }
  async loadWaterHistory(){
    if(this._restoreLoading)return;
    const input=this.querySelector("[data-restore-datetime]");
    this._restoreAt=input?.value||this._restoreAt||this.restoreDefaultDate();
    this._restorePreview=null;
    this._restoreError="";
    const target=new Date(this._restoreAt);
    if(!Number.isFinite(target.getTime())||target.getTime()>Date.now()){
      this._restoreError="Choose a valid past date and time";this.render();return;
    }
    this._restoreLoading=true;this.render();
    try{
      const ids=this.waterCounterIds();
      // Include state at the beginning of the interval; HA's history API
      // can return the previous recorded state as its first sample.
      let preview=null;
      try{
        const result=await this._hass.callWS({
          type:"history/history_during_period",
          start_time:new Date(target.getTime()-60000).toISOString(),
          end_time:new Date(target.getTime()+1000).toISOString(),
          entity_ids:ids,minimal_response:false,no_attributes:true
        });
        const rows=Array.isArray(result)?result:Object.values(result||{});
        preview=ids.map((id,i)=>{
          const group=rows.find(a=>Array.isArray(a)&&a.some(x=>x.entity_id===id))||rows[i]||[];
          const valid=group.filter(x=>{
            const time=new Date(x.last_updated||x.last_changed||x.lu||x.lc);
            const v=Number(x.state??x.s);
            return Number.isFinite(time.getTime())&&time.getTime()<=target.getTime()&&
              Number.isFinite(v)&&v>=0;
          });
          if(!valid.length)throw Error(`No recorded value for ${id} at this time.`);
          const x=valid[valid.length-1];
          return {value:Number(x.state??x.s),time:x.last_updated||x.last_changed||x.lu||x.lc};
        });
      }catch(historyError){
        // Recorder may have purged the requested date. Use the latest
        // available durable 06:00 HA snapshot, never invent missing data.
        const snapshots=await this._hass.callWS({type:"solar_panel_washing_dashboard/water_snapshots"});
        const available=(snapshots||[]).filter(x=>
          Array.isArray(x.values)&&x.values.length===7&&new Date(x.time).getTime()<=target.getTime()
        );
        if(!available.length)throw historyError;
        const snap=available[available.length-1];
        preview=snap.values.map(value=>({value:Number(value),time:snap.time}));
        this._restoreError="Recorder history unavailable. Showing the last daily 06:00 backup; check its recorded time.";
      }
      this._restorePreview=preview;
    }catch(e){this._restoreError=e?.message||String(e);}
    finally{this._restoreLoading=false;this.render();}
  }
  async restoreWaterHistory(){
    const values=this._restorePreview;
    if(!values||values.length!==7||this._restoreLoading)return;
    const p="solar_panel_washing_";
    if(this.state(`binary_sensor.${p}washing_active`)==="on"||
       this.state(`sensor.${p}washing_status`)==="Main Valve Check"||
       this.state(`sensor.${p}washing_status`)==="Pressure Release"){
      this._restoreError="Stop washing and close all valves before restoring.";this.render();return;
    }
    const switches=["ch8_valve_power","ch1_filtered_water","ch2_detergent",...Array.from({length:5},(_,i)=>`ch${i+3}_zone_${i+1}`)];
    if(switches.some(x=>this.state(`switch.${p}${x}`)!=="off")){
      this._restoreError="All eight relays must report OFF before restoring.";this.render();return;
    }
    const service="solar_panel_washing_restore_water_counters";
    if(!this._hass.services?.esphome?.[service]){
      this._restoreError="ESPHome restore action not available. Update ESP32 firmware and reconnect Home Assistant.";this.render();return;
    }
    const valuesText=values.map((v,i)=>`${this.waterLabels()[i]}: ${v.value.toFixed(2)} L`).join("\n");
    if(!window.confirm(`Restore counters from ${this._restoreAt}?\n\n${valuesText}\n\nThis replaces the current values in ESP32.`))return;
    this._restoreLoading=true;this.render();
    try{
      await this._hass.callService("esphome",service,{
        total:values[0].value,wash:values[1].value,
        zone1:values[2].value,zone2:values[3].value,zone3:values[4].value,
        zone4:values[5].value,zone5:values[6].value
      });
      this._restoreError="Restore command sent to ESP32. Check live counter values.";
      this._restorePreview=null;
    }catch(e){this._restoreError=e?.message||String(e);}
    finally{this._restoreLoading=false;this.render();}
  }
  async backupWaterInHA(){
    try{
      await this._hass.callService("solar_panel_washing_dashboard","save_water_snapshot",{});
      this._restoreError="Water snapshot requested in Home Assistant.";
    }catch(e){this._restoreError=e?.message||String(e);this._restoreOpen=true;}
    this.render();
  }
  async saveWaterCounters(){
    try{
      const id="button.solar_panel_washing_save_water_counters";
      if(!this._hass.states?.[id])throw Error("Save button unavailable. Update ESP32 firmware.");
      await this._hass.callService("button","press",{entity_id:id});
      this._restoreError="Save requested on ESP32.";
    }catch(e){this._restoreError=e?.message||String(e);this._restoreOpen=true;}
    this.render();
  }
  waterNumber(entity) { const v=Number(this._hass?.states?.[entity]?.state); return Number.isFinite(v)?v.toFixed(2):"—"; }
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
    const washingActive=this.state(`binary_sensor.${p}washing_active`)==="on";
    const washingAlarm=this.state(E.alarm)==="on";
    const washingIndicatorClass=washingAlarm?"alarm":washingActive?"running":"idle";
    const faultKind=Number(this.state(`sensor.${p}fault_kind`,0));
    const faultZone=Number(this.state(`sensor.${p}fault_zone`,0));
    const faultFlow=this.waterNumber(`sensor.${p}fault_flow`);
    const faultThreshold=this.waterNumber(`sensor.${p}fault_threshold`);
    const faultLabel=({1:"Low Flow",2:"High Flow",3:"Leak Detected",4:"Main Valve Not Closed",5:"Emergency Stop"})[faultKind]||"Washing alarm";
    const faultDetails=faultKind>=1&&faultKind<=4?`${faultZone?"Zone "+faultZone+" · ":""}${faultFlow} L/min · Limit ${faultThreshold} L/min`:"";
    const washingIndicatorLabel=washingAlarm?faultLabel:washingActive?"Washing in progress":"Washing stopped";
    const violationKind=Number(this.state(`sensor.${p}flow_violation_kind`,0));
    const violationElapsed=Number(this.state(`sensor.${p}flow_violation_seconds`,0));
    const checkDelay=Number(this.state(`number.${p}flow_check_delay`,5));
    this.innerHTML=`
    <ha-card>
      <style>
        :host{--spw-blue:#1684d8;--spw-green:#18a957;--spw-red:#ef3e3e;--spw-bg:var(--card-background-color,#fff);display:block}
        *{box-sizing:border-box}.wrap{padding:18px}.hero{display:flex;align-items:center;gap:14px;margin-bottom:16px}.hero ha-icon{--mdc-icon-size:38px;color:#18a7e0}.hero h1{font-size:26px;margin:0}.hero p{margin:3px 0 0;opacity:.65}
        .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr));gap:14px;align-items:start}.grid>*{min-width:0}.box{border:1px solid rgba(127,127,127,.18);border-radius:16px;padding:14px;background:var(--spw-bg);box-shadow:0 3px 12px rgba(0,0,0,.04)}.box h3{margin:0 0 12px;font-size:17px}.wide{grid-column:1/-1}
        .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:8px;margin-bottom:14px}.stat{padding:10px;border-radius:12px;background:rgba(22,132,216,.08);text-align:center}.stat b{display:block;font-size:18px}.stat small{opacity:.65}
        select{width:100%;padding:10px;border-radius:10px;border:1px solid rgba(127,127,127,.3);background:var(--card-background-color);color:var(--primary-text-color);margin-bottom:10px}
        button{font:inherit}.actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}.action{border:0;border-radius:12px;padding:14px;color:white;font-weight:700;cursor:pointer}.start{background:var(--spw-green)}.stop{background:var(--spw-red)}.reset{background:#e8eef3;color:#345;width:100%;margin-top:8px}.action{transition:transform .08s ease,filter .12s ease,box-shadow .12s ease}.action:hover{filter:brightness(1.06);box-shadow:0 4px 12px rgba(0,0,0,.18)}.action:active{transform:scale(.96);filter:brightness(.88);box-shadow:inset 0 2px 7px rgba(0,0,0,.22)}.action.pressed{transform:scale(.97);filter:brightness(.82);box-shadow:inset 0 2px 8px rgba(0,0,0,.28)}.start.pressed{background:#087c39}.stop.pressed{background:#b91f2c}.reset.pressed{background:#cbd6df}
        .chips{display:grid;grid-template-columns:repeat(7,1fr);gap:6px}.zones{grid-template-columns:repeat(5,1fr)}.chip{min-width:0;border:1px solid rgba(127,127,127,.22);border-radius:11px;padding:12px 6px;background:rgba(127,127,127,.08);color:var(--primary-text-color);cursor:pointer;transition:transform .08s ease,filter .12s ease,box-shadow .12s ease,border-color .12s ease}.chip.on{background:var(--spw-blue);color:white;border-color:var(--spw-blue);box-shadow:0 2px 7px rgba(0,0,0,.12)}.chip:hover{filter:brightness(1.06);box-shadow:0 3px 10px rgba(0,0,0,.16)}.chip:active{transform:scale(.91);filter:brightness(.78);box-shadow:inset 0 2px 7px rgba(0,0,0,.28)}.chip.tap,.toggle.tap{transform:scale(.90);filter:brightness(.75);box-shadow:inset 0 2px 8px rgba(0,0,0,.28)}.chip small{display:none}
        .toggleline{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}.toggle{border:1px solid rgba(127,127,127,.18);border-radius:999px;padding:9px 15px;cursor:pointer;transition:transform .08s ease,filter .12s ease,box-shadow .12s ease}.toggle.on{background:var(--spw-green);color:white}.toggle:hover{box-shadow:0 3px 10px rgba(0,0,0,.16)}.toggle:active{transform:scale(.90);filter:brightness(.78)}
        .schedule-time{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 0}.time-fields{display:flex;align-items:center;gap:6px}.time-fields .numinput{width:56px;min-width:56px;font-size:16px}.time-colon{font-weight:800;font-size:20px}.weekly-modes{display:grid;gap:6px;margin-top:10px}.weekly-row{display:grid;grid-template-columns:40px minmax(0,1fr);align-items:center;gap:8px}.weekly-row>span{font-weight:700}.weekly-choices{display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px}.weekly-choices button{padding:10px 3px;border:1px solid var(--divider-color,#ddd);border-radius:9px;background:var(--secondary-background-color,#f4f4f4);color:var(--primary-text-color);font-size:12px;font-weight:700;touch-action:manipulation;cursor:pointer}.weekly-choices .selected.off{background:#6b7280;color:white}.weekly-choices .selected.water{background:#087ec3;color:white}.weekly-choices .selected.soap{background:#9c53b5;color:white}.weekly-choices button{transition:background .14s ease,color .14s ease,transform .1s ease,box-shadow .14s ease,border-color .14s ease;min-height:44px}.weekly-choices button:hover{filter:brightness(.95);box-shadow:0 2px 8px rgba(0,0,0,.14)}.weekly-choices button:active{transform:scale(.93);filter:brightness(.8);box-shadow:inset 0 2px 7px rgba(0,0,0,.25)}.weekly-choices button.selected{border-color:transparent;box-shadow:0 2px 5px rgba(0,0,0,.18)}.weekly-choices button.pending{outline:2px solid #eab308;outline-offset:1px;opacity:.85}.weekly-choices button.failed{outline:2px solid #dc2626;outline-offset:1px}.mode-options{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:7px 0 12px}.mode-option{min-width:0;border:1px solid rgba(127,127,127,.25);border-radius:11px;padding:13px 7px;background:var(--secondary-background-color,#f3f3f3);color:var(--primary-text-color);font-weight:700;font-size:13px;cursor:pointer;touch-action:manipulation}.mode-option.on{background:#087ec3;color:white;border-color:#087ec3}.mode-option{transition:transform .12s ease,background-color .16s ease,color .16s ease,box-shadow .16s ease,filter .12s ease;min-height:52px;user-select:none;-webkit-tap-highlight-color:transparent}.mode-option:hover{filter:brightness(1.08);box-shadow:0 3px 12px rgba(0,0,0,.18)}.mode-option:active{transform:scale(.93);filter:brightness(.78);box-shadow:inset 0 3px 9px rgba(0,0,0,.3)}.mode-option.on{box-shadow:0 3px 8px rgba(8,126,195,.25);border:2px solid #0766a0}.mode-option.pending{outline:2px solid #eab308;outline-offset:1px;opacity:.88}.mode-option.failed{outline:2px solid #dc2626;outline-offset:1px}.spw-version{font-size:11px;font-weight:700;color:var(--secondary-text-color,#777);text-align:center;margin-bottom:5px;white-space:nowrap}.language-control{position:relative;margin-left:auto;flex-shrink:0;z-index:3}.language-trigger{border:1px solid var(--divider-color,#ddd);border-radius:9px;padding:9px 12px;background:var(--card-background-color,#fff);color:var(--primary-text-color);cursor:pointer;min-height:42px}.language-menu{position:absolute;right:0;top:calc(100% + 5px);min-width:150px;padding:5px;background:var(--card-background-color,#fff);border:1px solid var(--divider-color,#ddd);border-radius:10px;box-shadow:0 6px 20px rgba(0,0,0,.2);z-index:50}.language-menu[hidden]{display:none!important}
        .spw-running-indicator{display:flex;align-items:center;gap:9px;padding:11px 13px;margin:12px 0 10px;border-radius:10px;font-size:13px;font-weight:700;min-width:0;box-sizing:border-box}
        .spw-running-indicator.idle{background:var(--secondary-background-color,#edf0f3);color:var(--secondary-text-color,#666)}
        .spw-running-indicator.running{background:#e0f7e8;color:#08783b;border:1px solid #95dfad}
        .spw-running-indicator.alarm{background:#ffebeb;color:#b42323;border:1px solid #ffb6b6}
        .spw-running-dot{width:11px;height:11px;flex:0 0 11px;border-radius:50%;background:#9299a1}
        .running .spw-running-dot{background:#10a34a;box-shadow:0 0 0 0 rgba(16,163,74,.35);animation:spw-running-pulse 1.8s ease-out infinite}
        .alarm .spw-running-dot{background:#e03b3b}
        .spw-running-label{min-width:0}.spw-running-zone{margin-inline-start:auto;white-space:nowrap;font-weight:600;font-size:12px}
        @keyframes spw-running-pulse{0%{box-shadow:0 0 0 0 rgba(16,163,74,.4)}65%,100%{box-shadow:0 0 0 9px rgba(16,163,74,0)}}
        @media(prefers-reduced-motion:reduce){.running .spw-running-dot{animation:none}}
        .wrap[dir="rtl"] .language-menu{left:0;right:auto;max-width:min(240px,calc(100vw - 32px));box-sizing:border-box}
        .wrap[dir="rtl"] .language-menu button{text-align:right}
        .language-menu button{display:block;width:100%;padding:11px;text-align:left;border:0;border-radius:7px;background:transparent;color:var(--primary-text-color);cursor:pointer;white-space:nowrap}.language-menu button:hover,.language-menu button:active{background:var(--secondary-background-color,#eee)}.setting-help{font-size:12px;line-height:1.5;color:var(--secondary-text-color,#777);margin:3px 0 13px}.setting-label{min-width:0}.setting-detail{display:block;font-size:11px;font-weight:400;line-height:1.35;color:var(--secondary-text-color,#777);margin-top:4px;max-width:290px}.wrap[dir="rtl"]{text-align:right}.wrap[dir="rtl"] .hero{flex-direction:row}.wrap[dir="rtl"] .language-control{margin-left:0;margin-right:auto}.wrap[dir="rtl"] .language-menu{right:auto;left:0}.wrap[dir="rtl"] .numrow{direction:rtl}.wrap[dir="rtl"] .numedit{direction:rtl;justify-self:start;justify-content:flex-start}.wrap[dir="rtl"] .numedit .unit{order:2;text-align:left;min-width:42px}.wrap[dir="rtl"] .numedit .numinput{order:1;direction:ltr;text-align:center}.wrap[dir="rtl"] .numinput{direction:ltr;text-align:center}.wrap[dir="rtl"] .setting-help,.wrap[dir="rtl"] .setting-detail{text-align:right}.wrap[dir="rtl"] .weekly-row{direction:rtl}.wrap[dir="rtl"] .weekly-choices{direction:ltr}.wrap[dir="rtl"] .schedule-time{direction:rtl}.wrap[dir="rtl"] .time-fields{direction:ltr}.wrap[dir="rtl"] .stats{direction:rtl}.wrap[dir="rtl"] .actions{direction:rtl}.wrap[dir="rtl"] .mode-options{direction:rtl}.wrap[dir="rtl"] .manual{direction:rtl}.wrap[dir="rtl"] .language-menu button{text-align:right}.numrow{display:grid;grid-template-columns:minmax(0,1fr) minmax(118px,auto);gap:12px;align-items:center;padding:7px 0}.numrow button{border:1px solid rgba(127,127,127,.14);border-radius:9px;padding:8px;cursor:pointer;font-weight:700;transition:transform .07s ease,filter .1s ease,box-shadow .1s ease}.numrow button:hover{box-shadow:0 2px 7px rgba(0,0,0,.14)}.numrow button:active{transform:scale(.82);filter:brightness(.72);box-shadow:inset 0 2px 6px rgba(0,0,0,.25)}.numrow b{text-align:center}.numinput{width:82px;min-width:82px;text-align:center;border:1px solid rgba(127,127,127,.28);border-radius:9px;padding:8px 5px;background:var(--card-background-color);color:var(--primary-text-color);font:inherit;font-weight:700;box-sizing:border-box}.numinput:focus{outline:2px solid var(--spw-blue);outline-offset:1px}.numedit{display:flex;align-items:center;justify-content:flex-end;gap:8px;min-width:118px}.unit{display:inline-block;min-width:42px;color:var(--secondary-text-color);font-size:.88em;font-weight:600;white-space:nowrap}
        .manual{display:grid;grid-template-columns:repeat(4,1fr);gap:7px}.manual .chip small{display:block;font-size:10px;margin-top:3px;opacity:.75}
        .alarm{color:var(--spw-red);font-weight:700}.ok{color:var(--spw-green);font-weight:700}
        @media(max-width:900px){.stats{grid-template-columns:repeat(auto-fit,minmax(100px,1fr))}}
        @media(max-width:600px){.wrap{padding:12px}.hero h1{font-size:22px}.actions{grid-template-columns:1fr}.manual{grid-template-columns:repeat(2,minmax(0,1fr))}}
      .spw-history{cursor:pointer;text-decoration:underline;text-decoration-style:dotted;text-underline-offset:3px}.spw-history:hover{color:var(--primary-color)}.spw-history:focus-visible{outline:2px solid var(--primary-color);border-radius:3px}
        .spw-consumption-summary{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin:10px 0 14px}.spw-consumption-summary>div{display:flex;flex-direction:column;gap:5px;padding:12px 9px;border-radius:10px;background:var(--secondary-background-color,#f1f5f9);min-width:0}.spw-consumption-summary small{font-size:11px;color:var(--secondary-text-color)}.spw-consumption-summary strong{font-size:19px;color:var(--primary-text-color);overflow-wrap:anywhere}.spw-consumption-line{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 2px;border-bottom:1px solid var(--divider-color,rgba(127,127,127,.15));font-size:13px}.spw-consumption-line b{font-variant-numeric:tabular-nums}.spw-consumption-total{font-weight:700}.spw-consumption-note{display:block;margin-top:10px;font-size:11px;line-height:1.4;color:var(--secondary-text-color)}
        .spw-stage-count{display:block;text-align:end;color:var(--spw-blue);font-weight:700;font-size:12px;margin:0 4px 8px}.spw-fault{color:var(--spw-red)}.spw-fault-reason{display:block;color:var(--spw-red);font-size:12px;font-weight:700;padding:4px}.spw-fault-highlight{outline:2px solid var(--spw-red);border-radius:8px;animation:spw-flash 1s infinite alternate}@keyframes spw-flash{from{background:transparent}to{background:rgba(239,62,62,.17)}}.spw-flow-progress{margin-top:8px;color:var(--spw-blue);font-size:12px;font-weight:700}
        .spw-restore{margin-top:12px;padding-top:12px;border-top:1px solid var(--divider-color,#ddd)}.spw-restore-actions{display:flex;flex-wrap:wrap;gap:8px}.spw-restore button{padding:9px 12px;border:1px solid var(--divider-color,#ccc);border-radius:9px;background:var(--secondary-background-color,#eee);color:var(--primary-text-color);cursor:pointer}.spw-restore-expanded{margin-top:12px;display:flex;flex-direction:column;gap:10px}.spw-restore-expanded label{display:flex;flex-direction:column;gap:6px}.spw-restore-expanded input{max-width:100%;width:100%;padding:9px;color:var(--primary-text-color);background:var(--card-background-color);border:1px solid var(--divider-color);border-radius:8px}.spw-restore-table{display:grid;gap:6px}.spw-restore-row{display:grid;grid-template-columns:1fr 1fr 1.5fr;gap:5px;align-items:start;font-size:12px;border-bottom:1px solid var(--divider-color);padding:5px 0}.spw-restore-row small{display:block;opacity:.7}.spw-restore-error{color:var(--error-color,#c62828);font-weight:600;overflow-wrap:anywhere}
        .spw-system .spw-status-row{display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:7px 0;border-bottom:1px solid var(--divider-color,rgba(127,127,127,.12));font-size:13px}.spw-system .spw-status-row:last-child{border-bottom:0}.spw-system .spw-status-label{color:var(--secondary-text-color);white-space:nowrap}.spw-system .spw-status-row strong{font-weight:600;overflow-wrap:anywhere;text-align:end;min-width:0}
</style>
      <div class="wrap">
        <div class="hero"><ha-icon icon="mdi:solar-panel"></ha-icon><div><h1>Solar Panel Washing</h1><p>Automatic multi-zone washing controller</p></div><div class="language-control"><div class="spw-version" aria-label="Dashboard version">v1.3.25</div><button type="button" class="language-trigger" data-language-toggle aria-haspopup="true" aria-expanded="false">🌐 ${({"auto":"Auto","en":"English","ru":"Русский","he":"עברית"})[this.config?.language||"auto"]||"Auto"} ▾</button><div class="language-menu" data-language-menu hidden><button type="button" data-language-choice="auto">🌐 Auto</button><button type="button" data-language-choice="en">🇺🇸 English</button><button type="button" data-language-choice="ru">🇷🇺 Русский</button><button type="button" data-language-choice="he">🇮🇱 עברית</button></div></div></div>
        <div class="stats">
          <div class="stat"><small>Status</small><b class="${this.state(E.alarm)==="on"?"alarm":"ok"}">${this.state(E.status)}</b></div>
          <div class="stat"><small>Zone</small><b>${this.state(E.zone)}</b></div>
          <div class="stat"><small>Flow</small><b><span class="spw-history" tabindex="0" role="button" title="Open Home Assistant history" data-history="${E.flow}">${this.waterNumber(E.flow)} L/min</span></b></div>
          <div class="stat"><small>Total Water</small><b><span class="spw-history" tabindex="0" role="button" title="Open Home Assistant history" data-history="${E.total}">${this.waterNumber(E.total)} L</span></b></div>
        </div>
        <div class="grid">
          <div class="box"><h3>💧 Washing Control</h3>${this.helpLine("Select the mode for manual START. Emergency Stop closes the valves and stops the program. Reset Alarm clears a latched alarm after the cause has been resolved.")}
            <div class="mode-options" role="group" aria-label="Washing mode"><button type="button" class="mode-option ${mode==="Water"?"on":""}" data-mode="Water" data-mode-entity="${E.mode}">💧 Water</button><button type="button" class="mode-option ${mode==="Detergent + Water"?"on":""}" data-mode="Detergent + Water" data-mode-entity="${E.mode}">🧴 Detergent + Water</button></div>
            <div class="spw-running-indicator ${washingIndicatorClass}" role="status" aria-live="polite"><span class="spw-running-dot" aria-hidden="true"></span><span class="spw-running-label">${washingIndicatorLabel}</span>${washingAlarm&&faultDetails?`<span class="spw-fault-reason">${faultDetails}</span>`:""}${washingActive&&!washingAlarm?`<span class="spw-running-zone">${this.state(E.zone)}</span>`:""}</div>
            <div class="actions"><button class="action start" data-press="${E.start}">▶ START</button><button class="action stop" data-press="${E.stop}">■ EMERGENCY STOP</button></div>
            <button class="action reset" data-press="${E.reset}">↻ Reset Alarm</button>
          </div>
          <div class="box"><h3>📅 Automatic Schedule</h3>${this.helpLine("Automatic Start enables the weekly schedule. Choose OFF, Water or Soap for each weekday. Start Time is the local time on the ESP32; Soap means detergent followed by rinse.")}
            <div class="toggleline"><span>Automatic Start</span><button class="toggle ${this.state(E.auto)==="on"?"on":""}" data-toggle="${E.auto}">${this.state(E.auto)==="on"?"ON":"OFF"}</button></div>
            <div class="schedule-time"><span>Start Time</span><div class="time-fields"><input class="numinput" type="number" inputmode="numeric" min="0" max="23" step="1" data-numinput="${E.hour}" value="${Math.round(Number(this.state(E.hour,0)))}" aria-label="Start hour"><span class="time-colon">:</span><input class="numinput" type="number" inputmode="numeric" min="0" max="59" step="1" data-numinput="${E.minute}" value="${Math.round(Number(this.state(E.minute,0)))}" aria-label="Start minute"></div></div>
            <div class="weekly-modes">${days.map(d=>{const en=this.state(`switch.${p}auto_start_${d[0]}`)==="on";const mode=this.state(`select.${p}auto_mode_${d[0]}`);return `<div class="weekly-row"><span>${d[1]}</span><div class="weekly-choices"><button class="${!en?"selected off":""}" data-weekday="${d[0]}" data-weekmode="Off">OFF</button><button class="${en&&mode!=="Detergent + Water"?"selected water":""}" data-weekday="${d[0]}" data-weekmode="Water">Water</button><button class="${en&&mode==="Detergent + Water"?"selected soap":""}" data-weekday="${d[0]}" data-weekmode="Detergent + Water">Soap</button></div></div>`;}).join("")}</div>
            <div style="margin-top:10px;opacity:.7">Next: <b>${this.state(E.next)}</b></div>
          </div>
          <div class="box"><h3>🚿 Active Zones</h3>${this.helpLine("Only enabled zones are included in automatic and manual START washing programs. Disable a zone to skip it.")}<div class="chips zones">${zones.map(z=>this.sw(`switch.${p}zone_${z}_enabled`,`Zone ${z}`,`Z${z}`)).join("")}</div></div>
          <div class="box"><h3>💦 Water Times</h3>${this.helpLine("Duration of filtered-water washing for each enabled zone in Water mode. In Detergent + Water mode, the Rinse Times below are used instead.")}${zones.map(z=>this.rowNum(`number.${p}water_time_zone_${z}`,`Zone ${z}`)+this.stageCountdown(1,z)).join("")}</div>
          <div class="box"><h3>🧴 Detergent Times</h3>${this.helpLine("How long detergent flows through each enabled zone before rinsing. Each zone has its own setting.")}${zones.map(z=>this.rowNum(`number.${p}detergent_time_zone_${z}`,`Zone ${z}`)+this.stageCountdown(2,z)).join("")}</div>
          <div class="box"><h3>🚿 Rinse Times</h3>${this.helpLine("How long filtered water rinses each zone after detergent. The zone stays open between detergent and rinse.")}${zones.map(z=>this.rowNum(`number.${p}rinse_time_zone_${z}`,`Zone ${z}`)+this.stageCountdown(3,z)).join("")}</div>
          <div class="box"><h3>🔄 Switching</h3>${this.helpLine("Zone Overlap: opens the next zone before closing the previous one to reduce pressure shock. Source Delay: pause between detergent and filtered water so both source valves are never open together.")}${this.rowNum(`number.${p}zone_overlap`,"Zone Overlap")}${this.rowNum(`number.${p}source_change_delay`,"Source Delay")}</div>
          <div class="box"><h3>🛡️ Flow Protection</h3>${this.helpLine("Requires a correctly connected and calibrated flow sensor. When enabled, the controller checks for low flow, excessive flow and unexpected flow while idle. Keep OFF until the sensor is installed and tested.")}
            <div class="toggleline"><span>Protection <small class="setting-detail">Enable flow monitoring and automatic fault shutdown.</small></span><button class="toggle ${this.state(E.protect)==="on"?"on":""}" data-toggle="${E.protect}">${this.state(E.protect)==="on"?"ON":"OFF"}</button></div>
            <div class="${washingAlarm&&faultKind===1?"spw-fault-highlight":""}">${this.rowNum(`number.${p}minimum_flow_setpoint`,"Minimum")}</div>
            <div class="${washingAlarm&&faultKind===2?"spw-fault-highlight":""}">${this.rowNum(`number.${p}maximum_flow_setpoint`,"Maximum")}</div>
            <div class="${washingAlarm&&(faultKind===3||faultKind===4)?"spw-fault-highlight":""}">${this.rowNum(`number.${p}leak_flow_setpoint`,"Leak")}</div>
            ${this.rowNum(`number.${p}flow_check_delay`,"Check Delay")}
            <div class="spw-flow-progress">${washingAlarm?`Fault: ${faultLabel} · ${violationElapsed} / ${checkDelay} sec`:violationKind?`Confirming ${({1:"Low Flow",2:"High Flow",3:"Leak",4:"Main Valve Check"})[violationKind]}: ${violationElapsed} / ${checkDelay} sec`:Number(this.state(`sensor.${p}stage_kind`,0))===4?`Final valve check: ${this.state(`sensor.${p}stage_seconds_remaining`,0)} sec remaining`:"No active flow violation"}</div>
          </div>
          <div class="box spw-system"><h3>ℹ️ System Status</h3>
            ${(()=>{
              const online=this.state(`binary_sensor.${p}washing_controller_online`,"unknown");
              const ip=this.state(`sensor.${p}ip_address`);
              const ssid=this.state(`sensor.${p}wifi_network`);
              const mac=this.state(`sensor.${p}wifi_mac_address`);
              const wifi=this.state(E.wifi);
              const valid=v=>v&&!["—","unknown","unavailable","none",""].includes(String(v).toLowerCase());
              const connection=valid(ssid)?"Wi-Fi":valid(ip)?"Network":"Unknown";
              const line=(icon,label,value,cls="")=>`<div class="spw-status-row"><span class="spw-status-label"><span aria-hidden="true">${icon}</span> ${label}</span><strong class="${cls}">${value}</strong></div>`;
              return [
                line("🟢","Controller",online==="on"?"Online":online==="off"?"Offline":"—",online==="on"?"ok":online==="off"?"alarm":""),
                line("🔌","Connection",connection),
                line("📶","Wi-Fi Signal",valid(wifi)?wifi+" dBm":"—"),
                line("⏱","Uptime",this.uptime(E.uptime)),
                line("📅","ESP32 Date & Time",this.state(`sensor.${p}esp32_date_time`)),
                line("🕒","Time Sync",(()=>{
                  const v=this.state(`binary_sensor.${p}esp32_time_synchronized`,"unknown");
                  return v==="on"?"Synchronized":v==="off"?"Not synchronized":"Unavailable — update ESP32";
                })(),this.state(`binary_sensor.${p}esp32_time_synchronized`)==="on"?"ok":"alarm"),
                line("🌐","IP Address",valid(ip)?ip:"—"),
                line("📡","Wi-Fi Network",valid(ssid)?ssid:"—"),
                line("🖧","MAC Address",valid(mac)?mac:"—"),
                line("🌊","Flow",`<span class="spw-history" tabindex="0" role="button" data-history="${E.flow}" title="Open Home Assistant history">${this.waterNumber(E.flow)} L/min</span>`),
                line("💧","Total Water",`<span class="spw-history" tabindex="0" role="button" data-history="${E.total}" title="Open Home Assistant history">${this.waterNumber(E.total)} L</span>`),
                line("⚠️","Alarm",this.state(E.alarm)==="on"?"ACTIVE":"OK",this.state(E.alarm)==="on"?"alarm":"ok")
              ].join("");
            })()}</div>
          <div class="box spw-consumption"><h3>💧 Water Consumption</h3>
            <div class="spw-consumption-summary">
              <div><small>Flow</small><strong><span class="spw-history" tabindex="0" role="button" title="Open Home Assistant history" data-history="${E.flow}">${this.waterNumber(E.flow)} <small>L/min</small></span></strong></div>
              <div><small>Current Wash</small><strong><span class="spw-history" tabindex="0" role="button" title="Open Home Assistant history" data-history="${`sensor.${p}current_wash_water`}">${this.waterNumber(`sensor.${p}current_wash_water`)} <small>L</small></span></strong></div>
            </div>
            <div class="spw-consumption-zones">
              ${zones.map(z=>`<div class="spw-consumption-line"><span>Zone ${z}</span><b><span class="spw-history" tabindex="0" role="button" title="Open Home Assistant history" data-history="${`sensor.${p}wash_zone_${z}_water`}">${this.waterNumber(`sensor.${p}wash_zone_${z}_water`)} L</span></b></div>`).join("")}
            </div>
            <div class="spw-consumption-line spw-consumption-total"><span>Total Water</span><b><span class="spw-history" tabindex="0" role="button" title="Open Home Assistant history" data-history="${E.total}">${this.waterNumber(E.total)} L</span></b></div>
            <small class="spw-consumption-note">During valve overlap, measured water is divided equally between open zones. Values remain visible until the next wash.</small>
            ${this.restorePanel()}
          </div>
          <div class="box wide"><h3>🔧 Manual Valve Control</h3>${this.helpLine("Direct relay controls for testing and maintenance. These bypass the normal washing sequence: use carefully and never open detergent and water sources together.")}<div class="manual">
            ${this.sw(`switch.${p}ch8_valve_power`,"CH8 Valve Power","POWER")}${this.sw(`switch.${p}ch1_filtered_water`,"CH1 Filtered Water","WATER")}${this.sw(`switch.${p}ch2_detergent`,"CH2 Detergent","SOAP")}
            ${zones.map((z,i)=>this.sw(`switch.${p}ch${z+2}_zone_${z}`,`CH${z+2} Zone ${z}`,`Z${z}`)).join("")}
          </div></div>
        </div>
      </div>
    </ha-card>`;
    this.querySelector("[data-restore-toggle]")?.addEventListener("click",()=>{this._restoreOpen=!this._restoreOpen;this.render();});
    this.querySelector("[data-save-counters]")?.addEventListener("click",()=>this.saveWaterCounters());
    this.querySelector("[data-backup-ha]")?.addEventListener("click",()=>this.backupWaterInHA());
    this.querySelector("[data-restore-load]")?.addEventListener("click",()=>this.loadWaterHistory());
    this.querySelector("[data-restore-confirm]")?.addEventListener("click",()=>this.restoreWaterHistory());
    this.querySelectorAll("[data-history]").forEach(el=>{
      const open=()=>this.dispatchEvent(new CustomEvent("hass-more-info",{
        bubbles:true,composed:true,detail:{entityId:el.dataset.history}
      }));
      el.addEventListener("click",open);
      el.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();open();}});
    });
    this.translateUI();
    const languageToggle=this.querySelector("[data-language-toggle]");
    const languageMenu=this.querySelector("[data-language-menu]");
    languageToggle?.addEventListener("click",()=>{const opening=languageMenu.hidden;languageMenu.hidden=!opening;languageToggle.setAttribute("aria-expanded",String(opening));this._languageMenuOpen=opening;if(!opening)this.scheduleRender();});
    this.querySelectorAll("[data-language-choice]").forEach(b=>b.addEventListener("click",()=>{this.config={...this.config,language:b.dataset.languageChoice};this._languageMenuOpen=false;this._hoveredControl=null;this._pendingRender=false;this.render();}));
    this.querySelectorAll("[data-toggle]").forEach(b=>b.onclick=()=>{const wasOn=b.classList.contains("on");b.classList.toggle("on",!wasOn);if(b.classList.contains("toggle"))b.textContent=wasOn?"OFF":"ON";b.classList.add("tap");this.toggle(b.dataset.toggle);setTimeout(()=>b.classList.remove("tap"),220);});
    this.querySelectorAll("[data-press]").forEach(b=>b.onclick=()=>this.button(b.dataset.press,b));
    this.querySelectorAll("[data-weekmode]").forEach(b=>b.onclick=async()=>{const day=b.dataset.weekday,mode=b.dataset.weekmode;const enabledId=`switch.${p}auto_start_${day}`;const modeId=`select.${p}auto_mode_${day}`;const group=b.closest(".weekly-choices");if(group.dataset.busy==="1")return;if(mode!=="Off"&&!this.e(modeId)){b.classList.add("failed");setTimeout(()=>b.classList.remove("failed"),1100);return;}group.dataset.busy="1";group.querySelectorAll("button").forEach(x=>{x.classList.remove("selected","off","water","soap");});b.classList.add("selected",mode==="Off"?"off":mode==="Water"?"water":"soap","pending");try{if(mode==="Off"){await this.call("switch","turn_off",enabledId);}else{await this.call("select","select_option",modeId,{option:mode});await this.call("switch","turn_on",enabledId);}}catch(err){b.classList.add("failed");console.error("Solar washing schedule update failed",err);}finally{b.classList.remove("pending");delete group.dataset.busy;setTimeout(()=>this.scheduleRender(),550);}});
    this.querySelectorAll("[data-mode]").forEach(b=>b.onclick=async()=>{const group=b.closest(".mode-options");if(group.dataset.busy==="1")return;group.dataset.busy="1";const old=group.querySelector(".mode-option.on");group.querySelectorAll(".mode-option").forEach(x=>x.classList.remove("on","failed"));b.classList.add("on","pending");try{await this.call("select","select_option",b.dataset.modeEntity,{option:b.dataset.mode});}catch(err){b.classList.remove("on");if(old)old.classList.add("on");b.classList.add("failed");console.error("Washing mode change failed",err);}finally{b.classList.remove("pending");delete group.dataset.busy;this.scheduleRender();}});
    this.querySelectorAll("[data-num]").forEach(b=>b.onclick=()=>{const id=b.dataset.num, st=this.e(id); if(!st)return; const step=Number(st.attributes.step||1), min=Number(st.attributes.min??-1e9), max=Number(st.attributes.max??1e9); this.num(id,Math.max(min,Math.min(max,Number(st.state)+Number(b.dataset.d)*step)));}); this.querySelectorAll("[data-numinput]").forEach(i=>{const send=()=>{const st=this.e(i.dataset.numinput);if(!st)return;const min=Number(st.attributes.min??-1e9),max=Number(st.attributes.max??1e9),v=Number(i.value);if(!Number.isFinite(v))return;const value=Math.max(min,Math.min(max,v));i.value=value;this.num(i.dataset.numinput,value);};i.onchange=send;i.onblur=()=>{if(this._pendingRender)this.scheduleRender();};i.onkeydown=e=>{if(e.key==="Enter"){e.preventDefault();send();i.blur();}};});
  }
}
if (!customElements.get("solar-panel-washing-card")) customElements.define("solar-panel-washing-card", SolarPanelWashingCard);
window.customCards = window.customCards || [];
window.customCards.push({type:"solar-panel-washing-card",name:"Solar Panel Washing",description:"Complete dashboard card for the Solar Panel Washing ESPHome controller",preview:true});

const SPW_SECTIONS = ["control","schedule","zones","water-times","detergent-times","rinse-times","switching","flow-protection","system","water-consumption","manual-valves"];
class SolarPanelWashingSectionCard extends SolarPanelWashingCard {
  setConfig(config) {
    const section=SPW_SECTIONS.includes(config?.section)?config.section:"control";
    super.setConfig({...config,section});
  }
  static getStubConfig() { return {section:"control"}; }
  getGridOptions() { return {columns: 12, rows: "auto", min_columns: 6}; }
  connectedCallback() {
    super.connectedCallback();
    if (this._spwLanguageListener) return;
    this._spwLanguageListener=(event)=>{
      this.config={...this.config,language:event.detail};
      this.render();
    };
    window.addEventListener("spw-language-change",this._spwLanguageListener);
  }
  disconnectedCallback() {
    if(this._spwLanguageListener)window.removeEventListener("spw-language-change",this._spwLanguageListener);
    this._spwLanguageListener=null;
  }
  render() {
    if (!this.config.language) {
      let lang="auto";
      try { lang=localStorage.getItem("solar_panel_washing_language")||"auto"; } catch (_) {}
      this.config={...this.config,language:lang};
    }
    super.render();
    const root=this.querySelector("ha-card");
    if (!root) return;
    const grid=root.querySelector(".grid");
    if (!grid) return;
    const index=SPW_SECTIONS.indexOf(this.config.section);
    const boxes=Array.from(grid.children);
    boxes.forEach((box,i)=>{if(i!==index)box.remove();});
    if (this.config.section==="control") {
      const host=grid.querySelector(".box");
      const bar=document.createElement("div");
      bar.style.cssText="display:flex;gap:8px;justify-content:flex-end;margin-bottom:10px;align-items:center";
      const version=document.createElement("small");version.textContent="v1.3.25";
      const picker=document.createElement("div");
      picker.style.cssText="position:relative";
      const trigger=document.createElement("button");
      trigger.type="button";
      trigger.style.cssText="padding:8px 12px;border:1px solid var(--divider-color,#ddd);border-radius:9px;background:var(--card-background-color,#fff);color:var(--primary-text-color);cursor:pointer";
      const languages=[["auto","🌐 Auto"],["en","🇺🇸 English"],["ru","🇷🇺 Русский"],["he","🇮🇱 עברית"]];
      const current=()=>languages.find(([key])=>key===this.config.language)?.[1]||"🌐 Auto";
      trigger.textContent=current()+" ▾";
      const menu=document.createElement("div");
      menu.hidden=true;
      menu.style.cssText="position:absolute;right:0;top:100%;min-width:155px;z-index:1000;background:var(--card-background-color,#fff);border:1px solid var(--divider-color,#ddd);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.2);padding:5px";
      menu.style.maxWidth="min(240px, calc(100vw - 32px))";
      menu.style.boxSizing="border-box";
      if(this.language()==="he"){menu.style.left="0";menu.style.right="auto";menu.dir="rtl";};
      for(const [key,label] of languages){
        const choice=document.createElement("button");
        choice.type="button";choice.textContent=label;
        choice.style.cssText="display:block;width:100%;text-align:left;padding:10px;border:0;border-radius:6px;background:transparent;color:var(--primary-text-color);cursor:pointer";
        choice.addEventListener("click",(event)=>{
          event.stopPropagation();
          this._languageMenuOpen=false;
          menu.hidden=true;
          this.config={...this.config,language:key};
          try { localStorage.setItem("solar_panel_washing_language",key); } catch (_) {}
          window.dispatchEvent(new CustomEvent("spw-language-change",{detail:key}));
        });
        menu.appendChild(choice);
      }
      trigger.addEventListener("click",(event)=>{
        event.stopPropagation();
        const opening=menu.hidden;
        menu.hidden=!opening;
        this._languageMenuOpen=opening;
        if(!opening&&this._pendingRender)this.scheduleRender();
      });
      picker.append(trigger,menu);
      bar.append(version,picker);host.prepend(bar);
    }
    this.classList.add("spw-language-linked");
    root.querySelector(".hero")?.remove();
    root.querySelector(".stats")?.remove();
    const wrap=root.querySelector(".wrap");
    if(wrap)wrap.classList.add("standalone-section");
    const style=root.querySelector("style");
    if(style)style.textContent += ".standalone-section{padding:0;min-width:0;width:100%;box-sizing:border-box}.standalone-section .grid{display:block;min-width:0}.standalone-section .box{width:100%;min-width:0;box-sizing:border-box;border:1px solid var(--divider-color,rgba(127,127,127,.22));box-shadow:0 3px 12px rgba(0,0,0,.055);border-radius:14px}.standalone-section .box.wide{grid-column:auto}.standalone-section .mode-options,.standalone-section .actions{grid-template-columns:repeat(2,minmax(0,1fr))}.standalone-section button{min-width:0;overflow-wrap:anywhere}.standalone-section .weekly-choices{grid-template-columns:repeat(3,minmax(0,1fr))}";
  }
}
if (!customElements.get("solar-panel-washing-section-card")) customElements.define("solar-panel-washing-section-card",SolarPanelWashingSectionCard);

const SPW_SECTION_TITLES = {
  control:"Washing Control",schedule:"Automatic Schedule",zones:"Active Zones",
  "water-times":"Water Times","detergent-times":"Detergent Times","rinse-times":"Rinse Times",
  switching:"Switching","flow-protection":"Flow Protection",system:"System","water-consumption":"Water Consumption","manual-valves":"Manual Valve Control"
};
for (const section of SPW_SECTIONS) {
  const tag="solar-panel-washing-"+section+"-card";
  class SingleWashingSectionCard extends SolarPanelWashingSectionCard {
    setConfig(config) { super.setConfig({...config,section}); }
    static getStubConfig() { return {section}; }
  }
  if (!customElements.get(tag)) customElements.define(tag,SingleWashingSectionCard);
  window.customCards.push({
    type:tag,name:"Solar Washing — "+SPW_SECTION_TITLES[section],
    description:"Standalone "+SPW_SECTION_TITLES[section]+" section; add to any dashboard",
    preview:true
  });
}

window.customCards.push({type:"solar-panel-washing-section-card",name:"Solar Panel Washing — Section",description:"Independent washing section; configure section in YAML.",preview:true});

class SolarPanelWashingOverviewCard extends HTMLElement {
  setConfig(config) { this.config=config||{}; }
  static getStubConfig() { return {}; }
  getGridOptions() { return {columns:12,rows:"auto"}; }
  connectedCallback() {
    if(this._built)return;
    this._built=true;
    this.innerHTML=`<style>
      :host{display:block;width:100%;min-width:0}
      .spw-overview{width:100%;container-type:inline-size;box-sizing:border-box;padding:8px}
      .spw-head{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:12px 16px;margin-bottom:12px;background:var(--ha-card-background,var(--card-background-color,#fff));border-radius:14px;font-weight:700;font-size:22px}
      .spw-head small{margin-left:auto;font-size:12px;color:var(--secondary-text-color);font-weight:500}
      .spw-layout{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;align-items:start}
      .spw-column{display:flex;flex-direction:column;gap:12px;min-width:0}
      .spw-cell{min-width:0;display:block}
      .spw-cell>*{display:block;width:100%;min-width:0}
      .spw-cell ha-card{border:1px solid var(--divider-color,rgba(127,127,127,.2));border-radius:14px;box-shadow:0 3px 12px rgba(0,0,0,.07);overflow:hidden;background:var(--card-background-color,#fff)}
      .spw-head select{font:inherit;font-size:13px;font-weight:500;padding:8px 12px;border:1px solid var(--divider-color,#ddd);border-radius:9px;background:var(--card-background-color,#fff);color:var(--primary-text-color);cursor:pointer}
      .spw-head .spw-language{margin-left:auto;display:flex;align-items:center;gap:10px}
      .spw-head small{margin-left:0}
      @container (max-width:1050px){.spw-layout{grid-template-columns:repeat(2,minmax(0,1fr))}.spw-column{display:contents}.spw-cell{order:var(--tablet-order)}}
      @container (max-width:620px){.spw-layout{grid-template-columns:minmax(0,1fr)}.spw-column{display:contents}.spw-cell{order:var(--mobile-order)}.spw-head{font-size:18px;padding:10px 12px}}
    </style><div class="spw-overview"><div class="spw-head">☀️ Solar Panel Washing <div class="spw-language"><small>v1.3.25</small><select aria-label="Language" class="spw-language-select"><option value="auto">🌐 Auto</option><option value="en">🇺🇸 English</option><option value="ru">🇷🇺 Русский</option><option value="he">🇮🇱 עברית</option></select></div></div><div class="spw-layout"></div></div>`;
    const langSelect=this.querySelector(".spw-language-select");
    let savedLanguage="auto";
    try { savedLanguage=localStorage.getItem("solar_panel_washing_language") || "auto"; } catch (_) {}
    langSelect.value=this.config.language || savedLanguage;
    langSelect.addEventListener("change",()=>{
      this.config={...this.config,language:langSelect.value};
      try { localStorage.setItem("solar_panel_washing_language",langSelect.value); } catch (_) {}
      this.querySelectorAll(".spw-cell>*").forEach(card=>{
        card.setConfig({...card.config,language:langSelect.value});
        card.render();
      });
    });
    const grid=this.querySelector(".spw-layout");
    const columns=[
      ["control","switching"],
      ["schedule","water-times","detergent-times"],
      ["zones","rinse-times","manual-valves"],
      ["flow-protection","system"]
    ];
    const mobile=["control","zones","schedule","flow-protection","water-times","detergent-times","rinse-times","switching","manual-valves","system"];
    const tablet=["control","schedule","zones","flow-protection","water-times","detergent-times","rinse-times","switching","manual-valves","system"];
    for(const items of columns){
      const column=document.createElement("div");column.className="spw-column";
      for(const section of items){
        const cell=document.createElement("div");cell.className="spw-cell";
        cell.style.setProperty("--mobile-order",String(mobile.indexOf(section)));
        cell.style.setProperty("--tablet-order",String(tablet.indexOf(section)));
        const card=document.createElement("solar-panel-washing-"+section+"-card");
        card.setConfig({...this.config,language:langSelect.value,section});
        if(this._hass)card.hass=this._hass;
        cell.appendChild(card);column.appendChild(cell);
      }
      grid.appendChild(column);
    }
  }
  set hass(hass){this._hass=hass;this.querySelectorAll(".spw-cell>*").forEach(card=>{card.hass=hass;});}
}
if(!customElements.get("solar-panel-washing-overview-card"))customElements.define("solar-panel-washing-overview-card",SolarPanelWashingOverviewCard);
window.customCards.push({type:"solar-panel-washing-overview-card",name:"Solar Washing — Responsive Overview",description:"Desktop 4-column and mobile stacked washing dashboard",preview:true});

console.info("%c SOLAR-PANEL-WASHING-CARD %c v1.3.25 ","color:white;background:#1684d8;font-weight:700","color:#1684d8;background:white");

/* Events Calendar v2 — Month/Week/Cards. */
(function(){
  "use strict";
  const DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const MON = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const MAX_LANES = 3;                       // visible rows per week before "+N more"
  const SITE = "https://www.essexresort.com/calendar-events/"; // for share links

  /* ---------- helpers ---------- */
  const pad = n => String(n).padStart(2,"0");
  const key = d => d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
  const startOfDay = d => new Date(d.getFullYear(),d.getMonth(),d.getDate());
  const addDays = (d,n) => { const x=new Date(d); x.setDate(x.getDate()+n); return x; };
  const sameDay = (a,b) => a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate();

  function parseDate(s){
    if(!s) return null;
    s = s.trim();
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);           // ISO / yyyy-mm-dd
    if(m) return new Date(+m[1], +m[2]-1, +m[3]);
    m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);      // mm/dd/yyyy
    if(m) return new Date(+m[3], +m[1]-1, +m[2]);
    const d = new Date(s); return isNaN(d) ? null : startOfDay(d);
  }
  const truthy = v => /^(true|yes|on|1)$/i.test((v||"").trim());

  /* ---------- read events from DOM ---------- */
  function readEvents(){
    const nodes = document.querySelectorAll("#ec-source .cal-event");
    const descNodes = [...document.querySelectorAll("#ec-source .cal-desc")];
    const out = [];
    nodes.forEach((n, idx) => {
      const g = k => (n.getAttribute("data-"+k)||"").trim();
      const start = parseDate(g("start"));
      if(!start) return;
      let end = parseDate(g("end")) || start;
      if(end < start) end = start;
      // .cal-desc may be a child (template) OR a sibling div in the same Collection Item
      let descEl = n.querySelector(".cal-desc");
      if(!descEl){
        const item = n.closest(".w-dyn-item, .w-dyn-repeater-item");
        if(item) descEl = item.querySelector(".cal-desc");
      }
      if(!descEl) descEl = descNodes[idx] || null;
      out.push({
        name:g("name"), slug:g("slug"),
        start, end, oneDay:truthy(g("oneday")),
        recurring:truthy(g("recurring")),
        recurringDays:g("recurring-days").split(",").map(x=>parseInt(x,10)).filter(x=>!isNaN(x)),
        exclude:new Set(g("exclude").split(",").map(x=>{const d=parseDate(x);return d?key(d):null;}).filter(Boolean)),
        category:g("category"), color:g("color")||null, categoryLogo:g("category-logo"),
        audience:g("audience"), locationType:g("location-type"),
        timeText:g("time"), location:g("location"),
        image:g("image"),
        cta1:{text:g("cta1-text"),link:g("cta1-link")},
        cta2:{text:g("cta2-text"),link:g("cta2-link")},
        descHTML: descEl ? descEl.innerHTML : ""
      });
    });
    return out;
  }

  /* ---------- category color fallback (before color field is populated) ---------- */
  const palette = ["#c0392b","#2980b9","#27ae60","#8e44ad","#e67e22","#16a085","#d35400","#2c3e50"];
  const catColorCache = {};
  function colorFor(ev){
    if(ev.color) return ev.color;
    const c = ev.category || "";
    if(!(c in catColorCache)){
      let h=0; for(let i=0;i<c.length;i++) h=(h*31+c.charCodeAt(i))>>>0;
      catColorCache[c]=palette[h%palette.length];
    }
    return catColorCache[c];
  }

  /* ---------- expand into concrete dated instances within a window ---------- */
  function instancesInWindow(events, winStart, winEnd){
    const inst = [];
    events.forEach(ev => {
      if(ev.recurring && ev.recurringDays.length){
        let d = startOfDay(ev.start > winStart ? ev.start : winStart);
        const stop = ev.end < winEnd ? ev.end : winEnd;
        for(; d <= stop; d = addDays(d,1)){
          if(ev.recurringDays.includes(d.getDay()) && !ev.exclude.has(key(d))){
            inst.push({ev, start:startOfDay(d), end:startOfDay(d)});
          }
        }
      } else {
        const s = ev.oneDay ? ev.start : ev.start;
        const e = ev.oneDay ? ev.start : ev.end;
        if(e >= winStart && s <= winEnd) inst.push({ev, start:startOfDay(s), end:startOfDay(e)});
      }
    });
    return inst;
  }

  /* ---------- state ---------- */
  let ALL = [];
  let view = (function(){var d=new Date();return new Date(d.getFullYear(),d.getMonth(),1);})(); // current month
  let mode = "month";                          // month | week | cards
  const f = {cats:new Set(), aud:"", loc:""};

  function filtered(){
    return ALL.filter(ev =>
      (!f.cats.size || f.cats.has(ev.category)) &&
      (!f.aud || ev.audience===f.aud) &&
      (!f.loc || ev.locationType===f.loc));
  }

  function hexToRgba(hex,a){
    hex=(hex||"").trim().replace("#","");
    if(hex.length===3) hex=hex.split("").map(x=>x+x).join("");
    const n=parseInt(hex,16);
    if(hex.length!==6 || isNaN(n)) return "rgba(107,114,128,"+a+")";
    return "rgba("+((n>>16)&255)+","+((n>>8)&255)+","+(n&255)+","+a+")";
  }

  function categories(){
    const map=new Map();
    ALL.forEach(ev=>{ if(ev.category && !map.has(ev.category))
      map.set(ev.category,{name:ev.category,color:colorFor(ev),logo:ev.categoryLogo||""}); });
    return [...map.values()];
  }

  function renderPills(){
    const wrap=document.getElementById("ec-pills"); if(!wrap) return; wrap.innerHTML="";
    categories().forEach(c=>{
      const b=document.createElement("button");
      b.className="ec-pill"+(f.cats.has(c.name)?" ec-on":"");
      b.style.setProperty("--ec-c",c.color);
      b.style.setProperty("--ec-c-soft",hexToRgba(c.color,.12));
      b.innerHTML = c.logo ? '<img src="'+encodeURI(c.logo)+'" alt="'+escapeHtml(c.name)+'">' : escapeHtml(c.name);
      b.setAttribute("aria-pressed", f.cats.has(c.name)?"true":"false");
      b.addEventListener("click",()=>{
        if(f.cats.has(c.name)) f.cats.delete(c.name); else f.cats.add(c.name);
        renderPills(); render();
      });
      wrap.appendChild(b);
    });
  }

  /* ---------- build weeks for current month ---------- */
  function monthMatrix(){
    const y=view.getFullYear(), m=view.getMonth();
    const first=new Date(y,m,1);
    const gridStart=addDays(first,-first.getDay());          // back to Sunday
    const weeks=[];
    let cur=gridStart;
    for(let w=0;w<6;w++){
      const days=[];
      for(let i=0;i<7;i++){ days.push(new Date(cur)); cur=addDays(cur,1); }
      weeks.push(days);
      if(cur.getMonth()!==m && cur > new Date(y,m+1,0)) break; // stop after last month day
    }
    return weeks;
  }

  /* ---------- lane assignment per week ---------- */
  function layoutWeek(days, inst){
    const wStart=startOfDay(days[0]), wEnd=startOfDay(days[6]);
    const segs=[];
    inst.forEach(it=>{
      if(it.end < wStart || it.start > wEnd) return;
      const s = it.start < wStart ? wStart : it.start;
      const e = it.end > wEnd ? wEnd : it.end;
      segs.push({
        it, startCol:Math.round((s-wStart)/864e5), endCol:Math.round((e-wStart)/864e5),
        contL: it.start < wStart, contR: it.end > wEnd
      });
    });
    // sort: earlier start, then longer span first
    segs.sort((a,b)=> a.startCol-b.startCol || (b.endCol-b.startCol)-(a.endCol-a.startCol) || a.it.ev.name.localeCompare(b.it.ev.name));
    const lanes=[]; // each lane = array of occupied [startCol,endCol]
    const overflow={}; // col -> count
    segs.forEach(seg=>{
      let placed=-1;
      for(let l=0;l<lanes.length;l++){
        if(lanes[l].every(o=> seg.endCol<o[0] || seg.startCol>o[1])){ placed=l; break; }
      }
      if(placed===-1){ lanes.push([]); placed=lanes.length-1; }
      lanes[placed].push([seg.startCol,seg.endCol]);
      seg.lane=placed;
    });
    // mark overflow beyond MAX_LANES
    const visible=[];
    segs.forEach(seg=>{
      if(seg.lane<MAX_LANES){ visible.push(seg); }
      else{ for(let c=seg.startCol;c<=seg.endCol;c++) overflow[c]=(overflow[c]||0)+1; }
    });
    return {visible, overflow, laneCount:Math.min(lanes.length,MAX_LANES)};
  }

  /* ---------- render desktop grid ---------- */
  function renderGrid(){
    const grid=document.getElementById("ec-grid");
    grid.innerHTML="";
    const y=view.getFullYear(), m=view.getMonth();
    const inst=instancesInWindow(filtered(), addDays(new Date(y,m,1),-7), addDays(new Date(y,m+1,0),7));
    const today=startOfDay(new Date());
    monthMatrix().forEach(days=>{
      const wk=document.createElement("div"); wk.className="ec-week";
      const {visible,overflow,laneCount}=layoutWeek(days,inst);
      days.forEach((d)=>{
        const cell=document.createElement("div");
        cell.className="ec-cell"+(d.getMonth()!==m?" ec-out":"")+(sameDay(d,today)?" ec-today":"");
        cell.innerHTML='<div class="ec-daynum">'+d.getDate()+'</div>';
        const oc=overflow[d.getDay()];
        if(oc){ const mo=document.createElement("div"); mo.className="ec-more"; mo.textContent="+"+oc+" more";
          mo.dataset.day=key(d); wk.appendChild.call(cell,mo); }
        wk.appendChild(cell);
      });
      // reserve height for lanes
      const barH=25;
      wk.querySelectorAll(".ec-cell").forEach(c=>{ c.style.minHeight=(46+laneCount*barH+ (Object.keys(overflow).length?16:0))+"px"; });
      // bars overlay
      const bars=document.createElement("div"); bars.className="ec-bars";
      visible.forEach(seg=>{
        const b=document.createElement("div");
        b.className="ec-bar"+(seg.contL?" ec-cont-l":"")+(seg.contR?" ec-cont-r":"");
        b.style.gridColumn=(seg.startCol+1)+" / "+(seg.endCol+2);
        b.style.gridRow=(seg.lane+1);
        b.style.setProperty("--ec-c",colorFor(seg.it.ev));
        const single = seg.startCol===seg.endCol && !seg.contL && !seg.contR;
        b.innerHTML=(single?'<span class="ec-dot"></span>':'')+
          (seg.contL?'‹ ':'')+escapeHtml(seg.it.ev.name);
        b.addEventListener("click",()=>openModal(seg.it.ev, seg.it.start));
        bars.appendChild(b);
      });
      wk.appendChild(bars);
      grid.appendChild(wk);
    });
    // wire "+N more"
    grid.querySelectorAll(".ec-more").forEach(mo=>{
      mo.addEventListener("click",()=>openDay(parseDate(mo.dataset.day)));
    });
  }

  /* ---------- render mobile list ---------- */
  function renderList(){
    const list=document.getElementById("ec-list");
    const y=view.getFullYear(), m=view.getMonth();
    const inst=instancesInWindow(filtered(), new Date(y,m,1), new Date(y,m+1,0))
      .filter(it=> it.start.getMonth()===m || it.end.getMonth()===m || (it.start<=new Date(y,m+1,0)&&it.end>=new Date(y,m,1)));
    // group by day (a multi-day event shows once on its start within month)
    const byDay={};
    inst.forEach(it=>{
      const anchor = it.start < new Date(y,m,1) ? new Date(y,m,1) : it.start;
      const k=key(anchor);
      (byDay[k]=byDay[k]||[]).push(it);
    });
    const keys=Object.keys(byDay).sort();
    if(!keys.length){ list.innerHTML='<div class="ec-empty">No events this month.</div>'; return; }
    list.innerHTML="";
    keys.forEach(k=>{
      const d=parseDate(k);
      const wrap=document.createElement("div"); wrap.className="ec-list-day";
      wrap.innerHTML='<div class="ec-list-date">'+DOW[d.getDay()]+' <b>'+MON[d.getMonth()].slice(0,3)+' '+d.getDate()+'</b></div>';
      byDay[k].sort((a,b)=>a.ev.name.localeCompare(b.ev.name)).forEach(it=>{
        const c=document.createElement("div"); c.className="ec-lcard";
        c.style.setProperty("--ec-c",colorFor(it.ev));
        c.innerHTML=(it.ev.image?'<img src="'+it.ev.image+'" alt="">':'')+
          '<div class="ec-lc-body"><h4>'+escapeHtml(it.ev.name)+'</h4>'+
          '<div class="ec-lc-meta">'+escapeHtml([it.ev.timeText,it.ev.location].filter(Boolean).join(" · "))+'</div></div>';
        c.addEventListener("click",()=>openModal(it.ev,it.start));
        wrap.appendChild(c);
      });
      list.appendChild(wrap);
    });
  }

  /* ---------- day popup (from "+N more") ---------- */
  function openDay(d){
    const inst=instancesInWindow(filtered(), addDays(d,-1), addDays(d,1))
      .filter(it=> it.start<=d && it.end>=d);
    const modal=document.getElementById("ec-modal");
    modal.innerHTML='<button class="ec-x" aria-label="Close">×</button>'+
      '<div class="ec-body"><h3 style="margin-bottom:16px">'+DOW[d.getDay()]+', '+MON[d.getMonth()]+' '+d.getDate()+'</h3></div>';
    const body=modal.querySelector(".ec-body");
    inst.forEach(it=>{
      const row=document.createElement("div"); row.className="ec-lcard";
      row.style.cssText="display:flex;gap:12px;padding:12px;border:1px solid var(--ec-line);border-radius:12px;margin-bottom:10px;cursor:pointer;border-left:4px solid "+colorFor(it.ev);
      row.innerHTML=(it.ev.image?'<img src="'+it.ev.image+'" style="width:52px;height:52px;border-radius:8px;object-fit:cover;flex:none">':'')+
        '<div style="min-width:0"><h4 style="font-size:15px;font-weight:600;margin-bottom:3px">'+escapeHtml(it.ev.name)+'</h4>'+
        '<div style="font-size:12.5px;color:var(--ec-muted)">'+escapeHtml([it.ev.timeText,it.ev.location].filter(Boolean).join(" · "))+'</div></div>';
      row.addEventListener("click",()=>openModal(it.ev,it.start));
      body.appendChild(row);
    });
    modal.querySelector(".ec-x").addEventListener("click",closeModal);
    document.getElementById("ec-overlay").classList.add("ec-open");
  }

  /* ---------- event modal ---------- */
  function fmtRange(ev, occ){
    const s = ev.recurring ? occ : ev.start;
    const e = ev.recurring ? occ : ev.end;
    if(sameDay(s,e)) return DOW[s.getDay()]+", "+MON[s.getMonth()]+" "+s.getDate()+", "+s.getFullYear();
    return MON[s.getMonth()]+" "+s.getDate()+" – "+MON[e.getMonth()]+" "+e.getDate()+", "+e.getFullYear();
  }
  function icsDate(d){ return d.getFullYear()+pad(d.getMonth()+1)+pad(d.getDate()); }
  function gcalLink(ev,occ){
    const s = ev.recurring ? occ : ev.start;
    const e = ev.recurring ? occ : ev.end;
    const endExcl = addDays(e,1); // all-day end is exclusive
    const p=new URLSearchParams({
      action:"TEMPLATE", text:ev.name,
      dates:icsDate(s)+"/"+icsDate(endExcl),
      details:(stripHtml(ev.descHTML)+(ev.timeText?"\n\nTime: "+ev.timeText:"")).trim(),
      location:ev.location||""
    });
    return "https://calendar.google.com/calendar/render?"+p.toString();
  }
  function icsHref(ev,occ){
    const s = ev.recurring ? occ : ev.start;
    const e = ev.recurring ? occ : ev.end;
    const endExcl = addDays(e,1);
    const ics=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Essex//Calendar//EN","BEGIN:VEVENT",
      "UID:"+(ev.slug||ev.name)+"-"+icsDate(s)+"@essexresort",
      "DTSTART;VALUE=DATE:"+icsDate(s),"DTEND;VALUE=DATE:"+icsDate(endExcl),
      "SUMMARY:"+ev.name,"LOCATION:"+(ev.location||""),
      "DESCRIPTION:"+stripHtml(ev.descHTML).replace(/\n/g,"\\n"),
      "END:VEVENT","END:VCALENDAR"].join("\r\n");
    return "data:text/calendar;charset=utf8,"+encodeURIComponent(ics);
  }

  function openModal(ev, occ){
    occ = occ || ev.start;
    const c=colorFor(ev);
    const modal=document.getElementById("ec-modal");
    modal.style.setProperty("--ec-c",c);
    const ctas=[ev.cta1,ev.cta2].filter(x=>x.text&&x.link);
    modal.innerHTML=
      '<button class="ec-x" aria-label="Close">×</button>'+
      (ev.image?'<img class="ec-hero" src="'+ev.image+'" alt="">':'')+
      '<div class="ec-body">'+
        '<div class="ec-cat-tag">'+escapeHtml(ev.category||"Event")+'</div>'+
        '<h3>'+escapeHtml(ev.name)+'</h3>'+
        '<div class="ec-meta">'+
          '<div><span class="ec-ic">🗓</span><span>'+fmtRange(ev,occ)+'</span></div>'+
          (ev.timeText?'<div><span class="ec-ic">🕐</span><span>'+escapeHtml(ev.timeText)+'</span></div>':'')+
          (ev.location?'<div><span class="ec-ic">📍</span><span>'+escapeHtml(ev.location)+'</span></div>':'')+
        '</div>'+
        (ev.descHTML?'<div class="ec-desc">'+ev.descHTML+'</div>':'')+
        (ctas.length?'<div class="ec-ctas">'+ctas.map((x,i)=>'<a class="ec-btn '+(i===0?'ec-btn-primary':'ec-btn-ghost')+'" href="'+encodeURI(x.link)+'" target="_blank" rel="noopener">'+escapeHtml(x.text)+'</a>').join('')+'</div>':'')+
        '<div class="ec-actions">'+
          '<div class="ec-atc"><button class="ec-action" id="ec-atc-btn"><span>＋</span> Add to calendar</button>'+
            '<div class="ec-atc-menu" id="ec-atc-menu">'+
              '<a href="'+gcalLink(ev,occ)+'" target="_blank" rel="noopener">Google Calendar</a>'+
              '<a href="'+icsHref(ev,occ)+'" download="'+(ev.slug||"event")+'.ics">Apple / Outlook (.ics)</a>'+
            '</div></div>'+
          '<button class="ec-action" id="ec-share"><span>↗</span> Share</button>'+
        '</div>'+
      '</div>';
    modal.querySelector(".ec-x").addEventListener("click",closeModal);
    const atcBtn=modal.querySelector("#ec-atc-btn"), atcMenu=modal.querySelector("#ec-atc-menu");
    atcBtn.addEventListener("click",e=>{e.stopPropagation();atcMenu.classList.toggle("ec-open");});
    modal.querySelector("#ec-share").addEventListener("click",()=>{
      const url=SITE+(ev.slug||"");
      if(navigator.share){ navigator.share({title:ev.name,url}).catch(()=>{}); }
      else { navigator.clipboard.writeText(url); const b=modal.querySelector("#ec-share"); b.innerHTML='<span>✓</span> Copied'; setTimeout(()=>b.innerHTML='<span>↗</span> Share',1600); }
    });
    document.getElementById("ec-overlay").classList.add("ec-open");
  }
  function closeModal(){ document.getElementById("ec-overlay").classList.remove("ec-open"); }

  /* ---------- utils ---------- */
  function escapeHtml(s){ return (s||"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m])); }
  function stripHtml(s){ const t=document.createElement("div"); t.innerHTML=s||""; return t.textContent||""; }

  /* ---------- filters population ---------- */
  function fillFilters(){
    const uniq=k=>[...new Set(ALL.map(e=>e[k]).filter(Boolean))].sort();
    fill("ec-f-aud",uniq("audience")); fill("ec-f-loc",uniq("locationType"));
    function fill(id,vals){ const sel=document.getElementById(id); const keep=sel.firstElementChild.outerHTML;
      sel.innerHTML=keep+vals.map(v=>'<option value="'+escapeHtml(v)+'">'+escapeHtml(v)+'</option>').join(''); }
  }

  /* ---------- render week view (strip + day list) ---------- */
  let selDay = null; // selected day in week mode
  function renderWeek(){
    const wv=document.getElementById("ec-weekview"); wv.innerHTML="";
    const anchor=startOfDay(view);
    const wStart=addDays(anchor,-anchor.getDay());
    const wEnd=addDays(wStart,6);
    const today=startOfDay(new Date());
    if(!selDay || selDay<wStart || selDay>wEnd){
      selDay = (today>=wStart && today<=wEnd) ? today : wStart;
    }
    const inst=instancesInWindow(filtered(), wStart, wEnd);
    // strip
    const strip=document.createElement("div"); strip.className="ec-wstrip";
    for(let i=0;i<7;i++){
      const d=addDays(wStart,i);
      const dayInst=inst.filter(it=> it.start<=d && it.end>=d);
      const dots=[...new Set(dayInst.map(it=>colorFor(it.ev)))].slice(0,4)
        .map(c=>'<i style="background:'+c+'"></i>').join('');
      const cell=document.createElement("div");
      cell.className="ec-wsday"+(sameDay(d,selDay)?" ec-sel":"")+(sameDay(d,today)?" ec-today":"");
      cell.innerHTML='<div class="ec-wd">'+DOW[d.getDay()]+'</div><span class="ec-wn">'+d.getDate()+'</span>'+
        '<div class="ec-wdots">'+dots+'</div>';
      cell.addEventListener("click",()=>{ selDay=d; renderWeek(); });
      strip.appendChild(cell);
    }
    wv.appendChild(strip);
    // selected-day list
    const list=document.createElement("div"); list.className="ec-wlist";
    const dayInst=inst.filter(it=> it.start<=selDay && it.end>=selDay)
      .sort((a,b)=>a.ev.name.localeCompare(b.ev.name));
    if(!dayInst.length){
      list.innerHTML='<div class="ec-wempty">No events on '+DOW[selDay.getDay()]+', '+MON[selDay.getMonth()]+' '+selDay.getDate()+'.</div>';
    } else {
      dayInst.forEach(it=>{
        const ev=it.ev, c=colorFor(ev);
        const row=document.createElement("div"); row.className="ec-wrow";
        row.style.setProperty("--ec-c",c);
        const dr = sameDay(it.start,it.end)
          ? DOW[it.start.getDay()]+", "+MON[it.start.getMonth()].slice(0,3)+" "+it.start.getDate()+", "+it.start.getFullYear()
          : DOW[it.start.getDay()].slice(0,3)+", "+MON[it.start.getMonth()].slice(0,3)+" "+it.start.getDate()+" – "+DOW[it.end.getDay()].slice(0,3)+", "+MON[it.end.getMonth()].slice(0,3)+" "+it.end.getDate()+", "+it.end.getFullYear();
        row.innerHTML='<div class="ec-wr-t"><i></i>'+escapeHtml(ev.name)+'</div>'+
          '<div class="ec-wr-m">'+escapeHtml(dr)+
          (ev.timeText?'<br>'+escapeHtml(ev.timeText):'')+
          (ev.location?'<br><u>'+escapeHtml(ev.location)+'</u>':'')+'</div>';
        row.addEventListener("click",()=>openModal(ev,it.start));
        list.appendChild(row);
      });
    }
    wv.appendChild(list);
  }

  /* ---------- render cards view ---------- */
  function renderCards(){
    const cv=document.getElementById("ec-cards"); cv.innerHTML="";
    const y=view.getFullYear(), m=view.getMonth();
    const mStart=new Date(y,m,1), mEnd=new Date(y,m+1,0);
    const inst=instancesInWindow(filtered(), mStart, mEnd)
      .filter(it=> it.end>=mStart && it.start<=mEnd);
    inst.sort((a,b)=> a.start-b.start || a.ev.name.localeCompare(b.ev.name));
    if(!inst.length){ cv.innerHTML='<div class="ec-cards-empty">No events this month.</div>'; return; }
    inst.forEach(it=>{
      const ev=it.ev, c=colorFor(ev);
      const el=document.createElement("div"); el.className="ec-card";
      el.style.setProperty("--ec-c",c);
      const dateRow = sameDay(it.start,it.end)
        ? DOW[it.start.getDay()]+", "+MON[it.start.getMonth()]+" "+it.start.getDate()+", "+it.start.getFullYear()
        : DOW[it.start.getDay()].slice(0,3)+", "+MON[it.start.getMonth()].slice(0,3)+" "+it.start.getDate()+" – "+DOW[it.end.getDay()].slice(0,3)+", "+MON[it.end.getMonth()].slice(0,3)+" "+it.end.getDate();
      const chips=[ev.audience,ev.locationType,ev.category].filter(Boolean)
        .map(x=>'<span class="ec-chip">'+escapeHtml(x)+'</span>').join('');
      const plain=stripHtml(ev.descHTML).trim();
      const LIMIT=150;
      const truncated=plain.length>LIMIT;
      const descShort=truncated? plain.slice(0,LIMIT).replace(/\s+\S*$/,'')+"…" : plain;
      el.innerHTML=
        '<div class="ec-card-media">'+
          (ev.image?'<img src="'+ev.image+'" alt="" loading="lazy">':'<div style="height:64px"></div>')+
          '<div class="ec-card-date"><b>'+it.start.getDate()+'</b><span>'+MON[it.start.getMonth()].slice(0,3)+'</span></div>'+
        '</div>'+
        '<div class="ec-card-body">'+
          '<h4>'+escapeHtml(ev.name)+'</h4>'+
          '<div class="ec-card-rows">'+
            '<div><span class="ec-ic">🗓</span><span>'+escapeHtml(dateRow)+'</span></div>'+
            (ev.timeText?'<div><span class="ec-ic">🕐</span><span>'+escapeHtml(ev.timeText)+'</span></div>':'')+
            (ev.location?'<div><span class="ec-ic">📍</span><span>'+escapeHtml(ev.location)+'</span></div>':'')+
          '</div>'+
          (chips?'<div class="ec-card-chips">'+chips+'</div>':'')+
          (plain?'<div class="ec-card-desc">'+escapeHtml(descShort)+
            (truncated?'<span class="ec-showmore">show more</span>':'')+'</div>':'')+
        '</div>'+
        '<div class="ec-card-foot">'+
          (ev.cta1.text&&ev.cta1.link?'<a class="ec-btn ec-btn-primary" href="'+encodeURI(ev.cta1.link)+'" target="_blank" rel="noopener">'+escapeHtml(ev.cta1.text)+'</a>':'')+
          '<button class="ec-icon-btn ec-card-share" title="Share">↗</button>'+
          '<button class="ec-icon-btn ec-card-atc" title="Add to calendar">＋</button>'+
        '</div>';
      const open=()=>openModal(ev,it.start);
      el.querySelector(".ec-card-media").addEventListener("click",open);
      el.querySelector("h4").addEventListener("click",open);
      const sm=el.querySelector(".ec-showmore"); if(sm) sm.addEventListener("click",e=>{e.stopPropagation();open();});
      el.querySelector(".ec-card-share").addEventListener("click",e=>{
        e.stopPropagation();
        const url=SITE+(ev.slug||"");
        if(navigator.share){ navigator.share({title:ev.name,url}).catch(()=>{}); }
        else { navigator.clipboard.writeText(url); const b=e.currentTarget; b.textContent="✓"; setTimeout(()=>b.textContent="↗",1400); }
      });
      el.querySelector(".ec-card-atc").addEventListener("click",e=>{
        e.stopPropagation();
        window.open(gcalLink(ev,it.start),"_blank","noopener");
      });
      cv.appendChild(el);
    });
  }

  /* ---------- render + wire ---------- */
  function render(){
    const t=document.getElementById("ec-title");
    const grid=document.getElementById("ec-grid"), wv=document.getElementById("ec-weekview"),
          cv=document.getElementById("ec-cards"), dow=document.querySelector("#ec-cal .ec-dow");
    if(mode==="week"){
      const a=startOfDay(view), ws=addDays(a,-a.getDay()), we=addDays(ws,6);
      t.textContent = ws.getMonth()===we.getMonth()
        ? MON[ws.getMonth()]+" "+ws.getDate()+" – "+we.getDate()+", "+we.getFullYear()
        : MON[ws.getMonth()].slice(0,3)+" "+ws.getDate()+" – "+MON[we.getMonth()].slice(0,3)+" "+we.getDate()+", "+we.getFullYear();
    } else {
      t.textContent=MON[view.getMonth()]+" "+view.getFullYear();
    }
    grid.style.display = mode==="month" ? "" : "none";
    if(dow) dow.style.display = mode==="month" ? "" : "none";
    wv.classList.toggle("ec-show", mode==="week");
    cv.classList.toggle("ec-show", mode==="cards");
    document.getElementById("ec-list").classList.toggle("ec-hide", mode!=="month");
    if(mode==="month"){ renderGrid(); renderList(); }
    else if(mode==="week"){ renderWeek(); }
    else { renderCards(); }
  }
  function init(){
    ALL=readEvents(); fillFilters(); renderPills(); render();
    document.querySelectorAll("[data-nav]").forEach(b=>b.addEventListener("click",()=>{
      const dir=+b.dataset.nav;
      if(mode==="week"){ view=addDays(startOfDay(view),dir*7); selDay=null; }
      else { view=new Date(view.getFullYear(),view.getMonth()+dir,1); }
      render();
    }));
    document.getElementById("ec-today").addEventListener("click",()=>{
      view=startOfDay(new Date()); if(mode!=="week") view.setDate(1); render();
    });
    document.querySelectorAll("#ec-views .ec-view-btn").forEach(b=>b.addEventListener("click",()=>{
      mode=b.dataset.view;
      document.querySelectorAll("#ec-views .ec-view-btn").forEach(x=>x.classList.toggle("ec-on",x===b));
      if(mode==="week"){ const now=startOfDay(new Date());
        if(now.getFullYear()===view.getFullYear() && now.getMonth()===view.getMonth()) view=now; }
      else { view=new Date(view.getFullYear(),view.getMonth(),1); }
      render();
    }));
    document.getElementById("ec-f-aud").addEventListener("change",e=>{f.aud=e.target.value;render();});
    document.getElementById("ec-f-loc").addEventListener("change",e=>{f.loc=e.target.value;render();});
    document.getElementById("ec-overlay").addEventListener("click",e=>{ if(e.target.id==="ec-overlay") closeModal(); });
    document.addEventListener("keydown",e=>{ if(e.key==="Escape") closeModal(); });
    document.addEventListener("click",()=>{ const m=document.getElementById("ec-atc-menu"); if(m) m.classList.remove("ec-open"); });
  }
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",init); else init();
})();

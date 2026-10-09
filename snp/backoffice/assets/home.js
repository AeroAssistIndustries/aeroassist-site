/* Home: a dashboard for each role. Live clocks and calling hours, today's agenda, targets, team leaderboard, pipeline, leads and notes. */
(() => {
"use strict";
const { S, el, items, money, money0, fmtDate, fmtMonth, fmtWhen, nameOf, today, addDays } = SNP;
const svgNS="http://www.w3.org/2000/svg";
const sv=(tag,attrs={},...kids)=>{ const n=document.createElementNS(svgNS,tag); for(const [k,v] of Object.entries(attrs)) n.setAttribute(k,v); kids.forEach(k=>n.append(k.nodeType?k:document.createTextNode(k))); return n; };
const pad=n=>String(n).padStart(2,"0");
const ZONES=[["Miami","America/New_York"],["Mexico City","America/Mexico_City"],["Bogotá · Lima","America/Bogota"],["São Paulo","America/Sao_Paulo"]];
const OPEN_DOC = id => { SNP.go("records"); setTimeout(()=>SNP.records.openDoc(id),60); };

/* ---------- clocks ---------- */
function localParts(tz){
  const p=Object.fromEntries(new Intl.DateTimeFormat("en-US",{timeZone:tz,weekday:"short",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date()).map(x=>[x.type,x.value]));
  return {dow:["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].indexOf(p.weekday), mins:Number(p.hour)*60+Number(p.minute)};
}
/* A weekday between 9 a.m. and 6 p.m. where the customer is. */
const callable = tz => { const {dow,mins}=localParts(tz); return dow>=1&&dow<=5&&mins>=540&&mins<1080; };
function offsetFromHQ(tz){
  const a=localParts(SNP.HQ_TZ), b=localParts(tz);
  let diff=(b.dow*1440+b.mins)-(a.dow*1440+a.mins);
  if (diff>3.5*1440) diff-=7*1440; if (diff<-3.5*1440) diff+=7*1440;
  const h=Math.round(diff/30)/2;
  return h===0?"Same as AZ":`${h>0?"+":"−"}${Math.abs(h)} h from AZ`;
}
function bigTime(n){
  const p=Object.fromEntries(new Intl.DateTimeFormat("en-US",{timeZone:n.dataset.tz,hour:"numeric",minute:"2-digit",second:"2-digit",hour12:true}).formatToParts(new Date()).map(x=>[x.type,x.value]));
  n.replaceChildren(`${p.hour}:${p.minute}`, el("span",{class:"hc-sec"},p.second), el("span",{class:"hc-ampm"},p.dayPeriod||""));
}
function tick(){
  const nodes=document.querySelectorAll("#main [data-tz]"); if(!nodes.length) return;
  nodes.forEach(n=>{ if(n.dataset.fmt==="big") bigTime(n); else n.textContent=SNP.timeIn(n.dataset.tz); });
  document.querySelectorAll("#main [data-call]").forEach(n=>{ const ok=callable(n.dataset.call); n.className="zc-dot "+(ok?"on":"off"); n.title=ok?"Business hours there":"After hours there"; });
  const bs=document.querySelector("#main [data-biz]"); if(bs){ const b=SNP.bizStatus(); bs.textContent=b.label; bs.className="biz-pill "+(b.isOpen?"on":"off"); }
}
let ticking=null;
function startTicks(){ if(!ticking) ticking=setInterval(tick,1000); setTimeout(tick,0); }

function hero(sub){
  const first=(S.me&&S.me.name||"").split(" ")[0];
  const hr=new Date().getHours(), greet=hr<12?"Good morning":hr<17?"Good afternoon":"Good evening";
  const b=SNP.bizStatus();
  const big=el("div",{class:"hc-time","data-tz":SNP.HQ_TZ,"data-fmt":"big","aria-label":"Arizona time"}); bigTime(big);
  return el("section",{class:"hero"},
    el("div",{class:"hero-l"},
      el("div",{class:"eyebrow"}, new Date().toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric",year:"numeric"})),
      el("h2",{class:"hero-h"}, `${greet}${first?", "+first:""}`),
      sub?el("p",{class:"hero-sub"}, sub):null),
    el("div",{class:"hero-clock"},
      big,
      el("div",{class:"hc-meta"}, el("span",{},"Phoenix, Arizona"), el("span",{class:"biz-pill "+(b.isOpen?"on":"off"),"data-biz":"1"}, b.label))),
    el("div",{class:"zones",role:"list","aria-label":"Customer time zones"},
      ZONES.map(([city,tz])=>{ const ok=callable(tz);
        return el("div",{class:"zone",role:"listitem"},
          el("span",{class:"zc-dot "+(ok?"on":"off"),"data-call":tz,title:ok?"Business hours there":"After hours there"}),
          el("div",{class:"zc-main"}, el("div",{class:"zc-city"},city), el("div",{class:"zc-time","data-tz":tz}, SNP.timeIn(tz))),
          el("div",{class:"zc-off"}, offsetFromHQ(tz))); }),
      el("div",{class:"zone-key muted small"}, el("span",{class:"zc-dot on"}), "good time to call (9–6 their time)")));
}

/* ---------- numbers ---------- */
const billable = () => items("invoice").filter(x=>!["Draft","Void"].includes(x.data.status));
const monthOf = x => (x.data.date||"").slice(0,7);
function prevMonth(m){ const [y,mm]=m.split("-").map(Number); const d=new Date(y,mm-2,1); return d.getFullYear()+"-"+pad(d.getMonth()+1); }
function lastMonths(n){ const out=[]; const d=new Date(); for(let i=n-1;i>=0;i--){ const x=new Date(d.getFullYear(),d.getMonth()-i,1); out.push(x.getFullYear()+"-"+pad(x.getMonth()+1)); } return out; }
const sumBy = (list, f) => list.reduce((s,x)=>s+(Number(f(x))||0),0);
/* Month to date against the same days of last month. */
function mtd(filter=()=>true){
  const m=SNP.thisMonth(), pm=prevMonth(m), day=today().slice(8,10);
  const cur=billable().filter(x=>monthOf(x)===m&&filter(x)), prev=billable().filter(x=>monthOf(x)===pm&&(x.data.date||"").slice(8,10)<=day&&filter(x));
  return {cur, sales:sumBy(cur,x=>x.data.subtotal), profit:sumBy(cur,x=>x.data.profit), prevSales:sumBy(prev,x=>x.data.subtotal)};
}
function trendKpi(value, label, now, before, cls=""){
  const k=SNP.kpi(value,label,cls);
  if (before>0){ const ch=Math.round((now-before)/before*100); k.append(el("div",{class:"trend "+(ch>=0?"up":"down")}, `${ch>=0?"▲":"▼"} ${Math.abs(ch)}% vs same point last month`)); }
  else if (now>0) k.append(el("div",{class:"trend up"},"First sales at this point of the month"));
  return k;
}
const collectedIn = m => billable().reduce((s,x)=>s+(x.data.payments||[]).filter(p=>(p.date||"").slice(0,7)===m).reduce((a,p)=>a+(p.amount||0),0),0);
function bizDaysLeft(){
  const days=(S.settings&&S.settings.workdays)||[1,2,3,4,5], t=new Date(), end=new Date(t.getFullYear(),t.getMonth()+1,0); let n=0;
  for (let d=new Date(t.getFullYear(),t.getMonth(),t.getDate()); d<=end; d.setDate(d.getDate()+1)) if (days.includes(d.getDay())) n++;
  return n;
}

/* ---------- building blocks ---------- */
function panel(title, link, ...kids){
  return el("section",{class:"panel"}, el("div",{class:"panel-h"}, el("h3",{},title), link?el("a",{href:link[0],class:"small"},link[1]):null), ...kids);
}
function li(main, meta, target, cls=""){
  const a = typeof target==="function" ? el("a",{href:"#",onclick:e=>{ e.preventDefault(); target(); }}, main) : el("a",{href:target}, main);
  return el("li",{class:cls}, a, meta?el("span",{class:"muted small"}, meta):null);
}
const listOr = (rows, empty) => rows.length?el("ul",{class:"attn"}, rows):el("p",{class:"muted small"},empty);

function salesChart(){
  const months=lastMonths(6), inv=billable();
  const billed=months.map(m=>sumBy(inv.filter(x=>monthOf(x)===m),x=>x.data.total));
  const coll=months.map(collectedIn);
  const max=Math.max(1,...billed,...coll);
  const step=Math.pow(10,Math.floor(Math.log10(max))), top=Math.ceil(max/step)*step;
  const W=640,H=220,L=56,B=28,T=12,R=8, ch=H-B-T, cw=(W-L-R)/months.length, bw=Math.min(26,cw/3);
  const svg=sv("svg",{viewBox:`0 0 ${W} ${H}`,class:"chart",role:"img","aria-label":"Invoiced and collected, last six months"});
  for(let i=0;i<=4;i++){ const v=top*i/4, y=T+ch-(ch*i/4);
    svg.append(sv("line",{x1:L,x2:W-R,y1:y,y2:y,class:"grid"}), sv("text",{x:L-8,y:y+4,class:"axis","text-anchor":"end"}, (v>=1e6?"$"+(v/1e6).toFixed(v%1e6?1:0)+"m":v>=1e3?"$"+(v/1e3).toFixed(v%1e3?1:0)+"k":"$"+Math.round(v)))); }
  months.forEach((m,i)=>{ const x=L+cw*i+cw/2, h1=ch*billed[i]/top, h2=ch*coll[i]/top;
    const b1=sv("rect",{x:x-bw-2,y:T+ch-h1,width:bw,height:Math.max(h1,0),rx:2,class:"bar-a"}); b1.append(sv("title",{},`${fmtMonth(m)} invoiced: ${money(billed[i])}`));
    const b2=sv("rect",{x:x+2,y:T+ch-h2,width:bw,height:Math.max(h2,0),rx:2,class:"bar-b"}); b2.append(sv("title",{},`${fmtMonth(m)} collected: ${money(coll[i])}`));
    svg.append(b1,b2, sv("text",{x,y:H-8,class:"axis","text-anchor":"middle"}, new Date(m+"-01T12:00").toLocaleDateString(undefined,{month:"short"})));
  });
  return el("section",{class:"panel"}, el("div",{class:"panel-h"}, el("h3",{},"Invoiced vs collected"), el("div",{class:"legend"}, el("span",{}, el("i",{class:"lg-a"}),"Invoiced"), el("span",{}, el("i",{class:"lg-b"}),"Collected"))),
    el("div",{class:"chart-wrap"}, svg));
}

function myTasks(){
  const me=S.me&&S.me.id, td=today();
  const mine=items("task").filter(t=>t.data.assigneeId===me&&t.data.status==="Open").sort((a,b)=>(a.data.due||"9999").localeCompare(b.data.due||"9999")).slice(0,8);
  const late=mine.filter(t=>t.data.due&&t.data.due<td).length;
  return panel(late?`My tasks · ${late} overdue`:"My tasks",["#tasks","All tasks →"],
    mine.length?el("ul",{class:"tasks"}, mine.map(SNP.tasks.taskRow)):el("p",{class:"muted small"},"Nothing on your list."),
    el("button",{class:"btn small",type:"button",onclick:()=>SNP.newTask()},"+ Task"));
}

function newLeads(onlyMine){
  if (!SNP.can("lead")) return null;
  const me=S.me&&S.me.id, td=today();
  const hrs=l=>(Date.now()-new Date(l.data.receivedAt||l.createdAt))/36e5;
  const all=items("lead").filter(l=>SNP.leads.OPEN.includes(l.data.status)&&(!onlyMine||!l.data.ownerId||l.data.ownerId===me));
  const fresh=all.filter(l=>l.data.status==="New").sort((a,b)=>(b.data.receivedAt||b.createdAt||"").localeCompare(a.data.receivedAt||a.createdAt||""));
  const due=all.filter(l=>l.data.status!=="New"&&l.data.nextStepDate&&l.data.nextStepDate<=td);
  const age=l=>{ const h=hrs(l); return h<1?"just now":h<24?`${Math.floor(h)} h ago`:`${Math.floor(h/24)} d ago`; };
  const rows=[...fresh.slice(0,5).map(l=>li(`${l.data.company||l.data.name}${l.data.division?" · "+l.data.division:""}`, `${l.data.location?l.data.location+" · ":""}${age(l)}${l.data.ownerId?"":" · unassigned"}`, ()=>SNP.leads.open(l.id), hrs(l)>24?"bad":"")),
    ...due.slice(0,3).map(l=>li(`Follow up: ${l.data.company||l.data.name}`, `${l.data.status} · ${fmtDate(l.data.nextStepDate)}`, ()=>SNP.leads.open(l.id), l.data.nextStepDate<td?"bad":""))];
  return panel(fresh.length?`New leads · ${fresh.length}`:"New leads",["#leads","All leads →"],
    listOr(rows,"No new leads. Website quote requests and account applications land here on their own."),
    fresh.some(l=>hrs(l)>24)?el("p",{class:"muted small"},"Leads in red have waited more than a day. The first call wins most wholesale accounts."):null);
}

function funnel(deals, title){
  if (!SNP.can("deal","rw")) return null;
  const rows=SNP.crm.OPEN_STAGES.map(s=>{ const ds=deals.filter(d=>d.data.stage===s); return {s,n:ds.length,v:sumBy(ds,d=>d.data.value)}; });
  const useVal=rows.some(r=>r.v>0), max=Math.max(1,...rows.map(r=>useVal?r.v:r.n));
  const m=SNP.thisMonth(), won=deals.filter(d=>d.data.stage==="Won"&&(d.updatedAt||"").slice(0,7)===m), lost=deals.filter(d=>d.data.stage==="Lost"&&(d.updatedAt||"").slice(0,7)===m);
  return panel(title,["#pipeline","Pipeline →"],
    el("div",{class:"funnel"}, rows.map(r=>el("a",{class:"fn-row",href:"#pipeline"},
      el("span",{class:"fn-l"},r.s),
      el("span",{class:"fn-bar"}, el("i",{style:`width:${Math.max(r.n?4:0,Math.round((useVal?r.v:r.n)/max*100))}%`})),
      el("span",{class:"fn-v"}, `${r.n} · ${money0(r.v)}`)))),
    el("p",{class:"muted small"}, `This month: ${won.length} won (${money0(sumBy(won,d=>d.data.value))}) · ${lost.length} lost`));
}

function leaderboard(){
  const m=SNP.thisMonth(), tg=(S.settings&&S.settings.targets)||{};
  const reps=new Map();
  S.people.filter(p=>["owner","sales"].includes(p.role)).forEach(p=>reps.set(p.id,{id:p.id,name:p.name,sales:0,profit:0,n:0}));
  SNP.reports.byRep(SNP.reports.inRange(m+"-01",today())).forEach(r=>{ const id=Number(r.key)||0; if(!id&&!r.sales) return;
    const x=reps.get(id)||{id,name:r.label,sales:0,profit:0,n:0}; x.sales=r.sales; x.profit=r.profit; x.n=r.count; reps.set(id,x); });
  const list=[...reps.values()].map(x=>({...x,target:Number(tg[x.id])||0})).sort((a,b)=>b.sales-a.sales||a.name.localeCompare(b.name));
  if (!list.length) return null;
  const top=Math.max(1,...list.map(x=>Math.max(x.sales,x.target)));
  const tTot=sumBy(list,x=>x.target), sTot=sumBy(list,x=>x.sales), anyT=tTot>0;
  return panel(`Team · ${fmtMonth(m)}`, S.perms.managePeople?["#people","Set targets →"]:null,
    el("ol",{class:"board"}, list.map((x,i)=>{ const pc=x.target?Math.round(x.sales/x.target*100):null;
      return el("li",{class:"lb-row"+(pc>=100?" hit":"")},
        el("span",{class:"lb-rank"}, String(i+1)),
        el("div",{class:"lb-main"},
          el("div",{class:"lb-top"}, el("strong",{},x.name), el("span",{class:"lb-amt"}, money0(x.sales), x.target?el("span",{class:"muted"}, ` of ${money0(x.target)}`):null)),
          el("div",{class:"lb-bar"}, el("i",{style:`width:${Math.round(x.sales/top*100)}%`}), x.target?el("b",{class:"lb-goal",style:`left:${Math.min(100,Math.round(x.target/top*100))}%`,title:"Target"}):null),
          el("div",{class:"lb-sub muted small"}, `${x.n} invoice${x.n===1?"":"s"}`, S.perms.seeCosts&&x.sales?` · ${money0(x.profit)} gross profit`:"", pc!=null?` · ${pc}% of target`:"")));
    })),
    el("p",{class:"muted small"}, anyT?`Team: ${money0(sTot)} of ${money0(tTot)} (${Math.round(sTot/tTot*100)}%) with ${bizDaysLeft()} business days left.`:"No monthly targets yet. Set one for each owner and salesperson under People."));
}

function targetRing(){
  const me=S.me&&S.me.id, target=Number(((S.settings&&S.settings.targets)||{})[me])||0;
  const {sales,prevSales}=mtd(x=>x.data.repId===me);
  const pc=target?sales/target:0, left=bizDaysLeft(), need=Math.max(0,target-sales);
  const r=52, c=2*Math.PI*r;
  const ring=sv("svg",{viewBox:"0 0 132 132",class:"ring",role:"img","aria-label":target?`${Math.round(pc*100)}% of monthly target`:"No target set"},
    sv("circle",{cx:66,cy:66,r,class:"ring-bg"}),
    sv("circle",{cx:66,cy:66,r,class:"ring-fg"+(pc>=1?" hit":""),"stroke-dasharray":`${(c*Math.min(pc,1)).toFixed(1)} ${c.toFixed(1)}`,transform:"rotate(-90 66 66)"}),
    sv("text",{x:66,y:66,class:"ring-n","text-anchor":"middle"}, target?`${Math.round(pc*100)}%`:"—"),
    sv("text",{x:66,y:86,class:"ring-l","text-anchor":"middle"}, target?"of target":"no target"));
  const lines = target ? [
      el("div",{class:"rt-big"}, money0(sales), el("span",{class:"muted"}, ` of ${money0(target)}`)),
      pc>=1?el("p",{class:"good-t"},"Target hit. Everything from here is extra.")
        :el("p",{}, `${money0(need)} to go · `, left?`about ${money0(need/left)} per business day for the ${left} left.`:"last day of the month."),
      prevSales?el("p",{class:"muted small"}, `Same point last month: ${money0(prevSales)}`):null]
    : [el("div",{class:"rt-big"}, money0(sales)), el("p",{class:"muted small"},"Sold this month. An owner can set your monthly target under People.")];
  return panel(`My month · ${fmtMonth(SNP.thisMonth())}`, null, el("div",{class:"target"}, ring, el("div",{class:"rt-text"}, ...lines)));
}

function notesPanel(){
  if (!SNP.notes) return null;
  const list=SNP.notes.sorted(items("note")).slice(0,6);
  return panel("Notes",["#notes","All notes →"], SNP.notes.composer(), list.length?SNP.notes.board(list,true):null);
}

function activityPanel(){
  if (!S.activity.length) return null;
  return panel("Recent activity",["#activity","All →"],
    el("ul",{class:"attn"}, S.activity.slice(0,8).map(a=>el("li",{}, el("span",{}, `${nameOf(a.by)} ${a.action}: ${a.detail}`), el("span",{class:"muted small"}, fmtWhen(a.at))))));
}

function quickAdd(){
  const b=(label,fn)=>el("button",{class:"btn",type:"button",onclick:fn},label), can=t=>SNP.can(t,"rw");
  const btns=[can("lead")&&b("+ Lead",()=>SNP.leads.newLead()), can("customer")&&b("+ Customer",()=>SNP.crm.editCustomer()), can("deal")&&b("+ Deal",()=>SNP.crm.editDeal()),
    can("quote")&&b("+ Quote",()=>SNP.sales.newDoc("quote")), can("invoice")&&b("+ Invoice",()=>SNP.sales.newDoc("invoice")),
    can("oil_order")&&b("+ Oil order",()=>SNP.oil.editOrder()), can("po")&&b("+ Purchase order",()=>SNP.sales.newDoc("po")),
    can("product")&&b("+ Product",()=>SNP.products.edit()), b("+ Task",()=>SNP.newTask())].filter(Boolean);
  return panel("Quick add", null, el("div",{class:"quick"}, btns), el("p",{class:"muted small kbd-hint"}, "Tip: press ", el("kbd",{},"Ctrl K"), " (", el("kbd",{},"⌘K"), " on a Mac) or ", el("kbd",{},"/"), " to search everything."));
}

function docsDue(){
  const td=today();
  return [...S.docs.values()].filter(d=>d.due&&!SNP.records.isDone(d)&&d.due<=addDays(td,30)).sort((a,b)=>a.due.localeCompare(b.due))
    .map(d=>li(`${d.code} ${d.title}`, (d.due<td?"overdue since ":"due ")+fmtDate(d.due), ()=>OPEN_DOC(d.id), d.due<td?"bad":""));
}
function overdueInvoices(mineOnly){
  const me=S.me&&S.me.id;
  return billable().filter(x=>SNP.sales.statusOf(x)==="Overdue"&&(!mineOnly||x.data.repId===me)).sort((a,b)=>a.data.dueDate.localeCompare(b.data.dueDate))
    .map(x=>li(`${x.data.number} · ${SNP.customerName(x.data.customerId)}`, `${money(x.data.balance)} overdue since ${fmtDate(x.data.dueDate)}`, ()=>SNP.sales.openDoc("invoice",x.id),"bad"));
}

/* ---------- owner ---------- */
function ownerHome(main){
  const td=today(), m=SNP.thisMonth(), inv=billable();
  const k=mtd(), coll=collectedIn(m), collPrev=collectedIn(prevMonth(m));
  const unpaid=sumBy(inv,x=>Math.max(0,x.data.balance||0)), od=inv.filter(x=>SNP.sales.statusOf(x)==="Overdue");
  const pipe=items("deal").filter(d=>SNP.crm.OPEN_STAGES.includes(d.data.stage));
  const leadsNew=items("lead").filter(l=>l.data.status==="New").length;
  const oil=SNP.can("oil_order")?SNP.oil.statement(m):null;
  main.append(hero(attnSummary(od.length, leadsNew)),
    el("div",{class:"kpis kpis-6"},
      trendKpi(money0(k.sales),"Sales this month",k.sales,k.prevSales),
      SNP.kpi(money0(k.profit),`Gross profit · ${k.sales?Math.round(k.profit/k.sales*1000)/10:0}% margin`,k.profit<0?"bad":""),
      SNP.kpi(money0(coll),`Collected this month${collPrev?" · last month "+money0(collPrev):""}`),
      SNP.kpi(money0(unpaid),od.length?`Unpaid · ${od.length} overdue`:"Unpaid",od.length?"bad":unpaid?"warn":""),
      SNP.kpi(money0(sumBy(pipe,d=>d.data.value)),`Open pipeline · ${pipe.length} deal${pipe.length===1?"":"s"}`),
      oil?SNP.kpi(money0(oil.owners),`Oil rewards kept this month (of ${money0(oil.R)})`):SNP.kpi(String(leadsNew),"New leads",leadsNew?"warn":"")));

  const attn=[];
  od.slice(0,6).forEach(x=>attn.push(li(`${x.data.number} · ${SNP.customerName(x.data.customerId)}`, `${money(x.data.balance)} overdue since ${fmtDate(x.data.dueDate)}`, ()=>SNP.sales.openDoc("invoice",x.id),"bad")));
  items("deal").filter(d=>SNP.crm.OPEN_STAGES.includes(d.data.stage)&&d.data.nextStepDate&&d.data.nextStepDate<=td).slice(0,6)
    .forEach(d=>attn.push(li(d.data.title, `${d.data.nextStep||"Follow up"} · ${fmtDate(d.data.nextStepDate)}${d.data.ownerId?" · "+nameOf(d.data.ownerId):""}`, ()=>SNP.crm.editDeal(d.id), d.data.nextStepDate<td?"bad":"")));
  items("quote").filter(q=>q.data.status==="Sent"&&q.data.validUntil&&q.data.validUntil>=td&&q.data.validUntil<=addDays(td,3))
    .forEach(q=>attn.push(li(`${q.data.number} · ${SNP.customerName(q.data.customerId)}`, `quote expires ${fmtDate(q.data.validUntil)}`, ()=>SNP.sales.openDoc("quote",q.id))));
  items("po").filter(p=>p.data.expectedDate&&p.data.expectedDate<td&&["Sent","Confirmed"].includes(p.data.status))
    .forEach(p=>attn.push(li(`${p.data.number} · ${SNP.supplierName(p.data.supplierId)}`, `delivery late since ${fmtDate(p.data.expectedDate)}`, ()=>SNP.sales.openDoc("po",p.id),"bad")));
  if (SNP.can("oil_order","rw")){ const prev=SNP.oil.statement(prevMonth(m)); if(prev.owed>0.005) attn.push(li(`Pay ${S.settings.partnerName||"partner"} for ${fmtMonth(prev.month)}`, `${money(prev.owed)} still owed`, "#oil","bad")); }
  attn.push(...docsDue().slice(0,6));
  items("customer").filter(c=>c.data.resaleCert&&c.data.resaleExpiry&&c.data.resaleExpiry<=addDays(td,30))
    .forEach(c=>attn.push(li(`${c.data.name}: resale certificate`, (c.data.resaleExpiry<td?"expired ":"expires ")+fmtDate(c.data.resaleExpiry), "#customers/"+c.id, c.data.resaleExpiry<td?"bad":"")));
  items("product").filter(p=>p.data.active!==false&&p.data.price>0&&p.data.cost>p.data.price)
    .forEach(p=>attn.push(li(`${p.data.name}: priced below cost`, `${money(p.data.price)} vs cost ${money(p.data.cost)}`, ()=>SNP.products.edit(p.id),"bad")));

  main.append(el("div",{class:"two-col"},
    el("div",{class:"col"}, panel(attn.length?`Needs attention · ${attn.length}`:"Needs attention", null, listOr(attn,"All clear. Nothing overdue or due soon.")),
      leaderboard(), salesChart(), funnel(items("deal"),"Pipeline")),
    el("div",{class:"col"}, newLeads(false), myTasks(), notesPanel(), quickAdd(), activityPanel())));
}
function attnSummary(overdue, leads){
  const bits=[];
  if (leads) bits.push(`${leads} new lead${leads===1?"":"s"} waiting`);
  if (overdue) bits.push(`${overdue} overdue invoice${overdue===1?"":"s"}`);
  const t=items("task").filter(t=>t.data.assigneeId===(S.me&&S.me.id)&&t.data.status==="Open"&&t.data.due&&t.data.due<=today()).length;
  if (t) bits.push(`${t} task${t===1?"":"s"} due`);
  return bits.length?bits.join(" · ")+".":"Nothing urgent. A good day to chase new business.";
}

/* ---------- sales ---------- */
function salesHome(main){
  const me=S.me&&S.me.id, td=today(), mine=x=>x.data.repId===me;
  const k=mtd(mine);
  const deals=items("deal").filter(d=>d.data.ownerId===me), pipe=deals.filter(d=>SNP.crm.OPEN_STAGES.includes(d.data.stage));
  const quotesOut=items("quote").filter(q=>mine(q)&&q.data.status==="Sent");
  const myUnpaid=billable().filter(x=>mine(x)&&(x.data.balance||0)>0.005);
  const odMine=myUnpaid.filter(x=>SNP.sales.statusOf(x)==="Overdue");
  const leadsNew=items("lead").filter(l=>l.data.status==="New"&&(!l.data.ownerId||l.data.ownerId===me)).length;
  main.append(hero(attnSummary(odMine.length, leadsNew)),
    el("div",{class:"kpis"},
      trendKpi(money0(k.sales),"My sales this month",k.sales,k.prevSales),
      SNP.kpi(money0(sumBy(pipe,d=>d.data.value)),`My open pipeline · ${pipe.length} deal${pipe.length===1?"":"s"}`),
      SNP.kpi(money0(sumBy(quotesOut,q=>q.data.total)),`Quotes out · ${quotesOut.length} waiting on the customer`),
      SNP.kpi(money0(sumBy(myUnpaid,x=>x.data.balance)),odMine.length?`Unpaid on my invoices · ${odMine.length} overdue`:"Unpaid on my invoices",odMine.length?"bad":"")));

  const fu=[];
  pipe.filter(d=>d.data.nextStepDate&&d.data.nextStepDate<=td).forEach(d=>fu.push(li(d.data.title, `${d.data.nextStep||"Follow up"} · ${fmtDate(d.data.nextStepDate)}`, ()=>SNP.crm.editDeal(d.id), d.data.nextStepDate<td?"bad":"")));
  quotesOut.filter(q=>q.data.validUntil&&q.data.validUntil<=addDays(td,3)).forEach(q=>fu.push(li(`${q.data.number} · ${SNP.customerName(q.data.customerId)}`, q.data.validUntil<td?`expired ${fmtDate(q.data.validUntil)}: renew or close it`:`quote expires ${fmtDate(q.data.validUntil)}`, ()=>SNP.sales.openDoc("quote",q.id), q.data.validUntil<td?"bad":"")));
  quotesOut.filter(q=>!(q.data.validUntil&&q.data.validUntil<=addDays(td,3))&&q.data.date&&q.data.date<=addDays(td,-5)).forEach(q=>fu.push(li(`${q.data.number} · ${SNP.customerName(q.data.customerId)}`, `sent ${fmtDate(q.data.date)} · check in with them`, ()=>SNP.sales.openDoc("quote",q.id))));
  fu.push(...overdueInvoices(true).slice(0,5));

  main.append(el("div",{class:"two-col"},
    el("div",{class:"col"}, panel(fu.length?`Follow-ups · ${fu.length}`:"Follow-ups", null, listOr(fu,"No follow-ups due. Time to work the new leads.")),
      newLeads(true), funnel(deals,"My pipeline")),
    el("div",{class:"col"}, targetRing(), myTasks(), notesPanel(), quickAdd())));
}

/* ---------- accountant ---------- */
function accountantHome(main){
  const m=SNP.thisMonth(), inv=billable();
  const billedM=sumBy(inv.filter(x=>monthOf(x)===m),x=>x.data.total), coll=collectedIn(m);
  const unpaid=sumBy(inv,x=>Math.max(0,x.data.balance||0)), od=overdueInvoices(false);
  const k=mtd();
  main.append(hero(od.length?`${od.length} overdue invoice${od.length===1?"":"s"} to watch.`:"No overdue invoices."),
    el("div",{class:"kpis"},
      SNP.kpi(money0(billedM),"Invoiced this month"), SNP.kpi(money0(coll),"Collected this month"),
      SNP.kpi(money0(unpaid),od.length?`Unpaid · ${od.length} overdue`:"Unpaid",od.length?"bad":unpaid?"warn":""),
      S.perms.seeCosts?SNP.kpi(money0(k.profit),`Gross profit this month · ${k.sales?Math.round(k.profit/k.sales*1000)/10:0}%`):null));
  let oilP=null;
  if (SNP.can("oil_order")){
    const line=(l,v,cls="")=>el("div",{class:"st-line "+cls}, el("span",{},l), el("span",{class:"num"},v));
    const cur=SNP.oil.statement(m), prev=SNP.oil.statement(prevMonth(m));
    oilP=panel("Oil rewards",["#oil","Statements →"],
      el("div",{class:"oil-mini"}, [prev,cur].map(st=>el("div",{}, el("div",{class:"sec-h"},fmtMonth(st.month)),
        line("Rewards deposited",money(st.R)), line("Program costs",money(st.C)), line("Partner share",money(st.partnerShare)), line("Kept by SNP",money(st.owners),"strong"),
        st.owed>0.005?line("Still owed to partner",money(st.owed),"bad-t"):null))));
  }
  const due=docsDue();
  main.append(el("div",{class:"two-col"},
    el("div",{class:"col"}, panel("Overdue invoices",["#invoices","All invoices →"], listOr(od.slice(0,10),"Nothing overdue.")), salesChart(), oilP),
    el("div",{class:"col"}, myTasks(), panel("Records due",["#records","All records →"], listOr(due.slice(0,8),"Nothing due in the next 30 days.")), notesPanel())));
}

/* ---------- attorney (and anyone else with records access) ---------- */
function recordsHome(main){
  const docs=[...S.docs.values()], live=docs.filter(d=>d.status!=="Not needed");
  const review=docs.filter(d=>d.status==="Needs review");
  const open=items("task").filter(t=>t.data.status==="Open"&&t.data.assigneeId===(S.me&&S.me.id)).length;
  main.append(hero(review.length?`${review.length} record${review.length===1?"":"s"} waiting on your review.`:"Nothing waiting on review."),
    el("div",{class:"kpis"}, SNP.kpi(`${live.filter(d=>d.status==="On file").length} / ${live.length}`,"Records on file"),
      SNP.kpi(String(review.length),"Waiting on review",review.length?"warn":""), SNP.kpi(String(open),"Your open tasks"), SNP.kpi(String(S.tpls.size),"Templates")));
  main.append(el("div",{class:"two-col"},
    el("div",{class:"col"}, panel("Needs review",["#records","All records →"], listOr(review.map(d=>li(`${d.code} ${d.title}`, d.updatedAt?"updated "+fmtWhen(d.updatedAt):"", ()=>OPEN_DOC(d.id))),"Nothing waiting on review.")),
      panel("Due in the next 30 days",null, listOr(docsDue(),"Nothing due."))),
    el("div",{class:"col"}, myTasks(), notesPanel(),
      panel("Templates",["#templates","Open templates →"], el("p",{class:"muted small"}, `${S.tpls.size} starter agreements and forms. ${S.perms.editTemplates?"You can edit them; every change is versioned.":""}`)))));
}

function renderHome(main){
  const role=S.me&&S.me.role;
  if (role==="owner") ownerHome(main);
  else if (role==="sales") salesHome(main);
  else if (role==="accountant") accountantHome(main);
  else recordsHome(main);
  startTicks();
}

SNP.module({ id:"home", label:"Home", render:renderHome });
})();

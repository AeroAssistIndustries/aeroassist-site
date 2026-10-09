/* Calendar: scheduled calls, meetings and visits, plus tasks, deal next steps, lead follow-ups, quote expiries, invoice due dates and records due. */
(() => {
"use strict";
const { S, el, items, item, fmtDate, money, nameOf, today, addDays } = SNP;
const TYPES = { act:"Calls & meetings", task:"Tasks", deal:"Deal next steps", lead:"Lead follow-ups", quote:"Quotes expiring", invoice:"Invoices due", record:"Records due" };
const CF = { view:"", anchor:"", mine:true, off:new Set(["record"]) };
const pad = n => String(n).padStart(2,"0");
const ymd = d => d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
const parse = s => { const [y,m,d]=s.split("-").map(Number); return new Date(y,m-1,d); };

function events(from, to){
  const me=S.me&&S.me.id, mine=CF.mine, out=[], inR=d=>d&&d>=from&&d<=to;
  const push=(type,date,time,title,sub,open,cls="")=>out.push({type,date,time:time||"",title,sub,open,cls});
  if (!CF.off.has("act")) items("interaction").forEach(a=>{ const d=a.data; if(!inR(d.date)||d.status==="Canceled") return; if(mine&&(d.ownerId||a.createdBy)!==me) return;
    if (d.status!=="Planned"&&!["Call","Meeting","Visit"].includes(d.kind)) return;
    const lb=SNP.activities.label(a); push("act",d.date,d.time,lb.toLowerCase().startsWith(d.kind.toLowerCase())?lb:`${d.kind}: ${lb}`,[d.customerId?SNP.customerName(d.customerId):"",d.status==="Done"?"done":""].filter(Boolean).join(" · "),()=>SNP.activities.edit(a.id),(d.status==="Done"?"done":"")+(SNP.activities.isLate(a)?" late":"")); });
  if (!CF.off.has("task")) items("task").forEach(t=>{ const d=t.data; if(d.status!=="Open"||!inR(d.due)) return; if(mine&&d.assigneeId!==me) return;
    push("task",d.due,"",d.title,mine?"":nameOf(d.assigneeId),()=>SNP.tasks.editTask(t.id),d.due<today()?"late":""); });
  if (!CF.off.has("deal")&&SNP.can("deal","rw")) items("deal").forEach(x=>{ const d=x.data; if(!SNP.deals.isOpen(x)||!inR(d.nextStepDate)) return; if(mine&&d.ownerId!==me) return;
    push("deal",d.nextStepDate,"",`${d.nextStep||"Follow up"}: ${d.title}`,SNP.customerName(d.customerId),()=>SNP.crm.editDeal(x.id),d.nextStepDate<today()?"late":""); });
  if (!CF.off.has("lead")&&SNP.can("lead")) items("lead").forEach(l=>{ const d=l.data; if(!SNP.leads.OPEN.includes(d.status)||!inR(d.nextStepDate)) return; if(mine&&d.ownerId&&d.ownerId!==me) return;
    push("lead",d.nextStepDate,"",`Lead: ${d.company||d.name}`,d.status,()=>SNP.leads.open(l.id),d.nextStepDate<today()?"late":""); });
  if (!CF.off.has("quote")&&SNP.can("quote")) items("quote").forEach(q=>{ const d=q.data; if(d.status!=="Sent"||!inR(d.validUntil)) return; if(mine&&d.repId&&d.repId!==me) return;
    push("quote",d.validUntil,"",`Quote ${d.number} expires`,SNP.customerName(d.customerId),()=>SNP.sales.openDoc("quote",q.id)); });
  if (!CF.off.has("invoice")&&SNP.can("invoice")) items("invoice").forEach(x=>{ const d=x.data; if(d.status!=="Sent"||!(d.balance>0)||!inR(d.dueDate)) return; if(mine&&d.repId&&d.repId!==me) return;
    push("invoice",d.dueDate,"",`${d.number} due · ${money(d.balance)}`,SNP.customerName(d.customerId),()=>SNP.sales.openDoc("invoice",x.id),d.dueDate<today()?"late":""); });
  if (!CF.off.has("record")) [...S.docs.values()].forEach(d=>{ if(!inR(d.due)||SNP.records.isDone(d)) return;
    push("record",d.due,"",`${d.code} ${d.title}`,d.status,()=>{ SNP.go("records"); setTimeout(()=>SNP.records.openDoc(d.id),60); }); });
  return out.sort((a,b)=>(a.date+(a.time||"99")).localeCompare(b.date+(b.time||"99")));
}
const chip = e => el("button",{type:"button",class:`cal-ev t-${e.type} ${e.cls}`,title:[e.title,e.sub].filter(Boolean).join(" · "),onclick:ev=>{ ev.stopPropagation(); e.open(); }},
  e.time?el("span",{class:"cal-time"},new Date("2000-01-01T"+e.time).toLocaleTimeString(undefined,{hour:"numeric",minute:"2-digit"})):null, e.title);
const schedule = date => SNP.activities.edit(null,{status:"Planned",kind:"Call",date});

function month(anchor){
  const a=parse(anchor), first=new Date(a.getFullYear(),a.getMonth(),1), start=new Date(first); start.setDate(1-((first.getDay()+6)%7));
  const days=[...Array(42)].map((_,i)=>{ const d=new Date(start); d.setDate(start.getDate()+i); return ymd(d); });
  const ev=events(days[0],days[41]), td=today();
  const grid=el("div",{class:"cal-grid"}, ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(d=>el("div",{class:"cal-dow"},d)));
  days.forEach(d=>{ const list=ev.filter(e=>e.date===d), other=parse(d).getMonth()!==a.getMonth();
    grid.append(el("div",{class:"cal-day"+(other?" other":"")+(d===td?" today":""),onclick:e=>{ if(e.target===e.currentTarget||e.target.classList.contains("cal-n")) schedule(d); },title:"Click an empty spot to schedule"},
      el("span",{class:"cal-n"}, String(parse(d).getDate())), list.slice(0,4).map(chip), list.length>4?el("button",{type:"button",class:"cal-more",onclick:ev2=>{ ev2.stopPropagation(); CF.view="agenda"; CF.anchor=d; SNP.refresh(true); }},`+${list.length-4} more`):null)); });
  return grid;
}
function agenda(from, n){
  const to=addDays(from,n-1), ev=events(from,to), byDay=new Map();
  ev.forEach(e=>{ if(!byDay.has(e.date)) byDay.set(e.date,[]); byDay.get(e.date).push(e); });
  if (!byDay.size) return el("div",{class:"empty"}, el("b",{},"Nothing scheduled"), `Nothing between ${fmtDate(from)} and ${fmtDate(to)}. `, el("button",{class:"btn small",type:"button",onclick:()=>schedule(from)},"Schedule something"));
  return el("div",{class:"agenda"}, [...byDay].map(([d,list])=>el("section",{class:"ag-day"+(d===today()?" today":"")},
    el("h3",{}, parse(d).toLocaleDateString(undefined,{weekday:"long",month:"short",day:"numeric"}), d===today()?el("span",{class:"mini-tag"},"Today"):null),
    el("ul",{class:"ag-list"}, list.map(e=>el("li",{class:`t-${e.type} ${e.cls}`}, el("span",{class:"ag-time"}, e.time?new Date("2000-01-01T"+e.time).toLocaleTimeString(undefined,{hour:"numeric",minute:"2-digit"}):TYPES[e.type].split(" ")[0]),
      el("a",{href:"#",onclick:ev=>{ ev.preventDefault(); e.open(); }}, e.title), e.sub?el("span",{class:"muted small"}, e.sub):null))))));
}

function render(main){
  if (!CF.view) CF.view=window.innerWidth<700?"agenda":"month";
  if (!CF.anchor) CF.anchor=today();
  const a=parse(CF.anchor);
  const step=dir=>{ const d=new Date(a); if(CF.view==="month") d.setMonth(d.getMonth()+dir,1); else d.setDate(d.getDate()+dir*(CF.view==="week"?7:30)); CF.anchor=ymd(d); SNP.refresh(true); };
  let from=CF.anchor; if (CF.view==="week"){ const d=new Date(a); d.setDate(d.getDate()-((d.getDay()+6)%7)); from=ymd(d); }
  const title=CF.view==="month"?a.toLocaleDateString(undefined,{month:"long",year:"numeric"}):`${fmtDate(from)} – ${fmtDate(addDays(from,CF.view==="week"?6:29))}`;
  const exp=()=>{ const me=S.me&&S.me.id, acts=items("interaction").filter(x=>x.data.status==="Planned"&&x.data.date>=today()&&x.data.date<=addDays(today(),60)&&(x.data.ownerId||x.createdBy)===me);
    const tasks=items("task").filter(t=>t.data.status==="Open"&&t.data.assigneeId===me&&t.data.due>=today()).map(t=>({uid:"task-"+t.id,title:"Task: "+t.data.title,date:t.data.due,description:t.data.notes}));
    if (!acts.length&&!tasks.length) return SNP.toast("Nothing scheduled for you in the next 60 days.");
    SNP.ics("SNP my schedule.ics",[...acts.map(SNP.activities.toIcs),...tasks]); SNP.toast("Calendar file downloaded. Open it to add these to your phone or Outlook calendar."); };
  main.append(SNP.pageHead("Calendar", "Scheduled calls, meetings and visits, with everything else that has a date. Click a day to schedule.",
      el("button",{class:"btn ghost",type:"button",onclick:exp},"Add my schedule to my calendar"),
      el("button",{class:"btn primary",type:"button",onclick:()=>schedule(today())},"+ Schedule")),
    el("div",{class:"cal-bar"},
      el("div",{class:"row-actions"}, el("button",{class:"btn small",type:"button","aria-label":"Previous",onclick:()=>step(-1)},"‹"), el("button",{class:"btn small",type:"button",onclick:()=>{CF.anchor=today();SNP.refresh(true);}},"Today"),
        el("button",{class:"btn small",type:"button","aria-label":"Next",onclick:()=>step(1)},"›"), el("h3",{class:"cal-title"},title)),
      el("div",{class:"seg-toggle"}, [["month","Month"],["week","Week"],["agenda","Agenda"]].map(([k,l])=>el("button",{type:"button",class:CF.view===k?"on":"","aria-pressed":String(CF.view===k),onclick:()=>{CF.view=k;SNP.refresh(true);}},l))),
      el("div",{class:"seg-toggle"}, [[true,"Mine"],[false,"Everyone"]].map(([k,l])=>el("button",{type:"button",class:CF.mine===k?"on":"","aria-pressed":String(CF.mine===k),onclick:()=>{CF.mine=k;SNP.refresh(true);}},l)))),
    el("div",{class:"cal-types"}, Object.entries(TYPES).filter(([k])=>k!=="record"||S.docs.size).map(([k,l])=>el("label",{class:"chk t-"+k}, el("input",{type:"checkbox",checked:!CF.off.has(k)||null,onchange:e=>{ e.target.checked?CF.off.delete(k):CF.off.add(k); SNP.refresh(true); }}), el("i",{class:"dot"}), l))),
    CF.view==="month"?month(CF.anchor):agenda(from, CF.view==="week"?7:30));
}

SNP.calendar = { events };
SNP.module({ id:"calendar", label:"Calendar", group:"Sales", visible:()=>SNP.can("interaction","rw"), render,
  badge:()=>items("interaction").filter(a=>a.data.status==="Planned"&&(a.data.ownerId||a.createdBy)===(S.me&&S.me.id)&&a.data.date===today()).length });
})();

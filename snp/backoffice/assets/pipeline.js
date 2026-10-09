/* Pipelines: one board per pipeline (set in Settings), drag-and-drop between stages, win probability, forecast, won/lost analysis. */
(() => {
"use strict";
const { S, el, items, item, money, money0, fmtDate, fmtMonth, nameOf, badge, today } = SNP;
const PF = { pipe:"", view:"board", owner:"" };
const D = () => SNP.deals;
const DIVS = ["Oil","Phones & electronics","Commercial supply"];

function dealFields(d){
  const pls=D().pipelines(), pipe=pls.find(p=>p.key===d.pipeline)||pls[0];
  return [
    {key:"title",label:"Deal",full:true,placeholder:"e.g. 40 pallets Mobil 1 for Q4"},
    {key:"customerId",label:"Customer",type:"customer"},{key:"contactId",label:"Contact",type:"contact",customerId:d.customerId||0},
    {key:"pipeline",label:"Pipeline",type:"select",options:pls.map(p=>[p.key,p.name])},
    {key:"stage",label:"Stage",type:"select",options:pipe.stages.map(s=>[s.name,`${s.name} (${s.prob}%)`])},
    {key:"value",label:"Value",type:"money"},
    {key:"probability",label:"Chance of winning",type:"select",options:[["","Use the stage's %"],...[5,10,20,30,40,50,60,70,80,90,95].map(n=>[String(n),n+"%"])]},
    {key:"expectedClose",label:"Expected close",type:"date"},{key:"ownerId",label:"Owner",type:"user"},
    {key:"division",label:"Division",type:"select",options:[["","—"],...DIVS.map(x=>[x,x])]},
    {key:"nextStepDate",label:"Next step date",type:"date"},
    {key:"nextStep",label:"Next step",full:true,placeholder:"e.g. Send revised quote"},
    {key:"lostReason",label:"If lost, why",type:"datalist",options:(S.settings&&S.settings.lostReasons)||[],full:true},
    {key:"notes",label:"Notes",type:"textarea"}];
}
function editDeal(id=null, defaults={}){
  const it=id?item("deal",id):null;
  const base=Object.assign({stage:"",ownerId:S.me&&S.me.id,pipeline:D().pipelineFor(defaults.division)},defaults,it?it.data:{});
  if (!it&&!defaults.stage) base.stage=(D().pipelines().find(p=>p.key===base.pipeline)||D().pipelines()[0]).stages[0].name;
  return SNP.editRecord({type:"deal", id, title:id?"Deal":"New deal", eyebrow:"Pipeline", fields:dealFields(base), wide:true,
    defaults:Object.assign({ownerId:S.me&&S.me.id,pipeline:base.pipeline,stage:base.stage},defaults),
    after:(dr)=>{ const ps=dr.querySelector('[data-key="pipeline"]'), ss=dr.querySelector('[data-key="stage"]'); if(!ps||!ss) return;
      ps.addEventListener("change",()=>{ const p=D().pipelines().find(x=>x.key===ps.value); ss.replaceChildren(...p.stages.map(s=>el("option",{value:s.name},`${s.name} (${s.prob}%)`))); }); },
    extra:dl=>el("div",{class:"stack"},
      el("div",{class:"row-actions"},
        SNP.can("quote","rw")?el("button",{class:"btn small",type:"button",onclick:()=>{ SNP.closeAll(); SNP.sales.newDoc("quote",{customerId:dl.data.customerId,dealId:dl.id,division:dl.data.division,contactId:dl.data.contactId}); }},"Create quote"):null,
        dl.data.customerId?el("button",{class:"btn small ghost",type:"button",onclick:()=>{ SNP.closeAll(); SNP.go("customers",dl.data.customerId); }},"Open customer"):null,
        el("button",{class:"btn small ghost",type:"button",onclick:()=>SNP.newTask({title:dl.data.nextStep||("Follow up: "+dl.data.title),due:dl.data.nextStepDate,relatedType:"deal",relatedId:dl.id,relatedLabel:dl.data.title})},"+ Task")),
      (dl.data.history||[]).length?el("details",{class:"add-box"}, el("summary",{},`Stage history · ${D().daysInStage(dl)} days in ${dl.data.stage}`),
        el("ul",{class:"attn"}, dl.data.history.slice().reverse().map(h=>el("li",{}, el("span",{},h.stage), el("span",{class:"muted small"}, SNP.fmtWhen(h.at)+(h.by?" · "+nameOf(h.by):"")))))):null,
      SNP.activities&&(dl.data.customerId)?SNP.activities.panel({customerId:dl.data.customerId,dealId:dl.id,compact:true}):null)});
}

/* Move a deal; lost asks why, won offers the invoice. */
async function move(d, stage){
  if (d.data.stage===stage) return;
  const st=D().pipelineOf(d).stages.find(s=>s.name===stage)||{type:"open"};
  if (st.type==="lost") return lostReason(d, stage);
  try{ await SNP.saveItem("deal",d.id,Object.assign({},d.data,{stage})); SNP.toast(`Moved to ${stage}.`); SNP.refresh(true);
    if (st.type==="won") won(item("deal",d.id)); }
  catch(e){ SNP.fail(e); SNP.refresh(true); }
}
function lostReason(d, stage){
  const reasons=(S.settings&&S.settings.lostReasons)||[];
  const sel=SNP.selectEl([["","Choose a reason…"],...reasons.map(r=>[r,r]),["__other","Something else"]],"",v=>{ other.hidden=v!=="__other"; },"Reason");
  const other=el("input",{type:"text",placeholder:"What happened?",hidden:true,"aria-label":"Other reason"});
  const ok=el("button",{class:"btn primary",type:"button"},"Mark lost");
  const m=SNP.modal(`Lost: ${d.data.title}`, el("div",{class:"stack"}, el("p",{class:"muted small"},"Knowing why deals are lost shows up in the Won & lost view."), sel, other, el("div",{class:"row-actions"},ok)), {size:"sm"});
  ok.onclick=async()=>{ const r=sel.value==="__other"?other.value.trim():sel.value; ok.disabled=true;
    try{ await SNP.saveItem("deal",d.id,Object.assign({},d.data,{stage,lostReason:r||d.data.lostReason})); SNP.closePanel(m); SNP.toast("Marked lost."); SNP.refresh(true); }catch(e){ SNP.fail(e); ok.disabled=false; } };
}
function won(d){
  if (!d||!SNP.can("invoice","rw")) return;
  const m=SNP.modal("Deal won", el("div",{class:"stack"}, el("p",{}, `${d.data.title} · ${money0(d.data.value)}. Nice work.`),
    el("div",{class:"row-actions"},
      el("button",{class:"btn primary",type:"button",onclick:()=>{ SNP.closePanel(m); SNP.sales.newDoc("invoice",{customerId:d.data.customerId,division:d.data.division,contactId:d.data.contactId}); }},"Create the invoice"),
      d.data.customerId?el("button",{class:"btn",type:"button",onclick:()=>{ SNP.closePanel(m); SNP.go("customers",d.data.customerId); }},"Open customer"):null,
      el("button",{class:"btn ghost",type:"button",onclick:()=>SNP.closePanel(m)},"Later"))), {size:"sm"});
}

function card(d){
  const st=D().stageOf(d), late=d.data.nextStepDate&&d.data.nextStepDate<today()&&st.type==="open", days=D().daysInStage(d);
  const c=el("article",{class:"kcard"+(late?" late":""),tabindex:"0",draggable:"true",onclick:e=>{ if(!e.target.closest("select")) editDeal(d.id); },onkeydown:e=>{ if(e.key==="Enter"&&e.target.classList.contains("kcard")) editDeal(d.id); }},
    el("div",{class:"kc-t"}, d.data.title), el("div",{class:"muted small"}, SNP.customerName(d.data.customerId)||"No customer", d.data.contactId&&item("contact",d.data.contactId)?" · "+item("contact",d.data.contactId).data.name:""),
    el("div",{class:"kc-row"}, el("strong",{}, money0(d.data.value)), st.type==="open"?el("span",{class:"muted small",title:"Chance of winning"}, `${D().prob(d)}% · ${money0(D().weighted(d))}`):null),
    st.type==="open"&&(d.data.nextStep||d.data.nextStepDate)?el("div",{class:"small"+(late?" bad-t":"")}, (late?"Overdue: ":"Next: ")+(d.data.nextStep||"follow up")+(d.data.nextStepDate?" · "+fmtDate(d.data.nextStepDate):"")):null,
    el("div",{class:"kc-row"}, el("span",{class:"muted small"+(days>30&&st.type==="open"?" warn-t":"")}, st.type==="open"?`${days} d in stage`:fmtDate(D().closedAt(d))), el("span",{class:"muted small"}, nameOf(d.data.ownerId))),
    SNP.selectEl(D().pipelineOf(d).stages.map(s=>s.name),d.data.stage,v=>move(d,v),"Stage for "+d.data.title));
  c.addEventListener("dragstart",e=>{ e.dataTransfer.setData("text/plain",String(d.id)); e.dataTransfer.effectAllowed="move"; c.classList.add("dragging"); });
  c.addEventListener("dragend",()=>c.classList.remove("dragging"));
  return c;
}
function board(pipe, deals){
  const b=el("div",{class:"kanban",style:`grid-template-columns:repeat(${pipe.stages.length},minmax(220px,1fr))`});
  pipe.stages.forEach(stage=>{
    let list=deals.filter(d=>d.data.stage===stage.name);
    const total=list.reduce((s,d)=>s+(d.data.value||0),0), closed=stage.type!=="open";
    const more=closed&&list.length>8?list.length-8:0;
    list = closed ? list.sort((a,b)=>D().closedAt(b).localeCompare(D().closedAt(a))).slice(0,8) : list.sort((a,b)=>(a.data.nextStepDate||"9999").localeCompare(b.data.nextStepDate||"9999"));
    const col=el("section",{class:"kcol s-"+stage.type,"aria-label":stage.name}, el("div",{class:"kcol-h"}, el("h3",{},stage.name), el("span",{class:"mono"}, `${deals.filter(d=>d.data.stage===stage.name).length} · ${money0(total)}`)),
      el("div",{class:"muted small kc-prob"}, closed?(stage.type==="won"?"Won":"Lost"):`${stage.prob}% · weighted ${money0(total*stage.prob/100)}`));
    list.forEach(d=>col.append(card(d)));
    if (more) col.append(el("div",{class:"muted small",style:"padding:6px"}, `+ ${more} older`));
    col.addEventListener("dragover",e=>{ e.preventDefault(); col.classList.add("drop"); });
    col.addEventListener("dragleave",e=>{ if(!col.contains(e.relatedTarget)) col.classList.remove("drop"); });
    col.addEventListener("drop",e=>{ e.preventDefault(); col.classList.remove("drop"); const d=item("deal",Number(e.dataTransfer.getData("text/plain"))); if(d) move(d,stage.name); });
    b.append(col);
  });
  return b;
}
function listView(deals){
  return SNP.table({rows:deals.slice().sort((a,b)=>(b.data.value||0)-(a.data.value||0)),onRow:d=>editDeal(d.id),empty:"No deals.",columns:[
    {label:"Deal",value:d=>el("div",{}, el("strong",{},d.data.title), el("div",{class:"muted small"},SNP.customerName(d.data.customerId)))},
    {label:"Stage",value:d=>badge(d.data.stage,"s-"+D().stageOf(d).type)},{label:"Value",cls:"num",value:d=>money0(d.data.value)},
    {label:"Chance",cls:"num",value:d=>D().isOpen(d)?D().prob(d)+"%":"—"},{label:"Weighted",cls:"num",value:d=>D().isOpen(d)?money0(D().weighted(d)):"—"},
    {label:"Expected close",value:d=>d.data.expectedClose?el("span",{class:D().isOpen(d)&&d.data.expectedClose<today()?"bad-t":""},fmtDate(d.data.expectedClose)):"—"},
    {label:"In stage",cls:"num",value:d=>D().isOpen(d)?D().daysInStage(d)+" d":"—"},{label:"Owner",value:d=>nameOf(d.data.ownerId)||"—"}]});
}
function forecast(deals){
  const open=deals.filter(D().isOpen), t=new Date();
  const months=[...Array(6)].map((_,i)=>{ const d=new Date(t.getFullYear(),t.getMonth()+i,1); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0"); });
  const rows=[{k:"late",label:"Close date passed",list:open.filter(d=>d.data.expectedClose&&d.data.expectedClose<today()&&d.data.expectedClose.slice(0,7)<months[0])},
    ...months.map(m=>({k:m,label:fmtMonth(m),list:open.filter(d=>(d.data.expectedClose||"").slice(0,7)===m)})),
    {k:"later",label:"Later",list:open.filter(d=>d.data.expectedClose&&d.data.expectedClose.slice(0,7)>months[5])},
    {k:"none",label:"No close date",list:open.filter(d=>!d.data.expectedClose)}].filter(r=>r.list.length||/^\d/.test(r.k));
  const max=Math.max(1,...rows.map(r=>r.list.reduce((s,d)=>s+(d.data.value||0),0)));
  return el("section",{class:"panel"}, el("h3",{},"Forecast by expected close"),
    el("p",{class:"muted small"},"Weighted = value × chance of winning. Put an expected close date on every deal to make this useful."),
    el("div",{class:"tbl-wrap"}, el("table",{class:"list"}, el("thead",{}, el("tr",{}, el("th",{},"Month"), el("th",{class:"num"},"Deals"), el("th",{class:"num"},"Total"), el("th",{class:"num"},"Weighted"), el("th",{},""))),
      el("tbody",{}, rows.map(r=>{ const tot=r.list.reduce((s,d)=>s+(d.data.value||0),0), w=r.list.reduce((s,d)=>s+D().weighted(d),0);
        return el("tr",{class:r.k==="late"?"bad-row":""}, el("td",{"data-label":"Month"},r.label), el("td",{class:"num","data-label":"Deals"},String(r.list.length)), el("td",{class:"num","data-label":"Total"},money0(tot)), el("td",{class:"num","data-label":"Weighted"},el("strong",{},money0(w))),
          el("td",{"data-label":""}, el("span",{class:"fbar"}, el("i",{class:"t",style:`width:${tot/max*100}%`}), el("i",{class:"w",style:`width:${w/max*100}%`})))); })))));
}
function analysis(deals){
  const since=SNP.addDays(today(),-365), closed=deals.filter(d=>!D().isOpen(d)&&D().closedAt(d)>=since);
  const wonL=closed.filter(D().isWon), lostL=closed.filter(D().isLost);
  const reasons=new Map(); lostL.forEach(d=>{ const k=d.data.lostReason||"No reason given"; const r=reasons.get(k)||{n:0,v:0}; r.n++; r.v+=d.data.value||0; reasons.set(k,r); });
  const owners=new Map(); closed.forEach(d=>{ const k=d.data.ownerId||0; const r=owners.get(k)||{won:0,lost:0,v:0}; D().isWon(d)?(r.won++,r.v+=d.data.value||0):r.lost++; owners.set(k,r); });
  const cycle=wonL.map(d=>Math.max(0,Math.round((new Date(d.data.closedAt||d.updatedAt)-new Date(d.createdAt))/864e5))).filter(n=>!isNaN(n));
  return el("div",{class:"two-col"},
    el("section",{class:"panel"}, el("h3",{},"Why deals were lost · last 12 months"),
      reasons.size?el("ul",{class:"attn"}, [...reasons].sort((a,b)=>b[1].n-a[1].n).map(([k,r])=>el("li",{}, el("span",{},k), el("span",{class:"muted small"},`${r.n} deal${r.n===1?"":"s"} · ${money0(r.v)}`)))):el("p",{class:"muted small"},"No lost deals in the last 12 months.")),
    el("section",{class:"panel"}, el("h3",{},"Win rate by owner · last 12 months"),
      owners.size?el("ul",{class:"attn"}, [...owners].map(([k,r])=>el("li",{}, el("span",{},nameOf(k)||"Unassigned"), el("span",{class:"muted small"},`${Math.round(r.won/(r.won+r.lost)*100)}% · ${r.won} won, ${r.lost} lost · ${money0(r.v)} won`)))):el("p",{class:"muted small"},"No closed deals yet."),
      cycle.length?el("p",{class:"muted small"},`Won deals take ${Math.round(cycle.reduce((a,b)=>a+b,0)/cycle.length)} days on average from creation to close.`):null));
}

function render(main){
  const pls=D().pipelines(); if(!pls.find(p=>p.key===PF.pipe)) PF.pipe=pls[0].key;
  const pipe=pls.find(p=>p.key===PF.pipe);
  const deals=items("deal").filter(d=>D().pipelineOf(d).key===pipe.key&&(!PF.owner||String(d.data.ownerId)===PF.owner));
  const open=deals.filter(D().isOpen), since=SNP.addDays(today(),-90);
  const w90=deals.filter(d=>D().isWon(d)&&D().closedAt(d)>=since), l90=deals.filter(d=>D().isLost(d)&&D().closedAt(d)>=since);
  const views={board:"Board",list:"List",forecast:"Forecast",analysis:"Won & lost"};
  main.append(SNP.pageHead("Pipeline", `${pipe.name}: ${open.length} open deals`,
      SNP.selectEl([["","Everyone's deals"],[String(S.me&&S.me.id),"My deals"],...SNP.peopleWithAccess().filter(p=>p.id!==(S.me&&S.me.id)).map(p=>[String(p.id),p.name])],PF.owner,v=>{PF.owner=v;SNP.refresh(true);},"Owner"),
      el("button",{class:"btn primary",type:"button",onclick:()=>editDeal(null,{pipeline:pipe.key,stage:pipe.stages[0].name})},"+ Deal")),
    pls.length>1?SNP.subtabs(pls.map(p=>[p.key,`${p.name} · ${items("deal").filter(d=>D().pipelineOf(d).key===p.key&&D().isOpen(d)).length}`]),PF.pipe,v=>{PF.pipe=v;SNP.refresh(true);}):null,
    el("div",{class:"kpis"}, SNP.kpi(money0(open.reduce((s,d)=>s+(d.data.value||0),0)),"Open pipeline"), SNP.kpi(money0(open.reduce((s,d)=>s+D().weighted(d),0)),"Weighted forecast"),
      SNP.kpi(w90.length+l90.length?Math.round(w90.length/(w90.length+l90.length)*100)+"%":"—",`Win rate, 90 days · ${w90.length} won, ${l90.length} lost`),
      SNP.kpi(money0(w90.reduce((s,d)=>s+(d.data.value||0),0)),"Won, last 90 days"),
      SNP.kpi(String(open.filter(d=>d.data.nextStepDate&&d.data.nextStepDate<today()).length),"Overdue next steps",open.some(d=>d.data.nextStepDate&&d.data.nextStepDate<today())?"warn":"")),
    el("div",{class:"seg-toggle",role:"tablist"}, Object.entries(views).map(([k,l])=>el("button",{type:"button",role:"tab","aria-selected":String(PF.view===k),class:PF.view===k?"on":"",onclick:()=>{PF.view=k;SNP.refresh(true);}},l))),
    !deals.length?el("div",{class:"empty"}, el("b",{},"No deals in this pipeline yet"), "Add a deal for each opportunity, then drag it across as it moves.")
      : PF.view==="list"?listView(deals) : PF.view==="forecast"?forecast(deals) : PF.view==="analysis"?analysis(deals) : el("div",{}, el("p",{class:"muted small"},"Drag cards between stages, or use the stage menu on a card."), board(pipe,deals)));
}

SNP.crm.editDeal = editDeal;
SNP.pipeline = { editDeal, move };
SNP.module({ id:"pipeline", label:"Pipeline", group:"Sales", visible:()=>SNP.can("deal","rw"), render,
  badge:()=>items("deal").filter(d=>SNP.deals.isOpen(d)&&d.data.nextStepDate&&d.data.nextStepDate<today()).length });
})();

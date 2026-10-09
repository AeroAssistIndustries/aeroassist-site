/* CRM: customers, contacts, notes timeline, deal pipeline. Owners only. */
(() => {
"use strict";
const { S, el, items, item, money, money0, fmtDate, nameOf, badge, today } = SNP;
const DIVS = ["Oil","Phones & electronics","Commercial supply"];
const STAGES = ["Lead","Contacted","Quoted","Negotiating","Won","Lost"];
const OPEN_STAGES = ["Lead","Contacted","Quoted","Negotiating"];
const CF = { q:"", status:"" };
const PF = { div:"", owner:"" };

const customerFields = () => [
  {key:"name",label:"Company name",full:true},
  {key:"status",label:"Status",type:"select",options:["Lead","Active","Inactive"]},
  {key:"ownerId",label:"Account owner",type:"user"},
  {key:"divisions",label:"Divisions",type:"multi",options:DIVS},
  {key:"contactName",label:"Main contact"},
  {key:"phone",label:"Phone / WhatsApp"},
  {key:"email",label:"Email",type:"email",full:true},
  {key:"address",label:"Address",type:"textarea",rows:2},
  {key:"state",label:"State / province"},
  {key:"country",label:"Country"},
  {key:"terms",label:"Payment terms",type:"select",options:["Prepaid","Net 15","Net 30"]},
  {key:"creditLimit",label:"Credit limit",type:"money"},
  {key:"resaleCert",label:"Resale certificate on file",type:"checkbox"},
  {key:"resaleExpiry",label:"Certificate expires",type:"date"},
  {key:"source",label:"How they found us",full:true},
  {key:"notes",label:"Notes",type:"textarea"}];
const dealFields = () => [
  {key:"title",label:"Deal",full:true,placeholder:"e.g. 40 pallets Mobil 1 for Q4"},
  {key:"customerId",label:"Customer",type:"customer",full:true},
  {key:"division",label:"Division",type:"select",options:[["","—"],...DIVS.map(d=>[d,d])]},
  {key:"value",label:"Value",type:"money"},
  {key:"stage",label:"Stage",type:"select",options:STAGES},
  {key:"expectedClose",label:"Expected close",type:"date"},
  {key:"ownerId",label:"Owner",type:"user"},
  {key:"nextStepDate",label:"Next step date",type:"date"},
  {key:"nextStep",label:"Next step",full:true,placeholder:"e.g. Send revised quote"},
  {key:"lostReason",label:"If lost, why",full:true},
  {key:"notes",label:"Notes",type:"textarea"}];

const interactionsFor = id => items("interaction").filter(i=>i.data.customerId===id).sort((a,b)=>(b.data.date||"").localeCompare(a.data.date||"")||b.id-a.id);
const lastTouch = id => { const i=interactionsFor(id)[0]; return i?i.data.date:""; };
const openDealsFor = id => items("deal").filter(d=>d.data.customerId===id&&OPEN_STAGES.includes(d.data.stage));
const unpaidFor = id => items("invoice").filter(i=>i.data.customerId===id&&i.data.status==="Sent").reduce((s,i)=>s+(i.data.balance||0),0);

function editCustomer(id=null, defaults={}, onSaved){
  return SNP.editRecord({type:"customer", id, title:id?"Edit customer":"New customer", eyebrow:"Customer", fields:customerFields(),
    defaults:Object.assign({status:"Lead",terms:"Prepaid",ownerId:S.me&&S.me.id},defaults), onSaved:onSaved||(c=>{ if(!id) SNP.go("customers",c.id); }),
    onDeleted:()=>SNP.go("customers")});
}
function editDeal(id=null, defaults={}){
  return SNP.editRecord({type:"deal", id, title:id?"Deal":"New deal", eyebrow:"Pipeline", fields:dealFields(),
    defaults:Object.assign({stage:"Lead",ownerId:S.me&&S.me.id},defaults),
    extra:it=>el("div",{class:"row-actions"},
      SNP.can("quote","rw")?el("button",{class:"btn small",type:"button",onclick:()=>{ SNP.closeAll(); SNP.sales.newDoc("quote",{customerId:it.data.customerId,dealId:it.id,division:it.data.division}); }},"Create quote"):null,
      it.data.customerId?el("button",{class:"btn small ghost",type:"button",onclick:()=>{ SNP.closeAll(); SNP.go("customers",it.data.customerId); }},"Open customer"):null,
      el("button",{class:"btn small ghost",type:"button",onclick:()=>SNP.newTask({title:it.data.nextStep||("Follow up: "+it.data.title),due:it.data.nextStepDate,relatedType:"deal",relatedId:it.id,relatedLabel:it.data.title})},"+ Task"))});
}

/* ---------- customers list ---------- */
function renderCustomers(main, arg){
  if (arg) return renderCustomer(main, Number(arg));
  const listBox=el("div");
  const draw=()=>{
    const q=CF.q.trim().toLowerCase();
    const rows=items("customer").filter(c=>(!CF.status||c.data.status===CF.status)&&(!q||`${c.data.name} ${c.data.contactName} ${c.data.email} ${c.data.phone} ${c.data.state}`.toLowerCase().includes(q)))
      .sort((a,b)=>(a.data.name||"").localeCompare(b.data.name||""));
    listBox.replaceChildren(SNP.table({ rows, onRow:c=>SNP.go("customers",c.id),
      empty: items("customer").length?"No customers match.":"No customers yet. Add your first customer to start tracking deals, quotes and invoices.",
      columns:[
        {label:"Customer", value:c=>el("div",{}, el("strong",{},c.data.name), c.data.contactName?el("div",{class:"muted small"},c.data.contactName):null)},
        {label:"Status", value:c=>badge(c.data.status)},
        {label:"Divisions", value:c=>(c.data.divisions||[]).join(", ")||"—"},
        {label:"Open deals", cls:"num", value:c=>{ const v=openDealsFor(c.id).reduce((s,d)=>s+(d.data.value||0),0); return v?money0(v):"—"; }},
        {label:"Unpaid", cls:"num", value:c=>{ const v=unpaidFor(c.id); return v?el("span",{class:"warn-t"},money(v)):"—"; }},
        {label:"Last contact", value:c=>fmtDate(lastTouch(c.id))||"—"},
        {label:"Owner", value:c=>nameOf(c.data.ownerId)||"—"}]}));
  };
  const q=SNP.search("Search customers", e=>{ CF.q=e.target.value; draw(); }); q.value=CF.q;
  const counts=s=>items("customer").filter(c=>c.data.status===s).length;
  main.append(SNP.pageHead("Customers", `${counts("Active")} active · ${counts("Lead")} leads · ${counts("Inactive")} inactive`,
      el("button",{class:"btn ghost",type:"button",onclick:exportCustomers},"Export CSV"),
      el("button",{class:"btn primary",type:"button",onclick:()=>editCustomer()},"+ Customer")),
    SNP.toolbar(q, SNP.selectEl([["","All statuses"],["Lead","Leads"],["Active","Active"],["Inactive","Inactive"]],CF.status,v=>{CF.status=v;draw();},"Status")),
    listBox);
  draw();
}
function exportCustomers(){
  SNP.csv("SNP customers "+today()+".csv",["Name","Status","Divisions","Contact","Email","Phone","State","Country","Terms","Credit limit","Resale cert","Cert expires","Owner","Unpaid"],
    items("customer").map(c=>{const d=c.data; return [d.name,d.status,(d.divisions||[]).join("; "),d.contactName,d.email,d.phone,d.state,d.country,d.terms,d.creditLimit,d.resaleCert?"Yes":"No",d.resaleExpiry,nameOf(d.ownerId),unpaidFor(c.id)];}));
}

/* ---------- one customer ---------- */
function renderCustomer(main, id){
  const c=item("customer",id);
  if (!c){ main.append(el("div",{class:"empty"}, el("b",{},"Customer not found"), "It may have been deleted. ", el("a",{href:"#customers"},"Back to customers"))); return; }
  const d=c.data;
  const info=(label,val)=>val?el("div",{class:"info"}, el("div",{class:"lbl"},label), el("div",{}, val)):null;
  const certWarn = d.resaleCert && d.resaleExpiry && d.resaleExpiry < today();
  const head=el("div",{class:"page-head"},
    el("div",{style:"min-width:0"}, el("div",{class:"eyebrow"}, el("a",{href:"#customers"},"Customers")," / "), el("h2",{class:"page-title"}, d.name),
      el("div",{class:"tags",style:"margin-top:6px"}, badge(d.status), ...(d.divisions||[]).map(x=>el("span",{class:"tag"},x)))),
    el("div",{class:"row-actions"},
      el("button",{class:"btn",type:"button",onclick:()=>editCustomer(c.id)},"Edit"),
      el("button",{class:"btn",type:"button",onclick:()=>editDeal(null,{customerId:c.id})},"+ Deal"),
      el("button",{class:"btn",type:"button",onclick:()=>SNP.sales.newDoc("quote",{customerId:c.id})},"+ Quote"),
      el("button",{class:"btn primary",type:"button",onclick:()=>SNP.sales.newDoc("invoice",{customerId:c.id})},"+ Invoice")));
  const unpaid=unpaidFor(c.id), invs=items("invoice").filter(i=>i.data.customerId===c.id&&i.data.status!=="Void");
  const lifetime=invs.reduce((s,i)=>s+(i.data.total||0),0);
  const kpis=el("div",{class:"kpis"}, SNP.kpi(money0(lifetime),"Invoiced, all time"), SNP.kpi(money(unpaid),"Unpaid", unpaid?"warn":""),
    SNP.kpi(money0(openDealsFor(c.id).reduce((s,x)=>s+(x.data.value||0),0)),"Open deals"), SNP.kpi(fmtDate(lastTouch(c.id))||"—","Last contact"));

  const infoPanel=el("section",{class:"panel"}, el("h3",{},"Details"),
    el("div",{class:"info-grid"}, info("Main contact",d.contactName), info("Phone",d.phone), info("Email",d.email), info("Address",d.address),
      info("Location",[d.state,d.country].filter(Boolean).join(", ")), info("Payment terms",d.terms), info("Credit limit",d.creditLimit?money(d.creditLimit):""),
      info("Resale certificate", d.resaleCert?el("span",{class:certWarn?"bad-t":""}, "On file"+(d.resaleExpiry?(certWarn?" · expired ":" · expires ")+fmtDate(d.resaleExpiry):"")):el("span",{class:"warn-t"},"Not on file")),
      info("Account owner",nameOf(d.ownerId)), info("Source",d.source)),
    d.notes?el("p",{class:"pre"}, d.notes):null);

  // contacts editor
  const contacts=(d.contacts||[]).map(x=>Object.assign({},x));
  const cBox=el("div");
  const drawContacts=()=>{ cBox.replaceChildren(
    contacts.length?el("div",{class:"contacts"}, contacts.map((x,i)=>el("div",{class:"contact"},
      el("div",{}, el("strong",{},x.name||"—"), x.title?el("span",{class:"muted"}," · "+x.title):null, el("div",{class:"muted small"}, [x.email,x.phone].filter(Boolean).join(" · "))),
      el("button",{class:"btn small ghost",type:"button","aria-label":"Remove "+(x.name||"contact"),onclick:async()=>{ contacts.splice(i,1); await saveContacts(); }},"Remove")))):el("p",{class:"muted small"},"No other contacts yet."),
    contactForm()); };
  const saveContacts=async()=>{ try{ await SNP.saveItem("customer",c.id,Object.assign({},item("customer",c.id).data,{contacts})); SNP.toast("Contacts saved."); drawContacts(); }catch(e){ SNP.fail(e); } };
  const contactForm=()=>{ const f=SNP.form([{key:"name",label:"Name"},{key:"title",label:"Title"},{key:"email",label:"Email",type:"email"},{key:"phone",label:"Phone"}]);
    const add=el("button",{class:"btn small",type:"button"},"Add contact");
    add.onclick=async()=>{ const v=SNP.readForm(f); if(!v.name.trim()&&!v.email.trim()) return SNP.toast("Enter a name or email."); contacts.push(v); await saveContacts(); };
    return el("details",{class:"add-box"}, el("summary",{},"+ Add a contact"), f, el("div",{class:"row-actions"},add)); };
  drawContacts();

  // timeline
  const tl=el("div");
  const drawTimeline=()=>{
    const list=interactionsFor(c.id);
    tl.replaceChildren(list.length?el("ol",{class:"timeline"}, list.map(i=>el("li",{},
      el("div",{class:"tl-h"}, badge(i.data.kind,"neutral"), el("span",{class:"muted small"}, fmtDate(i.data.date)+" · "+nameOf(i.createdBy)),
        S.perms.deleteAny?SNP.confirmBtn("Delete","Delete this note?",async()=>{ await SNP.deleteItem("interaction",i.id); drawTimeline(); }):null),
      el("p",{class:"pre"}, i.data.summary)))):el("p",{class:"muted small"},"No calls or notes logged yet."));
  };
  const nf=SNP.form([{key:"kind",label:"Type",type:"select",options:["Call","Email","Meeting","WhatsApp","Note"]},{key:"date",label:"Date",type:"date"},{key:"summary",label:"What happened",type:"textarea",rows:2}],{kind:"Call",date:today()});
  const logBtn=el("button",{class:"btn small primary",type:"button"},"Log it");
  logBtn.onclick=async()=>{ const v=SNP.readForm(nf); if(!v.summary.trim()) return SNP.toast("Write what happened first.");
    logBtn.disabled=true; try{ await SNP.saveItem("interaction",null,Object.assign(v,{customerId:c.id})); nf.querySelector("textarea").value=""; drawTimeline(); SNP.toast("Logged."); }catch(e){ SNP.fail(e); } finally{ logBtn.disabled=false; } };
  drawTimeline();

  const rel=(title, rows, cols, onRow, emptyText)=>el("section",{class:"panel"}, el("h3",{},title), SNP.table({rows,columns:cols,onRow,empty:emptyText}));
  const deals=items("deal").filter(x=>x.data.customerId===c.id).sort((a,b)=>b.id-a.id);
  const quotes=items("quote").filter(x=>x.data.customerId===c.id).sort((a,b)=>(b.data.date||"").localeCompare(a.data.date||""));
  const orders=items("oil_order").filter(x=>x.data.customerId===c.id).sort((a,b)=>(b.data.date||"").localeCompare(a.data.date||""));
  const tasks=items("task").filter(t=>t.data.relatedType==="customer"&&t.data.relatedId===c.id&&t.data.status==="Open");

  main.append(head, kpis,
    el("div",{class:"two-col"},
      el("div",{class:"col"}, infoPanel, el("section",{class:"panel"}, el("h3",{},"Contacts"), cBox),
        el("section",{class:"panel"}, el("div",{class:"panel-h"}, el("h3",{},"Open tasks"), el("button",{class:"btn small",type:"button",onclick:()=>SNP.newTask({relatedType:"customer",relatedId:c.id,relatedLabel:d.name})},"+ Task")),
          tasks.length?el("ul",{class:"plain"}, tasks.map(t=>el("li",{}, el("a",{href:"#tasks"}, t.data.title), t.data.due?el("span",{class:"muted small"}," · due "+fmtDate(t.data.due)):null))):el("p",{class:"muted small"},"No open tasks."))),
      el("div",{class:"col"}, el("section",{class:"panel"}, el("h3",{},"Calls & notes"), el("div",{class:"add-box flat"}, nf, el("div",{class:"row-actions"},logBtn)), tl))),
    rel("Deals", deals, [{label:"Deal",value:x=>x.data.title},{label:"Stage",value:x=>badge(x.data.stage)},{label:"Value",cls:"num",value:x=>money0(x.data.value)},{label:"Next step",value:x=>x.data.nextStep?(x.data.nextStep+(x.data.nextStepDate?" · "+fmtDate(x.data.nextStepDate):"")):"—"}], x=>editDeal(x.id), "No deals yet."),
    rel("Quotes & invoices", [...quotes, ...items("invoice").filter(x=>x.data.customerId===c.id)].sort((a,b)=>(b.data.date||"").localeCompare(a.data.date||"")),
      [{label:"Number",value:x=>el("span",{class:"mono"},x.data.number)},{label:"Type",value:x=>x.type==="quote"?"Quote":"Invoice"},{label:"Date",value:x=>fmtDate(x.data.date)},
       {label:"Status",value:x=>badge(SNP.sales.statusOf(x))},{label:"Total",cls:"num",value:x=>money(x.data.total)},{label:"Balance",cls:"num",value:x=>x.type==="invoice"&&x.data.status!=="Void"?money(x.data.balance):"—"}],
      x=>SNP.sales.openDoc(x.type,x.id), "No quotes or invoices yet."),
    orders.length?rel("Oil orders", orders, [{label:"Date",value:x=>fmtDate(x.data.date)},{label:"Order",value:x=>x.data.description||"—"},{label:"Amount",cls:"num",value:x=>money(x.data.amount)},{label:"Reward",cls:"num",value:x=>money(x.data.rewardAmount)},{label:"Status",value:x=>badge(x.data.rewardStatus)}], x=>SNP.oil.editOrder(x.id)):null);
}

/* ---------- pipeline ---------- */
function renderPipeline(main){
  const deals=items("deal").filter(d=>(!PF.div||d.data.division===PF.div)&&(!PF.owner||String(d.data.ownerId)===PF.owner));
  const openVal=deals.filter(d=>OPEN_STAGES.includes(d.data.stage)).reduce((s,d)=>s+(d.data.value||0),0);
  const won90=deals.filter(d=>d.data.stage==="Won"&&(d.updatedAt||"").slice(0,10)>=SNP.addDays(today(),-90));
  const board=el("div",{class:"kanban"});
  STAGES.forEach(stage=>{
    let list=deals.filter(d=>d.data.stage===stage).sort((a,b)=>(a.data.nextStepDate||"9999").localeCompare(b.data.nextStepDate||"9999"));
    const total=list.reduce((s,d)=>s+(d.data.value||0),0);
    const closed = stage==="Won"||stage==="Lost";
    const more = closed && list.length>8 ? list.length-8 : 0;
    if (closed) list=list.sort((a,b)=>(b.updatedAt||"").localeCompare(a.updatedAt||"")).slice(0,8);
    const col=el("section",{class:"kcol "+SNP.slug(stage)}, el("div",{class:"kcol-h"}, el("h3",{},stage), el("span",{class:"mono"}, `${deals.filter(d=>d.data.stage===stage).length} · ${money0(total)}`)));
    list.forEach(d=>{
      const late=d.data.nextStepDate&&d.data.nextStepDate<today()&&!closed;
      const sel=SNP.selectEl(STAGES,d.data.stage,async v=>{ try{ await SNP.saveItem("deal",d.id,Object.assign({},d.data,{stage:v})); SNP.toast(`Moved to ${v}.`); SNP.refresh(true); }catch(e){ SNP.fail(e); } },"Stage for "+d.data.title);
      col.append(el("article",{class:"kcard",tabindex:"0",onclick:e=>{ if(!e.target.closest("select")) editDeal(d.id); },onkeydown:e=>{ if(e.key==="Enter"&&e.target.classList.contains("kcard")) editDeal(d.id); }},
        el("div",{class:"kc-t"}, d.data.title), el("div",{class:"muted small"}, SNP.customerName(d.data.customerId)||"No customer"),
        el("div",{class:"kc-row"}, el("strong",{}, money0(d.data.value)), d.data.division?el("span",{class:"tag"},d.data.division):null),
        d.data.nextStep||d.data.nextStepDate?el("div",{class:"small"+(late?" bad-t":"")}, (late?"Overdue: ":"Next: ")+(d.data.nextStep||"follow up")+(d.data.nextStepDate?" · "+fmtDate(d.data.nextStepDate):"")):null,
        sel));
    });
    if (more) col.append(el("div",{class:"muted small",style:"padding:6px"}, `+ ${more} older`));
    board.append(col);
  });
  const owners=SNP.peopleWithAccess();
  main.append(SNP.pageHead("Pipeline", `${money0(openVal)} in open deals · ${won90.length} won in the last 90 days (${money0(won90.reduce((s,d)=>s+(d.data.value||0),0))})`,
      el("button",{class:"btn primary",type:"button",onclick:()=>editDeal()},"+ Deal")),
    SNP.toolbar(SNP.selectEl([["","All divisions"],...DIVS.map(d=>[d,d])],PF.div,v=>{PF.div=v;SNP.refresh(true);},"Division"),
      SNP.selectEl([["","Any owner"],...owners.map(p=>[String(p.id),p.name])],PF.owner,v=>{PF.owner=v;SNP.refresh(true);},"Owner")),
    deals.length?board:el("div",{class:"empty"}, el("b",{},"No deals yet"), "Add a deal for each opportunity, then move it across as it progresses."));
}

SNP.crm = { editCustomer, editDeal, interactionsFor, OPEN_STAGES };
SNP.module({ id:"customers", label:"Customers", group:"Sales", visible:()=>SNP.can("customer","rw"), render:renderCustomers });
SNP.module({ id:"pipeline", label:"Pipeline", group:"Sales", visible:()=>SNP.can("deal","rw"), render:renderPipeline,
  badge:()=>items("deal").filter(d=>OPEN_STAGES.includes(d.data.stage)&&d.data.nextStepDate&&d.data.nextStepDate<today()).length });
})();

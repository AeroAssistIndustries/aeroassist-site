/* Activities: calls, meetings, visits, emails, WhatsApp and notes, logged or scheduled, on customers, contacts, leads and deals.
   Stored as "interaction" records. Also the one-to-one email composer with templates. */
(() => {
"use strict";
const { S, el, items, item, fmtDate, fmtWhen, nameOf, badge, today } = SNP;
const KINDS = ["Call","Meeting","Visit","Email","WhatsApp","Note"];
const MERGE = ["{{first_name}}","{{name}}","{{company}}","{{my_name}}","{{company_name}}","{{company_phone}}","{{website}}"];

const label = a => a.data.subject || (a.data.summary||"").split("\n")[0].slice(0,90) || a.data.kind;
const whenLabel = a => fmtDate(a.data.date)+(a.data.time?" · "+new Date("2000-01-01T"+a.data.time).toLocaleTimeString(undefined,{hour:"numeric",minute:"2-digit"}):"");
const isLate = a => a.data.status==="Planned" && a.data.date && (a.data.date<today() || (a.data.date===today()&&a.data.time&&a.data.time<new Date().toTimeString().slice(0,5)));
const kindBadge = k => el("span",{class:"kind k-"+k.toLowerCase()}, k);
const forScope = sc => items("interaction").filter(i=>(sc.customerId?i.data.customerId===sc.customerId:true)&&(sc.contactId?i.data.contactId===sc.contactId:true)&&(sc.leadId?i.data.leadId===sc.leadId:true)&&(sc.dealId?i.data.dealId===sc.dealId:true));

function fields(d){
  return [
    {key:"kind",label:"Type",type:"select",options:KINDS},
    {key:"status",label:"Status",type:"select",options:[["Planned","Scheduled"],["Done","Done"],["Canceled","Canceled"]]},
    {key:"subject",label:"Subject",full:true,placeholder:"e.g. Reorder check-in, pricing review"},
    {key:"date",label:"Date",type:"date"},{key:"time",label:"Time (Arizona)",type:"time"},
    {key:"durationMin",label:"Minutes",type:"number",step:"5"},{key:"ownerId",label:"Who",type:"user"},
    {key:"customerId",label:"Customer",type:"customer"},{key:"contactId",label:"Contact",type:"contact",customerId:d.customerId||0},
    ...(d.leadId||!d.customerId?[{key:"leadId",label:"Lead",type:"lead"}]:[]),
    {key:"dealId",label:"Deal",type:"deal"},
    {key:"location",label:"Where",full:true,placeholder:"Their office, phone, Zoom link…"},
    {key:"summary",label:"Notes / outcome",type:"textarea",rows:4}];
}
function toIcs(a){
  const d=a.data, who=d.contactId&&item("contact",d.contactId);
  return {uid:"act-"+a.id, title:`${d.kind}: ${label(a)}${d.customerId?" · "+SNP.customerName(d.customerId):""}`, date:d.date, time:d.time, minutes:d.durationMin||30,
    description:[who?`With ${who.data.name}${who.data.phone?" ("+who.data.phone+")":""}`:"", d.summary].filter(Boolean).join("\n\n"), location:d.location};
}
function edit(id=null, defaults={}){
  const it=id?item("interaction",id):null, base=Object.assign({kind:"Call",status:"Done",date:today(),ownerId:S.me&&S.me.id,durationMin:30},defaults,it?it.data:{});
  return SNP.editRecord({type:"interaction", id, title:id?`${base.kind}: ${label({data:base})}`:(base.status==="Planned"?"Schedule":"Log activity"), eyebrow:"Activity", fields:fields(base),
    defaults:Object.assign({kind:"Call",status:"Done",date:today(),ownerId:S.me&&S.me.id,durationMin:30},defaults),
    after:(d,saved)=>{ if(saved&&saved.data.status==="Planned"&&saved.data.date){ d.querySelector(".d-body .row-actions").append(
        el("button",{class:"btn ghost",type:"button",onclick:()=>SNP.ics(`SNP ${saved.data.kind} ${saved.data.date}.ics`,[toIcs(saved)])},"Add to my calendar"),
        SNP.can("interaction","rw")?el("button",{class:"btn",type:"button",onclick:()=>{ SNP.closePanel(d); complete(saved); }},"Mark done"):null); } }});
}
function complete(a){
  const ta=el("textarea",{rows:4,placeholder:"How did it go? Next step?","aria-label":"Outcome",autofocus:true});
  const next=el("input",{type:"date","aria-label":"Follow-up date"});
  const ok=el("button",{class:"btn primary",type:"button"},"Mark done");
  const m=SNP.modal(`${a.data.kind} done`, el("div",{class:"stack"}, el("p",{class:"muted small"}, label(a)+(a.data.customerId?" · "+SNP.customerName(a.data.customerId):"")),
    el("div",{class:"field"}, el("label",{},"Outcome"), ta), el("div",{class:"field"}, el("label",{},"Schedule a follow-up (optional)"), next), el("div",{class:"row-actions"},ok)), {size:"sm"});
  ok.onclick=async()=>{ ok.disabled=true;
    try{ const summary=[a.data.summary, ta.value.trim()?"Outcome: "+ta.value.trim():""].filter(Boolean).join("\n\n");
      await SNP.saveItem("interaction",a.id,Object.assign({},a.data,{status:"Done",summary:summary||a.data.subject,date:a.data.date>today()?today():a.data.date}));
      if (next.value) await SNP.saveItem("interaction",null,Object.assign({},a.data,{status:"Planned",date:next.value,summary:"",subject:"Follow up: "+label(a)}));
      SNP.closePanel(m); SNP.toast(next.value?"Done. Follow-up scheduled.":"Marked done."); SNP.refresh(true); }
    catch(e){ SNP.fail(e); ok.disabled=false; } };
}
function row(a, opts={}){
  const d=a.data, who=d.contactId&&item("contact",d.contactId), late=isLate(a);
  return el("li",{class:"act"+(late?" late":"")+(d.status==="Canceled"?" canceled":"")},
    el("div",{class:"act-h"}, kindBadge(d.kind), el("strong",{class:"act-t",tabindex:"0",onclick:()=>edit(a.id),onkeydown:e=>{ if(e.key==="Enter") edit(a.id); }}, label(a)),
      d.status==="Planned"&&SNP.can("interaction","rw")?el("button",{class:"btn small",type:"button",onclick:()=>complete(a)},"Done"):null),
    el("div",{class:"muted small"}, [late?"Overdue · ":"", whenLabel(a), opts.showCustomer&&d.customerId?SNP.customerName(d.customerId):"", d.leadId&&item("lead",d.leadId)?"Lead: "+(item("lead",d.leadId).data.company||item("lead",d.leadId).data.name):"", who?"with "+who.data.name:"", nameOf(d.ownerId||a.createdBy), d.status==="Canceled"?"canceled":""].filter(Boolean).join(" · ")),
    d.summary&&d.subject&&!opts.brief?el("p",{class:"pre small"}, d.summary.length>400?d.summary.slice(0,400)+"…":d.summary):null);
}

/* Activity panel for a customer, contact, lead or deal: quick log, upcoming, history. */
function panel(sc){
  const box=el("section",{class:"panel"});
  const draw=()=>{
    const all=forScope(sc);
    const up=all.filter(a=>a.data.status==="Planned").sort((a,b)=>(a.data.date+a.data.time).localeCompare(b.data.date+b.data.time));
    const past=all.filter(a=>a.data.status!=="Planned").sort((a,b)=>(b.data.date||"").localeCompare(a.data.date||"")||b.id-a.id);
    const rw=SNP.can("interaction","rw");
    const f=SNP.form([{key:"kind",label:"Type",type:"select",options:KINDS},{key:"date",label:"Date",type:"date"},
      ...(sc.contacts&&sc.contacts.length?[{key:"contactId",label:"With",type:"select",options:[["","—"],...sc.contacts.map(c=>[String(c.id),c.data.name])]}]:[]),
      {key:"summary",label:"What happened",type:"textarea",rows:2}],{kind:"Call",date:today(),contactId:sc.contactId||""});
    const log=el("button",{class:"btn small primary",type:"button"},"Log it");
    log.onclick=async()=>{ const v=SNP.readForm(f); if(!String(v.summary||"").trim()) return SNP.toast("Write what happened first.");
      log.disabled=true; try{ await SNP.saveItem("interaction",null,Object.assign({status:"Done",ownerId:S.me&&S.me.id},sc.customerId?{customerId:sc.customerId}:{},sc.leadId?{leadId:sc.leadId}:{},sc.dealId?{dealId:sc.dealId}:{},sc.contactId?{contactId:sc.contactId}:{},v,{contactId:Number(v.contactId)||sc.contactId||0})); SNP.toast("Logged."); draw(); }catch(e){ SNP.fail(e); } finally{ log.disabled=false; } };
    const sched=()=>edit(null,Object.assign({status:"Planned",kind:"Call",date:SNP.addDays(today(),1)},sc.customerId?{customerId:sc.customerId}:{},sc.leadId?{leadId:sc.leadId}:{},sc.dealId?{dealId:sc.dealId}:{},sc.contactId?{contactId:sc.contactId}:{}));
    const showAll=box._all;
    box.replaceChildren(el("div",{class:"panel-h"}, el("h3",{},"Activity"), rw?el("button",{class:"btn small",type:"button",onclick:sched},"Schedule"):null),
      rw?el("div",{class:"add-box flat"}, f, el("div",{class:"row-actions"},log)):null,
      up.length?el("div",{}, el("div",{class:"sec-h"},`Coming up · ${up.length}`), el("ul",{class:"acts"}, up.map(a=>row(a)))):null,
      el("div",{class:"sec-h",style:"margin-top:12px"},"History"),
      past.length?el("ul",{class:"acts timeline"}, (showAll?past:past.slice(0,sc.compact?6:15)).map(a=>row(a))):el("p",{class:"muted small"},"Nothing logged yet."),
      past.length>(sc.compact?6:15)&&!showAll?el("button",{class:"btn small ghost",type:"button",onclick:()=>{ box._all=true; draw(); }},`Show all ${past.length}`):null);
  };
  draw(); return box;
}

/* ---------- email composer (POST /message) ---------- */
function fill(text, r){
  const s=S.settings||{}, first=String(r.name||"").trim().split(/\s+/)[0]||"there";
  const map={"{{first_name}}":first,"{{name}}":r.name||"","{{company}}":r.company||"","{{email}}":r.to||"","{{my_name}}":(S.me&&S.me.name)||"","{{company_name}}":s.companyName||"","{{company_phone}}":s.companyPhone||"","{{website}}":s.companyWebsite||""};
  return String(text||"").replace(/\{\{[a-z_]+\}\}/g,m=>map[m]??m);
}
function compose(r){
  const tpls=items("email_template").filter(t=>t.data.category!=="Campaign"||true).sort((a,b)=>a.data.name.localeCompare(b.data.name));
  const sign=`\n\nThank you,\n${(S.me&&S.me.name)||""}\n${(S.settings||{}).companyName||""}\n${[(S.settings||{}).companyPhone,(S.settings||{}).companyEmail].filter(Boolean).join(" · ")}`;
  const f=SNP.form([{key:"to",label:"To",type:"email",full:true},{key:"subject",label:"Subject",full:true},{key:"body",label:"Message",type:"textarea",rows:10},{key:"copyMe",label:"Send me a copy",type:"checkbox"}],
    {to:r.to||"",subject:r.subject||"",body:r.body||`Hi ${fill("{{first_name}}",r)},\n\n`+sign,copyMe:false});
  const pick=SNP.selectEl([["","Start from a template…"],...tpls.map(t=>[String(t.id),`${t.data.name} (${t.data.category})`])],"",v=>{ const t=item("email_template",Number(v)); if(!t) return;
    f.querySelector('[data-key="subject"]').value=fill(t.data.subject,r); f.querySelector('[data-key="body"]').value=fill(t.data.body,r); },"Template");
  const c=r.contactId&&item("contact",r.contactId);
  const err=el("div",{class:"err",role:"alert"}), send=el("button",{class:"btn primary",type:"button"},"Send");
  const m=SNP.modal(`Email ${r.name||r.to||""}`, el("div",{class:"stack"}, tpls.length?pick:el("p",{class:"muted small"},"Tip: save reusable emails under Email → Templates."),
    c&&c.data.optOut?el("p",{class:"scope-banner"},"This person opted out of marketing emails. A direct message about their orders is fine."):null,
    f, el("p",{class:"muted small"},"Sent from the website with replies going to the company email, and logged on the customer's activity."), err, el("div",{class:"row-actions"},send)), {size:"sm"});
  send.onclick=async()=>{ const v=SNP.readForm(f); err.textContent=""; if(!v.to.trim()) return err.textContent="Enter an email address.";
    send.disabled=true; send.textContent="Sending…";
    try{ const res=await SNP.api("message",{method:"POST",body:Object.assign({},v,{customerId:r.customerId||0,contactId:r.contactId||0,leadId:r.leadId||0,dealId:r.dealId||0})});
      if (res.item) SNP.putItem(res.item); SNP.closePanel(m); SNP.toast(res.note||`Sent to ${v.to}.`); SNP.refresh(true); }
    catch(e){ err.textContent=e.message; send.disabled=false; send.textContent="Send"; } };
}

SNP.activities = { edit, panel, row, complete, compose, fill, label, whenLabel, isLate, toIcs, KINDS, MERGE, kindBadge };
})();

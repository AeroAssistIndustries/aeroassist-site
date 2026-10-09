/* Email: saved templates with merge fields, saved segments, and campaigns to a segment (owners send; with unsubscribe and a daily limit). */
(() => {
"use strict";
const { S, el, items, item, money, fmtDate, fmtWhen, nameOf, badge, today } = SNP;
const EF = { tab:"" };
const CATS = ["Campaign","Follow-up","Quote","Invoice","Other"];

/* ---------- templates ---------- */
function mergeButtons(target){
  return el("div",{class:"merge-row"}, el("span",{class:"muted small"},"Insert: "), SNP.activities.MERGE.map(m=>el("button",{type:"button",class:"btn small ghost",onclick:()=>{
    const ta=target(); const s=ta.selectionStart??ta.value.length; ta.value=ta.value.slice(0,s)+m+ta.value.slice(ta.selectionEnd??s); ta.focus(); ta.selectionStart=ta.selectionEnd=s+m.length; ta.dispatchEvent(new Event("input")); }},m.replace(/[{}]/g,""))));
}
function editTemplate(id=null, defaults={}){
  return SNP.editRecord({type:"email_template", id, title:id?"Email template":"New email template", eyebrow:"Email", wide:true,
    defaults:Object.assign({category:"Follow-up",body:"Hi {{first_name}},\n\n\n\nThank you,\n{{my_name}}\n{{company_name}} · {{company_phone}}"},defaults),
    fields:[{key:"name",label:"Template name",placeholder:"e.g. Monthly oil price update"},{key:"category",label:"Used for",type:"select",options:CATS},
      {key:"subject",label:"Subject",full:true},{key:"body",label:"Message",type:"textarea",rows:12}],
    after:dr=>{ const ta=dr.querySelector('[data-key="body"]'); if(ta) ta.closest(".field").after(mergeButtons(()=>ta)); }});
}
function templatesTab(){
  const list=items("email_template").sort((a,b)=>a.data.name.localeCompare(b.data.name));
  return el("div",{}, el("div",{class:"row-actions",style:"margin-bottom:12px"}, el("button",{class:"btn primary",type:"button",onclick:()=>editTemplate()},"+ Template"),
      list.length?null:el("button",{class:"btn ghost",type:"button",onclick:starterTemplates},"Add starter templates")),
    SNP.table({rows:list,onRow:t=>editTemplate(t.id),empty:"No templates yet. Templates save time on emails you send often: price updates, follow-ups, payment reminders.",columns:[
      {label:"Template",value:t=>el("strong",{},t.data.name)},{label:"Used for",value:t=>badge(t.data.category,"neutral")},{label:"Subject",value:t=>t.data.subject||"—"},{label:"Updated",value:t=>fmtDate((t.updatedAt||"").slice(0,10))}]}));
}
async function starterTemplates(){
  const T=[
    ["Monthly price update","Campaign","{{company_name}} prices for this month","Hi {{first_name}},\n\nHere are this month's prices from {{company_name}}. The price list is attached.\n\nReply to this email or call {{company_phone}} to place an order. Quantities are limited, so order early for the best availability.\n\nThank you,\n{{my_name}}\n{{company_name}}"],
    ["Reorder check-in","Follow-up","Time to restock?","Hi {{first_name}},\n\nIt's been a little while since your last order with us, so I wanted to check in. Do you need anything this week? I can hold stock and send a quote today.\n\nThank you,\n{{my_name}}\n{{company_name}} · {{company_phone}}"],
    ["Quote follow-up","Quote","Following up on your quote","Hi {{first_name}},\n\nI wanted to follow up on the quote we sent {{company}}. Happy to adjust quantities or delivery. Just reply here and I'll update it.\n\nThank you,\n{{my_name}}"],
    ["New customer welcome","Follow-up","Welcome to {{company_name}}","Hi {{first_name}},\n\nWelcome aboard, and thank you for choosing {{company_name}}. I'm your contact for orders, pricing and delivery. Save this email and call or WhatsApp me any time at {{company_phone}}.\n\n{{my_name}}"]];
  try{ for (const [name,category,subject,body] of T) await SNP.saveItem("email_template",null,{name,category,subject,body}); SNP.toast("4 starter templates added."); SNP.refresh(true); }catch(e){ SNP.fail(e); }
}

/* ---------- segments ---------- */
function segmentsTab(){
  const list=items("segment").sort((a,b)=>a.data.name.localeCompare(b.data.name));
  return el("div",{}, el("p",{class:"muted small"},"Make a segment by filtering Customers or Contacts and choosing Save as segment. Segments update themselves as records change."),
    SNP.table({rows:list,onRow:s=>openSegment(s.id),empty:"No saved segments yet.",columns:[
      {label:"Segment",value:s=>el("strong",{},s.data.name)},{label:"Of",value:s=>s.data.entity==="contact"?"Contacts":"Customers"},
      {label:"Filters",value:s=>el("span",{class:"small"},SNP.segments.describe(Object.assign(SNP.segments.blankFilters(),s.data.filters)))},
      {label:"Now",cls:"num",value:s=>String(SNP.segments.run(s).length)},{label:"Made by",value:s=>nameOf(s.createdBy)}]}));
}
function openSegment(id){
  const s=item("segment",id); if(!s) return;
  const members=SNP.segments.run(s), ent=s.data.entity;
  const name=el("input",{type:"text",value:s.data.name,"aria-label":"Segment name"});
  const save=el("button",{class:"btn small",type:"button",onclick:async()=>{ try{ await SNP.saveItem("segment",s.id,Object.assign({},s.data,{name:name.value.trim()||s.data.name})); SNP.toast("Renamed."); SNP.refresh(true); }catch(e){ SNP.fail(e); } }},"Rename");
  const d=SNP.drawer(s.data.name,"Segment", el("div",{class:"stack"},
    el("div",{class:"row-actions"}, name, save,
      el("button",{class:"btn small",type:"button",onclick:()=>{ SNP.closeAll(); SNP.go(ent==="contact"?"contacts":"customers"); }},`Open ${ent==="contact"?"Contacts":"Customers"}`),
      S.perms.deleteAny||s.createdBy===(S.me&&S.me.id)?SNP.confirmBtn("Delete","Delete this segment?",async()=>{ await SNP.deleteItem("segment",s.id); SNP.closePanel(d); SNP.toast("Deleted."); SNP.refresh(true); }):null),
    el("p",{class:"small"}, SNP.segments.describe(Object.assign(SNP.segments.blankFilters(),s.data.filters))),
    el("h3",{},`${members.length} ${ent==="contact"?"contacts":"customers"}`),
    el("ul",{class:"attn"}, members.slice(0,200).map(m=>el("li",{}, el("a",{href:ent==="contact"?"#contacts":"#customers/"+m.id,onclick:()=>{ SNP.closeAll(); if(ent==="contact") setTimeout(()=>SNP.contacts.open(m.id),60); }}, m.data.name),
      el("span",{class:"muted small"}, ent==="contact"?[m.data.email,SNP.customerName(m.data.customerId)].filter(Boolean).join(" · "):(SNP.health.of(m.id)||{}).status||""))))));
}

/* ---------- campaigns ---------- */
function audience(segId){
  const s=item("segment",Number(segId)); if(!s) return [];
  const seen=new Set(), out=[];
  const add=(email,name,company)=>{ email=String(email||"").toLowerCase().trim(); if(!email||seen.has(email)) return; seen.add(email); out.push({to:email,name,company}); };
  const members=SNP.segments.run(s);
  if (s.data.entity==="contact") members.forEach(c=>{ if(!c.data.optOut) add(c.data.email,c.data.name,SNP.customerName(c.data.customerId)); });
  else members.forEach(c=>{ const p=SNP.crm.contactsOf(c.id).filter(x=>x.data.email&&!x.data.optOut); if(p.length) add(p[0].data.email,p[0].data.name,c.data.name); else add(c.data.email,c.data.contactName,c.data.name); });
  return out;
}
async function priceListB64(division){
  const rows=items("product").filter(p=>p.data.active!==false&&(!division||p.data.division===division)).sort((a,b)=>(a.data.division||"").localeCompare(b.data.division||"")||a.data.name.localeCompare(b.data.name));
  if (!rows.length) throw {message:"There are no active products to put on the price list."};
  const blob=await SNP.docs.tablePDF("PRICE LIST", division||"All divisions", ["Product","SKU","Condition","Sold per","Price (USD)"], rows.map(p=>[p.data.name,p.data.sku||"",p.data.grade||"",p.data.unit||"",money(p.data.price)]), {right:[4]});
  return await new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(String(r.result).split(",")[1]); r.onerror=rej; r.readAsDataURL(blob); });
}
function openCampaign(id=null){
  const c=id?item("campaign",id):null, ro=c&&c.data.status!=="Draft";
  const v=Object.assign({name:"",segmentId:0,templateId:0,subject:"",body:"",attachPriceList:false,priceDivision:""},c?c.data:{});
  const segs=items("segment"), tpls=items("email_template");
  const f=SNP.form([{key:"name",label:"Campaign name (only you see this)",full:true,placeholder:"e.g. October oil prices"},
    {key:"segmentId",label:"Send to",type:"select",options:[["","Choose a saved segment…"],...segs.map(s=>[String(s.id),`${s.data.name} (${s.data.entity==="contact"?"contacts":"customers"})`])]},
    {key:"templateId",label:"Start from template",type:"select",options:[["","None"],...tpls.map(t=>[String(t.id),t.data.name])]},
    {key:"subject",label:"Subject",full:true},{key:"body",label:"Message",type:"textarea",rows:12},
    {key:"attachPriceList",label:"Attach the current price list (PDF)",type:"checkbox"},
    {key:"priceDivision",label:"Price list for",type:"select",options:[["","All divisions"],["Oil","Oil"],["Phones & electronics","Phones & electronics"],["Commercial supply","Commercial supply"]]}],
    Object.assign({},v,{segmentId:v.segmentId||"",templateId:v.templateId||""}), ro);
  const body=f.querySelector('[data-key="body"]'), subj=f.querySelector('[data-key="subject"]'), segSel=f.querySelector('[data-key="segmentId"]');
  if (!ro) body.closest(".field").after(mergeButtons(()=>body));
  f.querySelector('[data-key="templateId"]').addEventListener("change",e=>{ const t=item("email_template",Number(e.target.value)); if(!t) return; subj.value=t.data.subject; body.value=t.data.body; preview(); });
  const count=el("p",{class:"muted small"}), prev=el("div",{class:"email-preview"});
  const preview=()=>{ const a=audience(segSel.value), r=a[0]||{name:"Maria Lopez",company:"Sample Company",to:"maria@example.com"};
    count.textContent=segSel.value?`${a.length} recipient${a.length===1?"":"s"} with an email address who haven't opted out. One email per address.`:"Choose a segment to see who gets it.";
    prev.replaceChildren(el("div",{class:"ep-h"}, el("div",{}, el("span",{class:"muted"},"To: "), `${r.name||""} <${r.to}>`), el("div",{}, el("span",{class:"muted"},"Subject: "), el("strong",{}, SNP.activities.fill(subj.value,r)))),
      el("div",{class:"ep-b"}, SNP.activities.fill(body.value,r)),
      el("div",{class:"ep-f muted small"}, `--\n${(S.settings||{}).companyName||""} · ${String((S.settings||{}).companyAddress||"").replace(/\n/g,", ")}\nUnsubscribe: (a personal link is added to each email)`)); };
  [body,subj,segSel].forEach(n=>n.addEventListener("input",preview)); segSel.addEventListener("change",preview);
  const err=el("div",{class:"err",role:"alert"}), prog=el("div",{class:"campaign-progress"});
  let saved=c;
  const save=async()=>{ const d=SNP.readForm(f); if(!d.name.trim()) d.name=d.subject||"Untitled campaign"; d.segmentId=Number(d.segmentId)||0; d.templateId=Number(d.templateId)||0;
    saved=await SNP.saveItem("campaign",saved?saved.id:null,Object.assign({},saved?saved.data:{},d)); return saved; };
  const pdfIf=async()=>{ const d=SNP.readForm(f); return d.attachPriceList?{pdf:await priceListB64(d.priceDivision),filename:`${(S.settings||{}).companyName||"SNP"} price list ${today()}.pdf`}:{}; };
  const saveBtn=el("button",{class:"btn",type:"button",onclick:async e=>{ err.textContent=""; e.currentTarget.disabled=true; try{ await save(); SNP.toast("Draft saved."); SNP.refresh(true); }catch(x){ err.textContent=x.message; } finally{ e.currentTarget.disabled=false; } }},"Save draft");
  const testBtn=el("button",{class:"btn",type:"button",onclick:async e=>{ const b=e.currentTarget; err.textContent=""; b.disabled=true; b.textContent="Sending test…";
    try{ const s=await save(); const to=(S.people.find(p=>p.isMe)||{}).email||"";
      if (!to) { err.textContent="Your login has no email address to send the test to."; return; } await SNP.api(`campaigns/${s.id}/send`,{method:"POST",body:Object.assign({test:to},await pdfIf())}); SNP.toast(`Test sent to ${to}.`); }
    catch(x){ err.textContent=x.message; } finally{ b.disabled=false; b.textContent="Send me a test"; } }},"Send me a test");
  const sendBtn=el("button",{class:"btn primary",type:"button",onclick:async e=>{ err.textContent=""; const b=e.currentTarget; b.disabled=true;
    try{ const s=await save(); const r=await SNP.api(`campaigns/${s.id}/recipients`);
      const left=Math.max(0,r.dailyLimit-r.sentToday);
      confirmSend(s, r, left, async()=>{ await run(s, await pdfIf()); }); }
    catch(x){ err.textContent=x.message; } finally{ b.disabled=false; } }},"Send…");
  const run=async(s, pdf)=>{ let first=true;
    while(true){ const r=await SNP.api(`campaigns/${s.id}/send`,{method:"POST",body:first?pdf:{}}); first=false; SNP.putItem(r.item); saved=r.item; showProgress(r.item);
      if (r.busy){ await new Promise(res=>setTimeout(res,3000)); continue; } // another window or the schedule is sending this batch
      if (!r.remaining){ SNP.toast(`Campaign sent to ${r.item.data.stats.sent} people.`); break; }
      if (r.limitReached){ prog.append(el("p",{class:"warn-t"},SNP.CFG.csrf?`Today's sending limit (${r.dailyLimit}) is reached. The other ${r.remaining} go out automatically tomorrow.`:`Today's sending limit (${r.dailyLimit}) is reached. ${r.remaining} left. Open this campaign tomorrow and press Resume.`)); break; } }
    SNP.refresh(true); };
  const showProgress=it=>{ const st=it.data.stats||{}; const pct=st.total?Math.round((st.sent+st.failed+st.skipped)/st.total*100):0;
    prog.replaceChildren(el("div",{class:"meter"}, el("i",{class:"h-good",style:`width:${pct}%`})), el("p",{class:"small"},`${st.sent||0} sent · ${st.failed||0} failed · ${st.skipped||0} skipped (unsubscribed) of ${st.total||0}`)); };
  const resumeBtn=c&&c.data.status==="Sending"?el("button",{class:"btn primary",type:"button",onclick:async e=>{ e.currentTarget.disabled=true; try{ await run(c, await pdfIf()); }catch(x){ err.textContent=x.message; } }},"Resume sending"):null;
  const recipients=ro?el("details",{class:"add-box"}, el("summary",{},"Who it went to"), SNP.table({rows:(c.data.queue||[]).map((q,i)=>Object.assign({id:i},q)),empty:"—",columns:[
      {label:"Email",value:q=>q.email},{label:"Name",value:q=>q.name||"—"},{label:"Company",value:q=>q.company||"—"},{label:"Status",value:q=>badge(q.state==="sent"?"Sent":q.state==="failed"?"Failed":q.state==="skipped"?"Skipped":"Queued")}]})):null;
  const m=SNP.modal(c?c.data.name:"New email campaign", el("div",{class:"campaign-ed"},
    el("div",{class:"stack"}, ro?el("div",{class:"scope-banner"},c.data.status==="Sent"?`Sent ${fmtWhen(c.data.sentAt)}.`:"Sending in progress."):null, f, count, err, prog,
      el("div",{class:"row-actions"}, ro?resumeBtn:[saveBtn,testBtn,sendBtn], c&&S.perms.deleteAny&&c.data.status!=="Sending"?SNP.confirmBtn("Delete","Delete this campaign?",async()=>{ await SNP.deleteItem("campaign",c.id); SNP.closePanel(m); SNP.refresh(true); }):null,
        c?el("button",{class:"btn ghost",type:"button",onclick:()=>{ SNP.closePanel(m); duplicate(c); }},"Duplicate"):null), recipients),
    el("div",{class:"stack"}, el("h3",{},"Preview"), prev)), {size:"xl"});
  if (c&&c.data.status!=="Draft") showProgress(c);
  preview();
}
function confirmSend(s, r, left, go){
  const over=r.count>left;
  const ok=el("button",{class:"btn primary",type:"button"},`Send to ${r.count}`);
  const m=SNP.modal("Send campaign?", el("div",{class:"stack"},
    el("p",{}, `"${s.data.subject}" goes to ${r.count} ${r.count===1?"person":"people"} in this segment, one at a time from the website. Each email has an unsubscribe link and your company address.`),
    over?el("p",{class:"warn-t"},`Your daily limit allows ${left} more today, so ${r.count-left} will wait until tomorrow (press Resume then). Change the limit in Settings if your email service allows more.`):null,
    r.sample.length?el("p",{class:"muted small"},"First few: "+r.sample.slice(0,5).map(x=>x.email).join(", ")+(r.count>5?"…":"")):null,
    el("div",{class:"row-actions"}, ok, el("button",{class:"btn ghost",type:"button",onclick:()=>SNP.closePanel(m)},"Cancel"))), {size:"sm"});
  ok.onclick=async()=>{ ok.disabled=true; ok.textContent="Sending…"; try{ await go(); SNP.closePanel(m); }catch(e){ SNP.fail(e); SNP.closePanel(m); } };
  if (!r.count) { ok.disabled=true; ok.textContent="No one to send to"; }
}
async function duplicate(c){
  try{ const n=await SNP.saveItem("campaign",null,{name:c.data.name+" (copy)",segmentId:c.data.segmentId,templateId:c.data.templateId,subject:c.data.subject,body:c.data.body,attachPriceList:c.data.attachPriceList,priceDivision:c.data.priceDivision});
    SNP.refresh(true); openCampaign(n.id); }catch(e){ SNP.fail(e); }
}
function campaignsTab(){
  const list=items("campaign").sort((a,b)=>(b.data.sentAt||b.updatedAt||"").localeCompare(a.data.sentAt||a.updatedAt||""));
  return el("div",{}, el("div",{class:"row-actions",style:"margin-bottom:12px"}, el("button",{class:"btn primary",type:"button",onclick:()=>openCampaign()},"+ Campaign")),
    el("p",{class:"muted small"},`Campaigns go to a saved segment from the website's email, with an unsubscribe link in every message. ${S.suppressed?S.suppressed+" address"+(S.suppressed===1?" has":"es have")+" unsubscribed. ":""}Up to ${(S.settings||{}).emailDailyLimit||200} emails a day (Settings).`),
    SNP.table({rows:list,onRow:c=>openCampaign(c.id),empty:"No campaigns yet. Save a segment first (for example, active oil customers), then send them this month's prices.",columns:[
      {label:"Campaign",value:c=>el("div",{}, el("strong",{},c.data.name), el("div",{class:"muted small"},c.data.subject))},
      {label:"To",value:c=>{ const s=item("segment",c.data.segmentId); return s?s.data.name:"—"; }},
      {label:"Status",value:c=>badge(c.data.status,c.data.status==="Sent"?"s-sent":c.data.status==="Sending"?"s-pending":"neutral")},
      {label:"Sent",cls:"num",value:c=>c.data.stats&&c.data.stats.total?`${c.data.stats.sent} / ${c.data.stats.total}`:"—"},
      {label:"When",value:c=>c.data.sentAt?fmtWhen(c.data.sentAt):"Draft"}]}));
}

function render(main){
  const tabs=[...(SNP.can("campaign","rw")?[["campaigns","Campaigns"]]:[]),["templates","Templates"],["segments","Segments"]];
  if (!tabs.find(t=>t[0]===EF.tab)) EF.tab=tabs[0][0];
  main.append(SNP.pageHead("Email", "Templates for everyday emails, saved segments, and campaigns to a segment."), SNP.subtabs(tabs,EF.tab,v=>{EF.tab=v;SNP.refresh(true);}),
    EF.tab==="campaigns"?campaignsTab():EF.tab==="segments"?segmentsTab():templatesTab());
}

SNP.campaigns = { openCampaign, editTemplate, openSegment, audience };
SNP.module({ id:"email", label:"Email", group:"Marketing", visible:()=>SNP.can("email_template","rw"), render });
})();

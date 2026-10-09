/* People, activity log and company settings. Owners only. */
(() => {
"use strict";
const { S, el, api, toast, fail, fmtWhen, nameOf, items } = SNP;
const ROLE_OPTIONS = [["snp_owner","Owner"],["snp_sales","Sales"],["snp_accountant","Accountant"],["snp_attorney","Attorney"]];
const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
let lastLink=null;

function linkBox(res, name){
  if (!res.link) return null;
  return el("div",{class:"linkbox"},
    el("div",{style:"margin-bottom:6px"}, res.emailed?`Email sent to ${name}. If it doesn't arrive, send them this setup link (works for 3 days):`:`The email couldn't be sent. Send ${name} this setup link yourself (works for 3 days):`),
    el("code",{}, res.link), el("div",{style:"margin-top:8px"}, el("button",{class:"btn small",type:"button",onclick:()=>SNP.copyText(res.link)},"Copy link")));
}
function renderPeople(main){
  const rows=S.people.map(p=>{
    let ctrl;
    if (p.isAdmin) ctrl=el("span",{class:"muted small"},"Full access (site administrator)");
    else if (p.isMe) ctrl=el("span",{class:"muted small"},p.label+" (you)");
    else { const s=el("select",{"aria-label":"Access for "+p.name}, ...ROLE_OPTIONS.map(([v,l])=>el("option",{value:v},l)), el("option",{value:"none"},"No access"));
      s.value=p.snpRole||"none";
      s.onchange=async()=>{ s.disabled=true; try{ const r=await api("people/"+p.id,{method:"POST",body:{role:s.value}}); toast(s.value==="none"?`${p.name} no longer has access.`:`${p.name} is now ${r.person.label}.`); await SNP.load(); }catch(e){ fail(e); s.value=p.snpRole||"none"; } finally{ s.disabled=false; } };
      ctrl=s; }
    const resend=(!p.isAdmin&&!p.isMe&&p.role)?el("button",{class:"btn small ghost",type:"button",onclick:async e=>{ const b=e.currentTarget; b.disabled=true;
      try{ const r=await api("people/"+p.id,{method:"POST",body:{resend:true}});
        if (r.link){ lastLink={res:r,name:p.name}; SNP.refresh(true); }
        else { toast(r.emailed?`Emailed ${p.name} a link to choose a new password.`:`The email to ${p.name} couldn't be sent. They can use "Forgot your password?" on the sign-in page.`); b.disabled=false; } }
      catch(err){ fail(err); b.disabled=false; } }},p.invited===false?"Email a password link":"Send new setup link"):null;
    const mfaOff=(p.mfa&&!p.isMe)?el("button",{class:"btn small ghost",type:"button",title:"For when someone loses their phone",onclick:async e=>{ const btn=e.currentTarget; btn.disabled=true;
      try{ await api("people/"+p.id,{method:"POST",body:{resetMfa:true}}); toast(`Two-step sign-in is off for ${p.name}. They can turn it on again from Account.`); await SNP.load(); }catch(err){ fail(err); btn.disabled=false; } }},"Turn off two-step"):null;
    return el("tr",{}, el("td",{"data-label":"Name"}, el("strong",{},p.name), p.invited?el("div",{class:"muted small"},"Hasn't set a password yet"):null, p.mfa?el("div",{class:"muted small"},"Two-step sign-in on"):null),
      el("td",{"data-label":"Email"}, p.email), el("td",{"data-label":"Access"}, ctrl), el("td",{}, resend, mfaOff));
  });
  const f=SNP.form([{key:"name",label:"Name",placeholder:"Full name"},{key:"email",label:"Email",type:"email",placeholder:"name@example.com"},{key:"role",label:"Access",type:"select",options:ROLE_OPTIONS}],{role:"snp_owner"});
  f.classList.add("cols3");
  const err=el("div",{class:"err",role:"alert"}), add=el("button",{class:"btn primary",type:"button"},"Add person");
  add.onclick=async()=>{ err.textContent=""; const v=SNP.readForm(f); if(!v.name.trim()){ err.textContent="Enter the person's name."; return; }
    add.disabled=true;
    try{ const r=await api("people",{method:"POST",body:v}); lastLink=r.link?{res:r,name:r.person.name}:null;
      toast(r.existing?`${r.person.name} already had an account; they now have ${r.person.label} access.`:`${r.person.name} added.`); await SNP.load(); }
    catch(e){ err.textContent=e.message; } finally{ add.disabled=false; } };
  const ass=el("textarea",{id:"p-assignees",rows:"4"}); ass.value=S.assignees.join("\n");
  const assSave=el("button",{class:"btn small",type:"button"},"Save names");
  assSave.onclick=async()=>{ assSave.disabled=true; try{ const r=await api("settings",{method:"POST",body:{assignees:ass.value.split("\n")}}); S.assignees=r.assignees; toast("Names saved."); }catch(e){ fail(e); } finally{ assSave.disabled=false; } };
  main.append(SNP.pageHead("People",`Everyone signs in at ${location.host} with their own login.`),
    el("section",{class:"panel"}, el("h3",{},"Add someone"),
      el("p",{class:"sub"},"They get an email with a link to set their own password. Owners see everything: sales, costs, customers, money and records. ",
        "Sales see customers, leads, deals, quotes and invoices, and the price list without costs or profit; they can email quotes and invoices but not delete anything. ",
        `Accountants see invoices, profit reports and oil rewards (view only) and ${S.scopes.accountant||"tax and finance records"}. Attorneys see ${S.scopes.attorney||"contract and compliance records"} and can edit templates. Everyone has notes and their own tasks.`),
      f, err, el("div",{class:"row-actions"}, add), lastLink?linkBox(lastLink.res,lastLink.name):null),
    el("section",{class:"panel"}, el("h3",{},"Who has access"),
      el("div",{class:"tbl-wrap"}, el("table",{class:"list"}, el("thead",{}, el("tr",{}, el("th",{},"Name"), el("th",{},"Email"), el("th",{},"Access"), el("th",{}))), el("tbody",{}, rows)))),
    el("section",{class:"panel"}, el("h3",{},"Names for company records"),
      el("p",{class:"sub"},"The \"Assigned to\" list on company records, one per line. Keep the accountant's and attorney's names exactly as they are: records assigned to them are what those logins can see."),
      ass, el("div",{class:"row-actions"}, assSave)),
    targetsPanel(), scopePanel());
}

/* Monthly sales targets for owners and salespeople (shown on Home and in Reports). */
function targetsPanel(){
  const reps=S.people.filter(p=>["owner","sales"].includes(p.role));
  if (!reps.length) return null;
  const tg=(S.settings&&S.settings.targets)||{};
  const inputs=reps.map(p=>{ const i=el("input",{type:"number",min:"0",step:"100",inputmode:"decimal",id:"tg-"+p.id,value:tg[p.id]||"",placeholder:"No target"}); i.dataset.uid=p.id; return i; });
  const save=el("button",{class:"btn small primary",type:"button"},"Save targets");
  save.onclick=async()=>{ const t={}; inputs.forEach(i=>{ const v=Number(i.value)||0; if(v>0) t[i.dataset.uid]=v; });
    save.disabled=true; try{ S.settings=await api("app-settings",{method:"POST",body:{targets:t}}); toast("Targets saved."); SNP.refresh(true); }catch(e){ fail(e); } finally{ save.disabled=false; } };
  return el("section",{class:"panel"}, el("h3",{},"Monthly sales targets"),
    el("p",{class:"sub"},"Sales before tax and shipping, from invoices where the person is the sales rep. Each salesperson sees only their own target; owners see the whole team."),
    el("div",{class:"fields cols3"}, reps.map((p,i)=>el("div",{class:"field"}, el("label",{for:"tg-"+p.id}, `${p.name} (${p.label||p.role})`), inputs[i]))),
    el("div",{class:"row-actions"}, save));
}
/* The accountant and attorney logins see records assigned to these names. */
function scopePanel(){
  const sn=S.scopeNames||{accountant:"Accountant",attorney:"Attorney"};
  const f=SNP.form([{key:"accountant",label:"Accountant's name on company records"},{key:"attorney",label:"Attorney's name on company records"}], sn);
  const save=el("button",{class:"btn small",type:"button"},"Save");
  save.onclick=async()=>{ save.disabled=true; try{ const r=await api("settings",{method:"POST",body:{scopeNames:SNP.readForm(f)}}); S.scopeNames=r.scopeNames; toast("Saved. Reload for the accountant and attorney views to pick it up."); }catch(e){ fail(e); } finally{ save.disabled=false; } };
  return el("section",{class:"panel"}, el("h3",{},"Who sees which records"),
    el("p",{class:"sub"},"Accountant logins see company records assigned to the first name; attorney logins see records assigned to the second. Use the same spelling as in the list above."),
    f, el("div",{class:"row-actions"}, save));
}

function renderActivity(main){
  const list=el("ul",{class:"acts-list"});
  if (!S.activity.length) list.append(el("li",{}, el("span",{class:"muted"},"No changes yet.")));
  S.activity.forEach(a=>list.append(el("li",{}, el("span",{class:"when"}, fmtWhen(a.at)), el("span",{class:"act"}, nameOf(a.by)), el("span",{}, `${a.action}: ${a.detail}`))));
  main.append(SNP.pageHead("Activity","The last 200 changes across the back office, newest first."), el("section",{class:"panel"}, list));
}

function renderSettings(main){
  const s=S.settings||{};
  const f=SNP.form([
    {section:"Company details (printed on quotes, invoices, POs and statements)"},
    {key:"companyName",label:"Company name"},{key:"companyPhone",label:"Phone"},{key:"companyEmail",label:"Email"},{key:"companyWebsite",label:"Website"},
    {key:"companyAddress",label:"Address",type:"textarea",rows:2},
    {section:"Quotes & invoices"},
    {key:"quoteValidDays",label:"Quotes valid for (days)",type:"number",step:"1"},{key:"invoiceDueDays",label:"Invoice due in (days), when the customer has no terms",type:"number",step:"1"},
    {key:"taxRate",label:"Default tax rate %",type:"number",step:"0.001",hint:"Usually 0 for resale-exempt wholesale customers."},
    {key:"paymentInfo",label:"How to pay (printed on invoices)",type:"textarea",rows:3,hint:"Bank details here are printed on every invoice. Only owners can change this."},
    {key:"documentFooter",label:"Footer on quotes and invoices",type:"textarea",rows:2},
    {section:"Oil rewards"},
    {key:"partnerName",label:"Profit-share partner"},{key:"partnerShare",label:"Partner's share %",type:"number",step:"0.001"},
    {key:"costsBeforeSplit",label:"Deduct program costs before the split",type:"checkbox"},
    {key:"programName",label:"Purchasing program name",hint:"Shown on the oil pages."},
    {key:"memberships",label:"Program memberships (one per line, nicknames only, never card numbers)",type:"textarea",rows:3},
    {section:"Business hours (Arizona time; shown by the clock at the top)"},
    {key:"hoursOpen",label:"Opens",type:"time"},{key:"hoursClose",label:"Closes",type:"time"},
    {key:"workdays",label:"Open on",type:"multi",options:DAYS},
    {section:"CRM"},
    {key:"defaultReorderDays",label:"Expect customers to reorder every (days), until they have 3 orders",type:"number",step:"1"},
    {key:"emailDailyLimit",label:"Most campaign emails to send in a day",type:"number",step:"10",hint:"Keeps campaigns within what the email service allows in a day. Cloudflare Email Service includes 3,000 emails a month on the Workers Paid plan."},
    {key:"portalEnabled",label:"Customer portal on (customers can sign in at /portal to see quotes and invoices)",type:"checkbox"},
    {section:"Reminders"},
    {key:"reminders",label:"Send each person a 7 a.m. email when they have tasks due (owners also get overdue invoices, follow-ups and records due)",type:"checkbox"}],
    Object.assign({},s,{memberships:(s.memberships||[]).join("\n"),workdays:(s.workdays||[1,2,3,4,5]).map(d=>DAYS[d])}));
  const err=el("div",{class:"err",role:"alert"}), save=el("button",{class:"btn primary",type:"button"},"Save settings");
  save.onclick=async()=>{ const v=SNP.readForm(f); v.memberships=String(v.memberships||"").split("\n"); v.workdays=(v.workdays||[]).map(d=>DAYS.indexOf(d)).filter(d=>d>=0);
    save.disabled=true; err.textContent="";
    try{ S.settings=await api("app-settings",{method:"POST",body:v}); toast("Settings saved."); SNP.refresh(true); }catch(e){ err.textContent=e.message; } finally{ save.disabled=false; } };
  main.append(SNP.pageHead("Settings","Company details and defaults for the whole back office."), el("section",{class:"panel"}, f, err, el("div",{class:"row-actions"}, save)),
    pipelinesPanel(), customFieldsPanel(), listsPanel(), backupPanel());
}
/* A copy of everything, for safekeeping (only on the standalone server; WordPress has its own backups). */
function backupPanel(){
  if (!SNP.CFG.csrf) return null;
  const btn=el("button",{class:"btn",type:"button"},"Download a backup");
  btn.onclick=async()=>{ btn.disabled=true;
    try{ const r=await fetch(SNP.url("export"),{credentials:"same-origin"}); if(!r.ok) throw new Error("backup");
      SNP.saveBlob(`snp-records-backup-${SNP.today()}.json`, await r.blob()); toast("Backup downloaded. Keep it somewhere private."); }
    catch(e){ toast("The backup didn't download. Try again."); } finally{ btn.disabled=false; } };
  return el("section",{class:"panel"}, el("h3",{},"Backup"),
    el("p",{class:"sub"},"Cloudflare keeps 30 days of history and can put the whole database back to any minute in that time. For your own copy, download everything here (customers, deals, quotes, invoices, records, settings) as one file. Uploaded files stay in storage and passwords aren't included."),
    el("div",{class:"row-actions"}, btn));
}
const saveSetting=async(body, btn, msg)=>{ btn.disabled=true; try{ S.settings=await api("app-settings",{method:"POST",body}); toast(msg||"Saved."); SNP.refresh(true); }catch(e){ fail(e); } finally{ btn.disabled=false; } };

/* Pipelines and their stages. */
function pipelinesPanel(){
  const pls=JSON.parse(JSON.stringify((S.settings&&S.settings.pipelines)||[]));
  pls.forEach(p=>p.stages.forEach(st=>st._old=st.name));
  const box=el("div");
  const draw=()=>{ box.replaceChildren(...pls.map((p,pi)=>el("div",{class:"pl-ed"},
    el("div",{class:"row-actions"}, el("input",{type:"text",value:p.name,"aria-label":"Pipeline name",oninput:e=>p.name=e.target.value}),
      el("span",{class:"muted small"},`${items("deal").filter(d=>d.data.pipeline===p.key).length} deals`),
      pls.length>1?el("button",{class:"btn small ghost",type:"button",onclick:()=>{ pls.splice(pi,1); draw(); }},"Remove pipeline"):null),
    el("table",{class:"list stages-t"}, el("thead",{}, el("tr",{}, el("th",{},"Stage"), el("th",{class:"num"},"Chance %"), el("th",{},"Kind"), el("th",{}))),
      el("tbody",{}, p.stages.map((st,si)=>el("tr",{},
        el("td",{"data-label":"Stage"}, el("input",{type:"text",value:st.name,"aria-label":"Stage name",oninput:e=>st.name=e.target.value})),
        el("td",{class:"num","data-label":"Chance %"}, el("input",{type:"number",min:"0",max:"100",value:st.prob,style:"width:70px","aria-label":"Chance",disabled:st.type!=="open"||null,oninput:e=>st.prob=Number(e.target.value)||0})),
        el("td",{"data-label":"Kind"}, SNP.selectEl([["open","Open"],["won","Won"],["lost","Lost"]],st.type,v=>{ st.type=v; st.prob=v==="won"?100:v==="lost"?0:st.prob; draw(); },"Kind")),
        el("td",{class:"rm"}, el("button",{class:"btn small ghost",type:"button","aria-label":"Move up",disabled:!si||null,onclick:()=>{ p.stages.splice(si-1,0,p.stages.splice(si,1)[0]); draw(); }},"↑"),
          el("button",{class:"btn small ghost",type:"button","aria-label":"Remove stage",onclick:()=>{ p.stages.splice(si,1); draw(); }},"×")))))),
    el("button",{class:"btn small ghost",type:"button",onclick:()=>{ const wonAt=p.stages.findIndex(x=>x.type!=="open"); p.stages.splice(wonAt<0?p.stages.length:wonAt,0,{name:"New stage",prob:50,type:"open"}); draw(); }},"+ Stage"))),
    el("button",{class:"btn small",type:"button",onclick:()=>{ pls.push({name:"New pipeline",stages:[{name:"Lead",prob:10,type:"open"},{name:"Quoted",prob:50,type:"open"},{name:"Won",prob:100,type:"won"},{name:"Lost",prob:0,type:"lost"}]}); draw(); }},"+ Pipeline")); };
  draw();
  const save=el("button",{class:"btn primary",type:"button"},"Save pipelines");
  save.onclick=async()=>{
    const clean=pls.map(p=>({key:p.key,name:p.name,stages:p.stages.map(({name,prob,type})=>({name:name.trim(),prob,type}))}));
    await saveSetting({pipelines:clean},save,"Pipelines saved.");
    // Keep deals on the board: follow renamed stages, and move deals out of removed stages and pipelines.
    const now=(S.settings&&S.settings.pipelines)||[]; const moves=[];
    items("deal").forEach(d=>{ const p=pls.find(x=>x.key&&x.key===d.data.pipeline), live=now.find(x=>x.key===d.data.pipeline);
      if (!live){ moves.push([d.id,{pipeline:now[0].key}]); return; }
      const st=p&&p.stages.find(x=>x._old===d.data.stage);
      if (st&&st.name.trim()!==d.data.stage&&live.stages.some(x=>x.name===st.name.trim())) moves.push([d.id,{stage:st.name.trim()}]);
      else if (!live.stages.some(x=>x.name===d.data.stage)) moves.push([d.id,{stage:live.stages[0].name}]); });
    if (moves.length){ const groups=new Map(); moves.forEach(([id,patch])=>{ const k=JSON.stringify(patch); if(!groups.has(k)) groups.set(k,[]); groups.get(k).push(id); });
      try{ for (const [k,ids] of groups) await api("bulk",{method:"POST",body:{type:"deal",action:"update",ids,data:JSON.parse(k)}}); await SNP.load(); toast(`Pipelines saved. ${moves.length} deal${moves.length===1?"":"s"} moved to match.`); }catch(e){ fail(e); } }
  };
  return el("section",{class:"panel"}, el("h3",{},"Pipelines"),
    el("p",{class:"sub"},"Each pipeline is its own board. Chance % feeds the weighted forecast. Renaming a stage keeps its deals; deals in a removed stage go to the pipeline's first stage, and deals in a removed pipeline go to the first pipeline."),
    box, el("div",{class:"row-actions"}, save));
}

/* Extra fields on customers and contacts. */
function customFieldsPanel(){
  const list=JSON.parse(JSON.stringify((S.settings&&S.settings.customFields)||[]));
  const box=el("div");
  const draw=()=>{ box.replaceChildren(list.length?el("table",{class:"list"}, el("thead",{}, el("tr",{}, el("th",{},"Field"), el("th",{},"On"), el("th",{},"Type"), el("th",{},"Choices (for a list)"), el("th",{}))),
      el("tbody",{}, list.map((f,i)=>el("tr",{},
        el("td",{"data-label":"Field"}, el("input",{type:"text",value:f.label,"aria-label":"Field name",oninput:e=>f.label=e.target.value})),
        el("td",{"data-label":"On"}, SNP.selectEl([["customer","Customers"],["contact","Contacts"]],f.entity,v=>f.entity=v,"Applies to")),
        el("td",{"data-label":"Type"}, SNP.selectEl([["text","Text"],["number","Number"],["date","Date"],["select","Pick from a list"],["checkbox","Yes / no"]],f.type,v=>{ f.type=v; draw(); },"Type")),
        el("td",{"data-label":"Choices"}, f.type==="select"?el("input",{type:"text",value:(f.options||[]).join(", "),placeholder:"Comma between choices","aria-label":"Choices",oninput:e=>f.options=e.target.value.split(",").map(x=>x.trim()).filter(Boolean)}):el("span",{class:"muted small"},"—")),
        el("td",{class:"rm"}, el("button",{class:"btn small ghost",type:"button","aria-label":"Remove field",onclick:()=>{ list.splice(i,1); draw(); }},"×")))))):el("p",{class:"muted small"},"No custom fields yet."),
    el("button",{class:"btn small",type:"button",onclick:()=>{ list.push({label:"",entity:"customer",type:"text",options:[]}); draw(); }},"+ Field")); };
  draw();
  const save=el("button",{class:"btn primary",type:"button"},"Save fields");
  save.onclick=()=>saveSetting({customFields:list},save,"Custom fields saved.");
  return el("section",{class:"panel"}, el("h3",{},"Custom fields"),
    el("p",{class:"sub"},"Add fields SNP needs that aren't built in, like fleet size, EIN on file or preferred delivery day. They show on the record, in exports, and can be imported."),
    box, el("div",{class:"row-actions"}, save));
}

/* Pick-lists. */
function listsPanel(){
  const lr=el("textarea",{rows:6,"aria-label":"Lost reasons"}); lr.value=((S.settings&&S.settings.lostReasons)||[]).join("\n");
  const ind=el("textarea",{rows:6,"aria-label":"Types of business"}); ind.value=((S.settings&&S.settings.industries)||[]).join("\n");
  const save=el("button",{class:"btn primary",type:"button"},"Save lists");
  save.onclick=()=>saveSetting({lostReasons:lr.value.split("\n"),industries:ind.value.split("\n")},save,"Lists saved.");
  return el("section",{class:"panel"}, el("h3",{},"Pick-lists"), el("div",{class:"fields"},
    el("div",{class:"field"}, el("label",{},"Reasons a deal is lost (one per line)"), lr), el("div",{class:"field"}, el("label",{},"Types of business (one per line)"), ind)), el("div",{class:"row-actions"}, save));
}

SNP.module({ id:"people", label:"People", group:"Admin", visible:()=>!!S.perms.managePeople, render:renderPeople });
SNP.module({ id:"activity", label:"Activity", group:"Admin", visible:()=>!!S.perms.seeActivity, render:renderActivity });
SNP.module({ id:"settings", label:"Settings", group:"Admin", visible:()=>S.me&&S.me.role==="owner", render:renderSettings });
SNP.start();
})();

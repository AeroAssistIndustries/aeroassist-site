/* People, activity log and company settings. Owners only. */
(() => {
"use strict";
const { S, el, api, toast, fail, fmtWhen, nameOf } = SNP;
const ROLE_OPTIONS = [["snp_owner","Owner"],["snp_accountant","Accountant"],["snp_attorney","Attorney"]];
let lastLink=null;

function linkBox(res, name){
  if (!res.link) return null;
  return el("div",{class:"linkbox"},
    el("div",{style:"margin-bottom:6px"}, res.emailed?`Email sent to ${name}. If it doesn't arrive, send them this setup link (works for 24 hours):`:`The email couldn't be sent from this site. Send ${name} this setup link yourself (works for 24 hours):`),
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
      try{ const r=await api("people/"+p.id,{method:"POST",body:{resend:true}}); lastLink={res:r,name:p.name}; SNP.refresh(true); }catch(err){ fail(err); b.disabled=false; } }},"Send new setup link"):null;
    return el("tr",{}, el("td",{"data-label":"Name"}, el("strong",{},p.name)), el("td",{"data-label":"Email"}, p.email), el("td",{"data-label":"Access"}, ctrl), el("td",{}, resend));
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
  main.append(SNP.pageHead("People","Everyone signs in at snpwholesale.com/owners with their own login."),
    el("section",{class:"panel"}, el("h3",{},"Add someone"),
      el("p",{class:"sub"},"They get an email with a link to set their own password. Owners see everything: sales, customers, money and records. ",
        `Accountants see invoices and oil rewards (view only) and ${S.scopes.accountant||"tax and finance records"}. Attorneys see ${S.scopes.attorney||"contract and compliance records"} and can edit templates. Everyone sees the tasks assigned to them.`),
      f, err, el("div",{class:"row-actions"}, add), lastLink?linkBox(lastLink.res,lastLink.name):null),
    el("section",{class:"panel"}, el("h3",{},"Who has access"),
      el("div",{class:"tbl-wrap"}, el("table",{class:"list"}, el("thead",{}, el("tr",{}, el("th",{},"Name"), el("th",{},"Email"), el("th",{},"Access"), el("th",{}))), el("tbody",{}, rows)))),
    el("section",{class:"panel"}, el("h3",{},"Names for company records"),
      el("p",{class:"sub"},"The \"Assigned to\" list on company records, one per line. Keep the accountant's and attorney's names exactly as they are: records assigned to them are what those logins can see."),
      ass, el("div",{class:"row-actions"}, assSave)));
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
    {key:"memberships",label:"Sam's Club memberships (one per line, nicknames only, never card numbers)",type:"textarea",rows:3},
    {section:"Reminders"},
    {key:"reminders",label:"Send each person a 7 a.m. email when they have tasks due (owners also get overdue invoices, follow-ups and records due)",type:"checkbox"}],
    Object.assign({},s,{memberships:(s.memberships||[]).join("\n")}));
  const err=el("div",{class:"err",role:"alert"}), save=el("button",{class:"btn primary",type:"button"},"Save settings");
  save.onclick=async()=>{ const v=SNP.readForm(f); v.memberships=String(v.memberships||"").split("\n");
    save.disabled=true; err.textContent="";
    try{ S.settings=await api("app-settings",{method:"POST",body:v}); toast("Settings saved."); SNP.refresh(true); }catch(e){ err.textContent=e.message; } finally{ save.disabled=false; } };
  main.append(SNP.pageHead("Settings","Company details and defaults for the whole back office."), el("section",{class:"panel"}, f, err, el("div",{class:"row-actions"}, save)));
}

SNP.module({ id:"people", label:"People", group:"Admin", visible:()=>!!S.perms.managePeople, render:renderPeople });
SNP.module({ id:"activity", label:"Activity", group:"Admin", visible:()=>!!S.perms.seeActivity, render:renderActivity });
SNP.module({ id:"settings", label:"Settings", group:"Admin", visible:()=>S.me&&S.me.role==="owner", render:renderSettings });
SNP.start();
})();

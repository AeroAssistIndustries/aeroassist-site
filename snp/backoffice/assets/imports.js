/* CRM tools: spreadsheet import with column matching, bulk actions on selected rows, duplicate finder and merge,
   and customer-portal access on the customer page. */
(() => {
"use strict";
const { S, el, items, item, nameOf, today, api } = SNP;

/* ---------- CSV ---------- */
function parseCSV(text){
  text=text.replace(/^﻿/,"");
  const first=text.split(/\r?\n/)[0]||"", delim=[",",";","\t"].sort((a,b)=>first.split(b).length-first.split(a).length)[0];
  const rows=[]; let row=[], cell="", q=false;
  for (let i=0;i<text.length;i++){ const ch=text[i];
    if (q){ if(ch==='"'){ if(text[i+1]==='"'){ cell+='"'; i++; } else q=false; } else cell+=ch; continue; }
    if (ch==='"') q=true; else if (ch===delim){ row.push(cell); cell=""; } else if (ch==="\n"||ch==="\r"){ if(ch==="\r"&&text[i+1]==="\n") i++; row.push(cell); rows.push(row); row=[]; cell=""; } else cell+=ch; }
  if (cell!==""||row.length){ row.push(cell); rows.push(row); }
  return rows.filter(r=>r.some(c=>String(c).trim()!==""));
}
const norm = s => String(s||"").toLowerCase().replace(/[^a-z0-9]/g,"");
const FIELDS = {
  customer:[["name","Company name",["company","companyname","name","business","businessname","customer","account","razonsocial","empresa"]],["status","Status (Lead / Active / Inactive)",["status"]],
    ["industry","Type of business",["industry","type","businesstype","category"]],["contactName","Main contact",["contact","contactname","maincontact","attn"]],["email","Email",["email","emailaddress","correo"]],
    ["phone","Phone",["phone","telephone","tel","phonenumber","telefono","whatsapp"]],["address","Address",["address","street","address1","direccion"]],["state","State / province",["state","province","region","estado"]],
    ["country","Country",["country","pais"]],["website","Website",["website","web","url","site"]],["terms","Payment terms",["terms","paymentterms"]],["creditLimit","Credit limit",["creditlimit","credit"]],
    ["divisions","Divisions (; between)",["divisions","division"]],["tags","Tags (; between)",["tags","tag","labels"]],["source","Source",["source","leadsource"]],["reorderDays","Reorders every (days)",["reorderdays","reorder"]],
    ["resaleCert","Resale certificate (yes/no)",["resalecert","resale","resalecertificate"]],["resaleExpiry","Certificate expires",["resaleexpiry","certexpires"]],["notes","Notes",["notes","note","comments"]]],
  contact:[["name","Full name",["name","fullname","contact","contactname","nombre"]],["firstName","First name",["firstname","first","givenname"]],["lastName","Last name",["lastname","last","surname","familyname","apellido"]],
    ["title","Job title",["title","jobtitle","position","role","cargo"]],["company","Company (matched by name)",["company","companyname","account","organization","empresa","business"]],
    ["email","Email",["email","emailaddress","correo","email1"]],["phone","Office phone",["phone","workphone","officephone","telephone","tel","phone1"]],["mobile","Mobile / WhatsApp",["mobile","cell","cellphone","whatsapp","celular","mobilephone"]],
    ["language","Prefers (English / Spanish / Portuguese)",["language","idioma"]],["tags","Tags (; between)",["tags","tag","labels","groups"]],["optOut","Opted out (yes/no)",["optout","unsubscribed","donotemail"]],["notes","Notes",["notes","note","comments"]]],
  lead:[["name","Contact name",["name","contact","contactname","fullname"]],["company","Company",["company","companyname","business"]],["email","Email",["email","emailaddress"]],["phone","Phone",["phone","whatsapp","mobile","tel"]],
    ["location","Location",["location","city","address","state","country"]],["division","Interested in",["division","interest","product","interestedin"]],["message","What they need",["message","needs","notes","comments"]],
    ["source","Source",["source"]],["status","Status",["status"]],["tags","Tags (; between)",["tags","tag"]]],
  product:[["name","Product",["name","product","productname","item","description"]],["sku","SKU",["sku","partnumber","code","itemcode"]],["division","Division",["division"]],["category","Category",["category"]],
    ["unit","Sold per",["unit","uom","soldper"]],["grade","Condition / grade",["grade","condition"]],["cost","Cost",["cost","unitcost"]],["price","Price",["price","unitprice","sellprice"]],["stock","On hand",["stock","onhand","qty","quantity"]],["active","Active (yes/no)",["active"]],["notes","Notes",["notes"]]],
};
const LABEL = { customer:"customers", contact:"contacts", lead:"leads", product:"products" };
function fieldsFor(type){
  const f=FIELDS[type].slice();
  if (type==="customer"||type==="contact") ((S.settings&&S.settings.customFields)||[]).filter(x=>x.entity===type).forEach(x=>f.push(["custom."+x.key,x.label+" (custom)",[norm(x.label),norm(x.key)]]));
  return f;
}
function template(type){ SNP.csv(`SNP ${LABEL[type]} import template.csv`, fieldsFor(type).filter(f=>f[0]!=="firstName"&&f[0]!=="lastName").map(f=>f[1].replace(/ \(.*\)$/,"")), []); }

function open(type){
  const body=el("div",{class:"stack"}), err=el("div",{class:"err",role:"alert"});
  const m=SNP.modal(`Import ${LABEL[type]}`, body, {size:"xl"});
  const step1=()=>{
    const file=el("input",{type:"file",accept:".csv,.txt,text/csv","aria-label":"Spreadsheet file"});
    const paste=el("textarea",{rows:6,placeholder:"…or paste rows copied from Excel or Google Sheets, with the header row first","aria-label":"Paste rows"});
    const next=el("button",{class:"btn primary",type:"button"},"Next: match columns");
    next.onclick=async()=>{ err.textContent=""; let text=paste.value;
      if (file.files[0]) { if(file.files[0].size>5e6) return err.textContent="That file is over 5 MB. Split it into smaller files."; text=await file.files[0].text(); }
      const rows=parseCSV(text); if(rows.length<2) return err.textContent="Choose a CSV file (in Excel: File → Save As → CSV) or paste rows including the header row.";
      if (rows.length>5001) return err.textContent="Import up to 5,000 rows at a time.";
      step2(rows[0].map(h=>String(h).trim()), rows.slice(1)); };
    body.replaceChildren(el("p",{},`Bring in ${LABEL[type]} from a spreadsheet. Save it as CSV first (Excel: File → Save As → CSV UTF-8). You'll match the columns next and nothing is saved until you press Import.`),
      el("div",{class:"row-actions"}, file, el("button",{class:"btn small ghost",type:"button",onclick:()=>template(type)},"Download a blank template")), paste, err, el("div",{class:"row-actions"},next));
  };
  const step2=(head, rows)=>{
    const defs=fieldsFor(type), used=new Set();
    const guess=h=>{ const n=norm(h); const f=defs.find(d=>!used.has(d[0])&&(norm(d[0])===n||d[2].includes(n))); if(f){ used.add(f[0]); return f[0]; } return ""; };
    const sels=head.map(h=>{ const s=el("select",{"aria-label":"Field for "+h}, el("option",{value:""},"Skip this column"), defs.map(d=>el("option",{value:d[0]},d[1]))); s.value=guess(h); return s; });
    const exists=SNP.selectEl([["skip","Skip rows that already exist"],["upsert","Update the existing record"]],"skip",()=>{},"Existing records");
    const matchOn=SNP.selectEl(type==="product"?[["name","Match on product name"]]:[["email","Match on email"],["name","Match on name"]],type==="product"?"name":"email",()=>{},"Match on");
    const createCo=type==="contact"?el("input",{type:"checkbox",id:"imp-co",checked:true}):null;
    const go=el("button",{class:"btn primary",type:"button"},`Import ${rows.length} row${rows.length===1?"":"s"}`);
    body.replaceChildren(el("p",{},`${rows.length} rows found. Check what each column is.`),
      el("div",{class:"tbl-wrap"}, el("table",{class:"list map-cols"}, el("thead",{}, el("tr",{}, el("th",{},"Column in your file"), el("th",{},"Example"), el("th",{},"Goes into"))),
        el("tbody",{}, head.map((h,i)=>el("tr",{}, el("td",{"data-label":"Column"}, el("strong",{},h||`Column ${i+1}`)), el("td",{"data-label":"Example",class:"muted small"}, rows.slice(0,3).map(r=>r[i]).filter(Boolean).join(" · ").slice(0,80)||"—"), el("td",{"data-label":"Goes into"}, sels[i])))))),
      SNP.toolbar(exists, matchOn, createCo?el("label",{class:"chk",for:"imp-co"}, createCo, "Create companies that aren't in Customers yet"):null), err,
      el("div",{class:"row-actions"}, go, el("button",{class:"btn ghost",type:"button",onclick:step1},"Back")));
    go.onclick=async()=>{ err.textContent="";
      const map=sels.map(s=>s.value);
      if (!map.includes("name")&&!(type==="contact"&&(map.includes("firstName")||map.includes("lastName")))) return err.textContent=type==="contact"?"Match a column to Full name (or First and Last name).":"Match a column to the name.";
      const data=rows.map(r=>{ const o={}; map.forEach((k,i)=>{ if(k&&String(r[i]||"").trim()!=="") o[k]=String(r[i]).trim(); });
        if (type==="contact"&&!o.name&&(o.firstName||o.lastName)) o.name=[o.firstName,o.lastName].filter(Boolean).join(" ");
        delete o.firstName; delete o.lastName;
        if (o.ownerId) delete o.ownerId; return o; });
      go.disabled=true; const tot={created:0,updated:0,skipped:0,companiesCreated:0,errors:[]};
      try{ for (let i=0;i<data.length;i+=200){ go.textContent=`Importing ${Math.min(i+200,data.length)} of ${data.length}…`;
          const r=await api("import",{method:"POST",body:{type,rows:data.slice(i,i+200),mode:exists.value,match:matchOn.value,createCompanies:createCo?createCo.checked:false}});
          ["created","updated","skipped","companiesCreated"].forEach(k=>tot[k]+=r[k]||0); r.errors.forEach(e=>tot.errors.push({row:e.row+i,message:e.message})); }
        await SNP.load(); step3(tot); }
      catch(e){ err.textContent=e.message; go.disabled=false; go.textContent="Try again"; } };
  };
  const step3=tot=>{
    body.replaceChildren(el("div",{class:"kpis"}, SNP.kpi(String(tot.created),"Added"), SNP.kpi(String(tot.updated),"Updated"), SNP.kpi(String(tot.skipped),"Skipped (already there)"),
        type==="contact"?SNP.kpi(String(tot.companiesCreated),"New companies"):null, SNP.kpi(String(tot.errors.length),"Rows with problems",tot.errors.length?"warn":"")),
      tot.errors.length?el("ul",{class:"attn"}, tot.errors.slice(0,30).map(e=>el("li",{class:"bad"}, el("span",{},`Row ${e.row+1}`), el("span",{class:"muted small"},e.message)))):null,
      el("div",{class:"row-actions"}, el("button",{class:"btn primary",type:"button",onclick:()=>{ SNP.closePanel(m); SNP.refresh(true); }},"Done")));
  };
  step1();
}

/* ---------- bulk actions ---------- */
const BULK = {
  customer:[["tag","Add tag"],["untag","Remove tag"],["ownerId","Change owner"],["status","Change status"],["industry","Set type of business"],["export","Export"],["delete","Delete"]],
  contact:[["tag","Add tag"],["untag","Remove tag"],["ownerId","Change owner"],["optOut","Opt out of marketing"],["optIn","Opt back in"],["export","Export"],["delete","Delete"]],
  lead:[["tag","Add tag"],["ownerId","Assign"],["status","Change status"],["delete","Delete"]],
};
function bar(type, ids, onDone, onClear){
  const run=async(action, payload)=>{ try{ const r=await api("bulk",{method:"POST",body:Object.assign({type,ids,action},payload)}); await SNP.load(); SNP.toast(`${r.done} updated${r.failed?`, ${r.failed} couldn't be`:""}.`); onDone&&onDone(); }catch(e){ SNP.fail(e); } };
  const ask=(title, input, go)=>{ const ok=el("button",{class:"btn primary",type:"button"},"Apply"); const m=SNP.modal(`${title} · ${ids.length} selected`, el("div",{class:"stack"}, input, el("div",{class:"row-actions"},ok)), {size:"sm"});
    ok.onclick=async()=>{ ok.disabled=true; await go(); SNP.closePanel(m); }; };
  const act=key=>{
    if (key==="tag"||key==="untag"){ const i=el("input",{type:"text",list:"dl-tags",placeholder:"Tag",autofocus:true,"aria-label":"Tag"}); ask(key==="tag"?"Add tag":"Remove tag", i, ()=>run(key,{tags:[i.value]})); }
    else if (key==="ownerId"){ const s=SNP.selectEl(SNP.peopleWithAccess().map(p=>[String(p.id),p.name]),String(S.me&&S.me.id),()=>{},"Owner"); ask("Change owner", s, ()=>run("update",{data:{ownerId:Number(s.value)}})); }
    else if (key==="status"){ const s=SNP.selectEl(type==="lead"?["New","Contacted","Qualified","Converted","Not a fit"]:["Lead","Active","Inactive"],type==="lead"?"Contacted":"Active",()=>{},"Status"); ask("Change status", s, ()=>run("update",{data:{status:s.value}})); }
    else if (key==="industry"){ const i=el("input",{type:"text",list:"dl-industry",placeholder:"Type of business"}); ask("Set type of business", el("div",{}, i, el("datalist",{id:"dl-industry"},((S.settings&&S.settings.industries)||[]).map(x=>el("option",{value:x})))), ()=>run("update",{data:{industry:i.value}})); }
    else if (key==="optOut"||key==="optIn") run("update",{data:{optOut:key==="optOut"}});
    else if (key==="export"){ const rows=ids.map(id=>item(type,id)).filter(Boolean);
      SNP.csv(`SNP ${LABEL[type]} selection ${today()}.csv`, type==="contact"?["Name","Title","Company","Email","Phone","Mobile","Tags"]:["Name","Status","Email","Phone","State","Country","Tags","Owner"],
        rows.map(r=>type==="contact"?[r.data.name,r.data.title,SNP.customerName(r.data.customerId),r.data.email,r.data.phone,r.data.mobile,(r.data.tags||[]).join("; ")]:[r.data.name,r.data.status,r.data.email,r.data.phone,r.data.state,r.data.country,(r.data.tags||[]).join("; "),nameOf(r.data.ownerId)])); }
    else if (key==="delete"){ const ok=el("button",{class:"btn danger",type:"button"},`Delete ${ids.length}`); const m=SNP.modal("Delete permanently?", el("div",{class:"stack"}, el("p",{},type==="customer"?"Their contacts and activity go too. Quotes, invoices and orders stay for the books.":"This can't be undone."), el("div",{class:"row-actions"},ok)), {size:"sm"});
      ok.onclick=async()=>{ ok.disabled=true; await run("delete",{}); SNP.closePanel(m); }; }
  };
  return el("div",{class:"bulk-bar",role:"region","aria-label":"Bulk actions"}, el("strong",{},`${ids.length} selected`),
    BULK[type].filter(([k])=>k!=="delete"||S.perms.deleteAny).map(([k,l])=>el("button",{class:"btn small"+(k==="delete"?" danger":""),type:"button",onclick:()=>act(k)},l)),
    el("button",{class:"btn small ghost",type:"button",onclick:onClear},"Clear"));
}

/* ---------- duplicates ---------- */
const coKey = s => String(s||"").toLowerCase().replace(/\b(llc|inc|corp|corporation|co|ltd|company|sa de cv|s\.a\.|sac|srl|the)\b/g,"").replace(/[^a-z0-9]/g,"");
function groups(type){
  const list=items(type), parent=new Map(list.map(x=>[x.id,x.id])), find=a=>{ while(parent.get(a)!==a) a=parent.get(a); return a; }, join=(a,b)=>parent.set(find(a),find(b));
  const idx=new Map(); const key=(k,id)=>{ if(!k||k.length<4) return; if(idx.has(k)) join(id,idx.get(k)); else idx.set(k,id); };
  list.forEach(x=>{ const d=x.data; key("n:"+(type==="customer"?coKey(d.name):String(d.name||"").toLowerCase().replace(/[^a-z]/g,"")+"|"+(d.customerId||"")),x.id);
    if (d.email) key("e:"+d.email.toLowerCase().trim(),x.id); const ph=String(d.phone||d.mobile||"").replace(/\D/g,"").slice(-10); if(ph.length>=10) key("p:"+ph,x.id); });
  const g=new Map(); list.forEach(x=>{ const r=find(x.id); if(!g.has(r)) g.set(r,[]); g.get(r).push(x); });
  return [...g.values()].filter(a=>a.length>1);
}
const linkedCount = (type,id) => { const f=type==="customer"?"customerId":"contactId"; return ["contact","interaction","deal","quote","invoice","oil_order","lead"].reduce((s,t)=>s+items(t).filter(x=>x.data[f]===id).length,0); };
function duplicates(type){
  const gs=groups(type);
  const body=el("div",{class:"stack"});
  const m=SNP.modal(`Possible duplicate ${LABEL[type]}`, body, {size:"xl"});
  const draw=()=>{ const g2=groups(type);
    body.replaceChildren(g2.length?el("p",{class:"muted small"},`${g2.length} group${g2.length===1?"":"s"} share a name, email or phone. Pick the record to keep; the others are merged into it (their contacts, activity, deals, quotes and invoices move over, and empty fields are filled in).`):el("div",{class:"empty"}, el("b",{},"No duplicates found"),"Nothing shares a name, email or phone."),
      ...g2.map(grp=>{ const keep=grp.slice().sort((a,b)=>linkedCount(type,b.id)-linkedCount(type,a.id)||a.id-b.id)[0]; const name="dup-"+grp[0].id;
        const radios=grp.map(x=>el("label",{class:"dup-opt"}, el("input",{type:"radio",name,value:String(x.id),checked:x.id===keep.id||null}),
          el("div",{}, el("strong",{},x.data.name), el("div",{class:"muted small"}, [x.data.email,x.data.phone||x.data.mobile,type==="contact"?SNP.customerName(x.data.customerId):[x.data.state,x.data.country].filter(Boolean).join(", "),`${linkedCount(type,x.id)} linked records`].filter(Boolean).join(" · ")))));
        const btn=el("button",{class:"btn small primary",type:"button"},"Merge into the selected one");
        btn.onclick=async()=>{ const k=Number(body.querySelector(`input[name="${name}"]:checked`).value); btn.disabled=true;
          try{ await api("merge",{method:"POST",body:{type,keepId:k,mergeIds:grp.map(x=>x.id).filter(id=>id!==k)}}); await SNP.load(); SNP.toast("Merged."); draw(); }catch(e){ SNP.fail(e); btn.disabled=false; } };
        return el("section",{class:"dup-group"}, radios, el("div",{class:"row-actions"},btn)); }));
  };
  draw();
}

/* ---------- customer portal access (customer page) ---------- */
function portalPanel(c){
  if (!SNP.can("customer","rw")) return null;
  const on=S.settings&&S.settings.portalEnabled!==false, users=(S.portalUsers||[]).filter(u=>u.customerId===c.id);
  const people=SNP.crm.contactsOf(c.id).filter(p=>p.data.email&&!users.some(u=>u.email.toLowerCase()===p.data.email.toLowerCase()));
  const box=el("section",{class:"panel"}, el("div",{class:"panel-h"}, el("h3",{},"Customer portal")));
  if (!on){ box.append(el("p",{class:"muted small"},"The customer portal is off. An owner can turn it on in Settings.")); return box; }
  box.append(el("p",{class:"muted small"},"Portal logins see only this company's quotes and invoices, download PDFs and accept quotes online at "+location.host+"/portal."));
  if (users.length) box.append(el("ul",{class:"attn"}, users.map(u=>el("li",{}, el("span",{}, el("strong",{},u.name), el("span",{class:"muted small"}," · "+u.email+(u.lastLogin?" · last visit "+SNP.fmtWhen(u.lastLogin):" · hasn't signed in yet"))),
    SNP.confirmBtn("Remove access","Remove portal access?",async()=>{ await api("portal/revoke",{method:"POST",body:{userId:u.id}}); await SNP.load(); SNP.toast("Access removed."); })))));
  const sel=SNP.selectEl([["","Choose a contact…"],...people.map(p=>[String(p.id),`${p.data.name} · ${p.data.email}`]),["__new","Someone else…"]],"",v=>{ other.hidden=v!=="__new"; },"Contact to invite");
  const nm=el("input",{type:"text",placeholder:"Name","aria-label":"Name"}), em=el("input",{type:"email",placeholder:"Email","aria-label":"Email"});
  const other=el("div",{class:"row-actions",hidden:true}, nm, em);
  const out=el("div");
  const inv=el("button",{class:"btn small primary",type:"button"},"Invite");
  inv.onclick=async()=>{ let name, email; if(sel.value==="__new"){ name=nm.value.trim(); email=em.value.trim(); } else { const p=item("contact",Number(sel.value)); if(!p) return SNP.toast("Choose who to invite."); name=p.data.name; email=p.data.email; }
    inv.disabled=true; try{ const r=await api("portal/invite",{method:"POST",body:{customerId:c.id,name,email}});
      await SNP.load(); SNP.toast(r.emailed?`Invitation emailed to ${email}.`:"Invite created.");
      if (!r.emailed&&r.link) { const lb=el("div",{class:"linkbox"}, el("div",{},"The email couldn't be sent from this site. Send them this link yourself (works for 24 hours):"), el("code",{},r.link), el("div",{}, el("button",{class:"btn small",type:"button",onclick:()=>SNP.copyText(r.link)},"Copy link")));
        const pc=document.querySelector(".portal-out"); if(pc) pc.replaceChildren(lb); } }
    catch(e){ SNP.fail(e); } finally{ inv.disabled=false; } };
  box.append(el("details",{class:"add-box"}, el("summary",{},users.length?"+ Invite someone else":"+ Invite to the portal"), el("div",{class:"stack"}, sel, other, el("div",{class:"row-actions"},inv))), el("div",{class:"portal-out"}));
  return box;
}

SNP.imports = { open, duplicates, parseCSV, groups };
SNP.bulk = { bar };
SNP.portalAdmin = { panel: portalPanel };
})();

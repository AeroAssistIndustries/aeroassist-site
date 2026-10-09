/* Staging stand-in for the WordPress API. Runs the real app against sample data kept in this browser.
   Mirrors the plugin's server rules (roles, scopes, notes visibility, cost hiding, validation, numbering, totals) closely enough to click through every screen. */
(() => {
"use strict";
const REST = "https://staging.invalid/snp/v1/";
const KEY = "snp-staging-v4", ROLE_KEY = "snp-staging-role", FILE_PREFIX = "snp-staging-file-";
const ROLES = { owner:{id:1,label:"Owner"}, sales:{id:5,label:"Sales"}, accountant:{id:3,label:"Accountant"}, attorney:{id:4,label:"Attorney"} };
let role = "owner"; try{ role = localStorage.getItem(ROLE_KEY) || "owner"; }catch(e){}
if (!ROLES[role]) role = "owner";

window.SNP_REC = { rest:REST, nonce:"staging", logout:"#staging-signout", account:"#staging-account", login:"#", home:"#", logo:"assets/logo.jpg" };

const now = () => new Date().toISOString().slice(0,19)+"Z";
const today = () => { const d=new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); };
const me = () => ROLES[role].id;
const DOCS3 = ["quote","invoice","po"];

/* ---------- schemas (same as includes/items.php) ---------- */
const DIVS=["Oil","Phones & electronics","Commercial supply"], DIVE=["",...DIVS];
const CURRENCIES=["USD","MXN","GTQ","HNL","CRC","DOP","COP","PEN","CLP","ARS","BRL","CAD","EUR"];
const SCHEMAS={
  customer:{name:["text!",160],status:["enum",["Lead","Active","Inactive"]],divisions:["multi",DIVS],contactName:["text",120],email:["text",160],phone:["text",60],address:["long",500],state:["text",60],country:["text",60],resaleCert:["bool"],resaleExpiry:["date"],terms:["enum",["Prepaid","Net 15","Net 30"]],creditLimit:["money"],ownerId:["int"],source:["text",120],notes:["long",20000],contacts:["contacts"]},
  interaction:{customerId:["int!"],date:["date"],kind:["enum",["Call","Email","Meeting","WhatsApp","Note"]],summary:["long!",5000]},
  deal:{title:["text!",200],customerId:["int"],division:["enum",DIVE],value:["money"],stage:["enum",["Lead","Contacted","Quoted","Negotiating","Won","Lost"]],expectedClose:["date"],ownerId:["int"],nextStep:["text",200],nextStepDate:["date"],lostReason:["text",200],notes:["long",10000]},
  quote:{number:["text",40],customerId:["int!"],date:["date"],validUntil:["date"],status:["enum",["Draft","Sent","Accepted","Declined","Expired"]],division:["enum",DIVE],lines:["lines"],shipping:["money"],taxRate:["num"],notes:["long",5000],internalNotes:["long",5000],dealId:["int"],invoiceId:["int"],currency:["enum",CURRENCIES],fxRate:["rate"],repId:["int"],emails:["emails"]},
  invoice:{number:["text",40],customerId:["int!"],date:["date"],dueDate:["date"],status:["enum",["Draft","Sent","Void"]],division:["enum",DIVE],lines:["lines"],shipping:["money"],taxRate:["num"],notes:["long",5000],internalNotes:["long",5000],payments:["payments"],quoteId:["int"],currency:["enum",CURRENCIES],fxRate:["rate"],repId:["int"],emails:["emails"]},
  oil_order:{date:["date!"],customerId:["int"],membership:["text",80],description:["text",240],amount:["money"],rewardAmount:["money"],rewardStatus:["enum",["Pending","Earned","Deposited","Cancelled"]],depositDate:["date"],notes:["long",5000]},
  oil_cost:{month:["month!"],description:["text!",200],amount:["money"]},
  payout:{month:["month!"],amount:["money"],paidDate:["date"],method:["text",60],reference:["text",120],notes:["long",2000]},
  supplier:{name:["text!",160],divisions:["multi",DIVS],contactName:["text",120],email:["text",160],phone:["text",60],address:["long",500],terms:["text",80],w9:["bool"],coi:["bool"],notes:["long",10000]},
  po:{number:["text",40],supplierId:["int!"],date:["date"],expectedDate:["date"],status:["enum",["Draft","Sent","Confirmed","Received","Paid","Cancelled"]],division:["enum",DIVE],lines:["lines"],shipping:["money"],taxRate:["num"],shipTo:["long",500],notes:["long",5000],internalNotes:["long",5000],invoiceId:["int"],emails:["emails"]},
  product:{name:["text!",200],sku:["text",60],division:["enum",DIVE],category:["text",80],unit:["text",40],grade:["text",40],cost:["money"],price:["money"],stock:["qty"],active:["bool"],notes:["long",5000]},
  lead:{name:["text!",160],company:["text",160],email:["text",160],phone:["text",60],location:["text",120],division:["text",120],message:["long",5000],details:["long",20000],
    source:["enum",["Website quote form","Website account form","Phone","WhatsApp","Email","Referral","Trade show","Other"]],status:["enum",["New","Contacted","Qualified","Converted","Not a fit"]],
    ownerId:["int"],customerId:["int"],sourceId:["int"],receivedAt:["text",30],nextStepDate:["date"]},
  note:{title:["text",120],body:["long!",10000],color:["enum",["yellow","blue","green","pink","grey"]],visibility:["enum",["private","team","owners"]],pinned:["bool"]},
  task:{title:["text!",200],assigneeId:["int"],due:["date"],status:["enum",["Open","Done"]],priority:["enum",["Normal","High"]],relatedType:["text",30],relatedId:["int"],relatedLabel:["text",200],notes:["long",5000],doneAt:["text",30]},
};
const LABELS={customer:"customer",interaction:"customer note",deal:"deal",quote:"quote",invoice:"invoice",oil_order:"oil order",oil_cost:"program cost",payout:"partner payout",supplier:"supplier",po:"purchase order",task:"task",product:"product",lead:"lead",note:"note"};
const FIELD_LABEL={name:"the name",title:"the title",customerId:"the customer",supplierId:"the supplier",summary:"what happened",date:"the date",month:"the month",description:"the description",body:"the note"};
const money = v => { const n=Number(String(v??0).replace(/[^0-9.\-]/g,"")); return Math.round((isFinite(n)?n:0)*100)/100; };
const r2 = n => Math.round(n*100)/100;
const txt = (v,max) => String(v??"").replace(/[\u0000-\u0008\u000b-\u001f]/g,"").slice(0,max);
function cleanVal(kind,arg,v){
  switch(kind){
    case "text": return txt(v,arg).replace(/\s+/g," ").trim();
    case "long": return txt(v,arg);
    case "money": return money(v);
    case "num": { const n=Number(v); return Math.round(Math.max(0,Math.min(100,isFinite(n)?n:0))*1000)/1000; }
    case "rate": { const n=Number(v); return Math.round(Math.max(0,Math.min(1e7,isFinite(n)?n:0))*1e6)/1e6; }
    case "qty": { const n=Number(v); return Math.round(Math.max(-1e9,Math.min(1e9,isFinite(n)?n:0))*1000)/1000; }
    case "int": return Math.max(0, parseInt(v,10)||0);
    case "bool": return !!v && v!=="false";
    case "date": return /^\d{4}-\d{2}-\d{2}$/.test(v||"")?v:"";
    case "month": return /^\d{4}-\d{2}$/.test(v||"")?v:"";
    case "enum": return arg.includes(v)?v:arg[0];
    case "multi": return arg.filter(x=>(Array.isArray(v)?v:[]).includes(x));
    case "contacts": return (Array.isArray(v)?v:[]).slice(0,50).map(c=>({name:txt(c.name,120),title:txt(c.title,120),email:txt(c.email,160),phone:txt(c.phone,60)})).filter(c=>c.name+c.title+c.email+c.phone);
    case "lines": return (Array.isArray(v)?v:[]).slice(0,300).map(l=>({desc:txt(l.desc,500),grade:txt(l.grade,40),qty:Math.round((Number(l.qty)||0)*1000)/1000,price:money(l.price),cost:money(l.cost),productId:Math.max(0,parseInt(l.productId,10)||0)})).filter(l=>l.desc||l.qty||l.price);
    case "emails": return (Array.isArray(v)?v:[]).slice(-100).map(e=>({at:txt(e.at,30),to:txt(e.to,400),kind:txt(e.kind,20),by:Math.max(0,parseInt(e.by,10)||0)}));
    case "payments": return (Array.isArray(v)?v:[]).slice(0,200).map(p=>({date:cleanVal("date",null,p.date),amount:money(p.amount),method:txt(p.method,60),ref:txt(p.ref,120)})).filter(p=>p.amount);
  }
  return null;
}
function cleanItem(type,data){
  const out={};
  for (const [k,[spec,arg]] of Object.entries(SCHEMAS[type])){
    const req=spec.endsWith("!"), kind=spec.replace("!","");
    const v=cleanVal(kind,arg,data[k]);
    if (req && (v===""||v===0||v==null)) throw {status:400, code:"snp_required", message:"Fill in "+(FIELD_LABEL[k]||k)+"."};
    out[k]=v;
  }
  if (DOCS3.includes(type)){
    const sub=r2(out.lines.reduce((s,l)=>s+r2(l.qty*l.price),0)), cost=r2(out.lines.reduce((s,l)=>s+r2(l.qty*(l.cost||0)),0));
    if (type!=="po"){ out.costTotal=cost; out.profit=r2(sub-cost); out.margin=sub>0?Math.round((sub-cost)/sub*1000)/10:0; }
    const tax=r2(sub*out.taxRate/100);
    out.subtotal=sub; out.tax=tax; out.total=r2(sub+tax+out.shipping);
    if (type==="invoice"){ out.paid=r2(out.payments.reduce((s,p)=>s+p.amount,0)); out.balance=out.status==="Void"?0:r2(out.total-out.paid); }
  }
  return out;
}

/* ---------- store ---------- */
let DB;
function fresh(){
  const d=JSON.parse(JSON.stringify(window.SNP_STAGING_SEED()));
  const count={};
  d.items.slice().sort((x,y)=>(x.data.date||"").localeCompare(y.data.date||"")).forEach(it=>{
    if (!DOCS3.includes(it.type)) return;
    it.data=cleanItem(it.type,it.data);
    const year=it.data.date.slice(0,4), k=it.type+year; count[k]=(count[k]||0)+1;
    it.data.number=`${{quote:"SNP-Q",invoice:"SNP-INV",po:"SNP-PO"}[it.type]}-${year}-${String(count[k]).padStart(4,"0")}`;
  });
  d.items.forEach(it=>{ if(!DOCS3.includes(it.type)) it.data=cleanItem(it.type,it.data); });
  return d;
}
function load(){ try{ const raw=localStorage.getItem(KEY); DB = raw ? JSON.parse(raw) : fresh(); }catch(e){ DB=fresh(); } if(DB.v!==4) DB=fresh(); }
function save(){ try{ localStorage.setItem(KEY, JSON.stringify(DB)); }catch(e){ console.warn("Staging data could not be saved in this browser."); } }
function log(action, detail){ DB.activity.unshift({at:now(),by:me(),docId:0,action,detail}); DB.activity=DB.activity.slice(0,200); }
load();

/* ---------- access (same rules as includes/common.php, items.php and api.php) ---------- */
const CAT_SCOPES = { accountant:["tax","finance"], attorney:["company","sales","supply","partners","product","export","web"] };
const scopeNames = () => DB.scopeNames || {accountant:"Accountant",attorney:"Attorney"};
const scopeLabel = r => r==="accountant" ? `tax & licensing, banking & finance, and anything assigned to ${scopeNames().accountant}`
  : `company, contracts, suppliers, partners, compliance, export and website policies, and anything assigned to ${scopeNames().attorney}`;
const canSeeDoc = d => role==="owner" || (CAT_SCOPES[role] && (CAT_SCOPES[role].includes(d.cat) || d.assignee===scopeNames()[role]));
function access(type){
  if (type==="note") return "notes";
  if (role==="owner") return "rw";
  if (type==="task") return "mine";
  if (role==="sales"){ if(["customer","interaction","deal","quote","invoice","lead"].includes(type)) return "rw"; if(type==="product") return "r"; }
  if (role==="accountant"){ if(["invoice","oil_order","oil_cost","payout"].includes(type)) return "r"; if(type==="customer") return "names"; }
  return "";
}
const canSeeNote = it => { const v=it.data.visibility||"private"; return v==="team" || (v==="owners"?role==="owner":it.createdBy===me()); };
const perms = () => ({ records:role!=="sales", editDocs:role!=="sales", editDetails:role==="owner", addDocs:role==="owner", deleteDocs:role==="owner", uploadFiles:role!=="sales",
  editTemplates:["owner","attorney"].includes(role), managePeople:role==="owner", seeActivity:role==="owner",
  reports:["owner","accountant"].includes(role), seeCosts:["owner","accountant"].includes(role), sendEmail:["owner","sales"].includes(role), deleteAny:role==="owner" });
function stripCosts(type,data){
  if (role!=="sales") return data;
  const d=JSON.parse(JSON.stringify(data));
  if (type==="product") delete d.cost;
  if (type==="quote"||type==="invoice"){ delete d.costTotal; delete d.profit; delete d.margin; (d.lines||[]).forEach(l=>delete l.cost); }
  return d;
}
const forRole = it => ({...it, data:stripCosts(it.type,it.data)});
function fillCosts(lines, oldLines){
  return lines.map(l=>{ let cost=null;
    if (l.productId){ const p=DB.items.find(x=>x.id===l.productId&&x.type==="product"); if(p) cost=p.data.cost||0; }
    if (cost===null){ const o=(oldLines||[]).find(o=>o.desc===l.desc&&o.grade===l.grade); if(o) cost=o.cost||0; }
    return {...l, cost:cost===null?0:cost}; });
}
function defaultRep(customerId){ const c=DB.items.find(x=>x.id===customerId&&x.type==="customer"); return (c&&c.data.ownerId)||me(); }
function settingsFor(){
  const s=DB.settings;
  if (["owner","accountant"].includes(role)) return s;
  const keep=["companyName","companyAddress","companyPhone","companyEmail","companyWebsite","quoteValidDays","invoiceDueDays","taxRate","paymentInfo","documentFooter","hoursOpen","hoursClose","workdays","reminders"];
  const out={}; keep.forEach(k=>out[k]=s[k]);
  const t=s.targets||{}; out.targets=t[me()]?{[me()]:t[me()]}:{};
  return out;
}
function nextNumber(type,date){
  const prefix={quote:"SNP-Q",invoice:"SNP-INV",po:"SNP-PO"}[type], year=(date||today()).slice(0,4);
  let max=0; DB.items.filter(i=>i.type===type).forEach(i=>{ const m=(i.data.number||"").match(new RegExp("-"+year+"-(\\d+)$")); if(m) max=Math.max(max,+m[1]); });
  return `${prefix}-${year}-${String(max+1).padStart(4,"0")}`;
}
const itemLabel = d => d.number||d.name||d.title||d.description||d.month||d.date||(d.body?String(d.body).slice(0,40):"");

/* ---------- handlers ---------- */
function err(status,code,message){ return {status,code,message}; }
function state(){
  const docs=DB.docs.filter(canSeeDoc).map(d=>({...d,files:DB.files.filter(f=>f.docId===d.id).map(f=>({id:f.id,name:f.name,mime:f.mime,size:f.size,by:f.by,at:f.at}))}));
  const items={}; Object.keys(SCHEMAS).forEach(t=>items[t]=[]);
  DB.items.forEach(i=>{ const m=access(i.type); if(!m) return; if(m==="mine"&&i.data.assigneeId!==me()) return; if(m==="notes"&&!canSeeNote(i)) return;
    items[i.type].push(m==="names"?{...i,data:{name:i.data.name,state:i.data.state}}:forRole(i)); });
  const accessMap={}; Object.keys(SCHEMAS).forEach(t=>accessMap[t]=access(t));
  const names={}; DB.people.forEach(p=>names[p.id]=p.name);
  const meP=DB.people.find(p=>p.id===me());
  const people = role==="owner" ? DB.people.map(p=>({...p,isMe:p.id===me()}))
    : role==="sales" ? DB.people.map(p=>({id:p.id,name:p.name,role:p.role,label:p.label,isMe:p.id===me()})) : [];
  return { me:{id:me(),name:meP.name,role,roleLabel:ROLES[role].label}, perms:perms(), scope:CAT_SCOPES[role]?scopeLabel(role):"",
    scopes:{accountant:scopeLabel("accountant"),attorney:scopeLabel("attorney")}, scopeNames:role==="owner"?scopeNames():null,
    cats:DB.cats, statuses:["Not checked","Missing","In progress","Needs review","On file","Not needed"], assignees:DB.assignees,
    docs, templates:DB.templates, people, activity:role==="owner"?DB.activity:[],
    names, items, access:accessMap, settings:settingsFor(), today:today(), maxUpload:1500000 };
}
function cleanSettings(body){
  const s=DB.settings;
  const text={companyName:160,companyAddress:400,companyPhone:60,companyEmail:160,companyWebsite:160,paymentInfo:2000,documentFooter:1000,partnerName:80,programName:60};
  Object.entries(text).forEach(([k,max])=>{ if(k in body) s[k]=txt(body[k],max); });
  ["quoteValidDays","invoiceDueDays"].forEach(k=>{ if(k in body) s[k]=Math.max(0,Math.min(365,parseInt(body[k],10)||0)); });
  ["taxRate","partnerShare"].forEach(k=>{ if(k in body) s[k]=Math.round(Math.max(0,Math.min(100,Number(body[k])||0))*1000)/1000; });
  ["costsBeforeSplit","reminders"].forEach(k=>{ if(k in body) s[k]=!!body[k]; });
  ["hoursOpen","hoursClose"].forEach(k=>{ if(k in body&&/^([01]\d|2[0-3]):[0-5]\d$/.test(body[k])) s[k]=body[k]; });
  if (Array.isArray(body.workdays)) s.workdays=[...new Set(body.workdays.map(Number).filter(d=>d>=0&&d<=6))];
  if (body.targets&&typeof body.targets==="object"){ const t={}; Object.entries(body.targets).forEach(([u,a])=>{ if(+u>0&&money(a)>0) t[String(+u)]=money(a); }); s.targets=t; }
  if (Array.isArray(body.memberships)) s.memberships=[...new Set(body.memberships.map(x=>txt(x,80).trim()).filter(Boolean))].slice(0,50);
  return s;
}
async function route(method, path, body){
  const seg=path.split("?")[0].split("/").filter(Boolean);
  const [a,b,c]=seg;
  if (a==="state" && method==="GET") return state();

  if (a==="docs"){
    if (role==="sales") throw err(403,"rest_forbidden","Company records are for owners, the accountant and the attorney.");
    if (!b && method==="POST"){ if(role!=="owner") throw err(403,"rest_forbidden","Only owners can add documents.");
      if(!(body.title||"").trim()) throw err(400,"snp_title","Give the document a name.");
      const cat=DB.cats.find(x=>x.key===body.cat); if(!cat) throw err(400,"snp_cat","Choose a category.");
      const n=Math.max(0,...DB.docs.filter(d=>d.cat===cat.key).map(d=>+d.code.split("-")[1]||0))+1;
      const d={id:DB.seq++,code:`${cat.prefix}-${String(n).padStart(2,"0")}`,cat:cat.key,order:100+n,title:txt(body.title,255).trim(),why:txt(body.why,5000),priority:body.priority||"Important",division:body.division||"All divisions",status:"Missing",assignee:"",renews:"",notes:"",due:"",template:"",updatedAt:now(),updatedBy:me()};
      DB.docs.push(d); log("added",d.code+" "+d.title); save(); return {...d,files:[]}; }
    const d=DB.docs.find(x=>x.id===+b);
    if (!d || !canSeeDoc(d)) throw err(404,"snp_not_found","That document no longer exists.");
    if (c==="files" && method==="POST"){
      const f=body.get("file"); if(!f) throw err(400,"snp_no_file","No file arrived. Try uploading again.");
      if (f.size>1500000) throw err(400,"snp_too_large","Staging keeps files in your browser, so it takes files up to 1.5 MB. The real system takes much larger files.");
      const dataUrl=await new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(f); });
      const id=DB.seq++; try{ localStorage.setItem(FILE_PREFIX+id,dataUrl); }catch(e){ throw err(400,"snp_quota","This browser's staging storage is full. Delete a few staging files or reset the staging data."); }
      DB.files.push({id,docId:d.id,name:f.name,mime:f.type||"application/octet-stream",size:f.size,by:me(),at:now()});
      d.updatedAt=now(); d.updatedBy=me(); log("uploaded",`${d.code} ${d.title}: ${f.name}`); save(); return state().docs.find(x=>x.id===d.id);
    }
    if (method==="DELETE"){ if(role!=="owner") throw err(403,"rest_forbidden","Only owners can delete documents.");
      DB.files.filter(f=>f.docId===d.id).forEach(f=>{ try{localStorage.removeItem(FILE_PREFIX+f.id);}catch(e){} });
      DB.files=DB.files.filter(f=>f.docId!==d.id); DB.docs=DB.docs.filter(x=>x!==d); log("deleted",d.code+" "+d.title); save(); return {deleted:true}; }
    const allowed=role==="owner"?["title","why","priority","division","status","assignee","renews","notes","due","cat"]:["status","notes","due"];
    const changes={}; allowed.forEach(k=>{ if(k in body && body[k]!==d[k]) changes[k]=k==="notes"||k==="why"?txt(body[k],20000):txt(body[k],255); });
    if (Object.keys(changes).length){ Object.assign(d,changes,{updatedAt:now(),updatedBy:me()});
      if(changes.status) log("status",`${d.code} ${d.title}: → ${changes.status}`); else if("notes" in changes) log("notes",`${d.code} ${d.title}`); else log("edited",`${d.code} ${d.title}`); save(); }
    return state().docs.find(x=>x.id===d.id);
  }
  if (a==="files"){
    const f=DB.files.find(x=>x.id===+b); const d=f&&DB.docs.find(x=>x.id===f.docId);
    if (!f||!d||!canSeeDoc(d)) throw err(404,"snp_not_found","That file no longer exists.");
    if (method==="DELETE"){ if(role!=="owner"&&f.by!==me()) throw err(403,"snp_forbidden","Only owners can delete files someone else uploaded.");
      try{localStorage.removeItem(FILE_PREFIX+f.id);}catch(e){} DB.files=DB.files.filter(x=>x!==f); log("file deleted",`${d.code} ${d.title}: ${f.name}`); save(); return state().docs.find(x=>x.id===d.id); }
  }
  if (a==="templates" && b){
    if (!["owner","attorney"].includes(role)) throw err(403,"snp_forbidden","Only owners and the attorney can edit templates.");
    const t=DB.templates.find(x=>x.key===b); if(!t) throw err(404,"snp_not_found","That template no longer exists.");
    if (!(body.body||"").trim()) throw err(400,"snp_empty","The template is empty. Add its text before saving.");
    t.body=txt(body.body,200000); t.version="Edited"; t.updatedAt=now(); t.updatedBy=me(); log("template",t.name); save(); return {saved:true,updatedAt:t.updatedAt};
  }
  if (a==="people"){
    if (role!=="owner") throw err(403,"rest_forbidden","Only owners can manage people.");
    const labels={snp_owner:"Owner",snp_sales:"Sales",snp_accountant:"Accountant",snp_attorney:"Attorney"};
    if (!b){ if(!(body.name||"").trim()) throw err(400,"snp_name","Enter the person's name."); if(!/^\S+@\S+\.\S+$/.test(body.email||"")) throw err(400,"snp_email","Enter a valid email address.");
      if(!labels[body.role]) throw err(400,"snp_role","Choose Owner, Sales, Accountant or Attorney.");
      const p={id:DB.seq++,name:txt(body.name,100).trim(),email:body.email,role:body.role.replace("snp_",""),snpRole:body.role,label:labels[body.role],isAdmin:false};
      DB.people.push(p); log("access",`${p.name} added as ${p.label}`); save();
      return {person:p,existing:false,emailed:false,link:"https://www.snpwholesale.com/wp-login.php?action=rp (staging: no email is sent; the real system emails a setup link)"}; }
    const p=DB.people.find(x=>x.id===+b); if(!p) throw err(404,"snp_not_found","That person no longer exists.");
    if (p.isAdmin) throw err(400,"snp_admin","Site administrators always have full access.");
    if (body.resend) return {person:p,emailed:false,link:"https://www.snpwholesale.com/wp-login.php?action=rp (staging: no email is sent)"};
    if (p.id===me()) throw err(400,"snp_self","You can't change your own access. Ask another owner.");
    if (body.role==="none"){ p.role=null; p.snpRole=""; p.label=""; log("access",p.name+" removed"); }
    else if (labels[body.role]){ p.role=body.role.replace("snp_",""); p.snpRole=body.role; p.label=labels[body.role]; log("access",`${p.name} changed to ${p.label}`); }
    save(); return {person:p};
  }
  if (a==="settings" && method==="POST"){ if(role!=="owner") throw err(403,"rest_forbidden","Only owners can change this.");
    if (body.scopeNames&&typeof body.scopeNames==="object"){ const cur=scopeNames(); ["accountant","attorney"].forEach(k=>{ const v=txt(body.scopeNames[k],80).trim(); if(v) cur[k]=v; }); DB.scopeNames=cur; log("settings","Record-sharing names updated"); }
    if (Array.isArray(body.assignees)){ const list=[...new Set(body.assignees.map(x=>txt(x,80).trim()).filter(Boolean))]; if(!list.length) throw err(400,"snp_assignees","Keep at least one name in the list.");
      DB.assignees=list.slice(0,30); log("settings","Assignee list updated"); }
    save(); return {assignees:DB.assignees, scopeNames:scopeNames()}; }
  if (a==="app-settings" && method==="POST"){ if(role!=="owner") throw err(403,"rest_forbidden","Only owners can change settings.");
    const s=cleanSettings(body); log("settings","Company settings updated"); save(); return s; }

  if (a==="send" && method==="POST"){
    if (!perms().sendEmail) throw err(403,"rest_forbidden","Only owners and sales can email documents.");
    const it=DB.items.find(x=>x.id===+body.itemId);
    if (!it||!DOCS3.includes(it.type)||access(it.type)!=="rw") throw err(404,"snp_not_found","That document no longer exists.");
    const list=s=>String(s||"").split(/[,;\s]+/).map(x=>x.trim()).filter(Boolean);
    const to=list(body.to), cc=list(body.cc);
    if (!to.length) throw err(400,"snp_to","Add at least one email address in To.");
    for (const e of [...to,...cc]) if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw err(400,"snp_email",`"${e}" isn't a valid email address.`);
    if (to.length>5||cc.length>5) throw err(400,"snp_to","Send to at most 5 addresses in To and 5 in Cc.");
    if (!txt(body.subject,200).trim()) throw err(400,"snp_subject","Add a subject.");
    if (!String(body.pdf||"").startsWith("JVBER")) throw err(400,"snp_pdf","The PDF didn't come through. Try again.");
    const kind=body.kind==="reminder"?"reminder":"document";
    const d=it.data; d.emails=[...(d.emails||[]),{at:now(),to:to.join(", "),kind,by:me()}];
    if (d.status==="Draft") d.status="Sent";
    Object.assign(it,{updatedAt:now(),updatedBy:me()});
    if (d.customerId){ const what=kind==="reminder"?`a payment reminder for ${d.number}`:`${{quote:"quote",invoice:"invoice",po:"purchase order"}[it.type]} ${d.number} (PDF)`;
      DB.items.push({id:DB.seq++,type:"interaction",data:cleanItem("interaction",{customerId:d.customerId,date:today(),kind:"Email",summary:`Emailed ${what} to ${to.join(", ")}.`}),createdAt:now(),createdBy:me(),updatedAt:now(),updatedBy:me()}); }
    log(kind==="reminder"?"emailed reminder":"emailed "+LABELS[it.type], `${d.number} to ${to.join(", ")}`); save();
    return {sent:true, item:forRole(it), note:`Staging: logged as sent to ${to.join(", ")}. No email actually goes out from staging.`};
  }

  if (a==="items"){
    if (!b && method==="POST"){
      const type=body.type; if(!SCHEMAS[type]) throw err(400,"snp_type","Unknown record type.");
      const mode=access(type); const input={...(body.data||{})};
      if (mode==="mine") input.assigneeId=me();
      else if (mode!=="notes"&&mode!=="rw") throw err(403,"snp_forbidden","You don't have access to add this.");
      if (type==="note"&&input.visibility==="owners"&&role!=="owner") input.visibility="team";
      if (role==="sales"&&(type==="quote"||type==="invoice")) input.lines=fillCosts(cleanVal("lines",null,input.lines),[]);
      if (DOCS3.includes(type)) input.emails=[];
      if ((type==="quote"||type==="invoice")&&!input.repId) input.repId=defaultRep(+input.customerId||0);
      const data=cleanItem(type,input);
      if (DOCS3.includes(type)){ if(!data.date) data.date=today(); data.number=nextNumber(type,data.date); }
      if (type==="task"&&data.status==="Done"&&!data.doneAt) data.doneAt=now();
      const it={id:DB.seq++,type,data,createdAt:now(),createdBy:me(),updatedAt:now(),updatedBy:me()};
      DB.items.push(it); log("added "+LABELS[type],itemLabel(data)); save(); return forRole(it);
    }
    const it=DB.items.find(x=>x.id===+b);
    if (!it) { if(method==="DELETE") return {deleted:true}; throw err(404,"snp_not_found","That record no longer exists."); }
    const mode=access(it.type);
    if (method==="DELETE"){
      if (it.type==="note"){ if(!canSeeNote(it)||(it.createdBy!==me()&&role!=="owner")) throw err(403,"snp_forbidden","Only the person who wrote this note can delete it."); }
      else if (role!=="owner") throw err(403,"snp_forbidden","Only owners can delete this.");
      DB.items=DB.items.filter(x=>x!==it); if(it.type==="customer") DB.items=DB.items.filter(x=>!(x.type==="interaction"&&x.data.customerId===it.id));
      log("deleted "+LABELS[it.type],itemLabel(it.data)); save(); return {deleted:true}; }
    let input={...(body.data||{})};
    if (mode==="mine"){ if(it.data.assigneeId!==me()) throw err(404,"snp_not_found","That record no longer exists.");
      const keys=it.createdBy===me()?["title","due","priority","status","notes"]:["status","notes"]; const o={}; keys.forEach(k=>{ if(k in input) o[k]=input[k]; }); input=o; }
    else if (mode==="notes"){ if(!canSeeNote(it)) throw err(404,"snp_not_found","That note no longer exists.");
      if (it.createdBy!==me()&&role!=="owner") throw err(403,"snp_forbidden","Only the person who wrote this note can change it.");
      if (input.visibility==="owners"&&role!=="owner") delete input.visibility; }
    else if (mode!=="rw") throw err(403,"snp_forbidden","You can view this but not change it.");
    delete input.emails;
    const merged={...it.data,...input}; if(it.data.number) merged.number=it.data.number;
    if (role==="sales"&&(it.type==="quote"||it.type==="invoice")&&"lines" in input) merged.lines=fillCosts(cleanVal("lines",null,input.lines),it.data.lines||[]);
    const data=cleanItem(it.type,merged);
    if (it.type==="task"){ if(data.status==="Done"&&it.data.status!=="Done") data.doneAt=now(); else if(data.status==="Open") data.doneAt=""; }
    const what=[]; ["status","stage","rewardStatus"].forEach(k=>{ if(k in input&&it.data[k]!==undefined&&data[k]!==it.data[k]) what.push(`${it.data[k]} → ${data[k]}`); });
    if (it.type==="invoice"&&data.payments.length>(it.data.payments||[]).length) what.push("payment recorded");
    Object.assign(it,{data,updatedAt:now(),updatedBy:me()});
    log("updated "+LABELS[it.type],itemLabel(data)+(what.length?": "+what.join(", "):"")); save(); return forRole(it);
  }
  throw err(404,"rest_no_route","Not available in staging.");
}

/* ---------- fetch interception ---------- */
const realFetch=window.fetch.bind(window);
window.fetch=async(input,opts={})=>{
  const u=typeof input==="string"?input:input.url;
  if (!u.startsWith(REST)) return realFetch(input,opts);
  const method=(opts.method||"GET").toUpperCase();
  let body={}; if (opts.body instanceof FormData) body=opts.body; else if (opts.body){ try{ body=JSON.parse(opts.body); }catch(e){} }
  await new Promise(r=>setTimeout(r,120));
  try{ const out=await route(method,u.slice(REST.length),body); return new Response(JSON.stringify(out),{status:200,headers:{"Content-Type":"application/json"}}); }
  catch(e){ const st=e&&e.status||500; if(!e||!e.status) console.error(e); return new Response(JSON.stringify({code:e.code||"error",message:e.message||String(e),data:{status:st}}),{status:st,headers:{"Content-Type":"application/json"}}); }
};

/* ---------- file links, sign-out link, staging bar ---------- */
function dataUrlToBlob(u){ const [h,b]=u.split(","); const mime=(h.match(/data:([^;]+)/)||[])[1]||"application/octet-stream"; const bin=atob(b); const arr=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) arr[i]=bin.charCodeAt(i); return new Blob([arr],{type:mime}); }
const note = msg => { const t=document.getElementById("toast"); if(t){ t.textContent=msg; t.hidden=false; setTimeout(()=>t.hidden=true,4000); } };
document.addEventListener("click",e=>{
  const a=e.target.closest("a"); if(!a) return;
  const href=a.getAttribute("href")||"";
  if (href.startsWith(REST+"files/")){
    e.preventDefault();
    const id=+href.slice((REST+"files/").length).split("?")[0], f=DB.files.find(x=>x.id===id); let data=null; try{ data=localStorage.getItem(FILE_PREFIX+id); }catch(err){}
    if (!f||!data){ note("That staging file is no longer in this browser."); return; }
    const url=URL.createObjectURL(dataUrlToBlob(data));
    if (href.includes("download=1")){ const d=document.createElement("a"); d.href=url; d.download=f.name; document.body.append(d); d.click(); d.remove(); }
    else window.open(url,"_blank");
    setTimeout(()=>URL.revokeObjectURL(url),60000);
  } else if (href==="#staging-signout"||href==="#staging-account"){
    e.preventDefault(); note("Signing in and out is turned off in staging. Switch roles with the bar at the top.");
  }
}, true);

function bar(){
  const b=document.createElement("div"); b.className="staging-bar";
  b.innerHTML=`<strong>STAGING</strong><span class="sb-text">Sample data only, saved in this browser. Nothing here touches snpwholesale.com.</span>
<label class="sb-role">Viewing as <select id="sb-role"><option value="owner">Owner</option><option value="sales">Sales</option><option value="accountant">Accountant</option><option value="attorney">Attorney</option></select></label>
<button type="button" id="sb-reset">Reset sample data</button>`;
  document.body.prepend(b);
  const s=b.querySelector("#sb-role"); s.value=role;
  s.onchange=()=>{ try{ localStorage.setItem(ROLE_KEY,s.value); }catch(e){} location.hash="home"; location.reload(); };
  const r=b.querySelector("#sb-reset");
  r.onclick=()=>{ if(r.dataset.armed){ try{ Object.keys(localStorage).filter(k=>k.startsWith(FILE_PREFIX)).forEach(k=>localStorage.removeItem(k)); localStorage.removeItem(KEY); }catch(e){} location.hash="home"; location.reload(); }
    else { r.dataset.armed="1"; r.textContent="Click again to reset"; setTimeout(()=>{ delete r.dataset.armed; r.textContent="Reset sample data"; },4000); } };
}
if (document.readyState==="loading") document.addEventListener("DOMContentLoaded",bar); else bar();
})();

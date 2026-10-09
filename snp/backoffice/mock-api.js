/* Staging stand-in for the WordPress API. Runs the real app against sample data kept in this browser.
   Mirrors the plugin's server rules (roles, scopes, notes visibility, cost hiding, validation, numbering, totals) closely enough to click through every screen. */
(() => {
"use strict";
const REST = "https://staging.invalid/snp/v1/";
const KEY = "snp-staging-v5", ROLE_KEY = "snp-staging-role", FILE_PREFIX = "snp-staging-file-";
const ROLES = { owner:{id:1,label:"Owner"}, sales:{id:5,label:"Sales"}, accountant:{id:3,label:"Accountant"}, attorney:{id:4,label:"Attorney"}, customer:{id:7,label:"Customer"} };
const PORTAL = !!window.SNP_STAGING_PORTAL;
let role = "owner"; try{ role = localStorage.getItem(ROLE_KEY) || "owner"; }catch(e){}
if (!ROLES[role]||role==="customer") role = "owner";
if (PORTAL) role = "customer";

window.SNP_REC = { rest:REST, statePath:PORTAL?"portal/state":"state", portal:PORTAL, nonce:"staging", logout:"#staging-signout", account:"#staging-account", login:"#", home:"#", logo:"assets/logo.jpg" };

const now = () => new Date().toISOString().slice(0,19)+"Z";
const today = () => { const d=new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); };
const me = () => ROLES[role].id;
const DOCS3 = ["quote","invoice","po"];

/* ---------- schemas (same as includes/items.php) ---------- */
const DIVS=["Oil","Phones & electronics","Commercial supply"], DIVE=["",...DIVS];
const CURRENCIES=["USD","MXN","GTQ","HNL","CRC","DOP","COP","PEN","CLP","ARS","BRL","CAD","EUR"];
const SCHEMAS={
  customer:{name:["text!",160],status:["enum",["Lead","Active","Inactive"]],divisions:["multi",DIVS],contactName:["text",120],email:["text",160],phone:["text",60],address:["long",500],state:["text",60],country:["text",60],resaleCert:["bool"],resaleExpiry:["date"],terms:["enum",["Prepaid","Net 15","Net 30"]],creditLimit:["money"],ownerId:["int"],source:["text",120],notes:["long",20000],contacts:["contacts"],
    tags:["tags"],custom:["custom"],website:["text",200],industry:["text",80],lat:["coord"],lng:["coord"],reorderDays:["int"]},
  contact:{name:["text!",160],title:["text",120],customerId:["int"],email:["text",160],phone:["text",60],mobile:["text",60],tags:["tags"],custom:["custom"],ownerId:["int"],primary:["bool"],optOut:["bool"],language:["enum",["English","Spanish","Portuguese"]],notes:["long",5000]},
  interaction:{customerId:["int"],leadId:["int"],contactId:["int"],dealId:["int"],date:["date"],time:["time"],durationMin:["int"],kind:["enum",["Call","Email","Meeting","WhatsApp","Note","Visit"]],status:["enum",["Done","Planned","Canceled"]],subject:["text",200],summary:["long",5000],ownerId:["int"],location:["text",200],lat:["coord"],lng:["coord"]},
  deal:{title:["text!",200],customerId:["int"],contactId:["int"],division:["enum",DIVE],value:["money"],pipeline:["text",40],stage:["text",60],probability:["optpct"],history:["history"],closedAt:["text",30],expectedClose:["date"],ownerId:["int"],nextStep:["text",200],nextStepDate:["date"],lostReason:["text",200],notes:["long",10000]},
  quote:{number:["text",40],customerId:["int!"],date:["date"],validUntil:["date"],status:["enum",["Draft","Sent","Accepted","Declined","Expired"]],division:["enum",DIVE],lines:["lines"],shipping:["money"],taxRate:["num"],notes:["long",5000],internalNotes:["long",5000],dealId:["int"],invoiceId:["int"],currency:["enum",CURRENCIES],fxRate:["rate"],repId:["int"],emails:["emails"],response:["response"],contactId:["int"]},
  invoice:{number:["text",40],customerId:["int!"],date:["date"],dueDate:["date"],status:["enum",["Draft","Sent","Void"]],division:["enum",DIVE],lines:["lines"],shipping:["money"],taxRate:["num"],notes:["long",5000],internalNotes:["long",5000],payments:["payments"],quoteId:["int"],contactId:["int"],currency:["enum",CURRENCIES],fxRate:["rate"],repId:["int"],emails:["emails"]},
  oil_order:{date:["date!"],customerId:["int"],membership:["text",80],description:["text",240],amount:["money"],rewardAmount:["money"],rewardStatus:["enum",["Pending","Earned","Deposited","Cancelled"]],depositDate:["date"],notes:["long",5000]},
  oil_cost:{month:["month!"],description:["text!",200],amount:["money"]},
  payout:{month:["month!"],amount:["money"],paidDate:["date"],method:["text",60],reference:["text",120],notes:["long",2000]},
  supplier:{name:["text!",160],divisions:["multi",DIVS],contactName:["text",120],email:["text",160],phone:["text",60],address:["long",500],terms:["text",80],w9:["bool"],coi:["bool"],notes:["long",10000]},
  po:{number:["text",40],supplierId:["int!"],date:["date"],expectedDate:["date"],status:["enum",["Draft","Sent","Confirmed","Received","Paid","Cancelled"]],division:["enum",DIVE],lines:["lines"],shipping:["money"],taxRate:["num"],shipTo:["long",500],notes:["long",5000],internalNotes:["long",5000],invoiceId:["int"],emails:["emails"]},
  product:{name:["text!",200],sku:["text",60],division:["enum",DIVE],category:["text",80],unit:["text",40],grade:["text",40],cost:["money"],price:["money"],stock:["qty"],active:["bool"],notes:["long",5000]},
  lead:{name:["text!",160],company:["text",160],email:["text",160],phone:["text",60],location:["text",120],division:["text",120],message:["long",5000],details:["long",20000],
    source:["enum",["Website quote form","Website account form","Phone","WhatsApp","Email","Referral","Trade show","Other"]],status:["enum",["New","Contacted","Qualified","Converted","Not a fit"]],
    ownerId:["int"],customerId:["int"],sourceId:["int"],receivedAt:["text",30],nextStepDate:["date"],tags:["tags"],lat:["coord"],lng:["coord"]},
  note:{title:["text",120],body:["long!",10000],color:["enum",["yellow","blue","green","pink","grey"]],visibility:["enum",["private","team","owners"]],pinned:["bool"]},
  segment:{name:["text!",120],entity:["enum",["customer","contact"]],filters:["filters"]},
  email_template:{name:["text!",120],category:["enum",["Campaign","Follow-up","Quote","Invoice","Other"]],subject:["text",200],body:["long!",20000]},
  campaign:{name:["text!",160],segmentId:["int"],templateId:["int"],subject:["text",200],body:["long",20000],attachPriceList:["bool"],priceDivision:["enum",DIVE],status:["enum",["Draft","Sending","Sent"]],sentAt:["text",30],stats:["stats"],queue:["queue"]},
  task:{title:["text!",200],assigneeId:["int"],due:["date"],status:["enum",["Open","Done"]],priority:["enum",["Normal","High"]],relatedType:["text",30],relatedId:["int"],relatedLabel:["text",200],notes:["long",5000],doneAt:["text",30]},
};
const LABELS={contact:"contact",segment:"segment",email_template:"email template",campaign:"email campaign",customer:"customer",interaction:"activity",deal:"deal",quote:"quote",invoice:"invoice",oil_order:"oil order",oil_cost:"program cost",payout:"partner payout",supplier:"supplier",po:"purchase order",task:"task",product:"product",lead:"lead",note:"note"};
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
    case "time": return /^([01]\d|2[0-3]):[0-5]\d$/.test(v||"")?v:"";
    case "coord": { const n=Number(v); return v!==""&&v!=null&&isFinite(n)&&n!==0&&Math.abs(n)<=180?Math.round(n*1e6)/1e6:""; }
    case "optpct": return v===""||v==null||!isFinite(Number(v))?"":Math.max(0,Math.min(100,parseInt(v,10)||0));
    case "tags": { const out=[]; (Array.isArray(v)?v:String(v||"").split(/[,;]+/)).forEach(t=>{ t=txt(t,40).replace(/\s+/g," ").trim(); if(t&&!out.some(x=>x.toLowerCase()===t.toLowerCase())) out.push(t); }); return out.slice(0,20); }
    case "custom": { const out={}; Object.entries(v&&typeof v==="object"?v:{}).forEach(([k,x])=>{ k=String(k).toLowerCase().replace(/[^a-z0-9_]/g,"").slice(0,40); if(k&&Object.keys(out).length<40&&(x==null||typeof x!=="object")) out[k]=typeof x==="boolean"?x:txt(x??"",500).trim(); }); return out; }
    case "filters": return cleanFilters(v);
    case "history": return (Array.isArray(v)?v:[]).slice(-100).map(h=>({stage:txt(h.stage,60),at:txt(h.at,30),by:Math.max(0,parseInt(h.by,10)||0)}));
    case "queue": return (Array.isArray(v)?v:[]).slice(0,5000).filter(q=>/@/.test(q.email||"")).map(q=>({email:String(q.email).toLowerCase(),name:txt(q.name,160),company:txt(q.company,160),contactId:+q.contactId||0,customerId:+q.customerId||0,state:["queued","sent","failed","skipped"].includes(q.state)?q.state:"queued"}));
    case "stats": { v=v||{}; return {total:+v.total||0,sent:+v.sent||0,failed:+v.failed||0,skipped:+v.skipped||0,unsubscribed:+v.unsubscribed||0}; }
    case "response": return v&&v.decision?{decision:v.decision==="accept"?"accept":"decline",name:txt(v.name,120),comment:txt(v.comment,2000),at:txt(v.at,30),userId:+v.userId||0}:null;
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
  postClean(type,out);
  if (DOCS3.includes(type)){
    const sub=r2(out.lines.reduce((s,l)=>s+r2(l.qty*l.price),0)), cost=r2(out.lines.reduce((s,l)=>s+r2(l.qty*(l.cost||0)),0));
    if (type!=="po"){ out.costTotal=cost; out.profit=r2(sub-cost); out.margin=sub>0?Math.round((sub-cost)/sub*1000)/10:0; }
    const tax=r2(sub*out.taxRate/100);
    out.subtotal=sub; out.tax=tax; out.total=r2(sub+tax+out.shipping);
    if (type==="invoice"){ out.paid=r2(out.payments.reduce((s,p)=>s+p.amount,0)); out.balance=out.status==="Void"?0:r2(out.total-out.paid); }
  }
  return out;
}

const HEALTH=["Healthy","Due to reorder","Overdue","At risk","No orders","Prospect","Inactive"];
function cleanFilters(v){ v=v||{}; return {q:txt(v.q,120).trim(),status:["Lead","Active","Inactive"].includes(v.status)?v.status:"",tags:cleanVal("tags",null,v.tags||[]),tagMode:v.tagMode==="all"?"all":"any",
  division:DIVS.includes(v.division)?v.division:"",region:txt(v.region,60).trim(),industry:txt(v.industry,80).trim(),ownerId:Math.max(0,parseInt(v.ownerId,10)||0),health:HEALTH.includes(v.health)?v.health:"",noOrderDays:Math.max(0,Math.min(3650,parseInt(v.noOrderDays,10)||0)),hasEmail:!!v.hasEmail}; }
function pipelines(){ return (DB&&DB.settings&&DB.settings.pipelines&&DB.settings.pipelines.length)?DB.settings.pipelines:window.SNP_STAGING_SEED.PIPELINES; }
function stageInfo(pk,st){ const p=pipelines().find(x=>x.key===pk); return p?p.stages.find(x=>x.name===st)||null:null; }
function postClean(type,d){
  if (type==="deal"){ const pls=pipelines(); let p=pls.find(x=>x.key===d.pipeline)||pls.find(x=>d.division&&x.name.toLowerCase()===d.division.toLowerCase())||pls[0];
    d.pipeline=p.key; if(!p.stages.some(s=>s.name===d.stage)) d.stage=p.stages[0].name; }
  if (type==="interaction"){ if(!d.customerId&&!d.leadId) throw {status:400,code:"snp_required",message:"Choose the customer or lead this is for."}; if(!d.subject&&!String(d.summary||"").trim()) throw {status:400,code:"snp_required",message:"Write what it is about."}; }
  if (type==="contact") d.email=d.email.toLowerCase();
}
function trackDeal(cur,d){
  d.history=cur?cleanVal("history",null,cur.history||[]):[]; d.closedAt=cur?(cur.closedAt||""):"";
  if (!cur||cur.stage!==d.stage||cur.pipeline!==d.pipeline){ const at=now(); d.history.push({stage:d.stage,at,by:me()}); d.history=d.history.slice(-100); const i=stageInfo(d.pipeline,d.stage); d.closedAt=i&&i.type!=="open"?at:""; }
  return d;
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
  DB=d; // pipelines() reads settings while cleaning
  d.items.forEach(it=>{ if(DOCS3.includes(it.type)) return; const h=it.data.history, c=it.data.closedAt; it.data=cleanItem(it.type,it.data);
    if (it.type==="deal"){ it.data.history=h&&h.length?h:[{stage:it.data.stage,at:it.updatedAt,by:it.updatedBy}]; const i=stageInfo(it.data.pipeline,it.data.stage); it.data.closedAt=c||(i&&i.type!=="open"?it.updatedAt:""); } });
  return d;
}
function load(){ try{ const raw=localStorage.getItem(KEY); DB = raw ? JSON.parse(raw) : fresh(); }catch(e){ DB=fresh(); } if(DB.v!==5) DB=fresh(); }
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
  if (role==="sales"){ if(["customer","contact","interaction","deal","quote","invoice","lead","segment","email_template"].includes(type)) return "rw"; if(type==="product") return "r"; }
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
  const keep=["companyName","companyAddress","companyPhone","companyEmail","companyWebsite","quoteValidDays","invoiceDueDays","taxRate","paymentInfo","documentFooter","hoursOpen","hoursClose","workdays","reminders","pipelines","customFields","lostReasons","industries","defaultReorderDays","portalEnabled"];
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
    names, items, access:accessMap, settings:settingsFor(), today:today(), maxUpload:1500000,
    portalUsers:["owner","sales"].includes(role)?DB.portalUsers:[], suppressed:role==="owner"?DB.suppressed.length:0 };
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
  if (Array.isArray(body.pipelines)){ const pl=[]; const keys=[];
    for (const p of body.pipelines.slice(0,8)){ const name=txt(p.name,60).trim(); if(!name) throw err(400,"snp_pipelines","Give every pipeline a name.");
      let key=String(p.key||name).toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,"").slice(0,40)||"pipeline"; const b=key; let i=2; while(keys.includes(key)) key=b+"_"+i++; keys.push(key);
      const seen=new Set(), stages=[]; (p.stages||[]).slice(0,15).forEach(st=>{ const n=txt(st.name,60).trim(); if(!n||seen.has(n.toLowerCase())) return; seen.add(n.toLowerCase()); const t=["open","won","lost"].includes(st.type)?st.type:"open"; stages.push({name:n,prob:t==="won"?100:t==="lost"?0:Math.max(0,Math.min(99,parseInt(st.prob,10)||0)),type:t}); });
      if (!["open","won","lost"].every(t=>stages.some(x=>x.type===t))) throw err(400,"snp_pipelines",`The ${name} pipeline needs at least one open stage, one won stage and one lost stage.`);
      pl.push({key,name,stages}); }
    if (!pl.length) throw err(400,"snp_pipelines","Keep at least one pipeline."); s.pipelines=pl; }
  if (Array.isArray(body.customFields)){ const keys=[]; s.customFields=body.customFields.slice(0,30).filter(f=>txt(f.label,60).trim()).map(f=>{ const label=txt(f.label,60).trim(); let key=String(f.key||label).toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,"").slice(0,40); if(!key||keys.includes(key)) key="field_"+(keys.length+1); keys.push(key);
    const type=["text","number","date","select","checkbox"].includes(f.type)?f.type:"text"; return {key,label,type,entity:f.entity==="contact"?"contact":"customer",options:type==="select"?[...new Set((f.options||[]).map(o=>txt(o,60).trim()).filter(Boolean))].slice(0,30):[]}; }); }
  ["lostReasons","industries"].forEach(k=>{ if(Array.isArray(body[k])) s[k]=[...new Set(body[k].map(x=>txt(x,80).trim()).filter(Boolean))].slice(0,30); });
  if ("defaultReorderDays" in body) s.defaultReorderDays=Math.max(7,Math.min(365,parseInt(body.defaultReorderDays,10)||30));
  if ("emailDailyLimit" in body) s.emailDailyLimit=Math.max(10,Math.min(5000,parseInt(body.emailDailyLimit,10)||200));
  if ("portalEnabled" in body) s.portalEnabled=!!body.portalEnabled;
  if (Array.isArray(body.memberships)) s.memberships=[...new Set(body.memberships.map(x=>txt(x,80).trim()).filter(Boolean))].slice(0,50);
  return s;
}
/* ---------- CRM tools (same rules as includes/crm-api.php) ---------- */
const BULK_FIELDS={customer:["status","ownerId","terms","industry","divisions","reorderDays"],contact:["ownerId","customerId","optOut","language"],lead:["status","ownerId","nextStepDate"],deal:["ownerId","pipeline","stage","expectedClose"],product:["active","division","category"]};
const staff=()=>["owner","sales"].includes(role);
function importVal(kind,v){ if(Array.isArray(v)) return v; v=String(v??"").trim();
  if (kind==="bool") return ["1","yes","y","true","x","si","sí"].includes(v.toLowerCase());
  if (kind==="multi"||kind==="tags") return v.split(/[;,|]+/).map(x=>x.trim()).filter(Boolean);
  if (kind==="date"){ if(!v) return ""; const t=new Date(v); return isNaN(t)?"":t.toISOString().slice(0,10); }
  return v; }
function importRows(body){
  const type=body.type; if(!staff()||!["customer","contact","lead","product"].includes(type)||access(type)!=="rw") throw err(403,"snp_forbidden","You can't import this kind of record.");
  const rows=Array.isArray(body.rows)?body.rows:[]; if(rows.length>500) throw err(400,"snp_too_many","Send at most 500 rows at a time.");
  const up=body.mode==="upsert", match=body.match==="name"?"name":"email", sch=SCHEMAS[type], res={created:0,updated:0,skipped:0,companiesCreated:0,errors:[]};
  const index=new Map(); DB.items.filter(i=>i.type===type).forEach(i=>{ const k=String(i.data[match]||"").toLowerCase().trim(); if(k) index.set(k,i); });
  const cos=new Map(); DB.items.filter(i=>i.type==="customer").forEach(i=>cos.set(String(i.data.name||"").toLowerCase().trim(),i.id));
  rows.forEach((row,i)=>{ try{
    const inp={}; Object.entries(row||{}).forEach(([k,v])=>{ if(sch[k]&&!["history","closedAt","emails","contacts","custom"].includes(k)){ const x=importVal(sch[k][0].replace("!",""),v); if(x!==""&&!(Array.isArray(x)&&!x.length)) inp[k]=x; } else if(k.startsWith("custom.")&&String(v).trim()) (inp.custom||(inp.custom={}))[k.slice(7)]=v; });
    if (type==="contact"&&row.company){ const cn=String(row.company).toLowerCase().trim(); if(cos.has(cn)) inp.customerId=cos.get(cn); else if(body.createCompanies){ const co={id:DB.seq++,type:"customer",data:cleanItem("customer",{name:String(row.company).trim(),status:"Active",ownerId:me()}),createdAt:now(),createdBy:me(),updatedAt:now(),updatedBy:me()}; DB.items.push(co); cos.set(cn,co.id); inp.customerId=co.id; res.companiesCreated++; } }
    const k=String(inp[match]||"").toLowerCase().trim();
    if (k&&index.has(k)){ if(!up){ res.skipped++; return; } const it=index.get(k); const d={...it.data}; Object.entries(inp).forEach(([f,v])=>d[f]=f==="tags"?[...(it.data.tags||[]),...v]:f==="custom"?{...(it.data.custom||{}),...v}:v); it.data=cleanItem(type,d); it.updatedAt=now(); it.updatedBy=me(); res.updated++; return; }
    const def=type==="customer"?{status:"Active",ownerId:me()}:type==="lead"?{source:"Other",status:"New",receivedAt:now()}:type==="product"?{active:true}:{ownerId:me()};
    const it={id:DB.seq++,type,data:cleanItem(type,{...def,...inp}),createdAt:now(),createdBy:me(),updatedAt:now(),updatedBy:me()}; DB.items.push(it); if(k) index.set(k,it); res.created++;
  }catch(e){ res.errors.push({row:i+1,message:e.message||String(e)}); } });
  res.errors=res.errors.slice(0,50); log("imported",`${res.created} ${LABELS[type]}s added, ${res.updated} updated, ${res.skipped} skipped`); save(); return res;
}
function bulk(body){
  const type=body.type, action=body.action, ids=[...new Set((body.ids||[]).map(Number))].slice(0,500);
  if (!staff()||!BULK_FIELDS[type]||access(type)!=="rw") throw err(403,"snp_forbidden","You can't change these records.");
  if (action==="delete"&&role!=="owner") throw err(403,"snp_forbidden","Only owners can delete.");
  const patch={}; Object.entries(body.data||{}).forEach(([k,v])=>{ if(BULK_FIELDS[type].includes(k)) patch[k]=v; });
  const tags=cleanVal("tags",null,body.tags||[]); let done=0, failed=0;
  ids.forEach(id=>{ const it=DB.items.find(x=>x.id===id&&x.type===type); if(!it){ failed++; return; }
    if (action==="delete"){ DB.items=DB.items.filter(x=>x!==it); if(type==="customer") DB.items=DB.items.filter(x=>!(["interaction","contact"].includes(x.type)&&x.data.customerId===id)); done++; return; }
    let d={...it.data};
    if (action==="update"){ Object.assign(d,patch); if(type==="deal"&&"pipeline" in patch&&!("stage" in patch)) d.stage=""; }
    else if (action==="tag") d.tags=[...(d.tags||[]),...tags];
    else if (action==="untag"){ const low=tags.map(t=>t.toLowerCase()); d.tags=(d.tags||[]).filter(t=>!low.includes(t.toLowerCase())); }
    try{ d=cleanItem(type,d); if(type==="deal") trackDeal(it.data,d); Object.assign(it,{data:d,updatedAt:now(),updatedBy:me()}); done++; }catch(e){ failed++; } });
  log("bulk "+action,`${done} ${LABELS[type]}${done===1?"":"s"}`); save(); return {done,failed};
}
function merge(body){
  if (role!=="owner") throw err(403,"rest_forbidden","Only owners can merge.");
  const type=body.type, keep=DB.items.find(x=>x.id===+body.keepId&&x.type===type); if(!keep) throw err(404,"snp_not_found","The record to keep no longer exists.");
  const f=type==="customer"?"customerId":"contactId", linked=type==="customer"?["contact","interaction","deal","quote","invoice","oil_order","lead"]:["interaction","deal","quote","invoice"]; const names=[];
  (body.mergeIds||[]).map(Number).filter(id=>id!==keep.id).forEach(mid=>{ const m=DB.items.find(x=>x.id===mid&&x.type===type); if(!m) return; names.push(m.data.name);
    Object.entries(m.data).forEach(([k,v])=>{ const kv=keep.data[k];
      if (k==="tags"||k==="divisions") keep.data[k]=[...new Set([...(kv||[]),...(v||[])])];
      else if (k==="notes"&&String(v||"").trim()&&!String(kv||"").includes(v)) keep.data.notes=((kv||"")+"\n\n"+v).trim();
      else if (k==="custom") keep.data.custom={...(v||{}),...Object.fromEntries(Object.entries(kv||{}).filter(([,x])=>x!==""&&x!=null))};
      else if ((kv===""||kv===0||kv===false||kv==null)&&(v==null||typeof v!=="object")) keep.data[k]=v; });
    DB.items.forEach(x=>{ if(linked.includes(x.type)&&x.data[f]===mid) x.data[f]=keep.id; });
    if (type==="customer") DB.portalUsers.forEach(u=>{ if(u.customerId===mid) u.customerId=keep.id; });
    DB.items=DB.items.filter(x=>x!==m); });
  keep.data=cleanItem(type,keep.data); Object.assign(keep,{updatedAt:now(),updatedBy:me()}); log("merged",`${keep.data.name} ← ${names.join(", ")}`); save();
  return {merged:names.length,item:keep};
}
const addActivity = data => { const it={id:DB.seq++,type:"interaction",data:cleanItem("interaction",{date:today(),status:"Done",ownerId:me(),...data}),createdAt:now(),createdBy:me(),updatedAt:now(),updatedBy:me()}; DB.items.push(it); return it; };
const emailsIn = s => String(s||"").split(/[,;]+/).map(x=>x.trim()).filter(Boolean);
function message(body){
  if (!staff()) throw err(403,"rest_forbidden","Only owners and sales can send email.");
  const to=emailsIn(body.to); if(!to.length) throw err(400,"snp_to","Enter the customer's email address.");
  for (const e of to) if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw err(400,"snp_to",`"${e}" isn't a valid email address.`);
  if (!txt(body.subject,200).trim()||!String(body.body||"").trim()) throw err(400,"snp_empty","Add a subject and a message.");
  const it=(body.customerId||body.leadId)?addActivity({customerId:+body.customerId||0,leadId:+body.leadId||0,contactId:+body.contactId||0,dealId:+body.dealId||0,kind:"Email",subject:txt(body.subject,200),summary:`To ${to.join(", ")}:\n\n${body.body}`}):null;
  log("emailed",`${body.subject} to ${to.join(", ")}`); save();
  return {sent:true,item:it,note:`Staging: logged as sent to ${to.join(", ")}. No email actually goes out from staging.`};
}
function recipients(c){
  const seg=DB.items.find(x=>x.id===c.data.segmentId&&x.type==="segment"); if(!seg) throw err(400,"snp_segment","Choose who the campaign goes to (a saved segment).");
  const list=(window.SNP&&SNP.campaigns?SNP.campaigns.audience(seg.id):[]).filter(r=>!DB.suppressed.includes(r.to));
  return list.map(r=>{ const co=DB.items.find(x=>x.type==="customer"&&x.data.name===r.company), ct=DB.items.find(x=>x.type==="contact"&&x.data.email===r.to);
    return {email:r.to,name:r.name||"",company:r.company||"",contactId:ct?ct.id:0,customerId:co?co.id:0,state:"queued"}; });
}
function campaign(id, sub, body){
  if (role!=="owner") throw err(403,"rest_forbidden","Only owners can send campaigns.");
  const c=DB.items.find(x=>x.id===id&&x.type==="campaign"); if(!c) throw err(404,"snp_not_found","That campaign no longer exists.");
  const limit=DB.settings.emailDailyLimit||200; if(!DB.mailCount||DB.mailCount.date!==today()) DB.mailCount={date:today(),n:0};
  if (sub==="recipients"){ const r=recipients(c); return {count:r.length,sample:r.slice(0,25),sentToday:DB.mailCount.n,dailyLimit:limit}; }
  const d=c.data; if(!String(d.subject||"").trim()||!String(d.body||"").trim()) throw err(400,"snp_empty","Add a subject and a message first.");
  if (d.attachPriceList&&body.pdf!==undefined&&!String(body.pdf).startsWith("JVBER")) throw err(400,"snp_pdf","The price list PDF didn't come through. Try again.");
  if (body.test) return {test:true};
  if (d.status==="Sent") throw err(400,"snp_sent","This campaign has already gone out.");
  if (d.status==="Draft"){ if(d.attachPriceList&&!String(body.pdf||"").startsWith("JVBER")) throw err(400,"snp_pdf","The price list PDF is missing. Try again.");
    const q=recipients(c); if(!q.length) throw err(400,"snp_empty","No one in this segment has an email address you can send to.");
    d.queue=q; d.stats={total:q.length,sent:0,failed:0,skipped:0,unsubscribed:0}; d.status="Sending"; log("campaign started",`${d.name} to ${q.length} recipients`); }
  let batch=Math.min(20,Math.max(0,limit-DB.mailCount.n)); const logged=new Set();
  for (const r of d.queue){ if(batch<=0) break; if(r.state!=="queued") continue;
    if (DB.suppressed.includes(r.email)){ r.state="skipped"; d.stats.skipped++; continue; }
    r.state="sent"; d.stats.sent++; batch--; DB.mailCount.n++;
    if (r.customerId&&!logged.has(r.customerId)){ logged.add(r.customerId); addActivity({customerId:r.customerId,contactId:r.contactId,kind:"Email",subject:"Campaign: "+d.name,summary:`Sent "${d.subject}" to ${r.email}.`}); } }
  const remaining=d.queue.filter(r=>r.state==="queued").length;
  if (!remaining){ d.status="Sent"; d.sentAt=now(); log("campaign sent",`${d.name}: ${d.stats.sent} sent (staging: nothing actually emailed)`); }
  c.data=cleanItem("campaign",d); Object.assign(c,{updatedAt:now(),updatedBy:me()}); save();
  return {item:c,remaining,limitReached:remaining>0&&DB.mailCount.n>=limit,dailyLimit:limit};
}

/* ---------- customer portal (same rules as includes/customer-portal.php) ---------- */
function portalDoc(it){ const d=JSON.parse(JSON.stringify(it.data)); ["costTotal","profit","margin","internalNotes","emails","dealId","quoteId"].forEach(k=>delete d[k]); (d.lines||[]).forEach(l=>{ delete l.cost; delete l.productId; }); return {...it,data:d,createdBy:0,updatedBy:0}; }
function portal(sub, id, method, body){
  if (sub==="invite"||sub==="revoke"){
    if (!staff()) throw err(403,"rest_forbidden","Only owners and sales can manage portal access.");
    if (sub==="revoke"){ const u=DB.portalUsers.find(x=>x.id===+body.userId); if(!u) throw err(404,"snp_not_found","That portal login no longer exists.");
      DB.portalUsers=DB.portalUsers.filter(x=>x!==u); addActivity({customerId:u.customerId,kind:"Note",subject:"Portal access removed",summary:`Removed portal access for ${u.email}.`}); save(); return {revoked:true}; }
    const c=DB.items.find(x=>x.id===+body.customerId&&x.type==="customer"); if(!c) throw err(404,"snp_not_found","That customer no longer exists.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.email||"")) throw err(400,"snp_email","Enter a valid email address.");
    if (DB.settings.portalEnabled===false) throw err(400,"snp_portal_off","The customer portal is turned off in Settings.");
    if (DB.people.some(p=>p.email.toLowerCase()===body.email.toLowerCase())) throw err(400,"snp_staff","That email belongs to an SNP team login. Use a different address for the customer.");
    let u=DB.portalUsers.find(x=>x.email.toLowerCase()===body.email.toLowerCase());
    if (u&&u.customerId!==c.id) throw err(400,"snp_taken","That email already has portal access for another customer.");
    if (!u){ u={id:DB.seq++,name:txt(body.name,100).trim()||body.email,email:body.email,customerId:c.id,lastLogin:""}; DB.portalUsers.push(u); }
    addActivity({customerId:c.id,kind:"Note",subject:"Portal access for "+u.name,summary:`Invited ${u.email} to the customer portal.`}); save();
    return {user:u,link:"https://www.snpwholesale.com/wp-login.php?action=rp (staging: no email is sent; the real system emails this link)",emailed:false};
  }
  if (role!=="customer") throw err(403,"rest_forbidden","Portal only.");
  const cid=DB.portalCustomer, cust=DB.items.find(x=>x.id===cid);
  if (sub==="state"){
    const docs=t=>DB.items.filter(x=>x.type===t&&x.data.customerId===cid&&!["Draft","Void"].includes(x.data.status)).map(portalDoc).sort((a,b)=>b.id-a.id);
    const keep=["name","contactName","email","phone","address","state","country","terms","creditLimit"], s=DB.settings, rep=DB.people.find(p=>p.id===cust.data.ownerId);
    return {me:{id:7,name:"Maria Lopez",role:"customer",roleLabel:cust.data.name},perms:{},access:{customer:"r",quote:"r",invoice:"r"},
      settings:Object.fromEntries(["companyName","companyAddress","companyPhone","companyEmail","companyWebsite","paymentInfo","documentFooter","hoursOpen","hoursClose","workdays"].map(k=>[k,s[k]])),
      items:{customer:[{id:cid,type:"customer",data:Object.fromEntries(keep.map(k=>[k,cust.data[k]])),createdAt:"",createdBy:0,updatedAt:"",updatedBy:0}],quote:docs("quote"),invoice:docs("invoice")},
      names:{},portal:{customerId:cid,rep:rep?{name:rep.name,email:s.companyEmail}:null},today:today()};
  }
  if (sub==="quotes"&&method==="POST"){
    const q=DB.items.find(x=>x.id===+id&&x.type==="quote"&&x.data.customerId===cid); if(!q) throw err(404,"snp_not_found","That quote is no longer available.");
    const dec=body.decision==="decline"?"decline":"accept", name=txt(body.name,120).trim(), comment=txt(body.comment,2000).trim();
    if (q.data.status!=="Sent") throw err(400,"snp_closed",`This quote has already been ${q.data.status.toLowerCase()}.`);
    if (q.data.validUntil&&q.data.validUntil<today()) throw err(400,"snp_expired",`This quote expired on ${q.data.validUntil}. Contact us for an updated quote.`);
    if (dec==="accept"&&!name) throw err(400,"snp_name","Type your full name to accept the quote.");
    q.data=cleanItem("quote",{...q.data,status:dec==="accept"?"Accepted":"Declined",response:{decision:dec,name,comment,at:now(),userId:7}}); q.updatedAt=now();
    const repId=q.data.repId||cust.data.ownerId, verb=dec==="accept"?"accepted":"declined", line=`Quote ${q.data.number} ${verb} online by ${name||"the customer"}${comment?`: "${comment}"`:"."}`;
    DB.items.push({id:DB.seq++,type:"interaction",data:cleanItem("interaction",{customerId:cid,date:today(),status:"Done",kind:"Note",subject:`Quote ${q.data.number} ${verb} in the portal`,summary:line,ownerId:repId}),createdAt:now(),createdBy:7,updatedAt:now(),updatedBy:7});
    if (dec==="accept") DB.items.push({id:DB.seq++,type:"task",data:cleanItem("task",{title:`Convert ${q.data.number} to an invoice (accepted by ${name})`,assigneeId:repId,due:today(),status:"Open",priority:"High",relatedType:"customer",relatedId:cid,relatedLabel:cust.data.name}),createdAt:now(),createdBy:7,updatedAt:now(),updatedBy:7});
    DB.activity.unshift({at:now(),by:7,docId:0,action:"portal",detail:`${cust.data.name}: ${line}`}); save();
    return {item:portalDoc(q)};
  }
  throw err(404,"rest_no_route","Not available in staging.");
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

  if (a==="import") return importRows(body);
  if (a==="bulk") return bulk(body);
  if (a==="merge") return merge(body);
  if (a==="message"&&method==="POST") return message(body);
  if (a==="campaigns") return campaign(+b,c,body);
  if (a==="portal") return portal(b,c,method,body);

  if (a==="items"){
    if (!b && method==="POST"){
      const type=body.type; if(!SCHEMAS[type]) throw err(400,"snp_type","Unknown record type.");
      const mode=access(type); const input={...(body.data||{})};
      if (mode==="mine") input.assigneeId=me();
      else if (mode!=="notes"&&mode!=="rw") throw err(403,"snp_forbidden","You don't have access to add this.");
      if (type==="note"&&input.visibility==="owners"&&role!=="owner") input.visibility="team";
      if (role==="sales"&&(type==="quote"||type==="invoice")) input.lines=fillCosts(cleanVal("lines",null,input.lines),[]);
      if (DOCS3.includes(type)) input.emails=[];
      ["history","closedAt","response","queue","stats","sentAt"].forEach(k=>delete input[k]); if (type==="campaign") input.status="Draft";
      if ((type==="quote"||type==="invoice")&&!input.repId) input.repId=defaultRep(+input.customerId||0);
      const data=cleanItem(type,input);
      if (DOCS3.includes(type)){ if(!data.date) data.date=today(); data.number=nextNumber(type,data.date); }
      if (type==="task"&&data.status==="Done"&&!data.doneAt) data.doneAt=now();
      if (type==="deal") trackDeal(null,data);
      const it={id:DB.seq++,type,data,createdAt:now(),createdBy:me(),updatedAt:now(),updatedBy:me()};
      DB.items.push(it); log("added "+LABELS[type],itemLabel(data)); save(); return forRole(it);
    }
    const it=DB.items.find(x=>x.id===+b);
    if (!it) { if(method==="DELETE") return {deleted:true}; throw err(404,"snp_not_found","That record no longer exists."); }
    const mode=access(it.type);
    if (method==="DELETE"){
      if (it.type==="note"){ if(!canSeeNote(it)||(it.createdBy!==me()&&role!=="owner")) throw err(403,"snp_forbidden","Only the person who wrote this note can delete it."); }
      else if (role!=="owner") throw err(403,"snp_forbidden","Only owners can delete this.");
      DB.items=DB.items.filter(x=>x!==it); if(it.type==="customer") DB.items=DB.items.filter(x=>!(["interaction","contact"].includes(x.type)&&x.data.customerId===it.id));
      log("deleted "+LABELS[it.type],itemLabel(it.data)); save(); return {deleted:true}; }
    let input={...(body.data||{})};
    if (mode==="mine"){ if(it.data.assigneeId!==me()) throw err(404,"snp_not_found","That record no longer exists.");
      const keys=it.createdBy===me()?["title","due","priority","status","notes"]:["status","notes"]; const o={}; keys.forEach(k=>{ if(k in input) o[k]=input[k]; }); input=o; }
    else if (mode==="notes"){ if(!canSeeNote(it)) throw err(404,"snp_not_found","That note no longer exists.");
      if (it.createdBy!==me()&&role!=="owner") throw err(403,"snp_forbidden","Only the person who wrote this note can change it.");
      if (input.visibility==="owners"&&role!=="owner") delete input.visibility; }
    else if (mode!=="rw") throw err(403,"snp_forbidden","You can view this but not change it.");
    ["emails","history","closedAt","response","queue","stats","sentAt"].forEach(k=>delete input[k]);
    if (it.type==="campaign"){ delete input.status; if(it.data.status!=="Draft"&&["segmentId","subject","body","attachPriceList","priceDivision"].some(k=>k in input)) throw err(400,"snp_sent","This campaign has already gone out. Duplicate it to send again."); }
    const merged={...it.data,...input}; if(it.data.number) merged.number=it.data.number;
    if (role==="sales"&&(it.type==="quote"||it.type==="invoice")&&"lines" in input) merged.lines=fillCosts(cleanVal("lines",null,input.lines),it.data.lines||[]);
    const data=cleanItem(it.type,merged);
    if (it.type==="task"){ if(data.status==="Done"&&it.data.status!=="Done") data.doneAt=now(); else if(data.status==="Open") data.doneAt=""; }
    if (it.type==="deal") trackDeal(it.data,data);
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
  b.innerHTML=`<strong>STAGING</strong><span class="sb-text">${PORTAL?"Customer portal as Desert Auto Parts sees it. ":""}Sample data only, saved in this browser. Nothing here touches snpwholesale.com.</span>
<label class="sb-role">Viewing as <select id="sb-role"><option value="owner">Owner</option><option value="sales">Sales</option><option value="accountant">Accountant</option><option value="attorney">Attorney</option><option value="portal">Customer portal (as a customer)</option></select></label>
<button type="button" id="sb-reset">Reset sample data</button>`;
  document.body.prepend(b);
  const s=b.querySelector("#sb-role"); s.value=role;
  if (PORTAL) s.value="portal";
  s.onchange=()=>{ if(s.value==="portal"){ location.href="portal.html#home"; return; } try{ localStorage.setItem(ROLE_KEY,s.value); }catch(e){} if(PORTAL){ location.href="index.html#home"; return; } location.hash="home"; location.reload(); };
  const r=b.querySelector("#sb-reset");
  r.onclick=()=>{ if(r.dataset.armed){ try{ Object.keys(localStorage).filter(k=>k.startsWith(FILE_PREFIX)).forEach(k=>localStorage.removeItem(k)); localStorage.removeItem(KEY); }catch(e){} location.hash="home"; location.reload(); }
    else { r.dataset.armed="1"; r.textContent="Click again to reset"; setTimeout(()=>{ delete r.dataset.armed; r.textContent="Reset sample data"; },4000); } };
}
if (document.readyState==="loading") document.addEventListener("DOMContentLoaded",bar); else bar();
})();

/* SNP back office: shared core (data, API, layout, panels, forms, tables, printing). Modules register through SNP.module(). */
window.SNP = (() => {
"use strict";
const CFG = window.SNP_REC || {};
const S = { loaded:false, failed:"", me:null, perms:{}, access:{}, settings:null, cats:[], statuses:[], assignees:[], docs:new Map(), tpls:new Map(),
  items:{}, byId:{}, people:[], activity:[], names:{}, scope:"", scopes:{}, maxUpload:0, today:"", pending:0 };
const modules = [];
let current = { id:"", arg:"" };

/* ---------- small helpers ---------- */
const $ = s => document.querySelector(s);
function el(tag, attrs={}, ...kids){ const n=document.createElement(tag);
  for (const [k,v] of Object.entries(attrs||{})) { if (v==null||v===false) continue;
    if (k==="class") n.className=v; else if (k==="text") n.textContent=v; else if (k==="html") continue;
    else if (k.startsWith("on")&&typeof v==="function") n.addEventListener(k.slice(2),v);
    else n.setAttribute(k, v===true?"":v); }
  for (const k of kids.flat(Infinity)) if (k!=null&&k!==""&&k!==false) n.append(k.nodeType?k:document.createTextNode(String(k)));
  return n; }
const pad = n => String(n).padStart(2,"0");
const localToday = () => { const d=new Date(); return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate()); };
const today = () => localToday();
const addDays = (ymd, n) => { const [y,m,d]=(ymd||today()).split("-").map(Number); const t=new Date(y,m-1,d+n); return t.getFullYear()+"-"+pad(t.getMonth()+1)+"-"+pad(t.getDate()); };
const thisMonth = () => today().slice(0,7);
const fmtDate = s => { if(!s) return ""; const [y,m,d]=s.split("-").map(Number); if(!y) return s; return new Date(y,m-1,d||1).toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"}); };
const fmtMonth = s => { if(!s) return ""; const [y,m]=s.split("-").map(Number); return new Date(y,m-1,1).toLocaleDateString(undefined,{month:"long",year:"numeric"}); };
const fmtWhen = iso => { if(!iso) return ""; const d=new Date(iso); return isNaN(d)?"":d.toLocaleString(undefined,{month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit"}); };
const fmtSize = b => b>=1048576?(b/1048576).toFixed(1)+" MB":Math.max(1,Math.round(b/1024))+" KB";
const MONEY = new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"});
const MONEY0 = new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0});
const money = n => MONEY.format(Number(n)||0);
const money0 = n => MONEY0.format(Number(n)||0);
const round2 = n => Math.round((Number(n)||0)*100)/100;
const slug = s => "s-"+String(s||"").toLowerCase().replace(/[^a-z]/g,"");
const nameOf = id => (id && S.names[id]) || (id ? "Someone" : "");
const isFocusedIn = sel => { const a=document.activeElement; return !!(a && a.closest && a.closest(sel)); };

let toastT;
function toast(msg, ms=4500){ const t=$("#toast"); t.textContent=msg; t.hidden=false; clearTimeout(toastT); toastT=setTimeout(()=>t.hidden=true,ms); }

/* ---------- API ---------- */
function url(path, query){ let u=CFG.rest+path; if(query) u+=(u.includes("?")?"&":"?")+query; return u; }
let expiredShown=false;
async function api(path, {method="GET", body, form}={}){
  const opt={method, credentials:"same-origin", headers:{"X-WP-Nonce":CFG.nonce}};
  if (form) opt.body=form; else if (body!==undefined){ opt.headers["Content-Type"]="application/json"; opt.body=JSON.stringify(body); }
  let r; try { r=await fetch(url(path), opt); } catch(e){ throw {code:"network", message:"Can't reach snpwholesale.com. Check your connection and try again."}; }
  let j=null; try { j=await r.json(); } catch(e){}
  if (!r.ok){
    const code=(j&&j.code)||("http_"+r.status);
    if ((code==="rest_cookie_invalid_nonce"||r.status===401) && !expiredShown){ expiredShown=true; sessionExpired(); }
    throw {code, status:r.status, message:(j&&j.message)||"Something went wrong. Try again."};
  }
  return j;
}
function sessionExpired(){
  closeAll();
  pushPanel(el("div",{class:"modal sm",role:"alertdialog","aria-modal":"true"},
    el("div",{class:"m-head"}, el("h2",{},"Your session ended")),
    el("div",{class:"m-body"}, el("p",{},"Sign-ins expire after a while for security. Reload the page to continue; if you're asked to sign in, you'll come straight back here."),
      el("div",{class:"row-actions"}, el("button",{class:"btn primary",type:"button",onclick:()=>location.reload()},"Reload")))), {locked:true});
}
const fail = e => toast(e && e.message ? e.message : "That didn't save. Try again.");

/* ---------- data ---------- */
function applyState(st){
  S.me=st.me; S.perms=st.perms||{}; S.access=st.access||{}; S.settings=st.settings;
  S.cats=st.cats||[]; S.statuses=st.statuses||[]; S.assignees=st.assignees||[];
  S.scope=st.scope||""; S.scopes=st.scopes||{}; S.maxUpload=st.maxUpload||0; S.today=st.today||"";
  S.names=Object.assign({}, st.names||{});
  S.docs=new Map((st.docs||[]).map(d=>[String(d.id),d]));
  S.tpls=new Map((st.templates||[]).map(t=>[t.key,t]));
  S.people=st.people||[]; S.activity=st.activity||[];
  S.items=st.items||{}; reindex();
  S.loaded=true; S.failed="";
}
function reindex(){ S.byId={}; for (const [type,list] of Object.entries(S.items)){ S.byId[type]=new Map(list.map(i=>[i.id,i])); } }
const items = type => S.items[type]||[];
const item = (type,id) => (S.byId[type]&&S.byId[type].get(Number(id)))||null;
const can = (type, need="r") => { const m=S.access[type]||""; return need==="rw" ? m==="rw" : !!m; };
const customerName = id => { const c=item("customer",id); return c?(c.data.name||"Unnamed customer"):(id?"Deleted customer":""); };
const supplierName = id => { const c=item("supplier",id); return c?(c.data.name||"Unnamed supplier"):(id?"Deleted supplier":""); };
function putItem(it){
  const list=S.items[it.type]||(S.items[it.type]=[]);
  const i=list.findIndex(x=>x.id===it.id); if(i>=0) list[i]=it; else list.push(it);
  (S.byId[it.type]||(S.byId[it.type]=new Map())).set(it.id,it);
}
function dropItem(type,id){ S.items[type]=(S.items[type]||[]).filter(x=>x.id!==Number(id)); if(S.byId[type]) S.byId[type].delete(Number(id)); }
async function saveItem(type, id, data){
  S.pending++;
  try{
    const it = id ? await api("items/"+id,{method:"POST",body:{data}}) : await api("items",{method:"POST",body:{type,data}});
    putItem(it); if(it.updatedBy&&!S.names[it.updatedBy]&&S.me) S.names[it.updatedBy]=S.me.name;
    return it;
  } finally { S.pending--; }
}
async function deleteItem(type,id){ await api("items/"+id,{method:"DELETE"}); dropItem(type,id); }

let loading=false;
async function load(){
  if (loading) return; loading=true;
  try { applyState(await api("state")); }
  catch(e){ if(!S.loaded) S.failed=e.message||"The back office couldn't load."; }
  finally { loading=false; renderShell(); renderView(); modules.forEach(m=>m.onData&&m.onData()); }
}

/* ---------- panels (drawers and modals, stacked) ---------- */
const stack=[];
function pushPanel(node, opts={}){
  const layer=$("#layer"); const z=20+stack.length*2;
  const scrim=el("div",{class:"scrim",style:`z-index:${z}`}); node.style.zIndex=z+1;
  if(!opts.locked) scrim.addEventListener("click",()=>closeTop());
  layer.append(scrim,node); const entry={node,scrim,onClose:opts.onClose};
  stack.push(entry);
  setTimeout(()=>{ const f=node.querySelector("[autofocus]")||node.querySelector(".x"); if(f) f.focus(); },0);
  return entry;
}
function closeTop(){ const e=stack.pop(); if(!e) return; e.node.remove(); e.scrim.remove(); if(e.onClose) e.onClose(); }
function closePanel(node){ const i=stack.findIndex(e=>e.node===node); if(i<0) return; while(stack.length>i) closeTop(); }
function closeAll(){ while(stack.length) closeTop(); }
const xBtn = onclick => el("button",{class:"x",type:"button","aria-label":"Close",onclick},"×");
function drawer(title, eyebrow, body, {wide=false, onClose}={}){
  const d=el("aside",{class:"drawer"+(wide?" wide":""),role:"dialog","aria-modal":"true"});
  d.append(el("div",{class:"d-head"}, el("div",{style:"min-width:0"}, eyebrow?el("div",{class:"eyebrow"},eyebrow):null, el("h2",{},title)), xBtn(()=>closePanel(d))),
    el("div",{class:"d-body"}, body));
  pushPanel(d,{onClose}); return d;
}
function modal(title, body, {actions=[], size="", onClose}={}){
  const m=el("div",{class:"modal "+size,role:"dialog","aria-modal":"true"});
  m.append(el("div",{class:"m-head"}, el("h2",{},title), ...actions, xBtn(()=>closePanel(m))), el("div",{class:"m-body"}, body));
  pushPanel(m,{onClose}); return m;
}
function confirmBtn(label, question, onYes, cls="btn small ghost"){
  const b=el("button",{class:cls,type:"button"},label);
  b.onclick=()=>{ const box=el("span",{class:"confirm"}, question+" ",
      el("button",{class:"btn small danger",type:"button",onclick:async()=>{ try{ await onYes(); }catch(e){ fail(e); box.replaceWith(b); } }},"Yes, delete"),
      el("button",{class:"btn small ghost",type:"button",onclick:()=>box.replaceWith(b)},"Cancel"));
    b.replaceWith(box); };
  return b;
}

/* ---------- forms ---------- */
let fid=0;
function field(def, value, ro){
  const id="f"+(++fid)+"-"+def.key; let input;
  const dis = ro||def.readonly ? true : null;
  switch(def.type){
    case "textarea": input=el("textarea",{id,rows:def.rows||3,placeholder:def.placeholder||null,disabled:dis}); input.value=value??""; break;
    case "select": case "customer": case "supplier": case "user": case "deal": {
      let opts=def.options;
      if (def.type==="customer") opts=[["","Choose a customer"],...items("customer").slice().sort((a,b)=>(a.data.name||"").localeCompare(b.data.name||"")).map(c=>[String(c.id),c.data.name])];
      if (def.type==="supplier") opts=[["","Choose a supplier"],...items("supplier").slice().sort((a,b)=>(a.data.name||"").localeCompare(b.data.name||"")).map(c=>[String(c.id),c.data.name])];
      if (def.type==="deal") opts=[["","None"],...items("deal").map(c=>[String(c.id),c.data.title])];
      if (def.type==="user") opts=[["","Unassigned"],...peopleWithAccess().map(p=>[String(p.id),p.name])];
      input=el("select",{id,disabled:dis}, ...(opts||[]).map(o=>Array.isArray(o)?el("option",{value:o[0]},o[1]):el("option",{value:o},o||"—")));
      input.value=value==null||value===0?"":String(value);
      if (input.value!==String(value??"") && value) { input.append(el("option",{value:String(value)},String(value))); input.value=String(value); }
      break; }
    case "multi": {
      input=el("div",{class:"multi",id});
      (def.options||[]).forEach(o=>{ const cid=id+"-"+o.replace(/\W/g,""); input.append(el("label",{class:"chk",for:cid}, el("input",{type:"checkbox",id:cid,value:o,checked:(value||[]).includes(o)||null,disabled:dis}), o)); });
      break; }
    case "checkbox": input=el("input",{type:"checkbox",id,checked:value?true:null,disabled:dis}); break;
    case "money": input=el("input",{type:"number",id,step:"0.01",inputmode:"decimal",value:value===""||value==null?"":value,disabled:dis,placeholder:"0.00"}); break;
    case "number": input=el("input",{type:"number",id,step:def.step||"any",inputmode:"decimal",value:value??"",disabled:dis}); break;
    case "date": input=el("input",{type:"date",id,value:value||"",disabled:dis}); break;
    case "month": input=el("input",{type:"month",id,value:value||"",disabled:dis,placeholder:"YYYY-MM"}); break;
    default: input=el("input",{type:def.type==="email"?"email":"text",id,value:value??"",placeholder:def.placeholder||null,disabled:dis,autocomplete:"off"});
  }
  input.dataset.key=def.key; input.dataset.type=def.type||"text";
  const wrap=el("div",{class:"field"+(def.full||def.type==="textarea"||def.type==="multi"?" full":"")});
  if (def.type==="checkbox") wrap.append(el("label",{class:"chk",for:id}, input, def.label));
  else wrap.append(el("label",{for:id}, def.label), input);
  if (def.hint) wrap.append(el("div",{class:"hint"}, def.hint));
  return wrap;
}
function form(defs, values={}, ro=false){
  const f=el("div",{class:"fields"});
  defs.forEach(d=>f.append(d.section?el("div",{class:"sec-h full"},d.section):field(d, values[d.key], ro)));
  return f;
}
function readForm(root){
  const out={};
  root.querySelectorAll("[data-key]").forEach(n=>{
    const k=n.dataset.key, t=n.dataset.type;
    if (t==="multi") out[k]=[...n.querySelectorAll("input:checked")].map(i=>i.value);
    else if (t==="checkbox") out[k]=n.checked;
    else if (t==="money"||t==="number") out[k]=n.value===""?0:Number(n.value);
    else if (["customer","supplier","user","deal"].includes(t)) out[k]=n.value?Number(n.value):0;
    else out[k]=n.value;
  });
  return out;
}
function peopleWithAccess(){
  if (S.people.length) return S.people.filter(p=>p.role);
  return S.me?[{id:S.me.id,name:S.me.name}]:[];
}

/* generic record editor in a drawer */
function editRecord({type, id=null, title, eyebrow="", fields, defaults={}, after, extra, onSaved, onDeleted, wide=false}){
  const it = id ? item(type,id) : null;
  const ro = !can(type,"rw");
  const values = Object.assign({}, defaults, it?it.data:{});
  const f=form(fields, values, ro);
  const err=el("div",{class:"err",role:"alert"});
  const save=el("button",{class:"btn primary",type:"button"}, it?"Save changes":"Save");
  const body=el("div",{class:"stack"}, f, err);
  const actions=el("div",{class:"row-actions"});
  if (!ro) actions.append(save);
  if (it && can(type,"rw")) actions.append(confirmBtn("Delete","Delete this permanently?", async()=>{ await deleteItem(type,it.id); closePanel(d); toast("Deleted."); onDeleted&&onDeleted(); refresh(); }));
  body.append(actions);
  if (it) body.append(el("div",{class:"foot"}, el("span",{}, "Last updated by "+nameOf(it.updatedBy)+" · "+fmtWhen(it.updatedAt))));
  if (extra && it) body.append(extra(it));
  const d=drawer(typeof title==="function"?title(it):title, eyebrow, body, {wide});
  save.onclick=async()=>{
    err.textContent=""; save.disabled=true;
    try{ const data=Object.assign({}, it?it.data:{}, defaults&&!it?defaults:{}, readForm(f));
      const saved=await saveItem(type, it?it.id:null, data);
      toast(it?"Saved.":"Added."); closePanel(d); refresh(); onSaved&&onSaved(saved);
    } catch(e){ err.textContent=e.message||"That didn't save."; save.disabled=false; }
  };
  if (after) after(d, it);
  return d;
}

/* ---------- tables ---------- */
function table({columns, rows, onRow, empty="Nothing here yet.", foot}){
  if (!rows.length) return el("div",{class:"empty"}, empty);
  const t=el("table",{class:"list"});
  t.append(el("thead",{}, el("tr",{}, columns.map(c=>el("th",{class:c.cls||null}, c.label)))));
  const tb=el("tbody");
  rows.forEach(r=>{ const tr=el("tr",{tabindex:onRow?"0":null,class:onRow?"click":null});
    columns.forEach(c=>{ const v=c.value(r); tr.append(el("td",{class:c.cls||null,"data-label":c.label}, v)); });
    if (onRow){ tr.onclick=e=>{ if(e.target.closest("button,select,a,input")) return; onRow(r); }; tr.onkeydown=e=>{ if(e.key==="Enter"&&e.target===tr) onRow(r); }; }
    tb.append(tr); });
  t.append(tb); if (foot) t.append(el("tfoot",{}, foot));
  return el("div",{class:"tbl-wrap"}, t);
}
const badge = (text, kind) => el("span",{class:"badge "+(kind||slug(text))}, text);
function kpi(value, label, cls=""){ return el("div",{class:"kpi "+cls}, el("div",{class:"big"}, value), el("div",{class:"lbl"}, label)); }
function toolbar(...kids){ return el("div",{class:"filters"}, ...kids); }
function search(placeholder, oninput){ const i=el("input",{type:"search",placeholder,"aria-label":placeholder}); i.addEventListener("input",oninput); return i; }
function selectEl(options, value, onchange, label){ const s=el("select",{"aria-label":label||null}, ...options.map(o=>Array.isArray(o)?el("option",{value:o[0]},o[1]):el("option",{value:o},o))); s.value=value; s.onchange=()=>onchange(s.value); return s; }
function subtabs(list, active, onpick){ return el("div",{class:"subtabs",role:"tablist"}, list.map(([id,label])=>el("button",{type:"button",role:"tab","aria-selected":String(id===active),class:"subtab",onclick:()=>onpick(id)},label))); }
function pageHead(title, sub, ...actions){ return el("div",{class:"page-head"}, el("div",{style:"min-width:0"}, el("h2",{class:"page-title"},title), sub?el("p",{class:"page-sub"},sub):null), el("div",{class:"row-actions"}, actions)); }

/* ---------- files out ---------- */
function saveBlob(filename, blob){ const a=el("a",{href:URL.createObjectURL(blob),download:filename}); document.body.append(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); },2000); }
function csv(filename, header, rows){
  const q=v=>`"${String(v??"").replace(/"/g,'""')}"`;
  saveBlob(filename, new Blob(["﻿"+[header,...rows].map(r=>r.map(q).join(",")).join("\r\n")],{type:"text/csv"}));
}
async function copyText(text){
  try{ await navigator.clipboard.writeText(text); toast("Copied."); }
  catch(e){ toast("Copy isn't available here. Select the text and copy it instead."); }
}
const esc = s => String(s??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const nl2br = s => esc(s).replace(/\n/g,"<br>");
/* Opens a print-ready page (Print, or Save as PDF from the print dialog). */
function printHTML(title, bodyHTML){
  const w=window.open("","_blank");
  if (!w){ toast("Allow pop-ups for snpwholesale.com to print."); return; }
  w.document.open();
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
*{box-sizing:border-box}body{font:13px/1.45 Arial,Helvetica,sans-serif;color:#181415;margin:0;padding:32px;background:#fff}
.sheet{max-width:800px;margin:0 auto}.hd{display:flex;justify-content:space-between;gap:24px;align-items:flex-start;border-bottom:3px solid #181415;padding-bottom:16px}
.hd img{width:76px;height:76px;border-radius:50%}.co{display:flex;gap:14px;align-items:center}.co b{font-size:18px}.muted{color:#665E60}
h1{font:italic 700 30px/1 "Arial Narrow",Arial,sans-serif;margin:0;color:#C8102E;text-align:right;letter-spacing:.02em}.meta{text-align:right;margin-top:6px}
.cols{display:flex;gap:24px;margin:22px 0}.cols>div{flex:1}.lbl{font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#665E60;margin-bottom:4px}
table{width:100%;border-collapse:collapse;margin-top:6px}th{font-size:10px;letter-spacing:.1em;text-transform:uppercase;text-align:left;border-bottom:2px solid #181415;padding:7px 6px}
td{padding:8px 6px;border-bottom:1px solid #E1DBDC;vertical-align:top}.r{text-align:right;white-space:nowrap}.tot{margin-left:auto;width:300px;margin-top:10px}
.tot td{border:0;padding:4px 6px}.tot .g td{border-top:2px solid #181415;font-weight:700;font-size:15px;padding-top:8px}.box{margin-top:22px;padding:12px 14px;border:1px solid #E1DBDC;border-radius:6px}
.foot{margin-top:28px;font-size:11px;color:#665E60;border-top:1px solid #E1DBDC;padding-top:10px}.stamp{display:inline-block;border:2px solid #15703A;color:#15703A;font-weight:700;padding:3px 10px;border-radius:4px;letter-spacing:.1em}
@media print{body{padding:0}.noprint{display:none}}
.noprint{position:sticky;top:0;background:#fff;padding:10px 0;margin-bottom:12px;border-bottom:1px solid #E1DBDC;display:flex;gap:8px}
.noprint button{font:600 14px Arial;padding:8px 14px;border-radius:6px;border:1px solid #181415;background:#181415;color:#fff;cursor:pointer}.noprint button.alt{background:#fff;color:#181415}
</style></head><body><div class="sheet"><div class="noprint"><button onclick="print()">Print / Save as PDF</button><button class="alt" onclick="close()">Close</button></div>${bodyHTML}</div></body></html>`);
  w.document.close();
  setTimeout(()=>{ try{ w.focus(); w.print(); }catch(e){} }, 500);
}
function companyBlock(){
  const s=S.settings||{};
  return `<div class="co"><img src="${esc(CFG.logo)}" alt=""><div><b>${esc(s.companyName)}</b><div class="muted">${nl2br(s.companyAddress)}<br>${esc(s.companyPhone)} · ${esc(s.companyEmail)}<br>${esc(s.companyWebsite)}</div></div></div>`;
}

/* ---------- layout ---------- */
function module(def){ modules.push(def); }
function visibleModules(){ return modules.filter(m=>!m.visible||m.visible()); }
function go(id, arg=""){ location.hash = arg?`${id}/${arg}`:id; }
function parseHash(){ const h=location.hash.slice(1); const [id,...rest]=h.split("/"); return {id:id||"home", arg:rest.join("/")}; }
function renderShell(){
  const who=$("#who"); who.replaceChildren();
  if (S.me) who.append(el("span",{class:"who-name"}, S.me.name), el("span",{class:"role-chip"}, S.me.roleLabel), el("a",{href:CFG.account},"Account"), el("a",{href:CFG.logout},"Sign out"));
  const nav=$("#nav"); nav.replaceChildren();
  let group="";
  visibleModules().forEach(m=>{
    if (m.group && m.group!==group){ group=m.group; nav.append(el("div",{class:"nav-group"}, group)); }
    const badgeN = m.badge ? m.badge() : 0;
    nav.append(el("a",{href:"#"+m.id,class:"nav-item"+(current.id===m.id?" on":""),"aria-current":current.id===m.id?"page":null}, m.label, badgeN?el("span",{class:"nav-badge"}, String(badgeN)):null));
  });
}
function renderView(){
  const main=$("#main");
  if (S.failed){ main.replaceChildren(el("div",{class:"empty"}, el("b",{},"The back office didn't load"), S.failed, el("div",{style:"margin-top:12px"}, el("button",{class:"btn",type:"button",onclick:()=>{S.failed="";renderView();load();}},"Try again")))); return; }
  if (!S.loaded){ main.replaceChildren(el("div",{class:"empty"}, el("b",{},"Loading…"), "Your dashboard appears here once it loads.")); return; }
  let {id,arg}=parseHash();
  let m=visibleModules().find(x=>x.id===id);
  if (!m){ m=visibleModules()[0]; id=m.id; arg=""; }
  const changed = current.id!==id || current.arg!==arg;
  current={id,arg};
  const keepScroll = !changed ? window.scrollY : 0;
  main.replaceChildren(); m.render(main, arg);
  if (!changed) window.scrollTo(0, keepScroll); else window.scrollTo(0,0);
  document.title = m.label+" · SNP Records";
  renderShell();
}
/* Re-render the current page unless someone is typing in it. */
function refresh(force){ if (!force && isFocusedIn("#main input, #main textarea")) { renderShell(); return; } renderView(); }
const busy = () => S.pending>0 || stack.length>0 || isFocusedIn("#main input, #main textarea, #main select");

function start(){
  window.addEventListener("hashchange", ()=>{ closeAll(); renderView(); });
  document.addEventListener("keydown",e=>{ if(e.key!=="Escape"||!stack.length) return; const top=stack[stack.length-1].node; if(top.matches("[role=alertdialog],[data-noesc]")) return; closeTop(); });
  $("#navToggle").addEventListener("click",()=>{ const n=$("#nav"); const open=n.classList.toggle("open"); $("#navToggle").setAttribute("aria-expanded",String(open)); });
  $("#nav").addEventListener("click",e=>{ if(e.target.closest("a")){ $("#nav").classList.remove("open"); $("#navToggle").setAttribute("aria-expanded","false"); } });
  setInterval(()=>{ if(document.visibilityState==="visible"&&!busy()) load(); }, 30000);
  document.addEventListener("visibilitychange",()=>{ if(document.visibilityState==="visible"&&!busy()) load(); });
  renderView(); load();
}

return { CFG, S, el, $, pad, today, addDays, thisMonth, fmtDate, fmtMonth, fmtWhen, fmtSize, money, money0, round2, slug, nameOf, isFocusedIn,
  toast, api, url, fail, load, items, item, can, customerName, supplierName, putItem, dropItem, saveItem, deleteItem,
  pushPanel, closeTop, closePanel, closeAll, drawer, modal, confirmBtn, field, form, readForm, peopleWithAccess, editRecord,
  table, badge, kpi, toolbar, search, selectEl, subtabs, pageHead, saveBlob, csv, copyText, esc, nl2br, printHTML, companyBlock,
  module, go, refresh, renderShell, start, get current(){ return current; } };
})();

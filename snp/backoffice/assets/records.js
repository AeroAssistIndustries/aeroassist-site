/* Company records checklist + contract templates. */
(() => {
"use strict";
const { S, el, $, api, url, toast, fail, fmtDate, fmtWhen, fmtSize, slug, nameOf, CFG } = SNP;
const STATUS_COLOR = {"On file":"var(--good)","Needs review":"var(--info)","In progress":"var(--warn)","Missing":"var(--bad)","Not checked":"var(--line)"};
const ACCEPT = ".pdf,.jpg,.jpeg,.png,.gif,.webp,.heic,.heif,.doc,.docx,.xls,.xlsx,.csv,.txt";
const isDone = d => d.status==="On file"||d.status==="Not needed";
const isOver = d => d.due && d.due < SNP.today() && !isDone(d);
const catLabel = k => (S.cats.find(c=>c.key===k)||{}).label || k;
const F = { q:"", status:"", pri:"", div:"", who:"", hide:false };
try{ F.hide = localStorage.getItem("snp-hide-nn")==="1"; }catch(e){}
let open = null; // {id, node}

/* serialize writes per document */
const queues={};
function patchDoc(id, patch){
  const key=String(id), cur=S.docs.get(key); if(!cur) return Promise.resolve(false);
  S.docs.set(key,{...cur,...patch}); S.pending++;
  const run=()=>api("docs/"+id,{method:"POST",body:patch}).then(d=>{ const local=S.docs.get(key); S.docs.set(key, SNP.isFocusedIn(".rec-drawer textarea")?{...d,notes:local.notes}:d); return true; })
    .catch(e=>{ fail(e); SNP.load(); return false; }).finally(()=>{ S.pending--; SNP.refresh(); sync(); });
  const p=(queues[key]||Promise.resolve()).then(run); queues[key]=p; return p;
}

function summary(){
  const all=[...S.docs.values()], live=all.filter(d=>d.status!=="Not needed");
  const counts={}; all.forEach(d=>counts[d.status]=(counts[d.status]||0)+1);
  const bar=el("div",{class:"bar","aria-hidden":"true"}), legend=el("div",{class:"legend"});
  ["On file","Needs review","In progress","Missing","Not checked"].forEach(s=>{ const n=counts[s]||0;
    if(live.length) bar.append(el("span",{style:`width:${n/live.length*100}%;background:${STATUS_COLOR[s]}`,title:`${s}: ${n}`}));
    legend.append(el("span",{}, el("i",{style:`background:${STATUS_COLOR[s]}`}), `${s} ${n}`)); });
  return el("section",{class:"summary"},
    el("div",{}, el("div",{class:"big"}, String(counts["On file"]||0), el("small",{}," / "+live.length+" on file")), bar, legend),
    el("div",{class:"k-crit"}, el("div",{class:"big"},String(all.filter(d=>d.priority==="Critical"&&!isDone(d)).length)), el("div",{class:"lbl"},"Critical, not on file")),
    el("div",{}, el("div",{class:"big"},String(counts["Needs review"]||0)), el("div",{class:"lbl"},"Waiting on review")),
    el("div",{class:"k-over"}, el("div",{class:"big"},String(all.filter(isOver).length)), el("div",{class:"lbl"},"Past due date")));
}
function passes(d){
  const q=F.q.trim().toLowerCase();
  if (q && !(`${d.code} ${d.title} ${d.why} ${d.notes} ${d.assignee}`.toLowerCase().includes(q))) return false;
  if (F.status==="__open"&&isDone(d)) return false;
  if (F.status&&F.status!=="__open"&&d.status!==F.status) return false;
  if (F.pri&&d.priority!==F.pri) return false;
  if (F.div&&!(d.division||"").includes(F.div)&&d.division!=="All divisions") return false;
  if (F.who==="__none"&&d.assignee) return false; if(F.who&&F.who!=="__none"&&d.assignee!==F.who) return false;
  if (F.hide&&d.status==="Not needed") return false;
  return true;
}
function clip(){ const ns="http://www.w3.org/2000/svg", s=document.createElementNS(ns,"svg");
  s.setAttribute("viewBox","0 0 24 24"); s.setAttribute("fill","none"); s.setAttribute("stroke","currentColor"); s.setAttribute("stroke-width","2"); s.setAttribute("aria-hidden","true");
  const p=document.createElementNS(ns,"path"); p.setAttribute("d","M21 11.5l-8.6 8.6a5 5 0 0 1-7.1-7.1l8.6-8.6a3.5 3.5 0 0 1 5 5l-8.6 8.6a2 2 0 0 1-2.8-2.8l7.9-7.9"); s.append(p); return s; }
function statusSelect(d){
  const sel=el("select",{class:"pill "+slug(d.status),"aria-label":"Status for "+d.title, disabled:!S.perms.editDocs||null});
  S.statuses.forEach(s=>sel.append(el("option",{value:s},s))); sel.value=d.status;
  ["click","keydown"].forEach(ev=>sel.addEventListener(ev,e=>e.stopPropagation()));
  sel.addEventListener("change",e=>{ e.stopPropagation(); patchDoc(d.id,{status:sel.value}); });
  return sel;
}
function listEl(){
  const box=el("div",{id:"rec-list"});
  if (!S.docs.size){ box.append(el("div",{class:"empty"}, el("b",{},"No documents yet"), S.perms.addDocs?"Use Add document to start the checklist.":"Nothing has been shared with you yet.")); return box; }
  let shown=0;
  for (const c of S.cats){
    const docs=[...S.docs.values()].filter(d=>d.cat===c.key).sort((a,b)=>a.order-b.order||a.code.localeCompare(b.code));
    const vis=docs.filter(passes); if(!vis.length) continue; shown+=vis.length;
    const live=docs.filter(d=>d.status!=="Not needed");
    const sec=el("section",{class:"cat"}, el("div",{class:"cat-h"}, el("h2",{},c.label), el("span",{class:"mono"}, `${live.filter(d=>d.status==="On file").length}/${live.length} on file`)));
    for (const d of vis){
      const tags=el("div",{class:"tags"}, el("span",{class:"tag"+(d.priority==="Critical"?" crit":"")}, d.priority));
      if (d.division&&d.division!=="All divisions") tags.append(el("span",{class:"tag"}, d.division));
      if (d.template&&S.tpls.has(d.template)) tags.append(el("span",{class:"tag tpl"}, "Template ready"));
      const row=el("div",{class:"row",role:"button",tabindex:"0","aria-label":"Open "+d.title,
        onclick:()=>openDoc(d.id), onkeydown:e=>{ if((e.key==="Enter"||e.key===" ")&&e.target===row){ e.preventDefault(); openDoc(d.id);} }},
        el("span",{class:"code mono"}, d.code),
        el("div",{style:"min-width:0"}, el("div",{class:"t"}, d.title), el("div",{class:"w"}, d.why), tags),
        el("div",{class:"r-rest"},
          el("div",{class:"r-status"}, statusSelect(d)),
          el("div",{class:"r-assn assn"+(d.assignee?"":" none")}, d.assignee||"Unassigned"),
          el("div",{class:"r-due due"+(isOver(d)?" over":d.due?"":" none")}, d.due?(isOver(d)?"Overdue · ":"")+fmtDate(d.due):"No date"),
          el("div",{class:"r-fc fc"}, d.files.length?[clip(), String(d.files.length)]:"")));
      sec.append(row);
    }
    box.append(sec);
  }
  if (!shown) box.append(el("div",{class:"empty"}, el("b",{},"Nothing matches these filters"), "Clear the search or set the filters back to Any."));
  return box;
}
function renderRecords(main){
  const sel=(opts,key,label)=>SNP.selectEl(opts,F[key],v=>{F[key]=v; $("#rec-list").replaceWith(listEl());},label);
  const q=SNP.search("Search documents", e=>{ F.q=e.target.value; $("#rec-list").replaceWith(listEl()); }); q.value=F.q;
  const hide=el("input",{type:"checkbox",id:"rec-hide",checked:F.hide||null});
  hide.onchange=()=>{ F.hide=hide.checked; try{ localStorage.setItem("snp-hide-nn",F.hide?"1":"0"); }catch(e){} $("#rec-list").replaceWith(listEl()); };
  main.append(
    SNP.pageHead("Company records", S.scope?`Shared with you: ${S.scope}.`:"Every document SNP needs, where it stands, and the files themselves.",
      el("button",{class:"btn ghost",type:"button",onclick:exportCSV},"Export CSV"),
      S.perms.addDocs?el("button",{class:"btn primary",type:"button",onclick:openAdd},"+ Add document"):null),
    summary(),
    SNP.toolbar(q,
      sel([["","Any status"],["__open","Still to do"],...S.statuses.map(s=>[s,s])],"status","Status"),
      sel([["","Any priority"],"Critical","Important","As needed"].map(x=>Array.isArray(x)?x:[x,x]),"pri","Priority"),
      sel([["","All divisions"],["Oil","Oil"],["Phones & electronics","Phones & electronics"],["Commercial supply","Commercial supply"]],"div","Division"),
      sel([["","Anyone"],["__none","Unassigned"],...S.assignees.map(a=>[a,a])],"who","Assigned to"),
      el("label",{class:"chk",for:"rec-hide"}, hide, "Hide not needed")),
    listEl());
}

/* ---------- record drawer ---------- */
function openDoc(id){
  const d=S.docs.get(String(id)); if(!d) return;
  const canMeta=!!S.perms.editDetails, canEdit=!!S.perms.editDocs;
  const sel=(id,opts,val,dis,on)=>{ const s=el("select",{id,disabled:dis||null}); opts.forEach(o=>s.append(Array.isArray(o)?el("option",{value:o[0]},o[1]):el("option",{value:o},o))); s.value=val; s.onchange=()=>on(s.value); return s; };
  const asgOpts=[["","Unassigned"],...S.assignees.map(a=>[a,a])]; if(d.assignee&&!S.assignees.includes(d.assignee)) asgOpts.push([d.assignee,d.assignee]);
  const notes=el("textarea",{id:"d-notes",placeholder:"Where the original is kept, who has it, what's still needed…",disabled:!canEdit||null}); notes.value=d.notes||"";
  let nt; const saveNotes=()=>{ clearTimeout(nt); const cur=S.docs.get(String(d.id)); if(cur&&cur.notes!==notes.value) patchDoc(d.id,{notes:notes.value}); };
  notes.oninput=()=>{ clearTimeout(nt); nt=setTimeout(saveNotes,1200); }; notes.onblur=saveNotes;
  const due=el("input",{type:"date",id:"d-due",value:d.due||"",disabled:!canEdit||null}); due.onchange=()=>patchDoc(d.id,{due:due.value});
  const ren=el("input",{type:"text",id:"d-ren",value:d.renews||"",placeholder:"e.g. Annual renewal",disabled:!canMeta||null}); ren.onchange=()=>patchDoc(d.id,{renews:ren.value.trim()});
  const tpl=d.template&&S.tpls.get(d.template);
  const body=el("div",{class:"stack"},
    el("p",{class:"why"}, d.why||""),
    el("div",{class:"fields"},
      el("div",{class:"field"}, el("label",{for:"d-st"},"Status"), sel("d-st",S.statuses,d.status,!canEdit,v=>patchDoc(d.id,{status:v}))),
      el("div",{class:"field"}, el("label",{for:"d-asg"},"Assigned to"), sel("d-asg",asgOpts,d.assignee||"",!canMeta,v=>patchDoc(d.id,{assignee:v}))),
      el("div",{class:"field"}, el("label",{for:"d-due"},"Due date"), due),
      el("div",{class:"field"}, el("label",{for:"d-pri"},"Priority"), sel("d-pri",["Critical","Important","As needed"],d.priority,!canMeta,v=>patchDoc(d.id,{priority:v}))),
      el("div",{class:"field full"}, el("label",{for:"d-ren"},"Renewal"), ren),
      el("div",{class:"field full"}, el("label",{},"Division"), el("div",{}, d.division||"All divisions")),
      el("div",{class:"field full"}, el("label",{for:"d-notes"},"Notes"), notes)),
    el("div",{}, el("div",{class:"sec-h",style:"margin-bottom:8px"},"Files"), el("div",{class:"files",id:"d-files"}), uploadZone(d)),
    tpl?el("div",{class:"tplbox"}, el("div",{}, el("div",{class:"sec-h"},"Starter template"), el("div",{style:"font-weight:600"}, tpl.name)),
      el("button",{class:"btn small",type:"button",onclick:()=>openTemplate(tpl.key)},"Open template")):null,
    SNP.can("task","rw")?el("div",{}, el("button",{class:"btn small ghost",type:"button",onclick:()=>SNP.newTask({relatedType:"record",relatedId:d.id,relatedLabel:d.code+" "+d.title,title:"Get "+d.title,due:d.due})},"+ Task for this")):null,
    el("div",{class:"foot",id:"d-foot"}));
  const node=SNP.drawer(d.title, d.code+" · "+catLabel(d.cat), body, {onClose:()=>{ open=null; }});
  node.classList.add("rec-drawer");
  open={id:String(d.id), node}; sync();
}
function sync(){
  if (!open || !open.node.isConnected) return;
  const d=S.docs.get(open.id); if(!d){ SNP.closePanel(open.node); return; }
  const act=document.activeElement, n=open.node;
  const set=(id,v)=>{ const x=n.querySelector("#"+id); if(x&&x!==act&&x.value!==v) x.value=v; };
  set("d-st",d.status); set("d-asg",d.assignee||""); set("d-due",d.due||""); set("d-pri",d.priority); set("d-ren",d.renews||""); set("d-notes",d.notes||"");
  const fl=n.querySelector("#d-files"); fl.replaceChildren();
  if (!d.files.length) fl.append(el("div",{class:"muted small"},"No files yet."));
  d.files.forEach(f=>{
    const row=el("div",{class:"file"},
      el("a",{href:url("files/"+f.id,"_wpnonce="+encodeURIComponent(CFG.nonce)),target:"_blank",rel:"noopener"}, f.name||"File"),
      el("span",{class:"meta"}, fmtSize(f.size||0)+" · "+nameOf(f.by)+" · "+fmtDate((f.at||"").slice(0,10))),
      el("a",{href:url("files/"+f.id,"download=1&_wpnonce="+encodeURIComponent(CFG.nonce)),class:"btn small ghost",style:"flex:none",title:"Download","aria-label":"Download "+f.name},"↓"));
    if (S.perms.deleteDocs||(S.me&&f.by===S.me.id)) row.append(SNP.confirmBtn("Remove","Delete this file?", async()=>{ const nd=await api("files/"+f.id,{method:"DELETE"}); S.docs.set(String(nd.id),nd); toast("File deleted."); sync(); SNP.refresh(); }));
    fl.append(row);
  });
  const ft=n.querySelector("#d-foot");
  ft.replaceChildren(el("span",{}, d.updatedAt?"Last updated by "+nameOf(d.updatedBy)+" · "+fmtWhen(d.updatedAt):"Not edited yet"),
    S.perms.deleteDocs?SNP.confirmBtn("Delete document", d.files.length?`Delete this and its ${d.files.length} file(s)?`:"Delete this document?", async()=>{ await api("docs/"+d.id,{method:"DELETE"}); S.docs.delete(String(d.id)); SNP.closePanel(n); toast("Document deleted."); SNP.refresh(); }):"");
}
function uploadZone(d){
  if (!S.perms.uploadFiles) return el("div",{class:"drop"},"You can view files but not add them.");
  const inp=el("input",{type:"file",multiple:true,accept:ACCEPT,style:"display:none"});
  const zone=el("div",{class:"drop",style:"margin-top:8px"}, el("button",{class:"btn small",type:"button",onclick:()=>inp.click()},"Upload file"),
    el("div",{style:"margin-top:6px"}, "or drop files here · PDF, photo, Word, Excel, CSV or text"+(S.maxUpload?` · up to ${fmtSize(S.maxUpload)}`:"")), inp);
  inp.onchange=()=>{ upload(d.id,[...inp.files]); inp.value=""; };
  zone.ondragover=e=>{ e.preventDefault(); zone.classList.add("on"); };
  zone.ondragleave=()=>zone.classList.remove("on");
  zone.ondrop=e=>{ e.preventDefault(); zone.classList.remove("on"); upload(d.id,[...e.dataTransfer.files]); };
  return zone;
}
async function upload(id, files){
  for (const f of files){
    if (S.maxUpload && f.size>S.maxUpload){ toast(`${f.name} is larger than this site allows (${fmtSize(S.maxUpload)}).`); continue; }
    toast(`Uploading ${f.name}…`, 60000);
    const form=new FormData(); form.append("file", f, f.name);
    try{ const d=await api("docs/"+id+"/files",{method:"POST",form}); S.docs.set(String(d.id),d); sync(); SNP.refresh(); toast(`${f.name} uploaded.`); }
    catch(e){ toast(`${f.name}: ${e.message}`); }
  }
}
function exportCSV(){
  const rows=[]; for (const c of S.cats) [...S.docs.values()].filter(d=>d.cat===c.key).sort((a,b)=>a.order-b.order)
    .forEach(d=>rows.push([d.code,c.label,d.title,d.priority,d.division,d.status,d.assignee,d.due,d.renews,d.files.length,d.notes]));
  SNP.csv("SNP document checklist "+SNP.today()+".csv", ["Code","Category","Document","Priority","Division","Status","Assigned to","Due date","Renewal","Files","Notes"], rows);
}
function openAdd(){
  const f=SNP.form([
    {key:"title",label:"Document name",full:true,placeholder:"e.g. Florida resale certificate"},
    {key:"cat",label:"Category",type:"select",options:S.cats.map(c=>[c.key,c.label])},
    {key:"priority",label:"Priority",type:"select",options:["Important","Critical","As needed"]},
    {key:"division",label:"Division",type:"select",options:["All divisions","Oil","Phones & electronics","Commercial supply"],full:true},
    {key:"why",label:"Description",type:"textarea",placeholder:"What it is and why SNP needs it"}], {cat:S.cats[0]&&S.cats[0].key,priority:"Important",division:"All divisions"});
  const err=el("div",{class:"err",role:"alert"}), add=el("button",{class:"btn primary",type:"button"},"Add to checklist");
  const m=SNP.modal("Add a document", el("div",{class:"stack"}, f, err, el("div",{class:"row-actions"}, add)), {size:"sm"});
  add.onclick=async()=>{ const v=SNP.readForm(f); if(!v.title.trim()){ err.textContent="Give the document a name."; return; }
    add.disabled=true;
    try{ const d=await api("docs",{method:"POST",body:v}); S.docs.set(String(d.id),d); SNP.closePanel(m); SNP.refresh(); openDoc(d.id); toast("Added to the checklist."); }
    catch(e){ err.textContent=e.message; add.disabled=false; } };
}

/* ---------- templates ---------- */
function renderTemplates(main){
  const g=el("div",{class:"tgrid"});
  const list=[...S.tpls.values()];
  if (!list.length) g.append(el("div",{class:"empty",style:"grid-column:1/-1"}, el("b",{},"No templates yet")));
  for (const t of list){
    const used=[...S.docs.values()].filter(d=>d.template===t.key).map(d=>d.code).join(", ");
    const lead=(t.body||"").split("\n").find(l=>l.trim()&&!l.startsWith("#")&&!/^Starter (draft|form)/.test(l))||"";
    g.append(el("article",{class:"tcard"}, el("div",{class:"eyebrow"}, t.version||"Starter draft", used?" · "+used:""), el("h3",{}, t.name),
      el("p",{}, lead.length>150?lead.slice(0,150)+"…":lead),
      el("div",{class:"acts"}, el("button",{class:"btn small primary",type:"button",onclick:()=>openTemplate(t.key)},"Open"),
        el("button",{class:"btn small",type:"button",onclick:()=>SNP.copyText(t.body)},"Copy text"),
        el("button",{class:"btn small",type:"button",onclick:()=>downloadWord(t)},"Download Word"))));
  }
  main.append(SNP.pageHead("Templates","Starter agreements and forms for SNP's three divisions. Fill in the bracketed items and have an Arizona attorney review them before anyone signs."), g);
}
function renderDocBody(text){
  const box=el("div",{class:"doc"}); let first=true, tbl=[];
  const flush=()=>{ if(tbl.length){ box.append(el("pre",{class:"tbl"}, tbl.join("\n"))); tbl=[]; } };
  for (const raw of (text||"").split("\n")){
    const l=raw.trimEnd();
    if (l.includes(" | ")){ tbl.push(l); continue; } flush();
    if (!l.trim()) continue;
    if (l.startsWith("# ")) box.append(el("h3",{},l.slice(2)));
    else if (l.startsWith("## ")) box.append(el("h4",{},l.slice(3)));
    else box.append(el("p",{class:first&&/^Starter/.test(l)?"lead":null},l));
    if (!l.startsWith("#")) first=false;
  }
  flush(); return box;
}
function openTemplate(key){
  const t=S.tpls.get(key); if(!t) return;
  const body=el("div",{}, renderDocBody(t.body));
  const edit=el("button",{class:"btn small",type:"button"},"Edit");
  const m=SNP.modal(t.name, body, {actions:[
    el("button",{class:"btn small",type:"button",onclick:()=>SNP.copyText(t.body)},"Copy text"),
    el("button",{class:"btn small",type:"button",onclick:()=>downloadWord(t)},"Download Word"),
    S.perms.editTemplates?edit:null].filter(Boolean)});
  edit.onclick=()=>{
    const ta=el("textarea",{class:"tedit","aria-label":"Template text"}); ta.value=t.body||"";
    const save=el("button",{class:"btn small primary",type:"button"},"Save");
    body.replaceChildren(el("p",{class:"note",style:"margin-top:0"},"Lines starting with # are the title, ## are section headings. Saved changes are shared with everyone who has access."), ta, el("div",{class:"row-actions"}, save));
    save.onclick=async()=>{ save.disabled=true;
      try{ await api("templates/"+key,{method:"POST",body:{body:ta.value}}); S.tpls.set(key,{...t,body:ta.value,version:"Edited"}); toast("Template saved."); SNP.closePanel(m); openTemplate(key); SNP.refresh(); }
      catch(e){ fail(e); save.disabled=false; } };
    ta.focus();
  };
}
const xesc=s=>s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
function para(text,{bold=false,size=21,mono=false,before=0,after=80,italic=false}={}){
  const f=mono?"Consolas":"Arial";
  return `<w:p><w:pPr><w:spacing w:before="${before}" w:after="${after}"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="${f}" w:hAnsi="${f}"/>${bold?"<w:b/>":""}${italic?"<w:i/>":""}<w:sz w:val="${size}"/></w:rPr><w:t xml:space="preserve">${xesc(text)}</w:t></w:r></w:p>`;
}
async function downloadWord(t){
  if (!window.JSZip){ toast("Word export didn't load. Use Copy text instead."); return; }
  let xml="", first=true;
  for (const raw of (t.body||"").split("\n")){
    const l=raw.trimEnd(); if(!l.trim()) continue;
    if (l.startsWith("# ")) xml+=para(l.slice(2),{bold:true,size:34,after:160});
    else if (l.startsWith("## ")) xml+=para(l.slice(3),{bold:true,size:23,before:220});
    else if (l.includes(" | ")) xml+=para(l,{mono:true,size:17,after:40});
    else xml+=para(l,{italic:first&&/^Starter/.test(l)});
    if (!l.startsWith("#")) first=false;
  }
  const z=new JSZip();
  z.file("[Content_Types].xml",`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
  z.file("_rels/.rels",`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  z.file("word/_rels/document.xml.rels",`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`);
  z.file("word/document.xml",`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${xml}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`);
  const blob=await z.generateAsync({type:"blob",mimeType:"application/vnd.openxmlformats-officedocument.wordprocessingml.document"});
  SNP.saveBlob("SNP - "+t.name.replace(/[\/\\:*?"<>|&]/g,"and")+".docx", blob);
}

SNP.records = { isDone, isOver, openDoc };
SNP.module({ id:"records", label:"Company records", group:"Company", visible:()=>S.perms.records!==false, render:renderRecords, onData:sync,
  badge:()=>[...S.docs.values()].filter(isOver).length });
SNP.module({ id:"templates", label:"Templates", group:"Company", render:renderTemplates });
})();

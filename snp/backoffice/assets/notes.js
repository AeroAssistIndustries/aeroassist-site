/* Notes: private notes, team notes and owners-only notes, as a board of sticky notes. */
(() => {
"use strict";
const { S, el, items, item, fmtWhen, nameOf } = SNP;
const COLORS = ["yellow","blue","green","pink","grey"];
const VIS = [["private","Only me"],["team","Whole team"],["owners","Owners only"]];
const NF = { show:"all", q:"" };
const canEdit = n => n.createdBy===(S.me&&S.me.id) || (S.me&&S.me.role==="owner"&&n.data.visibility!=="private");
const visOpts = () => S.me&&S.me.role==="owner" ? VIS : VIS.filter(v=>v[0]!=="owners");

function sorted(list){ return list.slice().sort((a,b)=>(b.data.pinned?1:0)-(a.data.pinned?1:0)||(b.updatedAt||"").localeCompare(a.updatedAt||"")); }
function card(n, compact=false){
  const vis=(VIS.find(v=>v[0]===n.data.visibility)||VIS[0])[1];
  const c=el("article",{class:`note-card n-${n.data.color||"yellow"}`,tabindex:"0",onclick:()=>edit(n.id),onkeydown:e=>{ if(e.key==="Enter") edit(n.id); }},
    el("div",{class:"note-top"}, n.data.pinned?el("span",{class:"pin",title:"Pinned"},"PINNED"):null, el("span",{class:"note-vis"},vis)),
    n.data.title?el("h4",{},n.data.title):null,
    el("p",{class:"note-body"+(compact?" clamp":"")}, n.data.body),
    el("div",{class:"note-meta"}, `${nameOf(n.createdBy)||"Someone"} · ${fmtWhen(n.updatedAt)}`));
  return c;
}
/* Small composer used on Home and the Notes page. */
function composer(onDone){
  const ta=el("textarea",{rows:2,placeholder:"Jot something down…","aria-label":"New note"});
  const vis=SNP.selectEl(visOpts(),"private",()=>{},"Who can see it");
  let color="yellow";
  const sw=el("div",{class:"swatches",role:"radiogroup","aria-label":"Color"}, COLORS.map(c=>el("button",{type:"button",class:`sw n-${c}`+(c===color?" on":""),"aria-label":c,role:"radio","aria-checked":String(c===color),onclick:e=>{ color=c; sw.querySelectorAll(".sw").forEach(b=>{ b.classList.toggle("on",b===e.currentTarget); b.setAttribute("aria-checked",String(b===e.currentTarget)); }); }})));
  const add=el("button",{class:"btn small primary",type:"button"},"Add note");
  add.onclick=async()=>{ const body=ta.value.trim(); if(!body) return SNP.toast("Write the note first.");
    add.disabled=true; try{ await SNP.saveItem("note",null,{body,color,visibility:vis.value,pinned:false,title:""}); ta.value=""; SNP.toast("Note added."); onDone?onDone():SNP.refresh(true); }catch(e){ SNP.fail(e); } finally{ add.disabled=false; } };
  ta.addEventListener("keydown",e=>{ if(e.key==="Enter"&&(e.metaKey||e.ctrlKey)) add.click(); });
  return el("div",{class:"composer"}, ta, el("div",{class:"composer-row"}, sw, vis, add));
}
function edit(id){
  const n=item("note",id); if(!n) return;
  const ok=canEdit(n);
  const f=SNP.form([{key:"title",label:"Title (optional)",full:true},{key:"body",label:"Note",type:"textarea",rows:8},
    {key:"color",label:"Color",type:"select",options:COLORS.map(c=>[c,c[0].toUpperCase()+c.slice(1)])},{key:"visibility",label:"Who can see it",type:"select",options:visOpts()},
    {key:"pinned",label:"Pin to the top",type:"checkbox"}], n.data, !ok);
  const err=el("div",{class:"err",role:"alert"}), save=el("button",{class:"btn primary",type:"button"},"Save");
  const m=SNP.modal(n.data.title||"Note", el("div",{class:"stack"}, f, err,
    el("div",{class:"row-actions"}, ok?save:null, ok?SNP.confirmBtn("Delete","Delete this note?",async()=>{ await SNP.deleteItem("note",n.id); SNP.closePanel(m); SNP.toast("Note deleted."); SNP.refresh(true); }):null,
      el("span",{class:"muted small"}, `By ${nameOf(n.createdBy)} · ${fmtWhen(n.updatedAt)}`))), {size:"sm"});
  save.onclick=async()=>{ save.disabled=true; err.textContent="";
    try{ await SNP.saveItem("note",n.id,Object.assign({},n.data,SNP.readForm(f))); SNP.closePanel(m); SNP.toast("Saved."); SNP.refresh(true); }
    catch(e){ err.textContent=e.message; save.disabled=false; } };
}
function board(list, compact){ return list.length?el("div",{class:"note-board"+(compact?" compact":"")}, list.map(n=>card(n,compact))):el("p",{class:"muted small"},"No notes yet."); }

function render(main){
  const me=S.me&&S.me.id;
  const all=items("note");
  const pick={all:()=>all, mine:()=>all.filter(n=>n.createdBy===me), private:()=>all.filter(n=>n.data.visibility==="private"), team:()=>all.filter(n=>n.data.visibility==="team"), owners:()=>all.filter(n=>n.data.visibility==="owners")};
  const q=NF.q.trim().toLowerCase();
  const list=sorted((pick[NF.show]||pick.all)()).filter(n=>!q||`${n.data.title} ${n.data.body}`.toLowerCase().includes(q));
  const s=SNP.search("Search notes",e=>{ NF.q=e.target.value; const b=main.querySelector(".note-board, .note-empty"); const nl=sorted((pick[NF.show]||pick.all)()).filter(n=>!NF.q||`${n.data.title} ${n.data.body}`.toLowerCase().includes(NF.q.toLowerCase())); const nb=board(nl); if(b) b.replaceWith(nb); }); s.value=NF.q;
  main.append(SNP.pageHead("Notes","Quick notes for yourself, the whole team, or owners only. Pin the ones everyone should see."),
    el("section",{class:"panel"}, composer()),
    SNP.subtabs([["all","All"],["mine","Written by me"],["private","Only me"],["team","Team"],...(S.me&&S.me.role==="owner"?[["owners","Owners only"]]:[])],NF.show,v=>{NF.show=v;SNP.refresh(true);}),
    SNP.toolbar(s), board(list));
}

SNP.notes = { edit, composer, board, sorted, card };
SNP.module({ id:"notes", label:"Notes", group:"Operations", render });
})();

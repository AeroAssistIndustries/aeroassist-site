/* Tasks & reminders. Owners see and assign all tasks; others see the tasks assigned to them. */
(() => {
"use strict";
const { S, el, items, fmtDate, nameOf, badge, today, addDays } = SNP;
const TF = { who:"me", showDone:false };

function newTask(defaults={}){ return editTask(null, defaults); }
function editTask(id=null, defaults={}){
  const t = id ? SNP.item("task",id) : null;
  const owner = SNP.can("task","rw");
  if (!owner && t){ // assignee view: status + notes only
    const notes=el("textarea",{rows:4,id:"tk-notes"}); notes.value=t.data.notes||"";
    const err=el("div",{class:"err",role:"alert"}), save=el("button",{class:"btn primary",type:"button"},"Save notes");
    const body=el("div",{class:"stack"}, el("p",{}, t.data.due?"Due "+fmtDate(t.data.due):"No due date", t.data.relatedLabel?" · "+t.data.relatedLabel:""),
      el("div",{class:"field full"}, el("label",{for:"tk-notes"},"Notes"), notes), err, el("div",{class:"row-actions"}, save));
    const d=SNP.drawer(t.data.title,"Task", body);
    save.onclick=async()=>{ save.disabled=true; try{ await SNP.saveItem("task",t.id,{notes:notes.value}); SNP.toast("Saved."); SNP.closePanel(d); SNP.refresh(true); }catch(e){ err.textContent=e.message; save.disabled=false; } };
    return d;
  }
  return SNP.editRecord({type:"task", id, title:id?"Task":"New task", eyebrow:"Tasks",
    defaults:Object.assign({status:"Open",priority:"Normal",assigneeId:S.me&&S.me.id},defaults),
    fields:[{key:"title",label:"Task",full:true,placeholder:"e.g. Renew Arizona TPT license"},{key:"assigneeId",label:"Assigned to",type:"user"},{key:"due",label:"Due",type:"date"},
      {key:"priority",label:"Priority",type:"select",options:["Normal","High"]},{key:"status",label:"Status",type:"select",options:["Open","Done"]},
      {key:"notes",label:"Notes",type:"textarea"}],
    after:(d,it)=>{ const lbl=(it&&it.data.relatedLabel)||defaults.relatedLabel; if(lbl) d.querySelector(".d-body .stack").prepend(el("p",{class:"muted small"},"Linked to: "+lbl)); }});
}
async function toggle(t){
  try{ await SNP.saveItem("task",t.id,SNP.can("task","rw")?Object.assign({},t.data,{status:t.data.status==="Done"?"Open":"Done"}):{status:t.data.status==="Done"?"Open":"Done"});
    SNP.toast(t.data.status==="Done"?"Reopened.":"Done."); SNP.refresh(true); }catch(e){ SNP.fail(e); }
}
function link(t){
  const r=t.data.relatedType, id=t.data.relatedId; if(!r||!id) return null;
  const href = r==="customer"?"#customers/"+id : r==="deal"?"#pipeline" : r==="record"?"#records" : null;
  return href?el("a",{href,class:"small"}, t.data.relatedLabel||r):el("span",{class:"small muted"}, t.data.relatedLabel);
}
function taskRow(t){
  const late=t.data.status==="Open"&&t.data.due&&t.data.due<today();
  const cb=el("input",{type:"checkbox",checked:t.data.status==="Done"||null,"aria-label":"Mark "+t.data.title+" done"}); cb.onchange=()=>toggle(t);
  return el("li",{class:"task"+(t.data.status==="Done"?" done":"")},
    cb,
    el("div",{class:"task-main",tabindex:"0",onclick:()=>editTask(t.id),onkeydown:e=>{ if(e.key==="Enter") editTask(t.id); }},
      el("div",{class:"task-t"}, t.data.title, t.data.priority==="High"?el("span",{class:"tag crit",style:"margin-left:8px"},"High"):null),
      el("div",{class:"task-m"}, t.data.due?el("span",{class:late?"bad-t":""}, (late?"Overdue · ":"Due ")+fmtDate(t.data.due)):el("span",{class:"muted"},"No due date"),
        SNP.can("task","rw")?el("span",{class:"muted"}, " · "+(nameOf(t.data.assigneeId)||"Unassigned")):null, link(t)?" · ":null, link(t))));
}
function groupTasks(list){
  const td=today(), wk=addDays(td,7);
  const open=list.filter(t=>t.data.status==="Open").sort((a,b)=>(a.data.due||"9999").localeCompare(b.data.due||"9999")||(a.data.priority==="High"?-1:1));
  return [["Overdue",open.filter(t=>t.data.due&&t.data.due<td)],["Today",open.filter(t=>t.data.due===td)],["This week",open.filter(t=>t.data.due>td&&t.data.due<=wk)],
    ["Later",open.filter(t=>t.data.due>wk)],["No due date",open.filter(t=>!t.data.due)]];
}
function renderTasks(main){
  const owner=SNP.can("task","rw"), me=S.me&&S.me.id;
  let list=items("task");
  if (owner && TF.who==="me") list=list.filter(t=>t.data.assigneeId===me);
  else if (owner && TF.who && TF.who!=="all") list=list.filter(t=>String(t.data.assigneeId)===TF.who);
  const groups=groupTasks(list), done=list.filter(t=>t.data.status==="Done").sort((a,b)=>(b.data.doneAt||"").localeCompare(a.data.doneAt||""));
  const body=el("div");
  groups.forEach(([label,ts])=>{ if(ts.length) body.append(el("section",{class:"task-group"}, el("h3",{class:label==="Overdue"?"bad-t":""}, `${label} · ${ts.length}`), el("ul",{class:"tasks"}, ts.map(taskRow)))); });
  if (!body.children.length) body.append(el("div",{class:"empty"}, el("b",{},"Nothing open"), owner?"Add a task, or create one from a customer, deal or company record.":"You have no open tasks."));
  const doneBtn=el("button",{class:"btn small ghost",type:"button",onclick:()=>{TF.showDone=!TF.showDone;SNP.refresh(true);}}, TF.showDone?"Hide completed":`Show completed (${done.length})`);
  main.append(SNP.pageHead("Tasks", S.settings&&S.settings.reminders!==false?"Everyone gets a 7 a.m. email when they have tasks due.":"Daily reminder emails are off in Settings.",
      owner?el("button",{class:"btn primary",type:"button",onclick:()=>newTask()},"+ Task"):null),
    owner?SNP.toolbar(SNP.selectEl([["me","My tasks"],["all","Everyone's tasks"],...SNP.peopleWithAccess().filter(p=>p.id!==me).map(p=>[String(p.id),p.name])],TF.who,v=>{TF.who=v;SNP.refresh(true);},"Whose tasks")):null,
    body, done.length?doneBtn:null, TF.showDone&&done.length?el("ul",{class:"tasks"}, done.slice(0,100).map(taskRow)):null);
}

SNP.newTask = newTask;
SNP.tasks = { editTask, groupTasks, taskRow };
SNP.module({ id:"tasks", label:"Tasks", group:"Operations", render:renderTasks,
  badge:()=>items("task").filter(t=>t.data.status==="Open"&&t.data.assigneeId===(S.me&&S.me.id)&&t.data.due&&t.data.due<=today()).length });
})();

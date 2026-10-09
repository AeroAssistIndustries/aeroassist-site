/* Home: what needs attention today, by role. */
(() => {
"use strict";
const { S, el, items, money, money0, fmtDate, fmtMonth, fmtWhen, nameOf, today, addDays } = SNP;
const svgNS="http://www.w3.org/2000/svg";
const sv=(tag,attrs={},...kids)=>{ const n=document.createElementNS(svgNS,tag); for(const [k,v] of Object.entries(attrs)) n.setAttribute(k,v); kids.forEach(k=>n.append(k.nodeType?k:document.createTextNode(k))); return n; };

function lastMonths(n){ const out=[]; const d=new Date(); for(let i=n-1;i>=0;i--){ const x=new Date(d.getFullYear(),d.getMonth()-i,1); out.push(x.getFullYear()+"-"+String(x.getMonth()+1).padStart(2,"0")); } return out; }
function salesChart(){
  const months=lastMonths(6);
  const inv=items("invoice").filter(x=>!["Draft","Void"].includes(x.data.status));
  const billed=months.map(m=>inv.filter(x=>(x.data.date||"").slice(0,7)===m).reduce((s,x)=>s+(x.data.total||0),0));
  const coll=months.map(m=>inv.reduce((s,x)=>s+(x.data.payments||[]).filter(p=>(p.date||"").slice(0,7)===m).reduce((a,p)=>a+(p.amount||0),0),0));
  const max=Math.max(1,...billed,...coll);
  const step=Math.pow(10,Math.floor(Math.log10(max))), top=Math.ceil(max/step)*step;
  const W=640,H=220,L=56,B=28,T=12,R=8, ch=H-B-T, cw=(W-L-R)/months.length, bw=Math.min(26,cw/3);
  const svg=sv("svg",{viewBox:`0 0 ${W} ${H}`,class:"chart",role:"img","aria-label":"Invoiced and collected, last six months"});
  for(let i=0;i<=4;i++){ const v=top*i/4, y=T+ch-(ch*i/4);
    svg.append(sv("line",{x1:L,x2:W-R,y1:y,y2:y,class:"grid"}), sv("text",{x:L-8,y:y+4,class:"axis","text-anchor":"end"}, (v>=1e6?"$"+(v/1e6).toFixed(v%1e6?1:0)+"m":v>=1e3?"$"+(v/1e3).toFixed(v%1e3?1:0)+"k":"$"+Math.round(v)))); }
  months.forEach((m,i)=>{ const x=L+cw*i+cw/2;
    const h1=ch*billed[i]/top, h2=ch*coll[i]/top;
    const b1=sv("rect",{x:x-bw-2,y:T+ch-h1,width:bw,height:Math.max(h1,0),rx:2,class:"bar-a"}); b1.append(sv("title",{},`${fmtMonth(m)} invoiced: ${money(billed[i])}`));
    const b2=sv("rect",{x:x+2,y:T+ch-h2,width:bw,height:Math.max(h2,0),rx:2,class:"bar-b"}); b2.append(sv("title",{},`${fmtMonth(m)} collected: ${money(coll[i])}`));
    svg.append(b1,b2, sv("text",{x,y:H-8,class:"axis","text-anchor":"middle"}, new Date(m+"-01T12:00").toLocaleDateString(undefined,{month:"short"})));
  });
  return el("section",{class:"panel"}, el("div",{class:"panel-h"}, el("h3",{},"Invoiced vs collected"), el("div",{class:"legend"}, el("span",{}, el("i",{class:"lg-a"}),"Invoiced"), el("span",{}, el("i",{class:"lg-b"}),"Collected"))),
    el("div",{class:"chart-wrap"}, svg));
}
function attnList(title, rows, empty){
  return el("section",{class:"panel"}, el("h3",{},title), rows.length?el("ul",{class:"attn"}, rows):el("p",{class:"muted small"},empty));
}
const li=(main, meta, href, cls="")=>el("li",{class:cls}, el("a",{href}, main), meta?el("span",{class:"muted small"}, meta):null);

function renderHome(main){
  const td=today(), role=S.me&&S.me.role, first=(S.me&&S.me.name||"").split(" ")[0];
  const hr=new Date().getHours(), greet=hr<12?"Good morning":hr<17?"Good afternoon":"Good evening";
  main.append(SNP.pageHead(`${greet}${first?", "+first:""}`, new Date().toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric",year:"numeric"})));

  const kpis=el("div",{class:"kpis"}); main.append(kpis);
  const inv=items("invoice").filter(x=>!["Draft","Void"].includes(x.data.status)), m=SNP.thisMonth();
  if (SNP.can("invoice")){
    const billed=inv.filter(x=>(x.data.date||"").slice(0,7)===m).reduce((s,x)=>s+(x.data.total||0),0);
    const coll=inv.reduce((s,x)=>s+(x.data.payments||[]).filter(p=>(p.date||"").slice(0,7)===m).reduce((a,p)=>a+(p.amount||0),0),0);
    const unpaid=inv.reduce((s,x)=>s+Math.max(0,x.data.balance||0),0), od=inv.filter(x=>SNP.sales.statusOf(x)==="Overdue");
    kpis.append(SNP.kpi(money0(billed),"Invoiced this month"), SNP.kpi(money0(coll),"Collected this month"),
      SNP.kpi(money0(unpaid),od.length?`Unpaid · ${od.length} overdue`:"Unpaid", od.length?"bad":unpaid?"warn":""));
  }
  if (SNP.can("deal","rw")) kpis.append(SNP.kpi(money0(items("deal").filter(d=>SNP.crm.OPEN_STAGES.includes(d.data.stage)).reduce((s,d)=>s+(d.data.value||0),0)),"Open pipeline"));
  if (SNP.can("oil_order")){ const st=SNP.oil.statement(m); kpis.append(SNP.kpi(money(st.R),"Oil rewards deposited this month")); }
  if (!kpis.children.length){ const docs=[...S.docs.values()], live=docs.filter(d=>d.status!=="Not needed");
    kpis.append(SNP.kpi(`${live.filter(d=>d.status==="On file").length} / ${live.length}`,"Your records on file"), SNP.kpi(String(docs.filter(d=>d.status==="Needs review").length),"Waiting on review"),
      SNP.kpi(String(items("task").filter(t=>t.data.status==="Open").length),"Your open tasks")); }

  // needs attention
  const attn=[];
  if (SNP.can("invoice")) inv.filter(x=>SNP.sales.statusOf(x)==="Overdue").sort((a,b)=>a.data.dueDate.localeCompare(b.data.dueDate)).slice(0,6)
    .forEach(x=>attn.push(li(`${x.data.number} · ${SNP.customerName(x.data.customerId)}`, `${money(x.data.balance)} overdue since ${fmtDate(x.data.dueDate)}`, "#invoices","bad")));
  if (SNP.can("deal","rw")) items("deal").filter(d=>SNP.crm.OPEN_STAGES.includes(d.data.stage)&&d.data.nextStepDate&&d.data.nextStepDate<=td).slice(0,6)
    .forEach(d=>attn.push(li(`${d.data.title}`, `${d.data.nextStep||"Follow up"} · ${fmtDate(d.data.nextStepDate)}`, "#pipeline", d.data.nextStepDate<td?"bad":"")));
  if (SNP.can("quote","rw")) items("quote").filter(q=>q.data.status==="Sent"&&q.data.validUntil&&q.data.validUntil>=td&&q.data.validUntil<=addDays(td,3))
    .forEach(q=>attn.push(li(`${q.data.number} · ${SNP.customerName(q.data.customerId)}`, `quote expires ${fmtDate(q.data.validUntil)}`, "#quotes")));
  if (SNP.can("po","rw")) items("po").filter(p=>p.data.expectedDate&&p.data.expectedDate<td&&["Sent","Confirmed"].includes(p.data.status))
    .forEach(p=>attn.push(li(`${p.data.number} · ${SNP.supplierName(p.data.supplierId)}`, `delivery late since ${fmtDate(p.data.expectedDate)}`, "#pos","bad")));
  if (SNP.can("oil_order","rw")){ const prev=SNP.oil.statement(lastMonths(2)[0]); if(prev.owed>0.005) attn.push(li(`Pay ${S.settings.partnerName||"partner"} for ${fmtMonth(prev.month)}`, `${money(prev.owed)} still owed`, "#oil","bad")); }
  [...S.docs.values()].filter(d=>d.due&&!SNP.records.isDone(d)&&d.due<=addDays(td,30)).sort((a,b)=>a.due.localeCompare(b.due)).slice(0,6)
    .forEach(d=>attn.push(li(`${d.code} ${d.title}`, (d.due<td?"overdue since ":"due ")+fmtDate(d.due), "#records", d.due<td?"bad":"")));
  if (SNP.can("customer","rw")) items("customer").filter(c=>c.data.resaleCert&&c.data.resaleExpiry&&c.data.resaleExpiry<=addDays(td,30))
    .forEach(c=>attn.push(li(`${c.data.name}: resale certificate`, (c.data.resaleExpiry<td?"expired ":"expires ")+fmtDate(c.data.resaleExpiry), "#customers/"+c.id, c.data.resaleExpiry<td?"bad":"")));

  // my tasks
  const mine=items("task").filter(t=>t.data.assigneeId===(S.me&&S.me.id)&&t.data.status==="Open").sort((a,b)=>(a.data.due||"9999").localeCompare(b.data.due||"9999")).slice(0,8);
  const taskPanel=el("section",{class:"panel"}, el("div",{class:"panel-h"}, el("h3",{},"My tasks"), el("a",{href:"#tasks",class:"small"},"All tasks →")),
    mine.length?el("ul",{class:"tasks"}, mine.map(SNP.tasks.taskRow)):el("p",{class:"muted small"},"Nothing assigned to you. "), SNP.can("task","rw")?el("button",{class:"btn small",type:"button",onclick:()=>SNP.newTask()},"+ Task"):null);

  const cols=el("div",{class:"two-col"},
    el("div",{class:"col"}, attnList("Needs attention", attn, "All clear. Nothing overdue or due soon."), SNP.can("invoice")?salesChart():null),
    el("div",{class:"col"}, taskPanel,
      S.activity.length?el("section",{class:"panel"}, el("div",{class:"panel-h"}, el("h3",{},"Recent activity"), el("a",{href:"#activity",class:"small"},"All →")),
        el("ul",{class:"attn"}, S.activity.slice(0,8).map(a=>el("li",{}, el("span",{}, `${nameOf(a.by)} ${a.action}: ${a.detail}`), el("span",{class:"muted small"}, fmtWhen(a.at)))))):null,
      SNP.can("customer","rw")?quickAdd():null));
  main.append(cols);
}
function quickAdd(){
  const b=(label,fn)=>el("button",{class:"btn",type:"button",onclick:fn},label);
  return el("section",{class:"panel"}, el("h3",{},"Quick add"), el("div",{class:"quick"},
    b("+ Customer",()=>SNP.crm.editCustomer()), b("+ Deal",()=>SNP.crm.editDeal()), b("+ Quote",()=>SNP.sales.newDoc("quote")), b("+ Invoice",()=>SNP.sales.newDoc("invoice")),
    b("+ Oil order",()=>SNP.oil.editOrder()), b("+ Purchase order",()=>SNP.sales.newDoc("po"))));
}

SNP.module({ id:"home", label:"Home", render:renderHome });
})();

/* AeroAssist portal dashboard. Data comes from /api/portal for the signed-in person only;
   documents are links that the server checks and logs on every open.
   AAPortal.start(data, options) draws it into the #ptApp markup created by app.js. */
(function(){
window.AAPortal={start:function(D,O){O=O||{};var EXTRA=O.views||{};
var OUT=+D.unitsOutstanding||10000,ROUND_UNITS=+D.roundUnits||0,ROUND=D.roundName||'the round';
var GROUPS={company:['prospect','investor','employee','admin'],investors:['prospect','investor','admin'],holders:['investor','admin'],team:['employee','admin'],admin:['admin']};
var ROLES={prospect:'Prospective investor',investor:'Unit holder',employee:'AeroAssist team',admin:'Administrator'};
var PCATS={tax:'Tax (K-1)',certificates:'Certificate',agreements:'Agreement',updates:'Investor update',team:'Employment',other:'Other'};
var ACT={view:'viewed',download:'downloaded',zip:'downloaded (zip)',signin:'signed in',signin_failed:'failed sign-in',denied:'was refused'};
var ICON={
 overview:'<path d="M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-3H4zM14 7h6V4h-6z"/>',
 investment:'<path d="M4 19h16M7 15v-4M12 15V7M17 15v-6"/>',
 documents:'<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M10 12h5M10 16h5"/>',
 updates:'<path d="M4 6h16M4 12h10M4 18h7"/><circle cx="18" cy="16" r="3"/>',
 company:'<path d="M4 20V8l8-4 8 4v12"/><path d="M9 20v-5h6v5M4 20h16"/>',
 investors:'<circle cx="9" cy="8" r="3"/><path d="M3.5 19c.6-3 2.8-5 5.5-5s4.9 2 5.5 5"/><path d="M16 5a3 3 0 010 6M17.5 14c1.7.6 2.7 2.5 3 5"/>',
 help:'<circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 014.8.9c0 1.7-2.4 2.1-2.4 3.9M12 17v.4"/>',
 dl:'<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
 doc:'<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4"/>',
 people:'<circle cx="9" cy="8" r="3"/><path d="M3.5 19c.6-3 2.8-5 5.5-5s4.9 2 5.5 5"/><path d="M16 8h5M18.5 5.5v5"/>',
 library:'<path d="M4 4h6v16H4zM14 4h6v16h-6z"/><path d="M7 8v8M17 8v8"/>',
 txns:'<path d="M4 7h13l-3-3M20 17H7l3 3"/>',
 log:'<path d="M5 4h14v16H5z"/><path d="M8 8h8M8 12h8M8 16h5"/>',
 settings:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1l2.1-2.1M17 7l2.1-2.1"/>',
 import:'<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 17v3h16v-3"/>',
 security:'<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 018 0v3"/>',
 gear:'<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>',
 opportunity:'<path d="M4 17l6-6 4 4 6-7"/><path d="M15 8h5v5"/>',
 mail:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
 arrow:'<path d="M5 12h14M13 6l6 6-6 6"/>'
};
var MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function $(i){return document.getElementById(i);}
function el(t,c,x){var e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e;}
function svgIcon(n){var s=document.createElementNS('http://www.w3.org/2000/svg','svg');s.setAttribute('viewBox','0 0 24 24');s.setAttribute('aria-hidden','true');s.innerHTML=ICON[n];return s;}
function fmtDate(d){if(!d)return '';var p=String(d).split('-');return p.length===3?(MON[+p[1]-1]+' '+(+p[2])+', '+p[0]):d;}
function money(n){return (n<0?'-$':'$')+Math.abs(Math.round(n||0)).toLocaleString('en-US');}
function num(n){return Math.round(n||0).toLocaleString('en-US');}
function kb(n){return n>=1048576?(n/1048576).toFixed(1)+' MB':Math.max(1,Math.round(n/1024))+' KB';}
function daysAgo(d){var t=Date.parse(d);return isNaN(t)?1e9:(Date.now()-t)/864e5;}
function isNew(d){var a=daysAgo(d.date);return a<=(d.mine?60:14)&&a>-400;}
function greeting(){var h=new Date().getHours();return h<12?'Good morning':h<18?'Good afternoon':'Good evening';}

var m=D,S;
(m.docs||[]).forEach(function(d){d.mine=true;d.type_=PCATS[d.cat]||'Other';});
(m.lib||[]).forEach(function(d){d.mine=false;d.type_=d.cat;});
S={id:m.id,m:m,lib:m.lib||[],libReady:true,view:null,f:{q:'',src:'all',type:'',year:'',as:'all'},tx:'all'};
function allDocs(){return (m.docs||[]).concat(S.lib).slice().sort(function(a,b){return (b.date||'').localeCompare(a.date||'');});}

/* ---------- capital account ---------- */
function acct(){
  var h=m.holder||{},tx=m.transactions||[],u=+h.units||0,out=OUT,price=+m.unitPrice||0;
  var paid=+h.invested||tx.filter(function(t){return /purchase|buy|subscri|contribut/i.test(t.type);}).reduce(function(s,t){return s+(+t.amount||0);},0);
  var dist=tx.filter(function(t){return /distribut|repay|return of capital/i.test(t.type);}).reduce(function(s,t){return s+Math.abs(+t.amount||0);},0);
  var value=u*price,total=value+dist;
  return {units:u,out:out,pct:u/out*100,after:u/(out+ROUND_UNITS)*100,price:price,paid:paid,dist:dist,value:value,total:total,tvpi:paid?total/paid:0,dpi:paid?dist/paid:0};
}
function holder(){return (+((m.holder||{}).units)||0)>0||(m.transactions||[]).length>0;}

/* ---------- shell ---------- */
function views(){
  var v=[['Portfolio'],['overview','Overview']];
  if(m.offer)v.push(['opportunity',m.offer.title||'The opportunity']);
  if(holder())v.push(['investment','My investment']);
  v.push(['Documents'],['documents','Documents',allDocs().length],['updates','Updates']);
  v.push(['Company'],['company','Company']);
  if(m.role==='admin'){
    v.push(['Administration'],['investors','Investors and access',(m.roster||[]).length],['people','People'],['library','Manage documents'],['txns','Transactions'],['log','Activity log'],['settings','Settings'],['import','Import']);
  }
  v.push(['Account'],['security','Password and two-factor'],['help','Help']);
  return v;
}
function boot(){
  var h=m.holder||{};
  var nm=h.name||'Portal user';$('dbName').textContent=nm;
  $('dbAv').textContent=nm.split(/\s+/).map(function(w){return w.charAt(0);}).join('').slice(0,2).toUpperCase();
  $('dbRole').textContent=ROLES[m.role]||'Portal';
  $('dbAsOf').textContent=m.asOf?'Records as of '+fmtDate(m.asOf):'';
  var n=$('dbNote');n.hidden=!m.note;n.textContent=m.note||'';
  var hash=(location.hash||'').slice(1);
  S.view=views().some(function(x){return x[0]===hash&&x[1];})||(EXTRA[hash]&&EXTRA[hash].hidden&&m.role==='admin')?hash:'overview';
  nav();render();idleStart();
}
function nav(){
  var box=$('dbNav');box.textContent='';
  views().forEach(function(v){
    if(v.length===1){box.appendChild(el('div','grp',v[0]));return;}
    var b=el('button');b.type='button';b.setAttribute('aria-current',S.view===v[0]?'page':'false');
    b.appendChild(svgIcon(v[0]));b.appendChild(document.createTextNode(v[1]));
    if(v[2]!=null&&v[2]!=='')b.appendChild(el('span','ct',String(v[2])));
    b.onclick=function(){go(v[0]);};box.appendChild(b);
  });
}
function go(v){S.view=v;try{history.replaceState(null,'','#'+v);}catch(e){}nav();render();window.scrollTo(0,0);var t=$('dbTitle');t.setAttribute('tabindex','-1');t.focus({preventScroll:true});}
function render(){
  var first=((m.holder||{}).name||'').split(/\s+/)[0];
  var T={overview:[greeting()+(first?', '+first:'')+'.','Overview'],investment:['My investment','Your units in AeroAssist Industries'],documents:['Documents','Everything shared with you, in one place'],updates:['Updates','News and reports from the company'],company:['AeroAssist Industries','Company profile'],investors:['Investors and access','Administrator'],help:['Help','How the portal works'],opportunity:[(m.offer&&m.offer.title)||'The opportunity','Investment opportunity · for prospective investors']};
  Object.keys(EXTRA).forEach(function(k){if(EXTRA[k].title)T[k]=EXTRA[k].title;});
  var t=T[S.view]||T.overview;$('dbTitle').textContent=t[0];$('dbKicker').textContent=t[1];
  var act=$('dbActions');act.textContent='';
  var box=$('dbView');box.textContent='';
  var V={overview:vOverview,investment:vInvestment,documents:vDocuments,updates:vUpdates,company:vCompany,investors:vInvestors,help:vHelp,opportunity:vOpportunity};
  Object.keys(EXTRA).forEach(function(k){V[k]=function(b,a){EXTRA[k].render(b,a,m);};});
  (V[S.view]||vOverview)(box,act);
}
function card(title,small,link,linkTo){var c=el('section','ip-card'),h=el('h2',null,title);if(small)h.appendChild(el('small',null,small));if(link){var a=el('button',null,link);a.type='button';a.onclick=function(){go(linkTo);};h.appendChild(a);}c.appendChild(h);return c;}
function strip(items){var s=el('div','ip-strip');items.forEach(function(it){var d=el('div','ip-stat'+(it.hi?' hi':''));d.appendChild(el('span',null,it.label));d.appendChild(el('b',null,it.value));if(it.badge)d.appendChild(el('em',null,it.badge));s.appendChild(d);});return s;}
function btn(label,icon,pri,fn){var b=el('button','ip-btn'+(pri?' pri':''));b.type='button';if(icon)b.appendChild(svgIcon(icon));b.appendChild(document.createTextNode(label));b.onclick=function(){fn(b);};return b;}
function link(label,icon,href,pri,newTab){var a=el('a','ip-btn'+(pri?' pri':''));a.href=href;if(newTab){a.target='_blank';a.rel='noopener';}if(icon)a.appendChild(svgIcon(icon));a.appendChild(document.createTextNode(label));return a;}
function table(cols,rows){
  var w=el('div','ip-tw'),t=el('table','ip-table'),th=el('thead'),tr=el('tr');
  cols.forEach(function(c){tr.appendChild(el('th',c.n?'n':(c.act?'act':null),c.h));});th.appendChild(tr);t.appendChild(th);
  var tb=el('tbody');rows.forEach(function(r){var row=el('tr',r.cls||null);r.cells.forEach(function(v,i){var c=cols[i],td=el('td',c.n?'n':(c.act?'act':null));if(v instanceof Node)td.appendChild(v);else td.textContent=v==null?'':v;row.appendChild(td);});tb.appendChild(row);});
  t.appendChild(tb);w.appendChild(t);return w;
}

/* ---------- views ---------- */
function vOverview(box,act){
  var a=acct();
  if(m.offer&&!holder())box.appendChild(offerHero(true));
  if(holder()){
    act.appendChild(btn('Download statement','dl',true,statement));
    box.appendChild(strip([{label:'Current value (indicative)',value:money(a.value),hi:true},{label:'Paid-in capital',value:a.paid?money(a.paid):'—'},{label:'Distributions',value:money(a.dist)},{label:'Total value',value:money(a.total)},{label:'Multiple (TVPI)',value:a.tvpi?a.tvpi.toFixed(2)+'×':'—',badge:a.paid?'DPI '+a.dpi.toFixed(2)+'×':null}]));
  }else{
    var docs=allDocs();
    box.appendChild(strip([{label:'Documents shared with you',value:num(docs.length)},{label:'New in the last 14 days',value:num(docs.filter(isNew).length)},{label:'Personal documents',value:num((m.docs||[]).length)},{label:'Your access',value:ROLES[m.role]||'—'}]));
  }
  var g=el('div','ip-grid ip-2'),L=el('div','ip-grid'),R=el('div','ip-grid');
  if(holder()&&(m.priceHistory||[]).length>1){var c=card('Value of your units','Units × price per unit at each round');c.appendChild(valueChart(m.priceHistory,a.units));L.appendChild(c);}
  else if(m.role==='admin'&&(m.priceHistory||[]).length>1){var c2=card('Price per unit','By round');c2.appendChild(valueChart(m.priceHistory,1));L.appendChild(c2);}
  var rc=card('Recent documents',null,'View all','documents');
  var recent=allDocs().slice(0,6);
  rc.appendChild(recent.length?docTable(recent,true):el('p','ip-empty','No documents have been shared with you yet.'));
  L.appendChild(rc);
  R.appendChild(actionCard());
  if(m.offer&&holder()){var oc=card(m.offer.title+' is open'),op=el('p',null,'New units at '+money(offerNums().price)+' each. See the terms, the plan and what it means for your ownership.');op.style.margin='0 0 12px';oc.appendChild(op);oc.appendChild(btn('See the round','arrow',false,function(){go('opportunity');}));R.appendChild(oc);}
  if((m.announcements||[]).length)R.appendChild(annCard(2));
  R.appendChild(factsCard());
  g.appendChild(L);g.appendChild(R);box.appendChild(g);
}
function actionCard(){
  var c=card('For your attention'),ul=el('ul','ip-list'),items=[];
  (m.docs||[]).filter(isNew).forEach(function(d){items.push({t:d.title,p:(PCATS[d.cat]||'Document')+' added '+fmtDate(d.date),d:d});});
  if(m.taxNote&&holder())items.push({t:'Tax documents',p:m.taxNote});
  if(m.recoveryLeft!=null&&m.recoveryLeft<3)items.push({t:'Recovery codes running low',p:'You have '+m.recoveryLeft+' recovery codes left for when your phone isn’t with you. Make a new set.',go:'security',label:'New recovery codes'});
  if(!items.length){c.appendChild(el('p','ip-empty','You are all caught up.'));return c;}
  items.slice(0,5).forEach(function(it){var li=el('li');li.appendChild(el('span','ip-dot'));var d=el('div');d.appendChild(el('b',null,it.t));d.appendChild(el('p',null,it.p));
    var b=null;if(it.d)b=openLink(it.d,'Open');else if(it.go)b=btn(it.label,null,false,function(){go(it.go);});
    if(b){b.style.marginTop='8px';d.appendChild(b);}
    li.appendChild(d);ul.appendChild(li);});
  c.appendChild(ul);return c;
}
function annCard(limit){
  var c=card('From the company',null,limit?'All updates':null,'updates'),ul=el('ul','ip-list');
  (m.announcements||[]).slice().sort(function(a,b){return (b.date||'').localeCompare(a.date||'');}).slice(0,limit||99).forEach(function(a){var li=el('li');var d=el('div');d.appendChild(el('b',null,a.title||''));d.appendChild(el('small',null,fmtDate(a.date)));d.appendChild(el('p',null,a.body||''));li.appendChild(d);ul.appendChild(li);});
  c.appendChild(ul);return c;
}
function factsCard(){
  var c=card('Company at a glance',null,'Profile','company'),dl=el('dl','ip-facts');
  (m.company||[]).forEach(function(f){dl.appendChild(el('dt',null,f[0]));dl.appendChild(el('dd',null,f[1]));});
  if(!(m.company||[]).length){dl.appendChild(el('dt',null,'Units outstanding'));dl.appendChild(el('dd',null,num(OUT)));}
  c.appendChild(dl);return c;
}
function vInvestment(box,act){
  var a=acct(),h=m.holder||{};
  act.appendChild(btn('Download statement','dl',true,statement));
  var st=[{label:'Units held',value:num(a.units)},{label:'Ownership today',value:a.pct.toFixed(2)+'%'}];
  if(ROUND_UNITS)st.push({label:'After '+ROUND+' (if fully raised)',value:a.after.toFixed(2)+'%'});
  st.push({label:'Current value (indicative)',value:money(a.value),hi:true,badge:a.tvpi?a.tvpi.toFixed(2)+'× TVPI':null});
  box.appendChild(strip(st));
  var g=el('div','ip-grid ip-2'),L=el('div','ip-grid'),R=el('div','ip-grid');
  var pc=card('Position',h.since?'Unit holder since '+fmtDate(h.since):null);
  pc.appendChild(table([{h:'Security'},{h:'Units',n:1},{h:'Ownership',n:1},{h:'Paid-in',n:1},{h:'Price per unit',n:1},{h:'Current value',n:1}],
    [{cells:['LLC membership units',num(a.units),a.pct.toFixed(2)+'%',a.paid?money(a.paid):'—',a.price?money(a.price):'—',a.price?money(a.value):'—']}]));
  L.appendChild(pc);
  var tc=card('Transactions'),tx=(m.transactions||[]).slice().sort(function(x,y){return (y.date||'').localeCompare(x.date||'');});
  var types=['all'].concat(tx.map(function(t){return t.type;}).filter(function(v,i,s){return v&&s.indexOf(v)===i;}));
  if(types.length>2){var seg=el('div','ip-seg');types.forEach(function(t){var b=el('button',null,t==='all'?'All':t);b.type='button';b.setAttribute('aria-pressed',String(S.tx===t));b.onclick=function(){S.tx=t;render();};seg.appendChild(b);});var f=el('div','ip-filters');f.appendChild(seg);tc.appendChild(f);}
  var rows=tx.filter(function(t){return S.tx==='all'||t.type===S.tx;}).map(function(t){var nm=el('span','nm',t.type||'');if(t.note){nm.appendChild(el('span','sub',t.note));}return {cells:[fmtDate(t.date),nm,t.units?num(t.units):'—',t.amount?money(t.amount):'—']};});
  if(rows.length)tc.appendChild(table([{h:'Date'},{h:'Type'},{h:'Units',n:1},{h:'Amount',n:1}],rows));else tc.appendChild(el('p','ip-empty','No transactions recorded yet. Contact the CFO if something is missing.'));
  L.appendChild(tc);
  var dc=card('Certificates and agreements'),certs=(m.docs||[]).filter(function(d){return d.cat==='certificates'||d.cat==='agreements';});
  dc.appendChild(certs.length?docTable(certs,false):el('p','ip-empty','None issued yet.'));L.appendChild(dc);
  if((m.priceHistory||[]).length>1){var vc=card('Value of your units','Units × price per unit at each round');vc.appendChild(valueChart(m.priceHistory,a.units));L.appendChild(vc);}
  var ca=card('Capital account'),dl=el('dl','ip-facts');
  [['Paid-in capital',a.paid?money(a.paid):'—'],['Distributions received',money(a.dist)],['Current value (indicative)',money(a.value)],['Total value',money(a.total)],['TVPI (total value ÷ paid-in)',a.tvpi?a.tvpi.toFixed(2)+'×':'—'],['DPI (distributions ÷ paid-in)',a.paid?a.dpi.toFixed(2)+'×':'—'],['Price per unit',a.price?money(a.price):'—']].forEach(function(r){dl.appendChild(el('dt',null,r[0]));dl.appendChild(el('dd',null,r[1]));});
  ca.appendChild(dl);if(m.priceLabel){var pl=el('p','ip-empty',m.priceLabel);pl.style.marginTop='10px';ca.appendChild(pl);}R.appendChild(ca);
  if(ROUND_UNITS){var oc=card('Ownership','If '+ROUND+' is fully raised');oc.appendChild(donut(a));R.appendChild(oc);}
  g.appendChild(L);g.appendChild(R);box.appendChild(g);
}
function vDocuments(box,act){
  var f=S.f;
  if((m.docs||[]).length>1)act.appendChild(link('Download my documents','dl',m.urls.zip,false,false));
  var c=card('All documents');
  var docs=allDocs(),fl=el('div','ip-filters');
  var q=el('input');q.type='search';q.placeholder='Search documents';q.value=f.q;q.id='ipQ';q.setAttribute('aria-label','Search documents');q.oninput=function(){f.q=q.value;draw();};fl.appendChild(q);
  var seg=el('div','ip-seg');[['all','All'],['mine','Mine'],['company','Company']].forEach(function(x){var b=el('button',null,x[1]);b.type='button';b.setAttribute('aria-pressed',String(f.src===x[0]));b.onclick=function(){f.src=x[0];render();var e=$('ipQ');if(e)e.focus();};seg.appendChild(b);});fl.appendChild(seg);
  var types=docs.map(function(d){return d.type_;}).filter(function(v,i,s){return v&&s.indexOf(v)===i;}).sort();
  var ts=el('select');ts.setAttribute('aria-label','Document type');ts.appendChild(new Option('All types',''));types.forEach(function(t){ts.appendChild(new Option(t,t));});ts.value=f.type;ts.onchange=function(){f.type=ts.value;draw();};fl.appendChild(ts);
  var years=docs.map(function(d){return String(d.date||'').slice(0,4);}).filter(function(v,i,s){return v&&s.indexOf(v)===i;}).sort().reverse();
  var ys=el('select');ys.setAttribute('aria-label','Year');ys.appendChild(new Option('All years',''));years.forEach(function(y){ys.appendChild(new Option(y,y));});ys.value=f.year;ys.onchange=function(){f.year=ys.value;draw();};fl.appendChild(ys);
  if(m.role==='admin'){var vs=el('select');vs.setAttribute('aria-label','View as');[['all','View as: admin'],['prospect','View as: prospect'],['investor','View as: unit holder'],['employee','View as: team']].forEach(function(x){vs.appendChild(new Option(x[1],x[0]));});vs.value=f.as;vs.onchange=function(){f.as=vs.value;draw();};fl.appendChild(vs);
    act.appendChild(btn('Upload documents','library',false,function(){go('library');}));}
  c.appendChild(fl);var out=el('div');c.appendChild(out);box.appendChild(c);
  function draw(){
    out.textContent='';var qq=f.q.trim().toLowerCase();
    var list=docs.filter(function(d){return (f.src==='all'||(f.src==='mine')===!!d.mine)&&(!f.type||d.type_===f.type)&&(!f.year||String(d.date).slice(0,4)===f.year)&&(f.as==='all'||(!d.mine&&(GROUPS[d.group]||[]).indexOf(f.as)>-1))&&(!qq||((d.title||'')+' '+(d.desc||'')+' '+(d.type_||'')).toLowerCase().indexOf(qq)>-1);});
    out.appendChild(el('p','ip-empty',list.length+' of '+docs.length+' documents'));
    if(list.length){var t=docTable(list,false);t.style.marginTop='8px';out.appendChild(t);}
  }
  draw();
}
function openLink(d,label){var pdf=/pdf|image/.test(d.type||'');return link(label||(pdf?'View':'Download'),null,pdf?d.view:d.url,false,pdf);}
function docTable(list,compact){
  var rows=list.map(function(d){
    var nm=el('span','nm',d.title||'Document');
    if(isNew(d)){nm.appendChild(document.createTextNode(' '));nm.appendChild(el('span','ip-pill new','New'));}
    if(!compact&&d.desc)nm.appendChild(el('span','sub',d.desc));
    var ty=el('span','ip-pill'+(d.mine?' gold':''),d.mine?(PCATS[d.cat]||'Personal'):d.type_||'Document');
    var a=el('span');
    if(/pdf|image/.test(d.type||''))a.appendChild(link('View',null,d.view,false,true));
    a.appendChild(link('Download',null,d.url,false,false));
    return {cells:compact?[nm,fmtDate(d.date),a]:[nm,ty,fmtDate(d.date),d.size?kb(d.size):'',a]};
  });
  if(compact){var tw=table([{h:'Document'},{h:'Date'},{h:'',act:1}],rows);tw.classList.add('compact');return tw;}
  return table([{h:'Document'},{h:'Type'},{h:'Date'},{h:'Size',n:1},{h:'',act:1}],rows);
}
function vUpdates(box){
  if((m.announcements||[]).length)box.appendChild(annCard(0));
  var ups=allDocs().filter(function(d){return d.cat==='updates'||/report|update/i.test(d.type_||'');});
  var c=card('Reports and investor updates');c.appendChild(ups.length?docTable(ups,false):el('p','ip-empty','No reports have been shared with you yet.'));box.appendChild(c);
}
function vCompany(box){
  var g=el('div','ip-grid ip-2'),L=el('div','ip-grid'),R=el('div','ip-grid');
  var ab=card('About'),p=el('p',null,m.about||'');p.style.margin='0';ab.appendChild(p);L.appendChild(ab);
  L.appendChild(factsCard());
  R.appendChild(contacts());
  if((m.links||[]).length){var lk=card('Links'),ul=el('ul','ip-list');m.links.forEach(function(x){var li=el('li'),a=el('a',null,x[0]);a.href=x[1];li.appendChild(a);ul.appendChild(li);});lk.appendChild(ul);R.appendChild(lk);}
  g.appendChild(L);g.appendChild(R);box.appendChild(g);
}
function contacts(){
  var c=card('Contacts'),ul=el('ul','ip-list');
  (m.contacts||[]).forEach(function(x){var li=el('li'),d=el('div');d.appendChild(el('b',null,x[0]+(x[1]?' · '+x[1]:'')));if(x[2])d.appendChild(el('p',null,x[2]));if(x[3]){var e=el('a','ip-mono',x[3]);e.href='mailto:'+x[3];e.style.display='inline-block';e.style.marginTop='2px';d.appendChild(e);}li.appendChild(d);ul.appendChild(li);});
  c.appendChild(ul);return c;
}
function vInvestors(box,act){
  var r=(m.roster||[]).slice().sort(function(a,b){return (b.units||0)-(a.units||0)||String(a.name).localeCompare(b.name);}),price=+m.unitPrice||0;
  act.appendChild(btn('Add or edit people','people',true,function(){go('people');}));
  act.appendChild(btn('Documents','library',false,function(){go('library');}));
  act.appendChild(btn('Activity log','log',false,function(){go('log');}));
  var cnt=function(role){return r.filter(function(x){return x.role===role;}).length;},tu=r.reduce(function(s,x){return s+(x.units||0);},0),ti=r.reduce(function(s,x){return s+(x.invested||0);},0);
  box.appendChild(strip([{label:'People with a sign-in',value:num(r.length)},{label:'Unit holders',value:num(cnt('investor'))},{label:'Prospective investors',value:num(cnt('prospect'))},{label:'Team and admins',value:num(cnt('employee')+cnt('admin'))},{label:'Units held by portal members',value:num(tu)+' ('+(tu/OUT*100).toFixed(1)+'%)'}]));
  var c=card('Who has access','Passwords are never visible to anyone');
  var rows=r.map(function(x){var nm=el('button','ip-linkbtn nm',x.name||'—');nm.type='button';nm.onclick=function(){if(O.openPerson)O.openPerson(x.uid);};return {cells:[el('span','ip-mono',x.id),nm,el('span','ip-pill'+(x.role==='investor'?' good':x.role==='admin'?' gold':''),ROLES[x.role]||x.role),el('span','ip-pill'+(/app/i.test(x.twofa)?' good':/no/i.test(x.twofa)?' warn':''),x.twofa||'—'),x.last?fmtDate(x.last):'Never',x.units?num(x.units):'—',x.units?(x.units/OUT*100).toFixed(2)+'%':'—',x.invested?money(x.invested):'—',x.units&&price?money(x.units*price):'—']};});
  rows.push({cls:'tot',cells:['','Total','','','',num(tu),(tu/OUT*100).toFixed(2)+'%',ti?money(ti):'—',price?money(tu*price):'—']});
  c.appendChild(table([{h:'Portal ID'},{h:'Name'},{h:'Role'},{h:'Two-factor'},{h:'Last sign-in'},{h:'Units',n:1},{h:'Ownership',n:1},{h:'Paid-in',n:1},{h:'Current value',n:1}],rows));
  box.appendChild(c);
  var ac=card('Recent activity',null),ul=el('ul','ip-act');
  (m.activity||[]).forEach(function(x){var li=el('li');li.appendChild(el('b',null,x.who+' '+(ACT[x.action]||x.action)+(x.doc?' · '+x.doc:'')));li.firstChild.style.fontWeight='500';li.appendChild(el('span',null,typeof x.when==='number'?new Date(x.when*1000).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):x.when));ul.appendChild(li);});
  ac.appendChild((m.activity||[]).length?ul:el('p','ip-empty','No activity yet.'));
  var al=el('p','ip-empty');al.style.marginTop='12px';var aa=el('button','ip-linkbtn','Full activity log');aa.type='button';aa.onclick=function(){go('log');};al.appendChild(aa);ac.appendChild(al);
  box.appendChild(ac);
}
function vHelp(box){
  var c=card('How the portal works'),d=el('div','ip-help');
  [['Your sign-in','You sign in with your email and your own password, then the 6-digit code from your authenticator app. Forgot your password? Ask the CFO for a new sign-in link; it lets you choose a new one.'],
   ['Two-factor','Your authenticator app (Google Authenticator, Microsoft Authenticator, 1Password or similar) makes a new code every 30 seconds. If you lose your phone, sign in with one of your recovery codes, or ask the CFO to reset your two-factor.'],
   ['What you can see','Your role sets which documents you can open. Unit holders see their capital account, holder reports and K-1s. The team sees operating manuals and policies.'],
   ['Security','Documents are stored encrypted and are sent only to signed-in people whose role allows it. Every view and download is logged. You are signed out after '+(m.idleMinutes||30)+' minutes without activity.'],
   ['Values and multiples','Current value uses the price per unit in the most recent round. TVPI is total value (current value plus distributions) divided by what you paid in; DPI is distributions divided by paid-in. These are indicative, not an appraisal or a tax valuation.']].forEach(function(x){var p=el('p');p.appendChild(el('b',null,x[0]+'. '));p.appendChild(document.createTextNode(x[1]));d.appendChild(p);});
  var pa=el('p');pa.appendChild(btn('Password and two-factor','security',true,function(){go('security');}));d.appendChild(pa);
  c.appendChild(d);box.appendChild(c);box.appendChild(contacts());
}

/* ---------- the round, for prospective investors ---------- */
function offerNums(){
  var o=m.offer||{},pre=+o.pre||0,raise=+o.raise||0,price=pre&&OUT?pre/OUT:(+m.unitPrice||0),units=price?Math.round(raise/price):0;
  return {pre:pre,raise:raise,post:pre+raise,price:price,units:units,pct:units?units/(OUT+units)*100:0};
}
function short$(n){n=+n||0;if(n>=1e9)return '$'+(n/1e9).toFixed(n%1e9?1:0)+'B';if(n>=1e6)return '$'+(n/1e6).toFixed(n%1e6?1:0)+'M';if(n>=1e3)return '$'+Math.round(n/1e3)+'K';return money(n);}
function firstPrice(){var h=(m.priceHistory||[]).slice().sort(function(a,b){return (a.date||'').localeCompare(b.date||'');})[0];return h&&+h.price&&h.date?[['Price per unit in '+String(h.date).slice(0,4)+(h.label?' ('+h.label+')':''),money(+h.price)]]:[];}
function libDoc(re){return S.lib.filter(function(d){return re.test(d.title||'');})[0]||null;}
function mailto(subject){var o=m.offer||{};return 'mailto:'+(o.email||'')+'?subject='+encodeURIComponent(subject);}
function offerHero(teaser){
  var o=m.offer,n=offerNums(),h=el('section','ip-hero');
  h.appendChild(el('div','kick','Now raising · '+(o.title||'')));
  h.appendChild(el('h2',null,o.lead||''));
  var g=el('div','nums');
  [['Raising',short$(n.raise),1],['Pre-money valuation',short$(n.pre)],['Price per unit',money(n.price)],['Units offered',num(n.units)],['Full round buys',n.pct.toFixed(2)+'%']].forEach(function(x){var d=el('div');d.appendChild(el('span',null,x[0]));d.appendChild(el('b',x[2]?'g':null,x[1]));g.appendChild(d);});
  h.appendChild(g);
  var c=el('div','cta');
  if(teaser){var b=btn('See the opportunity','arrow',false,function(){go('opportunity');});b.className='ip-btn gold';c.appendChild(b);}
  var one=libDoc(/one-?pager/i);if(one){var a=openLink(one,'Read the one-pager');a.className='ip-btn ghost';c.appendChild(a);}
  if(o.email){var mt=link('Talk to Sarvesh','mail',mailto('AeroAssist round: I’d like to talk'),false,false);mt.className='ip-btn '+(teaser?'ghost':'gold');c.appendChild(mt);}
  h.appendChild(c);return h;
}
function vOpportunity(box,act){
  var o=m.offer;if(!o){box.appendChild(el('p','ip-empty','There is no open round to show.'));return;}
  var n=offerNums();
  if(o.email)act.appendChild(link('Email Sarvesh','mail',mailto('AeroAssist round: question'),true,false));
  box.appendChild(offerHero(false));

  /* why */
  if((o.highlights||[]).length){
    var hw=el('div','ip-hl');
    o.highlights.forEach(function(x,i){var c=el('section','ip-card');c.appendChild(el('span','idx','0'+(i+1)));c.appendChild(el('h3',null,x[0]));c.appendChild(el('p',null,x[1]));hw.appendChild(c);});
    box.appendChild(sectionHead('Why AeroAssist, and why now'));box.appendChild(hw);
  }

  /* track record */
  if((o.track||[]).length){
    var tc=el('section','ip-card ip-trackcard');
    tc.appendChild(el('div','kick','Capital history'));
    tc.appendChild(el('h3',null,'In 2023, outside investors put in about $600,000. It was repaid in full by April 2024, and those investors still hold their units.'));
    var tg=el('div','ip-track');o.track.forEach(function(x){var d=el('div');d.appendChild(el('b',null,x[0]));d.appendChild(el('p',null,x[1]));tg.appendChild(d);});tc.appendChild(tg);
    tc.appendChild(el('p','fine','Past repayments are not a pattern or a promise. The company has no plan or obligation to repay investors in this round, and you could lose all of your investment. Units in this round cost '+money(n.price)+', so the earlier investors’ outcome says nothing about yours.'));
    box.appendChild(tc);
  }

  /* return scenarios */
  box.appendChild(sectionHead('What an investment could be worth','Illustrative arithmetic, not a forecast'));
  var g=el('div','ip-grid ip-2'),L=el('div','ip-grid'),R=el('div','ip-grid');
  var cc=el('section','ip-card ip-calc');
  var st={amt:100000,dil:+o.dilution||0,custom:''};
  var ctl=el('div','ctls');
  var ra=rangeCtl('Investment','amt',50000,1000000,50000,st.amt,function(v){return money(v);});
  var rd=rangeCtl('Dilution from later rounds before a sale','dil',0,60,5,st.dil,function(v){return v+'%';});
  ctl.appendChild(ra.w);ctl.appendChild(rd.w);
  var cw=el('label','ctl'),cs=el('span',null,'Try your own sale price');cw.appendChild(cs);var ci=el('input');ci.type='text';ci.inputMode='numeric';ci.placeholder='e.g. 150M or 1.2B';cw.appendChild(ci);ctl.appendChild(cw);
  cc.appendChild(ctl);
  var sum=el('div','ip-calc-sum');cc.appendChild(sum);
  var rows=el('div','ip-sc-rows');cc.appendChild(rows);
  cc.appendChild(el('p','fine','Units = investment ÷ '+money(n.price)+', rounded down. Ownership assumes the full '+short$(n.raise)+' is raised ('+num(OUT+n.units)+' units). Later rounds usually reduce everyone’s share; the slider sets by how much. The math ignores taxes, fees, debt, time and any preferences later investors may negotiate. These sale prices are examples, not predictions, and the company may never be sold.'));
  ra.i.oninput=function(){st.amt=+ra.i.value;ra.o.textContent=money(st.amt);calc();};
  rd.i.oninput=function(){st.dil=+rd.i.value;rd.o.textContent=st.dil+'%';calc();};
  ci.oninput=function(){st.custom=ci.value;calc();};
  function calc(){
    var units=n.price?Math.floor(st.amt/n.price):0,paid=units*n.price,own=units/(OUT+n.units),own2=own*(1-st.dil/100);
    sum.textContent='';
    [['Units',num(units)+(paid!==st.amt?' ('+money(paid)+')':'')],['Ownership after the round',(own*100).toFixed(3)+'%'],['After later rounds',(own2*100).toFixed(3)+'%']].forEach(function(x){var d=el('div');d.appendChild(el('span',null,x[0]));d.appendChild(el('b',null,x[1]));sum.appendChild(d);});
    var ex=(o.exits||[]).slice(),cm=String(st.custom).trim().toUpperCase().replace(/[$,\s]/g,'').match(/^([0-9.]+)([KMB])?$/),cv=cm?(+cm[1])*({K:1e3,M:1e6,B:1e9}[cm[2]]||1):0;if(cv>0)ex.push(cv);
    ex=ex.filter(function(v,i,s){return s.indexOf(v)===i;}).sort(function(a,b){return a-b;});
    var top=Math.max.apply(null,ex.map(function(e){return own2*e;}).concat([paid,1]));
    rows.textContent='';
    var list=[{label:'If the company fails',v:0,fail:true}].concat(ex.map(function(e){return {label:'Sold for '+short$(e),v:own2*e,custom:e===cv};}));
    list.forEach(function(r){
      var d=el('div','ip-sc'+(r.fail?' fail':'')+(r.custom?' mine':''));d.appendChild(el('span','lb',r.label));
      var bar=el('span','bar'),i=el('i');i.style.width=(r.v/top*100).toFixed(2)+'%';bar.appendChild(i);d.appendChild(bar);
      var v=el('span','v');v.appendChild(el('b',null,money(r.v)));v.appendChild(el('small',null,paid?(r.v/paid).toFixed(1)+'×':'—'));d.appendChild(v);rows.appendChild(d);
    });
  }
  calc();L.appendChild(cc);
  if((o.comps||[]).length){var cp=card('For scale','Recent deals in public-safety drones'),cl=el('ul','ip-list ip-comps');
    o.comps.forEach(function(x){var li=el('li'),d=el('div');d.appendChild(el('b',null,x[0]));d.appendChild(el('p',null,x[1]));li.appendChild(d);li.appendChild(el('span','amt',x[2]));cl.appendChild(li);});
    cp.appendChild(cl);var cf=el('p','ip-empty','Reported figures from public sources. These are among the most successful companies in the category; most never reach outcomes like these, and their results say nothing certain about ours.');cf.style.marginTop='10px';cp.appendChild(cf);L.appendChild(cp);}
  var tc2=card('The terms'),dl=el('dl','ip-facts ip-terms');
  [['Raise',money(n.raise)],['Security',o.security||'—'],['Pre-money valuation',money(n.pre)],['Post-money valuation',money(n.post)],['Price per unit',money(n.price)]].concat(firstPrice()).concat([['Units outstanding today',num(OUT)],['New units',num(n.units)],['Ownership for the full round',n.pct.toFixed(2)+'%'],['Minimum investment',o.min||'Ask us']]).forEach(function(r){dl.appendChild(el('dt',null,r[0]));dl.appendChild(el('dd',null,r[1]));});
  tc2.appendChild(dl);R.appendChild(tc2);
  g.appendChild(L);g.appendChild(R);box.appendChild(g);

  /* use of funds */
  if((o.use||[]).length||(o.phases||[]).length){
    box.appendChild(sectionHead('Where the money goes'));
    var g2=el('div','ip-grid ip-2'),L2=el('div','ip-grid'),R2=el('div','ip-grid');
    if((o.use||[]).length){var uc=card('Use of funds',money(n.raise)),tot=o.use.reduce(function(s,x){return s+(+x[1]||0);},0)||1,mx=Math.max.apply(null,o.use.map(function(x){return +x[1]||0;}))||1,ul=el('div','ip-use');
      o.use.forEach(function(x){var r=el('div','row');r.appendChild(el('span','lb',x[0]));var b=el('span','bar'),i=el('i');i.style.width=((+x[1]||0)/mx*100).toFixed(1)+'%';b.appendChild(i);r.appendChild(b);var v=el('span','v');v.appendChild(el('b',null,short$(+x[1])));v.appendChild(el('small',null,Math.round((+x[1]||0)/tot*100)+'%'));r.appendChild(v);ul.appendChild(r);});
      uc.appendChild(ul);L2.appendChild(uc);}
    if((o.phases||[]).length){var pc=card('Planned spending in two phases'),pw=el('div','ip-phases');
      o.phases.forEach(function(x){var d=el('div');var hd=el('div','hd');hd.appendChild(el('b',null,x[0]));hd.appendChild(el('span','ip-pill gold',short$(+x[1])));d.appendChild(hd);d.appendChild(el('small',null,x[2]));d.appendChild(el('p',null,x[3]));pw.appendChild(d);});
      pc.appendChild(pw);var pf=el('p','ip-empty','Monthly updates to investors report spending against these milestones.');pf.style.marginTop='12px';pc.appendChild(pf);R2.appendChild(pc);}
    g2.appendChild(L2);g2.appendChild(R2);box.appendChild(g2);
  }

  /* risks */
  if((o.risks||[]).length){var rc=card('The risks, plainly','Read these before you invest'),rl=el('div','ip-risks');
    o.risks.forEach(function(x){var d=el('div');d.appendChild(el('b',null,x[0]));d.appendChild(el('p',null,x[1]));rl.appendChild(d);});rc.appendChild(rl);box.appendChild(rc);}

  /* next steps */
  if((o.steps||[]).length){var sc=card('How to invest'),ol=el('ol','ip-steps2');
    o.steps.forEach(function(x,i){var li=el('li');li.appendChild(el('b',null,x[0]));li.appendChild(el('p',null,x[1]));
      var t=(x[0]+' '+x[1]).toLowerCase(),dd=null,lab='';
      if(/\bnda\b|non-?disclosure/.test(t)){dd=libDoc(/non-?disclosure|\bnda\b/i);lab='Open the NDA';}
      else if(/subscri/.test(x[0].toLowerCase())){dd=libDoc(/subscription/i);lab='Open the agreement';}
      else if(/one-?pager|read/.test(t)){dd=libDoc(/one-?pager/i);lab='Open the one-pager';}
      if(dd){var a=openLink(dd,lab);a.classList.add('sm');li.appendChild(a);}
      else if(/talk|call/.test(t)&&o.email){var a2=link('Email Sarvesh','mail',mailto('AeroAssist round: let’s set up a call'),false,false);a2.classList.add('sm');li.appendChild(a2);}
      ol.appendChild(li);});
    sc.appendChild(ol);box.appendChild(sc);}
  if(o.note){var nt=el('p','ip-fineprint',o.note);box.appendChild(nt);}
}
function sectionHead(t,s){var h=el('div','ip-sec');h.appendChild(el('h2',null,t));if(s)h.appendChild(el('span',null,s));return h;}
function rangeCtl(label,id,min,max,step,val,fmt){
  var w=el('label','ctl'),top=el('span');top.appendChild(document.createTextNode(label));var o=el('output',null,fmt(val));top.appendChild(o);w.appendChild(top);
  var i=el('input');i.type='range';i.min=min;i.max=max;i.step=step;i.value=val;i.setAttribute('aria-label',label);w.appendChild(i);return {w:w,i:i,o:o};
}

/* ---------- charts ---------- */
var NS='http://www.w3.org/2000/svg';
function svgEl(svg,t,a,txt){var e=document.createElementNS(NS,t);for(var k in a)e.setAttribute(k,a[k]);if(txt!=null)e.textContent=txt;svg.appendChild(e);return e;}
function valueChart(hist,mult){
  var rows=hist.slice().sort(function(a,b){return (a.date||'').localeCompare(b.date||'');}).map(function(r){return {date:r.date,label:r.label,v:(+r.price||0)*mult};});
  var nar=window.innerWidth<640,fs=nar?1.25:1,W=nar?380:620,H=nar?250:230,L=nar?86:70,R=nar?12:24,T=30,B=36,top=Math.max.apply(null,rows.map(function(r){return r.v;}))||1,max=top*1.18;
  var t0=Date.parse(rows[0].date),span=Math.max(1,Date.parse(rows[rows.length-1].date)-t0);
  var X=function(d){return L+(Date.parse(d)-t0)/span*(W-L-R);},Y=function(v){return T+(1-v/max)*(H-T-B);};
  var svg=document.createElementNS(NS,'svg');svg.setAttribute('viewBox','0 0 '+W+' '+H);svg.setAttribute('role','img');
  svg.setAttribute('aria-label',rows.map(function(r){return fmtDate(r.date)+': '+money(r.v);}).join(', '));
  [0,.5,1].forEach(function(f){var v=top*f;svgEl(svg,'line',{x1:L,x2:W-R,y1:Y(v),y2:Y(v),stroke:'#e3e6ec'});svgEl(svg,'text',{x:L-10,y:Y(v)+4,'text-anchor':'end','font-size':12*fs,fill:'#8a93a2','font-family':'IBM Plex Sans, sans-serif'},money(v));});
  var d='M'+X(rows[0].date)+' '+Y(rows[0].v);for(var i=1;i<rows.length;i++)d+=' H'+X(rows[i].date)+' V'+Y(rows[i].v);
  var area=d+' V'+Y(0)+' H'+X(rows[0].date)+' Z';svgEl(svg,'path',{d:area,fill:'#14213d','fill-opacity':.05});
  svgEl(svg,'path',{d:d,fill:'none',stroke:'#14213d','stroke-width':2.25});
  rows.forEach(function(r,i){var last=i===rows.length-1;svgEl(svg,'circle',{cx:X(r.date),cy:Y(r.v),r:5,fill:last?'#8a6420':'#fff',stroke:last?'#8a6420':'#14213d','stroke-width':2});
    svgEl(svg,'text',{x:X(r.date)+(last?-10:10),y:Y(r.v)-12,'text-anchor':last?'end':'start','font-size':13.5*fs,'font-weight':600,fill:'#0b1220','font-family':'IBM Plex Sans, sans-serif'},money(r.v)+(r.label&&!nar?'  ·  '+r.label:''));
    svgEl(svg,'text',{x:X(r.date),y:H-12,'text-anchor':i===0?'start':(last?'end':'middle'),'font-size':12*fs,fill:'#8a93a2','font-family':'IBM Plex Sans, sans-serif'},MON[+String(r.date).slice(5,7)-1]+' '+String(r.date).slice(0,4));});
  var w=el('div','ip-chart');w.appendChild(svg);return w;
}
function donut(a){
  var total=a.out+ROUND_UNITS,parts=[[a.units,'#8a6420','You'],[a.out-a.units,'#c9ced8','Other unit holders'],[ROUND_UNITS,'#14213d','New units in '+ROUND]];
  var svg=document.createElementNS(NS,'svg');svg.setAttribute('viewBox','0 0 120 120');svg.setAttribute('role','img');svg.setAttribute('aria-label','You hold '+(a.units/total*100).toFixed(2)+'% after the round');
  var r=46,C=2*Math.PI*r,off=0;parts.forEach(function(p){var len=Math.max(p[0]/total*C,p[2]==='You'?1.6:0);svgEl(svg,'circle',{cx:60,cy:60,r:r,fill:'none',stroke:p[1],'stroke-width':16,'stroke-dasharray':len+' '+(C-len),'stroke-dashoffset':-off,transform:'rotate(-90 60 60)'});off+=len;});
  svgEl(svg,'text',{x:60,y:58,'text-anchor':'middle','font-size':15,'font-weight':600,fill:'#0b1220','font-family':'IBM Plex Sans, sans-serif'},(a.units/total*100).toFixed(2)+'%');
  svgEl(svg,'text',{x:60,y:74,'text-anchor':'middle','font-size':9,fill:'#5a6577','font-family':'IBM Plex Sans, sans-serif'},'your share');
  var w=el('div','ip-donut');w.appendChild(svg);var lg=el('div','ip-legend');lg.style.flexDirection='column';
  parts.forEach(function(p){var s=el('span');var i=el('i');i.style.background=p[1];s.appendChild(i);s.appendChild(document.createTextNode(p[2]+' · '+num(p[0])+' units ('+(p[0]/total*100).toFixed(2)+'%)'));lg.appendChild(s);});
  w.appendChild(lg);return w;
}

/* ---------- statement (made in the browser from the figures above) ---------- */
function loadScript(src){return new Promise(function(ok,no){var s=document.createElement('script');s.src=src;s.onload=ok;s.onerror=no;document.head.appendChild(s);});}
function statement(b){
  var t=b.textContent;b.textContent='Preparing…';b.disabled=true;
  (window.jspdf?Promise.resolve():loadScript(m.urls.vendor+'jspdf.umd.min.js')).then(function(){
    var h=m.holder||{},a=acct(),doc=new window.jspdf.jsPDF({unit:'pt',format:'letter'}),y=64;
    var row=function(k,v,bold){doc.setFont('helvetica',bold?'bold':'normal');doc.text(k,56,y);doc.text(String(v),556,y,{align:'right'});y+=17;};
    doc.setFont('helvetica','bold');doc.setFontSize(18);doc.text('AeroAssist Industries',56,y);y+=20;
    doc.setFontSize(11);doc.setFont('helvetica','normal');doc.setTextColor(90);doc.text('Unit holder statement',56,y);doc.text('Records as of '+(fmtDate(m.asOf)||'—'),556,y,{align:'right'});doc.setTextColor(0);y+=12;
    doc.setDrawColor(138,100,32);doc.setLineWidth(1.2);doc.line(56,y,556,y);y+=26;
    doc.setFontSize(10);row('Unit holder',h.name||'');row('Portal ID',S.id);row('Generated',fmtDate(new Date().toISOString().slice(0,10)));
    y+=12;doc.setFont('helvetica','bold');doc.setFontSize(12);doc.text('Capital account',56,y);y+=18;doc.setFontSize(10);
    row('Paid-in capital',a.paid?money(a.paid):'—');row('Distributions received',money(a.dist));row('Current value (indicative)',money(a.value));row('Total value',money(a.total),true);
    row('TVPI',a.tvpi?a.tvpi.toFixed(2)+'x':'—');row('DPI',a.paid?a.dpi.toFixed(2)+'x':'—');
    y+=12;doc.setFont('helvetica','bold');doc.setFontSize(12);doc.text('Position',56,y);y+=18;doc.setFontSize(10);
    row('Security','LLC membership units');row('Units held',num(a.units));row('Ownership today',a.pct.toFixed(2)+'% of '+num(a.out)+' units');if(ROUND_UNITS)row('Ownership after '+ROUND+' (if fully raised)',a.after.toFixed(2)+'%');row('Current price per unit',a.price?money(a.price):'—');
    y+=12;doc.setFont('helvetica','bold');doc.setFontSize(12);doc.text('Transactions',56,y);y+=18;doc.setFontSize(10);
    var tx=(m.transactions||[]).slice().sort(function(p,q){return (p.date||'').localeCompare(q.date||'');});
    if(!tx.length){doc.setFont('helvetica','normal');doc.text('None recorded.',56,y);y+=16;}
    else{doc.setFont('helvetica','bold');doc.text('Date',56,y);doc.text('Type',150,y);doc.text('Units',430,y,{align:'right'});doc.text('Amount',556,y,{align:'right'});y+=6;doc.setDrawColor(220);doc.line(56,y,556,y);y+=14;doc.setFont('helvetica','normal');
      tx.forEach(function(x){if(y>700){doc.addPage();y=64;}doc.text(fmtDate(x.date),56,y);doc.text(String(x.type||''),150,y);doc.text(x.units?num(x.units):'—',430,y,{align:'right'});doc.text(x.amount?money(x.amount):'—',556,y,{align:'right'});y+=15;if(x.note){doc.setTextColor(120);doc.text(doc.splitTextToSize(String(x.note),380),150,y);doc.setTextColor(0);y+=15;}});}
    y+=22;doc.setFontSize(8.5);doc.setTextColor(100);
    var cfo=(m.contacts||[])[0]||[];
    doc.text(doc.splitTextToSize('Company records, unaudited. Current value uses the most recent round price per unit and is not an appraisal, a valuation for tax purposes, or an offer to buy or sell units. Your subscription and operating agreements control.'+(cfo[0]?' Questions: '+cfo[0]+(cfo[1]?', '+cfo[1]:'')+(cfo[3]?', '+cfo[3]:'')+'.':'')+' '+(m.address||'').replace(/ · /g,', '),500),56,y);
    doc.save('AeroAssist_Statement_'+S.id+'_'+(m.asOf||'')+'.pdf');b.textContent=t;b.disabled=false;
  }).catch(function(){b.textContent='Could not prepare the statement';b.disabled=false;});
}

/* ---------- session: idle sign-out and a keep-alive while active ---------- */
var idleT=null,IDLE=(m.idleMinutes||30)*60*1000,lastPing=Date.now();
function idleStart(){clearTimeout(idleT);idleT=setTimeout(function(){if(O.onIdle)O.onIdle();},IDLE);}
function active(){idleStart();if(Date.now()-lastPing>4*60*1000){lastPing=Date.now();if(O.ping)O.ping();}}
['click','keydown','scroll','touchstart'].forEach(function(ev){document.addEventListener(ev,active,{passive:true});});
O.go=go;O.data=D;O.render=function(){nav();render();};
boot();
}};
})();

(function(){
  const WSKEY='saferFontanWorkspace_v6'; // keep same key: preserves all existing simulations/data
  const OLDKEYS=['saferFontanPlanner_v5','saferFontanPlanner_v4'];
  const el=id=>document.getElementById(id);
  const RESOURCE_KEYS=['Jef','AVDB','PDM','MRI','Hospital'];
  let workspace={version:7,activeId:null,simulations:[],layout:{leftWidth:440}};
  let loading=false;

  const oldSave=save;
  const oldApply=apply;
  const oldProject=project;

  function newId(){return 'sim_'+Math.random().toString(36).slice(2,10)}
  function rowId(){return Math.random().toString(36).slice(2,9)}
  function clone(x){return JSON.parse(JSON.stringify(x))}
  function resourcesOf(a){
    if(Array.isArray(a?.resources)) return [...new Set(a.resources.filter(r=>RESOURCE_KEYS.includes(r)))];
    if(a?.resource && RESOURCE_KEYS.includes(a.resource)) return [a.resource];
    return [];
  }
  function truthy(v){
    if(v===1||v===true)return true;
    const s=String(v??'').trim().toLowerCase();
    return ['1','true','yes','ja','y','x','✓','checked'].includes(s);
  }
  function dateCell(v){
    if(v instanceof Date && !isNaN(v)) return iso(v);
    if(typeof v==='number'){
      const d=new Date(Math.round((v-25569)*86400*1000));
      if(!isNaN(d))return iso(d);
    }
    const s=String(v??'').trim();
    if(!s)return '';
    if(/^\d{4}-\d{2}-\d{2}/.test(s))return s.slice(0,10);
    const m=s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})$/);
    if(m)return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
    const d=new Date(s);return isNaN(d)?'':iso(d);
  }

  // Defaults updated from the user's most recent exported absence sheet.
  defaultAbs=function(){return [
    {id:rowId(),resources:['AVDB'],start:'2026-10-06',end:'2026-10-10',reason:'Dender',status:'Hard'},
    {id:rowId(),resources:['AVDB'],start:'2026-11-02',end:'2026-11-08',reason:'Herfstvakantie',status:'Hard'},
    {id:rowId(),resources:['AVDB'],start:'2026-12-21',end:'2026-12-27',reason:'Kerstverlof',status:'Hard'},
    {id:rowId(),resources:['AVDB'],start:'2027-03-29',end:'2027-04-11',reason:'Paasvakantie / mogelijk Korea',status:'Voorlopig'},
    {id:rowId(),resources:['AVDB'],start:'2027-04-09',end:'2027-04-10',reason:'EuroACHD',status:'Hard'},
    {id:rowId(),resources:['AVDB'],start:'2027-06-02',end:'2027-06-05',reason:'Skamania ACHD',status:'Hard'},
    {id:rowId(),resources:['AVDB'],start:'2027-07-15',end:'2027-08-08',reason:'Zomerverlof',status:'Hard'},
    {id:rowId(),resources:['AVDB'],start:'2027-11-01',end:'2027-11-07',reason:'Herfstvakantie',status:'Hard'},
    {id:rowId(),resources:['AVDB'],start:'2027-12-20',end:'2027-12-26',reason:'Kerstverlof',status:'Hard'},
    {id:rowId(),resources:['AVDB'],start:'2028-04-03',end:'2028-04-17',reason:'Paasverlof',status:'Hard'},
    {id:rowId(),resources:['AVDB'],start:'2028-07-15',end:'2028-08-06',reason:'Zomerverlof',status:'Hard'},
    {id:rowId(),resources:['AVDB'],start:'2028-10-30',end:'2028-11-05',reason:'Herfstvakantie',status:'Hard'},
    {id:rowId(),resources:['AVDB'],start:'2028-12-25',end:'2029-01-07',reason:'Kerstverlof',status:'Hard'}
  ]};

  function statutoryForYear(y){
    const e=easter(y);
    return [
      ['Nieuwjaar',new Date(y,0,1,12)],
      ['Paasmaandag',add(e,1)],
      ['Dag van de Arbeid',new Date(y,4,1,12)],
      ['Hemelvaart',add(e,39)],
      ['Pinkstermaandag',add(e,50)],
      ['Nationale feestdag',new Date(y,6,21,12)],
      ['O.L.V. Hemelvaart',new Date(y,7,15,12)],
      ['Allerheiligen',new Date(y,10,1,12)],
      ['Wapenstilstand',new Date(y,10,11,12)],
      ['Kerstmis',new Date(y,11,25,12)]
    ].map(([name,d])=>({id:`be-${y}-${iso(d)}`,date:iso(d),name,enabled:true,predefined:true}));
  }
  function defaultHolidayConfig(){
    let out=[];for(let y=2026;y<=2030;y++)out.push(...statutoryForYear(y));return out;
  }
  function normalizeHolidayConfig(list){
    const seen=new Set(),out=[];
    for(const h of Array.isArray(list)?list:[]){
      const date=dateCell(h.date);if(!date)continue;
      const id=h.id||`custom-${date}-${rowId()}`;
      if(seen.has(id))continue;seen.add(id);
      out.push({id,date,name:String(h.name||h.reason||'Sluitingsdag'),enabled:h.enabled!==false,predefined:!!h.predefined});
    }
    // Add any statutory years not yet present, without overwriting user choices.
    for(let y=2026;y<=2030;y++)for(const h of statutoryForYear(y)){
      if(!out.some(x=>x.predefined&&x.date===h.date&&x.name===h.name))out.push(h);
    }
    return out.sort((a,b)=>a.date.localeCompare(b.date)||a.name.localeCompare(b.name));
  }
  function normalizeProject(p){
    p=p&&p.settings?p:defaultProject();
    p.abs=(p.abs||[]).map(a=>({
      id:a.id||rowId(),resources:resourcesOf(a),start:dateCell(a.start),end:dateCell(a.end||a.start),
      reason:String(a.reason||''),status:String(a.status||'Hard').toLowerCase().startsWith('voor')?'Voorlopig':'Hard'
    }));
    p.holidayConfig=normalizeHolidayConfig(p.holidayConfig);
    return p;
  }
  function defaultProject(){
    return {version:7,savedAt:new Date().toISOString(),settings:{rangeStart:'2026-10-01',rangeEnd:'2027-12-31',targetN:'30',leadDays:'3',holidays:true},abs:defaultAbs(),holidayConfig:defaultHolidayConfig(),plan:[]};
  }

  // Multi-resource aware absence lookup + user-controlled holidays.
  holidays=function(y){
    if(!state.holidayConfig)return [];
    return state.holidayConfig.filter(h=>h.enabled&&D(h.date)?.getFullYear()===y).map(h=>D(h.date));
  };
  inAbs=function(date,resource,hardOnly=false){
    let out=[];
    for(const a of state.abs||[]){
      if(!resourcesOf(a).includes(resource))continue;
      const s=D(a.start),e=D(a.end||a.start);if(!s||!e)continue;
      if(date>=s&&date<=e&&(!hardOnly||a.status==='Hard'))out.push(a);
    }
    if(resource==='Hospital'&&el('holidays')?.checked){
      for(const h of state.holidayConfig||[]){
        if(!h.enabled)continue;const d=D(h.date);
        if(d&&same(d,date))out.push({reason:h.name,status:'Hard',holiday:true});
      }
    }
    return out;
  };

  function injectStyles(){
    if(el('v7styles'))return;
    const st=document.createElement('style');st.id='v7styles';st.textContent=`
      .multi-head,.multi-cell{text-align:center;white-space:nowrap}.multi-cell input{width:auto;transform:scale(1.05)}
      .absence-subtitle{font-size:12px;font-weight:800;margin:10px 0 6px;color:#334155}
      .holiday-manager{margin-top:15px;padding-top:12px;border-top:1px solid #dbe3ee}
      .holiday-toolbar{display:flex;gap:7px;align-items:center;flex-wrap:wrap;margin:7px 0}
      .holiday-wrap{max-height:310px;overflow:auto;border:1px solid #e2e8f0;border-radius:8px}
      .holiday-wrap table{margin:0}.holiday-wrap th{position:sticky;top:0;z-index:2}
      .holiday-on{width:auto!important}.holiday-type{font-size:9px;color:#64748b;white-space:nowrap}
      .holiday-year{font-weight:800;color:#1e3a5f;background:#f8fafc}
      #absCard{min-height:680px}.abs-tablewrap{min-height:300px;max-height:430px!important}
    `;document.head.appendChild(st);
  }
  function setupAbsenceUI(){
    injectStyles();
    const card=el('absCard');if(!card)return;
    const h=card.querySelector('h2');if(h)h.textContent='3. Afwezigheden & sluitingsdagen';
    const desc=card.querySelector('.small');if(desc)desc.textContent='Eén afwezigheid kan voor meerdere personen/resources gelden. Vink hieronder alle betrokkenen aan.';
    const head=card.querySelector('thead tr');
    if(head)head.innerHTML='<th>Start</th><th>Einde</th><th>Reden</th><th>Status</th>'+RESOURCE_KEYS.map(r=>`<th class="multi-head">${r}</th>`).join('')+'<th></th>';
    const master=el('holidays')?.closest('label');
    if(master)master.innerHTML='<input id="holidays" type="checkbox" checked> Aangevinkte feestdagen/sluitingsdagen blokkeren het ziekenhuis';
    if(!el('holidayManager')){
      const div=document.createElement('div');div.id='holidayManager';div.className='holiday-manager';
      div.innerHTML=`<div class="absence-subtitle">Belgische wettelijke feestdagen & extra ziekenhuis-sluitingsdagen</div>
        <div class="small">De wettelijke feestdagen zijn vooraf ingevuld. Vink een datum uit als die voor de studie toch bruikbaar is. Voeg eigen sluitings- of vervangingsdagen toe indien nodig.</div>
        <div class="holiday-toolbar"><button class="btn secondary" id="addHoliday">+ Sluitingsdag toevoegen</button><span class="tiny">Wijzigingen gelden alleen voor de actieve simulatie.</span></div>
        <div class="holiday-wrap"><table><thead><tr><th>Blokkeer</th><th>Datum</th><th>Naam</th><th>Type</th><th></th></tr></thead><tbody id="holidayBody"></tbody></table></div>`;
      card.appendChild(div);
    }
  }

  renderAbs=function(){
    const tb=el('absBody');if(!tb)return;tb.innerHTML='';
    for(const a of state.abs||[]){
      a.resources=resourcesOf(a);
      const tr=document.createElement('tr');
      tr.innerHTML=`<td><input data-k="start" type="date" value="${a.start||''}"></td><td><input data-k="end" type="date" value="${a.end||''}"></td><td><input data-k="reason" value="${String(a.reason||'').replaceAll('"','&quot;')}"></td><td><select data-k="status"><option ${a.status==='Hard'?'selected':''}>Hard</option><option ${a.status==='Voorlopig'?'selected':''}>Voorlopig</option></select></td>${RESOURCE_KEYS.map(r=>`<td class="multi-cell"><input type="checkbox" data-resource="${r}" ${a.resources.includes(r)?'checked':''}></td>`).join('')}<td><button class="btn danger" style="padding:4px 6px">×</button></td>`;
      tr.querySelectorAll('[data-k]').forEach(x=>x.onchange=()=>{a[x.dataset.k]=x.value;changed()});
      tr.querySelectorAll('[data-resource]').forEach(x=>x.onchange=()=>{const r=x.dataset.resource;let set=new Set(resourcesOf(a));x.checked?set.add(r):set.delete(r);a.resources=[...set];changed()});
      tr.querySelector('button').onclick=()=>{state.abs=state.abs.filter(x=>x.id!==a.id);renderAbs();changed()};tb.appendChild(tr);
    }
  };
  addAbs=function(){
    state.abs.push({id:rowId(),resources:['Jef'],start:iso(new Date()),end:iso(new Date()),reason:'',status:'Hard'});renderAbs();changed();
  };
  function renderHolidayManager(){
    const tb=el('holidayBody');if(!tb)return;tb.innerHTML='';
    state.holidayConfig=normalizeHolidayConfig(state.holidayConfig);
    let lastYear=null;
    for(const h of state.holidayConfig){
      const y=(h.date||'').slice(0,4);
      if(y!==lastYear){const yr=document.createElement('tr');yr.innerHTML=`<td colspan="5" class="holiday-year">${y}</td>`;tb.appendChild(yr);lastYear=y;}
      const tr=document.createElement('tr');
      tr.innerHTML=`<td class="multi-cell"><input class="holiday-on" type="checkbox" ${h.enabled?'checked':''}></td><td>${h.predefined?`<span class="nowrap">${fmt(D(h.date))}</span>`:`<input class="hdate" type="date" value="${h.date}">`}</td><td>${h.predefined?String(h.name):`<input class="hname" value="${String(h.name).replaceAll('"','&quot;')}">`}</td><td class="holiday-type">${h.predefined?'Belgische wettelijke feestdag':'Extra sluitingsdag'}</td><td>${h.predefined?'':`<button class="btn danger hdel" style="padding:4px 6px">×</button>`}</td>`;
      tr.querySelector('.holiday-on').onchange=e=>{h.enabled=e.target.checked;changed();renderHolidayManager()};
      const hd=tr.querySelector('.hdate');if(hd)hd.onchange=e=>{h.date=e.target.value;changed();renderHolidayManager()};
      const hn=tr.querySelector('.hname');if(hn)hn.onchange=e=>{h.name=e.target.value;changed()};
      const del=tr.querySelector('.hdel');if(del)del.onclick=()=>{state.holidayConfig=state.holidayConfig.filter(x=>x.id!==h.id);changed();renderHolidayManager()};
      tb.appendChild(tr);
    }
  }
  function addHoliday(){
    const base=el('rangeStart')?.value||iso(new Date());
    state.holidayConfig.push({id:'custom-'+rowId(),date:base,name:'Extra ziekenhuis-sluitingsdag',enabled:true,predefined:false});
    state.holidayConfig=normalizeHolidayConfig(state.holidayConfig);renderHolidayManager();changed();
  }

  renderTimeline=function(){
    const box=el('timeline');if(!box)return;
    if(!state.plan.length){box.innerHTML='<div class="small" style="padding:12px">Genereer eerst een planning.</div>';return}
    let min=add(new Date(Math.min(...state.plan.map(p=>p.start1))),-14),max=add(new Date(Math.max(...state.plan.map(p=>p.stop2))),14),span=days(min,max),px=Math.max(2200,span*3.2),left=125,pos=d=>left+(days(min,d)/span)*(px-left-20),html=`<div class="tl-inner" style="width:${px}px"><div class="tl-axis">`;
    let m=new Date(min.getFullYear(),min.getMonth(),1,12);while(m<=max){html+=`<div class="month" style="left:${pos(m)}px">${m.toLocaleDateString('nl-BE',{month:'short',year:'numeric'})}</div>`;m=new Date(m.getFullYear(),m.getMonth()+1,1,12)}html+='</div>';
    for(const r of RESOURCE_KEYS){
      html+=`<div class="lane"><span class="lane-label">${r}</span>`;
      let arr=(state.abs||[]).filter(a=>resourcesOf(a).includes(r)).map(a=>({...a}));
      if(r==='Hospital'&&el('holidays')?.checked)for(const h of state.holidayConfig||[])if(h.enabled)arr.push({start:h.date,end:h.date,reason:h.name,status:'Hard'});
      for(const a of arr){const s=D(a.start),e=D(a.end||a.start);if(!s||!e||e<min||s>max)continue;const l=pos(s),w=Math.max(8,pos(add(e,1))-l);html+=`<div class="block ${a.status==='Hard'?'':'soft'}" title="${r}: ${a.reason}" style="left:${l}px;width:${w}px">${a.reason}</div>`}html+='</div>';
    }
    state.plan.slice().sort((a,b)=>a.anchor-b.anchor).forEach(p=>{const l=pos(p.start1),rr=pos(p.stop2);html+=`<div class="lane"><span class="lane-label">${p.id}</span><div class="bar" style="left:${l}px;width:${rr-l}px"></div><i class="mark m-s1" title="Start 1 visite ${fmt(p.start1)} / anker ${fmt(p.anchor)}" style="left:${pos(p.start1)}px"></i><i class="mark m-p1" title="Stop 1 ${fmt(p.stop1)}" style="left:${pos(p.stop1)}px"></i><i class="mark m-s2" title="Start 2 visite ${fmt(p.start2)} / anker ${fmt(p.anchor2)}" style="left:${pos(p.start2)}px"></i><i class="mark m-p2" title="Stop 2 ${fmt(p.stop2)}" style="left:${pos(p.stop2)}px"></i></div>`});
    box.innerHTML=html+'</div>';
  };

  // New absence Excel: easy 1/0 columns, while import remains backward compatible with old Resource format.
  importRows=function(rows){
    let n=0;
    for(const raw of rows){
      const o=Object.fromEntries(Object.entries(raw).map(([k,v])=>[String(k).toLowerCase().trim(),v]));
      const start=dateCell(o.start??o.startdatum??o.van),end=dateCell(o.einde??o.end??o.einddatum??o.tot??start),reason=o.reden??o.reason??o.omschrijving??'',status=o.status??'Hard';if(!start)continue;
      let resources=[];
      for(const r of RESOURCE_KEYS){const key=r.toLowerCase();if(Object.prototype.hasOwnProperty.call(o,key)&&truthy(o[key]))resources.push(r)}
      if(!resources.length){const legacy=String(o.resource??o.resources??o.persoon??o.wie??'').trim();if(legacy){for(const r of RESOURCE_KEYS)if(legacy.toLowerCase().split(/[;,|/]+/).map(x=>x.trim()).includes(r.toLowerCase()))resources.push(r)}}
      if(!resources.length)continue;
      state.abs.push({id:rowId(),resources,start,end:end||start,reason:String(reason),status:String(status).toLowerCase().startsWith('voor')?'Voorlopig':'Hard'});n++;
    }
    renderAbs();changed();alert(`${n} afwezigheden geïmporteerd.`);
  };
  async function exportAbsV7(){
    if(!await xlsx()){alert('Excelmodule kon niet laden.');return}
    const rows=(state.abs||[]).map(a=>({Start:a.start,Einde:a.end,Reden:a.reason,Status:a.status,...Object.fromEntries(RESOURCE_KEYS.map(r=>[r,resourcesOf(a).includes(r)?1:0]))}));
    const wb=XLSX.utils.book_new(),ws=XLSX.utils.json_to_sheet(rows);ws['!cols']=[{wch:13},{wch:13},{wch:34},{wch:13},...RESOURCE_KEYS.map(()=>({wch:10}))];XLSX.utils.book_append_sheet(wb,ws,'Afwezigheden');XLSX.writeFile(wb,'SAFER_Fontan_afwezigheden.xlsx');
  }
  async function exportFullV7(){
    if(!await xlsx()){alert('Excelmodule kon niet laden.');return}
    const wb=XLSX.utils.book_new();
    const p=state.plan.map(x=>({ID:x.id,Start1_visite:fmt(x.start1),Start1_anker:fmt(x.anchor),Stop1:fmt(x.stop1),Start2_visite:fmt(x.start2),Start2_anker:fmt(x.anchor2),Stop2:fmt(x.stop2),Kwaliteit:x.quality,Redenen:x.reasons.join('; ')}));
    const a=(state.abs||[]).map(x=>({Start:x.start,Einde:x.end,Reden:x.reason,Status:x.status,...Object.fromEntries(RESOURCE_KEYS.map(r=>[r,resourcesOf(x).includes(r)?1:0]))}));
    const h=(state.holidayConfig||[]).map(x=>({Blokkeren:x.enabled?1:0,Datum:x.date,Naam:x.name,Type:x.predefined?'Belgische wettelijke feestdag':'Extra sluitingsdag'}));
    const r=state.reserve.slice(0,100).map(x=>({Start1_anker:fmt(x.anchor),Stop1:fmt(x.stop1),Start2_anker:fmt(x.anchor2),Stop2:fmt(x.stop2),Categorie:x.category,Kwaliteit:x.quality,Redenen:x.reasons.join('; ')}));
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(p),'Planning');XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(a),'Afwezigheden');XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(h),'Feestdagen');XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(r),'Reserve');XLSX.writeFile(wb,'SAFER_Fontan_planning.xlsx');
  }

  function active(){return workspace.simulations.find(s=>s.id===workspace.activeId)}
  function currentProject(){const p=oldProject();p.version=7;p.abs=clone(state.abs||[]);p.holidayConfig=clone(state.holidayConfig||defaultHolidayConfig());return p}
  function storeCurrent(){const s=active();if(s)s.project=currentProject()}
  function persist(){
    try{localStorage.setItem(WSKEY,JSON.stringify(workspace));if(el('saveState'))el('saveState').textContent='Simulatie lokaal opgeslagen '+new Date().toLocaleTimeString('nl-BE');if(el('simulationStatus'))el('simulationStatus').textContent=`${workspace.simulations.length} simulatie${workspace.simulations.length===1?'':'s'} lokaal bewaard`}catch(e){if(el('saveState'))el('saveState').textContent='Lokale opslag niet beschikbaar'}
  }
  save=function(){if(loading)return;storeCurrent();persist()};

  function loadIntoUI(p){
    p=normalizeProject(clone(p));loading=true;state.holidayConfig=clone(p.holidayConfig);oldApply(p);loading=false;renderAbs();renderHolidayManager();renderTimeline();if(el('searchFrom'))el('searchFrom').value=el('rangeStart').value;hideFallback();
  }
  function uniqueName(base='Versie'){const names=new Set(workspace.simulations.map(s=>s.name));let n=1,name=`${base} ${n}`;while(names.has(name))name=`${base} ${++n}`;return name}
  function renderSelect(){const sel=el('simulationSelect');if(!sel)return;sel.innerHTML='';workspace.simulations.forEach(s=>{const o=document.createElement('option');o.value=s.id;o.textContent=s.name;o.selected=s.id===workspace.activeId;sel.appendChild(o)});if(el('simulationStatus'))el('simulationStatus').textContent=`${workspace.simulations.length} simulatie${workspace.simulations.length===1?'':'s'} lokaal bewaard`}
  function switchTo(id){if(id===workspace.activeId)return;storeCurrent();workspace.activeId=id;const s=active();if(s)loadIntoUI(s.project);renderSelect();persist()}
  function addSimulation(duplicate){storeCurrent();const suggested=uniqueName('Versie'),name=prompt(duplicate?'Naam voor de kopie:':'Naam voor de nieuwe simulatie:',suggested);if(!name||!name.trim())return;const p=duplicate?clone(currentProject()):defaultProject(),id=newId();workspace.simulations.push({id,name:name.trim(),project:p});workspace.activeId=id;loadIntoUI(p);renderSelect();persist()}
  function renameCurrent(){const s=active();if(!s)return;const name=prompt('Nieuwe naam voor deze simulatie:',s.name);if(!name||!name.trim())return;s.name=name.trim();renderSelect();persist()}
  function deleteCurrent(){if(workspace.simulations.length<=1){alert('Er moet minstens één simulatie blijven bestaan.');return}const s=active();if(!confirm(`Simulatie “${s.name}” verwijderen?`))return;workspace.simulations=workspace.simulations.filter(x=>x.id!==s.id);workspace.activeId=workspace.simulations[0].id;loadIntoUI(active().project);renderSelect();persist()}
  function resetCurrent(){const s=active();if(!confirm(`Simulatie “${s?.name||''}” resetten naar de standaardwaarden?`))return;const p=defaultProject();loadIntoUI(p);storeCurrent();persist()}

  function download(name,text){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type:'application/json'}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),800)}
  function safeName(s){return String(s||'simulatie').replace(/[^a-z0-9_-]+/gi,'_')}
  function exportCurrent(){storeCurrent();const s=active();download(`SAFER_Fontan_${safeName(s.name)}.json`,JSON.stringify(s.project,null,2))}
  function exportAll(){storeCurrent();download('SAFER_Fontan_alle_simulaties.json',JSON.stringify(workspace,null,2))}
  function importSimulationFile(file){const r=new FileReader();r.onload=()=>{try{const p=normalizeProject(JSON.parse(r.result));storeCurrent();const id=newId();workspace.simulations.push({id,name:file.name.replace(/\.json$/i,'')||uniqueName('Geïmporteerd'),project:p});workspace.activeId=id;loadIntoUI(p);renderSelect();persist()}catch(e){alert(e.message)}};r.readAsText(file)}
  function importWorkspaceFile(file){const r=new FileReader();r.onload=()=>{try{const w=JSON.parse(r.result);if(!w||!Array.isArray(w.simulations)||!w.simulations.length)throw Error('Ongeldig workspacebestand');workspace=w;workspace.version=7;workspace.layout=workspace.layout||{leftWidth:440};workspace.simulations.forEach(s=>s.project=normalizeProject(s.project));if(!workspace.simulations.some(s=>s.id===workspace.activeId))workspace.activeId=workspace.simulations[0].id;loadIntoUI(active().project);renderSelect();applyLayout();persist()}catch(e){alert(e.message)}};r.readAsText(file)}

  function applyLayout(){let w=Number(workspace.layout?.leftWidth);if(!Number.isFinite(w)||w<360||w>850)w=440;workspace.layout={leftWidth:w};document.documentElement.style.setProperty('--left-width',w+'px')}
  function initResizers(){applyLayout();const splitter=el('mainSplitter');if(!splitter)return;let dragging=false;splitter.addEventListener('mousedown',e=>{dragging=true;document.body.style.userSelect='none';e.preventDefault()});window.addEventListener('mousemove',e=>{if(!dragging)return;const grid=el('mainGrid').getBoundingClientRect(),w=Math.max(360,Math.min(850,e.clientX-grid.left));workspace.layout.leftWidth=Math.round(w);document.documentElement.style.setProperty('--left-width',w+'px')});window.addEventListener('mouseup',()=>{if(dragging){dragging=false;document.body.style.userSelect='';persist()}});splitter.addEventListener('dblclick',()=>{workspace.layout.leftWidth=440;document.documentElement.style.setProperty('--left-width','440px');persist()})}

  function migrateOrLoad(){
    let loaded=false;const raw=localStorage.getItem(WSKEY);if(raw){try{workspace=JSON.parse(raw);loaded=Array.isArray(workspace.simulations)&&workspace.simulations.length>0}catch(e){}}
    if(!loaded){let p=null;for(const k of OLDKEYS){const x=localStorage.getItem(k);if(x){try{p=JSON.parse(x);break}catch(e){}}}if(!p||!p.settings)p=defaultProject();const id=newId();workspace={version:7,activeId:id,simulations:[{id,name:'Versie 1',project:normalizeProject(p)}],layout:{leftWidth:440}}}
    workspace.version=7;workspace.layout=workspace.layout||{leftWidth:440};workspace.simulations.forEach(s=>s.project=normalizeProject(s.project));if(!workspace.simulations.some(s=>s.id===workspace.activeId))workspace.activeId=workspace.simulations[0].id;
  }

  function bind(){
    el('simulationSelect').onchange=e=>switchTo(e.target.value);el('newSimulation').onclick=()=>addSimulation(false);el('duplicateSimulation').onclick=()=>addSimulation(true);el('renameSimulation').onclick=renameCurrent;el('deleteSimulation').onclick=deleteCurrent;
    el('saveProject').onclick=exportCurrent;el('loadProject').onclick=()=>el('projectFile').click();el('projectFile').onchange=e=>{if(e.target.files[0])importSimulationFile(e.target.files[0]);e.target.value=''};
    el('saveWorkspace').onclick=exportAll;el('loadWorkspace').onclick=()=>el('workspaceFile').click();el('workspaceFile').onchange=e=>{if(e.target.files[0])importWorkspaceFile(e.target.files[0]);e.target.value=''};el('reset').onclick=resetCurrent;
    el('addAbs').onclick=addAbs;el('exportAbs').onclick=exportAbsV7;el('exportFull').onclick=exportFullV7;
    el('addHoliday').onclick=addHoliday;
    const hf=el('holidays');if(hf)hf.onchange=changed;
  }

  setupAbsenceUI();
  migrateOrLoad();renderSelect();loadIntoUI(active().project);bind();initResizers();persist();
})();
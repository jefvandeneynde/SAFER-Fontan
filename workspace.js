(function(){
  const WSKEY='saferFontanWorkspace_v6'; // intentionally unchanged: preserve all existing simulations
  const OLDKEYS=['saferFontanPlanner_v5','saferFontanPlanner_v4'];
  const LAYOUT_VERSION=8;
  const el=id=>document.getElementById(id);
  let workspace={version:8,activeId:null,simulations:[],layout:{leftWidth:440,layoutVersion:LAYOUT_VERSION}};
  let loading=false,historyLock=false;
  let undoStack=[],redoStack=[];

  const oldApply=apply;
  const oldProject=project;

  function clone(x){return JSON.parse(JSON.stringify(x))}
  function newId(){return 'sim_'+Math.random().toString(36).slice(2,10)}
  function active(){return workspace.simulations.find(s=>s.id===workspace.activeId)}
  function canonicalProject(p){let q=clone(p||{});delete q.savedAt;return JSON.stringify(q)}
  function migrateProject(p){
    p=clone(p||{});
    p.version=8;
    const legacyHolidayFlag=p.settings?.holidays;
    p.settings=Object.assign({rangeStart:'2026-10-01',rangeEnd:'2027-12-31',targetN:'30',leadDays:'3'},p.settings||{});
    delete p.settings.holidays;
    p.abs=(Array.isArray(p.abs)?p.abs:defaultAbs()).map(normaliseAbs);
    if(Array.isArray(p.holidays)) p.holidays=p.holidays.map(normaliseHoliday);
    else p.holidays=defaultHolidays().map(h=>({...h,enabled:legacyHolidayFlag!==false}));
    p.occupied=(Array.isArray(p.occupied)?p.occupied:[]).map(normaliseOccupied);
    p.plan=Array.isArray(p.plan)?p.plan:[];
    return p;
  }
  function defaultProject(){return migrateProject({settings:{rangeStart:'2026-10-01',rangeEnd:'2027-12-31',targetN:'30',leadDays:'3'},abs:defaultAbs(),holidays:defaultHolidays(),occupied:[],plan:[]})}
  function normaliseLayout(){workspace.layout=workspace.layout||{};if(workspace.layout.layoutVersion!==LAYOUT_VERSION){workspace.layout.leftWidth=440;workspace.layout.layoutVersion=LAYOUT_VERSION}if(!Number(workspace.layout.leftWidth))workspace.layout.leftWidth=440}
  function snapshot(){return clone({version:8,activeId:workspace.activeId,simulations:workspace.simulations,layout:workspace.layout})}
  function pushUndo(){if(historyLock)return;undoStack.push(snapshot());if(undoStack.length>40)undoStack.shift();redoStack=[];updateHistoryButtons()}
  function updateHistoryButtons(){if(el('undoBtn'))el('undoBtn').disabled=!undoStack.length;if(el('redoBtn'))el('redoBtn').disabled=!redoStack.length}

  function storeCurrentNoHistory(){let s=active();if(s)s.project=migrateProject(oldProject())}
  function persist(){
    try{
      localStorage.setItem(WSKEY,JSON.stringify(workspace));
      if(el('saveState'))el('saveState').textContent='Simulatie lokaal opgeslagen '+new Date().toLocaleTimeString('nl-BE');
      if(el('simulationStatus'))el('simulationStatus').textContent=`${workspace.simulations.length} simulatie${workspace.simulations.length===1?'':'s'} lokaal bewaard`;
    }catch(e){if(el('saveState'))el('saveState').textContent='Lokale opslag niet beschikbaar'}
    updateHistoryButtons();
  }

  save=function(){
    if(loading)return;
    let s=active();
    if(!s)return;
    let current=migrateProject(oldProject());
    if(canonicalProject(s.project)!==canonicalProject(current)){
      pushUndo();
      s.project=current;
    }
    persist();
  };

  function loadIntoUI(p){loading=true;let mp=migrateProject(p);oldApply(mp);loading=false;if(el('searchFrom'))el('searchFrom').value=el('rangeStart').value;hideFallback()}
  function uniqueName(base='Versie'){const names=new Set(workspace.simulations.map(s=>s.name));let n=1,name=`${base} ${n}`;while(names.has(name))name=`${base} ${++n}`;return name}
  function renderSelect(){let sel=el('simulationSelect');if(!sel)return;sel.innerHTML='';workspace.simulations.forEach(s=>{let o=document.createElement('option');o.value=s.id;o.textContent=s.name;o.selected=s.id===workspace.activeId;sel.appendChild(o)});if(el('simulationStatus'))el('simulationStatus').textContent=`${workspace.simulations.length} simulatie${workspace.simulations.length===1?'':'s'} lokaal bewaard`;updateHistoryButtons()}
  function switchTo(id){if(id===workspace.activeId)return;storeCurrentNoHistory();workspace.activeId=id;let s=active();if(s)loadIntoUI(s.project);renderSelect();persist()}
  function addSimulation(duplicate){storeCurrentNoHistory();pushUndo();let name=prompt(duplicate?'Naam voor de kopie:':'Naam voor de nieuwe simulatie:',uniqueName('Versie'));if(!name||!name.trim()){undoStack.pop();updateHistoryButtons();return}let p=duplicate?clone(active().project):defaultProject(),id=newId();workspace.simulations.push({id,name:name.trim(),project:migrateProject(p)});workspace.activeId=id;loadIntoUI(p);renderSelect();persist()}
  function renameCurrent(){let s=active();if(!s)return;let name=prompt('Nieuwe naam voor deze simulatie:',s.name);if(!name||!name.trim()||name.trim()===s.name)return;pushUndo();s.name=name.trim();renderSelect();persist()}
  function deleteCurrent(){if(workspace.simulations.length<=1){alert('Er moet minstens één simulatie blijven bestaan.');return}let s=active();if(!confirm(`Simulatie “${s.name}” verwijderen?`))return;pushUndo();workspace.simulations=workspace.simulations.filter(x=>x.id!==s.id);workspace.activeId=workspace.simulations[0].id;loadIntoUI(active().project);renderSelect();persist()}
  function resetCurrent(){let s=active();if(!confirm(`Simulatie “${s?.name||''}” resetten naar de standaardwaarden?`))return;pushUndo();let p=defaultProject();s.project=p;loadIntoUI(p);persist()}

  function restoreSnapshot(snap){historyLock=true;workspace=clone(snap);workspace.version=8;workspace.simulations=(workspace.simulations||[]).map(s=>({...s,project:migrateProject(s.project)}));normaliseLayout();if(!workspace.simulations.some(s=>s.id===workspace.activeId))workspace.activeId=workspace.simulations[0]?.id||null;if(active())loadIntoUI(active().project);renderSelect();applyLayout();persist();historyLock=false}
  function undo(){if(!undoStack.length)return;storeCurrentNoHistory();redoStack.push(snapshot());let s=undoStack.pop();restoreSnapshot(s);updateHistoryButtons()}
  function redo(){if(!redoStack.length)return;storeCurrentNoHistory();undoStack.push(snapshot());let s=redoStack.pop();restoreSnapshot(s);updateHistoryButtons()}

  function download(name,text){let a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type:'application/json'}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),800)}
  function safeName(s){return String(s||'simulatie').replace(/[^a-z0-9_-]+/gi,'_')}
  function exportCurrent(){storeCurrentNoHistory();let s=active();download(`SAFER_Fontan_${safeName(s.name)}.json`,JSON.stringify(migrateProject(s.project),null,2))}
  function exportAll(){storeCurrentNoHistory();download('SAFER_Fontan_alle_simulaties.json',JSON.stringify(workspace,null,2))}
  function importSimulationFile(file){let r=new FileReader();r.onload=()=>{try{let p=JSON.parse(r.result);if(!p||!p.settings)throw Error('Ongeldig simulatiebestand');pushUndo();let id=newId(),mp=migrateProject(p);workspace.simulations.push({id,name:file.name.replace(/\.json$/i,'')||uniqueName('Geïmporteerd'),project:mp});workspace.activeId=id;loadIntoUI(mp);renderSelect();persist()}catch(e){alert(e.message)}};r.readAsText(file)}
  function importWorkspaceFile(file){let r=new FileReader();r.onload=()=>{try{let w=JSON.parse(r.result);if(!w||!Array.isArray(w.simulations)||!w.simulations.length)throw Error('Ongeldig workspacebestand');pushUndo();workspace=w;workspace.version=8;workspace.simulations=workspace.simulations.map(s=>({...s,project:migrateProject(s.project)}));normaliseLayout();if(!workspace.simulations.some(s=>s.id===workspace.activeId))workspace.activeId=workspace.simulations[0].id;loadIntoUI(active().project);renderSelect();applyLayout();persist()}catch(e){alert(e.message)}};r.readAsText(file)}

  function applyLayout(){normaliseLayout();document.documentElement.style.setProperty('--left-width',workspace.layout.leftWidth+'px')}
  function initSplitter(){applyLayout();let splitter=el('mainSplitter');if(!splitter)return;let dragging=false;const setWidth=x=>{let grid=el('mainGrid').getBoundingClientRect(),rightMin=Math.min(720,Math.max(460,grid.width*.54)),maxLeft=Math.max(320,Math.min(760,grid.width-rightMin-20)),w=Math.max(320,Math.min(maxLeft,x-grid.left));workspace.layout.leftWidth=Math.round(w);document.documentElement.style.setProperty('--left-width',w+'px')};splitter.addEventListener('pointerdown',e=>{dragging=true;splitter.classList.add('dragging');splitter.setPointerCapture?.(e.pointerId);document.body.style.userSelect='none';e.preventDefault()});splitter.addEventListener('pointermove',e=>{if(dragging)setWidth(e.clientX)});splitter.addEventListener('pointerup',()=>{if(!dragging)return;dragging=false;splitter.classList.remove('dragging');document.body.style.userSelect='';persist()});splitter.addEventListener('pointercancel',()=>{dragging=false;splitter.classList.remove('dragging');document.body.style.userSelect=''});splitter.addEventListener('dblclick',()=>{workspace.layout.leftWidth=440;applyLayout();persist()})}

  function migrateOrLoad(){let loaded=false,raw=localStorage.getItem(WSKEY);if(raw){try{workspace=JSON.parse(raw);loaded=Array.isArray(workspace.simulations)&&workspace.simulations.length>0}catch(e){}}if(!loaded){let p=null;for(let k of OLDKEYS){let x=localStorage.getItem(k);if(x){try{p=JSON.parse(x);break}catch(e){}}}if(!p||!p.settings){try{p=oldProject()}catch(e){p=defaultProject()}}let id=newId();workspace={version:8,activeId:id,simulations:[{id,name:'Versie 1',project:migrateProject(p)}],layout:{leftWidth:440,layoutVersion:LAYOUT_VERSION}}}workspace.version=8;workspace.simulations=workspace.simulations.map(s=>({...s,project:migrateProject(s.project)}));normaliseLayout();if(!workspace.simulations.some(s=>s.id===workspace.activeId))workspace.activeId=workspace.simulations[0].id}
  function bind(){el('simulationSelect').onchange=e=>switchTo(e.target.value);el('newSimulation').onclick=()=>addSimulation(false);el('duplicateSimulation').onclick=()=>addSimulation(true);el('renameSimulation').onclick=renameCurrent;el('deleteSimulation').onclick=deleteCurrent;el('undoBtn').onclick=undo;el('redoBtn').onclick=redo;el('saveProject').onclick=exportCurrent;el('loadProject').onclick=()=>el('projectFile').click();el('projectFile').onchange=e=>{if(e.target.files[0])importSimulationFile(e.target.files[0]);e.target.value=''};el('saveWorkspace').onclick=exportAll;el('loadWorkspace').onclick=()=>el('workspaceFile').click();el('workspaceFile').onchange=e=>{if(e.target.files[0])importWorkspaceFile(e.target.files[0]);e.target.value=''};el('reset').onclick=resetCurrent;document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&!e.shiftKey&&e.key.toLowerCase()==='z'){e.preventDefault();undo()}else if((e.ctrlKey||e.metaKey)&&((e.shiftKey&&e.key.toLowerCase()==='z')||e.key.toLowerCase()==='y')){e.preventDefault();redo()}})}

  migrateOrLoad();renderSelect();loadIntoUI(active().project);bind();initSplitter();persist();
})();
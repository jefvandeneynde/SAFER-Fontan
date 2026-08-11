(function(){
  const WSKEY='saferFontanWorkspace_v6';
  const OLDKEYS=['saferFontanPlanner_v5','saferFontanPlanner_v4'];
  const LAYOUT_VERSION=7;
  const el=id=>document.getElementById(id);
  let workspace={version:7,activeId:null,simulations:[],layout:{leftWidth:420,layoutVersion:LAYOUT_VERSION}};
  let loading=false;

  const oldSave=save;
  const oldApply=apply;
  const oldProject=project;

  function newId(){return 'sim_'+Math.random().toString(36).slice(2,10)}
  function clone(x){return JSON.parse(JSON.stringify(x))}
  function defaultProject(){
    return {version:7,savedAt:new Date().toISOString(),settings:{rangeStart:'2026-10-01',rangeEnd:'2027-12-31',targetN:'30',leadDays:'3',holidays:true},abs:defaultAbs(),plan:[]};
  }
  function active(){return workspace.simulations.find(s=>s.id===workspace.activeId)}
  function storeCurrent(){const s=active();if(s)s.project=oldProject()}
  function persist(){
    try{
      localStorage.setItem(WSKEY,JSON.stringify(workspace));
      if(el('saveState'))el('saveState').textContent='Simulatie lokaal opgeslagen '+new Date().toLocaleTimeString('nl-BE');
      if(el('simulationStatus'))el('simulationStatus').textContent=`${workspace.simulations.length} simulatie${workspace.simulations.length===1?'':'s'} lokaal bewaard`;
    }catch(e){if(el('saveState'))el('saveState').textContent='Lokale opslag niet beschikbaar'}
  }

  save=function(){if(loading)return;storeCurrent();persist()};

  function loadIntoUI(p){loading=true;oldApply(p);loading=false;if(el('searchFrom'))el('searchFrom').value=el('rangeStart').value;hideFallback()}
  function uniqueName(base='Versie'){const names=new Set(workspace.simulations.map(s=>s.name));let n=1,name=`${base} ${n}`;while(names.has(name))name=`${base} ${++n}`;return name}
  function renderSelect(){const sel=el('simulationSelect');if(!sel)return;sel.innerHTML='';workspace.simulations.forEach(s=>{const o=document.createElement('option');o.value=s.id;o.textContent=s.name;o.selected=s.id===workspace.activeId;sel.appendChild(o)});if(el('simulationStatus'))el('simulationStatus').textContent=`${workspace.simulations.length} simulatie${workspace.simulations.length===1?'':'s'} lokaal bewaard`}
  function switchTo(id){if(id===workspace.activeId)return;storeCurrent();workspace.activeId=id;const s=active();if(s)loadIntoUI(s.project);renderSelect();persist()}
  function addSimulation(duplicate){storeCurrent();const suggested=uniqueName('Versie');const name=prompt(duplicate?'Naam voor de kopie:':'Naam voor de nieuwe simulatie:',suggested);if(!name||!name.trim())return;const p=duplicate?clone(oldProject()):defaultProject(),id=newId();workspace.simulations.push({id,name:name.trim(),project:p});workspace.activeId=id;loadIntoUI(p);renderSelect();persist()}
  function renameCurrent(){const s=active();if(!s)return;const name=prompt('Nieuwe naam voor deze simulatie:',s.name);if(!name||!name.trim())return;s.name=name.trim();renderSelect();persist()}
  function deleteCurrent(){if(workspace.simulations.length<=1){alert('Er moet minstens één simulatie blijven bestaan.');return}const s=active();if(!confirm(`Simulatie “${s.name}” verwijderen?`))return;workspace.simulations=workspace.simulations.filter(x=>x.id!==s.id);workspace.activeId=workspace.simulations[0].id;loadIntoUI(active().project);renderSelect();persist()}
  function resetCurrent(){const s=active();if(!confirm(`Simulatie “${s?.name||''}” resetten naar de standaardwaarden?`))return;const p=defaultProject();loadIntoUI(p);storeCurrent();persist()}

  function download(name,text){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type:'application/json'}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),800)}
  function safeName(s){return String(s||'simulatie').replace(/[^a-z0-9_-]+/gi,'_')}
  function exportCurrent(){storeCurrent();const s=active();download(`SAFER_Fontan_${safeName(s.name)}.json`,JSON.stringify(s.project,null,2))}
  function exportAll(){storeCurrent();download('SAFER_Fontan_alle_simulaties.json',JSON.stringify(workspace,null,2))}
  function importSimulationFile(file){const r=new FileReader();r.onload=()=>{try{const p=JSON.parse(r.result);if(!p||!p.settings)throw Error('Ongeldig simulatiebestand');storeCurrent();const id=newId();workspace.simulations.push({id,name:file.name.replace(/\.json$/i,'')||uniqueName('Geïmporteerd'),project:p});workspace.activeId=id;loadIntoUI(p);renderSelect();persist()}catch(e){alert(e.message)}};r.readAsText(file)}
  function importWorkspaceFile(file){const r=new FileReader();r.onload=()=>{try{const w=JSON.parse(r.result);if(!w||!Array.isArray(w.simulations)||!w.simulations.length)throw Error('Ongeldig workspacebestand');workspace=w;workspace.version=7;normalizeLayout();if(!workspace.simulations.some(s=>s.id===workspace.activeId))workspace.activeId=workspace.simulations[0].id;loadIntoUI(active().project);renderSelect();applyLayout();persist()}catch(e){alert(e.message)}};r.readAsText(file)}

  function normalizeLayout(){
    workspace.layout=workspace.layout||{};
    if(workspace.layout.layoutVersion!==LAYOUT_VERSION){workspace.layout.leftWidth=420;workspace.layout.layoutVersion=LAYOUT_VERSION;delete workspace.layout.heights}
    if(!Number(workspace.layout.leftWidth))workspace.layout.leftWidth=420;
  }
  function applyLayout(){
    normalizeLayout();
    document.documentElement.style.setProperty('--left-width',workspace.layout.leftWidth+'px');
    ['protocolCard','absCard','saveCard','actionsCard','kpiCard','outputCard','fallbackBox'].forEach(id=>{const node=el(id);if(node)node.style.height=''})
  }
  function initSplitter(){
    applyLayout();
    const splitter=el('mainSplitter');
    if(!splitter)return;
    let dragging=false;
    const setWidth=clientX=>{
      const grid=el('mainGrid').getBoundingClientRect();
      const rightMin=Math.min(620,Math.max(390,grid.width*.52));
      const maxLeft=Math.max(320,Math.min(720,grid.width-rightMin-20));
      const w=Math.max(320,Math.min(maxLeft,clientX-grid.left));
      workspace.layout.leftWidth=Math.round(w);
      document.documentElement.style.setProperty('--left-width',w+'px');
    };
    splitter.addEventListener('pointerdown',e=>{dragging=true;splitter.classList.add('dragging');splitter.setPointerCapture?.(e.pointerId);document.body.style.userSelect='none';e.preventDefault()});
    splitter.addEventListener('pointermove',e=>{if(dragging)setWidth(e.clientX)});
    splitter.addEventListener('pointerup',()=>{if(!dragging)return;dragging=false;splitter.classList.remove('dragging');document.body.style.userSelect='';persist()});
    splitter.addEventListener('pointercancel',()=>{dragging=false;splitter.classList.remove('dragging');document.body.style.userSelect=''});
    splitter.addEventListener('dblclick',()=>{workspace.layout.leftWidth=420;applyLayout();persist()});
  }

  function migrateOrLoad(){
    let loaded=false;const raw=localStorage.getItem(WSKEY);
    if(raw){try{workspace=JSON.parse(raw);loaded=Array.isArray(workspace.simulations)&&workspace.simulations.length>0}catch(e){}}
    if(!loaded){let p=null;for(const k of OLDKEYS){const x=localStorage.getItem(k);if(x){try{p=JSON.parse(x);break}catch(e){}}}if(!p||!p.settings)p=defaultProject();const id=newId();workspace={version:7,activeId:id,simulations:[{id,name:'Versie 1',project:p}],layout:{leftWidth:420,layoutVersion:LAYOUT_VERSION}}}
    workspace.version=7;normalizeLayout();if(!workspace.simulations.some(s=>s.id===workspace.activeId))workspace.activeId=workspace.simulations[0].id
  }

  function bind(){
    el('simulationSelect').onchange=e=>switchTo(e.target.value);
    el('newSimulation').onclick=()=>addSimulation(false);
    el('duplicateSimulation').onclick=()=>addSimulation(true);
    el('renameSimulation').onclick=renameCurrent;
    el('deleteSimulation').onclick=deleteCurrent;
    el('saveProject').onclick=exportCurrent;
    el('loadProject').onclick=()=>el('projectFile').click();
    el('projectFile').onchange=e=>{if(e.target.files[0])importSimulationFile(e.target.files[0]);e.target.value=''};
    el('saveWorkspace').onclick=exportAll;
    el('loadWorkspace').onclick=()=>el('workspaceFile').click();
    el('workspaceFile').onchange=e=>{if(e.target.files[0])importWorkspaceFile(e.target.files[0]);e.target.value=''};
    el('reset').onclick=resetCurrent;
  }

  migrateOrLoad();renderSelect();loadIntoUI(active().project);bind();initSplitter();persist();
})();
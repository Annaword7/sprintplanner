import { useState, useMemo, useCallback, useEffect, createContext, useContext } from "react";

// ═══════════════════════════════════════════════════════════════════════════
// BACKEND
// ═══════════════════════════════════════════════════════════════════════════
const FIELDS = {
  STATE:"State",TYPE:"Type",PRIORITY:"Priority",EXT_SPRINT:"EXT Sprint",
  ASSIGNEE:"Assignee",QA:"QA",QA_PRIORITY:"QA Priority",EXT_CATEGORY:"EXT Category",EXT_PROJECT:"EXT Project",
  BACKEND_EFFORT:"Backend Effort",FRONTEND_EFFORT:"Frontend Effort",
  QA_EFFORT:"QA Effort",DESIGN_EFFORT:"Design Effort",
  MANAGER_EFFORT:"Manager effort",TOTAL_PRIORITY:"Total Priority",
  BUSINESS_VALUE:"Business Value",REOPEN_COUNTER:"• Reopen counter",PERCENT_DONE:"% Done",
};
const DEFAULT_CAPACITY = [
  {login:"alex.kuznetsov",role:"backend",capacity:20,tolerance:2},
  {login:"maria.sokolova",role:"backend",capacity:18,tolerance:2},
  {login:"dmitry.volkov",role:"frontend",capacity:20,tolerance:2},
  {login:"elena.petrova",role:"frontend",capacity:16,tolerance:2},
  {login:"ivan.novikov",role:"design",capacity:12,tolerance:1},
  {login:"olga.nikitina",role:"qa",capacity:22,tolerance:2},
  {login:"igor.tarasov",role:"qa",capacity:20,tolerance:2},
  {login:"anna.fedorova",role:"manager",capacity:14,tolerance:1},
  {login:"sergey.morozov",role:"backend",capacity:20,tolerance:2},
  {login:"natalia.kozlova",role:"qa",capacity:18,tolerance:2},
];



const RESOLVED_STATES = ["Done","Fixed","Verified"];

// ── Field extractors ─────────────────────────────────────────────────────
const gf=(i,n)=>i.customFields?.find(f=>f.name===n)?.value??null;
const gEnum=(i,n)=>gf(i,n)?.name??null;
const gUser=(i,n)=>gf(i,n);
const gNum=(i,n)=>gf(i,n);
const gSprints=(i,fieldName)=>{const v=gf(i,fieldName||FIELDS.EXT_SPRINT);return Array.isArray(v)?v.map(x=>x.name):[]};
const gProject=(i)=>{const v=gf(i,FIELDS.EXT_PROJECT);if(!v)return null;if(Array.isArray(v))return v[0]?.name||null;return v.name||null};
const getEfforts=(i)=>{const b=gNum(i,FIELDS.BACKEND_EFFORT)||0,f=gNum(i,FIELDS.FRONTEND_EFFORT)||0,q=gNum(i,FIELDS.QA_EFFORT)||0,d=gNum(i,FIELDS.DESIGN_EFFORT)||0,m=gNum(i,FIELDS.MANAGER_EFFORT)||0;return{be:b,fe:f,qa:q,des:d,mgr:m,total:b+f+q+d+m}};
const effortLabel=(i)=>{const e=getEfforts(i);const p=[];if(e.be)p.push("BE "+e.be);if(e.fe)p.push("FE "+e.fe);if(e.des)p.push("DES "+e.des);if(e.qa)p.push("QA "+e.qa);if(e.mgr)p.push("MGR "+e.mgr);return p.join(" + ")||"—"};
const effortForRole=(e,r)=>({backend:e.be,frontend:e.fe,design:e.des,manager:e.mgr,qa:e.qa}[r]||0);

// ── Server config storage ────────────────────────────────────────────────
async function getConfig(){try{const r=await fetch("/api/config");return r.ok?r.json():{}}catch{return{}}}
async function patchConfig(data){try{await fetch("/api/config",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)})}catch(e){console.error("Config save failed:",e)}}

// ── YouTrack API ──────────────────────────────────────────────────────────
const YT_FIELDS="id,idReadable,summary,customFields(name,$type,value(name,login,fullName,isResolved,$type,id))";
const DEFAULT_QUERIES=[
  {id:"q-all",name:"Весь бэклог",query:"project: ED State: Backlog"},
  {id:"q-be",name:"Бекенд",query:"project: ED State: Backlog has: {Backend Effort}"},
  {id:"q-fe",name:"Фронтенд",query:"project: ED State: Backlog has: {Frontend Effort}"},
  {id:"q-qa",name:"QA",query:"project: ED State: Backlog has: {QA Effort}"},
];
async function ytFetch(path){const r=await fetch("/youtrack"+path);if(!r.ok)throw new Error("YouTrack "+r.status+" "+r.statusText);return r.json()}
async function ytPatch(idReadable,body){const r=await fetch(`/youtrack/api/issues/${idReadable}?fields=customFields(name,value(id,name,login,fullName))`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});if(!r.ok)throw new Error("YouTrack write "+r.status);return r.json()}

// ── Snapshot helpers ─────────────────────────────────────────────────────
function createSnapshot(sprintIssues) {
  const total = sprintIssues.length;
  const projectCounts = {};
  sprintIssues.forEach(i => {
    const p = gProject(i) || "Без проекта";
    projectCounts[p] = (projectCounts[p] || 0) + 1;
  });
  const projects = Object.entries(projectCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count, pct: total > 0 ? Math.round(count / total * 100) : 0 }));

  return {
    timestamp: Date.now(),
    projects,
    issues: sprintIssues.map(i => ({
      id: i.idReadable,
      summary: i.summary,
      state: gEnum(i, FIELDS.STATE),
      assignee: gUser(i, FIELDS.ASSIGNEE)?.login || null,
      qa: gUser(i, FIELDS.QA)?.login || null,
      efforts: getEfforts(i),
      reopens: gNum(i, FIELDS.REOPEN_COUNTER) || 0,
    })),
  };
}

function computeMetrics(sprintName, snapData) {
  if (!snapData?.start) return null;
  const startIds = new Set(snapData.start.issues.map(i => i.id));
  const startCount = snapData.start.issues.length;
  const startEffort = snapData.start.issues.reduce((a, i) => a + (i.efforts?.total || 0), 0);

  const projects = snapData.start.projects || [];

  if (!snapData.end) {
    return { sprintName, planned: startCount, plannedEffort: startEffort, projects, completed: null, reopened: null, carryOver: null, completionRate: null, added: null, removed: null, status: "active" };
  }

  const endMap = {};
  snapData.end.issues.forEach(i => { endMap[i.id] = i });
  const endIds = new Set(snapData.end.issues.map(i => i.id));

  let completed = 0, totalReopens = 0;
  startIds.forEach(id => {
    const endIssue = endMap[id];
    if (endIssue && RESOLVED_STATES.includes(endIssue.state)) completed++;
    if (endIssue) totalReopens += endIssue.reopens || 0;
  });

  const carryOver = startCount - completed;
  const added = [...endIds].filter(id => !startIds.has(id)).length;
  const removed = [...startIds].filter(id => !endIds.has(id)).length;

  return {
    sprintName, planned: startCount, plannedEffort: startEffort, projects,
    completed, reopened: totalReopens, carryOver,
    completionRate: startCount > 0 ? Math.round((completed / startCount) * 100) : 0,
    added, removed, status: "closed",
  };
}
// ═══════════════════════════════════════════════════════════════════════════
// MOCK SNAPSHOTS (demo data for trend visualization) — disabled
// ═══════════════════════════════════════════════════════════════════════════
/* const MOCK_SNAPSHOTS=(()=>{
  const AK="andrei.kirianov",IE="ivan.elfimov",VM="v.marmuz",EU="egor.uvarov",AS="aleksandr.sokolov";
  const DV="d.vorotnikov",AA="aandreev";
  const VP="vakropot",ES="elizaveta.shabnova",EM="emun";
  const IP="iana.postnova";
  const EB="Extrabeds",TL="TL Integration",CM="Channel Manager",CORE="Core";
  function mkS(ts,raw){
    const total=raw.length;
    const pc={};raw.forEach(r=>{const p=r[8]||"Без проекта";pc[p]=(pc[p]||0)+1});
    const projects=Object.entries(pc).sort((a,b)=>b[1]-a[1]).map(([name,count])=>({name,count,pct:Math.round(count/total*100)}));
    return{timestamp:ts,projects,issues:raw.map(([id,be,fe,qa,des,mgr,a,q])=>({id,summary:id,state:"Open",assignee:a,qa:q,efforts:{be:be||0,fe:fe||0,qa:qa||0,des:des||0,mgr:mgr||0,total:(be||0)+(fe||0)+(qa||0)+(des||0)+(mgr||0)},reopens:0}))};
  }
  function mkE(ts,si,n){const done=new Set(si.slice(0,n).map(i=>i.id));return{timestamp:ts,issues:si.map(i=>({id:i.id,state:done.has(i.id)?"Done":"In Progress",reopens:0}))};}
  const n01=[
    ...[AK,IE,VM,EU,AS].flatMap((a,ai)=>([[`M01-${ai*3+1}`,5,0,2,0,0,a,VP,EB],[`M01-${ai*3+2}`,8,0,3,0,0,a,ES,ai<3?EB:TL],[`M01-${ai*3+3}`,ai===2?13:ai===4?9:5,0,ai===4?4:ai===2?5:2,0,0,a,EM,ai<2?CORE:ai===2?EB:ai===3?TL:CM]])),
    ...[DV,AA].flatMap((a,ai)=>([[`M01-${16+ai*3}`,0,8,3,0,0,a,VP,EB],[`M01-${17+ai*3}`,0,ai===0?8:7,3,0,0,a,EM,TL],[`M01-${18+ai*3}`,0,7,2,0,0,a,ES,CORE]])),
    [`M01-22`,0,0,7,0,0,VP,VP,EB],[`M01-23`,0,0,6,0,0,VP,VP,EB],[`M01-24`,0,0,5,0,0,VP,VP,CORE],
    [`M01-25`,0,0,7,0,0,ES,ES,TL],[`M01-26`,0,0,6,0,0,ES,ES,TL],[`M01-27`,0,0,6,0,0,ES,ES,CM],
    [`M01-28`,0,0,10,0,0,EM,EM,EB],[`M01-29`,0,0,8,0,0,EM,EM,EB],
    [`M01-30`,0,0,0,0,5,IP,null,TL],[`M01-31`,0,0,0,0,5,IP,null,EB],
  ];
  const n02=[
    [`M02-01`,8,0,3,0,0,AK,VP,EB],[`M02-02`,5,0,2,0,0,AK,ES,EB],[`M02-03`,8,0,3,0,0,AK,EM,CORE],[`M02-04`,5,0,2,0,0,AK,VP,TL],
    [`M02-05`,8,0,3,0,0,IE,ES,EB],[`M02-06`,5,0,2,0,0,IE,EM,TL],[`M02-07`,5,0,2,0,0,IE,VP,CORE],
    [`M02-08`,13,0,5,0,0,VM,EM,EB],[`M02-09`,8,0,5,0,0,VM,ES,EB],[`M02-10`,5,0,3,0,0,VM,VP,EB],[`M02-11`,5,0,2,0,0,VM,ES,CORE],
    [`M02-12`,8,0,3,0,0,EU,EM,TL],[`M02-13`,5,0,2,0,0,EU,ES,TL],[`M02-14`,5,0,3,0,0,EU,VP,CM],
    [`M02-15`,8,0,5,0,0,AS,EM,CM],[`M02-16`,5,0,3,0,0,AS,ES,CM],
    [`M02-17`,0,8,3,0,0,DV,VP,EB],[`M02-18`,0,10,3,0,0,DV,EM,EB],[`M02-19`,0,7,3,0,0,DV,ES,CORE],
    [`M02-20`,0,8,3,0,0,AA,VP,EB],[`M02-21`,0,8,3,0,0,AA,EM,TL],[`M02-22`,0,9,2,0,0,AA,ES,CORE],
    [`M02-23`,0,0,8,0,0,VP,VP,EB],[`M02-24`,0,0,7,0,0,VP,VP,EB],[`M02-25`,0,0,5,0,0,VP,VP,CORE],
    [`M02-26`,0,0,8,0,0,ES,ES,TL],[`M02-27`,0,0,7,0,0,ES,ES,TL],[`M02-28`,0,0,7,0,0,ES,ES,CM],
    [`M02-29`,0,0,10,0,0,EM,EM,EB],[`M02-30`,0,0,8,0,0,EM,EM,EB],
    [`M02-31`,0,0,0,0,8,IP,null,TL],[`M02-32`,0,0,0,0,7,IP,null,EB],
  ];
  const n03=[
    [`M03-01`,5,0,2,0,0,AK,VP,EB],[`M03-02`,8,0,3,0,0,AK,ES,TL],[`M03-03`,3,0,2,0,0,AK,EM,CORE],
    [`M03-04`,5,0,2,0,0,IE,VP,EB],[`M03-05`,8,0,3,0,0,IE,ES,TL],
    [`M03-06`,8,0,5,0,0,VM,EM,EB],[`M03-07`,13,0,5,0,0,VM,VP,EB],[`M03-08`,3,0,2,0,0,VM,ES,CORE],
    [`M03-09`,5,0,3,0,0,EU,EM,TL],[`M03-10`,8,0,3,0,0,EU,VP,TL],
    [`M03-11`,8,0,5,0,0,AS,ES,CM],[`M03-12`,5,0,3,0,0,AS,EM,CM],[`M03-13`,8,0,5,0,0,AS,VP,CM],
    [`M03-14`,0,8,3,0,0,DV,EM,EB],[`M03-15`,0,7,3,0,0,DV,ES,EB],
    [`M03-16`,0,7,3,0,0,AA,VP,EB],[`M03-17`,0,8,3,0,0,AA,EM,TL],[`M03-18`,0,7,2,0,0,AA,ES,CORE],
    [`M03-19`,0,0,6,0,0,VP,VP,EB],[`M03-20`,0,0,5,0,0,VP,VP,CORE],
    [`M03-21`,0,0,8,0,0,ES,ES,TL],[`M03-22`,0,0,6,0,0,ES,ES,TL],[`M03-23`,0,0,5,0,0,ES,ES,CM],
    [`M03-24`,0,0,8,0,0,EM,EM,EB],[`M03-25`,0,0,8,0,0,EM,EM,EB],
    [`M03-26`,0,0,0,0,5,IP,null,EB],[`M03-27`,0,0,0,0,5,IP,null,TL],
  ];
  const n04=[
    [`M04-01`,8,0,3,0,0,AK,VP,EB],[`M04-02`,5,0,2,0,0,AK,ES,EB],[`M04-03`,5,0,2,0,0,AK,EM,TL],[`M04-04`,3,0,2,0,0,AK,VP,CORE],
    [`M04-05`,8,0,3,0,0,IE,ES,EB],[`M04-06`,5,0,2,0,0,IE,EM,TL],[`M04-07`,5,0,2,0,0,IE,VP,CORE],[`M04-08`,8,0,3,0,0,IE,ES,EB],
    [`M04-09`,13,0,5,0,0,VM,EM,EB],[`M04-10`,8,0,5,0,0,VM,VP,EB],[`M04-11`,5,0,3,0,0,VM,ES,CORE],[`M04-12`,5,0,2,0,0,VM,EM,EB],
    [`M04-13`,8,0,3,0,0,EU,VP,TL],[`M04-14`,5,0,2,0,0,EU,ES,TL],[`M04-15`,5,0,3,0,0,EU,EM,CM],
    [`M04-16`,8,0,5,0,0,AS,VP,CM],[`M04-17`,5,0,3,0,0,AS,ES,CM],[`M04-18`,5,0,3,0,0,AS,EM,CM],
    [`M04-19`,0,10,3,0,0,DV,VP,EB],[`M04-20`,0,8,3,0,0,DV,ES,EB],[`M04-21`,0,7,3,0,0,DV,EM,CORE],[`M04-22`,0,7,2,0,0,DV,VP,TL],
    [`M04-23`,0,8,3,0,0,AA,ES,EB],[`M04-24`,0,8,3,0,0,AA,EM,TL],[`M04-25`,0,9,2,0,0,AA,VP,CORE],
    [`M04-26`,0,0,8,0,0,VP,VP,EB],[`M04-27`,0,0,7,0,0,VP,VP,EB],[`M04-28`,0,0,5,0,0,VP,VP,CORE],
    [`M04-29`,0,0,8,0,0,ES,ES,TL],[`M04-30`,0,0,7,0,0,ES,ES,TL],[`M04-31`,0,0,6,0,0,ES,ES,CM],
    [`M04-32`,0,0,10,0,0,EM,EM,EB],[`M04-33`,0,0,8,0,0,EM,EM,EB],[`M04-34`,0,0,7,0,0,EM,EM,EB],
    [`M04-35`,0,0,0,0,8,IP,null,TL],[`M04-36`,0,0,0,0,7,IP,null,EB],
  ];
  const s1=mkS(1736726400000,n01),s2=mkS(1737936000000,n02),s3=mkS(1739145600000,n03),s4=mkS(1740355200000,n04);
  return{
    "2026-N01 (Jan 13)":{start:s1,end:mkE(1737936000000,s1.issues,22)},
    "2026-N02 (Jan 27)":{start:s2,end:mkE(1739145600000,s2.issues,26)},
    "2026-N03 (Feb 10)":{start:s3,end:mkE(1740355200000,s3.issues,18)},
    "2026-N04 (Feb 24)":{start:s4,end:mkE(1741564800000,s4.issues,30)},
  };
})(); */
const MOCK_SNAPSHOTS = {};

// ═══════════════════════════════════════════════════════════════════════════
// DESIGN TOKENS
// ═══════════════════════════════════════════════════════════════════════════
const DARK={bg0:"#080816",bg1:"#0e0e22",bg2:"#151530",bg3:"#1c1c3a",border:"rgba(255,255,255,0.05)",borderHover:"rgba(255,255,255,0.12)",text0:"#f0f0f8",text1:"#c8c8da",text2:"#8a8aaa",text3:"#5a5a78",accent:"#4ecdc4",accentDim:"rgba(78,205,196,0.12)",red:"#ff4757",redDim:"rgba(255,71,87,0.1)",yellow:"#ffd43b",yellowDim:"rgba(255,212,59,0.1)",green:"#26de81",greenDim:"rgba(38,222,129,0.1)",blue:"#4b7bec",blueDim:"rgba(75,123,236,0.1)",priority:{Critical:"#ff4757",Major:"#ffa502",Normal:"#8a8aaa",Minor:"#5a5a78"},role:{backend:"#ff4757",frontend:"#4b7bec",qa:"#ffd43b",design:"#a55eea",manager:"#ffa502"},status:{over:"#ff4757",optimal:"#26de81",under:"#ffd43b",empty:"#2a2a4a"},font:"'Onest','SF Pro Display',system-ui,sans-serif",mono:"'JetBrains Mono','SF Mono',monospace"};
const LIGHT={bg0:"#f4f4fb",bg1:"#ffffff",bg2:"#ededf6",bg3:"#e2e2ef",border:"rgba(0,0,0,0.07)",borderHover:"rgba(0,0,0,0.16)",text0:"#14142a",text1:"#2d2d4a",text2:"#5a5a78",text3:"#9898b8",accent:"#0aada6",accentDim:"rgba(10,173,166,0.1)",red:"#e03e52",redDim:"rgba(224,62,82,0.08)",yellow:"#c48a00",yellowDim:"rgba(196,138,0,0.1)",green:"#1a9a5c",greenDim:"rgba(26,154,92,0.1)",blue:"#3b6fd4",blueDim:"rgba(59,111,212,0.1)",priority:{Critical:"#e03e52",Major:"#d97706",Normal:"#6b6b8a",Minor:"#9898b8"},role:{backend:"#e03e52",frontend:"#3b6fd4",qa:"#c48a00",design:"#7c3aed",manager:"#d97706"},status:{over:"#e03e52",optimal:"#1a9a5c",under:"#c48a00",empty:"#c8c8e0"},font:"'Onest','SF Pro Display',system-ui,sans-serif",mono:"'JetBrains Mono','SF Mono',monospace"};
const ThemeCtx = createContext(DARK);
const RL={backend:"BE",frontend:"FE",qa:"QA",design:"DES",manager:"MGR"};
const ROLES=["backend","frontend","qa","design","manager"];

// ═══════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════
export default function SprintPlanner(){
  const[isDark,setIsDark]=useState(()=>localStorage.getItem("ed-theme")!=="light");
  const T=isDark?DARK:LIGHT;
  const toggleTheme=()=>{const next=!isDark;setIsDark(next);localStorage.setItem("ed-theme",next?"dark":"light")};
  const[issues,setIssues]=useState([]);
  const[tab,setTab]=useState("planner");
  const[sortBy,setSortBy]=useState("totalPriority");
  const[filterRole,setFilterRole]=useState("all");
  const[search,setSearch]=useState("");
  const[dragId,setDragId]=useState(null);
  const[dropZone,setDropZone]=useState(null);
  const[sprintName,setSprintName]=useState("Sprint 25");
  const[expandedCard,setExpandedCard]=useState(null);
  const[teamConfig,setTeamConfig]=useState(DEFAULT_CAPACITY);
  const[storageLoaded,setStorageLoaded]=useState(false);
  const[saveStatus,setSaveStatus]=useState(null);
  const[snapshots,setSnapshots]=useState({});
  const[snapAction,setSnapAction]=useState(null);
  const[savedQueries,setSavedQueries]=useState(DEFAULT_QUERIES);
  const[activeQueryId,setActiveQueryId]=useState("q-all");
  const[backlogLoading,setBacklogLoading]=useState(false);
  const[backlogError,setBacklogError]=useState(null);
  const[apiError,setApiError]=useState(null);
  const[teamLogins,setTeamLogins]=useState([]);
  const[projectId,setProjectId]=useState("");
  const[availableSprints,setAvailableSprints]=useState([]);
  const[sprintField,setSprintField]=useState("EXT Sprint");
  const[projectFields,setProjectFields]=useState([]);
  const[filterSprintRole,setFilterSprintRole]=useState("all");
  const[capacityOpen,setCapacityOpen]=useState(true);
  const[capacityRoleFilter,setCapacityRoleFilter]=useState("all");
  const[backlogCollapsed,setBacklogCollapsed]=useState(false);
  const[groupByProject,setGroupByProject]=useState(false);
  const[groupBacklogByProject,setGroupBacklogByProject]=useState(false);
  const[sortSprint,setSortSprint]=useState("none");

  // Load from storage
  useEffect(()=>{
    getConfig().then(cfg=>{
      if(cfg.teamConfig&&Array.isArray(cfg.teamConfig)&&cfg.teamConfig.length>0)setTeamConfig(cfg.teamConfig);
      if(cfg.snapshots&&typeof cfg.snapshots==="object"){setSnapshots(prev=>({...prev,...cfg.snapshots}))}
      if(cfg.savedQueries&&Array.isArray(cfg.savedQueries)&&cfg.savedQueries.length>0)setSavedQueries(cfg.savedQueries);
      if(cfg.teamLogins&&Array.isArray(cfg.teamLogins)&&cfg.teamLogins.length>0)setTeamLogins(cfg.teamLogins);
      if(cfg.availableSprints&&Array.isArray(cfg.availableSprints)&&cfg.availableSprints.length>0)setAvailableSprints(cfg.availableSprints);
      if(cfg.sprintName)setSprintName(cfg.sprintName);
      if(cfg.projectId)setProjectId(cfg.projectId);
      if(cfg.sprintField)setSprintField(cfg.sprintField);
      if(cfg.projectFields&&Array.isArray(cfg.projectFields)&&cfg.projectFields.length>0)setProjectFields(cfg.projectFields);
      setStorageLoaded(true);
    });
  },[]);

  // Derived
  const discoveredMembers=useMemo(()=>{const seen=new Set();const ms=[];issues.forEach(i=>{[FIELDS.ASSIGNEE,FIELDS.QA].forEach(f=>{const u=gUser(i,f);if(u?.login&&!seen.has(u.login)){seen.add(u.login);ms.push({login:u.login,fullName:u.fullName})}})});return ms.sort((a,b)=>a.fullName.localeCompare(b.fullName))},[issues]);
  const mergedConfig=useMemo(()=>discoveredMembers.map(m=>{const s=teamConfig.find(c=>c.login===m.login);return s?{...s,fullName:m.fullName}:{login:m.login,fullName:m.fullName,role:"backend",capacity:20,tolerance:2}}),[discoveredMembers,teamConfig]);
  const filteredConfig=useMemo(()=>teamLogins.length>0?mergedConfig.filter(m=>teamLogins.includes(m.login)):mergedConfig,[mergedConfig,teamLogins]);

  const backlog=useMemo(()=>{let items=issues.filter(i=>!gSprints(i,sprintField).includes(sprintName));if(filterRole!=="all")items=items.filter(i=>{const e=getEfforts(i);return({backend:e.be,frontend:e.fe,qa:e.qa,design:e.des,manager:e.mgr}[filterRole]||0)>0});if(search){const q=search.toLowerCase();items=items.filter(i=>i.summary.toLowerCase().includes(q)||i.idReadable.toLowerCase().includes(q))}const sorts={totalPriority:(a,b)=>(gNum(b,FIELDS.TOTAL_PRIORITY)||0)-(gNum(a,FIELDS.TOTAL_PRIORITY)||0),effort:(a,b)=>getEfforts(b).total-getEfforts(a).total,businessValue:(a,b)=>(gNum(b,FIELDS.BUSINESS_VALUE)||0)-(gNum(a,FIELDS.BUSINESS_VALUE)||0),priority:(a,b)=>{const o={Critical:4,Major:3,Normal:2,Minor:1};return(o[gEnum(b,FIELDS.PRIORITY)]||0)-(o[gEnum(a,FIELDS.PRIORITY)]||0)},issue:(a,b)=>{const n=x=>parseInt(x.idReadable?.replace(/[^0-9]/g,""))||0;return n(a)-n(b)}};items.sort(sorts[sortBy]||sorts.totalPriority);return items},[issues,sortBy,filterRole,search,sprintField]);

  const sprint=useMemo(()=>issues.filter(i=>gSprints(i,sprintField).includes(sprintName)),[issues,sprintName,sprintField]);
  const filteredSprint=useMemo(()=>{let items=filterSprintRole==="all"?sprint:sprint.filter(i=>{const e=getEfforts(i);return({backend:e.be,frontend:e.fe,qa:e.qa,design:e.des,manager:e.mgr}[filterSprintRole]||0)>0});if(sortSprint==="assignee")items=[...items].sort((a,b)=>(gUser(a,FIELDS.ASSIGNEE)?.fullName||"я").localeCompare(gUser(b,FIELDS.ASSIGNEE)?.fullName||"я"));else if(sortSprint==="qa")items=[...items].sort((a,b)=>(gUser(a,FIELDS.QA)?.fullName||"я").localeCompare(gUser(b,FIELDS.QA)?.fullName||"я"));return items},[sprint,filterSprintRole,sortSprint]);
  const sprintTotals=useMemo(()=>{const t={be:0,fe:0,qa:0,des:0,mgr:0,total:0};sprint.forEach(i=>{const e=getEfforts(i);t.be+=e.be;t.fe+=e.fe;t.qa+=e.qa;t.des+=e.des;t.mgr+=e.mgr;t.total+=e.total});return t},[sprint]);

  const capacity=useMemo(()=>{const map={};filteredConfig.forEach(m=>{map[m.login]={...m,load:0,tasks:[]}});sprint.forEach(issue=>{const efforts=getEfforts(issue);const aL=gUser(issue,FIELDS.ASSIGNEE)?.login;const qL=gUser(issue,FIELDS.QA)?.login;if(aL&&map[aL]){const role=map[aL].role;let eff;if(role==="qa"){eff=efforts.total;}else if(aL===qL){eff=effortForRole(efforts,role)+(efforts.qa||0);}else{eff=effortForRole(efforts,role);}map[aL].tasks.push({id:issue.idReadable,eff});if(eff>0)map[aL].load+=eff;}if(qL&&map[qL]&&qL!==aL){map[qL].tasks.push({id:issue.idReadable,eff:efforts.qa});if(efforts.qa>0)map[qL].load+=efforts.qa;}});Object.values(map).forEach(m=>{if(m.load>m.capacity+m.tolerance)m.status="over";else if(m.load>=m.capacity-m.tolerance)m.status="optimal";else if(m.load>=m.capacity*0.4)m.status="under";else m.status="empty"});return Object.values(map)},[sprint,filteredConfig]);

  const currentSnap = snapshots[sprintName] || null;
  const hasStart = !!currentSnap?.start;
  const hasEnd = !!currentSnap?.end;

  // ── Data loading ─────────────────────────────────────────────────────────
  const loadBacklog=useCallback(async(queryStr)=>{
    setBacklogLoading(true);setBacklogError(null);
    try{
      const data=await ytFetch(`/api/issues?query=${encodeURIComponent(queryStr)}&fields=${encodeURIComponent(YT_FIELDS)}&$top=500`);
      setIssues(prev=>{
        const sprintIds=new Set(prev.filter(i=>gSprints(i,sprintField).includes(sprintName)).map(i=>i.id));
        const sprintItems=prev.filter(i=>gSprints(i,sprintField).includes(sprintName));
        const newBacklog=data.filter(i=>!sprintIds.has(i.id));
        return[...sprintItems,...newBacklog];
      });
    }catch(e){setBacklogError(e.message)}
    finally{setBacklogLoading(false)}
  },[sprintName,sprintField]);

  const loadSprint=useCallback(async(sName,pId,sField)=>{
    if(!pId||!sField||!sName)return;
    const q=`project: ${pId} ${sField}: {${sName}}`;
    try{
      const data=await ytFetch(`/api/issues?query=${encodeURIComponent(q)}&fields=${encodeURIComponent(YT_FIELDS)}&$top=500`);
      setIssues(prev=>{
        const backlogItems=prev.filter(i=>!gSprints(i,sField).includes(sName));
        const backlogIds=new Set(backlogItems.map(i=>i.id));
        const newSprint=data.filter(i=>!backlogIds.has(i.id));
        return[...backlogItems,...newSprint];
      });
    }catch(e){setApiError(e.message)}
  },[]);

  const reload=useCallback(()=>{
    const q=savedQueries.find(x=>x.id===activeQueryId);
    if(q)loadBacklog(q.query);
    loadSprint(sprintName,projectId,sprintField);
  },[savedQueries,activeQueryId,sprintName,projectId,sprintField,loadBacklog,loadSprint]);

  // Reload backlog when active query id OR its content changes
  const activeQueryStr=savedQueries.find(x=>x.id===activeQueryId)?.query;
  useEffect(()=>{
    if(!storageLoaded||!activeQueryStr)return;
    loadBacklog(activeQueryStr);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[activeQueryId,activeQueryStr,storageLoaded]);

  useEffect(()=>{
    if(!storageLoaded)return;
    patchConfig({sprintName,sprintField});
    loadSprint(sprintName,projectId,sprintField);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[sprintName,sprintField,projectId,storageLoaded]);

  // Actions
  const moveToSprint=useCallback(async id=>{
    const issue=issues.find(i=>i.idReadable===id);
    if(!issue)return;
    // Optimistic update
    setIssues(prev=>prev.map(i=>{if(i.idReadable!==id)return i;const n=structuredClone(i);const sp=n.customFields.find(f=>f.name===sprintField);if(sp)sp.value=[...(sp.value||[]),{name:sprintName,$type:"VersionBundleElement"}];const st=n.customFields.find(f=>f.name===FIELDS.STATE);if(st?.value?.name==="Backlog")st.value={name:"Open",isResolved:false,$type:"StateBundleElement"};return n}));
    try{
      const cur=gSprints(issue,sprintField);
      await ytPatch(id,{customFields:[{name:sprintField,$type:"MultiVersionIssueCustomField",value:[...cur,sprintName].map(n=>({name:n}))}]});
    }catch(e){setApiError(e.message);reload()}
  },[issues,sprintName,sprintField,reload]);

  const moveToBacklog=useCallback(async id=>{
    const issue=issues.find(i=>i.idReadable===id);
    if(!issue)return;
    // Optimistic update
    setIssues(prev=>prev.map(i=>{if(i.idReadable!==id)return i;const n=structuredClone(i);const sp=n.customFields.find(f=>f.name===sprintField);if(sp)sp.value=(sp.value||[]).filter(v=>v.name!==sprintName);const st=n.customFields.find(f=>f.name===FIELDS.STATE);if(st&&!st.value?.isResolved)st.value={name:"Backlog",isResolved:false,$type:"StateBundleElement"};return n}));
    try{
      const remaining=gSprints(issue,sprintField).filter(s=>s!==sprintName);
      await ytPatch(id,{customFields:[{name:sprintField,$type:"MultiVersionIssueCustomField",value:remaining.map(n=>({name:n}))}]});
    }catch(e){setApiError(e.message);reload()}
  },[issues,sprintName,sprintField,reload]);

  const reassign=useCallback(async(id,field,login)=>{
    // Optimistic update using discoveredMembers
    setIssues(prev=>prev.map(i=>{if(i.idReadable!==id)return i;const n=structuredClone(i);const f=n.customFields.find(x=>x.name===field);if(f)f.value=login?{login,fullName:discoveredMembers.find(u=>u.login===login)?.fullName||login,$type:"User"}:null;return n}));
    try{
      await ytPatch(id,{customFields:[{name:field,$type:"SingleUserIssueCustomField",value:login?{login}:null}]});
    }catch(e){setApiError(e.message)}
  },[discoveredMembers]);
  const onDragStart=id=>setDragId(id);const onDragEnd=()=>{setDragId(null);setDropZone(null)};
  const onDropSprint=()=>{if(dragId){const s=issues.find(i=>i.idReadable===dragId);if(s&&!gSprints(s,sprintField).includes(sprintName))moveToSprint(dragId)}setDragId(null);setDropZone(null)};
  const onDropBacklog=()=>{if(dragId){const s=issues.find(i=>i.idReadable===dragId);if(s&&gSprints(s,sprintField).includes(sprintName))moveToBacklog(dragId)}setDragId(null);setDropZone(null)};

  // Snapshot actions
  const handleSnapshot = useCallback(async(type)=>{
    setSnapAction("saving");
    const snap = createSnapshot(sprint);
    const updated = {...snapshots, [sprintName]: {...(snapshots[sprintName]||{}), [type]:snap}};
    setSnapshots(updated);
    // Only save user-created snapshots (not seeds) — save all to be safe
    await patchConfig({snapshots: updated});
    setSnapAction("saved");
    setTimeout(()=>setSnapAction(null),2000);
  },[sprint,sprintName,snapshots]);

  // Settings
  const updateMember=useCallback((login,key,value)=>{setTeamConfig(prev=>{const ex=prev.find(m=>m.login===login);if(ex)return prev.map(m=>m.login===login?{...m,[key]:value}:m);return[...prev,{login,role:"backend",capacity:20,tolerance:2,[key]:value}]})},[]);
  const handleSaveCap=useCallback(async()=>{setSaveStatus("saving");await patchConfig({teamConfig});setSaveStatus("saved");setTimeout(()=>setSaveStatus(null),2000)},[teamConfig]);

  const saveQuery=useCallback((q)=>{
    setSavedQueries(prev=>{
      let next;
      if(!q.id){next=[...prev,{...q,id:`q-${Date.now()}`}]}
      else if(prev.find(x=>x.id===q.id)){next=prev.map(x=>x.id===q.id?q:x)}
      else{next=[...prev,q]}
      patchConfig({savedQueries:next});return next;
    });
  },[]);
  const deleteQuery=useCallback((id)=>{
    setSavedQueries(prev=>{const next=prev.filter(q=>q.id!==id);patchConfig({savedQueries:next});if(activeQueryId===id)setActiveQueryId(next[0]?.id||"q-all");return next});
  },[activeQueryId]);

  const toggleTeamLogin=useCallback((login)=>{
    setTeamLogins(prev=>{
      const next=prev.includes(login)?prev.filter(l=>l!==login):[...prev,login];
      patchConfig({teamLogins:next});return next;
    });
  },[]);

  const loadProjectFields=useCallback(async(pId)=>{
    if(!pId)return;
    try{
      const data=await ytFetch(`/api/admin/projects/${encodeURIComponent(pId)}/customFields?fields=field(name),bundle(values(name,isResolved))`);
      const fields=data.filter(f=>f.field?.name&&f.bundle?.values?.length>0).map(f=>({name:f.field.name,values:f.bundle.values.filter(v=>!v.isResolved).map(v=>v.name)}));
      setProjectFields(fields);
      patchConfig({projectId:pId,projectFields:fields});
    }catch(e){setApiError("Поля проекта: "+e.message)}
  },[]);

  // When sprintField changes, sync availableSprints from cached projectFields
  useEffect(()=>{
    const f=projectFields.find(pf=>pf.name===sprintField);
    if(f)setAvailableSprints(f.values);
  },[sprintField,projectFields]);

  // Merge mock + real snapshots (real overrides mock)
  const mergedSnapshots=useMemo(()=>({...MOCK_SNAPSHOTS,...snapshots}),[snapshots]);

  // All metrics from snapshots
  const allMetrics = useMemo(()=>{
    return Object.keys(mergedSnapshots).sort().map(name=>{
      const m=computeMetrics(name,mergedSnapshots[name]);return m;
    }).filter(Boolean);
  },[mergedSnapshots]);

  return(
    <ThemeCtx.Provider value={T}>
    <div style={{minHeight:"100vh",background:T.bg0,color:T.text1,fontFamily:T.font}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Onest:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&display=swap');*{box-sizing:border-box;margin:0;padding:0}::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:${T.bg3};border-radius:2px}@keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}.card-enter{animation:fadeIn .25s ease-out both}input[type=number]{-moz-appearance:textfield}input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none}`}</style>

      {/* Header */}
      <div style={{padding:"12px 24px",borderBottom:"1px solid "+T.border,display:"flex",justifyContent:"space-between",alignItems:"center",background:T.bg1,position:"sticky",top:0,zIndex:20}}>
        <div style={{display:"flex",alignItems:"center",gap:14}}>
          <div style={{width:30,height:30,borderRadius:8,background:"linear-gradient(135deg,"+T.accent+","+T.blue+")",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:800,color:T.bg0}}>ED</div>
          <div><div style={{fontSize:15,fontWeight:700,color:T.text0}}>Sprint Planner</div><div style={{fontSize:10,color:T.text3,fontFamily:T.mono}}>Extranet Delivery · YouTrack</div></div>
          {apiError&&<div title={apiError} style={{padding:"3px 10px",borderRadius:6,background:T.redDim,color:T.red,fontSize:10,fontWeight:600,cursor:"pointer"}} onClick={()=>setApiError(null)}>⚠ {apiError.slice(0,40)}</div>}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{display:"flex",gap:2,background:T.bg2,borderRadius:8,padding:2}}>
            {[{id:"planner",label:"Планирование"},{id:"metrics",label:"Метрики"},{id:"settings",label:"⚙ Настройки"}].map(t=>(
              <button key={t.id} onClick={()=>setTab(t.id)} style={{padding:"6px 16px",borderRadius:6,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,background:tab===t.id?T.bg3:"transparent",color:tab===t.id?T.text0:T.text3}}>{t.label}</button>
            ))}
          </div>
          <button onClick={toggleTheme} title={isDark?"Светлая тема":"Тёмная тема"} style={{width:32,height:32,borderRadius:8,border:"1px solid "+T.border,background:T.bg2,cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",color:T.text2,flexShrink:0}}>{isDark?"☀️":"🌙"}</button>
        </div>
      </div>

      {tab==="settings"?<SettingsTab members={mergedConfig} onUpdate={updateMember} onSave={handleSaveCap} saveStatus={saveStatus} storageLoaded={storageLoaded} savedQueries={savedQueries} onSaveQuery={saveQuery} onDeleteQuery={deleteQuery} sprintName={sprintName} onSetSprintName={setSprintName} teamLogins={teamLogins} onToggleTeamLogin={toggleTeamLogin} projectId={projectId} onSetProjectId={setProjectId} availableSprints={availableSprints} sprintField={sprintField} onSetSprintField={setSprintField} projectFields={projectFields} onLoadProjectFields={loadProjectFields} />
      :tab==="metrics"?<MetricsTab allMetrics={allMetrics} snapshots={mergedSnapshots} sprintName={sprintName} sprint={sprint} totals={sprintTotals} capacity={capacity} currentSnap={currentSnap} />
      :(
        <div style={{display:"flex",height:"calc(100vh - 55px)"}}>
          {/* Backlog */}
          <div onDragOver={e=>{e.preventDefault();setDropZone("backlog")}} onDragLeave={()=>setDropZone(null)} onDrop={onDropBacklog} style={{width:backlogCollapsed?36:"40%",minWidth:backlogCollapsed?36:340,borderRight:"1px solid "+T.border,display:"flex",flexDirection:"column",background:dropZone==="backlog"&&dragId?T.redDim:"transparent",transition:"width .2s, min-width .2s",overflow:"hidden"}}>
            {backlogCollapsed?(
              <div style={{display:"flex",flexDirection:"column",alignItems:"center",paddingTop:14,gap:8}}>
                <button onClick={()=>setBacklogCollapsed(false)} title="Развернуть бэклог" style={{background:"none",border:"none",cursor:"pointer",fontSize:25,color:T.text3,padding:4,lineHeight:1}} onMouseEnter={e=>e.target.style.color=T.accent} onMouseLeave={e=>e.target.style.color=T.text3}>›</button>
                <span style={{fontSize:14,color:T.text3,writingMode:"vertical-rl",transform:"rotate(180deg)",fontWeight:600,letterSpacing:1}}>BACKLOG</span>
              </div>
            ):(
            <>
              <div style={{padding:"14px 18px 10px",borderBottom:"1px solid "+T.border}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                  <span style={{fontSize:14,fontWeight:700,color:T.text0}}>Бэклог</span>
                  <span style={{fontSize:11,padding:"2px 8px",borderRadius:10,background:T.bg3,color:T.text2,fontFamily:T.mono,fontWeight:600}}>{backlog.length}</span>
                  {backlogLoading&&<span style={{fontSize:10,color:T.text3}}>Загружаю...</span>}
                  {backlogError&&<span style={{fontSize:10,color:T.red}} title={backlogError}>⚠ Ошибка</span>}
                  <button onClick={()=>setBacklogCollapsed(true)} title="Свернуть бэклог" style={{background:"none",border:"none",cursor:"pointer",fontSize:25,color:T.text3,padding:2,lineHeight:1}} onMouseEnter={e=>e.target.style.color=T.accent} onMouseLeave={e=>e.target.style.color=T.text3}>‹</button>
                  <button onClick={reload} title="Обновить" style={{background:"none",border:"none",cursor:"pointer",fontSize:25,color:T.text3,padding:2}} onMouseEnter={e=>e.target.style.color=T.text1} onMouseLeave={e=>e.target.style.color=T.text3}>↻</button>
                </div>
                <div style={{display:"flex",gap:4,marginBottom:8,flexWrap:"wrap"}}>
                  {savedQueries.map(q=><button key={q.id} onClick={()=>setActiveQueryId(q.id)} style={{padding:"3px 10px",borderRadius:5,border:"none",cursor:"pointer",fontSize:10,fontWeight:600,background:activeQueryId===q.id?T.accentDim:"transparent",color:activeQueryId===q.id?T.accent:T.text3}}>{q.name}</button>)}
                </div>
                <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Поиск..." style={{width:"100%",padding:"7px 12px",borderRadius:7,border:"1px solid "+T.border,background:T.bg2,color:T.text1,fontSize:12,outline:"none",marginBottom:8,fontFamily:T.font}} />
                <div style={{display:"flex",gap:4,flexWrap:"wrap",alignItems:"center"}}>
                  <FB label="Роль" value={filterRole} onChange={setFilterRole} options={[{v:"all",l:"Все"},{v:"backend",l:"BE"},{v:"frontend",l:"FE"},{v:"qa",l:"QA"},{v:"design",l:"DES"},{v:"manager",l:"MGR"}]} />
                  <FB label="Сорт." value={sortBy} onChange={setSortBy} options={[{v:"totalPriority",l:"TP ↓"},{v:"effort",l:"Effort ↓"},{v:"businessValue",l:"BV ↓"},{v:"priority",l:"Priority"},{v:"issue",l:"Issue ↑"}]} />
                  <label style={{display:"flex",alignItems:"center",gap:4,fontSize:10,color:groupBacklogByProject?T.accent:T.text3,fontWeight:600,cursor:"pointer",userSelect:"none"}}><input type="checkbox" checked={groupBacklogByProject} onChange={e=>setGroupBacklogByProject(e.target.checked)} style={{accentColor:T.accent,cursor:"pointer"}} />По проекту</label>
                </div>
              </div>
              <div style={{flex:1,overflowY:"auto",padding:"8px 12px",display:"flex",flexDirection:"column",gap:groupBacklogByProject?10:6}}>
                {groupBacklogByProject?(()=>{
                  const groups={};
                  backlog.forEach(i=>{const p=(gProject(i)||"").trim()||"Без проекта";if(!groups[p])groups[p]=[];groups[p].push(i)});
                  const entries=Object.entries(groups).filter(([,items])=>items.length>0).sort(([a],[b])=>a.localeCompare(b));
                  if(entries.length===0)return <div style={{textAlign:"center",padding:40,color:T.text3,fontSize:12}}>Бэклог пуст</div>;
                  return entries.map(([proj,items])=>(
                    <div key={proj} style={{borderRadius:10,border:"1px solid "+T.border}}>
                      <div style={{padding:"7px 12px",background:T.bg2,display:"flex",alignItems:"center",gap:8,borderBottom:"1px solid "+T.border,borderRadius:"10px 10px 0 0"}}>
                        <span style={{fontSize:11,fontWeight:700,color:T.text0}}>{proj}</span>
                        <span style={{fontSize:10,color:T.text3,fontFamily:T.mono}}>{items.length}</span>
                        {(()=>{const t={be:0,fe:0,qa:0,total:0};items.forEach(i=>{const e=getEfforts(i);t.be+=e.be;t.fe+=e.fe;t.qa+=e.qa;t.total+=e.total});return(<span style={{marginLeft:"auto",fontSize:10,fontFamily:T.mono,color:T.text3}}>{t.be>0&&<span style={{color:T.role.backend,marginRight:4}}>BE {t.be}</span>}{t.fe>0&&<span style={{color:T.role.frontend,marginRight:4}}>FE {t.fe}</span>}{t.qa>0&&<span style={{color:T.role.qa,marginRight:4}}>QA {t.qa}</span>}<span style={{color:T.accent}}>Σ {t.total}</span></span>)})()}
                      </div>
                      <div style={{padding:"6px 8px",display:"flex",flexDirection:"column",gap:6}}>
                        {items.map((issue,idx)=><TC key={issue.idReadable} issue={issue} index={idx} source="backlog" onMove={()=>moveToSprint(issue.idReadable)} onDragStart={()=>onDragStart(issue.idReadable)} onDragEnd={onDragEnd} isDragging={dragId===issue.idReadable} expanded={expandedCard===issue.idReadable} onToggle={()=>setExpandedCard(expandedCard===issue.idReadable?null:issue.idReadable)} onReassign={reassign} capacityMap={capacity} teamConfig={mergedConfig} allUsers={filteredConfig} />)}
                      </div>
                    </div>
                  ));
                })():(
                  <>
                    {backlog.map((issue,idx)=><TC key={issue.idReadable} issue={issue} index={idx} source="backlog" onMove={()=>moveToSprint(issue.idReadable)} onDragStart={()=>onDragStart(issue.idReadable)} onDragEnd={onDragEnd} isDragging={dragId===issue.idReadable} expanded={expandedCard===issue.idReadable} onToggle={()=>setExpandedCard(expandedCard===issue.idReadable?null:issue.idReadable)} onReassign={reassign} capacityMap={capacity} teamConfig={mergedConfig} allUsers={filteredConfig} />)}
                    {backlog.length===0&&<div style={{textAlign:"center",padding:40,color:T.text3,fontSize:12}}>Бэклог пуст</div>}
                  </>
                )}
              </div>
            </>
            )}
          </div>

          {/* Sprint + Capacity */}
          <div style={{flex:1,display:"flex",flexDirection:"column"}}>
            {/* Capacity */}
            <div style={{borderBottom:"1px solid "+T.border,background:T.bg1}}>
              <div onClick={()=>setCapacityOpen(o=>!o)} style={{padding:"12px 18px",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",userSelect:"none"}} onMouseEnter={e=>e.currentTarget.style.background=T.bg2} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                <span style={{fontSize:12,fontWeight:700,color:T.text2,textTransform:"uppercase",letterSpacing:".06em"}}>Загрузка команды</span>
                <div style={{display:"flex",gap:12,alignItems:"center"}}>
                  {capacityOpen&&<div style={{display:"flex",gap:12,fontSize:9,color:T.text3}}>{[{s:"optimal",l:"В норме"},{s:"under",l:"Недогрузка"},{s:"over",l:"Перегрузка"}].map(x=><span key={x.s} style={{display:"flex",alignItems:"center",gap:3}}><span style={{width:6,height:6,borderRadius:2,background:T.status[x.s]}} />{x.l}</span>)}</div>}
                  <span style={{fontSize:12,color:T.text3}}>{capacityOpen?"▲":"▼"}</span>
                </div>
              </div>
              {capacityOpen&&<>
                <div style={{padding:"0 18px 8px",display:"flex",gap:2,flexWrap:"wrap"}}>
                  {[{v:"all",l:"Все"},...ROLES.map(r=>({v:r,l:RL[r]}))].map(o=>(
                    <button key={o.v} onClick={e=>{e.stopPropagation();setCapacityRoleFilter(o.v)}} style={{padding:"2px 9px",borderRadius:4,border:"none",cursor:"pointer",fontSize:10,fontWeight:600,background:capacityRoleFilter===o.v?T.bg3:"transparent",color:capacityRoleFilter===o.v?T.text0:T.text3}}>{o.l}</button>
                  ))}
                </div>
                <div style={{padding:"0 18px 12px",display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:6}}>
                  {capacity.filter(m=>capacityRoleFilter==="all"||m.role===capacityRoleFilter).map(m=><CB key={m.login} m={m} />)}
                </div>
              </>}
            </div>

            {/* Sprint */}
            <div onDragOver={e=>{e.preventDefault();setDropZone("sprint")}} onDragLeave={()=>setDropZone(null)} onDrop={onDropSprint} style={{flex:1,overflowY:"auto",background:dropZone==="sprint"&&dragId?T.greenDim:"transparent",transition:"background .2s"}}>
              <div style={{padding:"12px 18px 8px",display:"flex",justifyContent:"space-between",alignItems:"center",position:"sticky",top:0,background:T.bg0,zIndex:5,flexWrap:"wrap",gap:8}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:14,fontWeight:700,color:T.text0}}>{sprintName}</span>
                  <span style={{fontSize:11,padding:"2px 8px",borderRadius:10,background:T.greenDim,color:T.green,fontFamily:T.mono,fontWeight:600}}>{filteredSprint.length}{filterSprintRole!=="all"&&<span style={{opacity:.6}}>/{sprint.length}</span>}</span>
                  <FB label="Роль" value={filterSprintRole} onChange={setFilterSprintRole} options={[{v:"all",l:"Все"},{v:"backend",l:"BE"},{v:"frontend",l:"FE"},{v:"qa",l:"QA"},{v:"design",l:"DES"},{v:"manager",l:"MGR"}]} />
                  <FB label="Сорт." value={sortSprint} onChange={setSortSprint} options={[{v:"none",l:"—"},{v:"assignee",l:"Assignee"},{v:"qa",l:"QA"}]} />
                  <label style={{display:"flex",alignItems:"center",gap:4,fontSize:10,color:groupByProject?T.accent:T.text3,fontWeight:600,cursor:"pointer",userSelect:"none"}}><input type="checkbox" checked={groupByProject} onChange={e=>setGroupByProject(e.target.checked)} style={{accentColor:T.accent,cursor:"pointer"}} />По проекту</label>
                  {hasStart&&!hasEnd&&<span style={{fontSize:9,padding:"2px 6px",borderRadius:4,background:T.accentDim,color:T.accent,fontWeight:600}}>План зафиксирован</span>}
                  {hasEnd&&<span style={{fontSize:9,padding:"2px 6px",borderRadius:4,background:T.greenDim,color:T.green,fontWeight:600}}>Спринт закрыт</span>}
                </div>
                <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                  <div style={{display:"flex",gap:10,fontSize:11,fontFamily:T.mono,fontWeight:600}}>
                    {sprintTotals.be>0&&<span style={{color:T.role.backend}}>BE {sprintTotals.be}</span>}
                    {sprintTotals.fe>0&&<span style={{color:T.role.frontend}}>FE {sprintTotals.fe}</span>}
                    {sprintTotals.qa>0&&<span style={{color:T.role.qa}}>QA {sprintTotals.qa}</span>}
                    {sprintTotals.des>0&&<span style={{color:T.role.design}}>DES {sprintTotals.des}</span>}
                    {sprintTotals.mgr>0&&<span style={{color:T.role.manager}}>MGR {sprintTotals.mgr}</span>}
                    <span style={{color:T.accent}}>Σ {sprintTotals.total}</span>
                  </div>
                  {/* Snapshot buttons */}
                  {snapAction==="saving"?<span style={{fontSize:11,color:T.accent}}>Сохраняю...</span>
                  :snapAction==="saved"?<span style={{fontSize:11,color:T.green}}>✓ Сохранено</span>
                  :snapAction==="confirm-start"?(
                    <div style={{display:"flex",gap:4,alignItems:"center"}}>
                      <span style={{fontSize:11,color:T.yellow}}>{hasStart?"Перезаписать план?":"Зафиксировать?"}</span>
                      <button onClick={()=>{setSnapAction(null);handleSnapshot("start")}} style={{...btnS,background:T.green,color:T.bg0}}>Да</button>
                      <button onClick={()=>setSnapAction(null)} style={{...btnS,background:T.bg3,color:T.text2}}>Нет</button>
                    </div>
                  ):snapAction==="confirm-end"?(
                    <div style={{display:"flex",gap:4,alignItems:"center"}}>
                      <span style={{fontSize:11,color:T.yellow}}>{hasEnd?"Перезаписать закрытие?":"Закрыть спринт?"}</span>
                      <button onClick={()=>{setSnapAction(null);handleSnapshot("end")}} style={{...btnS,background:T.red,color:"#fff"}}>Да</button>
                      <button onClick={()=>setSnapAction(null)} style={{...btnS,background:T.bg3,color:T.text2}}>Нет</button>
                    </div>
                  ):(
                    <div style={{display:"flex",gap:4}}>
                      <button onClick={()=>setSnapAction("confirm-start")} disabled={sprint.length===0} style={{...btnS,background:T.accentDim,color:T.accent,opacity:sprint.length===0?.4:1}}>📌 Зафиксировать план</button>
                      <button onClick={()=>setSnapAction("confirm-end")} disabled={!hasStart} style={{...btnS,background:T.redDim,color:T.red,opacity:!hasStart?.4:1}}>🏁 Закрыть спринт</button>
                    </div>
                  )}
                </div>
              </div>
              <div style={{padding:"4px 12px 20px",display:"flex",flexDirection:"column",gap:groupByProject?10:6}}>
                {groupByProject?(()=>{
                  const groups={};
                  filteredSprint.forEach(i=>{const p=gProject(i)||"Без проекта";if(!groups[p])groups[p]=[];groups[p].push(i)});
                  return Object.entries(groups).sort(([a],[b])=>a.localeCompare(b)).map(([proj,items])=>(
                    <div key={proj} style={{borderRadius:10,border:"1px solid "+T.border,overflow:"hidden"}}>
                      <div style={{padding:"7px 12px",background:T.bg2,display:"flex",alignItems:"center",gap:8,borderBottom:"1px solid "+T.border}}>
                        <span style={{fontSize:11,fontWeight:700,color:T.text0}}>{proj}</span>
                        <span style={{fontSize:10,color:T.text3,fontFamily:T.mono}}>{items.length}</span>
                        {(()=>{const t={be:0,fe:0,qa:0,total:0};items.forEach(i=>{const e=getEfforts(i);t.be+=e.be;t.fe+=e.fe;t.qa+=e.qa;t.total+=e.total});return(<span style={{marginLeft:"auto",fontSize:10,fontFamily:T.mono,color:T.text3}}>{t.be>0&&<span style={{color:T.role.backend,marginRight:4}}>BE {t.be}</span>}{t.fe>0&&<span style={{color:T.role.frontend,marginRight:4}}>FE {t.fe}</span>}{t.qa>0&&<span style={{color:T.role.qa,marginRight:4}}>QA {t.qa}</span>}<span style={{color:T.accent}}>Σ {t.total}</span></span>)})()}
                      </div>
                      <div style={{padding:"6px 8px",display:"flex",flexDirection:"column",gap:6}}>
                        {items.map((issue,idx)=><TC key={issue.idReadable} issue={issue} index={idx} source="sprint" onMove={()=>moveToBacklog(issue.idReadable)} onDragStart={()=>onDragStart(issue.idReadable)} onDragEnd={onDragEnd} isDragging={dragId===issue.idReadable} expanded={expandedCard===issue.idReadable} onToggle={()=>setExpandedCard(expandedCard===issue.idReadable?null:issue.idReadable)} onReassign={reassign} capacityMap={capacity} teamConfig={mergedConfig} allUsers={filteredConfig} />)}
                      </div>
                    </div>
                  ));
                })():(
                  <>
                    {filteredSprint.map((issue,idx)=><TC key={issue.idReadable} issue={issue} index={idx} source="sprint" onMove={()=>moveToBacklog(issue.idReadable)} onDragStart={()=>onDragStart(issue.idReadable)} onDragEnd={onDragEnd} isDragging={dragId===issue.idReadable} expanded={expandedCard===issue.idReadable} onToggle={()=>setExpandedCard(expandedCard===issue.idReadable?null:issue.idReadable)} onReassign={reassign} capacityMap={capacity} teamConfig={mergedConfig} allUsers={filteredConfig} />)}
                    {sprint.length===0&&<div style={{textAlign:"center",padding:50,border:"2px dashed "+T.border,borderRadius:14,marginTop:8}}><div style={{fontSize:28,color:T.text3,marginBottom:8}}>↓</div><div style={{fontSize:13,fontWeight:600,color:T.text3}}>Перетащите задачи из бэклога</div></div>}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
    </ThemeCtx.Provider>
  );
}

const btnS={padding:"4px 10px",borderRadius:5,border:"none",cursor:"pointer",fontSize:10,fontWeight:700,transition:"all .15s"};

// ═══════════════════════════════════════════════════════════════════════════
// SETTINGS TAB
// ═══════════════════════════════════════════════════════════════════════════
function SettingsTab({members,onUpdate,onSave,saveStatus,storageLoaded,savedQueries,onSaveQuery,onDeleteQuery,sprintName,onSetSprintName,teamLogins,onToggleTeamLogin,projectId,onSetProjectId,availableSprints,sprintField,onSetSprintField,projectFields,onLoadProjectFields}){
  const T=useContext(ThemeCtx);
  const grouped=useMemo(()=>{const g={};ROLES.forEach(r=>g[r]=[]);members.forEach(m=>{(g[m.role]||g.backend).push(m)});return g},[members]);
  const RN={backend:"Backend-разработчики",frontend:"Frontend-разработчики",qa:"QA-инженеры",design:"Дизайнеры",manager:"Менеджеры"};
  const activeCount=teamLogins.length>0?teamLogins.length:members.length;
  return(
    <div style={{padding:"20px 24px",maxWidth:900,margin:"0 auto"}}>
      <SprintSettings sprintName={sprintName} onSetSprintName={onSetSprintName} projectId={projectId} onSetProjectId={onSetProjectId} availableSprints={availableSprints} sprintField={sprintField} onSetSprintField={onSetSprintField} projectFields={projectFields} onLoadProjectFields={onLoadProjectFields} />
      <QueryManager queries={savedQueries} onSave={onSaveQuery} onDelete={onDeleteQuery} />
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20,flexWrap:"wrap",gap:12}}>
        <div><h2 style={{fontSize:18,fontWeight:800,color:T.text0,marginBottom:4}}>Настройки команды</h2><p style={{fontSize:12,color:T.text3}}>{activeCount} в команде{teamLogins.length>0&&members.length>activeCount&&<span style={{color:T.yellow}}> · {members.length-activeCount} скрыто</span>} · {members.reduce((a,m)=>a+m.capacity,0)} SP{storageLoaded&&<span style={{marginLeft:8,color:T.accent,fontSize:10}}>● загружено</span>}</p></div>
        <button onClick={onSave} style={{padding:"8px 20px",borderRadius:8,border:"none",cursor:"pointer",fontSize:13,fontWeight:700,background:saveStatus==="saved"?T.green:saveStatus==="error"?T.red:"linear-gradient(135deg,"+T.accent+","+T.blue+")",color:T.bg0,opacity:saveStatus==="saving"?.6:1}}>{saveStatus==="saving"?"Сохраняю...":saveStatus==="saved"?"✓ Сохранено":saveStatus==="error"?"✗ Ошибка":"Сохранить"}</button>
      </div>
      <div style={{padding:14,borderRadius:10,background:T.blueDim,border:"1px solid "+T.blue+"18",marginBottom:20,fontSize:12,color:T.text2,lineHeight:1.6}}><strong style={{color:T.blue}}>Как это работает:</strong> Люди обнаруживаются из полей Assignee и QA. Включите галочку — человек будет в расчёте загрузки и дропдаунах. Настройки сохраняются между сессиями.</div>
      {ROLES.map(role=><div key={role} style={{marginBottom:24}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}><span style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:4,background:T.role[role]+"20",color:T.role[role],textTransform:"uppercase"}}>{RL[role]}</span><span style={{fontSize:13,fontWeight:700,color:T.text0}}>{RN[role]}</span><span style={{fontSize:11,color:T.text3}}>{grouped[role].length} чел. · {grouped[role].reduce((a,m)=>a+m.capacity,0)} SP</span></div>
        <div style={{display:"flex",flexDirection:"column",gap:6}}>{grouped[role].map(m=><MemberRow key={m.login} m={m} onUpdate={onUpdate} inTeam={teamLogins.length===0||teamLogins.includes(m.login)} onToggle={()=>onToggleTeamLogin(m.login)} />)}{grouped[role].length===0&&<div style={{padding:12,borderRadius:8,background:T.bg1,border:"1px solid "+T.border,fontSize:11,color:T.text3,textAlign:"center"}}>Нет участников</div>}</div>
      </div>)}
    </div>
  );
}
function MemberRow({m,onUpdate,inTeam,onToggle}){const T=useContext(ThemeCtx);return(
  <div style={{padding:"10px 14px",borderRadius:8,background:T.bg1,border:"1px solid "+(inTeam?T.border:T.border),opacity:inTeam?1:0.45,display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}} onMouseEnter={e=>e.currentTarget.style.borderColor=T.borderHover} onMouseLeave={e=>e.currentTarget.style.borderColor=T.border}>
    <button onClick={onToggle} title={inTeam?"Убрать из команды":"Добавить в команду"} style={{width:18,height:18,borderRadius:4,border:"2px solid "+(inTeam?T.accent:T.border),background:inTeam?T.accent:"transparent",cursor:"pointer",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",color:T.bg0,fontSize:10,fontWeight:800,padding:0}}>{inTeam?"✓":""}</button>
    <div style={{minWidth:160,flex:"1 1 160px"}}><div style={{fontSize:13,fontWeight:600,color:T.text0}}>{m.fullName}</div><div style={{fontSize:10,color:T.text3,fontFamily:T.mono}}>{m.login}</div></div>
    <div style={{display:"flex",alignItems:"center",gap:4}}><span style={{fontSize:10,color:T.text3,fontWeight:600}}>Роль:</span><select value={m.role} onChange={e=>onUpdate(m.login,"role",e.target.value)} style={{padding:"4px 8px",borderRadius:5,border:"1px solid "+T.border,background:T.bg2,color:T.role[m.role],fontSize:11,fontWeight:600,fontFamily:T.font,cursor:"pointer",outline:"none"}}>{ROLES.map(r=><option key={r} value={r}>{RL[r]}</option>)}</select></div>
    <div style={{display:"flex",alignItems:"center",gap:4}}><span style={{fontSize:10,color:T.text3,fontWeight:600}}>Cap:</span><input type="number" value={m.capacity} min={0} max={99} onChange={e=>onUpdate(m.login,"capacity",Math.max(0,parseInt(e.target.value)||0))} style={{width:48,padding:"4px 6px",borderRadius:5,border:"1px solid "+T.border,background:T.bg2,color:T.text0,fontSize:13,fontFamily:T.mono,fontWeight:700,textAlign:"center",outline:"none"}} /><span style={{fontSize:10,color:T.text3}}>±</span><input type="number" value={m.tolerance} min={0} max={20} onChange={e=>onUpdate(m.login,"tolerance",Math.max(0,parseInt(e.target.value)||0))} style={{width:40,padding:"4px 6px",borderRadius:5,border:"1px solid "+T.border,background:T.bg2,color:T.text0,fontSize:13,fontFamily:T.mono,fontWeight:700,textAlign:"center",outline:"none"}} /></div>
    <div style={{fontSize:11,fontFamily:T.mono,color:T.text2,minWidth:70,textAlign:"right"}}>{m.capacity-m.tolerance}–{m.capacity+m.tolerance}</div>
  </div>
);}

// ═══════════════════════════════════════════════════════════════════════════
// LINE CHART (SVG, no deps)
// ═══════════════════════════════════════════════════════════════════════════
const PERSON_PALETTE=["#4ecdc4","#ff4757","#4b7bec","#ffd43b","#26de81","#a55eea","#ffa502","#ff6b81","#70a1ff","#eccc68","#2ed573","#ff6348"];
function LineChart({data,series,height=170}){
  const T=useContext(ThemeCtx);
  if(!data||data.length<2)return<div style={{padding:16,fontSize:11,color:T.text3,textAlign:"center"}}>Нужно минимум 2 спринта с данными</div>;
  const pL=44,pR=16,pT=14,pB=32,W=560,H=height,cW=W-pL-pR,cH=H-pT-pB;
  const allVals=series.flatMap(s=>data.map(d=>typeof d[s.key]==="number"?d[s.key]:0));
  const maxV=Math.max(...allVals,1);
  const rawStep=maxV/4;
  const mag=Math.pow(10,Math.floor(Math.log10(rawStep)));
  const step=Math.ceil(rawStep/mag)*mag||1;
  const yMax=step*Math.ceil(maxV/step)+step;
  const xP=i=>pL+(cW/(data.length-1))*i;
  const yP=v=>pT+cH*(1-Math.min(v,yMax)/yMax);
  const gridVals=Array.from({length:5},(_,i)=>Math.round(step*i));
  return(
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",display:"block"}}>
        {gridVals.map(v=>{const y=yP(v);return(
          <g key={v}>
            <line x1={pL} y1={y} x2={W-pR} y2={y} stroke={T.border} strokeWidth="1"/>
            <text x={pL-5} y={y+3.5} textAnchor="end" fill={T.text3} fontSize="9" fontFamily="monospace">{v}</text>
          </g>
        )})}
        {data.map((d,i)=>(
          <text key={i} x={xP(i)} y={H-2} textAnchor="middle" fill={T.text2} fontSize="9">{d.label}</text>
        ))}
        {series.map(s=>(
          <g key={s.key}>
            <polyline points={data.map((d,i)=>`${xP(i).toFixed(1)},${yP(d[s.key]||0).toFixed(1)}`).join(" ")} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round"/>
            {data.map((d,i)=>(
              <circle key={i} cx={xP(i)} cy={yP(d[s.key]||0)} r="3.5" fill={s.color} stroke={T.bg1} strokeWidth="1.5">
                <title>{s.label}: {d[s.key]??"-"}</title>
              </circle>
            ))}
          </g>
        ))}
      </svg>
      <div style={{display:"flex",gap:14,flexWrap:"wrap",justifyContent:"center",marginTop:2}}>
        {series.map(s=>(
          <div key={s.key} style={{display:"flex",alignItems:"center",gap:5,fontSize:10,color:T.text2}}>
            <div style={{width:18,height:2.5,borderRadius:2,background:s.color}}/>
            <span>{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// METRICS TAB (snapshot-based)
// ═══════════════════════════════════════════════════════════════════════════
function MetricsTab({allMetrics,snapshots,sprintName,sprint,totals,capacity}){
  const T=useContext(ThemeCtx);
  const [trendTab,setTrendTab]=useState("Усилия");
  const [assigneeMetric,setAssigneeMetric]=useState("effort");
  const closed=allMetrics.filter(m=>m.status==="closed");
  const avg=useMemo(()=>{if(closed.length===0)return null;const n=closed.length;return{n,avgCompletion:Math.round(closed.reduce((a,m)=>a+m.completionRate,0)/n),avgReopened:+(closed.reduce((a,m)=>a+m.reopened,0)/n).toFixed(1),avgCarryOver:+(closed.reduce((a,m)=>a+m.carryOver,0)/n).toFixed(1)}},[closed]);
  const current=allMetrics.find(m=>m.sprintName===sprintName);
  const reopened=sprint.filter(i=>(gNum(i,FIELDS.REOPEN_COUNTER)||0)>0);

  const trendData=useMemo(()=>allMetrics.map(m=>{
    const issues=snapshots[m.sprintName]?.start?.issues||[];
    const endIssues=snapshots[m.sprintName]?.end?.issues||[];
    const efforts=issues.reduce((a,i)=>({be:a.be+(i.efforts?.be||0),fe:a.fe+(i.efforts?.fe||0),qa:a.qa+(i.efforts?.qa||0),mgr:a.mgr+(i.efforts?.mgr||0),total:a.total+(i.efforts?.total||0)}),{be:0,fe:0,qa:0,mgr:0,total:0});
    const byAssignee={};
    issues.forEach(i=>{if(i.assignee){const p=byAssignee[i.assignee]=byAssignee[i.assignee]||{count:0,closed:0,effort:0};p.count++;p.effort+=i.efforts?.total||0;}});
    endIssues.forEach(i=>{if(RESOLVED_STATES.includes(i.state)){const si=issues.find(s=>s.id===i.id);if(si?.assignee&&byAssignee[si.assignee])byAssignee[si.assignee].closed++;}});
    const byQA={};
    issues.forEach(i=>{
      const a=i.assignee,q=i.qa;
      if(a){const p=byQA[a]=byQA[a]||{load:0};p.load+=i.efforts?.total||0;}
      if(q&&q!==a){const p=byQA[q]=byQA[q]||{load:0};p.load+=i.efforts?.qa||0;}
    });
    const label=m.sprintName.replace("2026-","").split(" ")[0];
    return{label,fullLabel:m.sprintName,status:m.status,planned:m.planned,closed:m.completed||0,efforts,byAssignee,byQA};
  }),[allMetrics,snapshots]);

  return(
    <div style={{padding:"20px 24px",maxWidth:900,margin:"0 auto"}}>
      <h2 style={{fontSize:18,fontWeight:800,color:T.text0,marginBottom:18}}>Метрики спринтов</h2>

      {/* Current sprint */}
      <div style={{padding:18,borderRadius:12,marginBottom:20,background:"linear-gradient(135deg,"+T.accentDim+","+T.blueDim+")",border:"1px solid "+T.accent+"18"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <span style={{fontSize:12,color:T.text2,fontWeight:600}}>{sprintName} — текущее состояние</span>
          {current?.status==="active"&&<span style={{fontSize:10,padding:"2px 8px",borderRadius:4,background:T.accentDim,color:T.accent,fontWeight:600}}>План зафиксирован · {current.planned} задач</span>}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(100px,1fr))",gap:14}}>
          {[{l:"Задач",v:sprint.length,c:T.accent},{l:"Total SP",v:totals.total,c:T.green},{l:"Backend",v:totals.be,c:T.role.backend},{l:"Frontend",v:totals.fe,c:T.role.frontend},{l:"QA",v:totals.qa,c:T.role.qa},{l:"Design",v:totals.des,c:T.role.design},{l:"Manager",v:totals.mgr,c:T.role.manager}].map(m=><div key={m.l} style={{textAlign:"center"}}><div style={{fontSize:24,fontWeight:800,color:m.c,fontFamily:T.mono}}>{m.v}</div><div style={{fontSize:10,color:T.text3}}>{m.l}</div></div>)}
        </div>
        {current?.status==="active"&&sprint.length!==current.planned&&(
          <div style={{marginTop:12,fontSize:11,color:T.yellow,padding:"6px 10px",background:T.yellowDim,borderRadius:6}}>
            ⚠ Было запланировано {current.planned}, сейчас {sprint.length} ({sprint.length>current.planned?"+":""}{ sprint.length-current.planned} с момента фиксации)
          </div>
        )}
      </div>

      {/* Capacity by role */}
      <div style={{marginBottom:20}}>
        <div style={{fontSize:13,fontWeight:700,color:T.text1,marginBottom:10}}>Загрузка по ролям</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:8}}>
          {ROLES.map(role=>{const ms=capacity.filter(m=>m.role===role);const tc=ms.reduce((a,m)=>a+m.capacity,0);const tl=ms.reduce((a,m)=>a+m.load,0);const p=tc>0?Math.round(tl/tc*100):0;return(
            <div key={role} style={{padding:12,borderRadius:10,background:T.bg1,border:"1px solid "+T.border}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}><span style={{fontSize:10,fontWeight:700,color:T.role[role],textTransform:"uppercase"}}>{RL[role]}</span><span style={{fontSize:12,fontFamily:T.mono,fontWeight:700,color:p>90?T.red:p>60?T.green:T.text2}}>{p}%</span></div>
              <div style={{fontSize:18,fontWeight:800,fontFamily:T.mono,color:T.text0}}>{tl}<span style={{fontSize:11,color:T.text3}}>/{tc}</span></div>
              <div style={{fontSize:9,color:T.text3,marginTop:2}}>{ms.length} чел.</div>
            </div>)})}
        </div>
      </div>

      {/* Sprint History from snapshots */}
      <div style={{fontSize:13,fontWeight:700,color:T.text1,marginBottom:10}}>История спринтов (из снапшотов)</div>
      {allMetrics.length===0?<div style={{padding:16,borderRadius:10,background:T.bg1,border:"1px solid "+T.border,fontSize:12,color:T.text3,marginBottom:20}}>Нет снапшотов</div>:(
        <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:20}}>
          {allMetrics.map(s=>{
            const isActive=s.status==="active";
            const p=s.completionRate;
            return(
            <div key={s.sprintName} style={{padding:14,borderRadius:10,background:T.bg1,border:"1px solid "+(isActive?T.accent+"44":T.border)}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <span style={{fontSize:13,fontWeight:700,color:T.text0}}>{s.sprintName}</span>
                {isActive
                  ?<span style={{fontSize:11,padding:"2px 8px",borderRadius:4,background:T.accentDim,color:T.accent,fontWeight:600}}>В процессе · {s.planned} задач</span>
                  :<span style={{fontSize:20,fontWeight:800,fontFamily:T.mono,color:p>=80?T.green:p>=60?T.yellow:T.red}}>{p}%</span>
                }
              </div>
              {!isActive&&<div style={{height:6,background:T.bg0,borderRadius:3,marginBottom:8,overflow:"hidden"}}><div style={{height:"100%",width:p+"%",borderRadius:3,background:p>=80?T.green:p>=60?T.yellow:T.red}} /></div>}
              <div style={{display:"flex",gap:12,fontSize:11,color:T.text2,flexWrap:"wrap",marginBottom:s.projects?.length?8:0}}>
                <span>Запланировано: <b style={{color:T.text0}}>{s.planned}</b></span>
                {!isActive&&<><span>Выполнено: <b style={{color:T.green}}>{s.completed}</b></span>
                <span>Переоткрыто: <b style={{color:T.yellow}}>{s.reopened}</b></span>
                <span>Carry-over: <b style={{color:T.red}}>{s.carryOver}</b></span>
                {s.added>0&&<span>Добавлено: <b style={{color:T.blue}}>+{s.added}</b></span>}
                {s.removed>0&&<span>Убрано: <b style={{color:T.text3}}>-{s.removed}</b></span>}</>}
              </div>
              {s.projects?.length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                {s.projects.map(p=><span key={p.name} style={{fontSize:10,padding:"2px 7px",borderRadius:4,background:T.bg0,border:"1px solid "+T.border,color:T.text2}}>
                  <b style={{color:T.text1}}>{p.name}</b> · {p.count} задач · <b style={{color:T.accent}}>{p.pct}%</b>
                </span>)}
              </div>}
            </div>
          )})}
        </div>
      )}

      {/* Averages */}
      {avg&&<div style={{padding:14,borderRadius:10,background:T.bg1,border:"1px solid "+T.border,marginBottom:20}}>
        <div style={{fontSize:11,fontWeight:600,color:T.text2,marginBottom:8}}>Средние ({avg.n} спринтов)</div>
        <div style={{display:"flex",gap:28,fontSize:12,flexWrap:"wrap"}}>
          <div><span style={{color:T.text3}}>Закрытие: </span><span style={{fontWeight:800,fontFamily:T.mono,color:avg.avgCompletion>=75?T.green:T.yellow}}>{avg.avgCompletion}%</span></div>
          <div><span style={{color:T.text3}}>Переоткрытий: </span><span style={{fontWeight:800,fontFamily:T.mono,color:T.yellow}}>{avg.avgReopened}/спринт</span></div>
          <div><span style={{color:T.text3}}>Carry-over: </span><span style={{fontWeight:800,fontFamily:T.mono,color:T.red}}>{avg.avgCarryOver}/спринт</span></div>
        </div>
      </div>}

      {/* Reopened */}
      {reopened.length>0&&<div style={{marginBottom:24}}><div style={{fontSize:13,fontWeight:700,color:T.text1,marginBottom:10}}>Переоткрытые в {sprintName}</div>{reopened.map(i=><div key={i.idReadable} style={{padding:10,borderRadius:8,background:T.yellowDim,border:"1px solid "+T.yellow+"22",marginBottom:6,display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><span style={{fontSize:11,fontFamily:T.mono,fontWeight:600,color:T.yellow,marginRight:8}}>{i.idReadable}</span><span style={{fontSize:12,color:T.text0}}>{i.summary}</span></div><span style={{fontSize:12,fontFamily:T.mono,fontWeight:700,color:T.yellow}}>×{gNum(i,FIELDS.REOPEN_COUNTER)}</span></div>)}</div>}

      {/* Trends */}
      {(()=>{
        const allPeople=[...new Set(trendData.flatMap(d=>Object.keys(d.byAssignee)))].sort();
        const allQA=[...new Set(trendData.flatMap(d=>Object.keys(d.byQA)))].sort();
        const tabBtnStyle=(active)=>({padding:"4px 12px",borderRadius:5,border:"none",cursor:"pointer",fontSize:11,fontWeight:600,background:active?T.bg3:"transparent",color:active?T.text0:T.text3});
        return(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div style={{fontSize:13,fontWeight:700,color:T.text1}}>Тренды по спринтам</div>
              <div style={{display:"flex",gap:2,background:T.bg2,borderRadius:6,padding:1}}>
                {["Усилия","Задачи","Исполнители","QA"].map(t=>(
                  <button key={t} onClick={()=>setTrendTab(t)} style={tabBtnStyle(trendTab===t)}>{t}</button>
                ))}
              </div>
            </div>
            <div style={{padding:16,borderRadius:12,background:T.bg1,border:"1px solid "+T.border}}>
              {trendTab==="Усилия"&&(
                <LineChart
                  data={trendData.map(d=>({label:d.label,total:d.efforts.total,be:d.efforts.be,fe:d.efforts.fe,qa:d.efforts.qa,mgr:d.efforts.mgr}))}
                  series={[
                    {key:"total",color:T.accent,label:"Total SP"},
                    {key:"be",color:T.role.backend,label:"BE"},
                    {key:"fe",color:T.role.frontend,label:"FE"},
                    {key:"qa",color:T.role.qa,label:"QA"},
                    {key:"mgr",color:T.role.manager,label:"MGR"},
                  ]}
                />
              )}
              {trendTab==="Задачи"&&(
                <LineChart
                  data={trendData.map(d=>({label:d.label,planned:d.planned,closed:d.closed}))}
                  series={[
                    {key:"planned",color:T.text2,label:"Запланировано"},
                    {key:"closed",color:T.green,label:"Закрыто"},
                  ]}
                />
              )}
              {trendTab==="Исполнители"&&(
                <div>
                  <div style={{display:"flex",justifyContent:"flex-end",marginBottom:10}}>
                    <div style={{display:"flex",gap:2,background:T.bg2,borderRadius:5,padding:1}}>
                      {[{v:"effort",l:"SP"},{v:"count",l:"Задач"},{v:"closed",l:"Закрыто"}].map(o=>(
                        <button key={o.v} onClick={()=>setAssigneeMetric(o.v)} style={tabBtnStyle(assigneeMetric===o.v)}>{o.l}</button>
                      ))}
                    </div>
                  </div>
                  <LineChart
                    data={trendData.map(d=>({label:d.label,...Object.fromEntries(allPeople.map(p=>[p,d.byAssignee[p]?.[assigneeMetric]||0]))}))}
                    series={allPeople.map((p,i)=>({key:p,color:PERSON_PALETTE[i%PERSON_PALETTE.length],label:p.split(".")[0]||p}))}
                    height={200}
                  />
                </div>
              )}
              {trendTab==="QA"&&(
                <LineChart
                  data={trendData.map(d=>({label:d.label,...Object.fromEntries(allQA.map(p=>[p,d.byQA[p]?.load||0]))}))}
                  series={allQA.map((p,i)=>({key:p,color:PERSON_PALETTE[i%PERSON_PALETTE.length],label:p.split(".")[0]||p}))}
                  height={200}
                />
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SHARED
// ═══════════════════════════════════════════════════════════════════════════
function FB({label,value,onChange,options}){const T=useContext(ThemeCtx);return(<div style={{display:"flex",alignItems:"center",gap:4}}><span style={{fontSize:10,color:T.text3,fontWeight:600}}>{label}:</span><div style={{display:"flex",gap:1,background:T.bg2,borderRadius:5,padding:1}}>{options.map(o=><button key={o.v} onClick={()=>onChange(o.v)} style={{padding:"3px 8px",borderRadius:4,border:"none",cursor:"pointer",fontSize:10,fontWeight:600,background:value===o.v?T.bg3:"transparent",color:value===o.v?T.text0:T.text3}}>{o.l}</button>)}</div></div>)}

function TC({issue,index,source,onMove,onDragStart,onDragEnd,isDragging,expanded,onToggle,onReassign,capacityMap,teamConfig,allUsers=[]}){
  const T=useContext(ThemeCtx);
  const priority=gEnum(issue,FIELDS.PRIORITY);const state=gEnum(issue,FIELDS.STATE);const assignee=gUser(issue,FIELDS.ASSIGNEE);const qa=gUser(issue,FIELDS.QA);const tp=gNum(issue,FIELDS.TOTAL_PRIORITY);const efforts=getEfforts(issue);const eLabel=effortLabel(issue);const pColor=T.priority[priority]||T.text3;const hasQA=efforts.qa>0;
  let aOver=false,qOver=false;if(capacityMap){if(assignee){const m=capacityMap.find(x=>x.login===assignee.login);if(m?.status==="over")aOver=true}if(qa){const m=capacityMap.find(x=>x.login===qa.login);if(m?.status==="over")qOver=true}}
  const bc=efforts.be?T.role.backend:efforts.fe?T.role.frontend:efforts.des?T.role.design:efforts.mgr?T.role.manager:T.text3;
  return(
    <div draggable onDragStart={onDragStart} onDragEnd={onDragEnd} className="card-enter" style={{padding:"10px 12px",background:T.bg1,borderRadius:10,border:"1px solid "+T.border,borderLeftWidth:3,borderLeftColor:bc,cursor:"grab",opacity:isDragging?.35:1,transition:"all .15s",animationDelay:index*30+"ms"}} onMouseEnter={e=>{e.currentTarget.style.borderColor=T.borderHover;e.currentTarget.style.borderLeftColor=bc}} onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.borderLeftColor=bc}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
        <div style={{display:"flex",alignItems:"center",gap:6}}><a href={`${__YT_BASE__}/issue/${issue.idReadable}`} target="_blank" rel="noreferrer" style={{fontSize:10,fontFamily:T.mono,color:T.text3,fontWeight:600,textDecoration:"none"}} onMouseEnter={e=>e.target.style.color=T.accent} onMouseLeave={e=>e.target.style.color=T.text3}>{issue.idReadable}</a><span style={{fontSize:8,fontWeight:700,padding:"1px 5px",borderRadius:3,background:pColor+"18",color:pColor,textTransform:"uppercase"}}>{priority}</span>{state&&state!=="Backlog"&&<span style={{fontSize:8,fontWeight:600,padding:"1px 5px",borderRadius:3,background:T.accentDim,color:T.accent}}>{state}</span>}</div>
        <div style={{display:"flex",alignItems:"center",gap:6}}>{tp!=null&&<span style={{fontSize:10,fontFamily:T.mono,fontWeight:700,color:T.accent}}>TP {tp}</span>}<button onClick={onMove} style={{background:"none",border:"none",cursor:"pointer",fontSize:14,color:T.text3,padding:"0 2px",lineHeight:1}} onMouseEnter={e=>e.target.style.color=source==="backlog"?T.green:T.red} onMouseLeave={e=>e.target.style.color=T.text3}>{source==="backlog"?"→":"←"}</button></div>
      </div>
      <div style={{fontSize:12,fontWeight:500,color:T.text0,lineHeight:1.4,marginBottom:7,cursor:"pointer"}} onClick={onToggle}>{issue.summary}</div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:4}}>
        <span style={{fontSize:10,fontFamily:T.mono,fontWeight:600,padding:"2px 7px",borderRadius:4,background:bc+"12",color:bc}}>{eLabel} <span style={{color:T.text3}}>Σ{efforts.total}</span></span>
        <div style={{display:"flex",gap:4}}>{assignee&&<span style={{fontSize:9,padding:"2px 6px",borderRadius:4,background:aOver?T.redDim:"rgba(255,255,255,0.04)",color:aOver?T.red:T.text2,border:aOver?"1px solid "+T.red+"33":"1px solid transparent"}}>● {assignee.fullName?.split(" ")[0]}</span>}{qa&&<span style={{fontSize:9,padding:"2px 6px",borderRadius:4,background:qOver?T.redDim:"rgba(255,255,255,0.04)",color:qOver?T.red:T.text2,border:qOver?"1px solid "+T.red+"33":"1px solid transparent"}}>◆ {qa.fullName?.split(" ")[0]}</span>}</div>
      </div>
      {expanded&&<div style={{marginTop:8,paddingTop:8,borderTop:"1px solid "+T.border,display:"flex",flexDirection:"column",gap:6,animation:"fadeIn .2s ease"}}>
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}><span style={{fontSize:10,color:T.text3,fontWeight:600,width:70}}>Assignee:</span><select value={assignee?.login||""} onChange={e=>onReassign(issue.idReadable,FIELDS.ASSIGNEE,e.target.value||null)} style={{flex:1,minWidth:140,padding:"4px 8px",borderRadius:5,border:"1px solid "+T.border,background:T.bg2,color:T.text1,fontSize:11,fontFamily:T.font}}><option value="">Unassigned</option>{allUsers.map(u=><option key={u.login} value={u.login}>{u.fullName}</option>)}</select></div>
        {hasQA&&<div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}><span style={{fontSize:10,color:T.text3,fontWeight:600,width:70}}>QA:</span><select value={qa?.login||""} onChange={e=>onReassign(issue.idReadable,FIELDS.QA,e.target.value||null)} style={{flex:1,minWidth:140,padding:"4px 8px",borderRadius:5,border:"1px solid "+T.border,background:T.bg2,color:T.text1,fontSize:11,fontFamily:T.font}}><option value="">No QA</option>{allUsers.filter(u=>(teamConfig||DEFAULT_CAPACITY).find(t=>t.login===u.login&&t.role==="qa")).map(u=><option key={u.login} value={u.login}>{u.fullName}</option>)}</select></div>}
        <div style={{fontSize:9,color:T.text3,fontFamily:T.mono,display:"flex",gap:12,marginTop:2}}><span>BV: {gNum(issue,FIELDS.BUSINESS_VALUE)||"—"}</span><span>Cat: {gEnum(issue,FIELDS.EXT_CATEGORY)||"—"}</span><span>Type: {gEnum(issue,FIELDS.TYPE)}</span></div>
      </div>}
    </div>
  );
}

function CB({m}){const T=useContext(ThemeCtx);const{fullName,role,capacity,tolerance,load,tasks,status}=m;const pct=Math.min((load/(capacity+tolerance))*100,100);const c=T.status[status];return(
  <div style={{padding:"8px 10px",background:status==="over"?T.redDim:"rgba(255,255,255,0.015)",borderRadius:8,border:"1px solid "+(status==="over"?T.red+"25":T.border)}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}><div style={{display:"flex",alignItems:"center",gap:5}}><span style={{fontSize:8,fontWeight:700,padding:"1px 5px",borderRadius:3,background:T.role[role]+"20",color:T.role[role]}}>{RL[role]}</span><span style={{fontSize:11,fontWeight:600,color:T.text1}}>{fullName?.split(" ")[0]}</span></div><div style={{display:"flex",alignItems:"baseline",gap:2}}><span style={{fontSize:15,fontWeight:800,color:c,fontFamily:T.mono}}>{load}</span><span style={{fontSize:9,color:T.text3}}>/{capacity}±{tolerance}</span></div></div>
    <div style={{height:4,background:T.bg0,borderRadius:2,overflow:"hidden"}}><div style={{height:"100%",width:pct+"%",borderRadius:2,background:"linear-gradient(90deg,"+c+"88,"+c+")",transition:"width .4s cubic-bezier(.4,0,.2,1)"}} /></div>
    {tasks.length>0&&<div style={{marginTop:4,display:"flex",gap:3,flexWrap:"wrap"}}>{tasks.map(t=>t.eff===0?<a key={t.id} href={`${__YT_BASE__}/issue/${t.id}`} target="_blank" rel="noreferrer" title="Не проставлен эффорт" style={{fontSize:8,color:T.red,background:T.redDim,padding:"0px 4px",borderRadius:2,fontFamily:T.mono,fontWeight:700,textDecoration:"none"}}>{t.id} ✕</a>:<a key={t.id} href={`${__YT_BASE__}/issue/${t.id}`} target="_blank" rel="noreferrer" style={{fontSize:8,color:T.text3,background:"rgba(255,255,255,0.03)",padding:"0px 4px",borderRadius:2,fontFamily:T.mono,textDecoration:"none"}} onMouseEnter={e=>e.target.style.color=T.accent} onMouseLeave={e=>e.target.style.color=T.text3}>{t.id}({t.eff})</a>)}</div>}
  </div>
);}

// ═══════════════════════════════════════════════════════════════════════════
// SPRINT SETTINGS
// ═══════════════════════════════════════════════════════════════════════════
function SprintSettings({sprintName,onSetSprintName,projectId,onSetProjectId,availableSprints,sprintField,onSetSprintField,projectFields,onLoadProjectFields}){
  const T=useContext(ThemeCtx);
  const[loading,setLoading]=useState(false);
  const inputStyle={padding:"6px 10px",borderRadius:5,border:"1px solid "+T.border,background:T.bg2,color:T.text0,fontSize:12,fontFamily:T.font,outline:"none",width:"100%"};
  const selectStyle={...inputStyle,fontFamily:T.mono,fontWeight:700,cursor:"pointer"};

  const handleLoadFields=async()=>{
    setLoading(true);
    await onLoadProjectFields(projectId);
    setLoading(false);
  };

  const generatedQuery=projectId&&sprintField&&sprintName?`project: ${projectId} ${sprintField}: ${sprintName}`:"";

  return(
    <div style={{marginBottom:28}}>
      <h2 style={{fontSize:18,fontWeight:800,color:T.text0,marginBottom:2}}>Настройки спринта</h2>
      <p style={{fontSize:11,color:T.text3,marginBottom:14}}>Укажите проект, выберите поле спринта и текущий спринт</p>

      {/* Step 1: Project prefix */}
      <div style={{padding:"12px 14px",borderRadius:8,background:T.bg1,border:"1px solid "+T.border,marginBottom:8,display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
        <span style={{fontSize:12,fontWeight:600,color:T.text2,minWidth:130,flexShrink:0}}>1. Префикс проекта</span>
        <input value={projectId} onChange={e=>onSetProjectId(e.target.value)} onKeyDown={e=>e.key==="Enter"&&projectId&&handleLoadFields()} placeholder="EXT" style={{...inputStyle,width:90,fontFamily:T.mono,fontWeight:700}} />
        <button onClick={handleLoadFields} disabled={!projectId||loading} style={{...btnS,background:T.accentDim,color:T.accent,padding:"6px 12px",opacity:projectId&&!loading?1:0.4}}>
          {loading?"Загружаю...":"Загрузить поля"}
        </button>
        {projectFields.length>0&&<span style={{fontSize:10,color:T.text3}}>{projectFields.length} полей загружено</span>}
      </div>

      {/* Step 2: Sprint field picker */}
      <div style={{padding:"12px 14px",borderRadius:8,background:T.bg1,border:"1px solid "+T.border,marginBottom:8,display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",opacity:projectFields.length>0?1:0.45}}>
        <span style={{fontSize:12,fontWeight:600,color:T.text2,minWidth:130,flexShrink:0}}>2. Поле спринта</span>
        {projectFields.length>0
          ?<select value={sprintField} onChange={e=>onSetSprintField(e.target.value)} style={{...selectStyle,width:220}}>
              {projectFields.map(f=><option key={f.name} value={f.name}>{f.name}</option>)}
            </select>
          :<input value={sprintField} onChange={e=>onSetSprintField(e.target.value)} placeholder="EXT Sprint" style={{...inputStyle,width:220,fontFamily:T.mono,fontWeight:700}} />}
        <span style={{fontSize:10,color:T.text3}}>поле типа multi-version (список спринтов)</span>
      </div>

      {/* Step 3: Active sprint picker */}
      <div style={{padding:"12px 14px",borderRadius:8,background:T.bg1,border:"1px solid "+T.border,marginBottom:8,display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",opacity:sprintField?1:0.45}}>
        <span style={{fontSize:12,fontWeight:600,color:T.text2,minWidth:130,flexShrink:0}}>3. Текущий спринт</span>
        {availableSprints.length>0
          ?<select value={sprintName} onChange={e=>onSetSprintName(e.target.value)} style={{...selectStyle,width:220}}>
              {availableSprints.map(s=><option key={s} value={s}>{s}</option>)}
            </select>
          :<input value={sprintName} onChange={e=>onSetSprintName(e.target.value)} placeholder="Sprint 25" style={{...inputStyle,width:220,fontFamily:T.mono,fontWeight:700}} />}
        {availableSprints.length>0&&<span style={{fontSize:10,color:T.text3}}>{availableSprints.length} значений</span>}
      </div>

      {/* Generated query preview */}
      {generatedQuery&&<div style={{padding:"8px 12px",borderRadius:6,background:T.bg0,border:"1px solid "+T.border,fontSize:10,color:T.text3,fontFamily:T.mono}}>
        Запрос спринта: <span style={{color:T.accent}}>{generatedQuery}</span>
      </div>}
      {!projectId&&<div style={{marginTop:6,fontSize:10,color:T.yellow}}>⚠ Заполните префикс проекта — задачи спринта не загружаются</div>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// QUERY MANAGER
// ═══════════════════════════════════════════════════════════════════════════
function QueryManager({queries,onSave,onDelete}){
  const T=useContext(ThemeCtx);
  const[editing,setEditing]=useState(null); // null | {id,name,query}
  const inputStyle={padding:"6px 10px",borderRadius:5,border:"1px solid "+T.border,background:T.bg2,color:T.text0,fontSize:12,fontFamily:T.font,outline:"none",width:"100%"};
  return(
    <div style={{marginBottom:28}}>
      <div style={{marginBottom:14}}>
        <h2 style={{fontSize:18,fontWeight:800,color:T.text0,marginBottom:2}}>Квери бэклога</h2>
        <p style={{fontSize:11,color:T.text3}}>Используется синтаксис YouTrack</p>
      </div>

      {/* Query list */}
      <div style={{display:"flex",flexDirection:"column",gap:6}}>
        {queries.map(q=>(
          <div key={q.id} style={{padding:"10px 14px",borderRadius:8,background:T.bg1,border:"1px solid "+T.border}}>
            {editing?.id===q.id?(
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                <input value={editing.name} onChange={e=>setEditing(p=>({...p,name:e.target.value}))} placeholder="Название" style={inputStyle} />
                <input value={editing.query} onChange={e=>setEditing(p=>({...p,query:e.target.value}))} placeholder="YouTrack query, напр: project: ED State: Backlog has: {Backend Effort}" style={{...inputStyle,fontFamily:T.mono,fontSize:11}} />
                <div style={{display:"flex",gap:6}}>
                  <button onClick={()=>{onSave(editing);setEditing(null)}} style={{...btnS,background:T.green,color:T.bg0}}>Сохранить</button>
                  <button onClick={()=>setEditing(null)} style={{...btnS,background:T.bg3,color:T.text2}}>Отмена</button>
                </div>
              </div>
            ):(
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:12,fontWeight:600,color:T.text0}}>{q.name}</div>
                  <div style={{fontSize:10,color:T.text3,fontFamily:T.mono,marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{q.query}</div>
                </div>
                <div style={{display:"flex",gap:4,flexShrink:0}}>
                  <button onClick={()=>setEditing({...q})} style={{...btnS,background:T.bg2,color:T.text2}}>Изменить</button>
                  {queries.length>1&&<button onClick={()=>onDelete(q.id)} style={{...btnS,background:T.redDim,color:T.red}}>Удалить</button>}
                </div>
              </div>
            )}
          </div>
        ))}
        <button onClick={()=>setEditing({id:null,name:"",query:"project: ED State: Backlog"})} style={{...btnS,background:T.accentDim,color:T.accent,alignSelf:"flex-start",padding:"6px 14px"}}>+ Добавить запрос</button>
      </div>
    </div>
  );
}

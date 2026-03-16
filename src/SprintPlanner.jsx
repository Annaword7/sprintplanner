import { useState, useMemo, useCallback, useEffect } from "react";

// ═══════════════════════════════════════════════════════════════════════════
// BACKEND
// ═══════════════════════════════════════════════════════════════════════════
const FIELDS = {
  STATE:"State",TYPE:"Type",PRIORITY:"Priority",EXT_SPRINT:"EXT Sprint",
  ASSIGNEE:"Assignee",QA:"QA",QA_PRIORITY:"QA Priority",EXT_CATEGORY:"EXT Category",
  BACKEND_EFFORT:"Backend Effort",FRONTEND_EFFORT:"Frontend Effort",
  QA_EFFORT:"QA Effort",DESIGN_EFFORT:"Design Effort",
  MANAGER_EFFORT:"Manager effort",TOTAL_PRIORITY:"Total Priority",
  BUSINESS_VALUE:"Business Value",REOPEN_COUNTER:"• Reopen counter",PERCENT_DONE:"% Done",
};
const USERS = [
  {id:"1-1",login:"alex.kuznetsov",fullName:"Алексей Кузнецов",$type:"User"},
  {id:"1-2",login:"maria.sokolova",fullName:"Мария Соколова",$type:"User"},
  {id:"1-3",login:"dmitry.volkov",fullName:"Дмитрий Волков",$type:"User"},
  {id:"1-4",login:"elena.petrova",fullName:"Елена Петрова",$type:"User"},
  {id:"1-5",login:"ivan.novikov",fullName:"Иван Новиков",$type:"User"},
  {id:"1-6",login:"olga.nikitina",fullName:"Ольга Никитина",$type:"User"},
  {id:"1-7",login:"igor.tarasov",fullName:"Игорь Тарасов",$type:"User"},
  {id:"1-8",login:"anna.fedorova",fullName:"Анна Фёдорова",$type:"User"},
  {id:"1-9",login:"sergey.morozov",fullName:"Сергей Морозов",$type:"User"},
  {id:"1-10",login:"natalia.kozlova",fullName:"Наталья Козлова",$type:"User"},
];
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

const sf=(n,v,r=false)=>({name:n,$type:"StateIssueCustomField",value:v?{name:v,isResolved:r,$type:"StateBundleElement"}:null});
const ef=(n,v)=>({name:n,$type:"SingleEnumIssueCustomField",value:v?{name:v,$type:"EnumBundleElement"}:null});
const mvf=(n,vs)=>({name:n,$type:"MultiVersionIssueCustomField",value:vs.map(v=>({name:v,$type:"VersionBundleElement"}))});
const uf=(n,login)=>{const u=USERS.find(x=>x.login===login);return{name:n,$type:"SingleUserIssueCustomField",value:u||null}};
const nf=(n,v)=>({name:n,$type:"SimpleIssueCustomField",value:v??null});

const INITIAL_ISSUES = [
  {id:"2-1001",idReadable:"ED-101",summary:"Интеграция платёжного шлюза Stripe для новых рынков",customFields:[sf("State","Backlog"),ef("Type","Feature"),ef("Priority","Critical"),mvf("EXT Sprint",[]),uf("Assignee","alex.kuznetsov"),uf("QA","olga.nikitina"),ef("QA Priority","1 Critical"),ef("EXT Category","Development"),nf("Backend Effort",8),nf("Frontend Effort",null),nf("QA Effort",5),nf("Design Effort",null),nf("Manager effort",null),nf("Total Priority",9.2),nf("Business Value",34),nf("• Reopen counter",0)]},
  {id:"2-1002",idReadable:"ED-102",summary:"Редизайн карточки отеля — мобильная версия",customFields:[sf("State","Backlog"),ef("Type","Feature"),ef("Priority","Major"),mvf("EXT Sprint",[]),uf("Assignee","dmitry.volkov"),uf("QA","olga.nikitina"),ef("QA Priority","2 High"),ef("EXT Category","Development"),nf("Backend Effort",null),nf("Frontend Effort",5),nf("QA Effort",3),nf("Design Effort",3),nf("Manager effort",null),nf("Total Priority",7.8),nf("Business Value",21),nf("• Reopen counter",0)]},
  {id:"2-1003",idReadable:"ED-103",summary:"API авиабилетов: кеширование ответов партнёра",customFields:[sf("State","Backlog"),ef("Type","Task"),ef("Priority","Major"),mvf("EXT Sprint",[]),uf("Assignee","maria.sokolova"),uf("QA","igor.tarasov"),ef("QA Priority","2 High"),ef("EXT Category","Development"),nf("Backend Effort",5),nf("Frontend Effort",null),nf("QA Effort",3),nf("Design Effort",null),nf("Manager effort",null),nf("Total Priority",7.5),nf("Business Value",18),nf("• Reopen counter",0)]},
  {id:"2-1004",idReadable:"ED-104",summary:"Расширенные фильтры поиска туров",customFields:[sf("State","Backlog"),ef("Type","Feature"),ef("Priority","Normal"),mvf("EXT Sprint",[]),uf("Assignee","elena.petrova"),uf("QA","igor.tarasov"),ef("QA Priority","3 Medium"),ef("EXT Category","Development"),nf("Backend Effort",null),nf("Frontend Effort",8),nf("QA Effort",5),nf("Design Effort",2),nf("Manager effort",null),nf("Total Priority",5.4),nf("Business Value",13),nf("• Reopen counter",0)]},
  {id:"2-1005",idReadable:"ED-105",summary:"Подготовка квартального отчёта для партнёров",customFields:[sf("State","Backlog"),ef("Type","Task"),ef("Priority","Normal"),mvf("EXT Sprint",[]),uf("Assignee","anna.fedorova"),uf("QA",null),ef("QA Priority","5 No QA"),ef("EXT Category","Support"),nf("Backend Effort",null),nf("Frontend Effort",null),nf("QA Effort",null),nf("Design Effort",null),nf("Manager effort",4),nf("Total Priority",5.0),nf("Business Value",10),nf("• Reopen counter",0)]},
  {id:"2-1006",idReadable:"ED-106",summary:"Миграция БД бронирований на новый кластер",customFields:[sf("State","Backlog"),ef("Type","Task"),ef("Priority","Critical"),mvf("EXT Sprint",[]),uf("Assignee","alex.kuznetsov"),uf("QA","natalia.kozlova"),ef("QA Priority","1 Critical"),ef("EXT Category","Infrastructure"),nf("Backend Effort",13),nf("Frontend Effort",null),nf("QA Effort",5),nf("Design Effort",null),nf("Manager effort",null),nf("Total Priority",8.9),nf("Business Value",29),nf("• Reopen counter",0)]},
  {id:"2-1007",idReadable:"ED-107",summary:"Мобильная версия чекаута — адаптивная вёрстка",customFields:[sf("State","Backlog"),ef("Type","Feature"),ef("Priority","Major"),mvf("EXT Sprint",[]),uf("Assignee","dmitry.volkov"),uf("QA","olga.nikitina"),ef("QA Priority","2 High"),ef("EXT Category","Development"),nf("Backend Effort",null),nf("Frontend Effort",8),nf("QA Effort",3),nf("Design Effort",2),nf("Manager effort",null),nf("Total Priority",7.1),nf("Business Value",20),nf("• Reopen counter",0)]},
  {id:"2-1008",idReadable:"ED-108",summary:"Логирование ошибок через Sentry",customFields:[sf("State","Backlog"),ef("Type","Task"),ef("Priority","Minor"),mvf("EXT Sprint",[]),uf("Assignee","maria.sokolova"),uf("QA","olga.nikitina"),ef("QA Priority","4 Low"),ef("EXT Category","Infrastructure"),nf("Backend Effort",3),nf("Frontend Effort",null),nf("QA Effort",2),nf("Design Effort",null),nf("Manager effort",null),nf("Total Priority",2.1),nf("Business Value",5),nf("• Reopen counter",0)]},
  {id:"2-1009",idReadable:"ED-109",summary:"Координация интеграции с авиа-партнёром SmartWings",customFields:[sf("State","Backlog"),ef("Type","Task"),ef("Priority","Major"),mvf("EXT Sprint",[]),uf("Assignee","anna.fedorova"),uf("QA",null),ef("QA Priority","5 No QA"),ef("EXT Category","Support"),nf("Backend Effort",null),nf("Frontend Effort",null),nf("QA Effort",null),nf("Design Effort",null),nf("Manager effort",6),nf("Total Priority",6.3),nf("Business Value",15),nf("• Reopen counter",0)]},
  {id:"2-1010",idReadable:"ED-110",summary:"Push-уведомления о статусе бронирования",customFields:[sf("State","Backlog"),ef("Type","Feature"),ef("Priority","Normal"),mvf("EXT Sprint",[]),uf("Assignee","sergey.morozov"),uf("QA","natalia.kozlova"),ef("QA Priority","3 Medium"),ef("EXT Category","Development"),nf("Backend Effort",5),nf("Frontend Effort",3),nf("QA Effort",3),nf("Design Effort",null),nf("Manager effort",null),nf("Total Priority",4.8),nf("Business Value",12),nf("• Reopen counter",0)]},
  {id:"2-1011",idReadable:"ED-111",summary:"Страница программы лояльности клиентов",customFields:[sf("State","Backlog"),ef("Type","Feature"),ef("Priority","Normal"),mvf("EXT Sprint",[]),uf("Assignee","elena.petrova"),uf("QA","olga.nikitina"),ef("QA Priority","3 Medium"),ef("EXT Category","Development"),nf("Backend Effort",null),nf("Frontend Effort",6),nf("QA Effort",4),nf("Design Effort",3),nf("Manager effort",null),nf("Total Priority",4.5),nf("Business Value",14),nf("• Reopen counter",0)]},
  {id:"2-1012",idReadable:"ED-112",summary:"Оптимизация SQL-запросов к базе бронирований",customFields:[sf("State","Backlog"),ef("Type","Task"),ef("Priority","Minor"),mvf("EXT Sprint",[]),uf("Assignee","maria.sokolova"),uf("QA","igor.tarasov"),ef("QA Priority","4 Low"),ef("EXT Category","Infrastructure"),nf("Backend Effort",5),nf("Frontend Effort",null),nf("QA Effort",2),nf("Design Effort",null),nf("Manager effort",null),nf("Total Priority",2.8),nf("Business Value",8),nf("• Reopen counter",0)]},
  {id:"2-1013",idReadable:"ED-113",summary:"Онбординг нового партнёра — TUI Hotels",customFields:[sf("State","Backlog"),ef("Type","Task"),ef("Priority","Normal"),mvf("EXT Sprint",[]),uf("Assignee","anna.fedorova"),uf("QA",null),ef("QA Priority","5 No QA"),ef("EXT Category","Support"),nf("Backend Effort",null),nf("Frontend Effort",null),nf("QA Effort",null),nf("Design Effort",null),nf("Manager effort",3),nf("Total Priority",3.7),nf("Business Value",9),nf("• Reopen counter",0)]},
  {id:"2-1014",idReadable:"ED-114",summary:"SSO авторизация через Google OAuth",customFields:[sf("State","Backlog"),ef("Type","Feature"),ef("Priority","Major"),mvf("EXT Sprint",[]),uf("Assignee","sergey.morozov"),uf("QA","igor.tarasov"),ef("QA Priority","2 High"),ef("EXT Category","Development"),nf("Backend Effort",5),nf("Frontend Effort",3),nf("QA Effort",3),nf("Design Effort",null),nf("Manager effort",null),nf("Total Priority",6.7),nf("Business Value",16),nf("• Reopen counter",0)]},
  {id:"2-1015",idReadable:"ED-115",summary:"Виджет сравнения цен на странице поиска",customFields:[sf("State","Backlog"),ef("Type","Feature"),ef("Priority","Normal"),mvf("EXT Sprint",[]),uf("Assignee","dmitry.volkov"),uf("QA","natalia.kozlova"),ef("QA Priority","3 Medium"),ef("EXT Category","Development"),nf("Backend Effort",null),nf("Frontend Effort",5),nf("QA Effort",3),nf("Design Effort",2),nf("Manager effort",null),nf("Total Priority",4.2),nf("Business Value",11),nf("• Reopen counter",0)]},
  {id:"2-1016",idReadable:"ED-116",summary:"Дизайн-система: обновление UI-kit до v3",customFields:[sf("State","Backlog"),ef("Type","Task"),ef("Priority","Normal"),mvf("EXT Sprint",[]),uf("Assignee","ivan.novikov"),uf("QA",null),ef("QA Priority","5 No QA"),ef("EXT Category","Design"),nf("Backend Effort",null),nf("Frontend Effort",null),nf("QA Effort",null),nf("Design Effort",8),nf("Manager effort",null),nf("Total Priority",4.0),nf("Business Value",10),nf("• Reopen counter",0)]},
  {id:"2-1017",idReadable:"ED-117",summary:"Прототипы экранов бронирования трансфера",customFields:[sf("State","Backlog"),ef("Type","Task"),ef("Priority","Major"),mvf("EXT Sprint",[]),uf("Assignee","ivan.novikov"),uf("QA",null),ef("QA Priority","5 No QA"),ef("EXT Category","Design"),nf("Backend Effort",null),nf("Frontend Effort",null),nf("QA Effort",null),nf("Design Effort",5),nf("Manager effort",null),nf("Total Priority",5.6),nf("Business Value",13),nf("• Reopen counter",0)]},
  // Already in Sprint 25
  {id:"2-1050",idReadable:"ED-050",summary:"Рефакторинг сервиса поиска — микросервисы",customFields:[sf("State","In Progress"),ef("Type","Task"),ef("Priority","Critical"),mvf("EXT Sprint",["Sprint 25"]),uf("Assignee","alex.kuznetsov"),uf("QA","igor.tarasov"),ef("QA Priority","1 Critical"),ef("EXT Category","Development"),nf("Backend Effort",8),nf("Frontend Effort",null),nf("QA Effort",5),nf("Design Effort",null),nf("Manager effort",null),nf("Total Priority",8.5),nf("Business Value",25),nf("• Reopen counter",1)]},
  {id:"2-1051",idReadable:"ED-051",summary:"Форма обратной связи — фронтенд + валидация",customFields:[sf("State","In Progress"),ef("Type","Feature"),ef("Priority","Normal"),mvf("EXT Sprint",["Sprint 25"]),uf("Assignee","elena.petrova"),uf("QA","natalia.kozlova"),ef("QA Priority","3 Medium"),ef("EXT Category","Development"),nf("Backend Effort",null),nf("Frontend Effort",5),nf("QA Effort",3),nf("Design Effort",null),nf("Manager effort",null),nf("Total Priority",4.1),nf("Business Value",8),nf("• Reopen counter",0)]},
  {id:"2-1052",idReadable:"ED-052",summary:"Согласование SLA с платёжным провайдером",customFields:[sf("State","Open"),ef("Type","Task"),ef("Priority","Major"),mvf("EXT Sprint",["Sprint 25"]),uf("Assignee","anna.fedorova"),uf("QA",null),ef("QA Priority","5 No QA"),ef("EXT Category","Support"),nf("Backend Effort",null),nf("Frontend Effort",null),nf("QA Effort",null),nf("Design Effort",null),nf("Manager effort",5),nf("Total Priority",6.0),nf("Business Value",14),nf("• Reopen counter",0)]},
];

// Pre-baked historical snapshots (older sprints already closed)
const SEED_SNAPSHOTS = {
  "Sprint 22":{start:{timestamp:1706745600000,issues:[{id:"S22-1",state:"Open",efforts:{be:5,fe:3,qa:4,des:0,mgr:0,total:12}},{id:"S22-2",state:"Open",efforts:{be:8,fe:0,qa:5,des:0,mgr:0,total:13}},{id:"S22-3",state:"Open",efforts:{be:0,fe:5,qa:3,des:2,mgr:0,total:10}},{id:"S22-4",state:"Open",efforts:{be:3,fe:0,qa:2,des:0,mgr:0,total:5}},{id:"S22-5",state:"Open",efforts:{be:0,fe:0,qa:0,des:0,mgr:4,total:4}},{id:"S22-6",state:"Open",efforts:{be:5,fe:0,qa:3,des:0,mgr:0,total:8}},{id:"S22-7",state:"Open",efforts:{be:0,fe:6,qa:3,des:0,mgr:0,total:9}},{id:"S22-8",state:"Open",efforts:{be:0,fe:0,qa:0,des:4,mgr:0,total:4}},{id:"S22-9",state:"Open",efforts:{be:5,fe:3,qa:3,des:0,mgr:0,total:11}},{id:"S22-10",state:"Open",efforts:{be:3,fe:0,qa:2,des:0,mgr:0,total:5}},{id:"S22-11",state:"Open",efforts:{be:5,fe:5,qa:4,des:0,mgr:0,total:14}},{id:"S22-12",state:"Open",efforts:{be:0,fe:0,qa:0,des:0,mgr:4,total:4}},{id:"S22-13",state:"Open",efforts:{be:4,fe:0,qa:3,des:0,mgr:0,total:7}},{id:"S22-14",state:"Open",efforts:{be:0,fe:0,qa:0,des:0,mgr:3,total:3}}]},end:{timestamp:1707955200000,issues:[{id:"S22-1",state:"Done",reopens:0},{id:"S22-2",state:"Done",reopens:1},{id:"S22-3",state:"Done",reopens:0},{id:"S22-4",state:"Done",reopens:0},{id:"S22-5",state:"Done",reopens:0},{id:"S22-6",state:"Done",reopens:1},{id:"S22-7",state:"Done",reopens:0},{id:"S22-8",state:"Done",reopens:0},{id:"S22-9",state:"In Progress",reopens:0},{id:"S22-10",state:"Done",reopens:0},{id:"S22-11",state:"Open",reopens:0},{id:"S22-12",state:"Done",reopens:0},{id:"S22-13",state:"Done",reopens:0},{id:"S22-14",state:"In Progress",reopens:0}]}},
  "Sprint 23":{start:{timestamp:1707955200000,issues:[{id:"S23-1",state:"Open",efforts:{be:5,fe:0,qa:3,des:0,mgr:0,total:8}},{id:"S23-2",state:"Open",efforts:{be:0,fe:5,qa:3,des:2,mgr:0,total:10}},{id:"S23-3",state:"Open",efforts:{be:8,fe:0,qa:5,des:0,mgr:0,total:13}},{id:"S23-4",state:"Open",efforts:{be:0,fe:0,qa:0,des:0,mgr:5,total:5}},{id:"S23-5",state:"Open",efforts:{be:3,fe:0,qa:2,des:0,mgr:0,total:5}},{id:"S23-6",state:"Open",efforts:{be:0,fe:5,qa:3,des:0,mgr:0,total:8}},{id:"S23-7",state:"Open",efforts:{be:5,fe:3,qa:3,des:0,mgr:0,total:11}},{id:"S23-8",state:"Open",efforts:{be:0,fe:0,qa:0,des:4,mgr:0,total:4}},{id:"S23-9",state:"Open",efforts:{be:5,fe:0,qa:3,des:0,mgr:0,total:8}},{id:"S23-10",state:"Open",efforts:{be:3,fe:5,qa:4,des:0,mgr:0,total:12}},{id:"S23-11",state:"Open",efforts:{be:3,fe:0,qa:2,des:0,mgr:0,total:5}},{id:"S23-12",state:"Open",efforts:{be:0,fe:0,qa:0,des:0,mgr:3,total:3}}]},end:{timestamp:1709164800000,issues:[{id:"S23-1",state:"Done",reopens:0},{id:"S23-2",state:"Done",reopens:0},{id:"S23-3",state:"Done",reopens:1},{id:"S23-4",state:"Done",reopens:0},{id:"S23-5",state:"Done",reopens:0},{id:"S23-6",state:"Done",reopens:0},{id:"S23-7",state:"In Progress",reopens:0},{id:"S23-8",state:"Done",reopens:0},{id:"S23-9",state:"Done",reopens:0},{id:"S23-10",state:"Done",reopens:0},{id:"S23-11",state:"Done",reopens:0},{id:"S23-12",state:"Open",reopens:0}]}},
  "Sprint 24":{start:{timestamp:1709164800000,issues:[{id:"S24-1",state:"Open",efforts:{be:8,fe:0,qa:5,des:0,mgr:0,total:13}},{id:"S24-2",state:"Open",efforts:{be:0,fe:8,qa:5,des:2,mgr:0,total:15}},{id:"S24-3",state:"Open",efforts:{be:5,fe:0,qa:3,des:0,mgr:0,total:8}},{id:"S24-4",state:"Open",efforts:{be:0,fe:5,qa:3,des:0,mgr:0,total:8}},{id:"S24-5",state:"Open",efforts:{be:0,fe:0,qa:0,des:0,mgr:5,total:5}},{id:"S24-6",state:"Open",efforts:{be:5,fe:3,qa:3,des:0,mgr:0,total:11}},{id:"S24-7",state:"Open",efforts:{be:3,fe:0,qa:2,des:0,mgr:0,total:5}},{id:"S24-8",state:"Open",efforts:{be:0,fe:5,qa:3,des:3,mgr:0,total:11}},{id:"S24-9",state:"Open",efforts:{be:5,fe:0,qa:3,des:0,mgr:0,total:8}},{id:"S24-10",state:"Open",efforts:{be:0,fe:0,qa:0,des:3,mgr:0,total:3}},{id:"S24-11",state:"Open",efforts:{be:5,fe:5,qa:4,des:0,mgr:0,total:14}},{id:"S24-12",state:"Open",efforts:{be:0,fe:0,qa:0,des:0,mgr:4,total:4}},{id:"S24-13",state:"Open",efforts:{be:5,fe:0,qa:3,des:0,mgr:0,total:8}},{id:"S24-14",state:"Open",efforts:{be:4,fe:0,qa:2,des:0,mgr:0,total:6}},{id:"S24-15",state:"Open",efforts:{be:0,fe:2,qa:1,des:0,mgr:0,total:3}}]},end:{timestamp:1710374400000,issues:[{id:"S24-1",state:"Done",reopens:1},{id:"S24-2",state:"Done",reopens:0},{id:"S24-3",state:"Done",reopens:0},{id:"S24-4",state:"Done",reopens:1},{id:"S24-5",state:"Done",reopens:0},{id:"S24-6",state:"In Progress",reopens:0},{id:"S24-7",state:"Done",reopens:0},{id:"S24-8",state:"Done",reopens:1},{id:"S24-9",state:"Done",reopens:0},{id:"S24-10",state:"Done",reopens:0},{id:"S24-11",state:"Open",reopens:0},{id:"S24-12",state:"Done",reopens:0},{id:"S24-13",state:"In Progress",reopens:0},{id:"S24-14",state:"Done",reopens:0},{id:"S24-15",state:"Done",reopens:0}]}},
};

const RESOLVED_STATES = ["Done","Fixed","Verified"];

// ── Field extractors ─────────────────────────────────────────────────────
const gf=(i,n)=>i.customFields?.find(f=>f.name===n)?.value??null;
const gEnum=(i,n)=>gf(i,n)?.name??null;
const gUser=(i,n)=>gf(i,n);
const gNum=(i,n)=>gf(i,n);
const gSprints=(i)=>{const v=gf(i,FIELDS.EXT_SPRINT);return Array.isArray(v)?v.map(x=>x.name):[]};
const getEfforts=(i)=>{const b=gNum(i,FIELDS.BACKEND_EFFORT)||0,f=gNum(i,FIELDS.FRONTEND_EFFORT)||0,q=gNum(i,FIELDS.QA_EFFORT)||0,d=gNum(i,FIELDS.DESIGN_EFFORT)||0,m=gNum(i,FIELDS.MANAGER_EFFORT)||0;return{be:b,fe:f,qa:q,des:d,mgr:m,total:b+f+q+d+m}};
const effortLabel=(i)=>{const e=getEfforts(i);const p=[];if(e.be)p.push("BE "+e.be);if(e.fe)p.push("FE "+e.fe);if(e.des)p.push("DES "+e.des);if(e.qa)p.push("QA "+e.qa);if(e.mgr)p.push("MGR "+e.mgr);return p.join(" + ")||"—"};
const effortForRole=(e,r)=>({backend:e.be,frontend:e.fe,design:e.des,manager:e.mgr,qa:e.qa}[r]||0);

// ── Storage ──────────────────────────────────────────────────────────────
const STORAGE_CAP="ed-team-capacity";
const STORAGE_SNAP="ed-sprint-snapshots";
async function sGet(k){try{const v=localStorage.getItem(k);if(v)return JSON.parse(v)}catch(e){}return null}
async function sSet(k,v){try{localStorage.setItem(k,v);return true}catch(e){return false}}

// ── Snapshot helpers ─────────────────────────────────────────────────────
function createSnapshot(sprintIssues) {
  return {
    timestamp: Date.now(),
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

  if (!snapData.end) {
    return { sprintName, planned: startCount, plannedEffort: startEffort, completed: null, reopened: null, carryOver: null, completionRate: null, added: null, removed: null, status: "active" };
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
    sprintName, planned: startCount, plannedEffort: startEffort,
    completed, reopened: totalReopens, carryOver,
    completionRate: startCount > 0 ? Math.round((completed / startCount) * 100) : 0,
    added, removed, status: "closed",
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// DESIGN TOKENS
// ═══════════════════════════════════════════════════════════════════════════
const T={bg0:"#080816",bg1:"#0e0e22",bg2:"#151530",bg3:"#1c1c3a",border:"rgba(255,255,255,0.05)",borderHover:"rgba(255,255,255,0.12)",text0:"#f0f0f8",text1:"#c8c8da",text2:"#8a8aaa",text3:"#5a5a78",accent:"#4ecdc4",accentDim:"rgba(78,205,196,0.12)",red:"#ff4757",redDim:"rgba(255,71,87,0.1)",yellow:"#ffd43b",yellowDim:"rgba(255,212,59,0.1)",green:"#26de81",greenDim:"rgba(38,222,129,0.1)",blue:"#4b7bec",blueDim:"rgba(75,123,236,0.1)",priority:{Critical:"#ff4757",Major:"#ffa502",Normal:"#8a8aaa",Minor:"#5a5a78"},role:{backend:"#ff4757",frontend:"#4b7bec",qa:"#ffd43b",design:"#a55eea",manager:"#ffa502"},status:{over:"#ff4757",optimal:"#26de81",under:"#ffd43b",empty:"#2a2a4a"},font:"'Onest','SF Pro Display',system-ui,sans-serif",mono:"'JetBrains Mono','SF Mono',monospace"};
const RL={backend:"BE",frontend:"FE",qa:"QA",design:"DES",manager:"MGR"};
const ROLES=["backend","frontend","qa","design","manager"];

// ═══════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════
export default function SprintPlanner(){
  const[issues,setIssues]=useState(structuredClone(INITIAL_ISSUES));
  const[tab,setTab]=useState("planner");
  const[sortBy,setSortBy]=useState("totalPriority");
  const[filterRole,setFilterRole]=useState("all");
  const[search,setSearch]=useState("");
  const[dragId,setDragId]=useState(null);
  const[dropZone,setDropZone]=useState(null);
  const[sprintName]=useState("Sprint 25");
  const[expandedCard,setExpandedCard]=useState(null);
  const[teamConfig,setTeamConfig]=useState(DEFAULT_CAPACITY);
  const[storageLoaded,setStorageLoaded]=useState(false);
  const[saveStatus,setSaveStatus]=useState(null);
  const[snapshots,setSnapshots]=useState(SEED_SNAPSHOTS);
  const[snapAction,setSnapAction]=useState(null); // null|"confirm-start"|"confirm-end"|"saving"|"saved"

  // Load from storage
  useEffect(()=>{
    Promise.all([sGet(STORAGE_CAP),sGet(STORAGE_SNAP)]).then(([cap,snaps])=>{
      if(cap&&Array.isArray(cap)&&cap.length>0)setTeamConfig(cap);
      if(snaps&&typeof snaps==="object"){setSnapshots(prev=>({...prev,...snaps}))}
      setStorageLoaded(true);
    });
  },[]);

  // Derived
  const discoveredMembers=useMemo(()=>{const seen=new Set();const ms=[];issues.forEach(i=>{[FIELDS.ASSIGNEE,FIELDS.QA].forEach(f=>{const u=gUser(i,f);if(u?.login&&!seen.has(u.login)){seen.add(u.login);ms.push({login:u.login,fullName:u.fullName})}})});return ms.sort((a,b)=>a.fullName.localeCompare(b.fullName))},[issues]);
  const mergedConfig=useMemo(()=>discoveredMembers.map(m=>{const s=teamConfig.find(c=>c.login===m.login);return s?{...s,fullName:m.fullName}:{login:m.login,fullName:m.fullName,role:"backend",capacity:20,tolerance:2}}),[discoveredMembers,teamConfig]);

  const backlog=useMemo(()=>{let items=issues.filter(i=>gEnum(i,FIELDS.STATE)==="Backlog"&&gSprints(i).length===0);if(filterRole!=="all")items=items.filter(i=>{const e=getEfforts(i);return({backend:e.be,frontend:e.fe,qa:e.qa,design:e.des,manager:e.mgr}[filterRole]||0)>0});if(search){const q=search.toLowerCase();items=items.filter(i=>i.summary.toLowerCase().includes(q)||i.idReadable.toLowerCase().includes(q))}const sorts={totalPriority:(a,b)=>(gNum(b,FIELDS.TOTAL_PRIORITY)||0)-(gNum(a,FIELDS.TOTAL_PRIORITY)||0),effort:(a,b)=>getEfforts(b).total-getEfforts(a).total,businessValue:(a,b)=>(gNum(b,FIELDS.BUSINESS_VALUE)||0)-(gNum(a,FIELDS.BUSINESS_VALUE)||0),priority:(a,b)=>{const o={Critical:4,Major:3,Normal:2,Minor:1};return(o[gEnum(b,FIELDS.PRIORITY)]||0)-(o[gEnum(a,FIELDS.PRIORITY)]||0)}};items.sort(sorts[sortBy]||sorts.totalPriority);return items},[issues,sortBy,filterRole,search]);

  const sprint=useMemo(()=>issues.filter(i=>gSprints(i).includes(sprintName)),[issues,sprintName]);
  const sprintTotals=useMemo(()=>{const t={be:0,fe:0,qa:0,des:0,mgr:0,total:0};sprint.forEach(i=>{const e=getEfforts(i);t.be+=e.be;t.fe+=e.fe;t.qa+=e.qa;t.des+=e.des;t.mgr+=e.mgr;t.total+=e.total});return t},[sprint]);

  const capacity=useMemo(()=>{const map={};mergedConfig.forEach(m=>{map[m.login]={...m,load:0,tasks:[]}});sprint.forEach(issue=>{const efforts=getEfforts(issue);const aL=gUser(issue,FIELDS.ASSIGNEE)?.login;const qL=gUser(issue,FIELDS.QA)?.login;if(aL&&map[aL]){const eff=effortForRole(efforts,map[aL].role);if(eff>0){map[aL].load+=eff;map[aL].tasks.push({id:issue.idReadable,eff})}}if(qL&&map[qL]&&efforts.qa>0){map[qL].load+=efforts.qa;map[qL].tasks.push({id:issue.idReadable,eff:efforts.qa})}});Object.values(map).forEach(m=>{if(m.load>m.capacity+m.tolerance)m.status="over";else if(m.load>=m.capacity-m.tolerance)m.status="optimal";else if(m.load>=m.capacity*0.4)m.status="under";else m.status="empty"});return Object.values(map)},[sprint,mergedConfig]);

  const currentSnap = snapshots[sprintName] || null;
  const hasStart = !!currentSnap?.start;
  const hasEnd = !!currentSnap?.end;

  // Actions
  const moveToSprint=useCallback(id=>{setIssues(prev=>prev.map(i=>{if(i.idReadable!==id)return i;const n=structuredClone(i);const sp=n.customFields.find(f=>f.name===FIELDS.EXT_SPRINT);if(sp)sp.value=[...(sp.value||[]),{name:sprintName,$type:"VersionBundleElement"}];const st=n.customFields.find(f=>f.name===FIELDS.STATE);if(st?.value?.name==="Backlog")st.value={name:"Open",isResolved:false,$type:"StateBundleElement"};return n}))},[sprintName]);
  const moveToBacklog=useCallback(id=>{setIssues(prev=>prev.map(i=>{if(i.idReadable!==id)return i;const n=structuredClone(i);const sp=n.customFields.find(f=>f.name===FIELDS.EXT_SPRINT);if(sp)sp.value=(sp.value||[]).filter(v=>v.name!==sprintName);const st=n.customFields.find(f=>f.name===FIELDS.STATE);if(st&&!st.value?.isResolved)st.value={name:"Backlog",isResolved:false,$type:"StateBundleElement"};return n}))},[sprintName]);
  const reassign=useCallback((id,field,login)=>{setIssues(prev=>prev.map(i=>{if(i.idReadable!==id)return i;const n=structuredClone(i);const f=n.customFields.find(x=>x.name===field);if(f)f.value=login?USERS.find(u=>u.login===login)||null:null;return n}))},[]);
  const onDragStart=id=>setDragId(id);const onDragEnd=()=>{setDragId(null);setDropZone(null)};
  const onDropSprint=()=>{if(dragId){const s=issues.find(i=>i.idReadable===dragId);if(s&&!gSprints(s).includes(sprintName))moveToSprint(dragId)}setDragId(null);setDropZone(null)};
  const onDropBacklog=()=>{if(dragId){const s=issues.find(i=>i.idReadable===dragId);if(s&&gSprints(s).includes(sprintName))moveToBacklog(dragId)}setDragId(null);setDropZone(null)};

  // Snapshot actions
  const handleSnapshot = useCallback(async(type)=>{
    setSnapAction("saving");
    const snap = createSnapshot(sprint);
    const updated = {...snapshots, [sprintName]: {...(snapshots[sprintName]||{}), [type]:snap}};
    setSnapshots(updated);
    // Only save user-created snapshots (not seeds) — save all to be safe
    await sSet(STORAGE_SNAP, updated);
    setSnapAction("saved");
    setTimeout(()=>setSnapAction(null),2000);
  },[sprint,sprintName,snapshots]);

  // Settings
  const updateMember=useCallback((login,key,value)=>{setTeamConfig(prev=>{const ex=prev.find(m=>m.login===login);if(ex)return prev.map(m=>m.login===login?{...m,[key]:value}:m);return[...prev,{login,role:"backend",capacity:20,tolerance:2,[key]:value}]})},[]);
  const handleSaveCap=useCallback(async()=>{setSaveStatus("saving");const ok=await sSet(STORAGE_CAP,teamConfig);setSaveStatus(ok?"saved":"error");setTimeout(()=>setSaveStatus(null),2000)},[teamConfig]);

  // All metrics from snapshots
  const allMetrics = useMemo(()=>{
    const results=[];
    const sprintOrder=["Sprint 22","Sprint 23","Sprint 24","Sprint 25","Sprint 26"];
    sprintOrder.forEach(name=>{
      const sd=snapshots[name];
      if(sd){const m=computeMetrics(name,sd);if(m)results.push(m)}
    });
    return results;
  },[snapshots]);

  return(
    <div style={{minHeight:"100vh",background:T.bg0,color:T.text1,fontFamily:T.font}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Onest:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&display=swap');*{box-sizing:border-box;margin:0;padding:0}::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:${T.bg3};border-radius:2px}@keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}.card-enter{animation:fadeIn .25s ease-out both}input[type=number]{-moz-appearance:textfield}input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none}`}</style>

      {/* Header */}
      <div style={{padding:"12px 24px",borderBottom:"1px solid "+T.border,display:"flex",justifyContent:"space-between",alignItems:"center",background:T.bg1,position:"sticky",top:0,zIndex:20}}>
        <div style={{display:"flex",alignItems:"center",gap:14}}>
          <div style={{width:30,height:30,borderRadius:8,background:"linear-gradient(135deg,"+T.accent+","+T.blue+")",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:800,color:T.bg0}}>ED</div>
          <div><div style={{fontSize:15,fontWeight:700,color:T.text0}}>Sprint Planner</div><div style={{fontSize:10,color:T.text3,fontFamily:T.mono}}>Extranet Delivery · YouTrack</div></div>
          <div style={{padding:"3px 10px",borderRadius:6,background:T.accentDim,color:T.accent,fontSize:10,fontWeight:600}}>MOCK</div>
        </div>
        <div style={{display:"flex",gap:2,background:T.bg2,borderRadius:8,padding:2}}>
          {[{id:"planner",label:"Планирование"},{id:"metrics",label:"Метрики"},{id:"settings",label:"⚙ Настройки"}].map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} style={{padding:"6px 16px",borderRadius:6,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,background:tab===t.id?T.bg3:"transparent",color:tab===t.id?T.text0:T.text3}}>{t.label}</button>
          ))}
        </div>
      </div>

      {tab==="settings"?<SettingsTab members={mergedConfig} onUpdate={updateMember} onSave={handleSaveCap} saveStatus={saveStatus} storageLoaded={storageLoaded} />
      :tab==="metrics"?<MetricsTab allMetrics={allMetrics} sprintName={sprintName} sprint={sprint} totals={sprintTotals} capacity={capacity} currentSnap={currentSnap} />
      :(
        <div style={{display:"flex",height:"calc(100vh - 55px)"}}>
          {/* Backlog */}
          <div onDragOver={e=>{e.preventDefault();setDropZone("backlog")}} onDragLeave={()=>setDropZone(null)} onDrop={onDropBacklog} style={{width:"40%",minWidth:340,borderRight:"1px solid "+T.border,display:"flex",flexDirection:"column",background:dropZone==="backlog"&&dragId?T.redDim:"transparent",transition:"background .2s"}}>
            <div style={{padding:"14px 18px 10px",borderBottom:"1px solid "+T.border}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}><span style={{fontSize:14,fontWeight:700,color:T.text0}}>Бэклог</span><span style={{fontSize:11,padding:"2px 8px",borderRadius:10,background:T.bg3,color:T.text2,fontFamily:T.mono,fontWeight:600}}>{backlog.length}</span></div>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Поиск..." style={{width:"100%",padding:"7px 12px",borderRadius:7,border:"1px solid "+T.border,background:T.bg2,color:T.text1,fontSize:12,outline:"none",marginBottom:8,fontFamily:T.font}} />
              <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                <FB label="Роль" value={filterRole} onChange={setFilterRole} options={[{v:"all",l:"Все"},{v:"backend",l:"BE"},{v:"frontend",l:"FE"},{v:"qa",l:"QA"},{v:"design",l:"DES"},{v:"manager",l:"MGR"}]} />
                <FB label="Сорт." value={sortBy} onChange={setSortBy} options={[{v:"totalPriority",l:"TP ↓"},{v:"effort",l:"Effort ↓"},{v:"businessValue",l:"BV ↓"},{v:"priority",l:"Priority"}]} />
              </div>
            </div>
            <div style={{flex:1,overflowY:"auto",padding:"8px 12px",display:"flex",flexDirection:"column",gap:6}}>
              {backlog.map((issue,idx)=><TC key={issue.idReadable} issue={issue} index={idx} source="backlog" onMove={()=>moveToSprint(issue.idReadable)} onDragStart={()=>onDragStart(issue.idReadable)} onDragEnd={onDragEnd} isDragging={dragId===issue.idReadable} expanded={expandedCard===issue.idReadable} onToggle={()=>setExpandedCard(expandedCard===issue.idReadable?null:issue.idReadable)} onReassign={reassign} capacityMap={capacity} teamConfig={mergedConfig} />)}
              {backlog.length===0&&<div style={{textAlign:"center",padding:40,color:T.text3,fontSize:12}}>Бэклог пуст</div>}
            </div>
          </div>

          {/* Sprint + Capacity */}
          <div style={{flex:1,display:"flex",flexDirection:"column"}}>
            {/* Capacity */}
            <div style={{padding:"12px 18px",borderBottom:"1px solid "+T.border,background:T.bg1}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <span style={{fontSize:12,fontWeight:700,color:T.text2,textTransform:"uppercase",letterSpacing:".06em"}}>Загрузка команды</span>
                <div style={{display:"flex",gap:12,fontSize:9,color:T.text3}}>{[{s:"optimal",l:"В норме"},{s:"under",l:"Недогрузка"},{s:"over",l:"Перегрузка"}].map(x=><span key={x.s} style={{display:"flex",alignItems:"center",gap:3}}><span style={{width:6,height:6,borderRadius:2,background:T.status[x.s]}} />{x.l}</span>)}</div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:6}}>{capacity.map(m=><CB key={m.login} m={m} />)}</div>
            </div>

            {/* Sprint */}
            <div onDragOver={e=>{e.preventDefault();setDropZone("sprint")}} onDragLeave={()=>setDropZone(null)} onDrop={onDropSprint} style={{flex:1,overflowY:"auto",background:dropZone==="sprint"&&dragId?T.greenDim:"transparent",transition:"background .2s"}}>
              <div style={{padding:"12px 18px 8px",display:"flex",justifyContent:"space-between",alignItems:"center",position:"sticky",top:0,background:T.bg0,zIndex:5,flexWrap:"wrap",gap:8}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:14,fontWeight:700,color:T.text0}}>{sprintName}</span>
                  <span style={{fontSize:11,padding:"2px 8px",borderRadius:10,background:T.greenDim,color:T.green,fontFamily:T.mono,fontWeight:600}}>{sprint.length}</span>
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
              <div style={{padding:"4px 12px 20px",display:"flex",flexDirection:"column",gap:6}}>
                {sprint.map((issue,idx)=><TC key={issue.idReadable} issue={issue} index={idx} source="sprint" onMove={()=>moveToBacklog(issue.idReadable)} onDragStart={()=>onDragStart(issue.idReadable)} onDragEnd={onDragEnd} isDragging={dragId===issue.idReadable} expanded={expandedCard===issue.idReadable} onToggle={()=>setExpandedCard(expandedCard===issue.idReadable?null:issue.idReadable)} onReassign={reassign} capacityMap={capacity} teamConfig={mergedConfig} />)}
                {sprint.length===0&&<div style={{textAlign:"center",padding:50,border:"2px dashed "+T.border,borderRadius:14,marginTop:8}}><div style={{fontSize:28,color:T.text3,marginBottom:8}}>↓</div><div style={{fontSize:13,fontWeight:600,color:T.text3}}>Перетащите задачи из бэклога</div></div>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const btnS={padding:"4px 10px",borderRadius:5,border:"none",cursor:"pointer",fontSize:10,fontWeight:700,transition:"all .15s"};

// ═══════════════════════════════════════════════════════════════════════════
// SETTINGS TAB
// ═══════════════════════════════════════════════════════════════════════════
function SettingsTab({members,onUpdate,onSave,saveStatus,storageLoaded}){
  const grouped=useMemo(()=>{const g={};ROLES.forEach(r=>g[r]=[]);members.forEach(m=>{(g[m.role]||g.backend).push(m)});return g},[members]);
  const RN={backend:"Backend-разработчики",frontend:"Frontend-разработчики",qa:"QA-инженеры",design:"Дизайнеры",manager:"Менеджеры"};
  return(
    <div style={{padding:"20px 24px",maxWidth:900,margin:"0 auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20,flexWrap:"wrap",gap:12}}>
        <div><h2 style={{fontSize:18,fontWeight:800,color:T.text0,marginBottom:4}}>Настройки команды</h2><p style={{fontSize:12,color:T.text3}}>{members.length} участников · {members.reduce((a,m)=>a+m.capacity,0)} SP{storageLoaded&&<span style={{marginLeft:8,color:T.accent,fontSize:10}}>● загружено</span>}</p></div>
        <button onClick={onSave} style={{padding:"8px 20px",borderRadius:8,border:"none",cursor:"pointer",fontSize:13,fontWeight:700,background:saveStatus==="saved"?T.green:saveStatus==="error"?T.red:"linear-gradient(135deg,"+T.accent+","+T.blue+")",color:T.bg0,opacity:saveStatus==="saving"?.6:1}}>{saveStatus==="saving"?"Сохраняю...":saveStatus==="saved"?"✓ Сохранено":saveStatus==="error"?"✗ Ошибка":"Сохранить"}</button>
      </div>
      <div style={{padding:14,borderRadius:10,background:T.blueDim,border:"1px solid "+T.blue+"18",marginBottom:20,fontSize:12,color:T.text2,lineHeight:1.6}}><strong style={{color:T.blue}}>Как это работает:</strong> Список людей из полей Assignee и QA. Укажите роль и capacity (±tolerance). Настройки сохраняются между сессиями.</div>
      {ROLES.map(role=><div key={role} style={{marginBottom:24}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}><span style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:4,background:T.role[role]+"20",color:T.role[role],textTransform:"uppercase"}}>{RL[role]}</span><span style={{fontSize:13,fontWeight:700,color:T.text0}}>{RN[role]}</span><span style={{fontSize:11,color:T.text3}}>{grouped[role].length} чел. · {grouped[role].reduce((a,m)=>a+m.capacity,0)} SP</span></div>
        <div style={{display:"flex",flexDirection:"column",gap:6}}>{grouped[role].map(m=><MemberRow key={m.login} m={m} onUpdate={onUpdate} />)}{grouped[role].length===0&&<div style={{padding:12,borderRadius:8,background:T.bg1,border:"1px solid "+T.border,fontSize:11,color:T.text3,textAlign:"center"}}>Нет участников</div>}</div>
      </div>)}
    </div>
  );
}
function MemberRow({m,onUpdate}){return(
  <div style={{padding:"10px 14px",borderRadius:8,background:T.bg1,border:"1px solid "+T.border,display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}} onMouseEnter={e=>e.currentTarget.style.borderColor=T.borderHover} onMouseLeave={e=>e.currentTarget.style.borderColor=T.border}>
    <div style={{minWidth:160,flex:"1 1 160px"}}><div style={{fontSize:13,fontWeight:600,color:T.text0}}>{m.fullName}</div><div style={{fontSize:10,color:T.text3,fontFamily:T.mono}}>{m.login}</div></div>
    <div style={{display:"flex",alignItems:"center",gap:4}}><span style={{fontSize:10,color:T.text3,fontWeight:600}}>Роль:</span><select value={m.role} onChange={e=>onUpdate(m.login,"role",e.target.value)} style={{padding:"4px 8px",borderRadius:5,border:"1px solid "+T.border,background:T.bg2,color:T.role[m.role],fontSize:11,fontWeight:600,fontFamily:T.font,cursor:"pointer",outline:"none"}}>{ROLES.map(r=><option key={r} value={r}>{RL[r]}</option>)}</select></div>
    <div style={{display:"flex",alignItems:"center",gap:4}}><span style={{fontSize:10,color:T.text3,fontWeight:600}}>Cap:</span><input type="number" value={m.capacity} min={0} max={99} onChange={e=>onUpdate(m.login,"capacity",Math.max(0,parseInt(e.target.value)||0))} style={{width:48,padding:"4px 6px",borderRadius:5,border:"1px solid "+T.border,background:T.bg2,color:T.text0,fontSize:13,fontFamily:T.mono,fontWeight:700,textAlign:"center",outline:"none"}} /><span style={{fontSize:10,color:T.text3}}>±</span><input type="number" value={m.tolerance} min={0} max={20} onChange={e=>onUpdate(m.login,"tolerance",Math.max(0,parseInt(e.target.value)||0))} style={{width:40,padding:"4px 6px",borderRadius:5,border:"1px solid "+T.border,background:T.bg2,color:T.text0,fontSize:13,fontFamily:T.mono,fontWeight:700,textAlign:"center",outline:"none"}} /></div>
    <div style={{fontSize:11,fontFamily:T.mono,color:T.text2,minWidth:70,textAlign:"right"}}>{m.capacity-m.tolerance}–{m.capacity+m.tolerance}</div>
  </div>
);}

// ═══════════════════════════════════════════════════════════════════════════
// METRICS TAB (snapshot-based)
// ═══════════════════════════════════════════════════════════════════════════
function MetricsTab({allMetrics,sprintName,sprint,totals,capacity,currentSnap}){
  const closed=allMetrics.filter(m=>m.status==="closed");
  const avg=useMemo(()=>{if(closed.length===0)return null;const n=closed.length;return{n,avgCompletion:Math.round(closed.reduce((a,m)=>a+m.completionRate,0)/n),avgReopened:+(closed.reduce((a,m)=>a+m.reopened,0)/n).toFixed(1),avgCarryOver:+(closed.reduce((a,m)=>a+m.carryOver,0)/n).toFixed(1)}},[closed]);
  const current=allMetrics.find(m=>m.sprintName===sprintName);
  const reopened=sprint.filter(i=>(gNum(i,FIELDS.REOPEN_COUNTER)||0)>0);

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
      {closed.length===0?<div style={{padding:16,borderRadius:10,background:T.bg1,border:"1px solid "+T.border,fontSize:12,color:T.text3,marginBottom:20}}>Нет закрытых спринтов</div>:(
        <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:20}}>
          {closed.map(s=>{const p=s.completionRate;return(
            <div key={s.sprintName} style={{padding:14,borderRadius:10,background:T.bg1,border:"1px solid "+T.border}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}><span style={{fontSize:13,fontWeight:700,color:T.text0}}>{s.sprintName}</span><span style={{fontSize:20,fontWeight:800,fontFamily:T.mono,color:p>=80?T.green:p>=60?T.yellow:T.red}}>{p}%</span></div>
              <div style={{height:6,background:T.bg0,borderRadius:3,marginBottom:8,overflow:"hidden"}}><div style={{height:"100%",width:p+"%",borderRadius:3,background:p>=80?T.green:p>=60?T.yellow:T.red}} /></div>
              <div style={{display:"flex",gap:12,fontSize:11,color:T.text2,flexWrap:"wrap"}}>
                <span>Запланировано: <b style={{color:T.text0}}>{s.planned}</b></span>
                <span>Выполнено: <b style={{color:T.green}}>{s.completed}</b></span>
                <span>Переоткрыто: <b style={{color:T.yellow}}>{s.reopened}</b></span>
                <span>Carry-over: <b style={{color:T.red}}>{s.carryOver}</b></span>
                {s.added>0&&<span>Добавлено: <b style={{color:T.blue}}>+{s.added}</b></span>}
                {s.removed>0&&<span>Убрано: <b style={{color:T.text3}}>-{s.removed}</b></span>}
              </div>
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
      {reopened.length>0&&<div><div style={{fontSize:13,fontWeight:700,color:T.text1,marginBottom:10}}>Переоткрытые в {sprintName}</div>{reopened.map(i=><div key={i.idReadable} style={{padding:10,borderRadius:8,background:T.yellowDim,border:"1px solid "+T.yellow+"22",marginBottom:6,display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><span style={{fontSize:11,fontFamily:T.mono,fontWeight:600,color:T.yellow,marginRight:8}}>{i.idReadable}</span><span style={{fontSize:12,color:T.text0}}>{i.summary}</span></div><span style={{fontSize:12,fontFamily:T.mono,fontWeight:700,color:T.yellow}}>×{gNum(i,FIELDS.REOPEN_COUNTER)}</span></div>)}</div>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SHARED
// ═══════════════════════════════════════════════════════════════════════════
function FB({label,value,onChange,options}){return(<div style={{display:"flex",alignItems:"center",gap:4}}><span style={{fontSize:10,color:T.text3,fontWeight:600}}>{label}:</span><div style={{display:"flex",gap:1,background:T.bg2,borderRadius:5,padding:1}}>{options.map(o=><button key={o.v} onClick={()=>onChange(o.v)} style={{padding:"3px 8px",borderRadius:4,border:"none",cursor:"pointer",fontSize:10,fontWeight:600,background:value===o.v?T.bg3:"transparent",color:value===o.v?T.text0:T.text3}}>{o.l}</button>)}</div></div>)}

function TC({issue,index,source,onMove,onDragStart,onDragEnd,isDragging,expanded,onToggle,onReassign,capacityMap,teamConfig}){
  const priority=gEnum(issue,FIELDS.PRIORITY);const state=gEnum(issue,FIELDS.STATE);const assignee=gUser(issue,FIELDS.ASSIGNEE);const qa=gUser(issue,FIELDS.QA);const tp=gNum(issue,FIELDS.TOTAL_PRIORITY);const efforts=getEfforts(issue);const eLabel=effortLabel(issue);const pColor=T.priority[priority]||T.text3;const hasQA=efforts.qa>0;
  let aOver=false,qOver=false;if(capacityMap){if(assignee){const m=capacityMap.find(x=>x.login===assignee.login);if(m?.status==="over")aOver=true}if(qa){const m=capacityMap.find(x=>x.login===qa.login);if(m?.status==="over")qOver=true}}
  const bc=efforts.be?T.role.backend:efforts.fe?T.role.frontend:efforts.des?T.role.design:efforts.mgr?T.role.manager:T.text3;
  return(
    <div draggable onDragStart={onDragStart} onDragEnd={onDragEnd} className="card-enter" style={{padding:"10px 12px",background:T.bg1,borderRadius:10,border:"1px solid "+T.border,borderLeftWidth:3,borderLeftColor:bc,cursor:"grab",opacity:isDragging?.35:1,transition:"all .15s",animationDelay:index*30+"ms"}} onMouseEnter={e=>{e.currentTarget.style.borderColor=T.borderHover;e.currentTarget.style.borderLeftColor=bc}} onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.borderLeftColor=bc}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
        <div style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:10,fontFamily:T.mono,color:T.text3,fontWeight:600,cursor:"pointer"}} onClick={onToggle}>{issue.idReadable}</span><span style={{fontSize:8,fontWeight:700,padding:"1px 5px",borderRadius:3,background:pColor+"18",color:pColor,textTransform:"uppercase"}}>{priority}</span>{state&&state!=="Backlog"&&<span style={{fontSize:8,fontWeight:600,padding:"1px 5px",borderRadius:3,background:T.accentDim,color:T.accent}}>{state}</span>}</div>
        <div style={{display:"flex",alignItems:"center",gap:6}}>{tp!=null&&<span style={{fontSize:10,fontFamily:T.mono,fontWeight:700,color:T.accent}}>TP {tp}</span>}<button onClick={onMove} style={{background:"none",border:"none",cursor:"pointer",fontSize:14,color:T.text3,padding:"0 2px",lineHeight:1}} onMouseEnter={e=>e.target.style.color=source==="backlog"?T.green:T.red} onMouseLeave={e=>e.target.style.color=T.text3}>{source==="backlog"?"→":"←"}</button></div>
      </div>
      <div style={{fontSize:12,fontWeight:500,color:T.text0,lineHeight:1.4,marginBottom:7,cursor:"pointer"}} onClick={onToggle}>{issue.summary}</div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:4}}>
        <span style={{fontSize:10,fontFamily:T.mono,fontWeight:600,padding:"2px 7px",borderRadius:4,background:bc+"12",color:bc}}>{eLabel} <span style={{color:T.text3}}>Σ{efforts.total}</span></span>
        <div style={{display:"flex",gap:4}}>{assignee&&<span style={{fontSize:9,padding:"2px 6px",borderRadius:4,background:aOver?T.redDim:"rgba(255,255,255,0.04)",color:aOver?T.red:T.text2,border:aOver?"1px solid "+T.red+"33":"1px solid transparent"}}>● {assignee.fullName?.split(" ")[0]}</span>}{qa&&<span style={{fontSize:9,padding:"2px 6px",borderRadius:4,background:qOver?T.redDim:"rgba(255,255,255,0.04)",color:qOver?T.red:T.text2,border:qOver?"1px solid "+T.red+"33":"1px solid transparent"}}>◆ {qa.fullName?.split(" ")[0]}</span>}</div>
      </div>
      {expanded&&<div style={{marginTop:8,paddingTop:8,borderTop:"1px solid "+T.border,display:"flex",flexDirection:"column",gap:6,animation:"fadeIn .2s ease"}}>
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}><span style={{fontSize:10,color:T.text3,fontWeight:600,width:70}}>Assignee:</span><select value={assignee?.login||""} onChange={e=>onReassign(issue.idReadable,FIELDS.ASSIGNEE,e.target.value||null)} style={{flex:1,minWidth:140,padding:"4px 8px",borderRadius:5,border:"1px solid "+T.border,background:T.bg2,color:T.text1,fontSize:11,fontFamily:T.font}}><option value="">Unassigned</option>{USERS.map(u=><option key={u.login} value={u.login}>{u.fullName}</option>)}</select></div>
        {hasQA&&<div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}><span style={{fontSize:10,color:T.text3,fontWeight:600,width:70}}>QA:</span><select value={qa?.login||""} onChange={e=>onReassign(issue.idReadable,FIELDS.QA,e.target.value||null)} style={{flex:1,minWidth:140,padding:"4px 8px",borderRadius:5,border:"1px solid "+T.border,background:T.bg2,color:T.text1,fontSize:11,fontFamily:T.font}}><option value="">No QA</option>{USERS.filter(u=>(teamConfig||DEFAULT_CAPACITY).find(t=>t.login===u.login&&t.role==="qa")).map(u=><option key={u.login} value={u.login}>{u.fullName}</option>)}</select></div>}
        <div style={{fontSize:9,color:T.text3,fontFamily:T.mono,display:"flex",gap:12,marginTop:2}}><span>BV: {gNum(issue,FIELDS.BUSINESS_VALUE)||"—"}</span><span>Cat: {gEnum(issue,FIELDS.EXT_CATEGORY)||"—"}</span><span>Type: {gEnum(issue,FIELDS.TYPE)}</span></div>
      </div>}
    </div>
  );
}

function CB({m}){const{fullName,role,capacity,tolerance,load,tasks,status}=m;const pct=Math.min((load/(capacity+tolerance))*100,100);const c=T.status[status];return(
  <div style={{padding:"8px 10px",background:status==="over"?T.redDim:"rgba(255,255,255,0.015)",borderRadius:8,border:"1px solid "+(status==="over"?T.red+"25":T.border)}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}><div style={{display:"flex",alignItems:"center",gap:5}}><span style={{fontSize:8,fontWeight:700,padding:"1px 5px",borderRadius:3,background:T.role[role]+"20",color:T.role[role]}}>{RL[role]}</span><span style={{fontSize:11,fontWeight:600,color:T.text1}}>{fullName?.split(" ")[0]}</span></div><div style={{display:"flex",alignItems:"baseline",gap:2}}><span style={{fontSize:15,fontWeight:800,color:c,fontFamily:T.mono}}>{load}</span><span style={{fontSize:9,color:T.text3}}>/{capacity}±{tolerance}</span></div></div>
    <div style={{height:4,background:T.bg0,borderRadius:2,overflow:"hidden"}}><div style={{height:"100%",width:pct+"%",borderRadius:2,background:"linear-gradient(90deg,"+c+"88,"+c+")",transition:"width .4s cubic-bezier(.4,0,.2,1)"}} /></div>
    {tasks.length>0&&<div style={{marginTop:4,display:"flex",gap:3,flexWrap:"wrap"}}>{tasks.map(t=><span key={t.id} style={{fontSize:8,color:T.text3,background:"rgba(255,255,255,0.03)",padding:"0px 4px",borderRadius:2,fontFamily:T.mono}}>{t.id}({t.eff})</span>)}</div>}
  </div>
);}

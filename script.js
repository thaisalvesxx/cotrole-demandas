/* ==========================================================================
   HUBMARKET — script.js
   SaaS de gestão para Analista de E-commerce e Marketplaces
   100% client-side · LocalStorage · sem backend
   ========================================================================== */

(function(){
"use strict";

/* ============================================================
   CONSTANTS (fixos)
   ============================================================ */
const DB_KEY = "hubmarket_db_v2";

const PRIORITIES  = ["Baixa","Média","Alta","Crítica"];
const STATUSES    = ["Backlog","Hoje","Em andamento","Aguardando","Concluído"];
const FREQUENCIES = ["Diária","Dias da semana","Quinzenal","Mensal"];
const TRACKING_STATUSES = ["Aberto","Em análise","Aguardando marketplace","Resolvido"];
const WEEKDAYS = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
const MONTHS = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

const DEFAULT_CATEGORIES = ["Estoque","Cadastro de produtos","Marketplace","Atendimento","Marketing","Financeiro","Melhoria de anúncios","Exportação de anúncios","Outros"];
const DEFAULT_QTY_CATEGORIES = ["Cadastro de produtos","Melhoria de anúncios","Exportação de anúncios"];
const DEFAULT_MARKETPLACES = [
  {key:"mercadolivre", name:"Mercado Livre", color:"#FFD400"},
  {key:"shopee",       name:"Shopee",        color:"#EE4D2D"},
  {key:"amazon",       name:"Amazon",        color:"#FF9900"},
  {key:"magalu",       name:"Magalu",        color:"#0086FF"},
  {key:"shein",        name:"Shein",         color:"#000000"},
];
const DEFAULT_TRACKING_TYPES = ["Reclamação","Mensagem","Protocolo","Devolução"];

/* ============================================================
   STATE
   ============================================================ */
function defaultState(){
  return {
    theme:"light",
    config:{
      categories: DEFAULT_CATEGORIES.slice(),
      qtyCategories: DEFAULT_QTY_CATEGORIES.slice(),
      marketplaces: DEFAULT_MARKETPLACES.map(m=>Object.assign({},m)),
      trackingTypes: DEFAULT_TRACKING_TYPES.slice(),
    },
    tasks:[],
    recurring:[],
    goals:[],
    timeLog:[],
    activeTimer:null,
    focusSessions:[],
    pomodoroCyclesToday:0,
    pomodoroDate:todayStr(),
    tracking:[],
    calendarEvents:[]
  };
}

let state = loadState();

function loadState(){
  try{
    const raw = localStorage.getItem(DB_KEY);
    if(!raw) return migrateOld(defaultState());
    const parsed = JSON.parse(raw);
    const merged = Object.assign(defaultState(), parsed);
    merged.config = Object.assign(defaultState().config, parsed.config||{});
    return merged;
  }catch(e){
    console.error("Erro ao carregar dados", e);
    return defaultState();
  }
}
function migrateOld(fresh){
  try{
    const oldRaw = localStorage.getItem("hubmarket_db_v1");
    if(!oldRaw) return fresh;
    const old = JSON.parse(oldRaw);
    if(Array.isArray(old.tasks)) fresh.tasks = old.tasks.map(t=>Object.assign({order:Date.now()+Math.random(), subtasks:[]}, t));
    if(Array.isArray(old.goals)) fresh.goals = old.goals;
    if(Array.isArray(old.timeLog)) fresh.timeLog = old.timeLog;
    if(Array.isArray(old.focusSessions)) fresh.focusSessions = old.focusSessions;
    if(Array.isArray(old.calendarEvents)) fresh.calendarEvents = old.calendarEvents;
  }catch(e){}
  return fresh;
}

function saveState(){
  localStorage.setItem(DB_KEY, JSON.stringify(state));
}

/* ============================================================
   UTILITIES
   ============================================================ */
function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
function todayStr(){ return new Date().toISOString().slice(0,10); }
function pad(n){ return n.toString().padStart(2,"0"); }

function fmtDate(iso){
  if(!iso) return "—";
  const d = new Date(iso+"T00:00:00");
  if(isNaN(d)) return "—";
  return pad(d.getDate())+"/"+pad(d.getMonth()+1)+"/"+d.getFullYear();
}
function fmtDateTime(ts){
  const d = new Date(ts);
  return pad(d.getHours())+":"+pad(d.getMinutes())+":"+pad(d.getSeconds());
}
function fmtDuration(ms){
  const totalSec = Math.max(0,Math.floor(ms/1000));
  const h = Math.floor(totalSec/3600);
  const m = Math.floor((totalSec%3600)/60);
  const s = totalSec%60;
  return pad(h)+":"+pad(m)+":"+pad(s);
}
function fmtHoursMin(ms){
  const totalMin = Math.max(0,Math.round(ms/60000));
  const h = Math.floor(totalMin/60);
  const m = totalMin%60;
  return h+"h "+m+"m";
}
function startOfWeek(d){
  const date = new Date(d);
  const day = date.getDay();
  date.setDate(date.getDate()-day);
  date.setHours(0,0,0,0);
  return date;
}
function daysBetween(a,b){ return Math.floor((b-a)/86400000); }
function escapeHtml(str){
  if(str===undefined||str===null) return "";
  return str.toString().replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function downloadFile(filename, content, mime){
  const blob = new Blob([content], {type:mime||"text/plain"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
function toCSV(rows){
  return rows.map(r => r.map(cell=>{
    const v = (cell===undefined||cell===null) ? "" : cell.toString();
    return '"'+v.replace(/"/g,'""')+'"';
  }).join(",")).join("\r\n");
}
function toast(msg, type){
  const el = document.createElement("div");
  el.className = "toast"+(type?" "+type:"");
  el.textContent = msg;
  document.getElementById("toastContainer").appendChild(el);
  setTimeout(()=>{ el.style.opacity="0"; el.style.transition="opacity .3s"; setTimeout(()=>el.remove(),300); }, 3200);
}
function priorityBadgeClass(p){
  return {"Baixa":"badge-low","Média":"badge-medium","Alta":"badge-high","Crítica":"badge-critical"}[p] || "badge-muted";
}
function categories(){ return state.config.categories; }
function isQtyCategory(cat){ return state.config.qtyCategories.includes(cat); }
function marketplaces(){ return state.config.marketplaces; }
function marketplaceName(key){ const m = marketplaces().find(x=>x.key===key); return m?m.name:(key||"—"); }
function trackingTypes(){ return state.config.trackingTypes; }
function businessDaysCount(fromIso, toIso){
  let d = new Date(fromIso+"T00:00:00");
  const end = new Date(toIso+"T00:00:00");
  let count = 0;
  while(d<=end){
    const wd = d.getDay();
    if(wd!==0 && wd!==6) count++;
    d.setDate(d.getDate()+1);
  }
  return count;
}
function businessDaysList(fromIso, toIso){
  let d = new Date(fromIso+"T00:00:00");
  const end = new Date(toIso+"T00:00:00");
  const list = [];
  while(d<=end){
    const wd = d.getDay();
    if(wd!==0 && wd!==6) list.push(d.toISOString().slice(0,10));
    d.setDate(d.getDate()+1);
  }
  return list;
}

/* ============================================================
   MODAL
   ============================================================ */
const modalOverlay = document.getElementById("modalOverlay");
const modalBox = document.getElementById("modalBox");

function openModal(title, innerHTML, onMount){
  modalBox.innerHTML = "<h2>"+escapeHtml(title)+"</h2>"+innerHTML;
  modalOverlay.classList.remove("hidden");
  if(onMount) onMount(modalBox);
}
function closeModal(){
  modalOverlay.classList.add("hidden");
  modalBox.innerHTML = "";
}
modalOverlay.addEventListener("click", e=>{ if(e.target===modalOverlay) closeModal(); });

/* ============================================================
   NAVIGATION
   ============================================================ */
const sections = ["dashboard","tasks","recurring","goals","time","focus","tracking","calendar","reports","settings"];
const renderMap = {};

function goTo(section){
  sections.forEach(s=>{
    document.getElementById("view-"+s).classList.toggle("hidden", s!==section);
  });
  document.querySelectorAll(".nav-item").forEach(btn=>{
    btn.classList.toggle("is-active", btn.dataset.section===section);
  });
  if(renderMap[section]) renderMap[section]();
  closeSidebarMobile();
}

document.getElementById("mainNav").addEventListener("click", e=>{
  const btn = e.target.closest(".nav-item");
  if(btn) goTo(btn.dataset.section);
});

function closeSidebarMobile(){
  document.getElementById("sidebar").classList.remove("is-open");
  document.getElementById("sidebarOverlay").classList.remove("is-open");
}
document.getElementById("btnOpenSidebar").addEventListener("click", ()=>{
  document.getElementById("sidebar").classList.add("is-open");
  document.getElementById("sidebarOverlay").classList.add("is-open");
});
document.getElementById("btnCloseSidebar").addEventListener("click", closeSidebarMobile);
document.getElementById("sidebarOverlay").addEventListener("click", closeSidebarMobile);

/* ============================================================
   THEME
   ============================================================ */
function applyTheme(){
  document.documentElement.setAttribute("data-theme", state.theme);
  const sw = document.getElementById("darkModeSwitch");
  if(sw) sw.checked = state.theme==="dark";
}
function toggleTheme(){
  state.theme = state.theme==="dark" ? "light" : "dark";
  saveState();
  applyTheme();
  refreshCurrentCharts();
}
document.getElementById("btnTheme").addEventListener("click", toggleTheme);
document.getElementById("btnThemeMobile").addEventListener("click", toggleTheme);

/* ============================================================
   ORDER HELPERS (kanban / recorrentes)
   ============================================================ */
function nextOrder(list){
  return list.length ? Math.max(...list.map(x=>x.order||0))+10 : 10;
}
function moveOrder(list, item, dir){
  // list: already sorted ascending by order, dir: -1 up, +1 down
  const idx = list.indexOf(item);
  const swapIdx = idx+dir;
  if(swapIdx<0 || swapIdx>=list.length) return;
  const other = list[swapIdx];
  const tmp = item.order; item.order = other.order; other.order = tmp;
}

/* ============================================================
   RECURRING TASK GENERATION + GOAL AUTOMATION (executa a cada carregamento/dia)
   ============================================================ */
function processRecurring(){
  const today = new Date(); today.setHours(0,0,0,0);
  const todayIso = todayStr();
  const todayWeekday = today.getDay();
  let changed = false;

  state.recurring.slice().sort((a,b)=>(a.order||0)-(b.order||0)).forEach(r=>{
    let due = false;
    if(r.frequency==="Diária"){
      due = r.lastGenerated !== todayIso;
    }else if(r.frequency==="Dias da semana"){
      due = (r.weekdays||[]).includes(todayWeekday) && r.lastGenerated !== todayIso;
    }else if(r.frequency==="Quinzenal"){
      if(!r.lastGenerated) due = true;
      else due = daysBetween(new Date(r.lastGenerated+"T00:00:00"), today) >= 15;
    }else if(r.frequency==="Mensal"){
      const dom = r.dayOfMonth || 1;
      const sameMonth = r.lastGenerated && r.lastGenerated.slice(0,7)===todayIso.slice(0,7);
      due = today.getDate() >= dom && !sameMonth;
    }
    if(due){
      state.tasks.push({
        id: uid(), name:r.name, desc:"Tarefa recorrente ("+r.frequency+")",
        category:r.category, priority:r.priority, dueDate:todayIso,
        estimate:r.estimate||"", status:"Hoje", createdAt:Date.now(), completedAt:null,
        recurringId:r.id, order:r.order||nextOrder(state.tasks),
        subtasks:(r.subtasksTemplate||[]).map(s=>({id:uid(),name:s.name,done:false})),
        quantity:null, timeSpent:0, timerStart:null
      });
      r.lastGenerated = todayIso;
      changed = true;
    }
  });

  // ativa tarefas de meta cujo dia chegou
  state.goals.forEach(g=>{
    state.tasks.forEach(t=>{
      if(t.goalId===g.id && t.dueDate===todayIso && t.status==="Backlog"){
        t.status = "Hoje"; changed = true;
      }
    });
  });

  if(changed) saveState();
}

/* ============================================================
   GOAL AUTOMATION — desdobra meta em tarefas diárias
   ============================================================ */
function recalcGoalTasks(goal){
  const todayIso = todayStr();
  // remove tarefas futuras/hoje ainda não concluídas geradas para essa meta
  state.tasks = state.tasks.filter(t=> !(t.goalId===goal.id && t.status!=="Concluído" && t.dueDate>=todayIso));

  const remaining = Math.max(0, (goal.target||0) - (goal.current||0));
  if(remaining<=0) return;

  const deadline = goal.deadline || todayIso;
  const start = (goal.startDate && goal.startDate>todayIso) ? goal.startDate : todayIso;
  if(deadline < start) return;

  let days = goal.businessDaysOnly!==false ? businessDaysList(start, deadline) : (()=>{
    const list=[]; let d=new Date(start+"T00:00:00"); const end=new Date(deadline+"T00:00:00");
    while(d<=end){ list.push(d.toISOString().slice(0,10)); d.setDate(d.getDate()+1); }
    return list;
  })();
  if(!days.length) days = [todayIso];

  const base = Math.floor(remaining/days.length);
  let extra = remaining - base*days.length;
  const baseOrder = nextOrder(state.tasks);

  days.forEach((dueDate, i)=>{
    const qty = base + (extra>0 ? 1 : 0);
    if(extra>0) extra--;
    if(qty<=0) return;
    const id = uid();
    state.tasks.push({
      id, name: goal.name+" — etapa do dia", desc:"Gerado automaticamente pela meta \""+goal.name+"\". Meta de hoje: "+qty+" "+(goal.unit||"unid."),
      category: goal.category, priority:"Alta", dueDate,
      estimate:"", status: dueDate===todayIso ? "Hoje" : "Backlog",
      createdAt:Date.now(), completedAt:null, recurringId:null, goalId:goal.id,
      order: baseOrder+i, subtasks:[], quantity:null, targetQty:qty, timeSpent:0, timerStart:null
    });
  });
}
function recalcAllGoals(){ state.goals.forEach(recalcGoalTasks); }

/* ============================================================
   DASHBOARD
   ============================================================ */
let chartCategory, chartHours, chartProductivity, chartTimeByCategory, chartTracking;

function totalTaskTimeMs(t){
  let ms = t.timeSpent||0;
  if(t.timerStart) ms += Date.now()-t.timerStart;
  return ms;
}

function renderDashboard(){
  const today = todayStr();
  const pending = state.tasks.filter(t=>t.status!=="Concluído").length;
  const done = state.tasks.filter(t=>t.status==="Concluído").length;
  const overdue = state.tasks.filter(t=>t.status!=="Concluído" && t.dueDate && t.dueDate<today).length;
  const openTracking = state.tracking.filter(p=>p.status!=="Resolvido").length;
  const monthPrefix = today.slice(0,7);

  const mainGoal = state.goals.find(g=>!g.deadline || g.deadline>=today) || state.goals[0];
  const goalPct = mainGoal ? Math.min(100, Math.round((mainGoal.current/mainGoal.target)*100)||0) : 0;

  const todayLogs = state.timeLog.filter(l=>l.date===today && l.type==="work");
  let workedMs = todayLogs.reduce((sum,l)=> sum + (l.end? (l.end-l.start) : 0), 0);
  if(state.activeTimer && state.activeTimer.type==="work") workedMs += (Date.now()-state.activeTimer.start);

  const tasksToday = state.tasks.filter(t=>t.dueDate===today);
  const doneToday = tasksToday.filter(t=>t.status==="Concluído").length;
  const productivity = tasksToday.length ? Math.round((doneToday/tasksToday.length)*100) : 0;

  const cards = [
    {icon:icon("clipboard"),label:"Tarefas pendentes",value:pending},
    {icon:icon("check"),label:"Tarefas concluídas",value:done},
    {icon:icon("alert"),label:"Tarefas atrasadas",value:overdue, danger:overdue>0},
    {icon:icon("file"),label:"Acompanhamentos abertos",value:openTracking},
    {icon:icon("star"),label:"Meta principal",value:goalPct+"%", gold:true},
    {icon:icon("clock"),label:"Horas trabalhadas hoje",value:fmtHoursMin(workedMs)},
    {icon:icon("trend"),label:"Produtividade do dia",value:productivity+"%", gold:true},
  ];
  document.getElementById("dashCards").innerHTML = cards.map(c=>
    '<div class="stat-card'+(c.gold?" gold":"")+'">'+
      '<div class="stat-icon">'+c.icon+'</div>'+
      '<div class="stat-value" style="'+(c.danger?"color:var(--danger)":"")+'">'+c.value+'</div>'+
      '<div class="stat-label">'+c.label+'</div>'+
    '</div>'
  ).join("");

  renderChartCategory();
  renderChartHours();
  renderChartProductivity();
  renderChartTimeByCategory();
  renderTopTimeTasks();
}

function renderChartCategory(){
  const ctx = document.getElementById("chartCategory");
  const cats = categories();
  const counts = cats.map(c=> state.tasks.filter(t=>t.category===c).length);
  if(chartCategory) chartCategory.destroy();
  chartCategory = new Chart(ctx, {
    type:"doughnut",
    data:{ labels:cats, datasets:[{ data:counts, backgroundColor:palette(cats.length) }] },
    options:{ plugins:{legend:{position:"bottom",labels:{boxWidth:10,font:{size:11},color:cssVar("--text")}}}, cutout:"60%" }
  });
}
function renderChartHours(){
  const ctx = document.getElementById("chartHours");
  const days = [];
  const data = [];
  for(let i=6;i>=0;i--){
    const d = new Date(); d.setDate(d.getDate()-i);
    const iso = d.toISOString().slice(0,10);
    days.push(WEEKDAYS[d.getDay()]+" "+pad(d.getDate()));
    let ms = state.timeLog.filter(l=>l.date===iso && l.type==="work").reduce((s,l)=>s+(l.end?(l.end-l.start):0),0);
    if(iso===todayStr() && state.activeTimer && state.activeTimer.type==="work") ms += Date.now()-state.activeTimer.start;
    data.push(+(ms/3600000).toFixed(2));
  }
  if(chartHours) chartHours.destroy();
  chartHours = new Chart(ctx, {
    type:"bar",
    data:{ labels:days, datasets:[{ label:"Horas", data, backgroundColor:"#7C5CC9", borderRadius:6 }] },
    options:{ plugins:{legend:{display:false}}, scales:{ x:{grid:{display:false},ticks:{color:cssVar("--text-muted")}}, y:{beginAtZero:true,ticks:{color:cssVar("--text-muted")},grid:{color:cssVar("--border")}} } }
  });
}
function renderChartProductivity(){
  const ctx = document.getElementById("chartProductivity");
  const days = [];
  const data = [];
  for(let i=13;i>=0;i--){
    const d = new Date(); d.setDate(d.getDate()-i);
    const iso = d.toISOString().slice(0,10);
    days.push(pad(d.getDate())+"/"+pad(d.getMonth()+1));
    const dayTasks = state.tasks.filter(t=>t.dueDate===iso);
    const dayDone = dayTasks.filter(t=>t.status==="Concluído").length;
    data.push(dayTasks.length ? Math.round((dayDone/dayTasks.length)*100) : 0);
  }
  if(chartProductivity) chartProductivity.destroy();
  chartProductivity = new Chart(ctx, {
    type:"line",
    data:{ labels:days, datasets:[{ label:"Produtividade %", data, borderColor:"#CC9F36", backgroundColor:"rgba(204,159,54,.15)", fill:true, tension:.35, pointRadius:3 }] },
    options:{ plugins:{legend:{display:false}}, scales:{ x:{grid:{display:false},ticks:{color:cssVar("--text-muted")}}, y:{beginAtZero:true,max:100,ticks:{color:cssVar("--text-muted")},grid:{color:cssVar("--border")}} } }
  });
}
function timeByCategoryData(){
  const cats = categories();
  return cats.map(c=> state.tasks.filter(t=>t.category===c).reduce((s,t)=>s+totalTaskTimeMs(t),0)/3600000);
}
function renderChartTimeByCategory(){
  const ctx = document.getElementById("chartTimeByCategory");
  const cats = categories();
  const data = timeByCategoryData();
  if(chartTimeByCategory) chartTimeByCategory.destroy();
  chartTimeByCategory = new Chart(ctx, {
    type:"bar",
    data:{ labels:cats, datasets:[{ label:"Horas", data:data.map(d=>+d.toFixed(2)), backgroundColor:palette(cats.length), borderRadius:6 }] },
    options:{ indexAxis:"y", plugins:{legend:{display:false}}, scales:{ x:{beginAtZero:true,ticks:{color:cssVar("--text-muted")},grid:{color:cssVar("--border")}}, y:{grid:{display:false},ticks:{color:cssVar("--text-muted")}} } }
  });
}
function renderTopTimeTasks(){
  const top = state.tasks.slice().map(t=>({t,ms:totalTaskTimeMs(t)})).filter(x=>x.ms>0).sort((a,b)=>b.ms-a.ms).slice(0,5);
  const el = document.getElementById("topTimeTasks");
  if(!el) return;
  el.innerHTML = top.map(x=>
    '<div class="rank-row"><span style="width:auto;flex:1;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+escapeHtml(x.t.name)+'</span><span>'+fmtHoursMin(x.ms)+'</span></div>'
  ).join("") || '<p style="color:var(--text-muted);font-size:13px;">Ainda sem tempo registrado em tarefas.</p>';
}
function palette(n){
  const colors = ["#7C5CC9","#9B78D6","#CC9F36","#3FA873","#E0964A","#D6557A","#6C6480","#4F368C","#A87E22","#1E8C5A"];
  const out=[]; for(let i=0;i<n;i++) out.push(colors[i%colors.length]); return out;
}
function cssVar(name){ return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#6C6480"; }
function refreshCurrentCharts(){
  if(!document.getElementById("view-dashboard").classList.contains("hidden")) renderDashboard();
  if(!document.getElementById("view-tracking").classList.contains("hidden")) renderTracking();
}

function icon(name){
  const icons = {
    clipboard:'<svg viewBox="0 0 24 24"><rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4V3a1 1 0 011-1h4a1 1 0 011 1v1"/><path d="M9 11h6M9 15h6"/></svg>',
    check:'<svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    alert:'<svg viewBox="0 0 24 24"><path d="M12 9v4M12 17h.01"/><path d="M10.3 4.3L2.6 18a1 1 0 00.9 1.5h17a1 1 0 00.9-1.5L13.7 4.3a1 1 0 00-1.4 0z"/></svg>',
    file:'<svg viewBox="0 0 24 24"><path d="M7 3h8l4 4v13a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z"/><path d="M15 3v4h4"/></svg>',
    box:'<svg viewBox="0 0 24 24"><path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 7v10l9 4 9-4V7M12 11v10"/></svg>',
    star:'<svg viewBox="0 0 24 24"><path d="M12 3l2.6 5.6 6.1.6-4.6 4.1 1.3 6-5.4-3.1-5.4 3.1 1.3-6-4.6-4.1 6.1-.6z"/></svg>',
    clock:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>',
    trend:'<svg viewBox="0 0 24 24"><path d="M3 17l6-6 4 4 8-8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    edit:'<svg viewBox="0 0 24 24"><path d="M4 20h4l11-11-4-4L4 16v4z"/></svg>',
    trash:'<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14"/></svg>',
    copy:'<svg viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a1 1 0 01-1-1V4a1 1 0 011-1h10a1 1 0 011 1v1"/></svg>',
    play:'<svg viewBox="0 0 24 24"><path d="M7 4l13 8-13 8V4z"/></svg>',
    pause:'<svg viewBox="0 0 24 24"><path d="M7 4h3v16H7zM14 4h3v16h-3z"/></svg>',
    up:'<svg viewBox="0 0 24 24"><path d="M6 15l6-6 6 6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    down:'<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };
  return icons[name]||"";
}

/* ============================================================
   TASKS / KANBAN
   ============================================================ */
let taskFilters = {search:"", category:"", priority:""};
let draggedTaskId = null;

function populateTaskFilterSelects(){
  const catSel = document.getElementById("taskFilterCategory");
  const prSel = document.getElementById("taskFilterPriority");
  const curCat = catSel.value, curPr = prSel.value;
  catSel.innerHTML = '<option value="">Todas categorias</option>'+categories().map(c=>'<option value="'+escapeHtml(c)+'">'+escapeHtml(c)+'</option>').join("");
  prSel.innerHTML = '<option value="">Todas prioridades</option>'+PRIORITIES.map(p=>'<option value="'+p+'">'+p+'</option>').join("");
  catSel.value = categories().includes(curCat) ? curCat : "";
  prSel.value = curPr;
}

function renderTasks(){
  populateTaskFilterSelects();
  const board = document.getElementById("kanbanBoard");
  const today = todayStr();
  let filtered = state.tasks.filter(t=>{
    if(taskFilters.search && !(t.name.toLowerCase().includes(taskFilters.search.toLowerCase()))) return false;
    if(taskFilters.category && t.category!==taskFilters.category) return false;
    if(taskFilters.priority && t.priority!==taskFilters.priority) return false;
    return true;
  });

  board.innerHTML = STATUSES.map(status=>{
    const items = filtered.filter(t=>t.status===status).sort((a,b)=>(a.order||0)-(b.order||0));
    return '<div class="kanban-col" data-status="'+status+'">'+
      '<div class="kanban-col-head"><span>'+status+'</span><span class="count">'+items.length+'</span></div>'+
      '<div class="kanban-cards" data-status="'+status+'">'+
        items.map((t,i)=> taskCardHTML(t, today, i, items.length)).join("")+
      '</div>'+
    '</div>';
  }).join("");

  // drag events on cards (entre colunas)
  board.querySelectorAll(".task-card").forEach(card=>{
    card.addEventListener("dragstart", e=>{
      draggedTaskId = card.dataset.id;
      card.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
    });
    card.addEventListener("dragend", ()=> card.classList.remove("dragging"));
  });
  board.querySelectorAll(".kanban-col").forEach(col=>{
    col.addEventListener("dragover", e=>{ e.preventDefault(); col.classList.add("drag-over"); });
    col.addEventListener("dragleave", ()=> col.classList.remove("drag-over"));
    col.addEventListener("drop", e=>{
      e.preventDefault();
      col.classList.remove("drag-over");
      const task = state.tasks.find(t=>t.id===draggedTaskId);
      if(task){
        const prevStatus = task.status;
        task.status = col.dataset.status;
        if(task.status==="Concluído" && !task.completedAt){
          handleTaskCompletion(task);
        }
        if(task.status!==prevStatus && task.status!=="Concluído"){
          const colItems = state.tasks.filter(x=>x.status===task.status);
          task.order = nextOrder(colItems);
        }
        saveState();
        renderTasks();
        if(!document.getElementById("view-goals").classList.contains("hidden")) renderGoals();
      }
    });
  });

  // card actions
  board.querySelectorAll("[data-action]").forEach(btn=>{
    btn.addEventListener("click", e=>{
      e.stopPropagation();
      const id = btn.closest(".task-card").dataset.id;
      const action = btn.dataset.action;
      const task = state.tasks.find(t=>t.id===id);
      if(action==="edit") openTaskModal(task);
      if(action==="delete") deleteTask(id);
      if(action==="duplicate") duplicateTask(id);
      if(action==="up" || action==="down") reorderTaskCard(task, action==="up"?-1:1);
      if(action==="timer") toggleTaskTimer(task);
    });
  });
}

function reorderTaskCard(task, dir){
  const colItems = state.tasks.filter(t=>t.status===task.status).sort((a,b)=>(a.order||0)-(b.order||0));
  moveOrder(colItems, task, dir);
  saveState(); renderTasks();
}

function toggleTaskTimer(task){
  if(task.timerStart){
    task.timeSpent = (task.timeSpent||0) + (Date.now()-task.timerStart);
    task.timerStart = null;
  }else{
    // pausa qualquer outro timer ativo
    state.tasks.forEach(t=>{ if(t.timerStart){ t.timeSpent=(t.timeSpent||0)+(Date.now()-t.timerStart); t.timerStart=null; } });
    task.timerStart = Date.now();
  }
  saveState(); renderTasks();
}

function handleTaskCompletion(task){
  task.completedAt = Date.now();
  if(task.timerStart){
    task.timeSpent = (task.timeSpent||0) + (Date.now()-task.timerStart);
    task.timerStart = null;
  }
  if(task.goalId){
    const goal = state.goals.find(g=>g.id===task.goalId);
    if(goal){
      goal.current = (goal.current||0) + (task.quantity!=null ? task.quantity : (task.targetQty||0));
      recalcGoalTasks(goal);
    }
  }
}

function taskCardHTML(t, today, idx, total){
  const overdue = t.status!=="Concluído" && t.dueDate && t.dueDate<today;
  const subDone = (t.subtasks||[]).filter(s=>s.done).length;
  const subTotal = (t.subtasks||[]).length;
  const ms = totalTaskTimeMs(t);
  return '<div class="task-card" draggable="true" data-id="'+t.id+'">'+
    '<div class="tc-top">'+
      '<div class="tc-title">'+escapeHtml(t.name)+'</div>'+
      '<div class="tc-actions">'+
        '<button data-action="up" title="Mover para cima" '+(idx===0?"disabled":"")+'>'+icon("up")+'</button>'+
        '<button data-action="down" title="Mover para baixo" '+(idx===total-1?"disabled":"")+'>'+icon("down")+'</button>'+
        '<button data-action="edit" title="Editar">'+icon("edit")+'</button>'+
        '<button data-action="duplicate" title="Duplicar">'+icon("copy")+'</button>'+
        '<button data-action="delete" title="Excluir">'+icon("trash")+'</button>'+
      '</div>'+
    '</div>'+
    (t.desc?'<div class="tc-desc">'+escapeHtml(t.desc)+'</div>':'')+
    '<div class="tc-meta">'+
      '<span class="badge '+priorityBadgeClass(t.priority)+'">'+escapeHtml(t.priority)+'</span>'+
      '<span class="badge badge-muted">'+escapeHtml(t.category)+'</span>'+
      (t.dueDate?'<span class="tc-due'+(overdue?' overdue':'')+'">'+fmtDate(t.dueDate)+'</span>':'')+
      (subTotal?'<span class="badge badge-muted">☑ '+subDone+'/'+subTotal+'</span>':'')+
      (t.quantity!=null?'<span class="badge badge-gold">Qtd: '+t.quantity+'</span>':(t.targetQty?'<span class="badge badge-gold">Meta dia: '+t.targetQty+'</span>':''))+
    '</div>'+
    '<div class="tc-timer">'+
      '<button class="tc-timer-btn'+(t.timerStart?" is-running":"")+'" data-action="timer">'+icon(t.timerStart?"pause":"play")+' '+(t.timerStart?"Em andamento":"Cronometrar")+'</button>'+
      '<span class="tc-time">'+fmtDuration(ms)+'</span>'+
    '</div>'+
  '</div>';
}

function deleteTask(id){
  state.tasks = state.tasks.filter(t=>t.id!==id);
  saveState(); renderTasks(); toast("Tarefa excluída","danger");
}
function duplicateTask(id){
  const t = state.tasks.find(t=>t.id===id);
  if(!t) return;
  const colItems = state.tasks.filter(x=>x.status===t.status);
  state.tasks.push(Object.assign({}, t, {id:uid(), name:t.name+" (cópia)", createdAt:Date.now(), completedAt:null, order:nextOrder(colItems), timerStart:null, timeSpent:0, subtasks:(t.subtasks||[]).map(s=>({id:uid(),name:s.name,done:false}))}));
  saveState(); renderTasks(); toast("Tarefa duplicada","success");
}

function subtaskRowsHTML(subtasks){
  return (subtasks||[]).map(s=>
    '<div class="subtask-row" data-id="'+s.id+'">'+
      '<input type="checkbox" class="sub-done" '+(s.done?"checked":"")+'>'+
      '<input type="text" class="sub-name" value="'+escapeHtml(s.name)+'">'+
      '<button type="button" class="sub-remove">&times;</button>'+
    '</div>'
  ).join("");
}

function openTaskModal(task){
  const isEdit = !!task;
  const t = task || {name:"",desc:"",category:categories()[0],priority:"Média",dueDate:"",estimate:"",status:"Backlog",subtasks:[],quantity:null};
  const showQty = isQtyCategory(t.category);
  openModal(isEdit?"Editar tarefa":"Nova tarefa",
    '<form id="taskForm">'+
      '<div class="form-field"><label>Nome</label><input type="text" id="fName" value="'+escapeHtml(t.name)+'" required></div>'+
      '<div class="form-field"><label>Descrição</label><textarea id="fDesc">'+escapeHtml(t.desc||"")+'</textarea></div>'+
      '<div class="form-row">'+
        '<div class="form-field"><label>Categoria</label><select id="fCategory">'+categories().map(c=>'<option '+(c===t.category?"selected":"")+'>'+escapeHtml(c)+'</option>').join("")+'</select></div>'+
        '<div class="form-field"><label>Prioridade</label><select id="fPriority">'+PRIORITIES.map(p=>'<option '+(p===t.priority?"selected":"")+'>'+p+'</option>').join("")+'</select></div>'+
      '</div>'+
      '<div class="form-row">'+
        '<div class="form-field"><label>Data limite</label><input type="date" id="fDue" value="'+(t.dueDate||"")+'"></div>'+
        '<div class="form-field"><label>Tempo estimado</label><input type="text" id="fEstimate" value="'+escapeHtml(t.estimate||"")+'" placeholder="ex: 2h"></div>'+
      '</div>'+
      '<div class="form-field"><label>Status</label><select id="fStatus">'+STATUSES.map(s=>'<option '+(s===t.status?"selected":"")+'>'+s+'</option>').join("")+'</select></div>'+
      '<div class="form-field" id="qtyField" style="'+(showQty?"":"display:none")+'"><label>Quantidade realizada</label><input type="number" id="fQuantity" min="0" value="'+(t.quantity!=null?t.quantity:"")+'" placeholder="ex: quantos anúncios/cadastros você concluiu"></div>'+
      '<div class="form-field"><label>Subtarefas</label><div id="subtasksList">'+subtaskRowsHTML(t.subtasks)+'</div>'+
        '<button type="button" class="btn" id="btnAddSubtask">+ Adicionar subtarefa</button>'+
      '</div>'+
      '<div class="modal-actions"><button type="button" class="btn" id="btnCancelModal">Cancelar</button><button type="submit" class="btn btn-primary">Salvar</button></div>'+
    '</form>',
    box=>{
      box.querySelector("#btnCancelModal").addEventListener("click", closeModal);
      box.querySelector("#fCategory").addEventListener("change", ()=>{
        box.querySelector("#qtyField").style.display = isQtyCategory(box.querySelector("#fCategory").value) ? "" : "none";
      });
      box.querySelector("#btnAddSubtask").addEventListener("click", ()=>{
        box.querySelector("#subtasksList").insertAdjacentHTML("beforeend", subtaskRowsHTML([{id:uid(),name:"",done:false}]));
        bindSubtaskRemovers(box);
      });
      bindSubtaskRemovers(box);
      box.querySelector("#taskForm").addEventListener("submit", e=>{
        e.preventDefault();
        const subtasks = Array.from(box.querySelectorAll("#subtasksList .subtask-row")).map(row=>({
          id: row.dataset.id, name: row.querySelector(".sub-name").value.trim(), done: row.querySelector(".sub-done").checked
        })).filter(s=>s.name);
        const qtyVal = box.querySelector("#fQuantity").value;
        const data = {
          name: box.querySelector("#fName").value.trim(),
          desc: box.querySelector("#fDesc").value.trim(),
          category: box.querySelector("#fCategory").value,
          priority: box.querySelector("#fPriority").value,
          dueDate: box.querySelector("#fDue").value,
          estimate: box.querySelector("#fEstimate").value.trim(),
          status: box.querySelector("#fStatus").value,
          subtasks,
          quantity: qtyVal==="" ? null : +qtyVal,
        };
        if(isEdit){
          const wasCompleted = task.status==="Concluído";
          Object.assign(task, data);
          if(data.status==="Concluído" && !wasCompleted) handleTaskCompletion(task);
        }else{
          const colItems = state.tasks.filter(x=>x.status===data.status);
          state.tasks.push(Object.assign({id:uid(),createdAt:Date.now(),completedAt:null,order:nextOrder(colItems),timeSpent:0,timerStart:null}, data));
        }
        saveState(); closeModal(); renderTasks(); toast("Tarefa salva","success");
      });
    }
  );
}
function bindSubtaskRemovers(box){
  box.querySelectorAll(".sub-remove").forEach(btn=>{
    btn.onclick = ()=> btn.closest(".subtask-row").remove();
  });
}
document.getElementById("btnNewTask").addEventListener("click", ()=>openTaskModal(null));
document.getElementById("taskSearch").addEventListener("input", e=>{ taskFilters.search=e.target.value; renderTasks(); });
document.getElementById("taskFilterCategory").addEventListener("change", e=>{ taskFilters.category=e.target.value; renderTasks(); });
document.getElementById("taskFilterPriority").addEventListener("change", e=>{ taskFilters.priority=e.target.value; renderTasks(); });

/* ============================================================
   RECURRING TASKS
   ============================================================ */
function freqLabel(r){
  if(r.frequency==="Dias da semana") return "Dias da semana: "+(r.weekdays||[]).map(w=>WEEKDAYS[w]).join(", ");
  if(r.frequency==="Mensal") return "Mensal · dia "+(r.dayOfMonth||1);
  return r.frequency;
}
function renderRecurring(){
  const tbody = document.querySelector("#recurringTable tbody");
  const sorted = state.recurring.slice().sort((a,b)=>(a.order||0)-(b.order||0));
  tbody.innerHTML = sorted.map((r,i)=>
    '<tr data-id="'+r.id+'">'+
      '<td class="row-actions"><button data-action="up" '+(i===0?"disabled":"")+'>'+icon("up")+'</button><button data-action="down" '+(i===sorted.length-1?"disabled":"")+'>'+icon("down")+'</button></td>'+
      '<td>'+escapeHtml(r.name)+'</td>'+
      '<td>'+escapeHtml(r.category)+'</td>'+
      '<td><span class="badge '+priorityBadgeClass(r.priority)+'">'+r.priority+'</span></td>'+
      '<td>'+freqLabel(r)+'</td>'+
      '<td>'+(r.lastGenerated?fmtDate(r.lastGenerated):"—")+'</td>'+
      '<td class="row-actions"><button data-action="del">'+icon("trash")+'</button></td>'+
    '</tr>'
  ).join("") || '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:24px;">Nenhuma tarefa recorrente cadastrada.</td></tr>';

  tbody.querySelectorAll("tr[data-id]").forEach(row=>{
    const r = state.recurring.find(x=>x.id===row.dataset.id);
    row.querySelectorAll("[data-action]").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const action = btn.dataset.action;
        if(action==="del"){
          state.recurring = state.recurring.filter(x=>x.id!==r.id);
          saveState(); renderRecurring(); toast("Recorrência removida","danger");
          return;
        }
        const list = state.recurring.slice().sort((a,b)=>(a.order||0)-(b.order||0));
        moveOrder(list, r, action==="up"?-1:1);
        saveState(); renderRecurring(); toast("Ordem atualizada","success");
      });
    });
  });
}

function weekdayCheckboxes(selected){
  selected = selected||[];
  return WEEKDAYS.map((w,i)=>
    '<label class="weekday-chip"><input type="checkbox" value="'+i+'" '+(selected.includes(i)?"checked":"")+'>'+w+'</label>'
  ).join("");
}

function openRecurringModal(){
  openModal("Nova tarefa recorrente",
    '<form id="recForm">'+
      '<div class="form-field"><label>Nome</label><input type="text" id="rName" required placeholder="ex: Atualizar estoque"></div>'+
      '<div class="form-row">'+
        '<div class="form-field"><label>Categoria</label><select id="rCategory">'+categories().map(c=>'<option>'+escapeHtml(c)+'</option>').join("")+'</select></div>'+
        '<div class="form-field"><label>Prioridade</label><select id="rPriority">'+PRIORITIES.map(p=>'<option>'+p+'</option>').join("")+'</select></div>'+
      '</div>'+
      '<div class="form-field"><label>Recorrência</label><select id="rFreq">'+FREQUENCIES.map(f=>'<option>'+f+'</option>').join("")+'</select></div>'+
      '<div class="form-field" id="rWeekdaysField" style="display:none"><label>Em quais dias aparece no quadro?</label><div class="weekday-picker">'+weekdayCheckboxes([])+'</div></div>'+
      '<div class="form-field" id="rDomField" style="display:none"><label>Dia do mês</label><input type="number" id="rDayOfMonth" min="1" max="31" value="1"></div>'+
      '<div class="form-field"><label>Subtarefas padrão (uma por linha)</label><textarea id="rSubtasks" placeholder="Importar Pedidos&#10;Emitir Notas Fiscais&#10;Gerar Etiquetas&#10;Enviar pedidos para separação do estoque"></textarea></div>'+
      '<div class="modal-actions"><button type="button" class="btn" id="btnCancelModal">Cancelar</button><button type="submit" class="btn btn-primary">Criar</button></div>'+
    '</form>',
    box=>{
      box.querySelector("#btnCancelModal").addEventListener("click", closeModal);
      const freqSel = box.querySelector("#rFreq");
      function toggleFreqFields(){
        box.querySelector("#rWeekdaysField").style.display = freqSel.value==="Dias da semana" ? "" : "none";
        box.querySelector("#rDomField").style.display = freqSel.value==="Mensal" ? "" : "none";
      }
      freqSel.addEventListener("change", toggleFreqFields);
      toggleFreqFields();
      box.querySelector("#recForm").addEventListener("submit", e=>{
        e.preventDefault();
        const weekdays = Array.from(box.querySelectorAll("#rWeekdaysField input:checked")).map(c=>+c.value);
        const subtasksTemplate = box.querySelector("#rSubtasks").value.split("\n").map(s=>s.trim()).filter(Boolean).map(name=>({name}));
        state.recurring.push({
          id:uid(), name:box.querySelector("#rName").value.trim(),
          category:box.querySelector("#rCategory").value, priority:box.querySelector("#rPriority").value,
          frequency:freqSel.value, weekdays, dayOfMonth:+box.querySelector("#rDayOfMonth").value||1,
          subtasksTemplate, lastGenerated:null, order:nextOrder(state.recurring)
        });
        saveState(); closeModal(); processRecurring(); renderRecurring(); toast("Recorrência criada","success");
      });
    }
  );
}
document.getElementById("btnNewRecurring").addEventListener("click", openRecurringModal);

/* ============================================================
   GOALS — automação de desdobramento em tarefas
   ============================================================ */
function renderGoals(){
  const grid = document.getElementById("goalsGrid");
  const todayIso = todayStr();
  grid.innerHTML = state.goals.map(g=>{
    const pct = Math.min(100, Math.round((g.current/g.target)*100) || 0);
    const remaining = Math.max(0,(g.target||0)-(g.current||0));
    const daysLeft = g.deadline ? Math.max(0, daysBetween(new Date(todayIso+"T00:00:00"), new Date(g.deadline+"T00:00:00"))+1) : null;
    const pending = state.tasks.filter(t=>t.goalId===g.id && t.status!=="Concluído").length;
    return '<div class="goal-card">'+
      '<div class="goal-head"><span class="goal-name">'+escapeHtml(g.name)+'</span><span class="goal-pct">'+pct+'%</span></div>'+
      '<div class="goal-sub">'+g.current+' de '+g.target+' '+(g.unit||"")+(g.deadline?' · prazo '+fmtDate(g.deadline):'')+'</div>'+
      '<div class="progress-track"><div class="progress-fill" style="width:'+pct+'%"></div></div>'+
      '<div class="goal-auto">'+
        (remaining>0 ? ('Faltam <strong>'+remaining+'</strong> '+(g.unit||"")+(daysLeft!=null?' em <strong>'+daysLeft+'</strong> dia(s)':'')+'. '+pending+' tarefa(s) automática(s) geradas.') : 'Meta concluída! 🎉')+
      '</div>'+
      '<div class="goal-actions">'+
        '<button class="btn" data-action="edit" data-id="'+g.id+'">Editar</button>'+
        '<button class="btn btn-danger" data-action="del" data-id="'+g.id+'">'+icon("trash")+'</button>'+
      '</div>'+
    '</div>';
  }).join("") || '<p style="color:var(--text-muted)">Nenhuma meta cadastrada. Clique em "Nova meta" para começar.</p>';

  grid.querySelectorAll("[data-action]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const g = state.goals.find(x=>x.id===btn.dataset.id);
      if(!g) return;
      if(btn.dataset.action==="edit") openGoalModal(g);
      if(btn.dataset.action==="del"){
        state.tasks = state.tasks.filter(t=>!(t.goalId===g.id && t.status!=="Concluído"));
        state.goals = state.goals.filter(x=>x.id!==g.id);
        saveState(); renderGoals(); toast("Meta removida","danger");
      }
    });
  });
}

function openGoalModal(goal){
  const isEdit = !!goal;
  const g = goal || {name:"",target:100,current:0,unit:"unid.",category:categories()[0],startDate:todayStr(),deadline:"",businessDaysOnly:true};
  openModal(isEdit?"Editar meta":"Nova meta",
    '<form id="goalForm">'+
      '<div class="form-field"><label>Nome da meta</label><input type="text" id="gName" required value="'+escapeHtml(g.name)+'" placeholder="ex: Cadastrar 100 SKU no TikTok"></div>'+
      '<div class="form-row">'+
        '<div class="form-field"><label>Meta (total)</label><input type="number" id="gTarget" required min="1" value="'+g.target+'"></div>'+
        '<div class="form-field"><label>Já realizado</label><input type="number" id="gCurrent" min="0" value="'+(g.current||0)+'"></div>'+
      '</div>'+
      '<div class="form-row">'+
        '<div class="form-field"><label>Unidade</label><input type="text" id="gUnit" value="'+escapeHtml(g.unit||"unid.")+'" placeholder="ex: SKU, anúncios"></div>'+
        '<div class="form-field"><label>Categoria das tarefas geradas</label><select id="gCategory">'+categories().map(c=>'<option '+(c===g.category?"selected":"")+'>'+escapeHtml(c)+'</option>').join("")+'</select></div>'+
      '</div>'+
      '<div class="form-row">'+
        '<div class="form-field"><label>Início</label><input type="date" id="gStart" value="'+(g.startDate||todayStr())+'"></div>'+
        '<div class="form-field"><label>Prazo final</label><input type="date" id="gDeadline" required value="'+(g.deadline||"")+'"></div>'+
      '</div>'+
      '<div class="form-field"><label class="checkbox-label"><input type="checkbox" id="gBizDays" '+(g.businessDaysOnly!==false?"checked":"")+'> Distribuir apenas em dias úteis (seg–sex)</label></div>'+
      '<p class="panel-hint">O sistema cria automaticamente uma tarefa por dia até o prazo, dividindo igualmente a quantidade restante.</p>'+
      '<div class="modal-actions"><button type="button" class="btn" id="btnCancelModal">Cancelar</button><button type="submit" class="btn btn-primary">Salvar e gerar tarefas</button></div>'+
    '</form>',
    box=>{
      box.querySelector("#btnCancelModal").addEventListener("click", closeModal);
      box.querySelector("#goalForm").addEventListener("submit", e=>{
        e.preventDefault();
        const data = {
          name: box.querySelector("#gName").value.trim(),
          target: +box.querySelector("#gTarget").value,
          current: +box.querySelector("#gCurrent").value,
          unit: box.querySelector("#gUnit").value.trim()||"unid.",
          category: box.querySelector("#gCategory").value,
          startDate: box.querySelector("#gStart").value || todayStr(),
          deadline: box.querySelector("#gDeadline").value,
          businessDaysOnly: box.querySelector("#gBizDays").checked,
        };
        let g;
        if(isEdit){
          state.tasks = state.tasks.filter(t=>!(t.goalId===goal.id && t.status!=="Concluído"));
          Object.assign(goal, data);
          g = goal;
        }else{
          g = Object.assign({id:uid(), generatedTaskIds:[]}, data);
          state.goals.push(g);
        }
        recalcGoalTasks(g);
        saveState(); closeModal(); renderGoals(); toast("Meta salva e tarefas geradas automaticamente","success");
      });
    }
  );
}
document.getElementById("btnNewGoal").addEventListener("click", ()=>openGoalModal(null));

/* ============================================================
   TIME TRACKING (jornada de trabalho)
   ============================================================ */
let timeTickInterval = null;

function setActiveSegment(type){
  const now = Date.now();
  if(state.activeTimer){
    state.timeLog.push({
      id:uid(), date:todayStr(), type:state.activeTimer.type,
      start:state.activeTimer.start, end:now
    });
  }
  if(type==="end"){
    state.activeTimer = null;
  }else{
    state.activeTimer = {type, start:now};
  }
  saveState();
  renderTime();
}
document.querySelectorAll("[data-time]").forEach(btn=>{
  btn.addEventListener("click", ()=> setActiveSegment(btn.dataset.time));
});

function renderTime(){
  const badge = document.getElementById("timeStatusBadge");
  const labelMap = {work:"Trabalhando",pause:"Pausado",lunch:"Almoço",meeting:"Reunião"};
  badge.className = "time-badge";
  if(state.activeTimer){
    badge.textContent = labelMap[state.activeTimer.type] || "Ativo";
    badge.classList.add("is-"+(state.activeTimer.type==="work"?"working":state.activeTimer.type));
  }else{
    badge.textContent = "Parado";
  }

  if(timeTickInterval) clearInterval(timeTickInterval);
  tickElapsed();
  timeTickInterval = setInterval(tickElapsed, 1000);

  const today = todayStr();
  const todayLogs = state.timeLog.filter(l=>l.date===today);
  const sums = {work:0,pause:0,lunch:0,meeting:0};
  todayLogs.forEach(l=>{ sums[l.type] = (sums[l.type]||0) + (l.end-l.start); });
  if(state.activeTimer) sums[state.activeTimer.type] = (sums[state.activeTimer.type]||0) + (Date.now()-state.activeTimer.start);

  document.getElementById("timeSummaryToday").innerHTML =
    '<div><span>Tempo produtivo</span><strong>'+fmtHoursMin(sums.work)+'</strong></div>'+
    '<div><span>Pausas</span><strong>'+fmtHoursMin(sums.pause)+'</strong></div>'+
    '<div><span>Almoço</span><strong>'+fmtHoursMin(sums.lunch)+'</strong></div>'+
    '<div><span>Reuniões</span><strong>'+fmtHoursMin(sums.meeting)+'</strong></div>';

  const tbody = document.querySelector("#timeLogTable tbody");
  const rows = todayLogs.slice().reverse();
  const labelType = {work:"Trabalho",pause:"Pausa",lunch:"Almoço",meeting:"Reunião"};
  tbody.innerHTML = rows.map(l=>
    '<tr><td>'+labelType[l.type]+'</td><td>'+fmtDateTime(l.start)+'</td><td>'+(l.end?fmtDateTime(l.end):"—")+'</td><td>'+fmtDuration(l.end-l.start)+'</td></tr>'
  ).join("") || '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:20px;">Nenhum registro hoje ainda.</td></tr>';
}
function tickElapsed(){
  const el = document.getElementById("timeElapsed");
  if(!el) return;
  if(state.activeTimer){
    el.textContent = fmtDuration(Date.now()-state.activeTimer.start);
  }else{
    el.textContent = "00:00:00";
  }
}

/* ============================================================
   FOCUS / POMODORO
   ============================================================ */
let focusMode = "pomodoro";
let focusTimer = null;
let focusRemaining = 25*60;
let focusPhase = "Foco";
let focusRunning = false;
let focusDurationSec = 25*60;

document.getElementById("focusModeSwitch").addEventListener("click", e=>{
  const btn = e.target.closest(".mode-btn");
  if(!btn) return;
  focusMode = btn.dataset.mode;
  document.querySelectorAll(".mode-btn").forEach(b=>b.classList.toggle("is-active", b===btn));
  document.getElementById("blockForm").classList.toggle("hidden", focusMode!=="block");
  resetFocusTimer();
});

function resetFocusTimer(){
  clearInterval(focusTimer); focusTimer=null; focusRunning=false;
  if(focusMode==="pomodoro"){ focusDurationSec = 25*60; focusPhase="Foco"; }
  if(focusMode==="deep"){ focusDurationSec = 50*60; focusPhase="Deep Work"; }
  if(focusMode==="block"){ focusDurationSec = (+document.getElementById("blockMinutes").value||50)*60; focusPhase="Time Blocking"; }
  focusRemaining = focusDurationSec;
  updateFocusDisplay();
}
function updateFocusDisplay(){
  const m = Math.floor(focusRemaining/60), s = focusRemaining%60;
  document.getElementById("pomodoroClock").textContent = pad(m)+":"+pad(s);
  document.getElementById("pomodoroPhase").textContent = focusPhase;
}
document.getElementById("btnPomodoroStart").addEventListener("click", ()=>{
  if(focusRunning) return;
  focusRunning = true;
  focusTimer = setInterval(()=>{
    focusRemaining--;
    if(focusRemaining<=0){
      completeFocusSession();
    }
    updateFocusDisplay();
  },1000);
});
document.getElementById("btnPomodoroPause").addEventListener("click", ()=>{
  focusRunning=false; clearInterval(focusTimer);
});
document.getElementById("btnPomodoroReset").addEventListener("click", resetFocusTimer);

function completeFocusSession(){
  clearInterval(focusTimer); focusRunning=false;
  const today = todayStr();
  if(state.pomodoroDate !== today){ state.pomodoroDate = today; state.pomodoroCyclesToday = 0; }
  state.focusSessions.push({id:uid(), date:today, type:focusPhase, duration:focusDurationSec, completed:true});
  if(focusMode==="pomodoro"){
    if(focusPhase==="Foco"){
      state.pomodoroCyclesToday++;
      focusPhase = "Pausa"; focusRemaining = 5*60; focusDurationSec=5*60;
    }else{
      focusPhase = "Foco"; focusRemaining = 25*60; focusDurationSec=25*60;
    }
  }else{
    focusRemaining = 0;
  }
  saveState();
  renderFocus();
  toast("Sessão de foco concluída!","success");
  updateFocusDisplay();
}

function renderFocus(){
  const today = todayStr();
  if(state.pomodoroDate !== today){ state.pomodoroDate = today; state.pomodoroCyclesToday = 0; saveState(); }
  document.getElementById("statCycles").textContent = state.pomodoroCyclesToday;
  const focusMs = state.focusSessions.filter(s=>s.date===today).reduce((s,x)=>s+x.duration*1000,0);
  document.getElementById("statFocusHours").textContent = fmtHoursMin(focusMs);

  const week = startOfWeek(new Date());
  const days = [];
  for(let i=0;i<7;i++){
    const d = new Date(week); d.setDate(week.getDate()+i);
    const iso = d.toISOString().slice(0,10);
    const ms = state.focusSessions.filter(s=>s.date===iso).reduce((s,x)=>s+x.duration*1000,0);
    days.push({label:WEEKDAYS[d.getDay()], ms});
  }
  const max = Math.max(1, ...days.map(d=>d.ms));
  document.getElementById("focusRanking").innerHTML = days.map(d=>
    '<div class="rank-row"><span style="width:34px">'+d.label+'</span><div class="rank-bar"><div class="rank-bar-fill" style="width:'+Math.round((d.ms/max)*100)+'%"></div></div><span>'+fmtHoursMin(d.ms)+'</span></div>'
  ).join("");

  const tbody = document.querySelector("#focusHistoryTable tbody");
  const sessions = state.focusSessions.slice().reverse().slice(0,30);
  tbody.innerHTML = sessions.map(s=>
    '<tr><td>'+fmtDate(s.date)+'</td><td>'+s.type+'</td><td>'+Math.round(s.duration/60)+' min</td><td><span class="badge badge-low">Concluída</span></td></tr>'
  ).join("") || '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:20px;">Nenhuma sessão registrada.</td></tr>';

  updateFocusDisplay();
}

/* ============================================================
   TRACKING (acompanhamentos: reclamações, protocolos, devoluções...)
   ============================================================ */
let trackingFilters = {type:"", marketplace:""};

function populateTrackingFilterSelects(){
  const typeSel = document.getElementById("trackingFilterType");
  const mpSel = document.getElementById("trackingFilterMarketplace");
  const curType = typeSel.value, curMp = mpSel.value;
  typeSel.innerHTML = '<option value="">Todos os tipos</option>'+trackingTypes().map(t=>'<option value="'+escapeHtml(t)+'">'+escapeHtml(t)+'</option>').join("");
  mpSel.innerHTML = '<option value="">Todos os marketplaces</option>'+marketplaces().map(m=>'<option value="'+m.key+'">'+escapeHtml(m.name)+'</option>').join("");
  typeSel.value = trackingTypes().includes(curType) ? curType : "";
  mpSel.value = curMp;
}

function renderTracking(){
  populateTrackingFilterSelects();
  const today = todayStr();
  const open = state.tracking.filter(p=>p.status!=="Resolvido");
  const overdueCount = open.filter(p=>p.deadline && p.deadline<today).length;
  const byType = {};
  trackingTypes().forEach(t=> byType[t] = open.filter(p=>p.type===t).length);

  document.getElementById("trackingDashboard").innerHTML = [
    {label:"Total abertos",value:open.length},
    {label:"Atrasados",value:overdueCount, danger:overdueCount>0},
  ].concat(trackingTypes().map(t=>({label:t,value:byType[t]||0})))
   .map(c=>'<div class="stat-card"><div class="stat-value" style="'+(c.danger?"color:var(--danger)":"")+'">'+c.value+'</div><div class="stat-label">'+escapeHtml(c.label)+'</div></div>').join("");

  const ctx = document.getElementById("chartTracking");
  if(chartTracking) chartTracking.destroy();
  chartTracking = new Chart(ctx, {
    type:"bar",
    data:{ labels:marketplaces().map(m=>m.name), datasets:[{ label:"Pendências", data:marketplaces().map(m=>open.filter(p=>p.marketplace===m.key).length), backgroundColor:marketplaces().map(m=>m.color), borderRadius:6 }] },
    options:{ plugins:{legend:{display:false}}, scales:{ x:{grid:{display:false},ticks:{color:cssVar("--text-muted")}}, y:{beginAtZero:true,ticks:{color:cssVar("--text-muted")},grid:{color:cssVar("--border")}} } }
  });

  let filtered = state.tracking.filter(p=>{
    if(trackingFilters.type && p.type!==trackingFilters.type) return false;
    if(trackingFilters.marketplace && p.marketplace!==trackingFilters.marketplace) return false;
    return true;
  });
  const tbody = document.querySelector("#trackingTable tbody");
  const sorted = filtered.slice().sort((a,b)=>(a.deadline||"9999").localeCompare(b.deadline||"9999"));
  tbody.innerHTML = sorted.map(p=>{
    const overdue = p.status!=="Resolvido" && p.deadline && p.deadline<today;
    const soon = !overdue && p.status!=="Resolvido" && p.deadline && daysBetween(new Date(today+"T00:00:00"),new Date(p.deadline+"T00:00:00"))<=3;
    return '<tr class="'+(overdue?"row-overdue":soon?"row-soon":"")+'">'+
      '<td>'+escapeHtml(p.type)+'</td>'+
      '<td>'+escapeHtml(marketplaceName(p.marketplace))+'</td>'+
      '<td>'+escapeHtml(p.subject)+'</td>'+
      '<td>'+escapeHtml(p.status)+'</td>'+
      '<td>'+(p.deadline?fmtDate(p.deadline)+(overdue?' ⚠️':soon?' ⏳':''):'—')+'</td>'+
      '<td class="row-actions"><button data-action="edit" data-id="'+p.id+'">'+icon("edit")+'</button><button data-action="del" data-id="'+p.id+'">'+icon("trash")+'</button></td>'+
    '</tr>';
  }).join("") || '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:24px;">Nenhum acompanhamento cadastrado.</td></tr>';

  tbody.querySelectorAll("[data-action='edit']").forEach(b=>b.addEventListener("click", ()=>openTrackingModal(state.tracking.find(x=>x.id===b.dataset.id))));
  tbody.querySelectorAll("[data-action='del']").forEach(b=>b.addEventListener("click", ()=>{
    state.tracking = state.tracking.filter(x=>x.id!==b.dataset.id);
    saveState(); renderTracking(); toast("Removido","danger");
  }));
}
document.getElementById("trackingFilterType").addEventListener("change", e=>{ trackingFilters.type=e.target.value; renderTracking(); });
document.getElementById("trackingFilterMarketplace").addEventListener("change", e=>{ trackingFilters.marketplace=e.target.value; renderTracking(); });

function openTrackingModal(item){
  const isEdit = !!item;
  const p = item || {type:trackingTypes()[0],marketplace:marketplaces()[0]?marketplaces()[0].key:"",subject:"",status:"Aberto",deadline:"",notes:""};
  openModal(isEdit?"Editar acompanhamento":"Novo acompanhamento",
    '<form id="trkForm">'+
      '<div class="form-row">'+
        '<div class="form-field"><label>Tipo</label><select id="tType">'+trackingTypes().map(t=>'<option '+(t===p.type?"selected":"")+'>'+escapeHtml(t)+'</option>').join("")+'</select></div>'+
        '<div class="form-field"><label>Marketplace</label><select id="tMarketplace">'+marketplaces().map(m=>'<option value="'+m.key+'" '+(m.key===p.marketplace?"selected":"")+'>'+escapeHtml(m.name)+'</option>').join("")+'</select></div>'+
      '</div>'+
      '<div class="form-field"><label>Assunto</label><input type="text" id="tSubject" value="'+escapeHtml(p.subject)+'" required></div>'+
      '<div class="form-row">'+
        '<div class="form-field"><label>Status</label><select id="tStatus">'+TRACKING_STATUSES.map(x=>'<option '+(x===p.status?"selected":"")+'>'+x+'</option>').join("")+'</select></div>'+
        '<div class="form-field"><label>Prazo</label><input type="date" id="tDeadline" value="'+(p.deadline||"")+'"></div>'+
      '</div>'+
      '<div class="form-field"><label>Observações</label><textarea id="tNotes">'+escapeHtml(p.notes||"")+'</textarea></div>'+
      '<div class="modal-actions"><button type="button" class="btn" id="btnCancelModal">Cancelar</button><button type="submit" class="btn btn-primary">Salvar</button></div>'+
    '</form>',
    box=>{
      box.querySelector("#btnCancelModal").addEventListener("click", closeModal);
      box.querySelector("#trkForm").addEventListener("submit", e=>{
        e.preventDefault();
        const data = {
          type: box.querySelector("#tType").value, marketplace: box.querySelector("#tMarketplace").value,
          subject: box.querySelector("#tSubject").value.trim(), status: box.querySelector("#tStatus").value,
          deadline: box.querySelector("#tDeadline").value, notes: box.querySelector("#tNotes").value.trim()
        };
        if(isEdit) Object.assign(item, data);
        else state.tracking.push(Object.assign({id:uid()}, data));
        saveState(); closeModal(); renderTracking(); toast("Salvo","success");
      });
    }
  );
}
document.getElementById("btnNewTracking").addEventListener("click", ()=>openTrackingModal(null));

/* ============================================================
   CALENDAR
   ============================================================ */
let calDate = new Date();
function renderCalendar(){
  const year = calDate.getFullYear(), month = calDate.getMonth();
  document.getElementById("calLabel").textContent = MONTHS[month]+" "+year;
  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay();
  const daysInMonth = new Date(year, month+1, 0).getDate();
  const todayIso = todayStr();

  let cells = [];
  for(let i=0;i<startOffset;i++) cells.push(null);
  for(let d=1; d<=daysInMonth; d++) cells.push(d);
  while(cells.length%7!==0) cells.push(null);

  const events = collectCalendarEvents();

  let html = WEEKDAYS.map(w=>'<div class="cal-weekday">'+w+'</div>').join("");
  cells.forEach(d=>{
    if(d===null){ html += '<div class="cal-day is-other-month"></div>'; return; }
    const iso = year+"-"+pad(month+1)+"-"+pad(d);
    const dayEvents = events.filter(e=>e.date===iso);
    html += '<div class="cal-day'+(iso===todayIso?" is-today":"")+'">'+
      '<div class="cal-daynum">'+d+'</div>'+
      dayEvents.slice(0,3).map(e=>'<div class="cal-event ev-'+e.type+'" title="'+escapeHtml(e.label)+'">'+escapeHtml(e.label)+'</div>').join("")+
      (dayEvents.length>3?'<div class="cal-event ev-manual">+'+(dayEvents.length-3)+'</div>':"")+
    '</div>';
  });
  document.getElementById("calendarGrid").innerHTML = html;
}
function collectCalendarEvents(){
  const ev = [];
  state.tasks.forEach(t=>{ if(t.dueDate && t.status!=="Concluído") ev.push({date:t.dueDate, label:t.name, type: t.goalId?"goal":"task"}); });
  state.tracking.forEach(p=>{ if(p.deadline) ev.push({date:p.deadline, label:p.type+" — "+p.subject, type:"protocol"}); });
  state.calendarEvents.forEach(e=> ev.push({date:e.date, label:e.title, type:"manual"}));
  return ev;
}
document.getElementById("calPrev").addEventListener("click", ()=>{ calDate.setMonth(calDate.getMonth()-1); renderCalendar(); });
document.getElementById("calNext").addEventListener("click", ()=>{ calDate.setMonth(calDate.getMonth()+1); renderCalendar(); });
document.getElementById("btnNewEvent").addEventListener("click", ()=>{
  openModal("Novo evento",
    '<form id="evForm">'+
      '<div class="form-field"><label>Título</label><input type="text" id="evTitle" required></div>'+
      '<div class="form-field"><label>Data</label><input type="date" id="evDate" value="'+todayStr()+'" required></div>'+
      '<div class="modal-actions"><button type="button" class="btn" id="btnCancelModal">Cancelar</button><button type="submit" class="btn btn-primary">Adicionar</button></div>'+
    '</form>',
    box=>{
      box.querySelector("#btnCancelModal").addEventListener("click", closeModal);
      box.querySelector("#evForm").addEventListener("submit", e=>{
        e.preventDefault();
        state.calendarEvents.push({id:uid(), title:box.querySelector("#evTitle").value.trim(), date:box.querySelector("#evDate").value});
        saveState(); closeModal(); renderCalendar(); toast("Evento adicionado","success");
      });
    }
  );
});

/* ============================================================
   REPORTS
   ============================================================ */
function buildReport(type){
  const today = todayStr();
  if(type==="productivity"){
    const rows = [["Data","Tarefas do dia","Concluídas","Produtividade %"]];
    for(let i=13;i>=0;i--){
      const d=new Date(); d.setDate(d.getDate()-i);
      const iso=d.toISOString().slice(0,10);
      const dayTasks = state.tasks.filter(t=>t.dueDate===iso);
      const done = dayTasks.filter(t=>t.status==="Concluído").length;
      rows.push([fmtDate(iso), dayTasks.length, done, dayTasks.length?Math.round(done/dayTasks.length*100):0]);
    }
    return rows;
  }
  if(type==="time"){
    const rows = [["Data","Tipo","Início","Fim","Duração"]];
    state.timeLog.slice().reverse().forEach(l=> rows.push([fmtDate(l.date), l.type, fmtDateTime(l.start), l.end?fmtDateTime(l.end):"—", fmtDuration((l.end||Date.now())-l.start)]));
    return rows;
  }
  if(type==="timeByTask"){
    const rows = [["Tarefa","Categoria","Status","Tempo total"]];
    state.tasks.slice().sort((a,b)=>totalTaskTimeMs(b)-totalTaskTimeMs(a)).forEach(t=>{
      const ms = totalTaskTimeMs(t);
      if(ms>0) rows.push([t.name, t.category, t.status, fmtHoursMin(ms)]);
    });
    return rows;
  }
  if(type==="timeByCategory"){
    const rows = [["Categoria","Tempo total","% do total"]];
    const data = timeByCategoryData();
    const totalH = data.reduce((a,b)=>a+b,0) || 1;
    categories().forEach((c,i)=> rows.push([c, fmtHoursMin(data[i]*3600000), Math.round((data[i]/totalH)*100)+"%"]));
    return rows;
  }
  if(type==="tasks"){
    const rows = [["Nome","Categoria","Prioridade","Status","Data limite","Quantidade"]];
    state.tasks.filter(t=>t.status==="Concluído").forEach(t=> rows.push([t.name,t.category,t.priority,t.status,fmtDate(t.dueDate),t.quantity!=null?t.quantity:""]));
    return rows;
  }
  if(type==="goals"){
    const rows = [["Meta","Prazo","Meta total","Realizado","Percentual"]];
    state.goals.forEach(g=> rows.push([g.name, fmtDate(g.deadline), g.target, g.current, Math.round((g.current/g.target)*100)+"%"]));
    return rows;
  }
  if(type==="tracking"){
    const rows = [["Tipo","Marketplace","Assunto","Status","Prazo"]];
    state.tracking.forEach(p=> rows.push([p.type, marketplaceName(p.marketplace), p.subject, p.status, fmtDate(p.deadline)]));
    return rows;
  }
  return [["Sem dados"]];
}
function renderReportPreview(){
  const type = document.getElementById("reportType").value;
  const rows = buildReport(type);
  const html = '<table class="data-table"><thead><tr>'+rows[0].map(h=>'<th>'+escapeHtml(h)+'</th>').join("")+'</tr></thead><tbody>'+
    rows.slice(1).map(r=>'<tr>'+r.map(c=>'<td>'+escapeHtml(c)+'</td>').join("")+'</tr>').join("")+
    '</tbody></table>';
  document.getElementById("reportOutput").innerHTML = rows.length>1 ? html : '<p style="color:var(--text-muted)">Sem dados para este relatório ainda.</p>';
}
document.getElementById("reportType").addEventListener("change", renderReportPreview);
document.getElementById("btnExportCSV").addEventListener("click", ()=>{
  const type = document.getElementById("reportType").value;
  downloadFile("relatorio_"+type+"_"+todayStr()+".csv", toCSV(buildReport(type)), "text/csv");
  toast("CSV exportado","success");
});
document.getElementById("btnExportPDF").addEventListener("click", ()=>{
  window.print();
});

/* ============================================================
   SETTINGS — listas editáveis
   ============================================================ */
function renderCategoryEditor(){
  const el = document.getElementById("categoryEditor");
  el.innerHTML = categories().map((c,i)=>
    '<div class="list-editor-row" data-idx="'+i+'">'+
      '<input type="text" class="le-name" value="'+escapeHtml(c)+'">'+
      '<label class="checkbox-label le-qty-label"><input type="checkbox" class="le-qty" '+(isQtyCategory(c)?"checked":"")+'> tem quantidade</label>'+
      '<button type="button" class="le-remove">'+icon("trash")+'</button>'+
    '</div>'
  ).join("");
  el.querySelectorAll(".list-editor-row").forEach(row=>{
    const idx = +row.dataset.idx;
    const oldName = categories()[idx];
    row.querySelector(".le-name").addEventListener("change", e=>{
      const newName = e.target.value.trim();
      if(!newName) return;
      const prevName = categories()[idx];
      categories()[idx] = newName;
      if(isQtyCategory(prevName)){
        state.config.qtyCategories = state.config.qtyCategories.map(q=>q===prevName?newName:q);
      }
      state.tasks.forEach(t=>{ if(t.category===prevName) t.category=newName; });
      state.recurring.forEach(r=>{ if(r.category===prevName) r.category=newName; });
      state.goals.forEach(g=>{ if(g.category===prevName) g.category=newName; });
      saveState(); toast("Categoria atualizada","success");
    });
    row.querySelector(".le-qty").addEventListener("change", e=>{
      const name = categories()[idx];
      if(e.target.checked){
        if(!state.config.qtyCategories.includes(name)) state.config.qtyCategories.push(name);
      }else{
        state.config.qtyCategories = state.config.qtyCategories.filter(q=>q!==name);
      }
      saveState();
    });
    row.querySelector(".le-remove").addEventListener("click", ()=>{
      const name = categories()[idx];
      if(!confirm('Remover a categoria "'+name+'"? Tarefas existentes manterão o nome antigo.')) return;
      state.config.categories.splice(idx,1);
      state.config.qtyCategories = state.config.qtyCategories.filter(q=>q!==name);
      saveState(); renderCategoryEditor(); toast("Categoria removida","danger");
    });
  });
}
document.getElementById("categoryAddForm").addEventListener("submit", e=>{
  e.preventDefault();
  const input = document.getElementById("categoryAddInput");
  const name = input.value.trim();
  if(!name) return;
  state.config.categories.push(name);
  saveState(); input.value=""; renderCategoryEditor(); toast("Categoria adicionada","success");
});

function renderMarketplaceEditor(){
  const el = document.getElementById("marketplaceEditor");
  el.innerHTML = marketplaces().map((m,i)=>
    '<div class="list-editor-row" data-idx="'+i+'">'+
      '<input type="color" class="le-color" value="'+m.color+'">'+
      '<input type="text" class="le-name" value="'+escapeHtml(m.name)+'">'+
      '<button type="button" class="le-remove">'+icon("trash")+'</button>'+
    '</div>'
  ).join("");
  el.querySelectorAll(".list-editor-row").forEach(row=>{
    const idx = +row.dataset.idx;
    row.querySelector(".le-name").addEventListener("change", e=>{
      const newName = e.target.value.trim();
      if(!newName) return;
      marketplaces()[idx].name = newName;
      saveState(); toast("Marketplace atualizado","success");
    });
    row.querySelector(".le-color").addEventListener("change", e=>{
      marketplaces()[idx].color = e.target.value;
      saveState();
    });
    row.querySelector(".le-remove").addEventListener("click", ()=>{
      const key = marketplaces()[idx].key;
      if(!confirm('Remover este marketplace?')) return;
      state.config.marketplaces.splice(idx,1);
      saveState(); renderMarketplaceEditor(); toast("Marketplace removido","danger");
    });
  });
}
document.getElementById("marketplaceAddForm").addEventListener("submit", e=>{
  e.preventDefault();
  const input = document.getElementById("marketplaceAddInput");
  const colorInput = document.getElementById("marketplaceAddColor");
  const name = input.value.trim();
  if(!name) return;
  state.config.marketplaces.push({key:uid(), name, color:colorInput.value});
  saveState(); input.value=""; renderMarketplaceEditor(); toast("Marketplace adicionado","success");
});

function renderTrackingTypeEditor(){
  const el = document.getElementById("trackingTypeEditor");
  el.innerHTML = trackingTypes().map((t,i)=>
    '<div class="list-editor-row" data-idx="'+i+'">'+
      '<input type="text" class="le-name" value="'+escapeHtml(t)+'">'+
      '<button type="button" class="le-remove">'+icon("trash")+'</button>'+
    '</div>'
  ).join("");
  el.querySelectorAll(".list-editor-row").forEach(row=>{
    const idx = +row.dataset.idx;
    row.querySelector(".le-name").addEventListener("change", e=>{
      const newName = e.target.value.trim();
      if(!newName) return;
      const prevName = trackingTypes()[idx];
      trackingTypes()[idx] = newName;
      state.tracking.forEach(t=>{ if(t.type===prevName) t.type=newName; });
      saveState(); toast("Tipo atualizado","success");
    });
    row.querySelector(".le-remove").addEventListener("click", ()=>{
      if(!confirm('Remover este tipo de acompanhamento?')) return;
      state.config.trackingTypes.splice(idx,1);
      saveState(); renderTrackingTypeEditor(); toast("Tipo removido","danger");
    });
  });
}
document.getElementById("trackingTypeAddForm").addEventListener("submit", e=>{
  e.preventDefault();
  const input = document.getElementById("trackingTypeAddInput");
  const name = input.value.trim();
  if(!name) return;
  state.config.trackingTypes.push(name);
  saveState(); input.value=""; renderTrackingTypeEditor(); toast("Tipo adicionado","success");
});

document.getElementById("darkModeSwitch").addEventListener("change", e=>{
  state.theme = e.target.checked ? "dark" : "light";
  saveState(); applyTheme(); refreshCurrentCharts();
});
document.getElementById("btnBackup").addEventListener("click", ()=>{
  downloadFile("hubmarket_backup_"+todayStr()+".json", JSON.stringify(state,null,2), "application/json");
  toast("Backup baixado","success");
});
document.getElementById("inputRestore").addEventListener("change", e=>{
  const file = e.target.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = ()=>{
    try{
      const data = JSON.parse(reader.result);
      state = Object.assign(defaultState(), data);
      state.config = Object.assign(defaultState().config, data.config||{});
      saveState(); applyTheme(); goTo("dashboard");
      toast("Backup restaurado com sucesso","success");
    }catch(err){ toast("Arquivo inválido","danger"); }
  };
  reader.readAsText(file);
  e.target.value = "";
});
document.getElementById("inputImport").addEventListener("change", e=>{
  const file = e.target.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = ()=>{
    try{
      const data = JSON.parse(reader.result);
      Object.keys(data).forEach(k=>{ if(Array.isArray(data[k]) && Array.isArray(state[k])) state[k]=data[k]; });
      saveState(); toast("Dados importados","success");
    }catch(err){ toast("Arquivo inválido","danger"); }
  };
  reader.readAsText(file);
  e.target.value = "";
});
document.getElementById("btnExportTasksCSV").addEventListener("click", ()=>{
  const rows = [["Nome","Descrição","Categoria","Prioridade","Status","Data limite","Quantidade","Tempo gasto"]];
  state.tasks.forEach(t=> rows.push([t.name,t.desc,t.category,t.priority,t.status,fmtDate(t.dueDate),t.quantity!=null?t.quantity:"",fmtHoursMin(totalTaskTimeMs(t))]));
  downloadFile("tarefas_"+todayStr()+".csv", toCSV(rows), "text/csv");
  toast("CSV exportado","success");
});
document.getElementById("btnWipe").addEventListener("click", ()=>{
  if(confirm("Tem certeza que deseja apagar todos os dados do sistema? Esta ação não pode ser desfeita.")){
    state = defaultState();
    saveState(); applyTheme(); goTo("dashboard");
    toast("Todos os dados foram apagados","danger");
  }
});

/* ============================================================
   GLOBAL SEARCH
   ============================================================ */
const searchResultsEl = document.getElementById("searchResults");
document.getElementById("globalSearch").addEventListener("input", e=>{
  const q = e.target.value.trim().toLowerCase();
  if(!q){ searchResultsEl.classList.add("hidden"); return; }
  let results = [];
  state.tasks.forEach(t=>{ if(t.name.toLowerCase().includes(q)) results.push({label:t.name, sub:"Tarefa · "+t.status, section:"tasks"}); });
  state.tracking.forEach(p=>{ if((p.subject||"").toLowerCase().includes(q)) results.push({label:p.subject, sub:p.type+" · "+p.status, section:"tracking"}); });
  state.goals.forEach(g=>{ if(g.name.toLowerCase().includes(q)) results.push({label:g.name, sub:"Meta", section:"goals"}); });
  results = results.slice(0,12);
  searchResultsEl.innerHTML = results.map(r=>'<div class="search-result-item" data-section="'+r.section+'">'+escapeHtml(r.label)+'<small>'+escapeHtml(r.sub)+'</small></div>').join("") || '<div class="search-result-item">Nenhum resultado encontrado.</div>';
  searchResultsEl.classList.remove("hidden");
});
searchResultsEl.addEventListener("click", e=>{
  const item = e.target.closest("[data-section]");
  if(item){ goTo(item.dataset.section); searchResultsEl.classList.add("hidden"); document.getElementById("globalSearch").value=""; }
});
document.addEventListener("click", e=>{
  if(!e.target.closest(".search-wrap") && !e.target.closest(".search-results")) searchResultsEl.classList.add("hidden");
});

/* ============================================================
   INIT
   ============================================================ */
renderMap.dashboard = renderDashboard;
renderMap.tasks = renderTasks;
renderMap.recurring = renderRecurring;
renderMap.goals = renderGoals;
renderMap.time = renderTime;
renderMap.focus = renderFocus;
renderMap.tracking = renderTracking;
renderMap.calendar = renderCalendar;
renderMap.reports = renderReportPreview;
renderMap.settings = ()=>{ renderCategoryEditor(); renderMarketplaceEditor(); renderTrackingTypeEditor(); };

function setTopbarDate(){
  const now = new Date();
  const opts = {weekday:"long", day:"numeric", month:"long", year:"numeric"};
  document.getElementById("topbarDate").textContent = now.toLocaleDateString("pt-BR", opts);
}

function init(){
  applyTheme();
  setTopbarDate();
  processRecurring();
  recalcAllGoals();
  saveState();
  renderDashboard();
  renderTime();
  renderFocus();
  renderCalendar();
  renderReportPreview();
}
init();

})();

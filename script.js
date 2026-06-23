/* ==========================================================================
   HUBMARKET — script.js
   SaaS de gestão para Analista de E-commerce e Marketplaces
   100% client-side · LocalStorage · sem backend
   ========================================================================== */

(function(){
"use strict";

/* ============================================================
   CONSTANTS
   ============================================================ */
const DB_KEY = "hubmarket_db_v1";

const CATEGORIES = ["Estoque","Cadastro","Marketplace","Atendimento","Marketing","Financeiro","Outros"];
const PRIORITIES  = ["Baixa","Média","Alta","Crítica"];
const STATUSES    = ["Backlog","Hoje","Em andamento","Aguardando","Concluído"];
const FREQUENCIES = ["Diária","Semanal","Quinzenal","Mensal"];
const MARKETPLACES = [
  {key:"mercadolivre", name:"Mercado Livre", color:"#FFD400"},
  {key:"shopee",       name:"Shopee",        color:"#EE4D2D"},
  {key:"amazon",       name:"Amazon",        color:"#FF9900"},
  {key:"magalu",       name:"Magalu",        color:"#0086FF"},
  {key:"shein",        name:"Shein",         color:"#000000"},
];
const PROTOCOL_STATUSES = ["Aberto","Em análise","Aguardando marketplace","Resolvido"];
const PRODUCT_STATUSES  = ["Pendente","Em cadastro","Publicado","Erro"];
const WEEKDAYS = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
const MONTHS = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

/* ============================================================
   STATE
   ============================================================ */
function defaultState(){
  return {
    theme:"light",
    tasks:[],
    recurring:[],
    goals:[],
    timeLog:[],
    activeTimer:null,
    focusSessions:[],
    pomodoroCyclesToday:0,
    pomodoroDate:todayStr(),
    marketplaces: MARKETPLACES.reduce((acc,m)=>{
      acc[m.key] = {mensagens:0,reclamacoes:0,protocolos:0,devolucoes:0,pendencias:0};
      return acc;
    },{}),
    protocols:[],
    products:[],
    listings:[],
    calendarEvents:[]
  };
}

let state = loadState();

function loadState(){
  try{
    const raw = localStorage.getItem(DB_KEY);
    if(!raw) return defaultState();
    const parsed = JSON.parse(raw);
    return Object.assign(defaultState(), parsed);
  }catch(e){
    console.error("Erro ao carregar dados", e);
    return defaultState();
  }
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
function isSameDay(iso, dateObj){
  if(!iso) return false;
  return iso === dateObj.toISOString().slice(0,10);
}
function startOfWeek(d){
  const date = new Date(d);
  const day = date.getDay();
  date.setDate(date.getDate()-day);
  date.setHours(0,0,0,0);
  return date;
}
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
const sections = ["dashboard","tasks","recurring","goals","time","focus","marketplaces","protocols","products","listings","calendar","reports","settings"];
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
   RECURRING TASK GENERATION
   ============================================================ */
function daysBetween(a,b){ return Math.floor((b-a)/86400000); }

function processRecurring(){
  const today = new Date(); today.setHours(0,0,0,0);
  let changed = false;
  state.recurring.forEach(r=>{
    let due = false;
    if(!r.lastGenerated){
      due = true;
    }else{
      const last = new Date(r.lastGenerated+"T00:00:00");
      const diff = daysBetween(last, today);
      if(r.frequency==="Diária" && diff>=1) due = true;
      if(r.frequency==="Semanal" && diff>=7) due = true;
      if(r.frequency==="Quinzenal" && diff>=15) due = true;
      if(r.frequency==="Mensal" && diff>=28 && today.getDate()<=last.getDate()+3) due = true;
      if(r.frequency==="Mensal" && diff>=31) due = true;
    }
    if(due){
      state.tasks.push({
        id: uid(), name:r.name, desc:"Tarefa recorrente ("+r.frequency+")",
        category:r.category, priority:r.priority, dueDate:todayStr(),
        estimate:r.estimate||"", status:"Hoje", createdAt:Date.now(), completedAt:null, recurringId:r.id
      });
      r.lastGenerated = todayStr();
      changed = true;
    }
  });
  if(changed) saveState();
}

/* ============================================================
   DASHBOARD
   ============================================================ */
let chartCategory, chartHours, chartProductivity, chartMarketplace;

function renderDashboard(){
  const today = todayStr();
  const pending = state.tasks.filter(t=>t.status!=="Concluído").length;
  const done = state.tasks.filter(t=>t.status==="Concluído").length;
  const overdue = state.tasks.filter(t=>t.status!=="Concluído" && t.dueDate && t.dueDate<today).length;
  const openProtocols = state.protocols.filter(p=>p.status!=="Resolvido").length;
  const monthPrefix = today.slice(0,7);
  const productsThisMonth = state.products.filter(p=>p.date && p.date.slice(0,7)===monthPrefix).length;

  const mainGoal = state.goals.find(g=>g.month===monthPrefix) || state.goals[0];
  const goalPct = mainGoal ? Math.min(100, Math.round((mainGoal.current/mainGoal.target)*100)) : 0;

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
    {icon:icon("file"),label:"Protocolos abertos",value:openProtocols},
    {icon:icon("box"),label:"Produtos cadastrados no mês",value:productsThisMonth},
    {icon:icon("star"),label:"Meta mensal",value:goalPct+"%", gold:true},
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
}

function renderChartCategory(){
  const ctx = document.getElementById("chartCategory");
  const counts = CATEGORIES.map(c=> state.tasks.filter(t=>t.category===c).length);
  if(chartCategory) chartCategory.destroy();
  chartCategory = new Chart(ctx, {
    type:"doughnut",
    data:{ labels:CATEGORIES, datasets:[{ data:counts, backgroundColor:["#7C5CC9","#9B78D6","#CC9F36","#3FA873","#E0964A","#D6557A","#6C6480"] }] },
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
function cssVar(name){ return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#6C6480"; }
function refreshCurrentCharts(){
  if(!document.getElementById("view-dashboard").classList.contains("hidden")) renderDashboard();
  if(!document.getElementById("view-marketplaces").classList.contains("hidden")) renderMarketplaces();
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
  if(catSel.children.length<=1) CATEGORIES.forEach(c=> catSel.insertAdjacentHTML("beforeend",'<option value="'+c+'">'+c+'</option>'));
  if(prSel.children.length<=1) PRIORITIES.forEach(p=> prSel.insertAdjacentHTML("beforeend",'<option value="'+p+'">'+p+'</option>'));
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
    const items = filtered.filter(t=>t.status===status).sort((a,b)=>b.createdAt-a.createdAt);
    return '<div class="kanban-col" data-status="'+status+'">'+
      '<div class="kanban-col-head"><span>'+status+'</span><span class="count">'+items.length+'</span></div>'+
      '<div class="kanban-cards" data-status="'+status+'">'+
        items.map(t=> taskCardHTML(t, today)).join("")+
      '</div>'+
    '</div>';
  }).join("");

  // drag events on cards
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
        task.status = col.dataset.status;
        if(task.status==="Concluído") task.completedAt = Date.now();
        saveState();
        renderTasks();
      }
    });
  });

  // card actions
  board.querySelectorAll("[data-action]").forEach(btn=>{
    btn.addEventListener("click", e=>{
      e.stopPropagation();
      const id = btn.closest(".task-card").dataset.id;
      const action = btn.dataset.action;
      if(action==="edit") openTaskModal(state.tasks.find(t=>t.id===id));
      if(action==="delete") deleteTask(id);
      if(action==="duplicate") duplicateTask(id);
    });
  });
}

function taskCardHTML(t, today){
  const overdue = t.status!=="Concluído" && t.dueDate && t.dueDate<today;
  return '<div class="task-card" draggable="true" data-id="'+t.id+'">'+
    '<div class="tc-top">'+
      '<div class="tc-title">'+escapeHtml(t.name)+'</div>'+
      '<div class="tc-actions">'+
        '<button data-action="edit" title="Editar">'+icon("edit")+'</button>'+
        '<button data-action="duplicate" title="Duplicar">'+icon("copy")+'</button>'+
        '<button data-action="delete" title="Excluir">'+icon("trash")+'</button>'+
      '</div>'+
    '</div>'+
    (t.desc?'<div class="tc-desc">'+escapeHtml(t.desc)+'</div>':'')+
    '<div class="tc-meta">'+
      '<span class="badge '+priorityBadgeClass(t.priority)+'">'+t.priority+'</span>'+
      '<span class="badge badge-muted">'+t.category+'</span>'+
      (t.dueDate?'<span class="tc-due'+(overdue?' overdue':'')+'">'+fmtDate(t.dueDate)+'</span>':'')+
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
  state.tasks.push(Object.assign({}, t, {id:uid(), name:t.name+" (cópia)", createdAt:Date.now(), completedAt:null}));
  saveState(); renderTasks(); toast("Tarefa duplicada","success");
}

function openTaskModal(task){
  const isEdit = !!task;
  const t = task || {name:"",desc:"",category:CATEGORIES[0],priority:"Média",dueDate:"",estimate:"",status:"Backlog"};
  openModal(isEdit?"Editar tarefa":"Nova tarefa",
    '<form id="taskForm">'+
      '<div class="form-field"><label>Nome</label><input type="text" id="fName" value="'+escapeHtml(t.name)+'" required></div>'+
      '<div class="form-field"><label>Descrição</label><textarea id="fDesc">'+escapeHtml(t.desc)+'</textarea></div>'+
      '<div class="form-row">'+
        '<div class="form-field"><label>Categoria</label><select id="fCategory">'+CATEGORIES.map(c=>'<option '+(c===t.category?"selected":"")+'>'+c+'</option>').join("")+'</select></div>'+
        '<div class="form-field"><label>Prioridade</label><select id="fPriority">'+PRIORITIES.map(p=>'<option '+(p===t.priority?"selected":"")+'>'+p+'</option>').join("")+'</select></div>'+
      '</div>'+
      '<div class="form-row">'+
        '<div class="form-field"><label>Data limite</label><input type="date" id="fDue" value="'+(t.dueDate||"")+'"></div>'+
        '<div class="form-field"><label>Tempo estimado (h)</label><input type="text" id="fEstimate" value="'+escapeHtml(t.estimate||"")+'" placeholder="ex: 2h"></div>'+
      '</div>'+
      '<div class="form-field"><label>Status</label><select id="fStatus">'+STATUSES.map(s=>'<option '+(s===t.status?"selected":"")+'>'+s+'</option>').join("")+'</select></div>'+
      '<div class="modal-actions"><button type="button" class="btn" id="btnCancelModal">Cancelar</button><button type="submit" class="btn btn-primary">Salvar</button></div>'+
    '</form>',
    box=>{
      box.querySelector("#btnCancelModal").addEventListener("click", closeModal);
      box.querySelector("#taskForm").addEventListener("submit", e=>{
        e.preventDefault();
        const data = {
          name: box.querySelector("#fName").value.trim(),
          desc: box.querySelector("#fDesc").value.trim(),
          category: box.querySelector("#fCategory").value,
          priority: box.querySelector("#fPriority").value,
          dueDate: box.querySelector("#fDue").value,
          estimate: box.querySelector("#fEstimate").value.trim(),
          status: box.querySelector("#fStatus").value,
        };
        if(isEdit){
          Object.assign(task, data);
          if(data.status==="Concluído" && !task.completedAt) task.completedAt = Date.now();
        }else{
          state.tasks.push(Object.assign({id:uid(),createdAt:Date.now(),completedAt:null}, data));
        }
        saveState(); closeModal(); renderTasks(); toast("Tarefa salva","success");
      });
    }
  );
}
document.getElementById("btnNewTask").addEventListener("click", ()=>openTaskModal(null));
document.getElementById("taskSearch").addEventListener("input", e=>{ taskFilters.search=e.target.value; renderTasks(); });
document.getElementById("taskFilterCategory").addEventListener("change", e=>{ taskFilters.category=e.target.value; renderTasks(); });
document.getElementById("taskFilterPriority").addEventListener("change", e=>{ taskFilters.priority=e.target.value; renderTasks(); });

/* ============================================================
   RECURRING TASKS
   ============================================================ */
function renderRecurring(){
  const tbody = document.querySelector("#recurringTable tbody");
  tbody.innerHTML = state.recurring.map(r=>
    '<tr>'+
      '<td>'+escapeHtml(r.name)+'</td>'+
      '<td>'+r.category+'</td>'+
      '<td><span class="badge '+priorityBadgeClass(r.priority)+'">'+r.priority+'</span></td>'+
      '<td>'+r.frequency+'</td>'+
      '<td>'+(r.lastGenerated?fmtDate(r.lastGenerated):"—")+'</td>'+
      '<td class="row-actions"><button data-id="'+r.id+'" data-action="del">'+icon("trash")+'</button></td>'+
    '</tr>'
  ).join("") || '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:24px;">Nenhuma tarefa recorrente cadastrada.</td></tr>';

  tbody.querySelectorAll("[data-action='del']").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      state.recurring = state.recurring.filter(r=>r.id!==btn.dataset.id);
      saveState(); renderRecurring(); toast("Recorrência removida","danger");
    });
  });
}
document.getElementById("btnNewRecurring").addEventListener("click", ()=>{
  openModal("Nova tarefa recorrente",
    '<form id="recForm">'+
      '<div class="form-field"><label>Nome</label><input type="text" id="rName" required placeholder="ex: Verificar Mercado Livre"></div>'+
      '<div class="form-row">'+
        '<div class="form-field"><label>Categoria</label><select id="rCategory">'+CATEGORIES.map(c=>'<option>'+c+'</option>').join("")+'</select></div>'+
        '<div class="form-field"><label>Prioridade</label><select id="rPriority">'+PRIORITIES.map(p=>'<option>'+p+'</option>').join("")+'</select></div>'+
      '</div>'+
      '<div class="form-field"><label>Frequência</label><select id="rFreq">'+FREQUENCIES.map(f=>'<option>'+f+'</option>').join("")+'</select></div>'+
      '<div class="modal-actions"><button type="button" class="btn" id="btnCancelModal">Cancelar</button><button type="submit" class="btn btn-primary">Criar</button></div>'+
    '</form>',
    box=>{
      box.querySelector("#btnCancelModal").addEventListener("click", closeModal);
      box.querySelector("#recForm").addEventListener("submit", e=>{
        e.preventDefault();
        state.recurring.push({
          id:uid(), name:box.querySelector("#rName").value.trim(),
          category:box.querySelector("#rCategory").value, priority:box.querySelector("#rPriority").value,
          frequency:box.querySelector("#rFreq").value, lastGenerated:null
        });
        saveState(); closeModal(); processRecurring(); renderRecurring(); toast("Recorrência criada","success");
      });
    }
  );
});

/* ============================================================
   GOALS
   ============================================================ */
function renderGoals(){
  const grid = document.getElementById("goalsGrid");
  grid.innerHTML = state.goals.map(g=>{
    const pct = Math.min(100, Math.round((g.current/g.target)*100) || 0);
    return '<div class="goal-card">'+
      '<div class="goal-head"><span class="goal-name">'+escapeHtml(g.name)+'</span><span class="goal-pct">'+pct+'%</span></div>'+
      '<div class="goal-sub">'+g.current+' de '+g.target+' · '+monthLabel(g.month)+'</div>'+
      '<div class="progress-track"><div class="progress-fill" style="width:'+pct+'%"></div></div>'+
      '<div class="goal-actions">'+
        '<button class="btn" data-action="inc" data-id="'+g.id+'">+1</button>'+
        '<button class="btn" data-action="add10" data-id="'+g.id+'">+10</button>'+
        '<button class="btn btn-danger" data-action="del" data-id="'+g.id+'">'+icon("trash")+'</button>'+
      '</div>'+
    '</div>';
  }).join("") || '<p style="color:var(--text-muted)">Nenhuma meta cadastrada. Clique em "Nova meta" para começar.</p>';

  grid.querySelectorAll("[data-action]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const g = state.goals.find(x=>x.id===btn.dataset.id);
      if(!g) return;
      if(btn.dataset.action==="inc") g.current = (g.current||0)+1;
      if(btn.dataset.action==="add10") g.current = (g.current||0)+10;
      if(btn.dataset.action==="del") state.goals = state.goals.filter(x=>x.id!==g.id);
      saveState(); renderGoals();
    });
  });
}
function monthLabel(m){ if(!m) return ""; const [y,mo]=m.split("-"); return MONTHS[+mo-1]+"/"+y; }

document.getElementById("btnNewGoal").addEventListener("click", ()=>{
  const monthDefault = todayStr().slice(0,7);
  openModal("Nova meta mensal",
    '<form id="goalForm">'+
      '<div class="form-field"><label>Nome da meta</label><input type="text" id="gName" required placeholder="ex: Cadastrar 500 produtos"></div>'+
      '<div class="form-row">'+
        '<div class="form-field"><label>Meta (total)</label><input type="number" id="gTarget" required min="1"></div>'+
        '<div class="form-field"><label>Já realizado</label><input type="number" id="gCurrent" value="0" min="0"></div>'+
      '</div>'+
      '<div class="form-field"><label>Mês de referência</label><input type="month" id="gMonth" value="'+monthDefault+'"></div>'+
      '<div class="modal-actions"><button type="button" class="btn" id="btnCancelModal">Cancelar</button><button type="submit" class="btn btn-primary">Criar meta</button></div>'+
    '</form>',
    box=>{
      box.querySelector("#btnCancelModal").addEventListener("click", closeModal);
      box.querySelector("#goalForm").addEventListener("submit", e=>{
        e.preventDefault();
        state.goals.push({
          id:uid(), name:box.querySelector("#gName").value.trim(),
          target:+box.querySelector("#gTarget").value, current:+box.querySelector("#gCurrent").value,
          month:box.querySelector("#gMonth").value
        });
        saveState(); closeModal(); renderGoals(); toast("Meta criada","success");
      });
    }
  );
});

/* ============================================================
   TIME TRACKING
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

  // weekly ranking
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
   MARKETPLACES
   ============================================================ */
function renderMarketplaces(){
  const totalPend = MARKETPLACES.reduce((s,m)=> s + (state.marketplaces[m.key].pendencias||0), 0);
  const totalProt = MARKETPLACES.reduce((s,m)=> s + (state.marketplaces[m.key].protocolos||0), 0);
  const totalDevol = MARKETPLACES.reduce((s,m)=> s + (state.marketplaces[m.key].devolucoes||0), 0);
  const totalMsg = MARKETPLACES.reduce((s,m)=> s + (state.marketplaces[m.key].mensagens||0), 0);
  document.getElementById("marketplaceDashboard").innerHTML = [
    {label:"Mensagens em aberto",value:totalMsg},
    {label:"Reclamações",value:MARKETPLACES.reduce((s,m)=>s+(state.marketplaces[m.key].reclamacoes||0),0)},
    {label:"Protocolos",value:totalProt},
    {label:"Pendências totais",value:totalPend, danger:totalPend>0},
  ].map(c=>'<div class="stat-card"><div class="stat-value" style="'+(c.danger?"color:var(--danger)":"")+'">'+c.value+'</div><div class="stat-label">'+c.label+'</div></div>').join("");

  const ctx = document.getElementById("chartMarketplace");
  if(chartMarketplace) chartMarketplace.destroy();
  chartMarketplace = new Chart(ctx, {
    type:"bar",
    data:{ labels:MARKETPLACES.map(m=>m.name), datasets:[{ label:"Pendências", data:MARKETPLACES.map(m=>state.marketplaces[m.key].pendencias||0), backgroundColor:MARKETPLACES.map(m=>m.color), borderRadius:6 }] },
    options:{ plugins:{legend:{display:false}}, scales:{ x:{grid:{display:false},ticks:{color:cssVar("--text-muted")}}, y:{beginAtZero:true,ticks:{color:cssVar("--text-muted")},grid:{color:cssVar("--border")}} } }
  });

  document.getElementById("marketplaceForms").innerHTML = MARKETPLACES.map(m=>{
    const d = state.marketplaces[m.key];
    return '<div class="mp-card">'+
      '<h4><span class="mp-dot" style="background:'+m.color+'"></span>'+m.name+'</h4>'+
      ["mensagens","reclamacoes","protocolos","devolucoes","pendencias"].map(field=>
        '<div class="mp-row"><span>'+fieldLabel(field)+'</span><input type="number" min="0" data-mp="'+m.key+'" data-field="'+field+'" value="'+(d[field]||0)+'"></div>'
      ).join("")+
    '</div>';
  }).join("");

  document.querySelectorAll("[data-mp]").forEach(inp=>{
    inp.addEventListener("change", ()=>{
      state.marketplaces[inp.dataset.mp][inp.dataset.field] = +inp.value || 0;
      saveState(); renderMarketplaces();
    });
  });
}
function fieldLabel(f){
  return {mensagens:"Mensagens",reclamacoes:"Reclamações",protocolos:"Protocolos",devolucoes:"Devoluções",pendencias:"Pendências"}[f];
}

/* ============================================================
   PROTOCOLS
   ============================================================ */
function renderProtocols(){
  const today = todayStr();
  const tbody = document.querySelector("#protocolsTable tbody");
  const sorted = state.protocols.slice().sort((a,b)=>(a.deadline||"9999").localeCompare(b.deadline||"9999"));
  tbody.innerHTML = sorted.map(p=>{
    const overdue = p.status!=="Resolvido" && p.deadline && p.deadline<today;
    const soon = !overdue && p.status!=="Resolvido" && p.deadline && daysBetween(new Date(today),new Date(p.deadline))<=3;
    return '<tr class="'+(overdue?"row-overdue":soon?"row-soon":"")+'">'+
      '<td>'+escapeHtml(p.number)+'</td>'+
      '<td>'+marketplaceName(p.marketplace)+'</td>'+
      '<td>'+escapeHtml(p.subject)+'</td>'+
      '<td><span class="badge '+priorityBadgeClass(p.priority)+'">'+p.priority+'</span></td>'+
      '<td>'+p.status+'</td>'+
      '<td>'+(p.deadline?fmtDate(p.deadline)+(overdue?' ⚠️':soon?' ⏳':''):'—')+'</td>'+
      '<td class="row-actions"><button data-action="edit" data-id="'+p.id+'">'+icon("edit")+'</button><button data-action="del" data-id="'+p.id+'">'+icon("trash")+'</button></td>'+
    '</tr>';
  }).join("") || '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:24px;">Nenhum protocolo cadastrado.</td></tr>';

  tbody.querySelectorAll("[data-action='edit']").forEach(b=>b.addEventListener("click", ()=>openProtocolModal(state.protocols.find(x=>x.id===b.dataset.id))));
  tbody.querySelectorAll("[data-action='del']").forEach(b=>b.addEventListener("click", ()=>{
    state.protocols = state.protocols.filter(x=>x.id!==b.dataset.id);
    saveState(); renderProtocols(); toast("Protocolo removido","danger");
  }));
}
function marketplaceName(key){ const m = MARKETPLACES.find(x=>x.key===key); return m?m.name:key; }

function openProtocolModal(protocol){
  const isEdit = !!protocol;
  const p = protocol || {number:"",marketplace:MARKETPLACES[0].key,subject:"",priority:"Média",status:"Aberto",deadline:"",notes:""};
  openModal(isEdit?"Editar protocolo":"Novo protocolo",
    '<form id="protoForm">'+
      '<div class="form-row">'+
        '<div class="form-field"><label>Número do protocolo</label><input type="text" id="pNumber" value="'+escapeHtml(p.number)+'" required></div>'+
        '<div class="form-field"><label>Marketplace</label><select id="pMarketplace">'+MARKETPLACES.map(m=>'<option value="'+m.key+'" '+(m.key===p.marketplace?"selected":"")+'>'+m.name+'</option>').join("")+'</select></div>'+
      '</div>'+
      '<div class="form-field"><label>Assunto</label><input type="text" id="pSubject" value="'+escapeHtml(p.subject)+'" required></div>'+
      '<div class="form-row">'+
        '<div class="form-field"><label>Prioridade</label><select id="pPriority">'+PRIORITIES.map(x=>'<option '+(x===p.priority?"selected":"")+'>'+x+'</option>').join("")+'</select></div>'+
        '<div class="form-field"><label>Status</label><select id="pStatus">'+PROTOCOL_STATUSES.map(x=>'<option '+(x===p.status?"selected":"")+'>'+x+'</option>').join("")+'</select></div>'+
      '</div>'+
      '<div class="form-field"><label>Prazo</label><input type="date" id="pDeadline" value="'+(p.deadline||"")+'"></div>'+
      '<div class="form-field"><label>Observações</label><textarea id="pNotes">'+escapeHtml(p.notes||"")+'</textarea></div>'+
      '<div class="modal-actions"><button type="button" class="btn" id="btnCancelModal">Cancelar</button><button type="submit" class="btn btn-primary">Salvar</button></div>'+
    '</form>',
    box=>{
      box.querySelector("#btnCancelModal").addEventListener("click", closeModal);
      box.querySelector("#protoForm").addEventListener("submit", e=>{
        e.preventDefault();
        const data = {
          number:box.querySelector("#pNumber").value.trim(), marketplace:box.querySelector("#pMarketplace").value,
          subject:box.querySelector("#pSubject").value.trim(), priority:box.querySelector("#pPriority").value,
          status:box.querySelector("#pStatus").value, deadline:box.querySelector("#pDeadline").value,
          notes:box.querySelector("#pNotes").value.trim()
        };
        if(isEdit) Object.assign(protocol,data);
        else state.protocols.push(Object.assign({id:uid()},data));
        saveState(); closeModal(); renderProtocols(); toast("Protocolo salvo","success");
      });
    }
  );
}
document.getElementById("btnNewProtocol").addEventListener("click", ()=>openProtocolModal(null));

/* ============================================================
   PRODUCTS
   ============================================================ */
function renderProducts(){
  const today = todayStr();
  const weekStart = startOfWeek(new Date()).toISOString().slice(0,10);
  const monthPrefix = today.slice(0,7);
  const todayCount = state.products.filter(p=>p.date===today).length;
  const weekCount = state.products.filter(p=>p.date>=weekStart).length;
  const monthCount = state.products.filter(p=>p.date && p.date.slice(0,7)===monthPrefix).length;
  document.getElementById("productsDashboard").innerHTML = [
    {label:"Cadastrados hoje",value:todayCount},
    {label:"Cadastrados na semana",value:weekCount},
    {label:"Cadastrados no mês",value:monthCount},
    {label:"Total geral",value:state.products.length},
  ].map(c=>'<div class="stat-card"><div class="stat-value">'+c.value+'</div><div class="stat-label">'+c.label+'</div></div>').join("");

  const tbody = document.querySelector("#productsTable tbody");
  const list = state.products.slice().reverse();
  tbody.innerHTML = list.map(p=>
    '<tr><td>'+escapeHtml(p.sku)+'</td><td>'+escapeHtml(p.name)+'</td><td>'+marketplaceName(p.marketplace)+'</td><td>'+fmtDate(p.date)+'</td><td>'+p.status+'</td>'+
    '<td class="row-actions"><button data-action="del" data-id="'+p.id+'">'+icon("trash")+'</button></td></tr>'
  ).join("") || '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:24px;">Nenhum produto cadastrado.</td></tr>';
  tbody.querySelectorAll("[data-action='del']").forEach(b=>b.addEventListener("click", ()=>{
    state.products = state.products.filter(x=>x.id!==b.dataset.id);
    saveState(); renderProducts(); toast("Produto removido","danger");
  }));
}
document.getElementById("btnNewProduct").addEventListener("click", ()=>{
  openModal("Novo cadastro de produto",
    '<form id="prodForm">'+
      '<div class="form-row">'+
        '<div class="form-field"><label>SKU</label><input type="text" id="prSku" required></div>'+
        '<div class="form-field"><label>Marketplace</label><select id="prMarketplace">'+MARKETPLACES.map(m=>'<option value="'+m.key+'">'+m.name+'</option>').join("")+'</select></div>'+
      '</div>'+
      '<div class="form-field"><label>Produto</label><input type="text" id="prName" required></div>'+
      '<div class="form-row">'+
        '<div class="form-field"><label>Data de cadastro</label><input type="date" id="prDate" value="'+todayStr()+'"></div>'+
        '<div class="form-field"><label>Status</label><select id="prStatus">'+PRODUCT_STATUSES.map(s=>'<option>'+s+'</option>').join("")+'</select></div>'+
      '</div>'+
      '<div class="modal-actions"><button type="button" class="btn" id="btnCancelModal">Cancelar</button><button type="submit" class="btn btn-primary">Salvar</button></div>'+
    '</form>',
    box=>{
      box.querySelector("#btnCancelModal").addEventListener("click", closeModal);
      box.querySelector("#prodForm").addEventListener("submit", e=>{
        e.preventDefault();
        state.products.push({
          id:uid(), sku:box.querySelector("#prSku").value.trim(), name:box.querySelector("#prName").value.trim(),
          marketplace:box.querySelector("#prMarketplace").value, date:box.querySelector("#prDate").value,
          status:box.querySelector("#prStatus").value
        });
        saveState(); closeModal(); renderProducts(); toast("Produto cadastrado","success");
      });
    }
  );
});

/* ============================================================
   LISTINGS IMPROVEMENT
   ============================================================ */
document.querySelectorAll("#listingForm input[type=range]").forEach(r=>{
  r.addEventListener("input", ()=>{ r.nextElementSibling.textContent = r.value; });
});
document.getElementById("listingForm").addEventListener("submit", e=>{
  e.preventDefault();
  const name = document.getElementById("listingName").value.trim();
  const crits = {};
  document.querySelectorAll("#listingForm input[type=range]").forEach(r=>{ crits[r.dataset.crit] = +r.value; });
  const score = Math.round(Object.values(crits).reduce((a,b)=>a+b,0)/Object.values(crits).length);
  state.listings.push({id:uid(), name, score, criteria:crits, date:todayStr()});
  saveState();
  showScore(score);
  renderListings();
  document.getElementById("listingName").value = "";
  toast("Checklist salvo: "+score+" pontos","success");
});
function classify(score){
  if(score>=85) return {label:"Excelente",cls:"excellent"};
  if(score>=70) return {label:"Bom",cls:"good"};
  if(score>=50) return {label:"Regular",cls:"regular"};
  return {label:"Precisa melhorar",cls:"bad"};
}
function showScore(score){
  const c = classify(score);
  const circle = document.getElementById("scoreCircle");
  circle.className = "score-circle "+c.cls;
  circle.textContent = score;
  document.getElementById("scoreLabel").textContent = c.label;
}
function renderListings(){
  const tbody = document.querySelector("#listingsTable tbody");
  const list = state.listings.slice().reverse();
  tbody.innerHTML = list.map(l=>{
    const c = classify(l.score);
    return '<tr><td>'+escapeHtml(l.name)+'</td><td>'+l.score+'</td><td><span class="badge badge-'+(c.cls==="excellent"?"low":c.cls==="good"?"gold":c.cls==="regular"?"medium":"critical")+'">'+c.label+'</span></td><td>'+fmtDate(l.date)+'</td></tr>';
  }).join("") || '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:24px;">Nenhum checklist avaliado ainda.</td></tr>';
}

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
  state.tasks.forEach(t=>{ if(t.dueDate) ev.push({date:t.dueDate, label:t.name, type:"task"}); });
  state.protocols.forEach(p=>{ if(p.deadline) ev.push({date:p.deadline, label:"Protocolo "+p.number, type:"protocol"}); });
  state.goals.forEach(g=>{ if(g.month) ev.push({date:g.month+"-28", label:"Meta: "+g.name, type:"goal"}); });
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
  if(type==="tasks"){
    const rows = [["Nome","Categoria","Prioridade","Status","Data limite"]];
    state.tasks.filter(t=>t.status==="Concluído").forEach(t=> rows.push([t.name,t.category,t.priority,t.status,fmtDate(t.dueDate)]));
    return rows;
  }
  if(type==="goals"){
    const rows = [["Meta","Mês","Meta total","Realizado","Percentual"]];
    state.goals.forEach(g=> rows.push([g.name, monthLabel(g.month), g.target, g.current, Math.round((g.current/g.target)*100)+"%"]));
    return rows;
  }
  if(type==="protocols"){
    const rows = [["Número","Marketplace","Assunto","Prioridade","Status","Prazo"]];
    state.protocols.forEach(p=> rows.push([p.number, marketplaceName(p.marketplace), p.subject, p.priority, p.status, fmtDate(p.deadline)]));
    return rows;
  }
  if(type==="products"){
    const rows = [["SKU","Produto","Marketplace","Data","Status"]];
    state.products.forEach(p=> rows.push([p.sku,p.name,marketplaceName(p.marketplace),fmtDate(p.date),p.status]));
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
   SETTINGS
   ============================================================ */
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
      saveState(); applyTheme(); goTo("dashboard");
      toast("Backup restaurado com sucesso","success");
    }catch(err){ toast("Arquivo inválido","danger"); }
  };
  reader.readAsText(file);
  e.target.value = "";
});
document.getElementById("inputImport").addEventListener("change", e=>{
  document.getElementById("inputRestore").dispatchEvent; // no-op safeguard
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
  const rows = [["Nome","Descrição","Categoria","Prioridade","Status","Data limite"]];
  state.tasks.forEach(t=> rows.push([t.name,t.desc,t.category,t.priority,t.status,fmtDate(t.dueDate)]));
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
  state.protocols.forEach(p=>{ if((p.number+p.subject).toLowerCase().includes(q)) results.push({label:p.number+" — "+p.subject, sub:"Protocolo · "+p.status, section:"protocols"}); });
  state.products.forEach(p=>{ if((p.sku+p.name).toLowerCase().includes(q)) results.push({label:p.name, sub:"Produto · "+p.sku, section:"products"}); });
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
renderMap.marketplaces = renderMarketplaces;
renderMap.protocols = renderProtocols;
renderMap.products = renderProducts;
renderMap.listings = renderListings;
renderMap.calendar = renderCalendar;
renderMap.reports = renderReportPreview;
renderMap.settings = ()=>{};

function setTopbarDate(){
  const now = new Date();
  const opts = {weekday:"long", day:"numeric", month:"long", year:"numeric"};
  document.getElementById("topbarDate").textContent = now.toLocaleDateString("pt-BR", opts);
}

function init(){
  applyTheme();
  setTopbarDate();
  processRecurring();
  renderDashboard();
  renderTime();
  renderFocus();
  renderListings();
  resetFocusTimer();
  renderCalendar();
  renderReportPreview();
}
init();

})();

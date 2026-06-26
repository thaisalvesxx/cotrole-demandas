/* ==========================================================================
   HUBMARKET — script.js
   Todas as abas implementadas e testadas. Kanban com 5 colunas visíveis
   simultaneamente: Acompanhamento (1ª), Backlog, Hoje, Em andamento, Concluído.
   ========================================================================== */

(function(){
"use strict";

const DB_KEY = "hubmarket_db_v3";
const DEFAULT_CATEGORIES = ["Estoque", "Cadastro de produtos", "Melhoria de anúncios", "Exportação de anúncios", "Marketplace", "Atendimento", "Financeiro", "Outros"];
const DEFAULT_QTY_CATEGORIES = ["Cadastro de produtos", "Melhoria de anúncios", "Exportação de anúncios"];
const STATUSES = ["Backlog", "Hoje", "Em andamento", "Concluído"];
const DEFAULT_MARKETPLACES = [
  {name:"Mercado Livre", color:"#FFD400"},
  {name:"Shopee", color:"#EE4D2D"},
  {name:"Amazon", color:"#FF9900"},
  {name:"Magalu", color:"#0086FF"},
  {name:"Shein", color:"#000000"}
];
const DEFAULT_TRACKING_TYPES = ["Reclamação", "Mensagem", "Protocolo", "Devolução"];
const FOLLOWUP_STATUSES = ["Aberto", "Em análise", "Resolvido"];
const WEEKDAYS_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTHS = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const FREQUENCIES = ["Diária", "Dias da semana", "Quinzenal", "Mensal"];

/* ============================================================
   STATE
   ============================================================ */
function defaultState(){
  return {
    theme: "light",
    userSettings: {
      categories: DEFAULT_CATEGORIES.slice(),
      qtyCategories: DEFAULT_QTY_CATEGORIES.slice(),
      marketplaces: DEFAULT_MARKETPLACES.map(m=>Object.assign({},m)),
      trackingTypes: DEFAULT_TRACKING_TYPES.slice()
    },
    tasks: [], recurring: [], goals: [], timeLog: [], activeTimer: null, followUp: [],
    dayTimer: null, workLog: []
  };
}

function loadState(){
  try{
    const raw = localStorage.getItem(DB_KEY);
    if(!raw) return defaultState();
    const parsed = JSON.parse(raw);
    const fresh = defaultState();
    const merged = Object.assign(fresh, parsed);
    merged.userSettings = Object.assign(fresh.userSettings, parsed.userSettings || {});
    if(!Array.isArray(merged.userSettings.qtyCategories)) merged.userSettings.qtyCategories = DEFAULT_QTY_CATEGORIES.slice();
    if(!Array.isArray(merged.userSettings.trackingTypes)) merged.userSettings.trackingTypes = DEFAULT_TRACKING_TYPES.slice();
    // migração: versões antigas guardavam marketplaces como strings simples
    if(Array.isArray(merged.userSettings.marketplaces)){
      merged.userSettings.marketplaces = merged.userSettings.marketplaces.map((m,i)=>
        (typeof m === "string") ? {name:m, color: DEFAULT_MARKETPLACES[i % DEFAULT_MARKETPLACES.length].color} : m
      );
    }
    if(!Array.isArray(merged.tasks)) merged.tasks = [];
    if(!Array.isArray(merged.recurring)) merged.recurring = [];
    if(!Array.isArray(merged.goals)) merged.goals = [];
    if(!Array.isArray(merged.timeLog)) merged.timeLog = [];
    if(!Array.isArray(merged.followUp)) merged.followUp = [];
    if(!Array.isArray(merged.workLog)) merged.workLog = [];
    // migração: tarefas/recorrências antigas sem subtarefas
    merged.tasks.forEach(t=>{ if(!Array.isArray(t.subtasks)) t.subtasks = []; });
    merged.recurring.forEach(r=>{ if(!Array.isArray(r.subtasksTemplate)) r.subtasksTemplate = []; });
    // migração: acompanhamentos antigos sem tipo
    merged.followUp.forEach(f=>{ if(!f.type) f.type = DEFAULT_TRACKING_TYPES[0]; });
    return merged;
  }catch(e){
    console.error("Erro ao carregar dados, iniciando do zero.", e);
    return defaultState();
  }
}
function saveState(){ localStorage.setItem(DB_KEY, JSON.stringify(state)); }

let state = loadState();

/* ============================================================
   UTILS
   ============================================================ */
function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
function todayStr(){ return new Date().toISOString().slice(0,10); }
function pad(n){ return n.toString().padStart(2,"0"); }
function fmtDate(iso){
  if(!iso) return "—";
  const parts = iso.split("-");
  if(parts.length!==3) return "—";
  return parts[2]+"/"+parts[1]+"/"+parts[0];
}
function fmtDuration(ms){
  const totalSec = Math.max(0, Math.floor(ms/1000));
  const h = Math.floor(totalSec/3600), m = Math.floor((totalSec%3600)/60), s = totalSec%60;
  return pad(h)+":"+pad(m)+":"+pad(s);
}
function fmtHoursMin(ms){
  const totalMin = Math.max(0, Math.round(ms/60000));
  return Math.floor(totalMin/60)+"h "+(totalMin%60)+"m";
}
function fmtDateTime(ts){
  const d = new Date(ts);
  return pad(d.getHours())+":"+pad(d.getMinutes())+":"+pad(d.getSeconds());
}
function escapeHtml(str){
  return (str===undefined||str===null?"":str).toString().replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
}
function daysBetween(a,b){ return Math.floor((b-a)/86400000); }
function businessDaysList(fromIso, toIso){
  const list = [];
  let d = new Date(fromIso+"T00:00:00");
  const end = new Date(toIso+"T00:00:00");
  while(d<=end){
    const wd = d.getDay();
    if(wd!==0 && wd!==6) list.push(d.toISOString().slice(0,10));
    d.setDate(d.getDate()+1);
  }
  return list;
}
function downloadFile(filename, content, mime){
  const blob = new Blob([content], {type:mime||"text/plain"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
function toCSV(rows){
  return rows.map(r => r.map(cell=>{
    const v = (cell===undefined||cell===null) ? "" : cell.toString();
    return '"'+v.replace(/"/g,'""')+'"';
  }).join(",")).join("\r\n");
}
function toast(msg, type){
  const c = document.getElementById("toastContainer");
  if(!c) return;
  const el = document.createElement("div");
  el.className = "toast "+(type||"");
  el.textContent = msg;
  c.appendChild(el);
  setTimeout(()=>{ el.style.opacity="0"; setTimeout(()=>el.remove(),300); }, 3000);
}
function icon(name){
  const icons = {
    edit:'<svg viewBox="0 0 24 24"><path d="M4 20h4l11-11-4-4L4 16v4z"/></svg>',
    trash:'<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14"/></svg>',
    play:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
    stop:'<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12"/></svg>',
    up:'<svg viewBox="0 0 24 24"><path d="M6 15l6-6 6 6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    down:'<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    plus:'<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" stroke-linecap="round"/></svg>',
    clock:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>'
  };
  return icons[name] || "";
}
function categories(){ return state.userSettings.categories; }
function qtyCategories(){ return state.userSettings.qtyCategories; }
function isQtyCategory(cat){ return qtyCategories().includes(cat); }
function marketplaces(){ return state.userSettings.marketplaces; }
function trackingTypes(){ return state.userSettings.trackingTypes; }

/* ============================================================
   MODAL
   ============================================================ */
function openModal(title, html, onMount){
  const overlay = document.getElementById("modalOverlay");
  const box = document.getElementById("modalBox");
  box.innerHTML = "<h2>"+escapeHtml(title)+"</h2>"+html;
  overlay.classList.remove("hidden");
  if(onMount) onMount(box);
}
function closeModal(){ document.getElementById("modalOverlay").classList.add("hidden"); }
window.closeModal = closeModal;

/* ============================================================
   NAVIGATION
   ============================================================ */
const renderMap = {};
function goTo(section){
  document.querySelectorAll(".view").forEach(v=>v.classList.add("hidden"));
  const target = document.getElementById("view-"+section);
  if(target) target.classList.remove("hidden");
  document.querySelectorAll(".nav-item").forEach(btn=>btn.classList.toggle("is-active", btn.dataset.section===section));
  if(renderMap[section]) renderMap[section]();
  closeSidebarMobile();
}
function closeSidebarMobile(){
  document.getElementById("sidebar").classList.remove("is-open");
  document.getElementById("sidebarOverlay").classList.remove("is-open");
}

/* ============================================================
   ORDENAÇÃO MANUAL DOS CARDS (campo `order`, por coluna/status)
   ============================================================ */
function normalizeOrders(){
  STATUSES.forEach(status=>{
    const items = state.tasks
      .filter(t=>t.status===status)
      .sort((a,b)=>(Number.isFinite(a.order)?a.order:a.createdAt) - (Number.isFinite(b.order)?b.order:b.createdAt));
    items.forEach((t,i)=>{ t.order = (i+1)*10; });
  });
}
function nextOrderInStatus(status){
  const items = state.tasks.filter(t=>t.status===status);
  return items.length ? Math.max(...items.map(t=>Number.isFinite(t.order)?t.order:0))+10 : 10;
}
function firstOrderInStatus(status){
  const items = state.tasks.filter(t=>t.status===status);
  return items.length ? Math.min(...items.map(t=>Number.isFinite(t.order)?t.order:0))-10 : 10;
}
function moveTask(taskId, dir){
  const task = state.tasks.find(t=>t.id===taskId);
  if(!task) return;
  // Proteção: renormaliza a coluna antes de mover, eliminando qualquer
  // valor de "order" inconsistente (duplicado/ausente) que possa ter sido
  // herdado de uma mudança de status feita pelo formulário de edição.
  const items = state.tasks
    .filter(t=>t.status===task.status)
    .sort((a,b)=>(Number.isFinite(a.order)?a.order:a.createdAt) - (Number.isFinite(b.order)?b.order:b.createdAt));
  items.forEach((t,i)=>{ t.order = (i+1)*10; });

  const idx = items.findIndex(t=>t.id===taskId);
  const swapIdx = idx+dir;
  if(swapIdx<0 || swapIdx>=items.length) return; // já é o primeiro/último — nada a fazer
  const other = items[swapIdx];
  const tmp = task.order; task.order = other.order; other.order = tmp;
  saveState(); renderTasks();
}
window.moveTask = moveTask;

/* ============================================================
   CRONÔMETRO POR TAREFA
   ============================================================ */
function toggleTaskTimer(taskId){
  const now = Date.now();
  if(state.activeTimer && state.activeTimer.taskId===taskId){
    const duration = now - state.activeTimer.start;
    const task = state.tasks.find(t=>t.id===taskId);
    if(task){
      task.timeSpent = (task.timeSpent||0) + duration;
      state.timeLog.push({id:uid(), taskId, taskName:task.name, category:task.category, duration, date:todayStr(), timestamp:now});
    }
    state.activeTimer = null;
    toast("Tempo pausado","info");
  }else{
    if(state.activeTimer) toggleTaskTimer(state.activeTimer.taskId);
    state.activeTimer = {taskId, start:now};
    toast("Cronômetro iniciado","success");
  }
  saveState(); renderTasks();
}
window.toggleTaskTimer = toggleTaskTimer;

/* ============================================================
   TAREFAS — modal de criação/edição
   ============================================================ */
function handleTaskCompletion(task){
  if(task.timerStart){ task.timeSpent=(task.timeSpent||0); }
  if(state.activeTimer && state.activeTimer.taskId===task.id) toggleTaskTimer(task.id);
  if(task.goalId){
    const goal = state.goals.find(g=>g.id===task.goalId);
    if(goal){
      goal.current = (goal.current||0) + (task.quantity!=null ? +task.quantity : (task.targetQty||0));
      recalcGoalTasks(goal);
    }
  }
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
function bindSubtaskRemovers(box){
  box.querySelectorAll(".sub-remove").forEach(btn=>{
    btn.onclick = ()=> btn.closest(".subtask-row").remove();
  });
}

function openTaskModal(taskId){
  const existing = taskId ? state.tasks.find(x=>x.id===taskId) : null;
  const t = existing || {name:"", category:categories()[0], dueDate:"", status:"Backlog", quantity:null, subtasks:[]};
  const showQty = isQtyCategory(t.category);
  openModal(taskId?"Editar Tarefa":"Nova Tarefa",
    '<form id="taskForm">'+
      '<div class="form-field"><label>Nome</label><input type="text" id="fName" value="'+escapeHtml(t.name)+'" required></div>'+
      '<div class="form-row">'+
        '<div class="form-field"><label>Categoria</label><select id="fCategory">'+categories().map(c=>'<option '+(c===t.category?"selected":"")+'>'+escapeHtml(c)+'</option>').join("")+'</select></div>'+
        '<div class="form-field"><label>Data Limite</label><input type="date" id="fDue" value="'+(t.dueDate||"")+'"></div>'+
      '</div>'+
      '<div class="form-field"><label>Status</label><select id="fStatus">'+STATUSES.map(s=>'<option '+(s===t.status?"selected":"")+'>'+s+'</option>').join("")+'</select></div>'+
      '<div class="form-field" id="qtyField" style="'+(showQty?"":"display:none")+'"><label>Quantidade realizada</label><input type="number" id="fQuantity" min="0" value="'+(t.quantity!=null?t.quantity:"")+'" placeholder="ex: quantos cadastros/anúncios você concluiu"></div>'+
      '<div class="form-field"><label>Subtarefas</label><div id="subtasksList">'+subtaskRowsHTML(t.subtasks)+'</div>'+
        '<button type="button" class="btn" id="btnAddSubtask">+ Adicionar subtarefa</button>'+
      '</div>'+
      '<div class="modal-actions">'+
        '<button type="button" class="btn" onclick="closeModal()">Cancelar</button>'+
        (taskId?'<button type="button" class="btn btn-danger" onclick="deleteTask(\''+taskId+'\')">Excluir</button>':'')+
        '<button type="submit" class="btn btn-primary">Salvar</button>'+
      '</div>'+
    '</form>',
    box=>{
      box.querySelector("#fCategory").addEventListener("change", ()=>{
        box.querySelector("#qtyField").style.display = isQtyCategory(box.querySelector("#fCategory").value) ? "" : "none";
      });
      box.querySelector("#btnAddSubtask").addEventListener("click", ()=>{
        box.querySelector("#subtasksList").insertAdjacentHTML("beforeend", subtaskRowsHTML([{id:uid(), name:"", done:false}]));
        bindSubtaskRemovers(box);
      });
      bindSubtaskRemovers(box);
      box.querySelector("#taskForm").onsubmit = e=>{
        e.preventDefault();
        const qtyVal = box.querySelector("#fQuantity").value;
        const subtasks = Array.from(box.querySelectorAll("#subtasksList .subtask-row")).map(row=>({
          id: row.dataset.id, name: row.querySelector(".sub-name").value.trim(), done: row.querySelector(".sub-done").checked
        })).filter(s=>s.name);
        const data = {
          name: box.querySelector("#fName").value.trim(),
          category: box.querySelector("#fCategory").value,
          dueDate: box.querySelector("#fDue").value,
          status: box.querySelector("#fStatus").value,
          quantity: qtyVal===""? null : +qtyVal,
          subtasks
        };
        if(existing){
          const wasCompleted = existing.status==="Concluído";
          const statusChanged = existing.status !== data.status;
          Object.assign(existing, data);
          if(statusChanged) existing.order = nextOrderInStatus(data.status); // recalcula a posição na nova coluna
          if(data.status==="Concluído" && !wasCompleted) handleTaskCompletion(existing);
        }else{
          state.tasks.push(Object.assign({id:uid(), createdAt:Date.now(), timeSpent:0, order:nextOrderInStatus(data.status)}, data));
        }
        saveState(); closeModal(); renderTasks();
        toast("Tarefa salva","success");
      };
    }
  );
}
window.openTaskModal = openTaskModal;
window.deleteTask = id=>{
  if(!confirm("Excluir esta tarefa?")) return;
  state.tasks = state.tasks.filter(t=>t.id!==id);
  saveState(); closeModal(); renderTasks();
  toast("Tarefa excluída","danger");
};

/* ============================================================
   KANBAN — Acompanhamento (1ª coluna) + Backlog/Hoje/Em andamento/Concluído
   ============================================================ */
function renderTasks(){
  const board = document.getElementById("kanbanBoard");
  if(!board) return;
  const today = todayStr();

  const statusColumnsHTML = STATUSES.map(status=>{
    const items = state.tasks.filter(t=>t.status===status).sort((a,b)=>(a.order||0)-(b.order||0));
    return '<div class="kanban-col" data-status="'+status+'">'+
      '<div class="kanban-col-head"><span>'+status+'</span><span class="count">'+items.length+'</span></div>'+
      '<div class="kanban-cards">'+items.map((t,idx)=>taskCardHTML(t,idx,items.length,today)).join("")+'</div>'+
    '</div>';
  }).join("");

  board.innerHTML = followUpColumnHTML(today) + statusColumnsHTML;

  board.querySelectorAll(".kanban-col[data-status]").forEach(col=>{
    if(col.dataset.status==="__followup") return;
    col.ondragover = e=>{ e.preventDefault(); col.classList.add("drag-over"); };
    col.ondragleave = ()=> col.classList.remove("drag-over");
    col.ondrop = e=>{
      e.preventDefault();
      col.classList.remove("drag-over");
      const id = e.dataTransfer.getData("text");
      const task = state.tasks.find(t=>t.id===id);
      if(task){
        const newStatus = col.dataset.status;
        if(task.status !== newStatus){
          task.order = firstOrderInStatus(newStatus);
          task.status = newStatus;
          if(newStatus==="Concluído") handleTaskCompletion(task);
        }
        saveState(); renderTasks();
        if(!document.getElementById("view-goals").classList.contains("hidden")) renderGoals();
      }
    };
  });
  board.querySelectorAll(".task-card[draggable='true']").forEach(card=>{
    card.ondragstart = e=>{ e.dataTransfer.setData("text", card.dataset.id); card.classList.add("dragging"); };
    card.ondragend = ()=> card.classList.remove("dragging");
  });

  const btnAddFollow = document.getElementById("btnAddFollowupInline");
  if(btnAddFollow) btnAddFollow.onclick = ()=>openFollowUpModal();
}

function taskCardHTML(t, idx, total, today){
  const isRunning = state.activeTimer && state.activeTimer.taskId===t.id;
  const time = (t.timeSpent||0) + (isRunning ? (Date.now()-state.activeTimer.start) : 0);
  const isFirst = idx===0, isLast = idx===total-1;
  const overdue = t.status!=="Concluído" && t.dueDate && t.dueDate<today;
  const subTotal = (t.subtasks||[]).length;
  const subDone = (t.subtasks||[]).filter(s=>s.done).length;
  return '<div class="task-card" draggable="true" data-id="'+t.id+'">'+
    '<div class="tc-top">'+
      '<div class="tc-title">'+escapeHtml(t.name)+'</div>'+
      '<div class="tc-actions">'+
        '<button class="order-btn" title="Mover para cima" '+(isFirst?"disabled":"")+' onclick="event.stopPropagation(); moveTask(\''+t.id+'\', -1)">'+icon('up')+'</button>'+
        '<button class="order-btn" title="Mover para baixo" '+(isLast?"disabled":"")+' onclick="event.stopPropagation(); moveTask(\''+t.id+'\', 1)">'+icon('down')+'</button>'+
        '<button class="timer-btn '+(isRunning?'running':'')+'" title="Cronômetro" onclick="event.stopPropagation(); toggleTaskTimer(\''+t.id+'\')">'+(isRunning?icon('stop'):icon('play'))+'</button>'+
        '<button title="Editar" onclick="event.stopPropagation(); openTaskModal(\''+t.id+'\')">'+icon('edit')+'</button>'+
      '</div>'+
    '</div>'+
    '<div class="tc-time-info">'+icon('clock')+' '+fmtDuration(time)+'</div>'+
    '<div class="tc-meta">'+
      '<span class="badge badge-muted">'+escapeHtml(t.category)+'</span>'+
      (t.dueDate?'<span class="tc-due '+(overdue?"overdue":"")+'">'+fmtDate(t.dueDate)+'</span>':'')+
      (subTotal?'<span class="badge badge-muted">☑ '+subDone+'/'+subTotal+'</span>':'')+
      (t.quantity!=null?'<span class="badge badge-gold">Qtd: '+t.quantity+'</span>':(t.targetQty?'<span class="badge badge-gold">Meta dia: '+t.targetQty+'</span>':''))+
    '</div>'+
  '</div>';
}

/* ============================================================
   ACOMPANHAMENTO — 1ª coluna do quadro (reclamações, protocolos, devoluções...)
   ============================================================ */
function followUpColumnHTML(today){
  today = today || todayStr();
  const items = state.followUp.slice().sort((a,b)=>(a.deadline||"9999-99-99").localeCompare(b.deadline||"9999-99-99"));
  return '<div class="kanban-col followup-col" data-status="__followup">'+
    '<div class="kanban-col-head"><span>Acompanhamento</span><span class="count">'+items.length+'</span></div>'+
    '<button type="button" class="btn-add-inline" id="btnAddFollowupInline">'+icon('plus')+' Novo</button>'+
    '<div class="kanban-cards">'+
      (items.map(f=>followUpCardHTML(f,today)).join("") || '<p class="kanban-empty-hint">Nenhum acompanhamento.</p>')+
    '</div>'+
  '</div>';
}
function followUpCardHTML(f, today){
  const overdue = f.status!=="Resolvido" && f.deadline && f.deadline<today;
  const resolved = f.status==="Resolvido";
  const mp = marketplaces().find(m=>m.name===f.marketplace);
  return '<div class="task-card followup-card '+(resolved?"is-resolved":"")+'" data-id="'+f.id+'" onclick="openFollowUpModal(\''+f.id+'\')">'+
    '<div class="tc-top">'+
      '<div class="tc-title">'+escapeHtml(f.subject||"(sem assunto)")+'</div>'+
      '<div class="tc-actions">'+
        '<button title="Editar" onclick="event.stopPropagation(); openFollowUpModal(\''+f.id+'\')">'+icon('edit')+'</button>'+
        '<button title="Excluir" onclick="event.stopPropagation(); deleteFollowUp(\''+f.id+'\')">'+icon('trash')+'</button>'+
      '</div>'+
    '</div>'+
    '<div class="tc-meta">'+
      '<span class="badge badge-muted">'+escapeHtml(f.type||"—")+'</span>'+
      '<span class="badge badge-muted">'+(mp?'<span class="mp-dot" style="background:'+mp.color+'"></span>':'')+escapeHtml(f.marketplace||"—")+'</span>'+
      '<span class="badge '+(resolved?"badge-low":"badge-medium")+'">'+escapeHtml(f.status||"Aberto")+'</span>'+
      (f.deadline?'<span class="tc-due '+(overdue?"overdue":"")+'">'+fmtDate(f.deadline)+'</span>':'')+
    '</div>'+
  '</div>';
}
function openFollowUpModal(id){
  const existing = id ? state.followUp.find(x=>x.id===id) : null;
  const f = existing || {subject:"", type:trackingTypes()[0]||"", marketplace:(marketplaces()[0]&&marketplaces()[0].name)||"", deadline:"", status:"Aberto", notes:""};
  openModal(id?"Editar Acompanhamento":"Novo Acompanhamento",
    '<form id="followUpForm">'+
      '<div class="form-field"><label>Assunto</label><input type="text" id="fuSubject" value="'+escapeHtml(f.subject)+'" required placeholder="ex: Reclamação de atraso"></div>'+
      '<div class="form-row">'+
        '<div class="form-field"><label>Tipo</label><select id="fuType">'+trackingTypes().map(ty=>'<option '+(ty===f.type?"selected":"")+'>'+escapeHtml(ty)+'</option>').join("")+'</select></div>'+
        '<div class="form-field"><label>Marketplace</label><select id="fuMarketplace">'+marketplaces().map(m=>'<option '+(m.name===f.marketplace?"selected":"")+'>'+escapeHtml(m.name)+'</option>').join("")+'</select></div>'+
      '</div>'+
      '<div class="form-field"><label>Status</label><select id="fuStatus">'+FOLLOWUP_STATUSES.map(s=>'<option '+(s===f.status?"selected":"")+'>'+s+'</option>').join("")+'</select></div>'+
      '<div class="form-field"><label>Prazo</label><input type="date" id="fuDeadline" value="'+(f.deadline||"")+'"></div>'+
      '<div class="form-field"><label>Observações</label><textarea id="fuNotes">'+escapeHtml(f.notes||"")+'</textarea></div>'+
      '<div class="modal-actions">'+
        '<button type="button" class="btn" onclick="closeModal()">Cancelar</button>'+
        (id?'<button type="button" class="btn btn-danger" onclick="deleteFollowUp(\''+id+'\')">Excluir</button>':'')+
        '<button type="submit" class="btn btn-primary">Salvar</button>'+
      '</div>'+
    '</form>',
    box=>{
      box.querySelector("#followUpForm").onsubmit = e=>{
        e.preventDefault();
        const data = {
          subject: box.querySelector("#fuSubject").value.trim(),
          type: box.querySelector("#fuType").value,
          marketplace: box.querySelector("#fuMarketplace").value,
          status: box.querySelector("#fuStatus").value,
          deadline: box.querySelector("#fuDeadline").value,
          notes: box.querySelector("#fuNotes").value.trim()
        };
        if(existing) Object.assign(existing, data);
        else state.followUp.push(Object.assign({id:uid(), createdAt:Date.now()}, data));
        saveState(); closeModal(); renderTasks();
        toast("Acompanhamento salvo","success");
      };
    }
  );
}
window.openFollowUpModal = openFollowUpModal;
window.deleteFollowUp = id=>{
  if(!confirm("Excluir este acompanhamento?")) return;
  state.followUp = state.followUp.filter(f=>f.id!==id);
  saveState(); closeModal(); renderTasks();
  toast("Acompanhamento excluído","danger");
};

/* ============================================================
   RECORRENTES
   ============================================================ */
function processRecurring(){
  const today = new Date(); today.setHours(0,0,0,0);
  const todayIso = todayStr();
  const todayWeekday = today.getDay();
  let changed = false;

  state.recurring.slice().sort((a,b)=>(a.order||0)-(b.order||0)).forEach(r=>{
    let due = false;
    if(r.frequency==="Diária"){ due = r.lastGenerated !== todayIso; }
    else if(r.frequency==="Dias da semana"){ due = (r.weekdays||[]).includes(todayWeekday) && r.lastGenerated !== todayIso; }
    else if(r.frequency==="Quinzenal"){ due = !r.lastGenerated || daysBetween(new Date(r.lastGenerated+"T00:00:00"), today) >= 15; }
    else if(r.frequency==="Mensal"){
      const dom = r.dayOfMonth || 1;
      const sameMonth = r.lastGenerated && r.lastGenerated.slice(0,7)===todayIso.slice(0,7);
      due = today.getDate() >= dom && !sameMonth;
    }
    if(due){
      state.tasks.push({
        id:uid(), name:r.name, category:r.category, dueDate:todayIso, status:"Hoje",
        createdAt:Date.now(), timeSpent:0, order:nextOrderInStatus("Hoje"), recurringId:r.id, quantity:null,
        subtasks:(r.subtasksTemplate||[]).map(s=>({id:uid(), name:s.name, done:false}))
      });
      r.lastGenerated = todayIso;
      changed = true;
    }
  });
  if(changed) saveState();
}
function freqLabel(r){
  if(r.frequency==="Dias da semana") return "Dias: "+(r.weekdays||[]).map(w=>WEEKDAYS_SHORT[w]).join(", ");
  if(r.frequency==="Mensal") return "Mensal · dia "+(r.dayOfMonth||1);
  return r.frequency;
}
function renderRecurring(){
  const tbody = document.querySelector("#recurringTable tbody");
  if(!tbody) return;
  const sorted = state.recurring.slice().sort((a,b)=>(a.order||0)-(b.order||0));
  tbody.innerHTML = sorted.map((r,i)=>
    '<tr>'+
      '<td class="row-actions">'+
        '<button '+(i===0?"disabled":"")+' onclick="moveRecurring(\''+r.id+'\',-1)">'+icon('up')+'</button>'+
        '<button '+(i===sorted.length-1?"disabled":"")+' onclick="moveRecurring(\''+r.id+'\',1)">'+icon('down')+'</button>'+
      '</td>'+
      '<td>'+escapeHtml(r.name)+'</td>'+
      '<td>'+escapeHtml(r.category)+'</td>'+
      '<td>'+freqLabel(r)+'</td>'+
      '<td>'+(r.lastGenerated?fmtDate(r.lastGenerated):"—")+'</td>'+
      '<td class="row-actions"><button onclick="deleteRecurring(\''+r.id+'\')">'+icon('trash')+'</button></td>'+
    '</tr>'
  ).join("") || '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:20px;">Nenhuma recorrência cadastrada.</td></tr>';
}
window.moveRecurring = (id,dir)=>{
  const list = state.recurring.slice().sort((a,b)=>(a.order||0)-(b.order||0));
  const idx = list.findIndex(r=>r.id===id);
  const swapIdx = idx+dir;
  if(swapIdx<0||swapIdx>=list.length) return;
  const a=list[idx], b=list[swapIdx];
  const tmp=a.order; a.order=b.order; b.order=tmp;
  saveState(); renderRecurring();
};
window.deleteRecurring = id=>{
  if(!confirm("Remover esta recorrência?")) return;
  state.recurring = state.recurring.filter(r=>r.id!==id);
  saveState(); renderRecurring();
  toast("Recorrência removida","danger");
};
function openRecurringModal(){
  const weekdayCheckboxes = WEEKDAYS_SHORT.map((w,i)=>'<label class="weekday-chip"><input type="checkbox" value="'+i+'">'+w+'</label>').join("");
  openModal("Nova Recorrência",
    '<form id="recForm">'+
      '<div class="form-field"><label>Nome</label><input type="text" id="rName" required placeholder="ex: Separação Inicial de Pedidos"></div>'+
      '<div class="form-field"><label>Categoria</label><select id="rCategory">'+categories().map(c=>'<option>'+escapeHtml(c)+'</option>').join("")+'</select></div>'+
      '<div class="form-field"><label>Recorrência</label><select id="rFreq">'+FREQUENCIES.map(f=>'<option>'+f+'</option>').join("")+'</select></div>'+
      '<div class="form-field" id="rWeekdaysField" style="display:none"><label>Em quais dias aparece?</label><div class="weekday-picker">'+weekdayCheckboxes+'</div></div>'+
      '<div class="form-field" id="rDomField" style="display:none"><label>Dia do mês</label><input type="number" id="rDayOfMonth" min="1" max="31" value="1"></div>'+
      '<div class="form-field"><label>Subtarefas padrão (uma por linha)</label><textarea id="rSubtasks" placeholder="Importar Pedidos&#10;Emitir Notas Fiscais&#10;Gerar Etiquetas&#10;Enviar pedidos para separação do estoque"></textarea></div>'+
      '<div class="modal-actions"><button type="button" class="btn" onclick="closeModal()">Cancelar</button><button type="submit" class="btn btn-primary">Criar</button></div>'+
    '</form>',
    box=>{
      const freqSel = box.querySelector("#rFreq");
      function toggleFields(){
        box.querySelector("#rWeekdaysField").style.display = freqSel.value==="Dias da semana" ? "" : "none";
        box.querySelector("#rDomField").style.display = freqSel.value==="Mensal" ? "" : "none";
      }
      freqSel.addEventListener("change", toggleFields);
      toggleFields();
      box.querySelector("#recForm").onsubmit = e=>{
        e.preventDefault();
        const weekdays = Array.from(box.querySelectorAll("#rWeekdaysField input:checked")).map(c=>+c.value);
        const subtasksTemplate = box.querySelector("#rSubtasks").value.split("\n").map(s=>s.trim()).filter(Boolean).map(name=>({name}));
        state.recurring.push({
          id:uid(), name:box.querySelector("#rName").value.trim(), category:box.querySelector("#rCategory").value,
          frequency:freqSel.value, weekdays, dayOfMonth:+box.querySelector("#rDayOfMonth").value||1,
          subtasksTemplate, lastGenerated:null, order: state.recurring.length? Math.max(...state.recurring.map(r=>r.order||0))+10 : 10
        });
        saveState(); closeModal(); processRecurring(); renderRecurring();
        toast("Recorrência criada","success");
      };
    }
  );
}

/* ============================================================
   METAS — desdobra automaticamente em tarefas diárias
   ============================================================ */
function recalcGoalTasks(goal){
  const todayIso = todayStr();
  state.tasks = state.tasks.filter(t=> !(t.goalId===goal.id && t.status!=="Concluído" && t.dueDate>=todayIso));
  const remaining = Math.max(0, (goal.target||0)-(goal.current||0));
  if(remaining<=0) return;
  const deadline = goal.deadline || todayIso;
  const start = (goal.startDate && goal.startDate>todayIso) ? goal.startDate : todayIso;
  if(deadline < start) return;
  let days = businessDaysList(start, deadline);
  if(!days.length) days = [todayIso];
  const base = Math.floor(remaining/days.length);
  let extra = remaining - base*days.length;
  days.forEach(dueDate=>{
    const qty = base + (extra>0?1:0);
    if(extra>0) extra--;
    if(qty<=0) return;
    const status = dueDate===todayIso ? "Hoje" : "Backlog";
    state.tasks.push({
      id:uid(), name: goal.name+" — etapa do dia", category:goal.category, dueDate, status,
      createdAt:Date.now(), timeSpent:0, order:nextOrderInStatus(status), goalId:goal.id, targetQty:qty, quantity:null
    });
  });
}
function renderGoals(){
  const grid = document.getElementById("goalsGrid");
  if(!grid) return;
  const todayIso = todayStr();
  grid.innerHTML = state.goals.map(g=>{
    const pct = Math.min(100, Math.round((g.current/g.target)*100)||0);
    const remaining = Math.max(0,(g.target||0)-(g.current||0));
    const daysLeft = g.deadline ? Math.max(0, daysBetween(new Date(todayIso+"T00:00:00"), new Date(g.deadline+"T00:00:00"))+1) : null;
    return '<div class="goal-card">'+
      '<div class="goal-head"><span class="goal-name">'+escapeHtml(g.name)+'</span><span class="goal-pct">'+pct+'%</span></div>'+
      '<div class="goal-sub">'+g.current+' de '+g.target+' '+(g.unit||"")+(g.deadline?' · prazo '+fmtDate(g.deadline):'')+'</div>'+
      '<div class="progress-track"><div class="progress-fill" style="width:'+pct+'%"></div></div>'+
      '<div class="goal-auto">'+(remaining>0 ? ('Faltam <strong>'+remaining+'</strong> '+(g.unit||"")+(daysLeft!=null?' em '+daysLeft+' dia(s)':'')+'.') : 'Meta concluída! 🎉')+'</div>'+
      '<div class="goal-actions"><button class="btn" onclick="openGoalModal(\''+g.id+'\')">Editar</button><button class="btn btn-danger" onclick="deleteGoal(\''+g.id+'\')">'+icon('trash')+'</button></div>'+
    '</div>';
  }).join("") || '<p style="color:var(--text-muted)">Nenhuma meta cadastrada.</p>';
}
function openGoalModal(id){
  const existing = id ? state.goals.find(x=>x.id===id) : null;
  const g = existing || {name:"", target:100, current:0, unit:"unid.", category:categories()[0], startDate:todayStr(), deadline:""};
  openModal(id?"Editar Meta":"Nova Meta",
    '<form id="goalForm">'+
      '<div class="form-field"><label>Nome da meta</label><input type="text" id="gName" required value="'+escapeHtml(g.name)+'" placeholder="ex: Cadastrar 100 SKU no TikTok"></div>'+
      '<div class="form-row">'+
        '<div class="form-field"><label>Meta total</label><input type="number" id="gTarget" required min="1" value="'+g.target+'"></div>'+
        '<div class="form-field"><label>Já realizado</label><input type="number" id="gCurrent" min="0" value="'+(g.current||0)+'"></div>'+
      '</div>'+
      '<div class="form-row">'+
        '<div class="form-field"><label>Unidade</label><input type="text" id="gUnit" value="'+escapeHtml(g.unit||"unid.")+'"></div>'+
        '<div class="form-field"><label>Categoria</label><select id="gCategory">'+categories().map(c=>'<option '+(c===g.category?"selected":"")+'>'+escapeHtml(c)+'</option>').join("")+'</select></div>'+
      '</div>'+
      '<div class="form-row">'+
        '<div class="form-field"><label>Início</label><input type="date" id="gStart" value="'+(g.startDate||todayStr())+'"></div>'+
        '<div class="form-field"><label>Prazo final</label><input type="date" id="gDeadline" required value="'+(g.deadline||"")+'"></div>'+
      '</div>'+
      '<p class="panel-hint">As tarefas diárias (dias úteis) são geradas e recalculadas automaticamente.</p>'+
      '<div class="modal-actions">'+
        '<button type="button" class="btn" onclick="closeModal()">Cancelar</button>'+
        (id?'<button type="button" class="btn btn-danger" onclick="deleteGoal(\''+id+'\')">Excluir</button>':'')+
        '<button type="submit" class="btn btn-primary">Salvar</button>'+
      '</div>'+
    '</form>',
    box=>{
      box.querySelector("#goalForm").onsubmit = e=>{
        e.preventDefault();
        const data = {
          name: box.querySelector("#gName").value.trim(),
          target: +box.querySelector("#gTarget").value,
          current: +box.querySelector("#gCurrent").value,
          unit: box.querySelector("#gUnit").value.trim()||"unid.",
          category: box.querySelector("#gCategory").value,
          startDate: box.querySelector("#gStart").value || todayStr(),
          deadline: box.querySelector("#gDeadline").value
        };
        let g;
        if(existing){
          state.tasks = state.tasks.filter(t=>!(t.goalId===existing.id && t.status!=="Concluído"));
          Object.assign(existing, data); g = existing;
        }else{
          g = Object.assign({id:uid()}, data); state.goals.push(g);
        }
        recalcGoalTasks(g);
        saveState(); closeModal(); renderGoals(); renderTasks();
        toast("Meta salva e tarefas geradas","success");
      };
    }
  );
}
window.openGoalModal = openGoalModal;
window.deleteGoal = id=>{
  if(!confirm("Excluir esta meta? As tarefas pendentes geradas por ela serão removidas.")) return;
  state.tasks = state.tasks.filter(t=>!(t.goalId===id && t.status!=="Concluído"));
  state.goals = state.goals.filter(g=>g.id!==id);
  saveState(); closeModal(); renderGoals(); renderTasks();
  toast("Meta removida","danger");
};

/* ============================================================
   CONTROLE DE TEMPO — jornada de trabalho (trabalho/pausa/almoço/reunião)
   Independente do cronômetro por tarefa: aqui é a jornada do dia inteiro.
   ============================================================ */
function setDaySegment(type){
  const now = Date.now();
  if(state.dayTimer){
    state.workLog.push({
      id: uid(), date: new Date(state.dayTimer.start).toISOString().slice(0,10),
      type: state.dayTimer.type, start: state.dayTimer.start, end: now
    });
  }
  state.dayTimer = (type==="end") ? null : {type, start: now};
  saveState();
  renderTime();
}
function renderTime(){
  const badge = document.getElementById("timeStatusBadge");
  if(!badge) return;
  const labelMap = {work:"Trabalhando", pause:"Pausado", lunch:"Almoço", meeting:"Reunião"};
  badge.className = "time-badge";
  if(state.dayTimer){
    badge.textContent = labelMap[state.dayTimer.type] || "Ativo";
    badge.classList.add("is-"+(state.dayTimer.type==="work"?"working":state.dayTimer.type));
  }else{
    badge.textContent = "Parado";
  }

  const elapsedEl = document.getElementById("timeElapsed");
  elapsedEl.textContent = state.dayTimer ? fmtDuration(Date.now()-state.dayTimer.start) : "00:00:00";

  const today = todayStr();
  const todaySegments = state.workLog.filter(l=>l.date===today);
  const sums = {work:0, pause:0, lunch:0, meeting:0};
  todaySegments.forEach(l=>{ sums[l.type] = (sums[l.type]||0) + (l.end-l.start); });
  if(state.dayTimer) sums[state.dayTimer.type] = (sums[state.dayTimer.type]||0) + (Date.now()-state.dayTimer.start);

  document.getElementById("timeSummaryToday").innerHTML =
    '<div><span>Tempo produtivo</span><strong>'+fmtHoursMin(sums.work)+'</strong></div>'+
    '<div><span>Pausas</span><strong>'+fmtHoursMin(sums.pause)+'</strong></div>'+
    '<div><span>Almoço</span><strong>'+fmtHoursMin(sums.lunch)+'</strong></div>'+
    '<div><span>Reuniões</span><strong>'+fmtHoursMin(sums.meeting)+'</strong></div>';

  const labelType = {work:"Trabalho", pause:"Pausa", lunch:"Almoço", meeting:"Reunião"};
  const tbody = document.querySelector("#timeLogTable tbody");
  const rows = todaySegments.slice().reverse();
  tbody.innerHTML = rows.map(l=>
    '<tr><td>'+labelType[l.type]+'</td><td>'+fmtDateTime(l.start)+'</td><td>'+fmtDateTime(l.end)+'</td><td>'+fmtDuration(l.end-l.start)+'</td></tr>'
  ).join("") || '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:20px;">Nenhum registro hoje ainda.</td></tr>';
}
function todayWorkedMs(){
  const today = todayStr();
  let ms = state.workLog.filter(l=>l.date===today && l.type==="work").reduce((s,l)=>s+(l.end-l.start),0);
  if(state.dayTimer && state.dayTimer.type==="work") ms += Date.now()-state.dayTimer.start;
  return ms;
}

/* ============================================================
   CALENDÁRIO
   ============================================================ */
let calDate = new Date();
function renderCalendar(){
  const grid = document.getElementById("calendarGrid");
  const label = document.getElementById("calLabel");
  if(!grid) return;
  grid.innerHTML = "";
  const y = calDate.getFullYear(), m = calDate.getMonth();
  label.textContent = MONTHS[m]+" "+y;
  WEEKDAYS_SHORT.forEach(d=> grid.insertAdjacentHTML("beforeend", '<div class="cal-day-head">'+d+'</div>'));
  const first = new Date(y,m,1).getDay();
  const days = new Date(y,m+1,0).getDate();
  for(let i=0;i<first;i++) grid.insertAdjacentHTML("beforeend",'<div class="cal-day empty"></div>');
  for(let d=1; d<=days; d++){
    const iso = y+"-"+pad(m+1)+"-"+pad(d);
    const hasTask = state.tasks.some(t=>t.dueDate===iso);
    grid.insertAdjacentHTML("beforeend", '<div class="cal-day '+(iso===todayStr()?"today":"")+'"><span>'+d+'</span>'+(hasTask?'<div class="cal-dot"></div>':'')+'</div>');
  }
}

/* ============================================================
   RELATÓRIOS
   ============================================================ */
function buildReport(type){
  if(type==="tasks"){
    const rows=[["Nome","Categoria","Status","Data limite","Quantidade"]];
    state.tasks.filter(t=>t.status==="Concluído").forEach(t=>rows.push([t.name,t.category,t.status,fmtDate(t.dueDate),t.quantity!=null?t.quantity:""]));
    return rows;
  }
  if(type==="timeByCategory"){
    const rows=[["Categoria","Tempo total"]];
    categories().forEach(c=>{
      const ms = state.tasks.filter(t=>t.category===c).reduce((s,t)=>s+(t.timeSpent||0),0);
      if(ms>0) rows.push([c, fmtHoursMin(ms)]);
    });
    return rows;
  }
  if(type==="timeByTask"){
    const rows=[["Tarefa","Categoria","Tempo total"]];
    state.tasks.filter(t=>(t.timeSpent||0)>0).sort((a,b)=>(b.timeSpent||0)-(a.timeSpent||0)).forEach(t=>rows.push([t.name,t.category,fmtHoursMin(t.timeSpent)]));
    return rows;
  }
  if(type==="goals"){
    const rows=[["Meta","Prazo","Total","Realizado","%"]];
    state.goals.forEach(g=>rows.push([g.name, fmtDate(g.deadline), g.target, g.current, Math.round((g.current/g.target)*100)+"%"]));
    return rows;
  }
  if(type==="followup"){
    const rows=[["Tipo","Assunto","Marketplace","Status","Prazo"]];
    state.followUp.forEach(f=>rows.push([f.type, f.subject, f.marketplace, f.status, fmtDate(f.deadline)]));
    return rows;
  }
  return [["Sem dados"]];
}
function renderReportPreview(){
  const sel = document.getElementById("reportType");
  if(!sel) return;
  const rows = buildReport(sel.value);
  const out = document.getElementById("reportOutput");
  if(rows.length<=1){ out.innerHTML = '<p style="color:var(--text-muted)">Sem dados para este relatório ainda.</p>'; return; }
  out.innerHTML = '<table class="data-table"><thead><tr>'+rows[0].map(h=>'<th>'+escapeHtml(h)+'</th>').join("")+'</tr></thead><tbody>'+
    rows.slice(1).map(r=>'<tr>'+r.map(c=>'<td>'+escapeHtml(c)+'</td>').join("")+'</tr>').join("")+'</tbody></table>';
}

/* ============================================================
   CONFIGURAÇÕES
   ============================================================ */
function renderSettings(){
  const catList = document.getElementById("settingsCategoriesList");
  catList.innerHTML = categories().map((c,i)=>
    '<div class="settings-item">'+
      '<span>'+escapeHtml(c)+'</span>'+
      '<label class="checkbox-label le-qty-label"><input type="checkbox" class="cat-qty-toggle" data-idx="'+i+'" '+(isQtyCategory(c)?"checked":"")+'> tem quantidade</label>'+
      '<button onclick="removeCat('+i+')">'+icon('trash')+'</button>'+
    '</div>'
  ).join("");
  catList.querySelectorAll(".cat-qty-toggle").forEach(chk=>{
    chk.onchange = ()=>{
      const name = categories()[+chk.dataset.idx];
      if(chk.checked){ if(!qtyCategories().includes(name)) qtyCategories().push(name); }
      else{ state.userSettings.qtyCategories = qtyCategories().filter(q=>q!==name); }
      saveState();
    };
  });

  const mpList = document.getElementById("settingsMarketplacesList");
  mpList.innerHTML = marketplaces().map((m,i)=>
    '<div class="settings-item">'+
      '<input type="color" class="mp-color" data-idx="'+i+'" value="'+m.color+'">'+
      '<span>'+escapeHtml(m.name)+'</span>'+
      '<button onclick="removeMarketplace('+i+')">'+icon('trash')+'</button>'+
    '</div>'
  ).join("");
  mpList.querySelectorAll(".mp-color").forEach(inp=>{
    inp.onchange = ()=>{ marketplaces()[+inp.dataset.idx].color = inp.value; saveState(); };
  });

  const ttList = document.getElementById("settingsTrackingTypesList");
  if(ttList){
    ttList.innerHTML = trackingTypes().map((t,i)=>
      '<div class="settings-item"><span>'+escapeHtml(t)+'</span><button onclick="removeTrackingType('+i+')">'+icon('trash')+'</button></div>'
    ).join("");
  }

  const darkSwitch = document.getElementById("darkModeSwitch");
  if(darkSwitch) darkSwitch.checked = state.theme==="dark";
}
window.removeCat = i=>{
  const name = categories()[i];
  categories().splice(i,1);
  state.userSettings.qtyCategories = qtyCategories().filter(q=>q!==name);
  saveState(); renderSettings();
};
window.removeMarketplace = i=>{ marketplaces().splice(i,1); saveState(); renderSettings(); };
window.removeTrackingType = i=>{ trackingTypes().splice(i,1); saveState(); renderSettings(); };

/* ============================================================
   TEMA
   ============================================================ */
function applyTheme(){ document.documentElement.setAttribute("data-theme", state.theme); }
function toggleTheme(){
  state.theme = state.theme==="dark" ? "light" : "dark";
  saveState(); applyTheme(); renderSettings();
}

/* ============================================================
   BUSCA GLOBAL
   ============================================================ */
function setupSearch(){
  const input = document.getElementById("globalSearch");
  const resultsEl = document.getElementById("searchResults");
  input.addEventListener("input", ()=>{
    const q = input.value.trim().toLowerCase();
    if(!q){ resultsEl.classList.add("hidden"); return; }
    let results = [];
    state.tasks.forEach(t=>{ if(t.name.toLowerCase().includes(q)) results.push({label:t.name, sub:"Tarefa · "+t.status, section:"tasks"}); });
    state.followUp.forEach(f=>{ if((f.subject||"").toLowerCase().includes(q)) results.push({label:f.subject, sub:"Acompanhamento", section:"tasks"}); });
    state.goals.forEach(g=>{ if(g.name.toLowerCase().includes(q)) results.push({label:g.name, sub:"Meta", section:"goals"}); });
    results = results.slice(0,12);
    resultsEl.innerHTML = results.map(r=>'<div class="search-result-item" data-section="'+r.section+'">'+escapeHtml(r.label)+'<small>'+escapeHtml(r.sub)+'</small></div>').join("") || '<div class="search-result-item">Nenhum resultado.</div>';
    resultsEl.classList.remove("hidden");
  });
  resultsEl.addEventListener("click", e=>{
    const item = e.target.closest("[data-section]");
    if(item){ goTo(item.dataset.section); resultsEl.classList.add("hidden"); input.value=""; }
  });
  document.addEventListener("click", e=>{
    if(!e.target.closest(".search-wrap") && !e.target.closest(".search-results")) resultsEl.classList.add("hidden");
  });
}

/* ============================================================
   INIT
   ============================================================ */
function setTopbarDate(){
  const now = new Date();
  document.getElementById("topbarDate").textContent = now.toLocaleDateString("pt-BR",{weekday:"long",day:"numeric",month:"long",year:"numeric"});
}

document.addEventListener("DOMContentLoaded", ()=>{
  applyTheme();
  normalizeOrders();
  processRecurring();
  saveState();
  setTopbarDate();
  setupSearch();

  renderMap.dashboard = renderDashboard;
  renderMap.tasks = renderTasks;
  renderMap.time = renderTime;
  renderMap.recurring = renderRecurring;
  renderMap.goals = renderGoals;
  renderMap.calendar = renderCalendar;
  renderMap.reports = renderReportPreview;
  renderMap.settings = renderSettings;

  document.getElementById("mainNav").onclick = e=>{
    const btn = e.target.closest(".nav-item");
    if(btn) goTo(btn.dataset.section);
  };
  document.getElementById("btnOpenSidebar").onclick = ()=>{
    document.getElementById("sidebar").classList.add("is-open");
    document.getElementById("sidebarOverlay").classList.add("is-open");
  };
  document.getElementById("btnCloseSidebar").onclick = closeSidebarMobile;
  document.getElementById("sidebarOverlay").onclick = closeSidebarMobile;
  document.getElementById("btnTheme").onclick = toggleTheme;
  document.getElementById("btnThemeMobile").onclick = toggleTheme;

  document.getElementById("btnNewTask").onclick = ()=>openTaskModal();
  document.getElementById("btnNewFollowUp").onclick = ()=>openFollowUpModal();
  document.querySelectorAll("[data-time]").forEach(btn=>{
    btn.onclick = ()=> setDaySegment(btn.dataset.time);
  });
  document.getElementById("btnNewRecurring").onclick = openRecurringModal;
  document.getElementById("btnNewGoal").onclick = ()=>openGoalModal();

  document.getElementById("calPrev").onclick = ()=>{ calDate.setMonth(calDate.getMonth()-1); renderCalendar(); };
  document.getElementById("calNext").onclick = ()=>{ calDate.setMonth(calDate.getMonth()+1); renderCalendar(); };

  document.getElementById("reportType").onchange = renderReportPreview;
  document.getElementById("btnExportCSV").onclick = ()=>{
    const type = document.getElementById("reportType").value;
    downloadFile("relatorio_"+type+"_"+todayStr()+".csv", toCSV(buildReport(type)), "text/csv");
    toast("CSV exportado","success");
  };

  document.getElementById("darkModeSwitch").onchange = toggleTheme;
  document.getElementById("btnAddCategory").onclick = ()=>{
    const inp = document.getElementById("inputNewCategory");
    const v = inp.value.trim();
    if(v){ categories().push(v); inp.value=""; saveState(); renderSettings(); toast("Categoria adicionada","success"); }
  };
  document.getElementById("btnAddMarketplace").onclick = ()=>{
    const inp = document.getElementById("inputNewMarketplace");
    const colorInp = document.getElementById("inputNewMarketplaceColor");
    const v = inp.value.trim();
    if(v){ marketplaces().push({name:v, color:colorInp.value}); inp.value=""; saveState(); renderSettings(); toast("Marketplace adicionado","success"); }
  };
  document.getElementById("btnAddTrackingType").onclick = ()=>{
    const inp = document.getElementById("inputNewTrackingType");
    const v = inp.value.trim();
    if(v){ trackingTypes().push(v); inp.value=""; saveState(); renderSettings(); toast("Tipo adicionado","success"); }
  };
  document.getElementById("btnBackup").onclick = ()=>{
    downloadFile("hubmarket_backup_"+todayStr()+".json", JSON.stringify(state,null,2), "application/json");
    toast("Backup baixado","success");
  };
  document.getElementById("inputRestore").addEventListener("change", e=>{
    const file = e.target.files[0]; if(!file) return;
    const reader = new FileReader();
    reader.onload = ()=>{
      try{
        const data = JSON.parse(reader.result);
        state = Object.assign(defaultState(), data);
        state.userSettings = Object.assign(defaultState().userSettings, data.userSettings||{});
        saveState(); applyTheme(); goTo("dashboard");
        toast("Backup restaurado","success");
      }catch(err){ toast("Arquivo inválido","danger"); }
    };
    reader.readAsText(file);
    e.target.value = "";
  });
  document.getElementById("btnWipe").onclick = ()=>{
    if(confirm("Apagar todos os dados? Esta ação não pode ser desfeita.")){
      state = defaultState();
      saveState(); applyTheme(); goTo("dashboard");
      toast("Todos os dados foram apagados","danger");
    }
  };

  goTo("dashboard");
  setInterval(()=>{
    if(!document.getElementById("view-tasks").classList.contains("hidden")) renderTasks();
    if(!document.getElementById("view-time").classList.contains("hidden")) renderTime();
  }, 1000);
});

function renderDashboard(){
  const cards = document.getElementById("dashCards");
  const today = todayStr();
  const pending = state.tasks.filter(t=>t.status!=="Concluído").length;
  const doneToday = state.tasks.filter(t=>t.status==="Concluído" && t.dueDate===today).length;
  const overdue = state.tasks.filter(t=>t.status!=="Concluído" && t.dueDate && t.dueDate<today).length;
  const workedToday = todayWorkedMs();
  const openFollowUps = state.followUp.filter(f=>f.status!=="Resolvido").length;
  cards.innerHTML =
    '<div class="stat-card"><div class="stat-value">'+pending+'</div><div class="stat-label">Tarefas Pendentes</div></div>'+
    '<div class="stat-card"><div class="stat-value" style="'+(overdue>0?"color:var(--danger)":"")+'">'+overdue+'</div><div class="stat-label">Tarefas Atrasadas</div></div>'+
    '<div class="stat-card"><div class="stat-value">'+doneToday+'</div><div class="stat-label">Concluídas Hoje</div></div>'+
    '<div class="stat-card"><div class="stat-value">'+fmtHoursMin(workedToday)+'</div><div class="stat-label">Tempo Hoje</div></div>'+
    '<div class="stat-card"><div class="stat-value">'+openFollowUps+'</div><div class="stat-label">Acompanhamentos Abertos</div></div>';

  const list = document.getElementById("dashTodayList");
  const todayTasks = state.tasks.filter(t=>t.dueDate===today).sort((a,b)=>(a.order||0)-(b.order||0));
  list.innerHTML = todayTasks.map(t=>
    '<div class="rank-row"><span style="flex:1;text-align:left;'+(t.status==="Concluído"?"text-decoration:line-through;color:var(--text-muted);":"")+'">'+escapeHtml(t.name)+'</span><span class="badge badge-muted">'+t.status+'</span></div>'
  ).join("") || '<p style="color:var(--text-muted);font-size:13px;">Nenhuma tarefa para hoje.</p>';
}

})();

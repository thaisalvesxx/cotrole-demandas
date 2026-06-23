/* ==========================================================================
   HUBMARKET — script.js (Versão Atualizada)
   SaaS de gestão para Analista de E-commerce e Marketplaces
   100% client-side · LocalStorage · sem backend
   ========================================================================== */

(function(){
"use strict";

/* ============================================================
   CONSTANTS & CONFIGURATION
   ============================================================ */
const DB_KEY = "hubmarket_db_v2"; // Nova versão para evitar conflitos

const DEFAULT_CATEGORIES = ["Estoque", "Cadastro de produtos", "Melhoria de anúncios", "Exportação de anúncios", "Marketplace", "Atendimento", "Financeiro", "Outros"];
const PRIORITIES = ["Baixa", "Média", "Alta", "Crítica"];
const STATUSES = ["Backlog", "Hoje", "Em andamento", "Aguardando", "Concluído"];
const DEFAULT_MARKETPLACES = ["Mercado Livre", "Shopee", "Amazon", "Magalu", "Shein"];
const WEEKDAYS_FULL = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
const WEEKDAYS_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

/* ============================================================
   STATE MANAGEMENT
   ============================================================ */
function defaultState() {
  return {
    theme: "light",
    userSettings: {
      categories: [...DEFAULT_CATEGORIES],
      marketplaces: [...DEFAULT_MARKETPLACES]
    },
    tasks: [],
    recurring: [],
    goals: [],
    timeLog: [],
    activeTimer: null, // { taskId, start, type: 'task' | 'general' }
    calendarEvents: [],
    followUp: [] // Aba de acompanhamento unificada
  };
}

let state = loadState();

function loadState() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (!raw) {
      // Tentar migrar da v1 se existir
      const oldRaw = localStorage.getItem("hubmarket_db_v1");
      if (oldRaw) {
        const oldData = JSON.parse(oldRaw);
        const newState = defaultState();
        return Object.assign(newState, oldData, { theme: oldData.theme || "light" });
      }
      return defaultState();
    }
    return Object.assign(defaultState(), JSON.parse(raw));
  } catch (e) {
    console.error("Erro ao carregar dados", e);
    return defaultState();
  }
}

function saveState() {
  localStorage.setItem(DB_KEY, JSON.stringify(state));
}

/* ============================================================
   UTILITIES
   ============================================================ */
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function todayStr() { return new Date().toISOString().slice(0, 10); }
function pad(n) { return n.toString().padStart(2, "0"); }

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d)) return "—";
  return pad(d.getDate()) + "/" + pad(d.getMonth() + 1) + "/" + d.getFullYear();
}

function fmtDuration(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return pad(h) + ":" + pad(m) + ":" + pad(s);
}

function fmtHoursMin(ms) {
  const totalMin = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h + "h " + m + "m";
}

function escapeHtml(str) {
  if (str === undefined || str === null) return "";
  return str.toString().replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function toast(msg, type) {
  const container = document.getElementById("toastContainer");
  if (!container) return;
  const el = document.createElement("div");
  el.className = "toast" + (type ? " " + type : "");
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => { el.style.opacity = "0"; el.style.transition = "opacity .3s"; setTimeout(() => el.remove(), 300); }, 3200);
}

function priorityBadgeClass(p) {
  return { "Baixa": "badge-low", "Média": "badge-medium", "Alta": "badge-high", "Crítica": "badge-critical" }[p] || "badge-muted";
}

function getWorkDaysBetween(start, end) {
  let count = 0;
  let cur = new Date(start + "T00:00:00");
  const last = new Date(end + "T00:00:00");
  while (cur <= last) {
    const day = cur.getDay();
    if (day !== 0 && day !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

/* ============================================================
   MODAL SYSTEM
   ============================================================ */
const modalOverlay = document.getElementById("modalOverlay");
const modalBox = document.getElementById("modalBox");

function openModal(title, innerHTML, onMount) {
  modalBox.innerHTML = "<h2>" + escapeHtml(title) + "</h2>" + innerHTML;
  modalOverlay.classList.remove("hidden");
  if (onMount) onMount(modalBox);
}

function closeModal() {
  modalOverlay.classList.add("hidden");
  modalBox.innerHTML = "";
}

if (modalOverlay) {
  modalOverlay.addEventListener("click", e => { if (e.target === modalOverlay) closeModal(); });
}

/* ============================================================
   NAVIGATION
   ============================================================ */
const sections = ["dashboard", "tasks", "recurring", "goals", "followup", "time", "calendar", "reports", "settings"];
const renderMap = {};

function goTo(section) {
  sections.forEach(s => {
    const el = document.getElementById("view-" + s);
    if (el) el.classList.toggle("hidden", s !== section);
  });
  document.querySelectorAll(".nav-item").forEach(btn => {
    btn.classList.toggle("is-active", btn.dataset.section === section);
  });
  if (renderMap[section]) renderMap[section]();
  closeSidebarMobile();
}

const mainNav = document.getElementById("mainNav");
if (mainNav) {
  mainNav.addEventListener("click", e => {
    const btn = e.target.closest(".nav-item");
    if (btn) goTo(btn.dataset.section);
  });
}

function closeSidebarMobile() {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebarOverlay");
  if (sidebar) sidebar.classList.remove("is-open");
  if (overlay) overlay.classList.remove("is-open");
}

const btnOpenSidebar = document.getElementById("btnOpenSidebar");
if (btnOpenSidebar) {
  btnOpenSidebar.addEventListener("click", () => {
    document.getElementById("sidebar").classList.add("is-open");
    document.getElementById("sidebarOverlay").classList.add("is-open");
  });
}

const btnCloseSidebar = document.getElementById("btnCloseSidebar");
if (btnCloseSidebar) btnCloseSidebar.addEventListener("click", closeSidebarMobile);

const sidebarOverlay = document.getElementById("sidebarOverlay");
if (sidebarOverlay) sidebarOverlay.addEventListener("click", closeSidebarMobile);

/* ============================================================
   THEME
   ============================================================ */
function applyTheme() {
  document.documentElement.setAttribute("data-theme", state.theme);
  const sw = document.getElementById("darkModeSwitch");
  if (sw) sw.checked = state.theme === "dark";
}

function toggleTheme() {
  state.theme = state.theme === "dark" ? "light" : "dark";
  saveState();
  applyTheme();
}

const btnTheme = document.getElementById("btnTheme");
if (btnTheme) btnTheme.addEventListener("click", toggleTheme);

const btnThemeMobile = document.getElementById("btnThemeMobile");
if (btnThemeMobile) btnThemeMobile.addEventListener("click", toggleTheme);

/* ============================================================
   ICON HELPER
   ============================================================ */
function icon(name) {
  const icons = {
    clipboard: '<svg viewBox="0 0 24 24"><rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4V3a1 1 0 011-1h4a1 1 0 011 1v1"/><path d="M9 11h6M9 15h6"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    alert: '<svg viewBox="0 0 24 24"><path d="M12 9v4M12 17h.01"/><path d="M10.3 4.3L2.6 18a1 1 0 00.9 1.5h17a1 1 0 00.9-1.5L13.7 4"/></svg>',
    file: '<svg viewBox="0 0 24 24"><path d="M7 3h8l4 4v13a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z"/><path d="M15 3v4h4"/></svg>',
    box: '<svg viewBox="0 0 24 24"><path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 7v10l9 4 9-4V7M12 11v10"/></svg>',
    star: '<svg viewBox="0 0 24 24"><path d="M12 3l2.6 5.6 6.1.6-4.6 4.1 1.3 6-5.4-3.1-5.4 3.1 1.3-6-4.6-4.1 6.1-.6z"/></svg>',
    clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>',
    trend: '<svg viewBox="0 0 24 24"><path d="M3 17l6-6 4 4 8-8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4l11-11-4-4L4 16v4z"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14"/></svg>',
    copy: '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a1 1 0 01-1-1V4a1 1 0 011-1h10a1 1 0 011 1v1"/></svg>',
    play: '<svg viewBox="0 0 24 24"><path d="M5 3l14 9-14 9V3z" fill="currentColor"/></svg>',
    stop: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" fill="currentColor"/></svg>',
    plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" stroke-linecap="round"/></svg>'
  };
  return icons[name] || "";
}

// Expôr funções necessárias globalmente se preciso ou continuar o script...
// Para manter o arquivo limpo e organizado, continuarei a implementação nas próximas fases.
window.Hubmarket = { state, saveState, goTo, renderMap };

})();

/* ============================================================
   TASK MANAGEMENT (KANBAN)
   ============================================================ */
let taskFilters = { search: "", category: "", priority: "" };
let draggedTaskId = null;

function renderTasks() {
  const board = document.getElementById("kanbanBoard");
  if (!board) return;

  const today = todayStr();
  const categories = state.userSettings.categories;
  
  // Populate filters
  const catFilter = document.getElementById("taskFilterCategory");
  if (catFilter && catFilter.options.length <= 1) {
    categories.forEach(c => {
      const opt = document.createElement("option");
      opt.value = c; opt.textContent = c;
      catFilter.appendChild(opt);
    });
  }
  const prioFilter = document.getElementById("taskFilterPriority");
  if (prioFilter && prioFilter.options.length <= 1) {
    PRIORITIES.forEach(p => {
      const opt = document.createElement("option");
      opt.value = p; opt.textContent = p;
      prioFilter.appendChild(opt);
    });
  }

  let filtered = state.tasks.filter(t => {
    if (taskFilters.search && !t.name.toLowerCase().includes(taskFilters.search.toLowerCase())) return false;
    if (taskFilters.category && t.category !== taskFilters.category) return false;
    if (taskFilters.priority && t.priority !== taskFilters.priority) return false;
    return true;
  });

  board.innerHTML = STATUSES.map(status => {
    // Ordenação: Recorrentes costumam ter horário ou ordem de criação. 
    // O usuário reclamou da ordem inversa. Vamos ordenar por createdAt (mais antigos primeiro ou conforme definido).
    const items = filtered.filter(t => t.status === status).sort((a, b) => {
      // Se tiver ordem definida, usa ela, senão usa data de criação
      if (a.order !== undefined && b.order !== undefined) return a.order - b.order;
      return a.createdAt - b.createdAt; 
    });

    return `
      <div class="kanban-col" data-status="${status}">
        <div class="kanban-col-head">
          <span>${status}</span>
          <span class="count">${items.length}</span>
        </div>
        <div class="kanban-cards" data-status="${status}">
          ${items.map(t => taskCardHTML(t, today)).join("")}
        </div>
      </div>
    `;
  }).join("");

  attachTaskEvents(board);
}

function taskCardHTML(t, today) {
  const overdue = t.status !== "Concluído" && t.dueDate && t.dueDate < today;
  const isRunning = state.activeTimer && state.activeTimer.taskId === t.id;
  
  // Cálculo de tempo total já registrado para esta tarefa
  const totalTimeMs = (t.timeSpent || 0) + (isRunning ? (Date.now() - state.activeTimer.start) : 0);

  return `
    <div class="task-card" draggable="true" data-id="${t.id}">
      <div class="tc-top">
        <div class="tc-title">${escapeHtml(t.name)}</div>
        <div class="tc-actions">
          <button class="timer-btn ${isRunning ? 'running' : ''}" data-action="toggleTimer" title="${isRunning ? 'Pausar' : 'Iniciar'} Tempo">
            ${isRunning ? icon("stop") : icon("play")}
          </button>
          <button data-action="edit" title="Editar">${icon("edit")}</button>
          <button data-action="delete" title="Excluir">${icon("trash")}</button>
        </div>
      </div>
      ${t.desc ? `<div class="tc-desc">${escapeHtml(t.desc)}</div>` : ''}
      <div class="tc-time-info">
        <span class="clock-icon">${icon("clock")}</span>
        <span class="time-val">${fmtDuration(totalTimeMs)}</span>
      </div>
      <div class="tc-meta">
        <span class="badge ${priorityBadgeClass(t.priority)}">${t.priority}</span>
        <span class="badge badge-muted">${t.category}</span>
        ${t.dueDate ? `<span class="tc-due ${overdue ? 'overdue' : ''}">${fmtDate(t.dueDate)}</span>` : ''}
      </div>
      ${t.subtasks && t.subtasks.length > 0 ? `
        <div class="tc-subtasks-summary">
          ${t.subtasks.filter(s => s.done).length}/${t.subtasks.length} subtarefas
        </div>
      ` : ''}
    </div>
  `;
}

function attachTaskEvents(board) {
  board.querySelectorAll(".task-card").forEach(card => {
    card.addEventListener("dragstart", e => {
      draggedTaskId = card.dataset.id;
      card.classList.add("dragging");
    });
    card.addEventListener("dragend", () => card.classList.remove("dragging"));
    
    card.querySelectorAll("[data-action]").forEach(btn => {
      btn.addEventListener("click", e => {
        e.stopPropagation();
        const id = card.dataset.id;
        const action = btn.dataset.action;
        if (action === "edit") openTaskModal(state.tasks.find(t => t.id === id));
        if (action === "delete") deleteTask(id);
        if (action === "toggleTimer") toggleTaskTimer(id);
      });
    });
  });

  board.querySelectorAll(".kanban-col").forEach(col => {
    col.addEventListener("dragover", e => { e.preventDefault(); col.classList.add("drag-over"); });
    col.addEventListener("dragleave", () => col.classList.remove("drag-over"));
    col.addEventListener("drop", e => {
      e.preventDefault();
      col.classList.remove("drag-over");
      const task = state.tasks.find(t => t.id === draggedTaskId);
      if (task) {
        task.status = col.dataset.status;
        if (task.status === "Concluído") {
          task.completedAt = Date.now();
          if (state.activeTimer && state.activeTimer.taskId === task.id) stopTimer();
        }
        saveState(); renderTasks();
      }
    });
  });
}

/* ============================================================
   TIME TRACKING LOGIC
   ============================================================ */
function toggleTaskTimer(taskId) {
  const now = Date.now();
  if (state.activeTimer && state.activeTimer.taskId === taskId) {
    stopTimer();
  } else {
    if (state.activeTimer) stopTimer();
    state.activeTimer = { taskId, start: now, type: 'task' };
    toast("Cronômetro iniciado", "success");
  }
  saveState();
  renderTasks();
}

function stopTimer() {
  if (!state.activeTimer) return;
  const now = Date.now();
  const duration = now - state.activeTimer.start;
  
  if (state.activeTimer.taskId) {
    const task = state.tasks.find(t => t.id === state.activeTimer.taskId);
    if (task) {
      task.timeSpent = (task.timeSpent || 0) + duration;
      state.timeLog.push({
        id: uid(),
        taskId: task.id,
        taskName: task.name,
        category: task.category,
        duration: duration,
        date: todayStr(),
        timestamp: now
      });
    }
  }
  state.activeTimer = null;
  toast("Tempo registrado", "info");
}

// Tick para atualizar a UI do cronômetro
setInterval(() => {
  if (state.activeTimer && !document.getElementById("view-tasks").classList.contains("hidden")) {
    renderTasks();
  }
}, 1000);

/* ============================================================
   RECURRING TASKS (ADVANCED)
   ============================================================ */
function processRecurring() {
  const today = new Date();
  const todayISO = todayStr();
  const dayOfWeek = today.getDay(); // 0=Dom, 1=Seg...
  let changed = false;

  state.recurring.forEach(r => {
    if (r.lastGenerated === todayISO) return;

    let shouldGenerate = false;
    if (r.type === "daily") {
      shouldGenerate = true;
    } else if (r.type === "weekdays" && r.days && r.days.includes(dayOfWeek)) {
      shouldGenerate = true;
    }

    if (shouldGenerate) {
      state.tasks.push({
        id: uid(),
        name: r.name,
        desc: "Gerada automaticamente (Recorrência)",
        category: r.category,
        priority: r.priority,
        status: "Hoje",
        dueDate: todayISO,
        createdAt: Date.now(),
        timeSpent: 0,
        subtasks: r.subtasks ? JSON.parse(JSON.stringify(r.subtasks)) : [],
        order: r.order || 0
      });
      r.lastGenerated = todayISO;
      changed = true;
    }
  });

  if (changed) saveState();
}

/* ============================================================
   GOALS AUTOMATION
   ============================================================ */
function processGoals() {
  const todayISO = todayStr();
  let changed = false;

  state.goals.forEach(g => {
    if (g.completed || g.deadline < todayISO) return;
    if (g.lastUpdate === todayISO) return;

    const remaining = g.target - (g.current || 0);
    if (remaining <= 0) return;

    const workDays = getWorkDaysBetween(todayISO, g.deadline);
    if (workDays > 0) {
      const dailyTarget = Math.ceil(remaining / workDays);
      
      // Criar tarefa para hoje
      state.tasks.push({
        id: uid(),
        name: `${g.name}: Cadastrar ${dailyTarget} itens`,
        desc: `Meta: ${g.current}/${g.target} até ${fmtDate(g.deadline)}. Falta: ${remaining}. Dias úteis: ${workDays}.`,
        category: "Cadastro de produtos",
        priority: "Alta",
        status: "Hoje",
        dueDate: todayISO,
        createdAt: Date.now(),
        goalId: g.id,
        dailyTarget: dailyTarget
      });
      
      g.lastUpdate = todayISO;
      changed = true;
    }
  });

  if (changed) saveState();
}

/* ============================================================
   INITIALIZATION
   ============================================================ */
window.addEventListener("load", () => {
  processRecurring();
  processGoals();
  applyTheme();
  goTo("dashboard");
  
  // Update date in topbar
  const dateEl = document.getElementById("topbarDate");
  if (dateEl) {
    const now = new Date();
    dateEl.textContent = now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  }
});

/* ============================================================
   MODALS (TASK, RECURRING, GOAL, FOLLOWUP)
   ============================================================ */
function openTaskModal(task) {
  const isEdit = !!task;
  const t = task || { name: "", desc: "", category: state.userSettings.categories[0], priority: "Média", status: "Backlog", subtasks: [] };
  
  openModal(isEdit ? "Editar tarefa" : "Nova tarefa", `
    <form id="taskForm">
      <div class="form-field"><label>Nome</label><input type="text" id="fName" value="${escapeHtml(t.name)}" required></div>
      <div class="form-field"><label>Descrição</label><textarea id="fDesc">${escapeHtml(t.desc || "")}</textarea></div>
      <div class="form-row">
        <div class="form-field"><label>Categoria</label><select id="fCategory">${state.userSettings.categories.map(c => `<option ${c === t.category ? "selected" : ""}>${c}</option>`).join("")}</select></div>
        <div class="form-field"><label>Prioridade</label><select id="fPriority">${PRIORITIES.map(p => `<option ${p === t.priority ? "selected" : ""}>${p}</option>`).join("")}</select></div>
      </div>
      <div class="form-row">
        <div class="form-field"><label>Data limite</label><input type="date" id="fDue" value="${t.dueDate || ""}"></div>
        <div class="form-field"><label>Status</label><select id="fStatus">${STATUSES.map(s => `<option ${s === t.status ? "selected" : ""}>${s}</option>`).join("")}</select></div>
      </div>
      
      <div class="form-field" id="qtyField" style="display: ${["Cadastro de produtos", "Melhoria de anúncios", "Exportação de anúncios"].includes(t.category) ? 'block' : 'none'}">
        <label>Quantidade produzida</label>
        <input type="number" id="fQty" value="${t.quantity || 0}" min="0">
      </div>

      <div class="form-field">
        <label>Subtarefas</label>
        <div id="subtasksList" class="subtasks-list">
          ${(t.subtasks || []).map((s, i) => `
            <div class="subtask-item">
              <input type="checkbox" ${s.done ? 'checked' : ''} data-idx="${i}">
              <input type="text" value="${escapeHtml(s.text)}" data-idx="${i}">
              <button type="button" class="btn-del-sub" data-idx="${i}">${icon("trash")}</button>
            </div>
          `).join("")}
        </div>
        <button type="button" class="btn btn-sm" id="btnAddSubtask">+ Adicionar subtarefa</button>
      </div>

      <div class="modal-actions">
        <button type="button" class="btn" id="btnCancelModal">Cancelar</button>
        <button type="submit" class="btn btn-primary">Salvar</button>
      </div>
    </form>
  `, box => {
    box.querySelector("#btnCancelModal").onclick = closeModal;
    
    const catSelect = box.querySelector("#fCategory");
    catSelect.onchange = () => {
      box.querySelector("#qtyField").style.display = ["Cadastro de produtos", "Melhoria de anúncios", "Exportação de anúncios"].includes(catSelect.value) ? 'block' : 'none';
    };

    const list = box.querySelector("#subtasksList");
    box.querySelector("#btnAddSubtask").onclick = () => {
      const div = document.createElement("div");
      div.className = "subtask-item";
      div.innerHTML = `<input type="checkbox"> <input type="text" placeholder="Subtarefa..."> <button type="button" class="btn-del-sub">${icon("trash")}</button>`;
      list.appendChild(div);
      div.querySelector(".btn-del-sub").onclick = () => div.remove();
    };

    list.querySelectorAll(".btn-del-sub").forEach(btn => {
      btn.onclick = () => btn.parentElement.remove();
    });

    box.querySelector("#taskForm").onsubmit = e => {
      e.preventDefault();
      const subs = Array.from(list.querySelectorAll(".subtask-item")).map(item => ({
        text: item.querySelector("input[type='text']").value.trim(),
        done: item.querySelector("input[type='checkbox']").checked
      })).filter(s => s.text);

      const data = {
        name: box.querySelector("#fName").value.trim(),
        desc: box.querySelector("#fDesc").value.trim(),
        category: box.querySelector("#fCategory").value,
        priority: box.querySelector("#fPriority").value,
        dueDate: box.querySelector("#fDue").value,
        status: box.querySelector("#fStatus").value,
        quantity: parseInt(box.querySelector("#fQty").value) || 0,
        subtasks: subs
      };

      if (isEdit) {
        Object.assign(task, data);
        if (data.status === "Concluído" && !task.completedAt) task.completedAt = Date.now();
      } else {
        state.tasks.push(Object.assign({ id: uid(), createdAt: Date.now(), timeSpent: 0 }, data));
      }
      saveState(); closeModal(); renderTasks(); toast("Tarefa salva", "success");
    };
  });
}

/* ============================================================
   REPORTS LOGIC
   ============================================================ */
function renderReports() {
  const type = document.getElementById("reportType").value;
  const output = document.getElementById("reportOutput");
  if (!output) return;

  if (type === "time_tasks") {
    const data = state.tasks.filter(t => t.timeSpent > 0).sort((a, b) => b.timeSpent - a.timeSpent);
    output.innerHTML = `
      <table class="data-table">
        <thead><tr><th>Tarefa</th><th>Categoria</th><th>Tempo Total</th></tr></thead>
        <tbody>
          ${data.map(t => `<tr><td>${escapeHtml(t.name)}</td><td>${t.category}</td><td>${fmtDuration(t.timeSpent)}</td></tr>`).join("")}
        </tbody>
      </table>
    `;
  } else if (type === "time_categories") {
    const cats = {};
    state.timeLog.forEach(l => {
      cats[l.category] = (cats[l.category] || 0) + l.duration;
    });
    const sorted = Object.entries(cats).sort((a, b) => b[1] - a[1]);
    output.innerHTML = `
      <table class="data-table">
        <thead><tr><th>Categoria</th><th>Tempo Total</th></tr></thead>
        <tbody>
          ${sorted.map(([cat, time]) => `<tr><td>${cat}</td><td>${fmtDuration(time)}</td></tr>`).join("")}
        </tbody>
      </table>
    `;
  }
}

document.getElementById("reportType")?.addEventListener("change", renderReports);

/* ============================================================
   SETTINGS LOGIC
   ============================================================ */
function renderSettings() {
  const catList = document.getElementById("settingsCategoriesList");
  const mktList = document.getElementById("settingsMarketplacesList");
  if (!catList || !mktList) return;

  catList.innerHTML = state.userSettings.categories.map((c, i) => `
    <div class="settings-item">
      <span>${c}</span>
      <button onclick="removeSetting('categories', ${i})">${icon("trash")}</button>
    </div>
  `).join("");

  mktList.innerHTML = state.userSettings.marketplaces.map((m, i) => `
    <div class="settings-item">
      <span>${m}</span>
      <button onclick="removeSetting('marketplaces', ${i})">${icon("trash")}</button>
    </div>
  `).join("");
}

window.removeSetting = (key, idx) => {
  state.userSettings[key].splice(idx, 1);
  saveState(); renderSettings();
};

document.getElementById("btnAddCategory")?.addEventListener("click", () => {
  const val = document.getElementById("inputNewCategory").value.trim();
  if (val) {
    state.userSettings.categories.push(val);
    document.getElementById("inputNewCategory").value = "";
    saveState(); renderSettings();
  }
});

document.getElementById("btnAddMarketplace")?.addEventListener("click", () => {
  const val = document.getElementById("inputNewMarketplace").value.trim();
  if (val) {
    state.userSettings.marketplaces.push(val);
    document.getElementById("inputNewMarketplace").value = "";
    saveState(); renderSettings();
  }
});

/* ============================================================
   REGISTER RENDERS
   ============================================================ */
renderMap.dashboard = () => {
  // Simples dashboard stats
  const cards = document.getElementById("dashCards");
  if (!cards) return;
  const pending = state.tasks.filter(t => t.status !== "Concluído").length;
  const doneToday = state.tasks.filter(t => t.status === "Concluído" && t.dueDate === todayStr()).length;
  const workedToday = state.timeLog.filter(l => l.date === todayStr()).reduce((s, l) => s + l.duration, 0);
  
  cards.innerHTML = `
    <div class="stat-card">
      <div class="stat-icon">${icon("clipboard")}</div>
      <div class="stat-value">${pending}</div>
      <div class="stat-label">Tarefas pendentes</div>
    </div>
    <div class="stat-card">
      <div class="stat-icon">${icon("check")}</div>
      <div class="stat-value">${doneToday}</div>
      <div class="stat-label">Concluídas hoje</div>
    </div>
    <div class="stat-card">
      <div class="stat-icon">${icon("clock")}</div>
      <div class="stat-value">${fmtHoursMin(workedToday)}</div>
      <div class="stat-label">Tempo hoje</div>
    </div>
  `;
};
renderMap.tasks = renderTasks;
renderMap.reports = renderReports;
renderMap.settings = renderSettings;
renderMap.recurring = () => { /* Implementar similar a tasks */ };
renderMap.goals = () => { /* Implementar similar a tasks */ };
renderMap.followup = () => { /* Implementar similar a tasks */ };
renderMap.time = () => {
  const tbody = document.querySelector("#timeLogTable tbody");
  if (!tbody) return;
  tbody.innerHTML = state.timeLog.slice().reverse().map(l => `
    <tr>
      <td>${escapeHtml(l.taskName)}</td>
      <td>${l.category}</td>
      <td>${fmtDuration(l.duration)}</td>
      <td>${fmtDate(l.date)}</td>
    </tr>
  `).join("");
};

/* ============================================================
   GLOBAL ACTIONS
   ============================================================ */
document.getElementById("btnNewTask")?.addEventListener("click", () => openTaskModal(null));
document.getElementById("btnWipe")?.addEventListener("click", () => {
  if (confirm("Deseja apagar todos os dados? Esta ação é irreversível.")) {
    localStorage.removeItem(DB_KEY);
    location.reload();
  }
});
document.getElementById("btnBackup")?.addEventListener("click", () => {
  const data = JSON.stringify(state, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `hubmarket_backup_${todayStr()}.json`;
  a.click();
});

/* ============================================================
   RECURRING RENDER & MODAL
   ============================================================ */
renderMap.recurring = () => {
  const tbody = document.querySelector("#recurringTable tbody");
  if (!tbody) return;
  tbody.innerHTML = state.recurring.map(r => `
    <tr>
      <td>${escapeHtml(r.name)}</td>
      <td>${r.category}</td>
      <td><span class="badge ${priorityBadgeClass(r.priority)}">${r.priority}</span></td>
      <td>${r.type === 'daily' ? 'Diária' : 'Dias: ' + r.days.map(d => WEEKDAYS_SHORT[d]).join(", ")}</td>
      <td>${r.lastGenerated ? fmtDate(r.lastGenerated) : 'Pendente'}</td>
      <td class="row-actions">
        <button onclick="deleteRecurring('${r.id}')">${icon("trash")}</button>
      </td>
    </tr>
  `).join("") || '<tr><td colspan="6" style="text-align:center;padding:20px;">Nenhuma recorrência configurada.</td></tr>';
};

window.deleteRecurring = (id) => {
  state.recurring = state.recurring.filter(r => r.id !== id);
  saveState(); renderMap.recurring(); toast("Recorrência removida", "danger");
};

document.getElementById("btnNewRecurring")?.addEventListener("click", () => {
  openModal("Nova tarefa recorrente", `
    <form id="recForm">
      <div class="form-field"><label>Nome</label><input type="text" id="rName" required></div>
      <div class="form-row">
        <div class="form-field"><label>Categoria</label><select id="rCategory">${state.userSettings.categories.map(c => `<option>${c}</option>`).join("")}</select></div>
        <div class="form-field"><label>Prioridade</label><select id="rPriority">${PRIORITIES.map(p => `<option>${p}</option>`).join("")}</select></div>
      </div>
      <div class="form-field">
        <label>Tipo de Recorrência</label>
        <select id="rType">
          <option value="daily">Diária</option>
          <option value="weekdays">Dias da Semana</option>
        </select>
      </div>
      <div id="weekdaysSelection" style="display:none; margin-bottom:15px;">
        <label>Selecione os dias:</label>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          ${WEEKDAYS_SHORT.map((d, i) => `<label style="font-size:12px;"><input type="checkbox" value="${i}"> ${d}</label>`).join("")}
        </div>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn" id="btnCancelModal">Cancelar</button>
        <button type="submit" class="btn btn-primary">Criar</button>
      </div>
    </form>
  `, box => {
    box.querySelector("#btnCancelModal").onclick = closeModal;
    const typeSel = box.querySelector("#rType");
    typeSel.onchange = () => {
      box.querySelector("#weekdaysSelection").style.display = typeSel.value === "weekdays" ? "block" : "none";
    };
    box.querySelector("#recForm").onsubmit = e => {
      e.preventDefault();
      const days = Array.from(box.querySelectorAll("#weekdaysSelection input:checked")).map(i => parseInt(i.value));
      state.recurring.push({
        id: uid(),
        name: box.querySelector("#rName").value.trim(),
        category: box.querySelector("#rCategory").value,
        priority: box.querySelector("#rPriority").value,
        type: typeSel.value,
        days: days,
        lastGenerated: null
      });
      saveState(); closeModal(); renderMap.recurring(); toast("Recorrência criada", "success");
    };
  });
});

/* ============================================================
   GOALS RENDER & MODAL
   ============================================================ */
renderMap.goals = () => {
  const grid = document.getElementById("goalsGrid");
  if (!grid) return;
  grid.innerHTML = state.goals.map(g => {
    const pct = Math.min(100, Math.round((g.current / g.target) * 100) || 0);
    return `
      <div class="goal-card">
        <div class="goal-head"><span class="goal-name">${escapeHtml(g.name)}</span><span class="goal-pct">${pct}%</span></div>
        <div class="goal-sub">${g.current} de ${g.target} · Até ${fmtDate(g.deadline)}</div>
        <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
        <div class="goal-actions">
          <button class="btn btn-sm" onclick="updateGoal('${g.id}', 1)">+1</button>
          <button class="btn btn-sm" onclick="updateGoal('${g.id}', 10)">+10</button>
          <button class="btn btn-sm btn-danger" onclick="deleteGoal('${g.id}')">${icon("trash")}</button>
        </div>
      </div>
    `;
  }).join("") || '<p>Nenhuma meta ativa.</p>';
};

window.updateGoal = (id, val) => {
  const g = state.goals.find(x => x.id === id);
  if (g) { g.current = (g.current || 0) + val; saveState(); renderMap.goals(); }
};
window.deleteGoal = (id) => {
  state.goals = state.goals.filter(x => x.id !== id);
  saveState(); renderMap.goals();
};

document.getElementById("btnNewGoal")?.addEventListener("click", () => {
  openModal("Nova meta automatizada", `
    <form id="goalForm">
      <div class="form-field"><label>O que você quer alcançar?</label><input type="text" id="gName" placeholder="ex: Cadastrar 100 SKUs no TikTok" required></div>
      <div class="form-row">
        <div class="form-field"><label>Meta Total (Quantidade)</label><input type="number" id="gTarget" required min="1"></div>
        <div class="form-field"><label>Prazo Final</label><input type="date" id="gDeadline" required></div>
      </div>
      <p style="font-size:11px; color:var(--text-muted);">O sistema criará tarefas diárias dividindo a meta pelos dias úteis restantes.</p>
      <div class="modal-actions">
        <button type="button" class="btn" id="btnCancelModal">Cancelar</button>
        <button type="submit" class="btn btn-primary">Criar Meta</button>
      </div>
    </form>
  `, box => {
    box.querySelector("#btnCancelModal").onclick = closeModal;
    box.querySelector("#goalForm").onsubmit = e => {
      e.preventDefault();
      state.goals.push({
        id: uid(),
        name: box.querySelector("#gName").value.trim(),
        target: parseInt(box.querySelector("#gTarget").value),
        current: 0,
        deadline: box.querySelector("#gDeadline").value,
        lastUpdate: null
      });
      saveState(); closeModal(); processGoals(); renderMap.goals(); toast("Meta criada e tarefas agendadas", "success");
    };
  });
});

/* ============================================================
   FOLLOW UP RENDER & MODAL
   ============================================================ */
renderMap.followup = () => {
  const tbody = document.querySelector("#followUpTable tbody");
  if (!tbody) return;
  tbody.innerHTML = state.followUp.map(f => `
    <tr>
      <td>${escapeHtml(f.subject)}</td>
      <td>${f.marketplace}</td>
      <td><span class="badge badge-muted">${f.status}</span></td>
      <td>${fmtDate(f.deadline)}</td>
      <td class="row-actions">
        <button onclick="deleteFollowUp('${f.id}')">${icon("trash")}</button>
      </td>
    </tr>
  `).join("") || '<tr><td colspan="5" style="text-align:center;padding:20px;">Nada para acompanhar no momento.</td></tr>';
};

window.deleteFollowUp = (id) => {
  state.followUp = state.followUp.filter(x => x.id !== id);
  saveState(); renderMap.followup();
};

document.getElementById("btnNewFollowUp")?.addEventListener("click", () => {
  openModal("Novo Acompanhamento", `
    <form id="fupForm">
      <div class="form-field"><label>Assunto / Protocolo</label><input type="text" id="fSubject" required></div>
      <div class="form-row">
        <div class="form-field"><label>Marketplace</label><select id="fMkt">${state.userSettings.marketplaces.map(m => `<option>${m}</option>`).join("")}</select></div>
        <div class="form-field"><label>Prazo</label><input type="date" id="fDeadline"></div>
      </div>
      <div class="form-field"><label>Status Inicial</label><input type="text" id="fStatus" value="Pendente"></div>
      <div class="modal-actions">
        <button type="button" class="btn" id="btnCancelModal">Cancelar</button>
        <button type="submit" class="btn btn-primary">Salvar</button>
      </div>
    </form>
  `, box => {
    box.querySelector("#btnCancelModal").onclick = closeModal;
    box.querySelector("#fupForm").onsubmit = e => {
      e.preventDefault();
      state.followUp.push({
        id: uid(),
        subject: box.querySelector("#fSubject").value.trim(),
        marketplace: box.querySelector("#fMkt").value,
        deadline: box.querySelector("#fDeadline").value,
        status: box.querySelector("#fStatus").value
      });
      saveState(); closeModal(); renderMap.followup(); toast("Acompanhamento registrado", "success");
    };
  });
});

/* ============================================================
   CALENDAR & SEARCH
   ============================================================ */
let currentCalDate = new Date();

renderMap.calendar = () => {
  const grid = document.getElementById("calendarGrid");
  const label = document.getElementById("calLabel");
  if (!grid || !label) return;

  grid.innerHTML = "";
  const year = currentCalDate.getFullYear();
  const month = currentCalDate.getMonth();
  label.textContent = MONTHS[month] + " " + year;

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Cabeçalho dias da semana
  WEEKDAYS_SHORT.forEach(d => {
    grid.insertAdjacentHTML("beforeend", `<div class="cal-day-head">${d}</div>`);
  });

  // Espaços vazios
  for (let i = 0; i < firstDay; i++) {
    grid.insertAdjacentHTML("beforeend", `<div class="cal-day empty"></div>`);
  }

  // Dias do mês
  for (let d = 1; d <= daysInMonth; d++) {
    const dateISO = `${year}-${pad(month + 1)}-${pad(d)}`;
    const dayTasks = state.tasks.filter(t => t.dueDate === dateISO);
    const dayGoals = state.goals.filter(g => g.deadline === dateISO);
    
    grid.insertAdjacentHTML("beforeend", `
      <div class="cal-day">
        <span class="cal-date">${d}</span>
        <div class="cal-events">
          ${dayTasks.map(t => `<div class="cal-event task">${escapeHtml(t.name)}</div>`).join("")}
          ${dayGoals.map(g => `<div class="cal-event goal">Meta: ${escapeHtml(g.name)}</div>`).join("")}
        </div>
      </div>
    `);
  }
};

document.getElementById("calPrev")?.addEventListener("click", () => { currentCalDate.setMonth(currentCalDate.getMonth() - 1); renderMap.calendar(); });
document.getElementById("calNext")?.addEventListener("click", () => { currentCalDate.setMonth(currentCalDate.getMonth() + 1); renderMap.calendar(); });

// Busca Global
document.getElementById("globalSearch")?.addEventListener("input", e => {
  const query = e.target.value.toLowerCase();
  const results = document.getElementById("searchResults");
  if (!query) { results.classList.add("hidden"); return; }

  const foundTasks = state.tasks.filter(t => t.name.toLowerCase().includes(query));
  const foundGoals = state.goals.filter(g => g.name.toLowerCase().includes(query));

  if (foundTasks.length || foundGoals.length) {
    results.innerHTML = `
      ${foundTasks.map(t => `<div class="search-result-item" onclick="Hubmarket.goTo('tasks')"><strong>Tarefa:</strong> ${escapeHtml(t.name)}</div>`).join("")}
      ${foundGoals.map(g => `<div class="search-result-item" onclick="Hubmarket.goTo('goals')"><strong>Meta:</strong> ${escapeHtml(g.name)}</div>`).join("")}
    `;
    results.classList.remove("hidden");
  } else {
    results.classList.add("hidden");
  }
});

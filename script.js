/* ==========================================================================
   HUBMARKET — script.js (Versão Corrigida e Unificada)
   ========================================================================== */

(function(){
"use strict";

const DB_KEY = "hubmarket_db_v2";
const DEFAULT_CATEGORIES = ["Estoque", "Cadastro de produtos", "Melhoria de anúncios", "Exportação de anúncios", "Marketplace", "Atendimento", "Financeiro", "Outros"];
const PRIORITIES = ["Baixa", "Média", "Alta", "Crítica"];
const STATUSES = ["Backlog", "Hoje", "Em andamento", "Aguardando", "Concluído"];
const DEFAULT_MARKETPLACES = ["Mercado Livre", "Shopee", "Amazon", "Magalu", "Shein"];
const WEEKDAYS_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

// --- STATE ---
function defaultState() {
  return {
    theme: "light",
    userSettings: { categories: [...DEFAULT_CATEGORIES], marketplaces: [...DEFAULT_MARKETPLACES] },
    tasks: [], recurring: [], goals: [], timeLog: [], activeTimer: null, followUp: []
  };
}

let state = loadState();

function loadState() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (!raw) {
      const oldRaw = localStorage.getItem("hubmarket_db_v1");
      if (oldRaw) return Object.assign(defaultState(), JSON.parse(oldRaw));
      return defaultState();
    }
    return Object.assign(defaultState(), JSON.parse(raw));
  } catch (e) { return defaultState(); }
}

function saveState() { localStorage.setItem(DB_KEY, JSON.stringify(state)); }

// --- UTILS ---
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function todayStr() { return new Date().toISOString().slice(0, 10); }
function pad(n) { return n.toString().padStart(2, "0"); }
function fmtDate(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
function fmtDuration(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}
function fmtHoursMin(ms) {
  const totalMin = Math.max(0, Math.round(ms / 60000));
  return `${Math.floor(totalMin / 60)}h ${totalMin % 60}m`;
}
function escapeHtml(str) {
  return (str || "").toString().replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function getWorkDaysBetween(start, end) {
  let count = 0, cur = new Date(start + "T00:00:00"), last = new Date(end + "T00:00:00");
  while (cur <= last) {
    if (cur.getDay() !== 0 && cur.getDay() !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

function toast(msg, type) {
  const c = document.getElementById("toastContainer");
  if (!c) return;
  const el = document.createElement("div");
  el.className = "toast " + (type || "");
  el.textContent = msg;
  c.appendChild(el);
  setTimeout(() => { el.style.opacity = "0"; setTimeout(() => el.remove(), 300); }, 3000);
}

function icon(name) {
  const icons = {
    clipboard: '<svg viewBox="0 0 24 24"><rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4V3a1 1 0 011-1h4a1 1 0 011 1v1"/><path d="M9 11h6M9 15h6"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>',
    edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4l11-11-4-4L4 16v4z"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
    stop: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12"/></svg>'
  };
  return icons[name] || "";
}

// --- MODAL ---
function openModal(title, html, onMount) {
  const overlay = document.getElementById("modalOverlay");
  const box = document.getElementById("modalBox");
  box.innerHTML = `<h2>${escapeHtml(title)}</h2>` + html;
  overlay.classList.remove("hidden");
  if (onMount) onMount(box);
}
function closeModal() { document.getElementById("modalOverlay").classList.add("hidden"); }

// --- NAVIGATION ---
const renderMap = {};
function goTo(section) {
  document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
  const target = document.getElementById("view-" + section);
  if (target) target.classList.remove("hidden");
  
  document.querySelectorAll(".nav-item").forEach(btn => btn.classList.toggle("is-active", btn.dataset.section === section));
  if (renderMap[section]) renderMap[section]();
  
  document.getElementById("sidebar").classList.remove("is-open");
  document.getElementById("sidebarOverlay").classList.remove("is-open");
}

// --- CORE FUNCTIONS ---
function toggleTaskTimer(taskId) {
  const now = Date.now();
  if (state.activeTimer && state.activeTimer.taskId === taskId) {
    const duration = now - state.activeTimer.start;
    const task = state.tasks.find(t => t.id === taskId);
    if (task) {
      task.timeSpent = (task.timeSpent || 0) + duration;
      state.timeLog.push({ id: uid(), taskId, taskName: task.name, category: task.category, duration, date: todayStr(), timestamp: now });
    }
    state.activeTimer = null;
    toast("Tempo pausado", "info");
  } else {
    if (state.activeTimer) toggleTaskTimer(state.activeTimer.taskId);
    state.activeTimer = { taskId, start: now };
    toast("Cronômetro iniciado", "success");
  }
  saveState(); renderTasks();
}

function renderTasks() {
  const board = document.getElementById("kanbanBoard");
  if (!board) return;
  const today = todayStr();
  
  board.innerHTML = STATUSES.map(status => {
    const items = state.tasks.filter(t => t.status === status).sort((a, b) => a.createdAt - b.createdAt);
    return `
      <div class="kanban-col" data-status="${status}">
        <div class="kanban-col-head"><span>${status}</span><span class="count">${items.length}</span></div>
        <div class="kanban-cards">
          ${items.map(t => {
            const isRunning = state.activeTimer && state.activeTimer.taskId === t.id;
            const time = (t.timeSpent || 0) + (isRunning ? (Date.now() - state.activeTimer.start) : 0);
            return `
              <div class="task-card" draggable="true" data-id="${t.id}">
                <div class="tc-top">
                  <div class="tc-title">${escapeHtml(t.name)}</div>
                  <div class="tc-actions">
                    <button class="timer-btn ${isRunning?'running':''}" onclick="event.stopPropagation(); toggleTaskTimer('${t.id}')">${isRunning?icon('stop'):icon('play')}</button>
                    <button onclick="event.stopPropagation(); openTaskModal('${t.id}')">${icon('edit')}</button>
                  </div>
                </div>
                <div class="tc-time-info">${icon('clock')} ${fmtDuration(time)}</div>
                <div class="tc-meta">
                  <span class="badge badge-muted">${t.category}</span>
                  ${t.dueDate ? `<span class="tc-due ${t.status!=='Concluído'&&t.dueDate<today?'overdue':''}">${fmtDate(t.dueDate)}</span>` : ''}
                </div>
              </div>
            `;
          }).join("")}
        </div>
      </div>
    `;
  }).join("");

  // Drag & Drop
  board.querySelectorAll(".kanban-col").forEach(col => {
    col.ondragover = e => e.preventDefault();
    col.ondrop = e => {
      const id = e.dataTransfer.getData("text");
      const task = state.tasks.find(t => t.id === id);
      if (task) {
        task.status = col.dataset.status;
        if (task.status === "Concluído" && state.activeTimer?.taskId === id) toggleTaskTimer(id);
        saveState(); renderTasks();
      }
    };
  });
  board.querySelectorAll(".task-card").forEach(card => {
    card.ondragstart = e => e.dataTransfer.setData("text", card.dataset.id);
  });
}

function openTaskModal(taskId) {
  const t = state.tasks.find(x => x.id === taskId) || { name: "", category: state.userSettings.categories[0], priority: "Média", status: "Backlog", subtasks: [] };
  openModal(taskId ? "Editar Tarefa" : "Nova Tarefa", `
    <form id="taskForm">
      <div class="form-field"><label>Nome</label><input type="text" id="fName" value="${escapeHtml(t.name)}" required></div>
      <div class="form-row">
        <div class="form-field"><label>Categoria</label><select id="fCategory">${state.userSettings.categories.map(c => `<option ${c===t.category?'selected':''}>${c}</option>`).join("")}</select></div>
        <div class="form-field"><label>Data Limite</label><input type="date" id="fDue" value="${t.dueDate||''}"></div>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn" onclick="closeModal()">Cancelar</button>
        ${taskId ? `<button type="button" class="btn btn-danger" onclick="deleteTask('${taskId}')">Excluir</button>` : ''}
        <button type="submit" class="btn btn-primary">Salvar</button>
      </div>
    </form>
  `, box => {
    box.querySelector("#taskForm").onsubmit = e => {
      e.preventDefault();
      const data = {
        name: box.querySelector("#fName").value.trim(),
        category: box.querySelector("#fCategory").value,
        dueDate: box.querySelector("#fDue").value,
        status: t.status || "Backlog"
      };
      if (taskId) Object.assign(t, data);
      else state.tasks.push(Object.assign({ id: uid(), createdAt: Date.now(), timeSpent: 0 }, data));
      saveState(); closeModal(); renderTasks();
    };
  });
}

window.deleteTask = id => { if(confirm("Excluir?")){ state.tasks = state.tasks.filter(t=>t.id!==id); saveState(); closeModal(); renderTasks(); } };
window.toggleTaskTimer = toggleTaskTimer;
window.openTaskModal = openTaskModal;
window.closeModal = closeModal;

// --- CALENDAR ---
let calDate = new Date();
renderMap.calendar = () => {
  const grid = document.getElementById("calendarGrid");
  const label = document.getElementById("calLabel");
  if (!grid) return;
  grid.innerHTML = "";
  const y = calDate.getFullYear(), m = calDate.getMonth();
  label.textContent = `${MONTHS[m]} ${y}`;
  
  WEEKDAYS_SHORT.forEach(d => grid.insertAdjacentHTML("beforeend", `<div class="cal-day-head">${d}</div>`));
  const first = new Date(y, m, 1).getDay();
  const days = new Date(y, m + 1, 0).getDate();
  
  for (let i = 0; i < first; i++) grid.insertAdjacentHTML("beforeend", `<div class="cal-day empty"></div>`);
  for (let d = 1; d <= days; d++) {
    const iso = `${y}-${pad(m+1)}-${pad(d)}`;
    const hasTask = state.tasks.some(t => t.dueDate === iso);
    grid.insertAdjacentHTML("beforeend", `<div class="cal-day ${iso===todayStr()?'today':''}"><span>${d}</span>${hasTask?'<div class="cal-dot"></div>':''}</div>`);
  }
};

// --- INITIALIZE ---
document.addEventListener("DOMContentLoaded", () => {
  applyTheme();
  
  document.getElementById("mainNav").onclick = e => {
    const btn = e.target.closest(".nav-item");
    if (btn) goTo(btn.dataset.section);
  };
  
  document.getElementById("btnNewTask").onclick = () => openTaskModal();
  document.getElementById("btnTheme").onclick = () => { state.theme = state.theme==='dark'?'light':'dark'; applyTheme(); saveState(); };
  document.getElementById("calPrev").onclick = () => { calDate.setMonth(calDate.getMonth()-1); renderMap.calendar(); };
  document.getElementById("calNext").onclick = () => { calDate.setMonth(calDate.getMonth()+1); renderMap.calendar(); };

  // Dashboard render
  renderMap.dashboard = () => {
    const cards = document.getElementById("dashCards");
    const pending = state.tasks.filter(t => t.status !== "Concluído").length;
    const workedToday = state.timeLog.filter(l => l.date === todayStr()).reduce((s, l) => s + l.duration, 0);
    cards.innerHTML = `
      <div class="stat-card"><div class="stat-value">${pending}</div><div class="stat-label">Tarefas Pendentes</div></div>
      <div class="stat-card"><div class="stat-value">${fmtHoursMin(workedToday)}</div><div class="stat-label">Tempo Hoje</div></div>
    `;
  };

  renderMap.settings = () => {
    const catList = document.getElementById("settingsCategoriesList");
    catList.innerHTML = state.userSettings.categories.map((c, i) => `
      <div class="settings-item"><span>${c}</span><button onclick="removeCat(${i})">${icon('trash')}</button></div>
    `).join("");
  };
  window.removeCat = i => { state.userSettings.categories.splice(i, 1); saveState(); renderMap.settings(); };
  document.getElementById("btnAddCategory").onclick = () => {
    const inp = document.getElementById("inputNewCategory");
    if (inp.value) { state.userSettings.categories.push(inp.value); inp.value = ""; saveState(); renderMap.settings(); }
  };

  goTo("dashboard");
  setInterval(() => { if (!document.getElementById("view-tasks").classList.contains("hidden")) renderTasks(); }, 1000);
});

function applyTheme() { document.documentElement.setAttribute("data-theme", state.theme); }

})();

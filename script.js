/* ==========================================================================
   HUBMARKET — script.js (Versão Corrigida e Unificada)
   - Ordenação manual (setas) estável por campo `order`
   - Drag & drop entre colunas: card entra na PRIMEIRA posição da coluna destino
   - Acompanhamento como coluna extra do quadro de tarefas
   ========================================================================== */

(function(){
"use strict";

const DB_KEY = "hubmarket_db_v2";
const DEFAULT_CATEGORIES = ["Estoque", "Cadastro de produtos", "Melhoria de anúncios", "Exportação de anúncios", "Marketplace", "Atendimento", "Financeiro", "Outros"];
const PRIORITIES = ["Baixa", "Média", "Alta", "Crítica"];
const STATUSES = ["Backlog", "Hoje", "Em andamento", "Aguardando", "Concluído"];
const DEFAULT_MARKETPLACES = ["Mercado Livre", "Shopee", "Amazon", "Magalu", "Shein"];
const FOLLOWUP_STATUSES = ["Aberto", "Em análise", "Resolvido"];
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
    stop: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12"/></svg>',
    up: '<svg viewBox="0 0 24 24"><path d="M6 15l6-6 6 6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    down: '<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" stroke-linecap="round"/></svg>'
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
window.closeModal = closeModal;

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

/* ============================================================
   ORDENAÇÃO MANUAL (campo `order`)
   Cada tarefa guarda um número `order` relativo à coluna (status) em que
   está. As setas apenas trocam esse número com o vizinho. A normalização
   abaixo garante que TODA tarefa tenha um número válido — é isso que evita
   o "travamento" das setas (antes, tarefas sem order/NaN confundiam a
   ordenação e o cálculo de quem é o primeiro/último da coluna).
   ============================================================ */
function normalizeOrders() {
  STATUSES.forEach(status => {
    const items = state.tasks
      .filter(t => t.status === status)
      .sort((a, b) => (Number.isFinite(a.order) ? a.order : a.createdAt) - (Number.isFinite(b.order) ? b.order : b.createdAt));
    items.forEach((t, i) => { t.order = (i + 1) * 10; });
  });
}
function nextOrderInStatus(status) {
  const items = state.tasks.filter(t => t.status === status);
  return items.length ? Math.max(...items.map(t => (Number.isFinite(t.order) ? t.order : 0))) + 10 : 10;
}
function firstOrderInStatus(status) {
  const items = state.tasks.filter(t => t.status === status);
  return items.length ? Math.min(...items.map(t => (Number.isFinite(t.order) ? t.order : 0))) - 10 : 10;
}
function moveTask(taskId, dir) {
  const task = state.tasks.find(t => t.id === taskId);
  if (!task) return;
  const list = state.tasks.filter(t => t.status === task.status).sort((a, b) => a.order - b.order);
  const idx = list.findIndex(t => t.id === taskId);
  const swapIdx = idx + dir;
  if (swapIdx < 0 || swapIdx >= list.length) return; // já é o primeiro/último — não faz nada (sem travar)
  const other = list[swapIdx];
  const tmp = task.order;
  task.order = other.order;
  other.order = tmp;
  saveState();
  renderTasks();
}
window.moveTask = moveTask;

// --- CRONÔMETRO POR TAREFA ---
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
window.toggleTaskTimer = toggleTaskTimer;

/* ============================================================
   KANBAN — colunas de status + coluna de Acompanhamento
   ============================================================ */
function renderTasks() {
  const board = document.getElementById("kanbanBoard");
  if (!board) return;
  const today = todayStr();

  const statusColumnsHTML = STATUSES.map(status => {
    const items = state.tasks.filter(t => t.status === status).sort((a, b) => (a.order || 0) - (b.order || 0));
    return `
      <div class="kanban-col" data-status="${status}">
        <div class="kanban-col-head"><span>${status}</span><span class="count">${items.length}</span></div>
        <div class="kanban-cards">
          ${items.map((t, idx) => taskCardHTML(t, idx, items.length, today)).join("")}
        </div>
      </div>
    `;
  }).join("");

  board.innerHTML = statusColumnsHTML + followUpColumnHTML(today);

  // Drag & Drop — entre colunas de status (card entra na primeira posição da coluna destino)
  board.querySelectorAll(".kanban-col[data-status]").forEach(col => {
    if (col.dataset.status === "__followup") return;
    col.ondragover = e => { e.preventDefault(); col.classList.add("drag-over"); };
    col.ondragleave = () => col.classList.remove("drag-over");
    col.ondrop = e => {
      e.preventDefault();
      col.classList.remove("drag-over");
      const id = e.dataTransfer.getData("text");
      const task = state.tasks.find(t => t.id === id);
      if (task) {
        const newStatus = col.dataset.status;
        if (task.status !== newStatus) {
          task.order = firstOrderInStatus(newStatus); // sempre no topo da coluna destino
          task.status = newStatus;
          if (task.status === "Concluído" && state.activeTimer?.taskId === id) toggleTaskTimer(id);
        }
        saveState(); renderTasks();
      }
    };
  });
  board.querySelectorAll(".task-card[draggable='true']").forEach(card => {
    card.ondragstart = e => { e.dataTransfer.setData("text", card.dataset.id); card.classList.add("dragging"); };
    card.ondragend = () => card.classList.remove("dragging");
  });

  const btnAddFollow = document.getElementById("btnAddFollowupInline");
  if (btnAddFollow) btnAddFollow.onclick = () => openFollowUpModal();
}

function taskCardHTML(t, idx, total, today) {
  const isRunning = state.activeTimer && state.activeTimer.taskId === t.id;
  const time = (t.timeSpent || 0) + (isRunning ? (Date.now() - state.activeTimer.start) : 0);
  const isFirst = idx === 0;
  const isLast = idx === total - 1;
  return `
    <div class="task-card" draggable="true" data-id="${t.id}">
      <div class="tc-top">
        <div class="tc-title">${escapeHtml(t.name)}</div>
        <div class="tc-actions">
          <button class="order-btn" title="Mover para cima" ${isFirst ? "disabled" : ""} onclick="event.stopPropagation(); moveTask('${t.id}', -1)">${icon('up')}</button>
          <button class="order-btn" title="Mover para baixo" ${isLast ? "disabled" : ""} onclick="event.stopPropagation(); moveTask('${t.id}', 1)">${icon('down')}</button>
          <button class="timer-btn ${isRunning ? 'running' : ''}" title="Cronômetro" onclick="event.stopPropagation(); toggleTaskTimer('${t.id}')">${isRunning ? icon('stop') : icon('play')}</button>
          <button title="Editar" onclick="event.stopPropagation(); openTaskModal('${t.id}')">${icon('edit')}</button>
        </div>
      </div>
      <div class="tc-time-info">${icon('clock')} ${fmtDuration(time)}</div>
      <div class="tc-meta">
        <span class="badge badge-muted">${escapeHtml(t.category)}</span>
        ${t.dueDate ? `<span class="tc-due ${t.status !== 'Concluído' && t.dueDate < today ? 'overdue' : ''}">${fmtDate(t.dueDate)}</span>` : ''}
      </div>
    </div>
  `;
}

/* ============================================================
   ACOMPANHAMENTO — coluna extra dentro do próprio quadro de tarefas
   (reclamações, protocolos, devoluções etc. — visão lado a lado com as tarefas)
   ============================================================ */
function followUpColumnHTML(today) {
  today = today || todayStr();
  const items = state.followUp.slice().sort((a, b) => (a.deadline || "9999-99-99").localeCompare(b.deadline || "9999-99-99"));
  return `
    <div class="kanban-col followup-col" data-status="__followup">
      <div class="kanban-col-head">
        <span>Acompanhamento</span>
        <span class="count">${items.length}</span>
      </div>
      <button type="button" class="btn-add-inline" id="btnAddFollowupInline">${icon('plus')} Novo</button>
      <div class="kanban-cards">
        ${items.map(f => followUpCardHTML(f, today)).join("") || '<p class="kanban-empty-hint">Nenhum acompanhamento.</p>'}
      </div>
    </div>
  `;
}
function followUpCardHTML(f, today) {
  const overdue = f.status !== "Resolvido" && f.deadline && f.deadline < today;
  const resolved = f.status === "Resolvido";
  return `
    <div class="task-card followup-card ${resolved ? 'is-resolved' : ''}" data-id="${f.id}" onclick="openFollowUpModal('${f.id}')">
      <div class="tc-top">
        <div class="tc-title">${escapeHtml(f.subject || "(sem assunto)")}</div>
        <div class="tc-actions">
          <button title="Editar" onclick="event.stopPropagation(); openFollowUpModal('${f.id}')">${icon('edit')}</button>
          <button title="Excluir" onclick="event.stopPropagation(); deleteFollowUp('${f.id}')">${icon('trash')}</button>
        </div>
      </div>
      <div class="tc-meta">
        <span class="badge badge-muted">${escapeHtml(f.marketplace || "—")}</span>
        <span class="badge ${resolved ? 'badge-low' : 'badge-medium'}">${escapeHtml(f.status || "Aberto")}</span>
        ${f.deadline ? `<span class="tc-due ${overdue ? 'overdue' : ''}">${fmtDate(f.deadline)}</span>` : ''}
      </div>
    </div>
  `;
}
function openFollowUpModal(id) {
  const existing = id ? state.followUp.find(x => x.id === id) : null;
  const f = existing || { subject: "", marketplace: state.userSettings.marketplaces[0] || "", deadline: "", status: "Aberto", notes: "" };
  openModal(id ? "Editar Acompanhamento" : "Novo Acompanhamento", `
    <form id="followUpForm">
      <div class="form-field"><label>Assunto</label><input type="text" id="fuSubject" value="${escapeHtml(f.subject)}" required placeholder="ex: Reclamação de atraso na entrega"></div>
      <div class="form-row">
        <div class="form-field"><label>Marketplace</label><select id="fuMarketplace">${state.userSettings.marketplaces.map(m => `<option ${m === f.marketplace ? 'selected' : ''}>${escapeHtml(m)}</option>`).join("")}</select></div>
        <div class="form-field"><label>Status</label><select id="fuStatus">${FOLLOWUP_STATUSES.map(s => `<option ${s === f.status ? 'selected' : ''}>${s}</option>`).join("")}</select></div>
      </div>
      <div class="form-field"><label>Prazo</label><input type="date" id="fuDeadline" value="${f.deadline || ''}"></div>
      <div class="form-field"><label>Observações</label><textarea id="fuNotes">${escapeHtml(f.notes || '')}</textarea></div>
      <div class="modal-actions">
        <button type="button" class="btn" onclick="closeModal()">Cancelar</button>
        ${id ? `<button type="button" class="btn btn-danger" onclick="deleteFollowUp('${id}')">Excluir</button>` : ''}
        <button type="submit" class="btn btn-primary">Salvar</button>
      </div>
    </form>
  `, box => {
    box.querySelector("#followUpForm").onsubmit = e => {
      e.preventDefault();
      const data = {
        subject: box.querySelector("#fuSubject").value.trim(),
        marketplace: box.querySelector("#fuMarketplace").value,
        status: box.querySelector("#fuStatus").value,
        deadline: box.querySelector("#fuDeadline").value,
        notes: box.querySelector("#fuNotes").value.trim()
      };
      if (existing) Object.assign(existing, data);
      else state.followUp.push(Object.assign({ id: uid(), createdAt: Date.now() }, data));
      saveState(); closeModal();
      renderTasks();
      if (renderMap.followup) renderMap.followup();
      toast("Acompanhamento salvo", "success");
    };
  });
}
function deleteFollowUp(id) {
  if (!confirm("Excluir este acompanhamento?")) return;
  state.followUp = state.followUp.filter(f => f.id !== id);
  saveState(); closeModal();
  renderTasks();
  if (renderMap.followup) renderMap.followup();
  toast("Acompanhamento excluído", "danger");
}
window.openFollowUpModal = openFollowUpModal;
window.deleteFollowUp = deleteFollowUp;

function renderFollowUpTable() {
  const tbody = document.querySelector("#followUpTable tbody");
  if (!tbody) return;
  const today = todayStr();
  const items = state.followUp.slice().sort((a, b) => (a.deadline || "9999-99-99").localeCompare(b.deadline || "9999-99-99"));
  tbody.innerHTML = items.map(f => {
    const overdue = f.status !== "Resolvido" && f.deadline && f.deadline < today;
    return `
      <tr class="${overdue ? 'row-overdue' : ''}">
        <td>${escapeHtml(f.subject)}</td>
        <td>${escapeHtml(f.marketplace || '—')}</td>
        <td>${f.deadline ? fmtDate(f.deadline) : '—'}</td>
        <td class="row-actions">
          <button onclick="openFollowUpModal('${f.id}')">${icon('edit')}</button>
          <button onclick="deleteFollowUp('${f.id}')">${icon('trash')}</button>
        </td>
      </tr>
    `;
  }).join("") || `<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:20px;">Nenhum acompanhamento cadastrado.</td></tr>`;
}
renderMap.followup = renderFollowUpTable;

/* ============================================================
   TAREFAS — modal de criação/edição
   ============================================================ */
function openTaskModal(taskId) {
  const t = state.tasks.find(x => x.id === taskId) || { name: "", category: state.userSettings.categories[0], priority: "Média", status: "Backlog", subtasks: [] };
  openModal(taskId ? "Editar Tarefa" : "Nova Tarefa", `
    <form id="taskForm">
      <div class="form-field"><label>Nome</label><input type="text" id="fName" value="${escapeHtml(t.name)}" required></div>
      <div class="form-row">
        <div class="form-field"><label>Categoria</label><select id="fCategory">${state.userSettings.categories.map(c => `<option ${c===t.category?'selected':''}>${escapeHtml(c)}</option>`).join("")}</select></div>
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
      const status = t.status || "Backlog";
      const data = {
        name: box.querySelector("#fName").value.trim(),
        category: box.querySelector("#fCategory").value,
        dueDate: box.querySelector("#fDue").value,
        status
      };
      if (taskId) {
        Object.assign(t, data);
      } else {
        state.tasks.push(Object.assign({ id: uid(), createdAt: Date.now(), timeSpent: 0, order: nextOrderInStatus(status) }, data));
      }
      saveState(); closeModal(); renderTasks();
    };
  });
}

window.deleteTask = id => { if(confirm("Excluir?")){ state.tasks = state.tasks.filter(t=>t.id!==id); saveState(); closeModal(); renderTasks(); } };
window.openTaskModal = openTaskModal;

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
  normalizeOrders();
  saveState();

  document.getElementById("mainNav").onclick = e => {
    const btn = e.target.closest(".nav-item");
    if (btn) goTo(btn.dataset.section);
  };

  document.getElementById("btnNewTask").onclick = () => openTaskModal();
  document.getElementById("btnTheme").onclick = () => { state.theme = state.theme==='dark'?'light':'dark'; applyTheme(); saveState(); };
  document.getElementById("calPrev").onclick = () => { calDate.setMonth(calDate.getMonth()-1); renderMap.calendar(); };
  document.getElementById("calNext").onclick = () => { calDate.setMonth(calDate.getMonth()+1); renderMap.calendar(); };

  const btnNewFollowUp = document.getElementById("btnNewFollowUp");
  if (btnNewFollowUp) btnNewFollowUp.onclick = () => openFollowUpModal();

  // Dashboard render
  renderMap.dashboard = () => {
    const cards = document.getElementById("dashCards");
    const pending = state.tasks.filter(t => t.status !== "Concluído").length;
    const workedToday = state.timeLog.filter(l => l.date === todayStr()).reduce((s, l) => s + l.duration, 0);
    const openFollowUps = state.followUp.filter(f => f.status !== "Resolvido").length;
    cards.innerHTML = `
      <div class="stat-card"><div class="stat-value">${pending}</div><div class="stat-label">Tarefas Pendentes</div></div>
      <div class="stat-card"><div class="stat-value">${fmtHoursMin(workedToday)}</div><div class="stat-label">Tempo Hoje</div></div>
      <div class="stat-card"><div class="stat-value">${openFollowUps}</div><div class="stat-label">Acompanhamentos Abertos</div></div>
    `;
  };

  renderMap.settings = () => {
    const catList = document.getElementById("settingsCategoriesList");
    catList.innerHTML = state.userSettings.categories.map((c, i) => `
      <div class="settings-item"><span>${escapeHtml(c)}</span><button onclick="removeCat(${i})">${icon('trash')}</button></div>
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

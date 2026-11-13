const $ = (selector) => document.querySelector(selector);
const rows = $("#student-rows");
const searchInput = $("#search-input");
const classFilter = $("#class-filter");
const statusFilter = $("#status-filter");
const dialog = $("#student-dialog");
const form = $("#student-form");
let students = [];
let toastTimer;

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { "content-type": "application/json", ...options.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message || `API error (${response.status})`);
  }
  return response.status === 204 ? null : response.json();
}

async function refreshStudents() {
  $(".sync-indicator").innerHTML = "<i></i>AWS Emulatorに接続中";
  try {
    const health = await api("/api/health");
    students = await api("/api/students");
    $(".sync-indicator").innerHTML = `<i></i>${escapeHTML(health.service)} 接続中`;
    $(".page-footer span:last-child").innerHTML = '<i class="footer-status"></i> AWS Emulator · DynamoDB';
    render();
  } catch (error) {
    $(".sync-indicator").innerHTML = '<i style="background:#e88a75"></i>Emulator未接続';
    $(".page-footer span:last-child").innerHTML = '<i class="footer-status" style="background:#e88a75"></i> AWS Emulatorに接続できません';
    showToast(`接続エラー: ${error.message}`);
    throw error;
  }
}

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function visibleStudents() {
  const query = searchInput.value.trim().toLocaleLowerCase("ja");
  return students.filter((student) => {
    const matchesQuery = !query || [student.name, student.id, student.email].some((value) => String(value || "").toLocaleLowerCase("ja").includes(query));
    const matchesClass = classFilter.value === "all" || student.className === classFilter.value;
    const matchesStatus = statusFilter.value === "all" || student.status === statusFilter.value;
    return matchesQuery && matchesClass && matchesStatus;
  });
}

function render() {
  const filtered = visibleStudents();
  rows.innerHTML = filtered.map((student) => {
    const initials = [...student.name.replaceAll(" ", "")][0] || "?";
    const attendance = Number(student.attendance) || 0;
    const statusClass = student.status === "休学中" ? "status-leave" : "status-active";
    return `<tr data-id="${escapeHTML(student.id)}">
      <td><input class="row-check" type="checkbox" aria-label="${escapeHTML(student.name)}を選択"></td>
      <td><div class="student-cell"><span class="student-avatar" style="background:${escapeHTML(student.color || "#eeeaff")};color:${escapeHTML(student.ink || "#7558d8")}">${escapeHTML(initials)}</span><span><span class="student-name">${escapeHTML(student.name)}</span><span class="student-sub">${student.status === "休学中" ? "休学中" : "学生"}</span></span></div></td>
      <td><span class="student-id">${escapeHTML(student.id)}</span></td>
      <td><span class="class-tag">${escapeHTML(student.className)}</span></td>
      <td><span class="email-cell">${escapeHTML(student.email || "—")}</span></td>
      <td><span class="attendance-cell">${student.status === "休学中" ? "—" : `${attendance}%`}</span>${student.status !== "休学中" ? `<span class="attendance-bar"><i style="width:${Math.max(0, Math.min(attendance, 100))}%"></i></span>` : ""}</td>
      <td><span class="status-pill ${statusClass}">${escapeHTML(student.status)}</span></td>
      <td><div class="row-actions"><button class="row-more" type="button" data-action="edit" aria-label="${escapeHTML(student.name)}を編集" title="編集">✎</button><button class="row-more delete-action" type="button" data-action="delete" aria-label="${escapeHTML(student.name)}を削除" title="削除">×</button></div></td>
    </tr>`;
  }).join("");

  $("#empty-state").hidden = filtered.length > 0;
  $("#result-count").textContent = `全 ${filtered.length} 名`;
  $("#stat-total").textContent = students.filter((student) => student.status === "在籍").length;
  $("#nav-count").textContent = String(students.length).padStart(2, "0");
  $("#select-all").checked = false;
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2800);
}

function openDialog(student) {
  form.reset();
  $("#editing-id").value = student?.id || "";
  $("#dialog-title").textContent = student ? "学生情報を編集" : "学生を追加";
  $("#field-name").value = student?.name || "";
  $("#field-id").value = student?.id || "";
  $("#field-id").readOnly = Boolean(student);
  $("#field-class").value = student?.className || "";
  $("#field-status").value = student?.status || "在籍";
  $("#field-email").value = student?.email || "";
  dialog.showModal();
  $("#field-name").focus();
}

function closeDialog() {
  dialog.close();
  form.reset();
  $("#field-id").readOnly = false;
}

async function handleSave(event) {
  event.preventDefault();
  const editingId = $("#editing-id").value;
  const student = {
    id: $("#field-id").value.trim(),
    name: $("#field-name").value.trim(),
    className: $("#field-class").value,
    status: $("#field-status").value,
    email: $("#field-email").value.trim(),
  };
  try {
    await api(editingId ? `/api/students/${encodeURIComponent(editingId)}` : "/api/students", {
      method: editingId ? "PUT" : "POST",
      body: JSON.stringify(student),
    });
    await refreshStudents();
    closeDialog();
    showToast(editingId ? "学生情報を更新しました（DynamoDB）" : "学生を追加しました（DynamoDB）");
  } catch (error) {
    showToast(error.message);
  }
}

async function deleteStudent(id) {
  const student = students.find((record) => record.id === id);
  if (!student || !window.confirm(`${student.name} さんを学生一覧から削除しますか？`)) return;
  try {
    await api(`/api/students/${encodeURIComponent(id)}`, { method: "DELETE" });
    await refreshStudents();
    showToast("学生を削除しました（DynamoDB）");
  } catch (error) {
    showToast(error.message);
  }
}

function exportCSV() {
  const headings = ["学籍番号", "氏名", "クラス", "メールアドレス", "出席率", "ステータス"];
  const records = visibleStudents().map((student) => [student.id, student.name, student.className, student.email || "", student.status === "休学中" ? "" : `${student.attendance}%`, student.status]);
  const csv = [headings, ...records].map((line) => line.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\r\n");
  const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "students.csv";
  link.click();
  URL.revokeObjectURL(url);
  showToast(`${records.length}名分のCSVを出力しました`);
}

$("#add-button").addEventListener("click", () => openDialog());
$("#close-dialog").addEventListener("click", closeDialog);
$("#cancel-dialog").addEventListener("click", closeDialog);
form.addEventListener("submit", handleSave);
searchInput.addEventListener("input", render);
classFilter.addEventListener("change", render);
statusFilter.addEventListener("change", render);
$("#export-button").addEventListener("click", exportCSV);
$("#clear-filters").addEventListener("click", () => {
  searchInput.value = "";
  classFilter.value = "all";
  statusFilter.value = "all";
  render();
});
$("#select-all").addEventListener("change", (event) => {
  document.querySelectorAll(".row-check").forEach((checkbox) => { checkbox.checked = event.target.checked; });
});
rows.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const id = button.closest("tr").dataset.id;
  if (button.dataset.action === "delete") return deleteStudent(id);
  const student = students.find((record) => record.id === id);
  if (student) openDialog(student);
});
$("#mobile-menu").addEventListener("click", () => $("#sidebar").classList.toggle("open"));
document.addEventListener("click", (event) => {
  if (window.innerWidth <= 780 && !event.target.closest("#sidebar, #mobile-menu")) $("#sidebar").classList.remove("open");
});

refreshStudents().catch(() => {});

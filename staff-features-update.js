// ============================================================
// STAFF EDIT FUNCTIONALITY
// ============================================================
let editingStaffId = null;

async function openStaffEdit(staffId) {
  editingStaffId = staffId;
  const staff = DB.staff.find(s => s.id === staffId);
  if (!staff) return;
  
  document.getElementById('sem-title').textContent = `Edit — ${staff.name}`;
  document.getElementById('sem-name').value = staff.name;
  document.getElementById('sem-role').value = staff.role;
  document.getElementById('sem-salary').value = staff.salary;
  document.getElementById('sem-allowance').value = staff.allowance;
  document.getElementById('sem-phone').value = staff.phone;
  document.getElementById('sem-nin').value = staff.nin;
  document.getElementById('sem-joined').value = staff.joined;
  document.getElementById('sem-msg').innerHTML = '';
  
  document.getElementById('staff-edit-modal').classList.add('active');
}

function closeStaffEdit() {
  document.getElementById('staff-edit-modal').classList.remove('active');
  editingStaffId = null;
}

async function saveStaffEdit() {
  if (!editingStaffId) return;
  
  try {
    const patch = {
      name: document.getElementById('sem-name').value.trim(),
      role: document.getElementById('sem-role').value.trim(),
      salary: Number(document.getElementById('sem-salary').value) || 0,
      allowance: Number(document.getElementById('sem-allowance').value) || 0,
      phone: document.getElementById('sem-phone').value.trim(),
      nin: document.getElementById('sem-nin').value.trim(),
      date_joined: document.getElementById('sem-joined').value,
    };
    
    if (!patch.name) throw new Error('Staff name is required');
    if (patch.salary < 0) throw new Error('Salary cannot be negative');
    
    const updated = await sbUpdate('staff', editingStaffId, patch);
    
    // Update local cache
    const idx = DB.staff.findIndex(s => s.id === editingStaffId);
    if (idx >= 0) DB.staff[idx] = mapStaff(updated);
    
    document.getElementById('sem-msg').innerHTML = '<div class="msg msg-ok">✓ Staff record updated successfully</div>';
    setTimeout(() => {
      closeStaffEdit();
      renderStaff();
    }, 1500);
  } catch (err) {
    document.getElementById('sem-msg').innerHTML = `<div class="msg msg-err">✗ ${err.message}</div>`;
  }
}

async function deleteStaffRecord() {
  if (!editingStaffId) return;
  
  const staff = DB.staff.find(s => s.id === editingStaffId);
  if (!staff) return;
  
  if (!confirm(`Are you sure you want to delete ${staff.name}? This action cannot be undone.`)) return;
  
  try {
    await sbDelete('staff', editingStaffId);
    DB.staff = DB.staff.filter(s => s.id !== editingStaffId);
    
    document.getElementById('sem-msg').innerHTML = '<div class="msg msg-ok">✓ Staff record deleted</div>';
    setTimeout(() => {
      closeStaffEdit();
      renderStaff();
    }, 1500);
  } catch (err) {
    document.getElementById('sem-msg').innerHTML = `<div class="msg msg-err">✗ ${err.message}</div>`;
  }
}

// ============================================================
// ADVANCE DELETE/UNDO FUNCTIONALITY
// ============================================================
async function deleteAdvance(advanceId) {
  const adv = DB.advances.find(a => a.id === advanceId);
  if (!adv) return;
  
  if (!confirm(`Delete this advance of UGX ${fmt(adv.amt)} to ${adv.staffName}? (This will undo the test transaction)`)) return;
  
  try {
    await sbDelete('advances', advanceId);
    DB.advances = DB.advances.filter(a => a.id !== advanceId);
    
    // Refresh payroll views
    await refreshCashbookTotals(adv.date);
    renderAdvances();
    
    showMsg('adv-msg', `✓ Advance deleted successfully`, 'ok');
  } catch (err) {
    showMsg('adv-msg', `✗ ${err.message}`, 'err');
  }
}

// ============================================================
// ALLOWANCES TRACKING
// ============================================================
let DB_allowances = [];

function mapAllowance(r) {
  return {
    id: r.id,
    staffId: r.staff_id,
    staffName: r.staff ? r.staff.name : '',
    amt: Number(r.amount),
    date: r.payment_date,
    month: r.month,
    type: r.allowance_type,
    ref: r.ref_no || '',
    note: r.note || '',
  };
}

async function loadAllowances() {
  const { data, error } = await sb.from('allowances').select('*, staff(name)').order('payment_date', { ascending: false });
  if (error) console.error('Load allowances error:', error.message);
  DB_allowances = (data || []).map(mapAllowance);
}

async function recordAllowance() {
  const staffId = document.getElementById('all-staff').value;
  const amt = Number(document.getElementById('all-amt').value);
  const date = document.getElementById('all-date').value || today();
  const month = document.getElementById('all-month').value;
  const type = document.getElementById('all-type').value;
  const ref = document.getElementById('all-ref').value.trim();
  const note = document.getElementById('all-note').value.trim();
  
  if (!staffId) { showMsg('all-msg', '✗ Please select a staff member', 'err'); return; }
  if (!amt || amt <= 0) { showMsg('all-msg', '✗ Amount must be greater than 0', 'err'); return; }
  
  try {
    const row = await sbInsert('allowances', {
      staff_id: staffId,
      amount: amt,
      payment_date: date,
      month: month,
      allowance_type: type,
      ref_no: ref,
      note: note,
    });
    
    DB_allowances.unshift(mapAllowance(row));
    
    // Clear form
    document.getElementById('all-staff').value = '';
    document.getElementById('all-amt').value = '';
    document.getElementById('all-date').value = today();
    document.getElementById('all-ref').value = '';
    document.getElementById('all-note').value = '';
    
    await refreshCashbookTotals(date);
    showMsg('all-msg', '✓ Allowance recorded successfully', 'ok');
    renderAllowancesLog();
  } catch (err) {
    showMsg('all-msg', `✗ ${err.message}`, 'err');
  }
}

function renderAllowancesLog(search = '') {
  const tbody = document.getElementById('all-log-body');
  const tfoot = document.getElementById('all-log-foot');
  const staffFilter = document.getElementById('all-f-staff').value;
  
  let filtered = DB_allowances;
  
  if (staffFilter) {
    filtered = filtered.filter(a => a.staffId === staffFilter);
  }
  
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(a => 
      a.staffName.toLowerCase().includes(q) ||
      a.type.toLowerCase().includes(q) ||
      a.month.toLowerCase().includes(q) ||
      a.note.toLowerCase().includes(q)
    );
  }
  
  tbody.innerHTML = filtered.map(a => `
    <tr>
      <td>${new Date(a.date).toLocaleDateString('en-GB')}</td>
      <td>${a.staffName}</td>
      <td>${a.month}</td>
      <td><span class="badge badge-gold">${a.type}</span></td>
      <td class="td-right"><strong>UGX ${fmt(a.amt)}</strong></td>
      <td style="font-size:12px;color:var(--text3)">${a.note}</td>
      <td class="td-center"><button class="btn btn-danger btn-xs" onclick="deleteAllowance('${a.id}')" title="Delete this allowance">🗑</button></td>
    </tr>
  `).join('');
  
  const total = filtered.reduce((sum, a) => sum + a.amt, 0);
  tfoot.innerHTML = `<tr><td colspan="4" style="text-align:right"><strong>Total:</strong></td><td class="td-right"><strong>UGX ${fmt(total)}</strong></td><td colspan="2"></td></tr>`;
}

async function deleteAllowance(allowanceId) {
  const all = DB_allowances.find(a => a.id === allowanceId);
  if (!all) return;
  
  if (!confirm(`Delete allowance of UGX ${fmt(all.amt)} to ${all.staffName}?`)) return;
  
  try {
    await sbDelete('allowances', allowanceId);
    DB_allowances = DB_allowances.filter(a => a.id !== allowanceId);
    await refreshCashbookTotals(all.date);
    renderAllowancesLog();
    showMsg('all-msg', '✓ Allowance deleted', 'ok');
  } catch (err) {
    showMsg('all-msg', `✗ ${err.message}`, 'err');
  }
}

async function exportAllowancesCSV() {
  const staffFilter = document.getElementById('all-f-staff').value;
  let filtered = DB_allowances;
  if (staffFilter) filtered = filtered.filter(a => a.staffId === staffFilter);
  
  const rows = [
    ['Date', 'Staff', 'Month', 'Type', 'Amount (UGX)', 'Ref', 'Note'],
    ...filtered.map(a => [
      new Date(a.date).toLocaleDateString('en-GB'),
      a.staffName,
      a.month,
      a.type,
      a.amt,
      a.ref,
      a.note,
    ])
  ];
  
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Allowances');
  XLSX.writeFile(wb, `Allowances_${today()}.xlsx`);
}

// ============================================================
// UPDATED PAYROLL TAB FUNCTION
// ============================================================
function payrollTab(tab) {
  document.querySelectorAll('#page-payroll .tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('#page-payroll .tab-btn').forEach(b => b.classList.remove('active'));
  
  const panel = document.getElementById('pt-' + tab);
  if (panel) panel.classList.add('active');
  
  event.target.classList.add('active');
  
  // Load data on tab switch
  if (tab === 'allowances') {
    renderAllowancesLog();
    document.querySelectorAll('#all-staff, #all-f-staff').forEach(sel => {
      const current = sel.value;
      sel.innerHTML = '<option value="">-- Select staff --</option>' + DB.staff.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
      sel.value = current;
    });
  }
}

// ============================================================
// UPDATED STAFF RENDERING WITH EDIT BUTTONS
// ============================================================
async function renderStaff() {
  const tbody = document.getElementById('staff-body');
  const tfoot = document.getElementById('staff-foot');
  
  tbody.innerHTML = DB.staff.map((s, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><strong>${s.name}</strong></td>
      <td>${s.role}</td>
      <td class="td-right">UGX ${fmt(s.salary)}</td>
      <td class="td-right">UGX ${fmt(s.allowance)}</td>
      <td class="td-right"><strong>UGX ${fmt(s.salary + s.allowance)}</strong></td>
      <td>${s.phone}</td>
      <td style="text-align:center"><button class="btn btn-ghost btn-xs" onclick="openStaffEdit('${s.id}')">✏️ Edit</button></td>
    </tr>
  `).join('');
  
  const gross = DB.staff.reduce((sum, s) => sum + s.salary + s.allowance, 0);
  tfoot.innerHTML = `<tr><td colspan="3"><strong>Totals:</strong></td><td class="td-right">UGX ${fmt(DB.staff.reduce((sum, s) => sum + s.salary, 0))}</td><td class="td-right">UGX ${fmt(DB.staff.reduce((sum, s) => sum + s.allowance, 0))}</td><td class="td-right"><strong>UGX ${fmt(gross)}</strong></td><td colspan="2"></td></tr>`;
  
  // Populate staff selects
  ['pay-staff', 'adv-staff', 'all-staff', 'ph-staff'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const current = sel.value;
    sel.innerHTML = '<option value="">-- Select staff --</option>' + DB.staff.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
    sel.value = current;
  });
}

// ============================================================
// UPDATED ADVANCE RENDERING WITH DELETE BUTTONS
// ============================================================
async function renderAdvances() {
  const outstanding = DB.advances.filter(a => !a.repaid);
  const div = document.getElementById('adv-outstanding');
  
  if (!outstanding.length) {
    div.innerHTML = '<div class="empty"><div class="empty-icon">✓</div>No outstanding advances</div>';
    return;
  }
  
  div.innerHTML = `<div class="tbl-wrap"><table style="font-size:12px">
    <thead><tr><th>Staff</th><th>Amount</th><th>Date</th><th>Months</th><th></th></tr></thead>
    <tbody>
      ${outstanding.map(a => `
        <tr>
          <td><strong>${a.staffName}</strong></td>
          <td class="td-right">UGX ${fmt(a.amt)}</td>
          <td>${new Date(a.date).toLocaleDateString('en-GB')}</td>
          <td>${a.months}</td>
          <td style="text-align:center"><button class="btn btn-danger btn-xs" onclick="deleteAdvance('${a.id}')" title="Undo/Delete this advance">🗑 Undo</button></td>
        </tr>
      `).join('')}
    </tbody>
  </table></div>`;
}

// ============================================================
// HELPER MESSAGE FUNCTION
// ============================================================
function showMsg(elementId, message, type) {
  const el = document.getElementById(elementId);
  if (!el) return;
  
  const className = type === 'ok' ? 'msg-ok' : type === 'err' ? 'msg-err' : 'msg-warn';
  el.innerHTML = `<div class="msg ${className}">${message}</div>`;
  
  if (type === 'ok') {
    setTimeout(() => { el.innerHTML = ''; }, 3000);
  }
}

// ============================================================
// UPDATED loadAll() - ADD TO EXISTING FUNCTION
// ============================================================
// Modify the existing loadAll() function to include:
// await loadAllowances();
// After the other data loads

// ============================================================
// UPDATE PAYROLL INITIALIZATION - CALLED FROM goPage('payroll')
// ============================================================
async function initPayroll() {
  // Populate staff selects
  ['pay-staff', 'adv-staff', 'all-staff', 'ph-staff'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    sel.innerHTML = '<option value="">-- Select staff --</option>' + DB.staff.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
  });
  
  // Populate allowance type filter
  const allFStaff = document.getElementById('all-f-staff');
  if (allFStaff) {
    allFStaff.innerHTML = '<option value="">All staff</option>' + DB.staff.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
  }
  
  // Load advances and render
  await renderAdvances();
}

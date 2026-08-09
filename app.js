// ============================================================
// QUATTRO LITE — app.js
// ============================================================

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// TSB (Türkiye Sigorta Birliği) üyesi başlıca elementer sigorta şirketleri
const INSURANCE_COMPANIES = [
  "Aksigorta", "Allianz Sigorta", "Anadolu Sigorta", "Ana Sigorta", "AXA Sigorta",
  "Ankara Sigorta", "Atlas Sigorta", "Bereket Sigorta", "BNP Paribas Cardif Sigorta",
  "Bupa Acıbadem Sigorta", "Chubb Sigorta", "Coface Sigorta", "Corpus Sigorta",
  "Doğa Sigorta", "Fiba Sigorta", "Generali Sigorta", "Groupama Sigorta", "Gulf Sigorta",
  "HDİ Sigorta", "Katılım Sigorta", "Koru Sigorta", "Magdeburger Sigorta", "Mapfre Sigorta",
  "Neova Sigorta", "Orient Sigorta", "Quick Sigorta", "Ray Sigorta", "Şeker Sigorta",
  "Sompo Sigorta", "Türk Nippon Sigorta", "Türkiye Sigorta", "Unico Sigorta", "Zurich Sigorta"
];

let DATA = {
  customers: [],
  policies: [],
  cari: [],
  installments: []
};

function uid() {
  return (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2));
}

// ---------------------------------------------------------
// TEMA
// ---------------------------------------------------------
function setTheme(name) {
  document.documentElement.setAttribute('data-theme', name);
  localStorage.setItem('quattro_theme', name);
  document.querySelectorAll('.swatch').forEach(s => s.classList.toggle('active', s.dataset.theme === name));
}
function initTheme() {
  const saved = localStorage.getItem('quattro_theme') || 'dark';
  setTheme(saved);
}
initTheme();

// ---------------------------------------------------------
// AUTH
// ---------------------------------------------------------
async function doLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errEl = document.getElementById('loginError');
  errEl.textContent = '';

  if (!email || !password) {
    errEl.textContent = 'E-posta ve şifre gerekli.';
    return;
  }

  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    errEl.textContent = 'Giriş başarısız: ' + error.message;
    return;
  }
  await enterApp();
}

async function doLogout() {
  await sb.auth.signOut();
  document.getElementById('app-shell').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
}

async function checkSession() {
  const { data } = await sb.auth.getSession();
  if (data.session) {
    await enterApp();
  }
}

async function enterApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app-shell').style.display = 'grid';
  await loadAllData();
  wireNav();
  renderAll();
}

// ---------------------------------------------------------
// NAV
// ---------------------------------------------------------
function wireNav() {
  document.querySelectorAll('.nav-btn[data-page]').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.nav-btn[data-page]').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.page).classList.add('active');
    };
  });
}

// ---------------------------------------------------------
// DATA LOADING
// ---------------------------------------------------------
async function loadAllData() {
  const [c, p, car, inst] = await Promise.all([
    sb.from('customers').select('*').order('full_name'),
    sb.from('policies').select('*').order('end_date'),
    sb.from('cari_transactions').select('*').order('transaction_date', { ascending: false }),
    sb.from('installments').select('*').order('due_date')
  ]);
  DATA.customers = c.data || [];
  DATA.policies = p.data || [];
  DATA.cari = car.data || [];
  DATA.installments = inst.data || [];

  if (c.error) showToast('Müşteri verisi alınamadı: ' + c.error.message);
  if (p.error) showToast('Poliçe verisi alınamadı: ' + p.error.message);
}

function customerName(id) {
  const c = DATA.customers.find(x => x.id === id);
  return c ? c.full_name : '—';
}
function customerPhone(id) {
  const c = DATA.customers.find(x => x.id === id);
  return c ? c.phone : '';
}

function renderAll() {
  renderDashboard();
  renderCustomers();
  renderPolicies();
  renderCari();
  renderInstallments();
  renderWhatsapp();
  fillCustomerSelects();
  updateSidebarBadges();
}

// ---------------------------------------------------------
// DASHBOARD
// ---------------------------------------------------------
function daysUntil(dateStr) {
  const today = new Date(); today.setHours(0,0,0,0);
  const d = new Date(dateStr);
  return Math.round((d - today) / 86400000);
}

function renderDashboard() {
  document.getElementById('kpiCustomers').textContent = DATA.customers.length;

  const activePolicies = DATA.policies.filter(p => p.status === 'aktif');
  document.getElementById('kpiActivePolicies').textContent = activePolicies.length;

  const upcoming = activePolicies
    .map(p => ({ ...p, remaining: daysUntil(p.end_date) }))
    .filter(p => p.remaining >= 0 && p.remaining <= 30)
    .sort((a,b) => a.remaining - b.remaining);
  document.getElementById('kpiRenewals').textContent = upcoming.length;

  const overdue = DATA.installments.filter(i => !i.paid && daysUntil(i.due_date) < 0);
  document.getElementById('kpiOverdue').textContent = overdue.length;

  const rBody = document.getElementById('dashRenewalsBody');
  rBody.innerHTML = upcoming.length ? upcoming.slice(0,8).map(p => `
    <tr>
      <td>${customerName(p.customer_id)}</td>
      <td>${p.branch || '—'}</td>
      <td class="mono">${p.policy_no || '—'}</td>
      <td>${fmtDate(p.end_date)}</td>
      <td><span class="pill">${p.remaining} gün</span></td>
    </tr>`).join('') : `<tr><td class="table-empty" colspan="5">Önümüzdeki 30 gün içinde yenileme yok.</td></tr>`;

  const oBody = document.getElementById('dashOverdueBody');
  oBody.innerHTML = overdue.length ? overdue.slice(0,8).map(i => `
    <tr>
      <td>${customerName(i.customer_id)}</td>
      <td class="mono">${policyNoOf(i.policy_id)}</td>
      <td>${fmtDate(i.due_date)}</td>
      <td>${fmtMoney(i.amount)}</td>
      <td class="right"><button class="btn btn-wa btn-sm" onclick="sendWaInstallment('${i.id}')">WhatsApp</button></td>
    </tr>`).join('') : `<tr><td class="table-empty" colspan="5">Vadesi geçmiş taksit yok. 🎉</td></tr>`;
}

function policyNoOf(policyId) {
  const p = DATA.policies.find(x => x.id === policyId);
  return p ? (p.policy_no || '—') : '—';
}

// ---------------------------------------------------------
// MÜŞTERİLER
// ---------------------------------------------------------
function renderCustomers() {
  const q = (document.getElementById('customerSearch')?.value || '').toLowerCase();
  const list = DATA.customers.filter(c =>
    !q || c.full_name.toLowerCase().includes(q) || (c.tc_vkn||'').includes(q) || (c.phone||'').includes(q)
  );
  document.getElementById('customerCount').textContent = `${list.length} kayıt`;
  const body = document.getElementById('customersBody');
  body.innerHTML = list.length ? list.map(c => `
    <tr>
      <td>${c.full_name}</td>
      <td class="mono">${c.tc_vkn || '—'}</td>
      <td class="mono">${c.phone || '—'}</td>
      <td>${c.city || '—'}</td>
      <td>${c.customer_type === 'kurumsal' ? 'Kurumsal' : 'Bireysel'}</td>
      <td class="right"><button class="btn btn-ghost btn-sm" onclick="openCustomerModal('${c.id}')">Düzenle</button></td>
    </tr>`).join('') : `<tr><td class="table-empty" colspan="6">Kayıt yok. "+ Yeni Müşteri" ile başla.</td></tr>`;
}

function openCustomerModal(id) {
  document.getElementById('customerId').value = id || '';
  if (id) {
    const c = DATA.customers.find(x => x.id === id);
    document.getElementById('cFullName').value = c.full_name || '';
    document.getElementById('cTcVkn').value = c.tc_vkn || '';
    document.getElementById('cPhone').value = c.phone || '';
    document.getElementById('cEmail').value = c.email || '';
    document.getElementById('cCity').value = c.city || '';
    document.getElementById('cBirthDate').value = c.birth_date || '';
    document.getElementById('cType').value = c.customer_type || 'bireysel';
    document.getElementById('cNotes').value = c.notes || '';
  } else {
    ['cFullName','cTcVkn','cPhone','cEmail','cCity','cBirthDate','cNotes'].forEach(fid => document.getElementById(fid).value = '');
    document.getElementById('cType').value = 'bireysel';
  }
  openModal('customerModal');
}

async function saveCustomer() {
  const id = document.getElementById('customerId').value;
  const payload = {
    full_name: document.getElementById('cFullName').value.trim(),
    tc_vkn: document.getElementById('cTcVkn').value.trim(),
    phone: document.getElementById('cPhone').value.trim(),
    email: document.getElementById('cEmail').value.trim(),
    city: document.getElementById('cCity').value.trim(),
    birth_date: document.getElementById('cBirthDate').value || null,
    customer_type: document.getElementById('cType').value,
    notes: document.getElementById('cNotes').value.trim()
  };
  if (!payload.full_name || !payload.phone) { showToast('Ad Soyad ve Telefon zorunlu.'); return; }

  const res = id
    ? await sb.from('customers').update(payload).eq('id', id)
    : await sb.from('customers').insert(payload);

  if (res.error) { showToast('Kayıt hatası: ' + res.error.message); return; }
  closeModal('customerModal');
  await loadAllData();
  renderAll();
  showToast('Müşteri kaydedildi.');
}

// ---------------------------------------------------------
// POLİÇELER
// ---------------------------------------------------------
function fillCustomerSelects() {
  const opts = DATA.customers.map(c => `<option value="${c.id}">${c.full_name}</option>`).join('');
  ['carCustomer','iCustomer'].forEach(selId => {
    const el = document.getElementById(selId);
    if (el) el.innerHTML = `<option value="">Seçiniz…</option>` + opts;
  });
  const pEl = document.getElementById('pCustomer');
  if (pEl) pEl.innerHTML = `<option value="">Seçiniz…</option><option value="__new__">+ Yeni Müşteri Ekle</option>` + opts;
}

function fillCompanySelect() {
  const el = document.getElementById('pCompany');
  if (!el) return;
  el.innerHTML = INSURANCE_COMPANIES.map(c => `<option value="${c}">${c}</option>`).join('') + `<option value="__other__">Diğer / Listede Yok</option>`;
}

function togglePolicyCustomerMode() {
  const isNew = document.getElementById('pCustomer').value === '__new__';
  document.getElementById('policyNewCustomerFields').style.display = isNew ? 'block' : 'none';
}

function togglePolicyCompanyOther() {
  const isOther = document.getElementById('pCompany').value === '__other__';
  document.getElementById('pCompanyOtherWrap').style.display = isOther ? 'block' : 'none';
}

function statusLabel(s) {
  return { aktif: 'Aktif', iptal: 'İptal', yenilendi: 'Yenilendi', 'sure-gecti': 'Süresi Geçti' }[s] || s;
}

function renderPolicies() {
  const filter = document.getElementById('policyStatusFilter').value;
  const list = DATA.policies.filter(p => !filter || p.status === filter);
  document.getElementById('policyCount').textContent = `${list.length} kayıt`;
  const body = document.getElementById('policiesBody');
  body.innerHTML = list.length ? list.map(p => `
    <tr>
      <td>${customerName(p.customer_id)}</td>
      <td>${p.company_name || '—'}</td>
      <td>${p.branch || '—'}</td>
      <td class="mono">${p.policy_no || '—'}</td>
      <td>${fmtDate(p.end_date)}</td>
      <td>${fmtMoney(p.gross_premium)}</td>
      <td><span class="status-tag status-${p.status}">${statusLabel(p.status)}</span></td>
      <td class="right"><button class="btn btn-ghost btn-sm" onclick="openPolicyModal('${p.id}')">Düzenle</button></td>
    </tr>`).join('') : `<tr><td class="table-empty" colspan="8">Kayıt yok.</td></tr>`;
}

function openPolicyModal(id) {
  fillCustomerSelects();
  fillCompanySelect();
  document.getElementById('policyId').value = id || '';
  document.getElementById('policyNewCustomerFields').style.display = 'none';
  document.getElementById('pCompanyOtherWrap').style.display = 'none';
  ['npFullName','npTcVkn','npPhone','npCity','npBirthDate'].forEach(fid => document.getElementById(fid).value = '');
  document.getElementById('npType').value = 'bireysel';

  if (id) {
    const p = DATA.policies.find(x => x.id === id);
    document.getElementById('pCustomer').value = p.customer_id || '';
    if (INSURANCE_COMPANIES.includes(p.company_name)) {
      document.getElementById('pCompany').value = p.company_name;
    } else if (p.company_name) {
      document.getElementById('pCompany').value = '__other__';
      document.getElementById('pCompanyOtherWrap').style.display = 'block';
      document.getElementById('pCompanyOther').value = p.company_name;
    }
    document.getElementById('pBranch').value = p.branch || 'Trafik';
    document.getElementById('pPolicyNo').value = p.policy_no || '';
    document.getElementById('pPlate').value = p.plate || '';
    document.getElementById('pStart').value = p.start_date || '';
    document.getElementById('pEnd').value = p.end_date || '';
    document.getElementById('pPremium').value = p.gross_premium || '';
    document.getElementById('pCommission').value = p.commission_rate || '';
    document.getElementById('pStatus').value = p.status || 'aktif';
  } else {
    ['pCompanyOther','pPolicyNo','pPlate','pStart','pEnd','pPremium','pCommission'].forEach(fid => document.getElementById(fid).value = '');
    document.getElementById('pCustomer').value = '';
    document.getElementById('pCompany').value = INSURANCE_COMPANIES[0];
    document.getElementById('pBranch').value = 'Trafik';
    document.getElementById('pStatus').value = 'aktif';
  }
  openModal('policyModal');
}

async function savePolicy() {
  const id = document.getElementById('policyId').value;
  let customerId = document.getElementById('pCustomer').value;

  // Poliçe formundan yeni müşteri oluşturma
  if (customerId === '__new__') {
    const newCustomer = {
      full_name: document.getElementById('npFullName').value.trim(),
      tc_vkn: document.getElementById('npTcVkn').value.trim(),
      phone: document.getElementById('npPhone').value.trim(),
      email: '',
      city: document.getElementById('npCity').value.trim(),
      customer_type: document.getElementById('npType').value,
      birth_date: document.getElementById('npBirthDate').value || null,
      notes: ''
    };
    if (!newCustomer.full_name || !newCustomer.phone) { showToast('Yeni müşteri için Ad Soyad ve Telefon zorunlu.'); return; }

    const insRes = await sb.from('customers').insert(newCustomer).select().single();
    if (insRes.error) { showToast('Müşteri oluşturma hatası: ' + insRes.error.message); return; }
    customerId = insRes.data.id;
  }

  if (!customerId) { showToast('Müşteri seçimi zorunlu.'); return; }

  const companySel = document.getElementById('pCompany').value;
  const companyName = companySel === '__other__' ? document.getElementById('pCompanyOther').value.trim() : companySel;

  const payload = {
    customer_id: customerId,
    company_name: companyName,
    branch: document.getElementById('pBranch').value,
    policy_no: document.getElementById('pPolicyNo').value.trim(),
    plate: document.getElementById('pPlate').value.trim(),
    start_date: document.getElementById('pStart').value || null,
    end_date: document.getElementById('pEnd').value || null,
    gross_premium: parseFloat(document.getElementById('pPremium').value) || 0,
    commission_rate: parseFloat(document.getElementById('pCommission').value) || 0,
    status: document.getElementById('pStatus').value
  };
  if (!payload.end_date) { showToast('Bitiş Tarihi zorunlu.'); return; }

  const res = id
    ? await sb.from('policies').update(payload).eq('id', id)
    : await sb.from('policies').insert(payload);

  if (res.error) { showToast('Kayıt hatası: ' + res.error.message); return; }
  closeModal('policyModal');
  await loadAllData();
  renderAll();
  showToast('Poliçe kaydedildi.');
}

// ---------------------------------------------------------
// CARİ HESAP
// ---------------------------------------------------------
function renderCari() {
  // bakiye tablosu
  const balances = {};
  DATA.cari.forEach(t => {
    if (!balances[t.customer_id]) balances[t.customer_id] = { borc: 0, alacak: 0 };
    if (t.type === 'borc') balances[t.customer_id].borc += Number(t.amount);
    else balances[t.customer_id].alacak += Number(t.amount);
  });
  const balBody = document.getElementById('cariBalanceBody');
  const rows = Object.entries(balances);
  balBody.innerHTML = rows.length ? rows.map(([cid, b]) => {
    const net = b.borc - b.alacak;
    return `<tr>
      <td>${customerName(cid)}</td>
      <td>${fmtMoney(b.borc)}</td>
      <td>${fmtMoney(b.alacak)}</td>
      <td class="${net > 0 ? 'mono' : 'mono'}" style="color:${net > 0 ? 'var(--bad)' : 'var(--good)'}">${fmtMoney(net)}</td>
    </tr>`;
  }).join('') : `<tr><td class="table-empty" colspan="4">Cari hareket yok.</td></tr>`;

  // hareket listesi
  const body = document.getElementById('cariBody');
  body.innerHTML = DATA.cari.length ? DATA.cari.slice(0,50).map(t => `
    <tr>
      <td>${fmtDate(t.transaction_date)}</td>
      <td>${customerName(t.customer_id)}</td>
      <td>${t.type === 'borc' ? '<span class="pill bad">Borç</span>' : '<span class="pill">Alacak</span>'}</td>
      <td>${fmtMoney(t.amount)}</td>
      <td class="muted">${t.description || '—'}</td>
      <td class="right"><button class="btn btn-danger btn-sm" onclick="deleteCari('${t.id}')">Sil</button></td>
    </tr>`).join('') : `<tr><td class="table-empty" colspan="6">Hareket yok.</td></tr>`;
}

function openCariModal() {
  document.getElementById('carCustomer').value = '';
  document.getElementById('carType').value = 'borc';
  document.getElementById('carAmount').value = '';
  document.getElementById('carDate').value = new Date().toISOString().slice(0,10);
  document.getElementById('carDesc').value = '';
  openModal('cariModal');
}

async function saveCari() {
  const payload = {
    customer_id: document.getElementById('carCustomer').value,
    type: document.getElementById('carType').value,
    amount: parseFloat(document.getElementById('carAmount').value) || 0,
    transaction_date: document.getElementById('carDate').value || new Date().toISOString().slice(0,10),
    description: document.getElementById('carDesc').value.trim()
  };
  if (!payload.customer_id || !payload.amount) { showToast('Müşteri ve Tutar zorunlu.'); return; }

  const res = await sb.from('cari_transactions').insert(payload);
  if (res.error) { showToast('Kayıt hatası: ' + res.error.message); return; }
  closeModal('cariModal');
  await loadAllData();
  renderAll();
  showToast('Cari hareket eklendi.');
}

async function deleteCari(id) {
  if (!confirm('Bu hareketi silmek istediğine emin misin?')) return;
  const res = await sb.from('cari_transactions').delete().eq('id', id);
  if (res.error) { showToast('Silme hatası: ' + res.error.message); return; }
  await loadAllData();
  renderAll();
}

// ---------------------------------------------------------
// TAKSİTLER
// ---------------------------------------------------------
function fillPolicyOptionsForCustomer() {
  const cid = document.getElementById('iCustomer').value;
  const pols = DATA.policies.filter(p => p.customer_id === cid);
  document.getElementById('iPolicy').innerHTML = `<option value="">Poliçe seçin (opsiyonel)</option>` +
    pols.map(p => `<option value="${p.id}">${p.branch || ''} — ${p.policy_no || 'no'}</option>`).join('');
}

function renderInstallments() {
  const body = document.getElementById('installmentsBody');
  const list = [...DATA.installments].sort((a,b) => new Date(a.due_date) - new Date(b.due_date));
  body.innerHTML = list.length ? list.map(i => {
    const overdue = !i.paid && daysUntil(i.due_date) < 0;
    const st = i.paid ? '<span class="status-tag status-aktif">Ödendi</span>'
      : overdue ? '<span class="status-tag status-iptal">Gecikmiş</span>'
      : '<span class="status-tag status-sure-gecti">Bekliyor</span>';
    return `<tr>
      <td>${customerName(i.customer_id)}</td>
      <td class="mono">${policyNoOf(i.policy_id)}</td>
      <td>${i.installment_no || 1}</td>
      <td>${fmtDate(i.due_date)}</td>
      <td>${fmtMoney(i.amount)}</td>
      <td>${st}</td>
      <td class="right">
        ${i.paid ? '' : `<button class="btn btn-good btn-sm" onclick="markPaid('${i.id}')">Ödendi İşaretle</button>`}
      </td>
    </tr>`;
  }).join('') : `<tr><td class="table-empty" colspan="7">Taksit yok.</td></tr>`;
}

function openInstallmentModal() {
  fillCustomerSelects();
  document.getElementById('iCustomer').value = '';
  document.getElementById('iPolicy').innerHTML = '';
  document.getElementById('iNo').value = 1;
  document.getElementById('iDue').value = '';
  document.getElementById('iAmount').value = '';
  document.getElementById('iPaid').value = 'false';
  openModal('installmentModal');
}

async function saveInstallment() {
  const payload = {
    customer_id: document.getElementById('iCustomer').value,
    policy_id: document.getElementById('iPolicy').value || null,
    installment_no: parseInt(document.getElementById('iNo').value) || 1,
    due_date: document.getElementById('iDue').value,
    amount: parseFloat(document.getElementById('iAmount').value) || 0,
    paid: document.getElementById('iPaid').value === 'true'
  };
  if (!payload.customer_id || !payload.due_date || !payload.amount) { showToast('Müşteri, Vade ve Tutar zorunlu.'); return; }

  const res = await sb.from('installments').insert(payload);
  if (res.error) { showToast('Kayıt hatası: ' + res.error.message); return; }
  closeModal('installmentModal');
  await loadAllData();
  renderAll();
  showToast('Taksit eklendi.');
}

async function markPaid(id) {
  const res = await sb.from('installments').update({ paid: true, paid_date: new Date().toISOString().slice(0,10) }).eq('id', id);
  if (res.error) { showToast('Güncelleme hatası: ' + res.error.message); return; }
  await loadAllData();
  renderAll();
  showToast('Taksit ödendi olarak işaretlendi.');
}

// ---------------------------------------------------------
// WHATSAPP HATIRLATMA
// ---------------------------------------------------------
function waLink(phone, message) {
  const clean = (phone || '').replace(/\D/g,'');
  const withCountry = clean.startsWith('90') ? clean : (clean.startsWith('0') ? '90' + clean.slice(1) : '90' + clean);
  return `https://wa.me/${withCountry}?text=${encodeURIComponent(message)}`;
}

function daysUntilBirthday(birthDateStr) {
  if (!birthDateStr) return null;
  const today = new Date(); today.setHours(0,0,0,0);
  const b = new Date(birthDateStr);
  let next = new Date(today.getFullYear(), b.getMonth(), b.getDate());
  if (next < today) next = new Date(today.getFullYear() + 1, b.getMonth(), b.getDate());
  return Math.round((next - today) / 86400000);
}

function renderWhatsapp() {
  const thresholdDays = parseInt(document.getElementById('waThresholdDays').value);
  const activePolicies = DATA.policies.filter(p => p.status === 'aktif');
  const renewals = activePolicies
    .map(p => ({ ...p, remaining: daysUntil(p.end_date) }))
    .filter(p => p.remaining >= 0 && p.remaining <= thresholdDays)
    .sort((a,b) => a.remaining - b.remaining);

  const renEl = document.getElementById('waRenewalsList');
  renEl.innerHTML = renewals.length ? renewals.map(p => {
    const name = customerName(p.customer_id);
    const phone = customerPhone(p.customer_id);
    const msg = `Merhaba ${name}, ${p.branch || ''} poliçenizin (${p.policy_no || ''}) bitiş tarihi ${fmtDate(p.end_date)}. Yenileme teklifi için sizi arayabilir miyiz?`;
    return `<div class="wa-row">
      <div class="wa-meta"><b>${name}</b> — ${p.branch || ''} · ${policyPlateNo(p)} <span class="pill">${p.remaining} gün kaldı</span></div>
      <a class="btn btn-wa btn-sm" target="_blank" href="${waLink(phone, msg)}">WhatsApp Gönder</a>
    </div>`;
  }).join('') : `<div class="table-empty">Seçili eşikte yenilenecek poliçe yok.</div>`;

  const overdue = DATA.installments.filter(i => !i.paid && daysUntil(i.due_date) < 0);
  const ovEl = document.getElementById('waOverdueList');
  ovEl.innerHTML = overdue.length ? overdue.map(i => {
    const name = customerName(i.customer_id);
    const phone = customerPhone(i.customer_id);
    const gecikme = Math.abs(daysUntil(i.due_date));
    const msg = `Merhaba ${name}, ${fmtMoney(i.amount)} tutarındaki taksit ödemenizin vadesi ${gecikme} gün önce geçti. Müsait olduğunuzda ödeme için sizinle iletişime geçebilir miyiz?`;
    return `<div class="wa-row">
      <div class="wa-meta"><b>${name}</b> — ${fmtMoney(i.amount)} <span class="pill bad">${gecikme} gün gecikme</span></div>
      <a class="btn btn-wa btn-sm" target="_blank" href="${waLink(phone, msg)}">WhatsApp Gönder</a>
    </div>`;
  }).join('') : `<div class="table-empty">Gecikmiş taksit yok. 🎉</div>`;

  const birthdays = DATA.customers
    .map(c => ({ ...c, remaining: daysUntilBirthday(c.birth_date) }))
    .filter(c => c.remaining !== null && c.remaining <= 7)
    .sort((a,b) => a.remaining - b.remaining);
  const bdEl = document.getElementById('waBirthdayList');
  bdEl.innerHTML = birthdays.length ? birthdays.map(c => {
    const msg = `Merhaba ${c.full_name}, doğum gününüzü kutlar, sağlık ve mutluluk dolu bir yıl dileriz! 🎉 — Quattro Sigorta ve Aracılık Hizmetleri`;
    const label = c.remaining === 0 ? 'Bugün! 🎂' : `${c.remaining} gün kaldı`;
    return `<div class="wa-row">
      <div class="wa-meta"><b>${c.full_name}</b> <span class="pill">${label}</span></div>
      <a class="btn btn-wa btn-sm" target="_blank" href="${waLink(c.phone, msg)}">WhatsApp Gönder</a>
    </div>`;
  }).join('') : `<div class="table-empty">Önümüzdeki 7 gün içinde doğum günü yok.</div>`;
}

function sendWaInstallment(id) {
  const i = DATA.installments.find(x => x.id === id);
  if (!i) return;
  const name = customerName(i.customer_id);
  const phone = customerPhone(i.customer_id);
  const gecikme = Math.abs(daysUntil(i.due_date));
  const msg = `Merhaba ${name}, ${fmtMoney(i.amount)} tutarındaki taksit ödemenizin vadesi ${gecikme} gün önce geçti. Müsait olduğunuzda ödeme için sizinle iletişime geçebilir miyiz?`;
  window.open(waLink(phone, msg), '_blank');
}

function policyPlateNo(p) {
  return p.plate ? p.plate : (p.policy_no || '');
}

// ---------------------------------------------------------
// SIDEBAR BADGES
// ---------------------------------------------------------
function updateSidebarBadges() {
  const overdue = DATA.installments.filter(i => !i.paid && daysUntil(i.due_date) < 0).length;
  const thresholdDays = parseInt(document.getElementById('waThresholdDays')?.value || 30);
  const renewals = DATA.policies.filter(p => p.status === 'aktif' && daysUntil(p.end_date) >= 0 && daysUntil(p.end_date) <= thresholdDays).length;

  const b1 = document.getElementById('badgeInstallments');
  b1.textContent = overdue;
  b1.classList.toggle('zero', overdue === 0);

  const b2 = document.getElementById('badgeWa');
  b2.textContent = renewals + overdue;
  b2.classList.toggle('zero', (renewals + overdue) === 0);
}

// ---------------------------------------------------------
// HELPERS
// ---------------------------------------------------------
function fmtMoney(n) {
  return '₺' + Number(n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('tr-TR');
}
function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.style.display = 'block';
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => t.style.display = 'none', 3200);
}

// ---------------------------------------------------------
// BOOT
// ---------------------------------------------------------
checkSession();

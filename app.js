// ★ 배포 후 Google Apps Script 웹앱 URL로 교체하세요
const GAS_URL = 'https://script.google.com/macros/s/AKfycby7qgj93LtLd7pMIxugiZoekiEK9byrQR2l1eLAfbmIzztETXk5BhhWwxrOcb7ulQ5dww/exec';

let selectedSlot = null;
let guestCount = 1;
let maxGuests = 6;

// ───────────────────────────────
// 초기화: 슬롯 목록 불러오기
// ───────────────────────────────
async function loadSlots() {
  const messages = ['원두 가는 중', '물 끓이는 중', '드립 중', '거의 다 됐어요'];
  let msgIdx = 0;

  // 로딩 UI 삽입
  const grid = document.getElementById('slot-list');
  grid.innerHTML = `
    <div class="coffee-loading">
      <span class="coffee-loading-text">${messages[0]}</span>
      <div class="coffee-dots">
        <span></span><span></span><span></span>
      </div>
    </div>`;

  const textEl = grid.querySelector('.coffee-loading-text');
  const interval = setInterval(() => {
    msgIdx = (msgIdx + 1) % messages.length;
    textEl.classList.remove('fade-in');
    void textEl.offsetWidth; // reflow로 애니메이션 재시작
    textEl.classList.add('fade-in');
    textEl.textContent = messages[msgIdx];
  }, 1400);

  try {
    const res = await fetch(`${GAS_URL}?action=slots`);
    const slots = await res.json();
    clearInterval(interval);
    renderSlots(slots);
  } catch {
    clearInterval(interval);
    grid.innerHTML = '<p style="color:#d4614a">슬롯을 불러오지 못했습니다. 새로고침해 주세요.</p>';
  }
}

function renderSlots(slots) {
  const grid = document.getElementById('slot-list');
  if (!slots || slots.length === 0) {
    grid.innerHTML = '<p class="loading">예약 가능한 시간대가 없습니다.</p>';
    return;
  }

  grid.innerHTML = slots.map(slot => {
    const remain = slot.max - slot.reserved;
    const full = remain <= 0;
    return `
      <button
        class="slot-btn${full ? ' full' : ''}"
        data-time="${slot.time}"
        data-max="${slot.max}"
        data-remain="${remain}"
        ${full ? 'disabled' : `onclick="selectSlot('${slot.time}', ${slot.max}, ${remain})"`}>
        <div class="slot-time">${slot.time}</div>
        <div class="slot-remain">${full ? '예약 마감' : `남은 자리 ${remain}명`}</div>
      </button>`;
  }).join('');
}

// ───────────────────────────────
// 슬롯 선택
// ───────────────────────────────
function selectSlot(time, max, remain) {
  selectedSlot = { time, max, remain };
  maxGuests = remain;

  // UI 업데이트
  document.querySelectorAll('.slot-btn').forEach(b => b.classList.remove('selected'));
  const btn = document.querySelector(`.slot-btn[data-time="${time}"]`);
  if (btn) btn.classList.add('selected');

  // 인원 초기화
  guestCount = 1;
  updateGuestsUI();

  // 잠깐 후 다음 스텝으로
  setTimeout(() => {
    document.getElementById('selected-time-label').textContent = `선택한 시간: ${time}`;
    showStep('step-form');
  }, 300);
}

// ───────────────────────────────
// 인원 제어
// ───────────────────────────────
function changeGuests(delta) {
  const effectiveMax = Math.min(maxGuests, 2);
  const next = guestCount + delta;
  if (next < 1 || next > effectiveMax) return;
  guestCount = next;
  updateGuestsUI();
}

function updateGuestsUI() {
  const effectiveMax = Math.min(maxGuests, 2);
  document.getElementById('guests-count').textContent = guestCount;
  document.getElementById('guests-minus').disabled = guestCount <= 1;
  document.getElementById('guests-plus').style.display = guestCount >= 2 ? 'none' : '';
  document.getElementById('guests-hint').textContent = `남은 자리 ${maxGuests}명`;
}

// ───────────────────────────────
// 예약 제출
// ───────────────────────────────
async function submitReservation() {
  const name = document.getElementById('name').value.trim();
  const phone = document.getElementById('phone').value.trim();

  if (!name) { alert('이름을 입력해 주세요.'); return; }
  if (!phone || !/^010-\d{4}-\d{4}$/.test(phone)) {
    alert('연락처를 올바르게 입력해 주세요. (예: 010-1234-5678)'); return;
  }
  if (!selectedSlot) { alert('시간대를 선택해 주세요.'); return; }

  const btn = document.querySelector('#step-form .btn-primary');
  btn.textContent = '처리 중...';
  btn.disabled = true;

  try {
    const res = await fetch(GAS_URL, {
      method: 'POST',
      body: JSON.stringify({
        action: 'reserve',
        name,
        phone,
        time: selectedSlot.time,
        guests: guestCount
      })
    });
    const data = await res.json();

    if (data.success) {
      showDoneStep(data);
    } else {
      showError(data.message || '예약에 실패했습니다. 다시 시도해 주세요.');
    }
  } catch {
    showError('네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
  } finally {
    btn.textContent = '예약하기';
    btn.disabled = false;
  }
}

// ───────────────────────────────
// 완료 화면
// ───────────────────────────────
let currentReservationCode = '';

function showDoneStep(data) {
  currentReservationCode = data.code;
  document.getElementById('reservation-card').innerHTML = `
    <div class="row"><span>이름</span><span>${data.name}</span></div>
    <div class="row"><span>시간</span><span>${data.time}</span></div>
    <div class="row"><span>인원</span><span>${data.guests}명</span></div>
  `;
  document.getElementById('insta-box').style.display = 'block';
  document.getElementById('insta-done').style.display = 'none';
  document.getElementById('insta-id').value = '';
  showStep('step-done');
}

// ───────────────────────────────
// 인스타 아이디 제출
// ───────────────────────────────
async function submitInsta() {
  const instaId = document.getElementById('insta-id').value.trim().replace(/^@/, '');
  if (!instaId) { alert('아이디를 입력해 주세요.'); return; }

  const btn = document.querySelector('.btn-insta');
  btn.textContent = '저장 중...';
  btn.disabled = true;

  try {
    await fetch(GAS_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'insta', code: currentReservationCode, instaId })
    });
  } catch { /* 실패해도 사용자에게 오류 표시 안 함 */ }

  document.getElementById('insta-box').style.display = 'none';
  document.getElementById('insta-done').style.display = 'block';
}

function skipInsta() {
  document.getElementById('insta-box').style.display = 'none';
  document.getElementById('insta-done').style.display = 'none';
}

// ───────────────────────────────
// 에러 화면
// ───────────────────────────────
function showError(msg) {
  document.getElementById('error-msg').textContent = msg;
  showStep('step-error');
}

// ───────────────────────────────
// 유틸
// ───────────────────────────────
function showStep(id) {
  document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function goBack() { showStep('step-time'); }

function resetAll() {
  selectedSlot = null;
  guestCount = 1;
  document.getElementById('name').value = '';
  document.getElementById('phone').value = '';
  showStep('step-time');
  loadSlots(); // 슬롯 새로 고침
}

// 전화번호 자동 하이픈
document.getElementById('phone').addEventListener('input', function () {
  const digits = this.value.replace(/\D/g, '');
  if (digits.length <= 3) this.value = digits;
  else if (digits.length <= 7) this.value = digits.slice(0, 3) + '-' + digits.slice(3);
  else this.value = digits.slice(0, 3) + '-' + digits.slice(3, 7) + '-' + digits.slice(7, 11);
});

// 페이지 로드 시 슬롯 불러오기
loadSlots();

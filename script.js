document.getElementById('year').textContent = new Date().getFullYear();

var toggle = document.getElementById('navToggle');
var links = document.getElementById('navLinks');
toggle.addEventListener('click', function(){
  var open = links.style.display === 'flex';
  links.style.display = open ? 'none' : 'flex';
  links.style.cssText += open ? '' : 'position:absolute;top:100%;left:0;right:0;flex-direction:column;background:#f8f4ec;padding:20px 24px;border-bottom:1px solid rgba(60,38,32,.15);gap:16px;';
});
links.querySelectorAll('a').forEach(function(a){
  a.addEventListener('click', function(){
    if (window.innerWidth <= 900) links.style.display = 'none';
  });
});

/* ---------- Gestion du consentement RGPD (bandeau + Google Consent Mode v2) ---------- */
(function(){
  var CONSENT_KEY = 'edt_consent_v1';
  var DEFAULTS = { necessary: true, functional: false, analytics: false, marketing: false };

  var banner = document.getElementById('consentBanner');
  var modal = document.getElementById('consentModal');
  var toggleFunctional = document.getElementById('consentFunctional');
  var toggleAnalytics = document.getElementById('consentAnalytics');
  var toggleMarketing = document.getElementById('consentMarketing');

  function loadStored(){
    try{
      var raw = localStorage.getItem(CONSENT_KEY);
      return raw ? JSON.parse(raw) : null;
    }catch(e){ return null; }
  }

  function loadGoogleFonts(){
    if (document.getElementById('gfontsStylesheet')) return;
    var pre1 = document.createElement('link');
    pre1.rel = 'preconnect'; pre1.href = 'https://fonts.googleapis.com';
    var pre2 = document.createElement('link');
    pre2.rel = 'preconnect'; pre2.href = 'https://fonts.gstatic.com'; pre2.crossOrigin = 'anonymous';
    var sheet = document.createElement('link');
    sheet.id = 'gfontsStylesheet'; sheet.rel = 'stylesheet';
    sheet.href = 'https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,400;0,500;0,600;1,400&family=Work+Sans:wght@300;400;500;600&display=swap';
    document.head.appendChild(pre1);
    document.head.appendChild(pre2);
    document.head.appendChild(sheet);
  }

  function applyConsent(state){
    if (state.functional) loadGoogleFonts();
    if (window.gtag){
      gtag('consent', 'update', {
        analytics_storage: state.analytics ? 'granted' : 'denied',
        ad_storage: state.marketing ? 'granted' : 'denied',
        ad_user_data: state.marketing ? 'granted' : 'denied',
        ad_personalization: state.marketing ? 'granted' : 'denied',
        personalization_storage: state.marketing ? 'granted' : 'denied'
      });
    }
  }

  var callFab = document.getElementById('callFab');
  function hideBanner(){ banner.hidden = true; if (callFab) callFab.style.display = 'flex'; }
  function showBanner(){ banner.hidden = false; if (callFab) callFab.style.display = 'none'; }
  function openModal(prefill){
    toggleFunctional.checked = !!prefill.functional;
    toggleAnalytics.checked = !!prefill.analytics;
    toggleMarketing.checked = !!prefill.marketing;
    modal.hidden = false;
  }
  function closeModal(){ modal.hidden = true; }

  function saveConsent(state){
    try{ localStorage.setItem(CONSENT_KEY, JSON.stringify(Object.assign({}, state, { ts: Date.now() }))); }catch(e){}
    applyConsent(state);
    hideBanner();
    closeModal();
  }

  var stored = loadStored();
  if (stored){
    applyConsent(stored);
  } else {
    showBanner();
  }

  document.getElementById('consentAccept').addEventListener('click', function(){
    saveConsent({ necessary: true, functional: true, analytics: true, marketing: true });
  });
  document.getElementById('consentRefuse').addEventListener('click', function(){
    saveConsent({ necessary: true, functional: false, analytics: false, marketing: false });
  });
  document.getElementById('consentAcceptAll').addEventListener('click', function(){
    saveConsent({ necessary: true, functional: true, analytics: true, marketing: true });
  });
  document.getElementById('consentSave').addEventListener('click', function(){
    saveConsent({
      necessary: true,
      functional: toggleFunctional.checked,
      analytics: toggleAnalytics.checked,
      marketing: toggleMarketing.checked
    });
  });

  [document.getElementById('consentCustomize'), document.getElementById('consentDetailsLink'),
   document.getElementById('footerConsentLink'), document.getElementById('bkConsentLink')].forEach(function(el){
    if (!el) return;
    el.addEventListener('click', function(e){
      e.preventDefault();
      openModal(loadStored() || DEFAULTS);
    });
  });

  modal.addEventListener('click', function(e){
    if (e.target === modal){
      closeModal();
      if (!loadStored()) showBanner();
    }
  });
})();

/* ---------- Calendrier de réservation + formulaire (pop-up, sur toutes les pages) ---------- */
(function(){
  // ---- Configuration ----------------------------------------------------
  // Adresse email de l'institut : reçoit chaque demande de rendez-vous via FormSubmit.
  // /!\ Première utilisation : FormSubmit envoie un email de confirmation à cette adresse
  // avec un lien "Activate Form" - il faut cliquer dessus une fois pour que les envois
  // suivants arrivent automatiquement (voir spam si besoin).
  var FORM_ENDPOINT = 'https://formsubmit.co/ajax/Eclatdutemps@hotmail.com';

  // Horaires d'ouverture : 0=dimanche … 6=samedi. null = fermé.
  var BUSINESS_HOURS = {
    0: [9, 18],
    1: [9, 18],
    2: [9, 18],
    3: [9, 18],
    4: [9, 18],
    5: [9, 18],
    6: [9, 18]
  };
  var DAYS_AHEAD = 21; // nombre de jours ouverts affichés dans le calendrier

  // Créneaux déjà pris en dehors du site (téléphone, en institut...).
  // À compléter à la main par Delphine après chaque confirmation reçue par email :
  // "AAAA-MM-JJ": ["HH:MM", "HH:MM"]
  var MANUAL_BOOKED = {
    // "2026-01-15": ["10:00", "14:00"]
  };

  var STORAGE_KEY = 'edt_bookings_v1';
  var WEEKDAYS = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
  var MONTHS = ['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Août','Sep','Oct','Nov','Déc'];

  var dayStrip = document.getElementById('dayStrip');
  var slotGrid = document.getElementById('slotGrid');
  var bookingModal = document.getElementById('bookingModal');
  var calendarModal = document.getElementById('calendarModal');
  var bookingForm = document.getElementById('bookingForm');
  var recap = document.getElementById('bookingRecap');
  var formStatus = document.getElementById('formStatus');

  if (!dayStrip || !slotGrid || !bookingForm) return;

  function openBookingModal(){ bookingModal.hidden = false; }
  function closeBookingModal(){ bookingModal.hidden = true; }
  function openCalendarModal(){ calendarModal.hidden = false; }
  function closeCalendarModal(){ calendarModal.hidden = true; }

  document.getElementById('bookingModalClose').addEventListener('click', closeBookingModal);
  bookingModal.addEventListener('click', function(e){
    if (e.target === bookingModal) closeBookingModal();
  });

  document.getElementById('calendarModalClose').addEventListener('click', closeCalendarModal);
  calendarModal.addEventListener('click', function(e){
    if (e.target === calendarModal) closeCalendarModal();
  });

  // Tout élément portant la classe js-book-btn ouvre le calendrier (header, hero,
  // sections dédiées, pied de page...) au lieu de faire défiler la page.
  document.querySelectorAll('.js-book-btn').forEach(function(el){
    el.addEventListener('click', function(e){
      e.preventDefault();
      openCalendarModal();
    });
  });

  function pad(n){ return n < 10 ? '0' + n : '' + n; }
  function dateKey(d){ return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

  function loadLocalBookings(){
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
    catch(e){ return {}; }
  }
  function saveLocalBooking(key, time){
    var all = loadLocalBookings();
    all[key] = all[key] || [];
    if (all[key].indexOf(time) === -1) all[key].push(time);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(all)); } catch(e){}
  }
  function bookedFor(key){
    var manual = MANUAL_BOOKED[key] || [];
    var local = loadLocalBookings()[key] || [];
    return manual.concat(local);
  }

  function slotsFor(dateObj){
    var hours = BUSINESS_HOURS[dateObj.getDay()];
    if (!hours) return [];
    var slots = [];
    var now = new Date();
    var isToday = dateKey(dateObj) === dateKey(now);
    for (var h = hours[0]; h < hours[1]; h++){
      if (isToday && h <= now.getHours()) continue; // pas de créneau déjà passé
      slots.push(pad(h) + ':00');
    }
    return slots;
  }

  function buildDays(){
    var out = [];
    var base = new Date();
    base.setHours(0,0,0,0);
    for (var i = 0; out.length < DAYS_AHEAD && i < 60; i++){
      var day = new Date(base.getTime());
      day.setDate(day.getDate() + i);
      if (BUSINESS_HOURS[day.getDay()]) out.push(day);
    }
    return out;
  }

  var days = buildDays();
  var selectedDay = null;
  var selectedTime = null;

  function renderDays(){
    dayStrip.innerHTML = '';
    days.forEach(function(day){
      var key = dateKey(day);
      var available = slotsFor(day).filter(function(t){ return bookedFor(key).indexOf(t) === -1; });
      var isActive = selectedDay && dateKey(selectedDay) === key;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'day-btn' + (isActive ? ' active' : '');
      btn.disabled = available.length === 0;
      btn.innerHTML = '<span class="wd">' + WEEKDAYS[day.getDay()] + '</span>' +
                       '<span class="dd">' + day.getDate() + '</span>' +
                       '<span class="wd">' + MONTHS[day.getMonth()] + '</span>';
      btn.addEventListener('click', function(){
        selectedDay = day;
        selectedTime = null;
        renderDays();
        renderSlots();
      });
      dayStrip.appendChild(btn);
    });
  }

  function renderSlots(){
    slotGrid.innerHTML = '';
    if (!selectedDay){
      slotGrid.innerHTML = '<p class="placeholder-empty">Choisissez d\'abord une date ci-dessus.</p>';
      return;
    }
    var key = dateKey(selectedDay);
    var booked = bookedFor(key);
    var slots = slotsFor(selectedDay);
    if (slots.length === 0){
      slotGrid.innerHTML = '<p class="placeholder-empty">Aucun créneau disponible ce jour-là.</p>';
      return;
    }
    slots.forEach(function(time){
      var isBooked = booked.indexOf(time) !== -1;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'slot-btn' + (selectedTime === time && !isBooked ? ' selected' : '');
      btn.disabled = isBooked;
      btn.textContent = isBooked ? time + ' · pris' : time;
      btn.addEventListener('click', function(){
        selectedTime = time;
        renderSlots();
        showForm();
      });
      slotGrid.appendChild(btn);
    });
  }

  function showForm(){
    if (!selectedDay || !selectedTime) return;
    var label = WEEKDAYS[selectedDay.getDay()] + ' ' + selectedDay.getDate() + ' ' +
                MONTHS[selectedDay.getMonth()] + ' ' + selectedDay.getFullYear();
    recap.textContent = 'Massage Kobido & Acupuncture Esthétique - ' + label + ' à ' + selectedTime;
    document.getElementById('fieldDate').value = label;
    document.getElementById('fieldTime').value = selectedTime;
    formStatus.className = 'form-status';
    formStatus.textContent = '';
    closeCalendarModal();
    openBookingModal();
  }

  renderDays();
  renderSlots();

  bookingForm.addEventListener('submit', function(e){
    e.preventDefault();
    if (!selectedDay || !selectedTime){
      formStatus.className = 'form-status show err';
      formStatus.textContent = 'Merci de choisir une date et un horaire avant d\'envoyer.';
      return;
    }

    document.getElementById('fieldReplyTo').value = document.getElementById('bkEmail').value;

    var submitBtn = bookingForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Envoi en cours…';

    var payload = new FormData(bookingForm);
    var bookedDay = selectedDay;
    var bookedTime = selectedTime;

    fetch(FORM_ENDPOINT, {
      method: 'POST',
      headers: { 'Accept': 'application/json' },
      body: payload
    }).then(function(res){
      if (!res.ok) throw new Error('network');
      saveLocalBooking(dateKey(bookedDay), bookedTime);
      formStatus.className = 'form-status show ok';
      formStatus.textContent = 'Votre demande de rendez-vous a bien été envoyée. Delphine vous confirme votre créneau par retour d\'email ou de téléphone.';
      bookingForm.reset();
      selectedDay = null;
      selectedTime = null;
      renderDays();
      renderSlots();
      setTimeout(function(){
        closeBookingModal();
        recap.textContent = 'Sélectionnez une date et un horaire pour réserver votre soin.';
      }, 2500);
    }).catch(function(){
      formStatus.className = 'form-status show err';
      formStatus.textContent = "Une erreur est survenue lors de l'envoi. Vous pouvez aussi nous contacter directement au +41 78 265 49 25 ou par email.";
    }).finally(function(){
      submitBtn.disabled = false;
      submitBtn.textContent = 'Envoyer ma demande';
    });
  });
})();

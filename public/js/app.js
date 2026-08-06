document.addEventListener('DOMContentLoaded', function () {
  initTooltips();
  initMultiSelects();
  initRangeSliders();
  initHashNavigation();
  initOffcanvasClose();
  initAlertAutoDismiss();
});

/* ─── Bootstrap tooltips ─── */

function initTooltips() {
  document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach(function (el) {
    new bootstrap.Tooltip(el);
  });
}

/* ─── Hash-based tab navigation ─── */

function initHashNavigation() {
  var hash = window.location.hash;
  if (hash) {
    var tabEl = document.querySelector('#sidebar-nav a[href="' + hash + '"]');
    if (tabEl) {
      var tab = new bootstrap.Tab(tabEl);
      tab.show();
    }
  }
}

/* ─── Close offcanvas sidebar on mobile when nav link clicked ─── */

function initOffcanvasClose() {
  document.querySelectorAll('#sidebar .nav-link').forEach(function (link) {
    link.addEventListener('click', function () {
      var offcanvasEl = document.getElementById('sidebar');
      var offcanvas = bootstrap.Offcanvas.getInstance(offcanvasEl);
      if (offcanvas) offcanvas.hide();
    });
  });
}

/* ─── Multi-select dropdowns ─── */

function initMultiSelects() {
  document.querySelectorAll('.multi-select').forEach(function (ms) {
    var selected = ms.dataset.selected ? ms.dataset.selected.split(',').map(function (s) { return s.trim(); }) : [];
    var checkboxes = ms.querySelectorAll('.ms-opt');

    checkboxes.forEach(function (cb) {
      if (selected.includes(cb.value)) cb.checked = true;
      cb.addEventListener('change', function () { updateMultiSelect(ms); });
    });

    updateMultiSelect(ms);
  });
}

function updateMultiSelect(ms) {
  var field = ms.dataset.field;
  var label = ms.querySelector('.ms-label');
  var hiddenContainer = ms.querySelector('.ms-hidden-inputs');
  var checkboxes = ms.querySelectorAll('.ms-opt');
  var checked = Array.from(checkboxes).filter(function (cb) { return cb.checked; });

  // Rebuild hidden inputs for form submission
  hiddenContainer.innerHTML = '';
  checked.forEach(function (cb) {
    var input = document.createElement('input');
    input.type = 'hidden';
    input.name = field;
    input.value = cb.value;
    hiddenContainer.appendChild(input);
  });

  // Update display label
  if (checked.length === 0) {
    label.textContent = 'Select ' + field + '...';
    label.classList.add('text-muted');
  } else {
    var names = checked.map(function (cb) {
      return cb.closest('label').querySelector('span').textContent.trim();
    });
    label.textContent = names.length > 3 ? names.length + ' selected' : names.join(', ');
    label.classList.remove('text-muted');
  }
}

/* ─── Range sliders with live value display ─── */

function initRangeSliders() {
  document.querySelectorAll('.range-with-value').forEach(function (container) {
    var input = container.querySelector('input[type="range"]');
    var display = container.querySelector('.range-value');
    if (input && display) {
      var suffix = display.dataset.suffix || '';
      input.addEventListener('input', function () {
        display.textContent = input.value + suffix;
      });
    }
  });
}

/* ─── Auto-dismiss flash alerts ─── */

function initAlertAutoDismiss() {
  setTimeout(function () {
    document.querySelectorAll('.alert-dismissible').forEach(function (el) {
      var alert = bootstrap.Alert.getOrCreateInstance(el);
      if (alert) alert.close();
    });
  }, 6000);
}

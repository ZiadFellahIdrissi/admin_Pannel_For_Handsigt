// Pre-fills TVA (20%) and TTC (HT + TVA) from the HT field as a
// convenience default on the Charges form - opt-in via a shared
// [data-vat-calc] container holding [data-vat-ht]/[data-vat-tva]/
// [data-vat-ttc] fields. Once the admin types into TVA or TTC directly,
// auto-fill stops touching that field, so a real receipt (which doesn't
// always follow the 20% assumption) can still be transcribed exactly as
// printed.
(function () {
  document.querySelectorAll('[data-vat-calc]').forEach(function (container) {
    var ht = container.querySelector('[data-vat-ht]');
    var tva = container.querySelector('[data-vat-tva]');
    var ttc = container.querySelector('[data-vat-ttc]');
    if (!ht || !tva || !ttc) return;

    var tvaEdited = false;
    var ttcEdited = false;

    tva.addEventListener('input', function () { tvaEdited = true; });
    ttc.addEventListener('input', function () { ttcEdited = true; });

    ht.addEventListener('input', function () {
      var htValue = parseFloat(ht.value);
      if (!isFinite(htValue)) return;

      if (!tvaEdited) {
        tva.value = Math.round(htValue * 0.2 * 100) / 100;
      }
      if (!ttcEdited) {
        var tvaValue = parseFloat(tva.value);
        if (!isFinite(tvaValue)) tvaValue = 0;
        ttc.value = Math.round((htValue + tvaValue) * 100) / 100;
      }
    });
  });
})();

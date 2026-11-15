// Écran « Réglages » : profil, règles de calcul, collation, sauvegardes.
import { state, saveSettings, exportData, importData, todayISO } from '../state.js';
import { DEFAULT_RULES, computeBase } from '../calc.js';
import { esc, fmt, parseNum, numInput, toast } from '../ui.js';

const APP_VERSION = '1.2.0';

const RULE_FIELDS = [
  ['activityFactor', 'Facteur vie quotidienne', 'ex. 1,2 = travail assis'],
  ['kcalPerKmEffort', 'kcal par km-effort', ''],
  ['dPlusPerKm', 'm de D+ = 1 km-effort', ''],
  ['strengthKcalPerMin', 'Muscu / autre : kcal par minute', ''],
  ['lowerBodyExtraKm', 'Renfo bas du corps : glucides en plus (équivalent km)', ''],
  ['deficitShort', 'Déficit : moins de 1 h (kcal)', ''],
  ['deficitMid', 'Déficit : 1 h à 2 h (kcal)', ''],
  ['deficitLong', 'Déficit : plus de 2 h (kcal)', ''],
  ['shortMin', 'Seuil « court » (minutes)', ''],
  ['longMin', 'Seuil « long » (minutes)', ''],
  ['fatPct', 'Lipides : % des kcal (si plus que le minimum)', ''],
  ['fiberTarget', 'Fibres (g/jour)', ''],
];

export function render(root) {
  const { profile, rules } = state.settings;
  const base = computeBase(profile, rules);

  root.innerHTML = `
  <form id="settings" autocomplete="off">
    <div class="card">
      <h2>Mon profil</h2>
      <p class="hint">Ces informations restent sur votre téléphone.</p>
      <label>Sexe (pour la formule)</label>
      <div class="seg" data-seg="sex"><button type="button" data-v="M" class="${profile.sex !== 'F' ? 'on' : ''}">Homme</button><button type="button" data-v="F" class="${profile.sex === 'F' ? 'on' : ''}">Femme</button></div>
      <div class="grid3">
        <div><label>Âge</label>${numInput('age', profile.age, 'placeholder="ans"')}</div>
        <div><label>Taille (cm)</label>${numInput('height', profile.height)}</div>
        <div><label>Poids (kg)</label>${numInput('weight', profile.weight, 'placeholder="estimé"')}</div>
      </div>
      <p class="notice small" id="base-preview">${basePreview(base, rules)}</p>
    </div>

    <div class="card">
      <h2>Besoins de base</h2>
      <div class="seg" data-seg="baseMode"><button type="button" data-v="auto" class="${rules.baseMode !== 'fixed' ? 'on' : ''}">Calculés (Mifflin)</button><button type="button" data-v="fixed" class="${rules.baseMode === 'fixed' ? 'on' : ''}">Chiffre fixe</button></div>
      <div id="base-fixed" ${rules.baseMode === 'fixed' ? '' : 'hidden'}><label>Besoins de base (kcal/jour, sans sport)</label>${numInput('baseFixed', rules.baseFixed)}</div>
    </div>

    <div class="card">
      <h2>Protéines et lipides</h2>
      <label>Protéines</label>
      <div class="seg" data-seg="proteinMode"><button type="button" data-v="perKg" class="${rules.proteinMode !== 'fixed' ? 'on' : ''}">g par kg</button><button type="button" data-v="fixed" class="${rules.proteinMode === 'fixed' ? 'on' : ''}">g par jour</button></div>
      <div class="grid2">
        <div><label>g par kg</label>${numInput('proteinPerKg', rules.proteinPerKg)}</div>
        <div><label>g par jour</label>${numInput('proteinFixed', rules.proteinFixed)}</div>
      </div>
      <label>Lipides minimum</label>
      <div class="seg" data-seg="fatMinMode"><button type="button" data-v="perKg" class="${rules.fatMinMode !== 'fixed' ? 'on' : ''}">g par kg</button><button type="button" data-v="fixed" class="${rules.fatMinMode === 'fixed' ? 'on' : ''}">g par jour</button></div>
      <div class="grid2">
        <div><label>g par kg</label>${numInput('fatMinPerKg', rules.fatMinPerKg)}</div>
        <div><label>g par jour</label>${numInput('fatMinFixed', rules.fatMinFixed)}</div>
      </div>
      <p class="hint">Seule la valeur du mode choisi (bouton vert) est utilisée. Glucides = le reste des calories.</p>
    </div>

    <div class="card">
      <h2>Règles de calcul</h2>
      <div class="grid2">${RULE_FIELDS.map(([k, l, h]) => `<div><label>${l}</label>${numInput(k, rules[k], h ? `placeholder="${h}"` : '')}</div>`).join('')}</div>
      <label class="check"><input type="checkbox" name="useGarmin" ${rules.useGarmin ? 'checked' : ''}> Utiliser les kcal Garmin à la place du calcul (quand elles sont saisies)</label>
      <button type="button" class="btn-small" id="reset-rules">Remettre les règles par défaut</button>
    </div>


    <button type="submit" class="btn-primary btn-block" style="position:sticky;bottom:calc(var(--tabs-h) + env(safe-area-inset-bottom) + 8px);z-index:2">Enregistrer les réglages</button>
  </form>

  <div class="card" style="margin-top:16px">
    <h2>Sauvegardes</h2>
    <p class="small">Vos données ne sont que sur ce téléphone. Exportez régulièrement un fichier de sauvegarde (par exemple dans Fichiers › iCloud Drive), surtout avant de changer de téléphone.</p>
    <button class="btn-primary btn-block" id="export">⬇︎ Exporter une sauvegarde (JSON)</button>
    <button class="btn-block" id="import">⬆︎ Importer une sauvegarde</button>
    <input type="file" id="import-file" accept="application/json,.json" hidden>
    <p class="hint">L'import remplace toutes les données actuelles par celles du fichier.</p>
  </div>
  <p class="center small muted">Version ${APP_VERSION}</p>`;

  const form = root.querySelector('#settings');
  const seg = { sex: profile.sex || 'M', baseMode: rules.baseMode, proteinMode: rules.proteinMode, fatMinMode: rules.fatMinMode };
  form.querySelectorAll('[data-seg]').forEach((el) => {
    el.onclick = (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      seg[el.dataset.seg] = b.dataset.v;
      el.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      if (el.dataset.seg === 'baseMode') form.querySelector('#base-fixed').hidden = b.dataset.v !== 'fixed';
      preview();
    };
  });
  const read = () => {
    const v = (n) => parseNum(form.elements[n].value);
    const p = { sex: seg.sex, age: v('age'), height: v('height'), weight: v('weight') };
    const r = { ...rules, baseMode: seg.baseMode, proteinMode: seg.proteinMode, fatMinMode: seg.fatMinMode, baseFixed: v('baseFixed'), proteinPerKg: v('proteinPerKg'), proteinFixed: v('proteinFixed'), fatMinPerKg: v('fatMinPerKg'), fatMinFixed: v('fatMinFixed'), useGarmin: form.elements.useGarmin.checked };
    for (const [k] of RULE_FIELDS) r[k] = v(k);
    return { p, r };
  };
  const preview = () => { const { p, r } = read(); root.querySelector('#base-preview').innerHTML = basePreview(computeBase(p, { ...DEFAULT_RULES, ...clean(r) }), r); };
  form.oninput = preview;

  form.onsubmit = async (e) => {
    e.preventDefault();
    const { p, r } = read();
    const missing = [...RULE_FIELDS.map(([k]) => k), 'proteinPerKg', 'fatMinPerKg'].filter((k) => r[k] == null);
    if (missing.length) return toast('Une règle est vide : remplissez-la ou remettez les valeurs par défaut');
    if (r.baseMode === 'fixed' && !r.baseFixed) return toast('Indiquez le chiffre fixe des besoins de base');
    if (r.proteinMode === 'fixed' && !r.proteinFixed) return toast('Indiquez les protéines en g par jour');
    if (r.fatMinMode === 'fixed' && !r.fatMinFixed) return toast('Indiquez les lipides minimum en g par jour');
    Object.assign(state.settings, { profile: p, rules: r });
    await saveSettings();
    toast('Réglages enregistrés');
    render(root);
  };

  root.querySelector('#reset-rules').onclick = async () => {
    if (!confirm('Remettre toutes les règles de calcul par défaut ? (Le profil ne change pas.)')) return;
    state.settings.rules = { ...DEFAULT_RULES };
    await saveSettings();
    toast('Règles par défaut remises');
    render(root);
  };

  root.querySelector('#export').onclick = async () => {
    const data = await exportData();
    const name = `nutrition-sauvegarde-${todayISO()}.json`;
    const file = new File([JSON.stringify(data, null, 1)], name, { type: 'application/json' });
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: name });
        return;
      }
    } catch (err) {
      if (err.name === 'AbortError') return;
    }
    const url = URL.createObjectURL(file);
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };
  const fileInput = root.querySelector('#import-file');
  root.querySelector('#import').onclick = () => fileInput.click();
  fileInput.onchange = async () => {
    const file = fileInput.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const n = `${data.foods?.length ?? 0} aliments, ${data.recipes?.length ?? 0} recettes et ${data.days?.length ?? 0} jours`;
      if (!confirm(`Importer ${n} ? Toutes les données actuelles seront remplacées.`)) return;
      await importData(data);
      toast('Sauvegarde importée');
      state.rerender();
    } catch (err) {
      alert(`Import impossible : ${err.message}`);
    } finally {
      fileInput.value = '';
    }
  };
}

const clean = (r) => Object.fromEntries(Object.entries(r).filter(([, v]) => v != null));

function basePreview(base, rules) {
  if (!base) return rules.baseMode === 'fixed' ? 'Indiquez le chiffre fixe ci-dessous.' : 'Remplissez âge, taille et poids pour calculer vos besoins.';
  if (base.mode === 'fixed') return `Besoins de base : <b>${fmt(base.value)} kcal/jour</b> (chiffre fixe).`;
  return `Métabolisme de repos : ${fmt(base.bmr)} kcal. Besoins de base sans sport : <b>${fmt(base.value)} kcal/jour</b>.`;
}

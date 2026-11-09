<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Create or edit a library food: by hand, from a barcode (library / Open Food Facts) or from a label photo. -->
<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { mealCategory, type AiStatus, type FoodCategory, type Product, type ProductDraft } from '@mealler/shared';
  import { del, get, patch, post, put } from './api';
  import { preparePhoto } from './image';
  import { reveal } from './reveal';
  import { app, errorMessage, t } from './state.svelte';
  import BarcodeScanner from './BarcodeScanner.svelte';
  import CategoryPicker from './CategoryPicker.svelte';
  import Icon from './Icon.svelte';

  let {
    product = null,
    draft = null,
    onsaved,
    oncancel
  }: {
    product?: Product | null;
    draft?: ProductDraft | null;
    onsaved: (p: Product | null) => void;
    oncancel: () => void;
  } = $props();

  // The form copies its initial values once; the parent remounts it for another product.
  const start = untrack(() => product ?? draft);
  const initialSource = untrack(() => draft?.source);
  const toText = (n: number | null | undefined) =>
    n == null ? '' : String(n).replace('.', app.locale === 'it' ? ',' : '.');
  const toNumber = (s: string): number | null => {
    const v = s.trim().replace(',', '.');
    if (!v) return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };

  let name = $state(start?.name ?? '');
  let brand = $state(start?.brand ?? '');
  let barcode = $state(start?.barcode ?? '');
  let kcal = $state(toText(start?.kcal));
  let protein = $state(toText(start?.protein));
  let carbs = $state(toText(start?.carbs));
  let fat = $state(toText(start?.fat));
  let fiber = $state(toText(start?.fiber));
  let servingG = $state(toText(start?.servingG));
  let servingLabel = $state(start?.servingLabel ?? '');
  let source = $state<ProductDraft['source']>(start?.source ?? 'manual');
  // Drafts (barcode, label photo) have no category: automatic until the user picks one.
  let category = $state<FoodCategory | null>((start as Partial<Product> | null)?.category ?? null);
  let notice = $state(initialSource === 'openfoodfacts' ? t('foods.fromOff') : initialSource === 'label' ? t('foods.fromLabel') : '');
  let error = $state('');
  let busy = $state(false);
  let scanning = $state(false);
  let reading = $state(false);
  let ai = $state<AiStatus | null>(null);
  let fileInput = $state<HTMLInputElement | null>(null);
  // Nutrition label photo: what is shown, and what still has to be uploaded with the product.
  const dataUrl = (p: { mime: string; data: string }) => `data:${p.mime};base64,${p.data}`;
  let labelPhoto = $state<{ mime: string; data: string } | null>(untrack(() => draft?.labelPhoto ?? null));
  let labelSrc = $state<string | null>(untrack(() => (draft?.labelPhoto ? dataUrl(draft.labelPhoto) : (product?.labelUrl ?? null))));
  const aiReady = $derived(!!ai?.enabled && !ai.capReached && !ai.limitReached);
  const readOnly = untrack(() => !!product && !product.canEdit);

  onMount(async () => {
    ai = await get<AiStatus>('/ai/status').catch(() => null);
  });

  function apply(d: ProductDraft) {
    if (d.name) name = d.name;
    if (d.brand) brand = d.brand;
    if (d.barcode) barcode = d.barcode;
    if (d.kcal != null) kcal = toText(d.kcal);
    if (d.protein != null) protein = toText(d.protein);
    if (d.carbs != null) carbs = toText(d.carbs);
    if (d.fat != null) fat = toText(d.fat);
    fiber = toText(d.fiber);
    if (d.servingG != null) servingG = toText(d.servingG);
    if (d.servingLabel) servingLabel = d.servingLabel;
    if (d.labelPhoto) {
      labelPhoto = d.labelPhoto;
      labelSrc = dataUrl(d.labelPhoto);
    }
    source = d.source;
  }

  async function onCode(code: string) {
    scanning = false;
    barcode = code;
    error = notice = '';
    try {
      const res = await get<{ product: Product | null; draft: ProductDraft | null }>(`/products/barcode/${code}`);
      if (res.product) {
        onsaved(res.product);
      } else if (res.draft) {
        apply(res.draft);
        notice = t('foods.fromOff');
      } else {
        notice = t('foods.notFound');
      }
    } catch (e) {
      error = errorMessage(e);
    }
  }

  async function readLabel(event: Event) {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    error = notice = '';
    try {
      const photo = await preparePhoto(file);
      labelPhoto = { mime: photo.mime, data: photo.data };
      labelSrc = photo.previewUrl;
      // Without AI the photo is only kept, to read the label by eye: say why nothing else happens.
      if (!aiReady) {
        notice = t(!ai?.enabled ? 'ai.disabled' : ai.capReached ? 'ai.capReached' : 'ai.limitReached');
        return;
      }
      reading = true;
      apply(await post<ProductDraft>('/products/label', { photo: labelPhoto }));
      notice = t('foods.fromLabel');
    } catch (e) {
      error = errorMessage(e);
    } finally {
      reading = false;
      if (fileInput) fileInput.value = '';
    }
  }

  async function save(event: SubmitEvent) {
    event.preventDefault();
    const body = {
      name,
      brand: brand || null,
      barcode: barcode.replace(/\s/g, '') || null,
      kcal: toNumber(kcal),
      protein: toNumber(protein),
      carbs: toNumber(carbs),
      fat: toNumber(fat),
      fiber: toNumber(fiber),
      servingG: toNumber(servingG),
      servingLabel: servingLabel || null,
      source,
      category
    };
    if ([body.kcal, body.protein, body.carbs, body.fat].some((v) => v == null)) {
      error = t('error.validation');
      return;
    }
    busy = true;
    error = '';
    try {
      let saved = product ? await patch<Product>(`/products/${product.id}`, body) : await post<Product>('/products', body);
      if (labelPhoto) {
        // Open Food Facts photos can be large: shrink them like the ones taken here.
        const small = await preparePhoto(new Blob([Uint8Array.from(atob(labelPhoto.data), (c) => c.charCodeAt(0))], { type: labelPhoto.mime }));
        saved = await put<Product>(`/products/${saved.id}/label`, { photo: { mime: small.mime, data: small.data } });
      }
      onsaved(saved);
    } catch (e) {
      error = errorMessage(e);
    } finally {
      busy = false;
    }
  }

  async function remove() {
    if (!product || !confirm(t('foods.deleteConfirm'))) return;
    try {
      await del(`/products/${product.id}`);
      onsaved(null);
    } catch (e) {
      error = errorMessage(e);
    }
  }

  const per100 = $derived([
    { id: 'kcal', label: `${t('nutrient.kcal')} (kcal)` },
    { id: 'protein', label: `${t('nutrient.protein')} (g)` },
    { id: 'carbs', label: `${t('nutrient.carbs')} (g)` },
    { id: 'fat', label: `${t('nutrient.fat')} (g)` },
    { id: 'fiber', label: `${t('nutrient.fiber')} (g)` }
  ]);
</script>

<form class="card stack" onsubmit={save}>
  <h2 class="section-title">{product ? t('foods.edit') : t('foods.new')}</h2>

  {#if !readOnly}
    {#if scanning}
      <BarcodeScanner oncode={onCode} onclose={() => (scanning = false)} />
    {:else}
      <div class="tools">
        <button class="btn" type="button" onclick={() => (scanning = true)}><Icon name="barcode" size={20} />{t('foods.scan')}</button>
        <button class="btn" type="button" disabled={reading} onclick={() => fileInput?.click()}><Icon name="camera" size={20} />{t('foods.label')}</button>
        <input bind:this={fileInput} class="visually-hidden" type="file" accept="image/*" tabindex="-1" aria-hidden="true" onchange={readLabel} />
      </div>
    {/if}
  {/if}

  {#if reading}<p class="notice" role="status">{t('foods.labelReading')}</p>{/if}
  {#if notice}<p class="notice" role="status">{notice}</p>{/if}

  {#if labelSrc}
    <details class="label-photo" open>
      <summary class="label">{t('foods.labelPhoto')}</summary>
      <img src={labelSrc} alt={t('foods.labelPhoto')} />
    </details>
  {/if}

  <fieldset disabled={readOnly} class="stack plain">
    <div class="field">
      <label for="p-name">{t('foods.name')}</label>
      <input id="p-name" required maxlength="200" bind:value={name} />
    </div>
    <CategoryPicker bind:value={category} auto={mealCategory([name])} />
    <div class="pair">
      <div class="field">
        <label for="p-brand">{t('foods.brand')} <span class="muted small">({t('common.optional')})</span></label>
        <input id="p-brand" maxlength="200" bind:value={brand} />
      </div>
      <div class="field">
        <label for="p-barcode">{t('foods.barcode')}</label>
        <input id="p-barcode" inputmode="numeric" maxlength="14" bind:value={barcode} />
      </div>
    </div>

    <h3 class="label">{t('foods.per100')}</h3>
    <div class="pair">
      <div class="field"><label for="p-kcal">{per100[0].label}</label><input id="p-kcal" inputmode="decimal" required bind:value={kcal} /></div>
      <div class="field"><label for="p-protein">{per100[1].label}</label><input id="p-protein" inputmode="decimal" required bind:value={protein} /></div>
      <div class="field"><label for="p-carbs">{per100[2].label}</label><input id="p-carbs" inputmode="decimal" required bind:value={carbs} /></div>
      <div class="field"><label for="p-fat">{per100[3].label}</label><input id="p-fat" inputmode="decimal" required bind:value={fat} /></div>
      <div class="field"><label for="p-fiber">{per100[4].label}</label><input id="p-fiber" inputmode="decimal" bind:value={fiber} /></div>
    </div>

    <h3 class="label">{t('foods.serving')} <span class="muted small">({t('common.optional')})</span></h3>
    <div class="pair">
      <div class="field"><label for="p-sg">{t('foods.servingG')}</label><input id="p-sg" inputmode="decimal" bind:value={servingG} /></div>
      <div class="field">
        <label for="p-sl">{t('foods.servingLabel')}</label>
        <input id="p-sl" maxlength="100" placeholder={t('foods.servingLabelHint')} bind:value={servingLabel} />
      </div>
    </div>
  </fieldset>

  {#if error}<p class="error" role="alert" use:reveal>{error}</p>{/if}

  <div class="row">
    {#if !readOnly}<button class="btn btn-primary" type="submit" disabled={busy}>{t('foods.save')}</button>{/if}
    <button class="btn btn-ghost" type="button" onclick={oncancel}>{t('common.close')}</button>
    {#if product?.canEdit}<button class="btn btn-danger" type="button" onclick={remove}>{t('foods.delete')}</button>{/if}
  </div>
</form>

<style>
  .plain {
    border: none;
    margin: 0;
    padding: 0;
    min-width: 0;
  }
  .tools {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .pair {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }
  .label-photo img {
    display: block;
    width: 100%;
    margin-top: 8px;
    border-radius: 12px;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
</style>

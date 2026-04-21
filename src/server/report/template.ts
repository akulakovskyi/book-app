import type { ComparisonResult, SplitGroup, SplitOption } from '../../shared/types.js';

export function renderReportHtml(result: ComparisonResult): string {
  const { input, splitGroups, nights } = result;
  const title = `${input.destination} · ${input.checkIn} → ${input.checkOut} · ${input.totalGuests} guests`;
  const topGroup = splitGroups[0];
  const topOption = topGroup?.alternatives[0];

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>${escape(title)}</title>
<style>${baseCss()}</style>
</head>
<body>
<header class="cover">
  <h1>${escape(input.destination)}</h1>
  <p class="subtitle">
    ${escape(input.checkIn)} → ${escape(input.checkOut)} · ${nights} nights · ${input.totalGuests} guests
  </p>
  ${topGroup && topOption ? summaryCard(topGroup, topOption) : ''}
</header>

${splitGroups.map((g, i) => renderGroup(g, i + 1)).join('\n')}

<footer>
  <p>Generated ${escape(result.createdAt)} · booking-app</p>
</footer>
</body>
</html>`;
}

function summaryCard(group: SplitGroup, top: SplitOption): string {
  return `
  <div class="summary">
    <div class="summary-label">Recommended shape</div>
    <div class="summary-value">${escape(group.label)}</div>
    <div class="summary-price">
      from ${formatMoney(top.totalPrice, top.currency)}
      <span class="per-person">· ${formatMoney(top.pricePerPerson, top.currency)} / person</span>
    </div>
  </div>`;
}

function renderGroup(group: SplitGroup, index: number): string {
  return `
<section class="split ${index === 1 ? 'best' : ''}">
  <header class="split-header">
    <div>
      <div class="split-index">Shape ${index}</div>
      <h2>${escape(group.label)}</h2>
    </div>
    <div class="split-total">
      <div class="total-price">from ${formatMoney(group.alternatives[0]?.totalPrice ?? 0, group.alternatives[0]?.currency ?? 'EUR')}</div>
      <div class="total-per">${group.alternatives.length} alternatives</div>
    </div>
  </header>

  ${group.alternatives.map((opt, i) => renderAlternative(opt, i + 1)).join('\n')}
</section>`;
}

function renderAlternative(option: SplitOption, rank: number): string {
  return `
<div class="alt">
  <div class="alt-head">
    <div class="alt-rank">Alt ${rank}</div>
    <div class="alt-meta">
      ${option.sources.map((s) => `<span class="chip chip-${s}">${s}</span>`).join(' ')}
      ${option.averageRating != null ? `<span class="chip">★ ${option.averageRating}</span>` : ''}
    </div>
    <div class="alt-price">
      ${formatMoney(option.totalPrice, option.currency)}
      <span class="alt-per">${formatMoney(option.pricePerPerson, option.currency)} / person</span>
    </div>
  </div>
  <div class="picks">
    ${option.picks.map(renderPick).join('\n')}
  </div>
</div>`;
}

function renderPick(pick: { unitSize: number; listing: import('../../shared/types.js').Listing }): string {
  const l = pick.listing;
  const firstImg = l.images[0];
  return `
  <article class="pick">
    ${firstImg ? `<div class="pick-img" style="background-image:url('${escape(firstImg)}')"></div>` : '<div class="pick-img placeholder"></div>'}
    <div class="pick-body">
      <div class="pick-source">${l.source} · ${pick.unitSize} guests</div>
      <a class="pick-title" href="${escape(l.url)}" target="_blank" rel="noopener">${escape(l.title)}</a>
      ${l.location ? `<div class="pick-loc">${escape(l.location)}</div>` : ''}
      <div class="pick-meta">
        ${l.rating != null ? `<span>★ ${l.rating}${l.reviewsCount ? ` (${l.reviewsCount})` : ''}</span>` : ''}
        ${l.bedrooms ? `<span>${l.bedrooms} bedrooms</span>` : ''}
        ${l.beds ? `<span>${l.beds} beds</span>` : ''}
      </div>
      <div class="pick-price">
        ${l.priceTotal != null ? formatMoney(l.priceTotal, l.currency) : '—'}
        ${l.pricePerNight != null ? `<span class="night">· ${formatMoney(l.pricePerNight, l.currency)}/night</span>` : ''}
      </div>
    </div>
  </article>`;
}

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'EUR',
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${Math.round(amount)} ${currency}`;
  }
}

function escape(s: string): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c] as string));
}

function baseCss(): string {
  return `
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #0f172a; margin: 0; background: #f8fafc; }
  .cover { padding: 48px 48px 32px; background: linear-gradient(135deg, #0f172a, #1e3a8a); color: white; }
  .cover h1 { margin: 0; font-size: 44px; font-weight: 700; letter-spacing: -0.02em; }
  .subtitle { margin: 8px 0 32px; font-size: 18px; opacity: 0.85; }
  .summary { background: rgba(255,255,255,0.12); padding: 24px; border-radius: 16px; backdrop-filter: blur(8px); max-width: 560px; }
  .summary-label { font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; opacity: 0.7; }
  .summary-value { font-size: 28px; font-weight: 600; margin: 6px 0 10px; }
  .summary-price { font-size: 22px; }
  .per-person { font-size: 16px; opacity: 0.8; }
  .split { background: white; margin: 24px 48px; border-radius: 16px; padding: 28px; box-shadow: 0 1px 2px rgba(0,0,0,0.04); page-break-inside: avoid; }
  .split.best { border: 2px solid #1e3a8a; }
  .split-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; gap: 16px; }
  .split-index { font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: #64748b; }
  .split h2 { margin: 4px 0 10px; font-size: 24px; }
  .alt { border-top: 1px dashed #e2e8f0; padding: 16px 0; }
  .alt-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; flex-wrap: wrap; }
  .alt-rank { font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: #64748b; }
  .alt-meta { display: flex; gap: 6px; flex-wrap: wrap; flex: 1; }
  .alt-price { font-size: 18px; font-weight: 600; text-align: right; }
  .alt-per { display: block; font-size: 12px; color: #64748b; font-weight: 400; }
  .split-meta { display: flex; gap: 8px; flex-wrap: wrap; }
  .chip { display: inline-block; padding: 3px 10px; font-size: 11px; border-radius: 999px; background: #e2e8f0; color: #334155; }
  .chip-booking { background: #dbeafe; color: #1e40af; }
  .chip-airbnb { background: #fee2e2; color: #b91c1c; }
  .split-total { text-align: right; white-space: nowrap; }
  .total-price { font-size: 28px; font-weight: 700; }
  .total-per { font-size: 13px; color: #64748b; }
  .picks { display: grid; gap: 16px; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); }
  .pick { border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; display: flex; flex-direction: column; }
  .pick-img { height: 140px; background-size: cover; background-position: center; background-color: #e2e8f0; }
  .pick-img.placeholder { background: linear-gradient(135deg, #e2e8f0, #cbd5e1); }
  .pick-body { padding: 12px 14px 14px; display: flex; flex-direction: column; gap: 4px; }
  .pick-source { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; }
  .pick-title { font-size: 14px; font-weight: 600; color: #0f172a; text-decoration: none; line-height: 1.3; }
  .pick-title:hover { text-decoration: underline; }
  .pick-loc { font-size: 12px; color: #64748b; }
  .pick-meta { display: flex; gap: 10px; font-size: 12px; color: #475569; flex-wrap: wrap; }
  .pick-price { margin-top: auto; font-size: 16px; font-weight: 600; }
  .pick-price .night { font-size: 12px; font-weight: 400; color: #64748b; }
  footer { padding: 16px 48px 48px; text-align: center; color: #94a3b8; font-size: 12px; }
  @media print {
    body { background: white; }
    .split { box-shadow: none; border: 1px solid #e2e8f0; margin: 16px 24px; }
    .cover { padding: 32px; }
  }
  `;
}
